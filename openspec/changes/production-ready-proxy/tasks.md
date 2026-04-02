## 1. Project Setup & Module Scaffolding

- [x] 1.1 Create `src/` directory structure with empty module files (`types.ts`, `config.ts`, `server.ts`, `extension.ts`, `logging.ts`, `rate-limiter.ts`, `convert/`, `routes/`)
- [x] 1.2 Add vitest to devDependencies and create `vitest.config.ts`
- [x] 1.3 Update `index.ts` to be a thin re-export of `src/extension.ts`
- [x] 1.4 Move shared type definitions to `src/types.ts` (ProxyConfig, OpenAI types, Anthropic types)

## 2. Config Module

- [x] 2.1 Implement `src/config.ts` with `loadConfig()` supporting new fields: `aliases`, `rateLimit`, `requestTimeoutMs`, `logPath`
- [x] 2.2 Add alias validation (values must contain `/` separator)
- [x] 2.3 Write tests for config loading, defaults, alias validation

## 3. OpenAI Message Conversion

- [x] 3.1 Extract `src/convert/openai-to-piai.ts` from existing `convertMessages()` logic
- [x] 3.2 Extract `src/convert/piai-to-openai.ts` from existing `eventToSSEChunks()` and `eventToNonStreamingResponse()`
- [x] 3.3 Fix tool call index tracking — assign sequential indices (0, 1, 2...) for multiple concurrent tool calls
- [x] 3.4 Write tests for OpenAI→pi-ai conversion (system msgs, user text, multimodal, assistant, tool results)
- [x] 3.5 Write tests for pi-ai→OpenAI SSE conversion (start, text_delta, thinking_delta, toolcall_start/delta with indices, done, error)
- [x] 3.6 Write tests for pi-ai→OpenAI non-streaming conversion

## 4. Anthropic Message Conversion

- [x] 4.1 Implement `src/convert/anthropic-to-piai.ts` — system prompt, user text, content blocks, tool_use, tool_result
- [x] 4.2 Implement `src/convert/piai-to-anthropic.ts` — streaming SSE (message_start, content_block_delta, message_delta, message_stop) and non-streaming response
- [x] 4.3 Write tests for Anthropic→pi-ai conversion
- [x] 4.4 Write tests for pi-ai→Anthropic streaming and non-streaming conversion

## 5. Model Aliasing

- [x] 5.1 Implement alias resolution function in `src/config.ts` or a dedicated helper — check aliases first, then treat as literal `provider/model-id`
- [x] 5.2 Write tests for alias resolution (match, no match, fallback to literal)

## 6. Rate Limiting

- [x] 6.1 Implement `src/rate-limiter.ts` with sliding window algorithm (in-memory timestamp array, prune old entries, check count vs limit)
- [x] 6.2 Return 429 with `Retry-After` header when limit exceeded
- [x] 6.3 Exempt `/health` from rate limiting
- [x] 6.4 Write tests for rate limiter (under limit, at limit, window expiry, disabled)

## 7. Request Logging

- [x] 7.1 Implement `src/logging.ts` — append JSON line per request with timestamp, model, method, path, status, latency_ms, tokens
- [x] 7.2 Handle log file creation (create parent dirs if needed)
- [x] 7.3 Write tests for log entry formatting and file append

## 8. Client Lifecycle (Timeout & Disconnect)

- [x] 8.1 Create AbortController per request, wire to timeout timer and `req.on('close')`
- [x] 8.2 Pass AbortSignal to `streamSimple()` options
- [x] 8.3 Return 504 on timeout (if headers not sent) or close SSE stream
- [x] 8.4 Write tests for timeout and disconnect abort behavior

## 9. HTTP Server & Routes

- [x] 9.1 Implement `src/server.ts` with middleware pipeline (auth → rate limit → route → log)
- [x] 9.2 Implement `src/routes/completions.ts` — `POST /v1/chat/completions` handler using new conversion modules and abort/timeout logic
- [x] 9.3 Implement `src/routes/messages.ts` — `POST /v1/messages` handler using Anthropic conversion modules
- [x] 9.4 Implement `src/routes/models.ts` — `GET /v1/models` handler
- [x] 9.5 Add graceful startup: return 503 with `Retry-After: 1` for model-dependent routes before `session_start`
- [x] 9.6 Write integration tests for HTTP server (routing, auth, CORS, 503 before ready, 404 unknown routes)

## 10. Extension Lifecycle

- [x] 10.1 Implement `src/extension.ts` — extension entry point with `session_start`, `session_shutdown`, `/proxy-status` command
- [x] 10.2 Wire all modules together (config → server → routes → logging)
- [x] 10.3 Verify extension compiles: `npx -p typescript tsc --noEmit --esModuleInterop --moduleResolution bundler --module esnext --target esnext --skipLibCheck index.ts`

## 11. Documentation & Cleanup

- [x] 11.1 Update `AGENTS.md` with new module structure, file table, and updated code sections
- [x] 11.2 Update `README.md` with new config fields, Anthropic endpoint, and model aliasing docs
- [x] 11.3 Remove old monolithic code from `index.ts` (should only be re-export)
