<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# pi-model-proxy

## Project Overview

A pi extension that exposes pi's authenticated models as a local OpenAI-compatible API server. External services (Honcho, LangChain, custom apps) call `http://localhost:PORT/v1/chat/completions` or `/v1/messages` to use any model pi has access to — including OAuth-authenticated subscriptions. Zero configuration required — models are auto-discovered from pi's registry.

## Architecture

```
External Client          pi-model-proxy (extension)          AI Provider
┌──────────┐     HTTP    ┌─────────────────────────┐     API   ┌──────────┐
│ Honcho   │────────────▶│ Node HTTP server (:9876) │──────────▶│Anthropic │
│ LangChain│◀────────────│                          │◀──────────│OpenAI    │
│ Custom   │  OpenAI SSE │ Converts OpenAI format   │  pi-ai   │Google    │
└──────────┘  Anthropic  │ or Anthropic format      │  stream  │etc.      │
              SSE        │ ↔ pi-ai event stream     │  fns     │          │
                         │                          │          └──────────┘
                         │ Uses pi's ModelRegistry  │
                         │ for auth resolution      │
                         └─────────────────────────┘
```

### Data Flow

1. Client sends OpenAI-format `POST /v1/chat/completions` or Anthropic-format `POST /v1/messages`
2. Extension resolves model (aliases → `provider/model-id`) via `ModelRegistry.find()`
3. Resolves API key/headers via `ModelRegistry.getApiKeyAndHeaders()` (includes OAuth tokens)
4. Converts client messages → pi-ai `Context` (system prompt, messages, tools)
5. Calls `streamSimple()` from `@mariozechner/pi-ai` — this handles all provider-specific format translation
6. Converts pi-ai `AssistantMessageEvent` stream → client format SSE chunks (or non-streaming JSON)

### Key Dependencies

- **`@mariozechner/pi-ai`** — `streamSimple()`, `Model`, `Context`, `AssistantMessageEvent` types
- **`@mariozechner/pi-coding-agent`** — `ExtensionAPI`, `ExtensionContext`, `ModelRegistry`
- **Node.js `http`** — lightweight HTTP server (no framework)
- **vitest** — test framework (dev dependency)

## Commands

```bash
# Install as pi package (recommended)
pi install npm:@blackbelt-technology/pi-model-proxy

# Development
npm install           # Install dependencies
npm test              # Run vitest test suite (unit + integration, ~500ms)
npm run typecheck     # TypeScript type checking
./test/e2e.sh         # Run E2E tests against a real pi instance (~30s, requires auth)
pi -e .               # Run pi with this extension loaded (dev mode)
```

### In-pi commands

| Command | Description |
|---------|-------------|
| `/proxy-status` | Show server URL, model count, auth status |

## Key Files

| File | Purpose |
|------|---------|
| `index.ts` | Thin re-export of `src/extension.ts` |
| `src/types.ts` | Shared type definitions (ProxyConfig, OpenAI types, Anthropic types, logging types) |
| `src/config.ts` | `loadConfig()`, `resolveModelAlias()` — config loading, validation, alias resolution |
| `src/server.ts` | HTTP server creation, middleware pipeline (CORS, auth, rate limit, routing), helpers |
| `src/extension.ts` | Extension lifecycle (session_start, session_shutdown, `/proxy-status` command) |
| `src/logging.ts` | `RequestLogger` — append JSON Lines per request to log file |
| `src/rate-limiter.ts` | `RateLimiter` — sliding window per-minute rate limiting |
| `src/convert/openai-to-piai.ts` | OpenAI messages → pi-ai Context conversion |
| `src/convert/piai-to-openai.ts` | pi-ai events → OpenAI SSE chunks / non-streaming response |
| `src/convert/anthropic-to-piai.ts` | Anthropic messages → pi-ai Context conversion |
| `src/convert/piai-to-anthropic.ts` | pi-ai events → Anthropic SSE / non-streaming response |
| `src/routes/completions.ts` | `POST /v1/chat/completions` handler |
| `src/routes/messages.ts` | `POST /v1/messages` handler (Anthropic format) |
| `src/routes/models.ts` | `GET /v1/models` handler |
| `test/*.test.ts` | vitest unit + integration tests (config, conversions, rate limiter, logging, server) |
| `test/integration.test.ts` | Full HTTP pipeline integration tests with mocked `streamSimple()` |
| `test/e2e.sh` | End-to-end bash test script — starts real pi instance, hits all endpoints |
| `package.json` | Dependencies on `@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, vitest (dev) |
| `~/.pi/model-proxy.json` | Optional user config (see Configuration section) |

## Configuration

The proxy works out of the box with no config — all models are auto-discovered from pi's `ModelRegistry`. An optional config file at `~/.pi/model-proxy.json` enables additional features:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | number | `9876` | Local server port |
| `defaultModel` | string | — | Default `provider/model-id` when request omits model |
| `apiKey` | string | — | Optional Bearer token to protect the endpoint |
| `allowedOrigins` | string[] | `["*"]` | CORS allowed origins |
| `aliases` | object | — | Model aliases: `{ "sonnet": "anthropic/claude-sonnet-4-5-20250929" }` |
| `rateLimit` | number | — | Per-minute request cap (0 or omitted = disabled) |
| `requestTimeoutMs` | number | `120000` | Request timeout in milliseconds |
| `logPath` | string | `~/.pi/model-proxy-log.jsonl` | Path to JSON Lines log file |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/models` | List available models (from pi's ModelRegistry) |
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat completions |
| `POST` | `/v1/messages` | Anthropic Messages API compatible endpoint |
| `GET` | `/health` | Health check |
| `OPTIONS` | `*` | CORS preflight |

## Model Naming Convention

Models are addressed as `provider/model-id`, matching pi's internal registry:
- `anthropic/claude-sonnet-4-5-20250929`
- `openai/gpt-5.1-2025-11-13`
- `google/gemini-2.5-pro-preview-06-05`
- Custom models from `~/.pi/agent/models.json`
- Aliases from config (e.g., `sonnet` → `anthropic/claude-sonnet-4-5-20250929`)

## Testing

| Layer | Command | What it tests | Speed |
|-------|---------|---------------|-------|
| **Unit** | `npm test` | Conversions, config, rate limiter, logging | ~500ms |
| **Integration** | `npm test` (included) | Full HTTP request→response with mocked provider | ~150ms |
| **E2E** | `./test/e2e.sh` | Real pi instance → real API calls (20 assertions) | ~30s |

Integration tests mock two things: `streamSimple()` from pi-ai (returns synthetic event streams) and the model registry (plain object with `find`/`getAvailable`/`getApiKeyAndHeaders`). E2E tests start a background pi process with `-p` to trigger `session_start`, then curl all endpoints.

E2E can also run against a manually-started pi: `./test/e2e.sh 9876 --no-start`

## Code Instructions

1. Read the codebase before making changes — never speculate about code you haven't opened.
2. Keep changes minimal and simple. Follow the modular architecture in `src/`.
3. Use TDD: write tests first, verify they fail, then implement.
4. Use DRY: extract shared logic into helpers.
5. Update this AGENTS.md and README.md when architecture or key files change.
6. The extension must compile cleanly with: `npx -p typescript tsc --noEmit --esModuleInterop --moduleResolution bundler --module esnext --target esnext --skipLibCheck index.ts`

## Current Limitations

- `temperature` passed through but `streamSimple()` may not support it on all provider options types
- No `/v1/embeddings` endpoint
- No persistent request history or analytics dashboard
- JSON Lines log file has no automatic rotation
