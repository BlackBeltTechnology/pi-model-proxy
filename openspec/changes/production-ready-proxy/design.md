## Context

The pi-model-proxy is currently a ~500-line single-file extension (`index.ts`) that exposes pi's authenticated models as a local OpenAI-compatible API. It works for basic chat completions but lacks error handling, observability, test coverage, and additional API formats needed for production use. External services like Honcho (which speaks Anthropic Messages API natively) and LangChain need a reliable, well-tested proxy.

Key constraints:
- Must remain a pi extension (loaded via `pi -e .`)
- Must use `@mariozechner/pi-ai`'s `streamSimple()` for all provider communication
- Must use `@mariozechner/pi-coding-agent`'s `ModelRegistry` for auth resolution
- Config lives at `~/.pi/model-proxy.json`
- Node.js HTTP server (no framework dependency)

## Goals / Non-Goals

**Goals:**
- Modular architecture with separate files for routing, conversion, config, and middleware
- Comprehensive test suite (vitest) covering message conversion, SSE generation, config, and HTTP handling
- Anthropic Messages API endpoint (`POST /v1/messages`) for Honcho and similar clients
- Request timeout + client disconnect → AbortSignal propagation
- Request logging with model, latency, tokens, status
- Model aliasing (short names → full `provider/model-id`)
- Rate limiting with 429 responses
- Fix multi-tool-call index tracking
- Graceful startup: queue/hold requests until model registry is available

**Non-Goals:**
- Embeddings endpoint (`/v1/embeddings`) — deferred to a future change, pi-ai embedding support is unclear
- Framework adoption (Express, Fastify, etc.) — keep using raw Node.js `http`
- Persistent request history or analytics dashboard
- WebSocket or gRPC transport
- Multi-user / multi-tenant auth (single shared API key is sufficient)

## Decisions

### 1. Module Structure: `src/` directory with focused modules

**Decision**: Split `index.ts` into `src/` modules, keep `index.ts` as a thin entry point that re-exports the extension.

```
index.ts                  → thin re-export of src/extension.ts
src/
  extension.ts            → extension lifecycle (session_start, session_shutdown, commands)
  server.ts               → HTTP server creation, middleware pipeline, routing
  config.ts               → loadConfig(), ProxyConfig type, config validation
  logging.ts              → request logger (JSON lines to file)
  rate-limiter.ts         → sliding window rate limiter
  routes/
    completions.ts        → POST /v1/chat/completions handler
    messages.ts           → POST /v1/messages handler (Anthropic format)
    models.ts             → GET /v1/models handler
  convert/
    openai-to-piai.ts     → OpenAI messages → pi-ai Context
    piai-to-openai.ts     → pi-ai events → OpenAI SSE/JSON
    anthropic-to-piai.ts  → Anthropic messages → pi-ai Context
    piai-to-anthropic.ts  → pi-ai events → Anthropic SSE/JSON
  types.ts                → shared type definitions
```

**Rationale**: The current monolith is hard to test and navigate. Separate modules enable targeted unit tests and clear responsibility boundaries. Keeping the modules small (~100-200 lines each) makes them easy to reason about.

**Alternative considered**: Keep single file but add sections — rejected because it doesn't improve testability.

### 2. Test Framework: vitest

**Decision**: Use vitest for unit and integration tests.

**Rationale**: vitest supports TypeScript natively, runs fast, and has good mocking support. The conversion modules are pure functions — ideal for unit testing. HTTP handlers can be tested with Node's built-in test utilities or by calling the handler functions directly.

### 3. Anthropic Messages API: Separate conversion layer

**Decision**: Implement Anthropic Messages API (`POST /v1/messages`) with its own converter pair (`anthropic-to-piai.ts`, `piai-to-anthropic.ts`), following the same pattern as the OpenAI path.

**Rationale**: Anthropic's message format is structurally different (content blocks, tool_use/tool_result blocks, stop_reason vs finish_reason). A dedicated converter keeps each path clean rather than adding conditionals to the OpenAI converters.

**Alternative considered**: Convert Anthropic → OpenAI → pi-ai (double hop) — rejected because it loses fidelity and adds complexity.

### 4. Request Timeout + Client Disconnect: AbortController

**Decision**: Create an `AbortController` per request. Wire it to: (a) a configurable timeout timer, (b) the `req.on('close')` event. Pass the signal to `streamSimple()` via options.

**Rationale**: Without abort propagation, a client disconnect leaves the upstream provider call running, wasting API quota. The `AbortSignal` pattern is native to Node.js and supported by fetch-based providers.

### 5. Rate Limiting: In-memory sliding window

**Decision**: Simple in-memory sliding window counter. Track request timestamps in an array, prune entries older than the window. If count exceeds limit, return 429 with `Retry-After` header.

**Rationale**: No persistence needed — rate limiting is a safety valve, not an accounting system. In-memory is sufficient for a single-process local proxy.

### 6. Model Aliasing: Config-driven lookup table

**Decision**: Add `aliases` field to config: `{ "sonnet": "anthropic/claude-sonnet-4-5-20250929", "gpt4": "openai/gpt-4o" }`. Resolution order: check aliases first, then treat as literal `provider/model-id`.

**Rationale**: Simplest approach — no glob patterns, no regex, just exact string lookup. Easy to understand and configure.

### 7. Request Logging: JSON Lines file

**Decision**: Append one JSON line per request to a configurable log file (default: `~/.pi/model-proxy-log.jsonl`). Each line includes: timestamp, model, method, path, status, latency_ms, input_tokens, output_tokens.

**Rationale**: JSON Lines is trivially parseable, appendable, and greppable. No rotation logic needed for v1 — users can truncate/rotate manually.

### 8. Graceful Startup: Ready flag with queued responses

**Decision**: Track a `ready` boolean. Before `session_start`, return 503 with `Retry-After: 1` header. Don't queue requests — let clients retry.

**Rationale**: Queuing adds complexity (timeouts, memory limits). Returning 503 with Retry-After is standard HTTP practice and lets clients decide their retry strategy.

## Risks / Trade-offs

- **[Risk] Module splitting increases file count** → Mitigation: Keep modules small and focused. The benefit of testability outweighs the navigation cost. Clear `AGENTS.md` documentation of module purposes.

- **[Risk] AbortSignal may not be supported by all pi-ai provider paths** → Mitigation: Pass signal as best-effort. If `streamSimple()` doesn't propagate it, the stream will complete naturally. No worse than current behavior.

- **[Risk] In-memory rate limiter resets on extension reload** → Mitigation: Acceptable for a local proxy. Rate limiting is a safety valve, not a billing system.

- **[Risk] Anthropic API format may drift from our implementation** → Mitigation: Test against concrete Anthropic SDK request/response fixtures. Document supported Anthropic API version.

- **[Trade-off] JSON Lines logging has no automatic rotation** → Acceptable for v1. Log file grows unbounded but users can truncate. Add rotation in a future change if needed.

- **[Trade-off] No embeddings endpoint** → Deferred. pi-ai's embedding support needs investigation first. Can be added as a separate change.
