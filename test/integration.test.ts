/**
 * Integration tests — full HTTP request/response cycle with mocked provider.
 *
 * Mocks:
 * - ModelRegistry (find, getAvailable, getApiKeyAndHeaders)
 * - streamSimple() from pi-ai (returns synthetic event streams)
 *
 * Tests the full pipeline: HTTP request → parsing → conversion → streaming → response
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "http";
import type { AssistantMessageEvent } from "@mariozechner/pi-ai";

// Mock streamSimple before importing server
let mockStreamEvents: AssistantMessageEvent[] = [];

vi.mock("@mariozechner/pi-ai", async () => {
	const actual = await vi.importActual("@mariozechner/pi-ai");
	return {
		...actual,
		streamSimple: vi.fn(async function* () {
			for (const event of mockStreamEvents) {
				yield event;
			}
		}),
	};
});

import { createProxyServer } from "../src/server.js";
import type { ProxyConfig } from "../src/types.js";

// --- Mock model registry ---

const MOCK_MODEL = {
	id: "test-model",
	provider: "test-provider",
	api: "openai-completions",
	name: "Test Model",
};

function createMockRegistry() {
	return {
		getAvailable: () => [MOCK_MODEL],
		find: (provider: string, id: string) => {
			if (provider === "test-provider" && id === "test-model") return MOCK_MODEL;
			return undefined;
		},
		getApiKeyAndHeaders: async () => ({
			ok: true,
			apiKey: "mock-api-key",
			headers: {},
		}),
	};
}

// --- HTTP helpers ---

function request(port: number, method: string, path: string, opts: { body?: any; headers?: Record<string, string> } = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
	return new Promise((resolve, reject) => {
		const req = http.request({ hostname: "127.0.0.1", port, method, path, headers: { "Content-Type": "application/json", ...opts.headers } }, (res) => {
			const chunks: Buffer[] = [];
			res.on("data", (c: Buffer) => chunks.push(c));
			res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks).toString() }));
		});
		req.on("error", reject);
		if (opts.body) req.write(JSON.stringify(opts.body));
		req.end();
	});
}

// --- Helpers to build mock pi-ai events ---

const mockUsage = { input: 15, output: 25, cacheRead: 0, cacheWrite: 0, totalTokens: 40, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

function textStreamEvents(text: string): AssistantMessageEvent[] {
	return [
		{ type: "start", partial: { role: "assistant", content: [] } } as any,
		{ type: "text_delta", delta: text, partial: { role: "assistant", content: [{ type: "text", text }] } } as any,
		{
			type: "done",
			message: {
				role: "assistant",
				content: [{ type: "text", text }],
				api: "openai-completions",
				provider: "test-provider",
				model: "test-model",
				usage: mockUsage,
				stopReason: "stop",
				timestamp: Date.now(),
			},
		} as any,
	];
}

function toolCallStreamEvents(): AssistantMessageEvent[] {
	const tc = { type: "toolCall", id: "call_abc", name: "get_weather", arguments: { city: "London" } };
	return [
		{ type: "start", partial: { role: "assistant", content: [] } } as any,
		{ type: "toolcall_start", contentIndex: 0, partial: { role: "assistant", content: [tc] } } as any,
		{ type: "toolcall_delta", delta: '{"city":"London"}', contentIndex: 0, partial: { role: "assistant", content: [tc] } } as any,
		{
			type: "done",
			message: {
				role: "assistant",
				content: [tc],
				api: "openai-completions",
				provider: "test-provider",
				model: "test-model",
				usage: mockUsage,
				stopReason: "toolUse",
				timestamp: Date.now(),
			},
		} as any,
	];
}

// ============================================================================
// Test suites
// ============================================================================

describe("Integration: OpenAI /v1/chat/completions", () => {
	let server: http.Server;
	const port = 29876;
	const config: ProxyConfig = {
		port,
		aliases: { "mymodel": "test-provider/test-model" },
	};

	beforeAll(async () => {
		server = createProxyServer({ config, getModelRegistry: createMockRegistry });
		await new Promise<void>((r) => server.listen(port, r));
	});

	afterAll(async () => {
		await new Promise<void>((r) => server.close(() => r()));
	});

	it("non-streaming text response — full pipeline", async () => {
		mockStreamEvents = textStreamEvents("Hello from the proxy!");

		const res = await request(port, "POST", "/v1/chat/completions", {
			body: {
				model: "test-provider/test-model",
				messages: [{ role: "user", content: "Hi" }],
				stream: false,
			},
		});

		expect(res.status).toBe(200);
		const data = JSON.parse(res.body);
		expect(data.object).toBe("chat.completion");
		expect(data.choices[0].message.role).toBe("assistant");
		expect(data.choices[0].message.content).toBe("Hello from the proxy!");
		expect(data.choices[0].finish_reason).toBe("stop");
		expect(data.usage.prompt_tokens).toBe(15);
		expect(data.usage.completion_tokens).toBe(25);
	});

	it("streaming text response — full SSE pipeline", async () => {
		mockStreamEvents = textStreamEvents("Streamed!");

		const res = await request(port, "POST", "/v1/chat/completions", {
			body: {
				model: "test-provider/test-model",
				messages: [{ role: "user", content: "Hi" }],
				stream: true,
			},
		});

		expect(res.status).toBe(200);
		const lines = res.body.split("\n").filter(l => l.startsWith("data: "));
		expect(lines.length).toBeGreaterThanOrEqual(3); // start + text_delta + done + [DONE]

		// First chunk should have role: assistant
		const first = JSON.parse(lines[0].replace("data: ", ""));
		expect(first.choices[0].delta.role).toBe("assistant");

		// Should have text content
		const textChunk = JSON.parse(lines[1].replace("data: ", ""));
		expect(textChunk.choices[0].delta.content).toBe("Streamed!");

		// Last line should be [DONE]
		const lastDataLine = lines[lines.length - 1];
		expect(lastDataLine).toBe("data: [DONE]");
	});

	it("non-streaming tool call response", async () => {
		mockStreamEvents = toolCallStreamEvents();

		const res = await request(port, "POST", "/v1/chat/completions", {
			body: {
				model: "test-provider/test-model",
				messages: [{ role: "user", content: "What's the weather?" }],
				stream: false,
				tools: [{ type: "function", function: { name: "get_weather", parameters: { type: "object", properties: { city: { type: "string" } } } } }],
			},
		});

		expect(res.status).toBe(200);
		const data = JSON.parse(res.body);
		expect(data.choices[0].finish_reason).toBe("tool_calls");
		expect(data.choices[0].message.tool_calls).toHaveLength(1);
		expect(data.choices[0].message.tool_calls[0].function.name).toBe("get_weather");
		expect(JSON.parse(data.choices[0].message.tool_calls[0].function.arguments)).toEqual({ city: "London" });
	});

	it("model alias resolution works end-to-end", async () => {
		mockStreamEvents = textStreamEvents("Alias works!");

		const res = await request(port, "POST", "/v1/chat/completions", {
			body: {
				model: "mymodel", // alias for test-provider/test-model
				messages: [{ role: "user", content: "Hi" }],
			},
		});

		expect(res.status).toBe(200);
		const data = JSON.parse(res.body);
		expect(data.choices[0].message.content).toBe("Alias works!");
	});

	it("unknown model returns 404", async () => {
		const res = await request(port, "POST", "/v1/chat/completions", {
			body: {
				model: "test-provider/nonexistent",
				messages: [{ role: "user", content: "Hi" }],
			},
		});
		expect(res.status).toBe(404);
	});

	it("missing model field with no default returns 400", async () => {
		const res = await request(port, "POST", "/v1/chat/completions", {
			body: { messages: [{ role: "user", content: "Hi" }] },
		});
		expect(res.status).toBe(400);
	});

	it("invalid JSON body returns 400", async () => {
		const res = await new Promise<any>((resolve, reject) => {
			const req = http.request({ hostname: "127.0.0.1", port, method: "POST", path: "/v1/chat/completions", headers: { "Content-Type": "application/json" } }, (r) => {
				const chunks: Buffer[] = [];
				r.on("data", (c: Buffer) => chunks.push(c));
				r.on("end", () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString() }));
			});
			req.on("error", reject);
			req.write("not json{{{");
			req.end();
		});
		expect(res.status).toBe(400);
	});
});

describe("Integration: Anthropic /v1/messages", () => {
	let server: http.Server;
	const port = 29877;
	const config: ProxyConfig = { port };

	beforeAll(async () => {
		server = createProxyServer({ config, getModelRegistry: createMockRegistry });
		await new Promise<void>((r) => server.listen(port, r));
	});

	afterAll(async () => {
		await new Promise<void>((r) => server.close(() => r()));
	});

	it("non-streaming text response — Anthropic format", async () => {
		mockStreamEvents = textStreamEvents("Anthropic response!");

		const res = await request(port, "POST", "/v1/messages", {
			body: {
				model: "test-provider/test-model",
				messages: [{ role: "user", content: "Hello" }],
				max_tokens: 1024,
			},
		});

		expect(res.status).toBe(200);
		const data = JSON.parse(res.body);
		expect(data.type).toBe("message");
		expect(data.role).toBe("assistant");
		expect(data.content[0].type).toBe("text");
		expect(data.content[0].text).toBe("Anthropic response!");
		expect(data.stop_reason).toBe("end_turn");
		expect(data.usage.input_tokens).toBe(15);
		expect(data.usage.output_tokens).toBe(25);
	});

	it("streaming response — Anthropic SSE format", async () => {
		mockStreamEvents = textStreamEvents("Streamed Anthropic!");

		const res = await request(port, "POST", "/v1/messages", {
			body: {
				model: "test-provider/test-model",
				messages: [{ role: "user", content: "Hello" }],
				max_tokens: 1024,
				stream: true,
			},
		});

		expect(res.status).toBe(200);

		// Parse Anthropic SSE events
		const events = res.body.split("\n\n").filter(Boolean).map(block => {
			const lines = block.split("\n");
			const eventLine = lines.find(l => l.startsWith("event: "));
			const dataLine = lines.find(l => l.startsWith("data: "));
			return {
				event: eventLine?.replace("event: ", ""),
				data: dataLine ? JSON.parse(dataLine.replace("data: ", "")) : null,
			};
		});

		// Should have message_start, content_block_start, content_block_delta, content_block_stop, message_delta, message_stop
		const eventTypes = events.map(e => e.event);
		expect(eventTypes).toContain("message_start");
		expect(eventTypes).toContain("content_block_delta");
		expect(eventTypes).toContain("message_delta");
		expect(eventTypes).toContain("message_stop");

		// message_start should have model
		const msgStart = events.find(e => e.event === "message_start");
		expect(msgStart!.data.message.role).toBe("assistant");

		// text delta
		const textDelta = events.find(e => e.event === "content_block_delta" && e.data?.delta?.type === "text_delta");
		expect(textDelta!.data.delta.text).toBe("Streamed Anthropic!");

		// message_delta with stop_reason
		const msgDelta = events.find(e => e.event === "message_delta");
		expect(msgDelta!.data.delta.stop_reason).toBe("end_turn");
	});

	it("tool use response — Anthropic format", async () => {
		mockStreamEvents = toolCallStreamEvents();

		const res = await request(port, "POST", "/v1/messages", {
			body: {
				model: "test-provider/test-model",
				messages: [{ role: "user", content: "Weather?" }],
				max_tokens: 1024,
				tools: [{ name: "get_weather", input_schema: { type: "object", properties: { city: { type: "string" } } } }],
			},
		});

		expect(res.status).toBe(200);
		const data = JSON.parse(res.body);
		expect(data.stop_reason).toBe("tool_use");
		expect(data.content[0].type).toBe("tool_use");
		expect(data.content[0].name).toBe("get_weather");
		expect(data.content[0].input).toEqual({ city: "London" });
	});
});

describe("Integration: GET /v1/models", () => {
	let server: http.Server;
	const port = 29878;

	beforeAll(async () => {
		server = createProxyServer({ config: { port }, getModelRegistry: createMockRegistry });
		await new Promise<void>((r) => server.listen(port, r));
	});

	afterAll(async () => {
		await new Promise<void>((r) => server.close(() => r()));
	});

	it("lists models from registry", async () => {
		const res = await request(port, "GET", "/v1/models");
		expect(res.status).toBe(200);
		const data = JSON.parse(res.body);
		expect(data.object).toBe("list");
		expect(data.data).toHaveLength(1);
		expect(data.data[0].id).toBe("test-provider/test-model");
		expect(data.data[0].owned_by).toBe("test-provider");
	});
});
