# pi-model-proxy

[![CI](https://github.com/BlackBeltTechnology/pi-model-proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/BlackBeltTechnology/pi-model-proxy/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@blackbelt-technology/pi-model-proxy)](https://www.npmjs.com/package/@blackbelt-technology/pi-model-proxy)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

A [pi](https://github.com/badlogic/pi-mono) extension that exposes pi's authenticated models as a local OpenAI-compatible and Anthropic-compatible API server. External services (Honcho, LangChain, custom apps) can call `http://localhost:9876/v1/chat/completions` or `/v1/messages` to use any model pi has access to — including OAuth-authenticated subscriptions.

Inspired by [9router](https://github.com/decolua/9router) — a full-featured LLM proxy with provider pools, round-robin routing, tunnels, and usage tracking. pi-model-proxy takes a different approach: instead of managing provider credentials and routing itself, it leverages pi's built-in model registry and OAuth authentication, giving you a lightweight zero-config local proxy.

## How it works

```
┌─────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│  External App   │────▶│  pi-model-proxy   │────▶│  AI Provider     │
│  (Honcho, etc.) │     │  localhost:9876      │     │  (Anthropic,     │
│                 │◀────│                      │◀────│   OpenAI, etc.)  │
│  OpenAI format  │     │  pi-ai stream fns   │     │                  │
│  Anthropic fmt  │     │                      │     │                  │
└─────────────────┘     └─────────────────────┘     └──────────────────┘
```

1. Extension starts a local HTTP server inside pi
2. External services send OpenAI-format or Anthropic-format requests
3. The proxy resolves the model + API key from pi's model registry (including OAuth tokens)
4. pi-ai's built-in streaming functions handle the actual provider call
5. Response is translated back to the caller's format

## Installation

Install as a [pi package](https://www.npmjs.com/package/@mariozechner/pi-coding-agent#pi-packages) — this is the recommended way:

```bash
# From npm (recommended)
pi install npm:@blackbelt-technology/pi-model-proxy

# Or from GitHub
pi install https://github.com/BlackBeltTechnology/pi-model-proxy
```

Then start pi as usual — the extension loads automatically:

```bash
pi
```

That's it — **zero configuration required**. The proxy auto-discovers all models from pi's registry (providers, OAuth logins, custom models). No config file needed.

> **Tip:** Use `pi list` to verify the package is installed, and `pi config` to enable/disable it.

### Test it

```bash
# List available models
curl http://localhost:9876/v1/models

# OpenAI-compatible chat completion
curl http://localhost:9876/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-sonnet-4-5-20250929",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'

# Anthropic-compatible messages
curl http://localhost:9876/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-sonnet-4-5-20250929",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 1024
  }'

# Use model aliases (if configured)
curl http://localhost:9876/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonnet",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### 3. Point your service to it

```bash
# Honcho or any OpenAI-compatible client
export OPENAI_BASE_URL=http://localhost:9876/v1
export OPENAI_API_KEY=your-proxy-key  # if configured
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/models` | List all available pi models |
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat completions |
| `POST` | `/v1/messages` | Anthropic Messages API compatible |
| `GET` | `/health` | Health check |

### Model naming

Models use `provider/model-id` format matching pi's internal naming:

- `anthropic/claude-sonnet-4-5-20250929`
- `openai/gpt-5.1-2025-11-13`
- `google/gemini-2.5-pro-preview-06-05`
- Custom models from `~/.pi/agent/models.json`

You can also configure short **aliases** (see Configuration below):
- `sonnet` → `anthropic/claude-sonnet-4-5-20250929`
- `gpt4` → `openai/gpt-4o`

Use `GET /v1/models` to see all available models with their exact IDs.

### Supported features

- ✅ Streaming (`stream: true`) and non-streaming responses
- ✅ System messages
- ✅ Multi-modal (text + images via base64 data URIs)
- ✅ Tool calls / function calling (with correct multi-tool indices)
- ✅ Tool results
- ✅ Thinking/reasoning (mapped to `reasoning_content` in OpenAI SSE, `thinking_delta` in Anthropic SSE)
- ✅ Token usage reporting
- ✅ CORS headers
- ✅ Model aliasing
- ✅ Rate limiting
- ✅ Request logging (JSON Lines)
- ✅ Request timeout + client disconnect → AbortSignal propagation
- ✅ Graceful startup (503 before model registry available)

## Configuration (optional)

The proxy works out of the box with no config. All models are auto-discovered from pi's model registry. An optional config file at `~/.pi/model-proxy.json` enables additional features:

```json
{
  "port": 9876,
  "defaultModel": "anthropic/claude-sonnet-4-5-20250929",
  "apiKey": "my-secret-key",
  "allowedOrigins": ["*"],
  "aliases": {
    "sonnet": "anthropic/claude-sonnet-4-5-20250929",
    "gpt4": "openai/gpt-4o"
  },
  "rateLimit": 60,
  "requestTimeoutMs": 120000,
  "logPath": "~/.pi/model-proxy-log.jsonl"
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `port` | `9876` | Port for the local API server |
| `defaultModel` | — | Default model when request omits `model` field |
| `apiKey` | — | Optional API key to protect the proxy (sent as `Bearer` token or `x-api-key` header) |
| `allowedOrigins` | `["*"]` | CORS allowed origins |
| `aliases` | — | Short model names → full `provider/model-id` strings |
| `rateLimit` | — | Per-minute request cap (0 or omitted = disabled) |
| `requestTimeoutMs` | `120000` | Request timeout in milliseconds |
| `logPath` | `~/.pi/model-proxy-log.jsonl` | Path to JSON Lines log file |

## Development

For contributing or running from source:

```bash
git clone https://github.com/BlackBeltTechnology/pi-model-proxy.git
cd pi-model-proxy
npm install
npm test              # Run unit + integration tests (~500ms)
npm run typecheck     # TypeScript type checking
./test/e2e.sh         # Run E2E tests against real pi instance (~30s)
./test/e2e.sh 9876 --no-start  # E2E against already-running pi
```

To load the extension from source during development:

```bash
pi -e /path/to/pi-model-proxy
```

### Test layers

| Layer | What it tests |
|-------|---------------|
| **Unit** (`npm test`) | Message conversion, config loading, rate limiter, logging |
| **Integration** (`npm test`) | Full HTTP request→response pipeline with mocked provider |
| **E2E** (`./test/e2e.sh`) | Real pi instance, real API calls, all endpoints (20 assertions) |

## Releasing

Releases are automated via GitHub Actions. To publish a new version:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This triggers the release workflow which:
1. Extracts the version from the git tag
2. Runs typecheck and tests
3. Publishes to npm as `@blackbelt-technology/pi-model-proxy`
4. Creates a GitHub Release with auto-generated release notes

### Version convention

Use [semantic versioning](https://semver.org/):
- `v1.0.0` → `v1.0.1` — bug fixes
- `v1.0.0` → `v1.1.0` — new features (backward compatible)
- `v1.0.0` → `v2.0.0` — breaking changes

> **Note:** The version in `package.json` is set automatically by CI from the git tag. You don't need to update it manually.

## Commands

| Command | Description |
|---------|-------------|
| `/proxy-status` | Show proxy server status and model count |

## Use Cases

### Honcho memory service

Point Honcho's LLM config to your local proxy:

```python
import openai

client = openai.OpenAI(
    base_url="http://localhost:9876/v1",
    api_key="your-proxy-key",
)

response = client.chat.completions.create(
    model="sonnet",  # uses alias
    messages=[{"role": "user", "content": "Hello"}],
)
```

### Anthropic SDK

```python
import anthropic

client = anthropic.Anthropic(
    base_url="http://localhost:9876/v1",
    api_key="your-proxy-key",
)

message = client.messages.create(
    model="sonnet",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello!"}],
)
```

### LangChain / LangGraph

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    base_url="http://localhost:9876/v1",
    api_key="your-proxy-key",
    model="sonnet",
)
```

### Any OpenAI-compatible SDK

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:9876/v1",
  apiKey: "your-proxy-key",
});

const completion = await client.chat.completions.create({
  model: "anthropic/claude-sonnet-4-5-20250929",
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Use pi's OAuth subscriptions

If you're logged into Claude Pro/Max via `/login anthropic` in pi, the proxy automatically uses those OAuth tokens. External services get access to your subscription without needing API keys.

## Security

- **Local only by default** — The server binds to `localhost`
- **Optional API key** — Set `apiKey` in config to require authentication
- **No credential exposure** — API keys and OAuth tokens stay in pi's auth storage
- **CORS configurable** — Restrict origins for browser-based clients
- **Rate limiting** — Prevent runaway external services from burning API quota

## Architecture

The extension uses a modular `src/` structure:

- `src/extension.ts` — Pi extension lifecycle (session_start, session_shutdown)
- `src/server.ts` — HTTP server with middleware pipeline (CORS → auth → rate limit → routing → logging)
- `src/routes/` — Request handlers for each endpoint
- `src/convert/` — Bidirectional format conversion (OpenAI ↔ pi-ai ↔ Anthropic)
- `src/config.ts` — Configuration loading and model alias resolution
- `src/rate-limiter.ts` — Sliding window rate limiter
- `src/logging.ts` — JSON Lines request logging

For each incoming request:
1. Resolves the model from pi's `ModelRegistry` (with alias support)
2. Resolves API key/headers via `ModelRegistry.getApiKeyAndHeaders()`
3. Calls `streamSimple()` from pi-ai with the resolved credentials and an AbortSignal
4. Converts pi-ai's event stream back to the client's format

No custom translation code is needed — pi-ai handles all provider-specific format conversion internally.

## Inspiration

This project is inspired by [9router](https://github.com/decolua/9router), a standalone LLM proxy service. While 9router is a full-featured production proxy, pi-model-proxy is designed as a lightweight pi extension that reuses pi's existing infrastructure:

| | [9router](https://github.com/decolua/9router) | pi-model-proxy |
|---|---------|------------------|
| **Type** | Standalone Docker service (Next.js) | Pi extension (Node.js, no framework) |
| **Setup** | Docker compose, provider config, API keys | `pi -e .` — zero config |
| **Auth** | Own API key management + provider keys | Pi's ModelRegistry + OAuth tokens |
| **Models** | Manual provider connections + pools | Auto-discovered from pi registry |
| **Routing** | Round-robin, sticky sessions, strategies | Direct pass-through via pi-ai |
| **Features** | Tunnels, MITM, pricing, usage dashboard | Lightweight local proxy |
| **Format translation** | Custom ~50 file translator layer | Handled by pi-ai's `streamSimple()` |
| **Deployment** | Traefik, Cloudflare tunnels, multi-user | Single-user, localhost |

9router is the right choice when you need a shared, multi-user LLM gateway with provider pooling and usage tracking. pi-model-proxy is for when you want to quickly expose your pi models to local tools and services with no setup.

## License

MIT
