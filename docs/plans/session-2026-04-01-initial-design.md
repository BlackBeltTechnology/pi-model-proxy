# Session Log: pi-model-proxy — Initial Design & Prototype

**Date:** 2026-04-01  
**Project:** `/Users/robson/Project/pi-model-proxy/`  
**Goal:** Integrate model-proxy concepts into pi.dev as a pi extension that exposes pi's authenticated models to external services.

---

## 1. Research Phase

### 1.1 Understanding model-proxy

Cloned and analyzed [github.com/decolua/model-proxy](https://github.com/decolua/model-proxy) — a local AI routing gateway:

- **What it is:** A Next.js app (port 20128) that presents an OpenAI-compatible API (`/v1/*`) and routes requests across 40+ AI providers with automatic format translation, fallback, and token refresh.
- **Architecture:** `open-sse/` core handles translation between formats (OpenAI ↔ Claude ↔ Gemini ↔ Cursor ↔ Kiro). Executors per provider. Hub-and-spoke translation: everything goes through OpenAI format as the intermediate.
- **Key files studied:**
  - `docs/ARCHITECTURE.md` — Full system design, data flow diagrams, request lifecycle
  - `open-sse/config/providers.js` — 40+ provider configs with baseUrls, formats, OAuth clientIds
  - `open-sse/config/providerModels.js` — Model catalogs per provider (OAuth aliases: cc, cx, gc, qw, if, ag, gh, kr, cu, kmc, kc, cl)
  - `open-sse/handlers/chatCore.js` — Core request orchestration: format detect → translate → execute → retry on 401 → stream response
  - `open-sse/translator/index.js` — Translation registry: source→OpenAI→target pipeline
  - `open-sse/translator/request/openai-to-claude.js` — OpenAI→Claude request conversion (messages, tools, system, cache_control)
  - `open-sse/translator/response/claude-to-openai.js` — Claude→OpenAI SSE chunk conversion
  - `open-sse/translator/request/claude-to-openai.js` — Claude→OpenAI request conversion
  - `open-sse/translator/response/openai-to-claude.js` — OpenAI→Claude response conversion

### 1.2 Understanding pi's Provider System

Studied pi's extension and custom provider APIs:

- **`~/.pi/agent/models.json`** — Static config for custom providers (baseUrl, apiKey, api type, models)
- **`pi.registerProvider()`** — Dynamic extension API for registering providers at runtime
- **`streamSimple()` / built-in stream functions** — pi-ai exports streaming implementations for all major APIs:
  - `streamSimpleAnthropic` (anthropic-messages)
  - `streamSimpleOpenAICompletions` (openai-completions)
  - `streamSimpleOpenAIResponses` (openai-responses)
  - `streamSimpleGoogle` (google-generative-ai)
  - `streamSimpleGoogleVertex` (google-vertex)
  - `streamSimpleMistral` (mistral-conversations)
  - `streamSimpleGoogleGeminiCli` (google-gemini-cli)
- **`ModelRegistry`** — Runtime model management with `find()`, `getAvailable()`, `getApiKeyAndHeaders()`, `hasConfiguredAuth()`
- **OAuth integration** — Pi stores OAuth tokens in `~/.pi/agent/auth.json`; extensions can register OAuth providers via `pi.registerProvider({ oauth: { ... } })`

**Key reference files studied:**
- `/docs/custom-provider.md` — Full guide for `pi.registerProvider()`
- `/docs/models.md` — `models.json` configuration reference
- `examples/extensions/custom-provider-anthropic/index.ts` — Full Anthropic OAuth + streaming example (~450 lines)
- `examples/extensions/custom-provider-gitlab-duo/index.ts` — GitLab Duo example delegating to `streamSimpleAnthropic` / `streamSimpleOpenAIResponses`
- `dist/core/extensions/types.d.ts` — Full `ExtensionAPI` interface (events, tools, commands, providers)
- `dist/core/model-registry.d.ts` — `ModelRegistry` class API

### 1.3 Understanding Honcho

Studied [Honcho](https://honcho.dev/) — an AI-native memory library for stateful agents:

- Provides persistent memory (peers, sessions, conclusions, representations) across agent conversations
- Has existing pi integration: [pi-honcho-memory](https://github.com/agneym/pi-honcho-memory) — syncs messages, injects context
- **Key insight:** Honcho itself needs to call LLMs internally (for reasoning, summarization, dialectic processing). The user wants pi's authenticated models to serve these LLM calls.
- Honcho documentation index: `https://docs.honcho.dev/llms.txt`

### 1.4 Pivots During Session

1. **First attempt (wrong direction):** Built a pi extension that registers model-proxy as a provider — pi calls OUT through model-proxy to external backends. Created config-driven route registration with `streamSimple` delegation. Compiled clean but was the wrong direction.

2. **Clarification:** User explained Honcho uses LLMs and they want pi's models to BE the proxied elements — i.e., expose pi's models as an API that external services call IN to.

3. **Correct direction:** Built a **reverse proxy** — a local HTTP server inside the pi extension that accepts OpenAI-format requests and forwards them through pi's model infrastructure.

---

## 2. Architecture Decisions

### 2.1 Why a Pi Extension (Not Standalone Server)

- **Access to ModelRegistry:** The extension gets `ctx.modelRegistry` on `session_start`, which provides `find()` and `getApiKeyAndHeaders()` — including OAuth token refresh
- **Access to pi's auth storage:** OAuth tokens from `/login anthropic` are automatically available
- **Lifecycle management:** Server starts/stops with the pi session
- **No duplicate auth:** External services don't need their own API keys; they use pi's

### 2.2 Why Node `http` (No Framework)

- pi extensions run inside pi's process — minimal dependencies matter
- Single endpoint pattern (`/v1/chat/completions`, `/v1/models`, `/health`) doesn't justify Express/Fastify
- Raw `http.createServer` is ~50 lines of routing code

### 2.3 Why `streamSimple()` (Not Direct Provider Calls)

- `streamSimple()` from `@mariozechner/pi-ai` handles ALL provider-specific format translation internally
- Supports every provider pi knows about (Anthropic, OpenAI, Google, Mistral, custom models.json providers)
- Handles API-specific quirks (thinking blocks, tool call formats, cache control, stop reasons)
- The extension only needs to convert OpenAI HTTP format ↔ pi-ai event stream — not deal with provider internals

### 2.4 Model Naming: `provider/model-id`

- Matches pi's internal `Model.provider` + `Model.id` structure
- Unambiguous — same model ID can exist on different providers
- `GET /v1/models` returns the full list with this naming

---

## 3. Prototype Implementation (v1)

### 3.1 File: `index.ts` (~605 lines)

Single-file extension with these sections:

| Section | Purpose |
|---------|---------|
| **Types** (lines ~50-90) | `ProxyConfig`, `OpenAIChatRequest`, `OpenAIMessage`, `OpenAITool` interfaces |
| **Config** (lines ~95-110) | `loadConfig()` — reads `~/.pi/model-proxy.json`, creates default on first run |
| **OpenAI→pi-ai** (lines ~115-200) | `convertMessages()` — system msgs → `systemPrompt`, user/assistant/tool msgs → pi-ai `Message[]`, images → `ImageContent`, tool_calls → `ToolCall` |
| **pi-ai→OpenAI** (lines ~205-300) | `eventToSSEChunks()` — maps pi-ai events to OpenAI SSE `data:` lines. `eventToNonStreamingResponse()` — builds complete JSON response. Handles text, thinking (→ `reasoning_content`), tool calls, usage, stop reasons |
| **HTTP Server** (lines ~305-460) | `createProxyServer()` — CORS, Bearer auth, model resolution, streaming/non-streaming response, error handling |
| **Extension** (lines ~465-end) | Default export: starts server, hooks `session_start` (capture modelRegistry), `session_shutdown` (close server), `/proxy-status` command |

### 3.2 Message Conversion Details

**OpenAI → pi-ai:**
- `system` messages → concatenated `systemPrompt` string
- `user` messages → `UserMessage` with string or `(TextContent | ImageContent)[]`
- `assistant` messages → `AssistantMessage` with `TextContent[]` + `ToolCall[]`
- `tool` messages → `ToolResultMessage` with `toolCallId`, `toolName`, text content
- `image_url` with `data:` URI → `ImageContent` with extracted `mimeType` + `data`

**pi-ai → OpenAI SSE:**
- `start` → `{ role: "assistant" }` delta
- `text_delta` → `{ content: delta }` delta
- `thinking_delta` → `{ reasoning_content: delta }` delta
- `toolcall_start` → `{ tool_calls: [{ index, id, type, function: { name, arguments: "" } }] }`
- `toolcall_delta` → `{ tool_calls: [{ index, function: { arguments: delta } }] }`
- `done` → final chunk with `finish_reason` + `usage` + `data: [DONE]`
- `error` → stop chunk + `data: [DONE]`

### 3.3 API Endpoints

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/v1/models` | JSON list of `{ id: "provider/model-id", owned_by: provider }` |
| `POST` | `/v1/chat/completions` | OpenAI-compatible streaming SSE or JSON |
| `GET` | `/health` | `{ status: "ok" }` |
| `OPTIONS` | `*` | CORS preflight (204) |

### 3.4 Configuration

File: `~/.pi/model-proxy.json` (auto-created on first run)

```json
{
  "port": 9876,
  "defaultModel": "anthropic/claude-sonnet-4-5-20250929",
  "apiKey": "my-secret-key",
  "allowedOrigins": ["*"]
}
```

### 3.5 Known Limitations

- **No test suite** — prototype only
- **No Anthropic Messages API** — only OpenAI chat/completions format
- **No request logging** — no observability
- **No rate limiting** — external services could burn API quota
- **No model aliasing** — must use exact `provider/model-id`
- **Tool call index hardcoded to 0** — doesn't track multiple concurrent tool calls
- **No request timeout** — no AbortSignal propagation from client disconnect
- **Startup race** — server starts immediately but modelRegistry only available after `session_start`
- **No embeddings endpoint** — only chat completions

---

## 4. Project Setup

### 4.1 Repository Structure

```
pi-model-proxy/
├── .git/
├── .gitignore
├── .pi/
│   ├── prompts/          # 10 OpenSpec slash commands (opsx:new, etc.)
│   └── skills/           # 10 OpenSpec skills
├── openspec/
│   ├── changes/
│   │   └── production-ready-proxy/
│   │       ├── .openspec.yaml
│   │       └── proposal.md    ← completed
│   └── specs/                 ← empty (to be populated)
├── docs/
│   └── plans/
│       └── session-2026-04-01-initial-design.md  ← this file
├── AGENTS.md                  # AI agent instructions
├── README.md                  # End-user documentation
├── index.ts                   # Extension source (v1 prototype)
├── package.json
└── package-lock.json
```

### 4.2 Dependencies

```json
{
  "@mariozechner/pi-ai": "*",
  "@mariozechner/pi-coding-agent": "*"
}
```

### 4.3 Type-Check Command

```bash
npx -p typescript tsc --noEmit --esModuleInterop --moduleResolution bundler --module esnext --target esnext --skipLibCheck index.ts
```

---

## 5. OpenSpec Change: `production-ready-proxy`

### 5.1 Status

```
Schema: spec-driven
Progress: 1/4 artifacts

[x] proposal
[ ] design        ← unblocked, next
[ ] specs         ← unblocked, next
[-] tasks         ← blocked by design + specs
```

### 5.2 Proposal Summary

**Why:** The v1 prototype demonstrates the concept but lacks reliability, observability, and completeness for production use.

**7 New Capabilities:**

| Capability | Description |
|-----------|-------------|
| `http-server` | Server lifecycle, routing, CORS, auth middleware, graceful startup/shutdown |
| `message-conversion` | Bidirectional OpenAI ↔ pi-ai translation (tools, images, thinking) |
| `anthropic-api` | `POST /v1/messages` — Anthropic Messages format for native Claude clients |
| `request-logging` | Per-request logging: model, latency, tokens, status to JSON |
| `model-aliasing` | Short aliases (`sonnet` → full model ID) in config |
| `rate-limiting` | Configurable per-minute cap with 429 + Retry-After |
| `client-lifecycle` | Request timeout, disconnect detection, AbortSignal propagation |

**Impact:**
- Refactor `index.ts` monolith → `src/` modules
- Add `test/` directory with vitest
- Extended config schema (aliases, rateLimit, requestTimeoutMs, logPath)
- New `POST /v1/messages` endpoint

### 5.3 Target File Structure (Post-Implementation)

```
pi-model-proxy/
├── src/
│   ├── extension.ts              # Thin entry point
│   ├── server.ts                 # HTTP server lifecycle
│   ├── config.ts                 # Config loading + validation
│   ├── logging.ts                # Request logger
│   ├── rate-limiter.ts           # Token bucket rate limiter
│   ├── routes/
│   │   ├── completions.ts        # POST /v1/chat/completions
│   │   ├── messages.ts           # POST /v1/messages (Anthropic)
│   │   └── models.ts             # GET /v1/models
│   └── convert/
│       ├── openai-to-piai.ts     # OpenAI messages → pi-ai Context
│       ├── piai-to-openai.ts     # pi-ai events → OpenAI SSE/JSON
│       ├── anthropic-to-piai.ts  # Anthropic messages → pi-ai Context
│       └── piai-to-anthropic.ts  # pi-ai events → Anthropic SSE/JSON
├── test/
│   ├── convert/
│   │   ├── openai-to-piai.test.ts
│   │   ├── piai-to-openai.test.ts
│   │   ├── anthropic-to-piai.test.ts
│   │   └── piai-to-anthropic.test.ts
│   ├── config.test.ts
│   ├── rate-limiter.test.ts
│   └── server.test.ts
├── index.ts                      # Re-export from src/extension.ts
├── AGENTS.md
├── README.md
└── package.json
```

---

## 6. Key Discoveries and Insights

### 6.1 pi-ai's `streamSimple()` Is the Key Abstraction

The single most important discovery: pi-ai exports a universal `streamSimple(model, context, options)` function that handles ALL provider-specific format translation internally. The proxy extension does NOT need to implement OpenAI↔Anthropic translation at the provider level — it only converts between HTTP wire format (OpenAI JSON/SSE) and pi-ai's `Context`/`AssistantMessageEvent` types.

This means:
- Any model pi can use (built-in, custom, OAuth) automatically works through the proxy
- New providers added to pi are instantly available
- No maintenance burden tracking provider API changes

### 6.2 ModelRegistry.getApiKeyAndHeaders() Includes OAuth

The `getApiKeyAndHeaders()` method on pi's `ModelRegistry` resolves not just env-var API keys but also OAuth tokens from `/login`. This means if a user logs into Claude Pro via `/login anthropic`, the proxy automatically picks up those OAuth tokens — external services get subscription access without any additional configuration.

### 6.3 GitLab Duo Extension as Reference Pattern

The `custom-provider-gitlab-duo` example was the most instructive reference. It demonstrates:
- Delegating to `streamSimpleAnthropic` / `streamSimpleOpenAIResponses` based on backend type
- Custom auth header injection via `options.headers`
- Model definition with per-model `baseUrl` overrides
- OAuth flow with PKCE + token refresh

Our extension uses the same delegation pattern but in reverse (accepting requests instead of making them).

### 6.4 model-proxy's Translation Layer Is Not Needed

Initially considered extracting model-proxy's `open-sse/translator/` code (~50 files). This is unnecessary because:
1. pi-ai already has all the provider-specific streaming implementations
2. The proxy only needs to convert between OpenAI HTTP wire format and pi-ai's universal event stream
3. model-proxy's translation exists because it doesn't have pi-ai — it needs to convert between formats itself

---

## 7. Integration Points for External Services

### 7.1 Honcho

```python
# Honcho's internal LLM calls can use the proxy
import openai
client = openai.OpenAI(base_url="http://localhost:9876/v1", api_key="key")
```

Honcho uses LLMs for:
- Dialectic reasoning over peer representations
- Session summarization
- Conclusion generation
- Search result ranking

All of these can be routed through pi's models via the proxy.

### 7.2 LangChain / LangGraph

```python
from langchain_openai import ChatOpenAI
llm = ChatOpenAI(base_url="http://localhost:9876/v1", model="anthropic/claude-sonnet-4-5-20250929")
```

### 7.3 Any OpenAI SDK

```typescript
const client = new OpenAI({ baseURL: "http://localhost:9876/v1", apiKey: "key" });
```

### 7.4 pi-honcho-memory Extension

The existing [pi-honcho-memory](https://github.com/agneym/pi-honcho-memory) extension could potentially be configured to route Honcho's server-side LLM calls through the proxy, giving Honcho access to pi's authenticated models for its internal reasoning.

---

## 8. Next Steps

1. **Continue OpenSpec workflow:** Create `design` and `specs` artifacts for the `production-ready-proxy` change
2. **Write tests first:** vitest suite for message conversion functions (the most critical code)
3. **Implement Anthropic Messages endpoint:** `POST /v1/messages` for native Claude-format clients
4. **Add request logging:** JSON log file for debugging and usage tracking
5. **Add model aliasing:** Short names in config for common models
6. **Modularize:** Split `index.ts` into `src/` modules following the proposed structure
7. **Publish as npm package:** `pi install npm:pi-model-proxy`
