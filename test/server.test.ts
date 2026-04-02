import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { createProxyServer } from "../src/server.js";
import type { ProxyConfig } from "../src/types.js";

function makeRequest(port: number, method: string, path: string, options: { body?: any; headers?: Record<string, string> } = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
	return new Promise((resolve, reject) => {
		const req = http.request({ hostname: "127.0.0.1", port, method, path, headers: { "Content-Type": "application/json", ...options.headers } }, (res) => {
			const chunks: Buffer[] = [];
			res.on("data", (c: Buffer) => chunks.push(c));
			res.on("end", () => {
				const raw = Buffer.concat(chunks).toString();
				let body;
				try { body = JSON.parse(raw); } catch { body = raw; }
				resolve({ status: res.statusCode!, headers: res.headers, body });
			});
		});
		req.on("error", reject);
		if (options.body) req.write(JSON.stringify(options.body));
		req.end();
	});
}

describe("Server routing and middleware", () => {
	let server: http.Server;
	const port = 19876;
	const config: ProxyConfig = { port, apiKey: "test-secret" };

	beforeAll(async () => {
		server = createProxyServer({ config, getModelRegistry: () => null });
		await new Promise<void>((r) => server.listen(port, r));
	});

	afterAll(async () => {
		await new Promise<void>((r) => server.close(() => r()));
	});

	it("GET /health returns 200 without auth", async () => {
		const res = await makeRequest(port, "GET", "/health");
		expect(res.status).toBe(200);
		expect(res.body.status).toBe("ok");
	});

	it("returns 401 for API endpoints without auth", async () => {
		const res = await makeRequest(port, "GET", "/v1/models");
		expect(res.status).toBe(401);
	});

	it("returns 401 for invalid API key", async () => {
		const res = await makeRequest(port, "GET", "/v1/models", { headers: { Authorization: "Bearer wrong" } });
		expect(res.status).toBe(401);
	});

	it("returns 503 for model endpoints when registry is null", async () => {
		const res = await makeRequest(port, "GET", "/v1/models", { headers: { Authorization: "Bearer test-secret" } });
		expect(res.status).toBe(503);
		expect(res.headers["retry-after"]).toBe("1");
	});

	it("returns 404 for unknown routes", async () => {
		const res = await makeRequest(port, "GET", "/v1/unknown", { headers: { Authorization: "Bearer test-secret" } });
		expect(res.status).toBe(404);
	});

	it("handles CORS preflight", async () => {
		const res = await makeRequest(port, "OPTIONS", "/v1/chat/completions");
		expect(res.status).toBe(204);
	});
});

describe("Server without auth", () => {
	let server: http.Server;
	const port = 19877;

	beforeAll(async () => {
		const config: ProxyConfig = { port };
		server = createProxyServer({ config, getModelRegistry: () => null });
		await new Promise<void>((r) => server.listen(port, r));
	});

	afterAll(async () => {
		await new Promise<void>((r) => server.close(() => r()));
	});

	it("allows requests without API key when none configured", async () => {
		const res = await makeRequest(port, "GET", "/v1/models");
		expect(res.status).toBe(503); // 503 because registry is null, not 401
	});
});

describe("Server with rate limiting", () => {
	let server: http.Server;
	const port = 19878;

	beforeAll(async () => {
		const config: ProxyConfig = { port, rateLimit: 2 };
		server = createProxyServer({ config, getModelRegistry: () => null });
		await new Promise<void>((r) => server.listen(port, r));
	});

	afterAll(async () => {
		await new Promise<void>((r) => server.close(() => r()));
	});

	it("returns 429 when rate limit exceeded", async () => {
		await makeRequest(port, "GET", "/v1/models"); // 1
		await makeRequest(port, "GET", "/v1/models"); // 2
		const res = await makeRequest(port, "GET", "/v1/models"); // 3 — exceeded
		expect(res.status).toBe(429);
		expect(res.headers["retry-after"]).toBeDefined();
	});

	it("health check is exempt from rate limiting", async () => {
		// Rate limit is already exceeded from above test
		const res = await makeRequest(port, "GET", "/health");
		expect(res.status).toBe(200);
	});
});
