#!/bin/bash
#
# End-to-end test: starts a real pi instance with the proxy extension,
# waits for the server to be ready, runs curl tests, then kills pi.
#
# Usage:
#   ./test/e2e.sh [port]
#
# Prerequisites:
#   - pi is installed and configured with at least one model
#   - A model provider is authenticated (e.g., `pi /login anthropic`)
#
set -euo pipefail

PORT="${1:-9876}"
BASE="http://localhost:$PORT"
PASS=0
FAIL=0
PI_PID=""
SLEEP_PID=""
FIFO=""

cleanup() {
  if [ -n "$SLEEP_PID" ]; then kill "$SLEEP_PID" 2>/dev/null; fi || true
  if [ -n "$PI_PID" ]; then
    echo ""
    echo "Stopping pi (PID $PI_PID)..."
    kill "$PI_PID" 2>/dev/null || true
    wait "$PI_PID" 2>/dev/null || true
  fi
  if [ -n "$FIFO" ]; then rm -f "$FIFO"; fi || true
  return 0
}
trap cleanup EXIT

# --- Start pi with the extension ---
echo "Starting pi with proxy extension on port $PORT..."
echo ""
echo "Two ways to run this:"
echo "  1. Automatic: This script starts pi in the background"
echo "  2. Manual:   Start 'pi -e .' in another terminal, then run this script with --no-start"
echo ""

if [ "${2:-}" = "--no-start" ]; then
  echo "Assuming pi is already running with the extension..."
else
  # Start pi in print mode with a long prompt to keep it alive.
  # The extension starts the HTTP server, session_start fires (model registry available),
  # and pi stays alive while processing the prompt.
  # We use a prompt that asks for a very long response to buy time for tests.
  pi -e . --no-extensions --no-session -p \
    "Write a 2000-word essay about the history of mathematics, from ancient Babylon through modern times. Include many details about each era. Take your time and be thorough." \
    --mode text > /tmp/pi-proxy-e2e.log 2>&1 &
  PI_PID=$!
fi

# Wait for the HTTP server to be ready (up to 30s)
echo -n "Waiting for server"
for i in $(seq 1 60); do
  if curl -s "$BASE/health" > /dev/null 2>&1; then
    echo " ready!"
    break
  fi
  echo -n "."
  sleep 0.5
done

if ! curl -s "$BASE/health" > /dev/null 2>&1; then
  echo " TIMEOUT - server didn't start"
  [ -f /tmp/pi-proxy-e2e.log ] && echo "Pi log:" && tail -20 /tmp/pi-proxy-e2e.log
  exit 1
fi

# Wait a moment for session_start (model registry)
echo -n "Waiting for model registry"
for i in $(seq 1 30); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/v1/models")
  if [ "$STATUS" = "200" ]; then
    echo " ready!"
    break
  fi
  echo -n "."
  sleep 1
done

# --- Test helpers ---
assert_status() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✅ $desc (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $desc (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local desc="$1" body="$2" pattern="$3"
  if echo "$body" | grep -q "$pattern"; then
    echo "  ✅ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $desc (pattern '$pattern' not found)"
    echo "     Body: ${body:0:200}"
    FAIL=$((FAIL + 1))
  fi
}

# --- Tests ---
echo ""
echo "=== Health Check ==="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/health")
assert_status "GET /health" "200" "$STATUS"

echo ""
echo "=== List Models ==="
RESP=$(curl -s -w "\n%{http_code}" "$BASE/v1/models")
STATUS=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
assert_status "GET /v1/models" "200" "$STATUS"
assert_contains "Response has model list" "$BODY" '"object":"list"'
assert_contains "Response has model data" "$BODY" '"data":'

# Pick a model — prefer sonnet/haiku current, fall back to first available
MODEL=$(echo "$BODY" | python3 -c "
import sys, json
data = json.load(sys.stdin)['data']
prefer = ['claude-sonnet-4', 'claude-haiku', 'gpt-4o-mini', 'gemini-2.0-flash']
for p in prefer:
    for m in data:
        if p in m['id']:
            print(m['id']); sys.exit(0)
if data: print(data[0]['id'])
" 2>/dev/null || echo "")
if [ -z "$MODEL" ]; then
  echo "  ⚠️  No models available, skipping completion tests"
else
  echo "  Using model: $MODEL"

  echo ""
  echo "=== OpenAI Chat Completion (non-streaming) ==="
  RESP=$(curl -s -w "\n%{http_code}" "$BASE/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Say just the word 'pong'. Nothing else.\"}],\"stream\":false,\"max_tokens\":10}")
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  assert_status "POST /v1/chat/completions (non-streaming)" "200" "$STATUS"
  assert_contains "Has choices" "$BODY" '"choices"'
  assert_contains "Has usage" "$BODY" '"usage"'

  echo ""
  echo "=== OpenAI Chat Completion (streaming) ==="
  RESP=$(curl -s -w "\n%{http_code}" "$BASE/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Say just the word 'pong'. Nothing else.\"}],\"stream\":true,\"max_tokens\":10}")
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  assert_status "POST /v1/chat/completions (streaming)" "200" "$STATUS"
  assert_contains "SSE has data prefix" "$BODY" "data: "
  assert_contains "SSE has [DONE]" "$BODY" "[DONE]"

  echo ""
  echo "=== Anthropic Messages (non-streaming) ==="
  RESP=$(curl -s -w "\n%{http_code}" "$BASE/v1/messages" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Say just the word 'pong'. Nothing else.\"}],\"max_tokens\":10}")
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  assert_status "POST /v1/messages (non-streaming)" "200" "$STATUS"
  assert_contains "Has content blocks" "$BODY" '"content"'
  assert_contains "Has stop_reason" "$BODY" '"stop_reason"'

  echo ""
  echo "=== Anthropic Messages (streaming) ==="
  RESP=$(curl -s -w "\n%{http_code}" "$BASE/v1/messages" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Say just the word 'pong'. Nothing else.\"}],\"max_tokens\":10,\"stream\":true}")
  STATUS=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  assert_status "POST /v1/messages (streaming)" "200" "$STATUS"
  assert_contains "Has message_start event" "$BODY" "event: message_start"
  assert_contains "Has message_stop event" "$BODY" "event: message_stop"
fi

echo ""
echo "=== Error Cases ==="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/v1/unknown")
assert_status "GET /v1/unknown → 404" "404" "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/v1/chat/completions" \
  -H "Content-Type: application/json" -d '{"messages":[{"role":"user","content":"hi"}]}')
assert_status "Missing model → 400" "400" "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/v1/chat/completions" \
  -H "Content-Type: application/json" -d 'not json')
assert_status "Invalid JSON → 400" "400" "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/v1/chat/completions" \
  -H "Content-Type: application/json" -d '{"model":"fake/nonexistent","messages":[{"role":"user","content":"hi"}]}')
assert_status "Unknown model → 404" "404" "$STATUS"

# --- Summary ---
echo ""
echo "================================"
echo "  E2E Results: $PASS passed, $FAIL failed"
echo "================================"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
