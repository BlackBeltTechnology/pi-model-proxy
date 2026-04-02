/**
 * Pi 9Router Proxy Extension
 *
 * Exposes pi's authenticated models as a local OpenAI-compatible API server.
 * External services (Honcho, LangChain, custom apps, etc.) can call
 * http://localhost:PORT/v1/chat/completions or /v1/messages to use pi's models.
 *
 * See AGENTS.md and README.md for full documentation.
 */

export { default } from "./src/extension.js";
