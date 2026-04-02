import { describe, it, expect } from "vitest";
import { eventToAnthropicSSE, eventToAnthropicResponse, AnthropicBlockTracker } from "../src/convert/piai-to-anthropic.js";
import type { AssistantMessage, ToolCall } from "@mariozechner/pi-ai";

const MODEL = "test/model";
const MSG_ID = "msg_test_123";

const mockUsage = { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

function parseSSEChunks(chunks: string[]): Array<{ event: string; data: any }> {
	return chunks.map(chunk => {
		const lines = chunk.trim().split("\n");
		const event = lines[0].replace("event: ", "");
		const data = JSON.parse(lines[1].replace("data: ", ""));
		return { event, data };
	});
}

describe("eventToAnthropicSSE", () => {
	it("converts start event to message_start", () => {
		const tracker = new AnthropicBlockTracker();
		const chunks = eventToAnthropicSSE({ type: "start", partial: { role: "assistant", content: [] } } as any, MODEL, MSG_ID, tracker);
		const parsed = parseSSEChunks(chunks);
		expect(parsed[0].event).toBe("message_start");
		expect(parsed[0].data.message.role).toBe("assistant");
		expect(parsed[0].data.message.model).toBe(MODEL);
	});

	it("converts text_delta to content_block_start + content_block_delta", () => {
		const tracker = new AnthropicBlockTracker();
		const chunks = eventToAnthropicSSE({ type: "text_delta", delta: "Hello" } as any, MODEL, MSG_ID, tracker);
		const parsed = parseSSEChunks(chunks);
		// First text_delta should trigger content_block_start then delta
		expect(parsed[0].event).toBe("content_block_start");
		expect(parsed[0].data.content_block.type).toBe("text");
		expect(parsed[1].event).toBe("content_block_delta");
		expect(parsed[1].data.delta.text).toBe("Hello");
	});

	it("converts thinking_delta", () => {
		const tracker = new AnthropicBlockTracker();
		const chunks = eventToAnthropicSSE({ type: "thinking_delta", delta: "pondering..." } as any, MODEL, MSG_ID, tracker);
		const parsed = parseSSEChunks(chunks);
		expect(parsed[0].event).toBe("content_block_start");
		expect(parsed[0].data.content_block.type).toBe("thinking");
		expect(parsed[1].event).toBe("content_block_delta");
		expect(parsed[1].data.delta.thinking).toBe("pondering...");
	});

	it("converts toolcall_start to content_block_start with tool_use", () => {
		const tracker = new AnthropicBlockTracker();
		const tc: ToolCall = { type: "toolCall", id: "tu_1", name: "search", arguments: {} };
		const event = { type: "toolcall_start", contentIndex: 0, partial: { content: [tc] } } as any;
		const chunks = eventToAnthropicSSE(event, MODEL, MSG_ID, tracker);
		const parsed = parseSSEChunks(chunks);
		expect(parsed[0].event).toBe("content_block_start");
		expect(parsed[0].data.content_block.type).toBe("tool_use");
		expect(parsed[0].data.content_block.name).toBe("search");
	});

	it("converts toolcall_delta to input_json_delta", () => {
		const tracker = new AnthropicBlockTracker();
		tracker.nextIndex(); // simulate having a block open
		const event = { type: "toolcall_delta", delta: '{"q":' } as any;
		const chunks = eventToAnthropicSSE(event, MODEL, MSG_ID, tracker);
		const parsed = parseSSEChunks(chunks);
		expect(parsed[0].event).toBe("content_block_delta");
		expect(parsed[0].data.delta.type).toBe("input_json_delta");
		expect(parsed[0].data.delta.partial_json).toBe('{"q":');
	});

	it("converts done event to message_delta + message_stop", () => {
		const tracker = new AnthropicBlockTracker();
		const msg = { stopReason: "stop", usage: mockUsage } as any;
		const chunks = eventToAnthropicSSE({ type: "done", message: msg } as any, MODEL, MSG_ID, tracker);
		const parsed = parseSSEChunks(chunks);
		const messageDelta = parsed.find(p => p.event === "message_delta");
		expect(messageDelta!.data.delta.stop_reason).toBe("end_turn");
		expect(messageDelta!.data.usage.output_tokens).toBe(20);
		const messageStop = parsed.find(p => p.event === "message_stop");
		expect(messageStop).toBeDefined();
	});

	it("maps toolUse stop reason to tool_use", () => {
		const tracker = new AnthropicBlockTracker();
		const msg = { stopReason: "toolUse", usage: mockUsage } as any;
		const chunks = eventToAnthropicSSE({ type: "done", message: msg } as any, MODEL, MSG_ID, tracker);
		const parsed = parseSSEChunks(chunks);
		const messageDelta = parsed.find(p => p.event === "message_delta");
		expect(messageDelta!.data.delta.stop_reason).toBe("tool_use");
	});
});

describe("eventToAnthropicResponse", () => {
	it("converts text response", () => {
		const msg: AssistantMessage = {
			role: "assistant",
			content: [{ type: "text", text: "Hello!" }],
			api: "anthropic" as any,
			provider: "test",
			model: "test",
			usage: mockUsage,
			stopReason: "stop",
			timestamp: Date.now(),
		};
		const resp = eventToAnthropicResponse(msg, MODEL, MSG_ID);
		expect(resp.content[0]).toEqual({ type: "text", text: "Hello!" });
		expect(resp.stop_reason).toBe("end_turn");
		expect(resp.usage.input_tokens).toBe(10);
		expect(resp.usage.output_tokens).toBe(20);
	});

	it("converts tool use response", () => {
		const msg: AssistantMessage = {
			role: "assistant",
			content: [{ type: "toolCall", id: "tu_1", name: "search", arguments: { q: "test" } }],
			api: "anthropic" as any,
			provider: "test",
			model: "test",
			usage: mockUsage,
			stopReason: "toolUse",
			timestamp: Date.now(),
		};
		const resp = eventToAnthropicResponse(msg, MODEL, MSG_ID);
		expect(resp.content[0]).toEqual({ type: "tool_use", id: "tu_1", name: "search", input: { q: "test" } });
		expect(resp.stop_reason).toBe("tool_use");
	});
});
