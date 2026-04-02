/**
 * HTTP server creation, middleware pipeline, and routing
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "http";
import type { ProxyConfig } from "./types.js";
import { RateLimiter } from "./rate-limiter.js";
import { RequestLogger, logRequest } from "./logging.js";
import { handleModels } from "./routes/models.js";
import { handleCompletions } from "./routes/completions.js";
import { handleMessages } from "./routes/messages.js";

// =============================================================================
// HTTP Helpers (exported for use by route handlers)
// =============================================================================

export function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => chunks.push(chunk));
		req.on("end", () => resolve(Buffer.concat(chunks).toString()));
		req.on("error", reject);
	});
}

export function jsonResponse(res: ServerResponse, status: number, body: any, extraHeaders?: Record<string, string>): void {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"Access-Control-Allow-Origin": "*",
		...extraHeaders,
	};
	res.writeHead(status, headers);
	res.end(JSON.stringify(body));
}

export function errorResponse(res: ServerResponse, status: number, message: string, extraHeaders?: Record<string, string>): void {
	jsonResponse(res, status, { error: { message, type: "error", code: status } }, extraHeaders);
}

// =============================================================================
// Server Factory
// =============================================================================

export interface ServerDependencies {
	config: ProxyConfig;
	getModelRegistry: () => any;
}

export function createProxyServer(deps: ServerDependencies): Server {
	const { config, getModelRegistry } = deps;
	const rateLimiter = config.rateLimit ? new RateLimiter(config.rateLimit) : null;
	const logger = new RequestLogger(config.logPath);
	const corsOrigin = config.allowedOrigins?.join(",") || "*";

	const server = createServer(async (req, res) => {
		// CORS headers
		res.setHeader("Access-Control-Allow-Origin", corsOrigin);
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key, anthropic-version");

		// CORS preflight
		if (req.method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}

		const url = new URL(req.url || "/", `http://localhost:${config.port}`);
		const path = url.pathname;

		// Health check — always available, no auth, no rate limit
		if (path === "/health" || path === "/") {
			return jsonResponse(res, 200, { status: "ok", service: "pi-model-proxy" });
		}

		const startTime = Date.now();

		// Auth check
		if (config.apiKey) {
			const auth = req.headers.authorization;
			const xApiKey = req.headers["x-api-key"] as string | undefined;
			const token = auth?.startsWith("Bearer ") ? auth.slice(7) : xApiKey;
			if (token !== config.apiKey) {
				logRequest(logger, { method: req.method || "GET", path, status: 401, startTime, error: "Invalid API key" });
				return errorResponse(res, 401, "Invalid API key");
			}
		}

		// Rate limiting (applies to API endpoints only)
		if (rateLimiter) {
			const result = rateLimiter.check();
			if (!result.allowed) {
				logRequest(logger, { method: req.method || "GET", path, status: 429, startTime, error: "Rate limit exceeded" });
				return errorResponse(res, 429, "Rate limit exceeded", {
					"Retry-After": String(result.retryAfterSeconds),
				});
			}
		}

		// Create AbortController for timeout + client disconnect
		const controller = new AbortController();
		const timeoutMs = config.requestTimeoutMs || 120000;
		const timeout = setTimeout(() => controller.abort(), timeoutMs);

		res.on("close", () => {
			if (!res.writableEnded) {
				controller.abort();
			}
		});

		const cleanup = () => clearTimeout(timeout);

		try {
			// Route dispatch
			if (path === "/v1/models" && req.method === "GET") {
				handleModels(res, getModelRegistry);
			} else if (path === "/v1/chat/completions" && req.method === "POST") {
				await handleCompletions(req, res, config, getModelRegistry, logger, controller.signal);
			} else if (path === "/v1/messages" && req.method === "POST") {
				await handleMessages(req, res, config, getModelRegistry, logger, controller.signal);
			} else {
				logRequest(logger, { method: req.method || "GET", path, status: 404, startTime, error: `Not found: ${path}` });
				errorResponse(res, 404, `Not found: ${path}`);
			}
		} finally {
			cleanup();
		}
	});

	return server;
}
