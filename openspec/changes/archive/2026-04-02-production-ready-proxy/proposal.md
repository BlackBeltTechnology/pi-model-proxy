## Why

The current pi-model-proxy is a single-file prototype (~600 lines) that demonstrates the core concept — exposing pi's authenticated models as a local OpenAI-compatible API — but lacks the reliability, observability, and completeness needed for production use. External services like Honcho, LangChain, and custom agents need a stable proxy they can depend on: proper error handling, request timeouts, usage logging, model aliasing, an Anthropic Messages API endpoint, and a test suite to prevent regressions. Without these, the proxy is fragile and difficult to integrate with real services.

## What Changes

- **Split single-file into modular architecture**: Separate HTTP server, message conversion, SSE translation, config, and extension lifecycle into distinct modules
- **Add test suite**: Unit tests for message conversion (OpenAI↔pi-ai), SSE chunk generation, config loading, model resolution, and HTTP request handling
- **Add Anthropic Messages API endpoint**: `POST /v1/messages` for clients that speak Anthropic format natively (Honcho uses this)
- **Add request timeout and client disconnect handling**: Propagate `AbortSignal` from client disconnect to cancel upstream provider calls
- **Add request logging and usage tracking**: Log requests with model, latency, token counts, and status to a JSON file for observability
- **Add model aliasing**: Allow short aliases (e.g., `sonnet` → `anthropic/claude-sonnet-4-5-20250929`) in config
- **Add rate limiting**: Configurable per-minute request cap to prevent runaway external services from burning API quota
- **Fix tool call index tracking**: Track multiple concurrent tool calls with proper indices instead of hardcoded index 0
- **Add graceful startup**: Queue requests until `session_start` fires (model registry available) instead of returning 503
- **Add `/v1/embeddings` endpoint**: Pass-through to pi's embedding models for services that need vector search

## Capabilities

### New Capabilities
- `http-server`: Local HTTP server lifecycle, routing, CORS, auth middleware, graceful startup/shutdown
- `message-conversion`: Bidirectional translation between OpenAI Chat Completions format and pi-ai Context/events, including tool calls, images, thinking blocks
- `anthropic-api`: Anthropic Messages API endpoint (`POST /v1/messages`) — accepts Claude-format requests, translates to pi-ai, returns Claude-format responses
- `request-logging`: Per-request logging with model, latency, tokens, status to `~/.pi/model-proxy-log.json`
- `model-aliasing`: Short model aliases configurable in `~/.pi/model-proxy.json` (e.g., `sonnet` → `anthropic/claude-sonnet-4-5-20250929`)
- `rate-limiting`: Configurable per-minute request cap with 429 responses and Retry-After headers
- `client-lifecycle`: Request timeout, client disconnect detection, AbortSignal propagation to upstream provider calls

### Modified Capabilities
<!-- None — this is a greenfield project, no existing specs -->

## Impact

- **Code**: Refactor `index.ts` monolith into `src/` modules: `server.ts`, `routes/completions.ts`, `routes/messages.ts`, `routes/models.ts`, `convert/openai-to-piai.ts`, `convert/piai-to-openai.ts`, `convert/anthropic-to-piai.ts`, `convert/piai-to-anthropic.ts`, `config.ts`, `logging.ts`, `rate-limiter.ts`, `extension.ts`
- **Tests**: New `test/` directory with vitest tests for each module
- **Config**: Extended `~/.pi/model-proxy.json` schema with `aliases`, `rateLimit`, `requestTimeoutMs`, `logPath` fields
- **Dependencies**: Add `vitest` (dev), potentially `@sinclair/typebox` for config validation
- **API**: New `POST /v1/messages` endpoint; existing `POST /v1/chat/completions` and `GET /v1/models` unchanged but more robust
- **File structure**: Move from single `index.ts` to `src/` directory with `index.ts` as thin extension entry point
