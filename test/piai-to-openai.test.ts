import { describe, it, expect } from "vitest";
import { eventToSSEChunks, eventToNonStreamingResponse, ToolCallIndexTracker } from "../src/convert/piai-to-openai.js";
import type { AssistantMessageEvent, AssistantMessage, ToolCall } from "@mariozechner/pi-ai";

const MODEL = "test/model";
const MSG_ID = "test-123";

function makeTracker() {
	return new ToolCallIndexTracker();
}

const mockUsage = { input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

describe("ToolCallIndexTracker", () => {
	it("assigns sequential indices to different tool call IDs", () => {
		const tracker = makeTracker();
		expect(tracker.getIndex("call_1")).toBe(0);
		expect(tracker.getIndex("call_2")).toBe(1);
		expect(tracker.getIndex("call_1")).toBe(0); // same ID returns same index
		expect(tracker.getIndex("call_3")).toBe(2);
	});
});

describe("eventToSSEChunks", () => {
	it("converts start event", () => {
		const chunks = eventToSSEChunks({ type: "start", partial: { role: "assistant", content: [] } } as any, MODEL, MSG_ID, makeTracker());
		expect(chunks).toHaveLength(1);
		const data = JSON.parse(chunks[0].replace("data: ", "").trim());
		expect(data.choices[0].delta).toEqual({ role: "assistant" });
	});

	it("converts text_delta event", () => {
		const chunks = eventToSSEChunks({ type: "text_delta", delta: "Hello" } as any, MODEL, MSG_ID, makeTracker());
		const data = JSON.parse(chunks[0].replace("data: ", "").trim());
		expect(data.choices[0].delta).toEqual({ content: "Hello" });
	});

	it("converts thinking_delta event", () => {
		const chunks = eventToSSEChunks({ type: "thinking_delta", delta: "thinking..." } as any, MODEL, MSG_ID, makeTracker());
		const data = JSON.parse(chunks[0].replace("data: ", "").trim());
		expect(data.choices[0].delta).toEqual({ reasoning_content: "thinking..." });
	});

	it("converts toolcall_start with correct index", () => {
		const tracker = makeTracker();
		const tc: ToolCall = { type: "toolCall", id: "call_1", name: "search", arguments: {} };
		const event = { type: "toolcall_start", contentIndex: 0, partial: { content: [tc] } } as any;
		const chunks = eventToSSEChunks(event, MODEL, MSG_ID, tracker);
		const data = JSON.parse(chunks[0].replace("data: ", "").trim());
		expect(data.choices[0].delta.tool_calls[0].index).toBe(0);
		expect(data.choices[0].delta.tool_calls[0].id).toBe("call_1");
		expect(data.choices[0].delta.tool_calls[0].function.name).toBe("search");
	});

	it("converts toolcall_delta with correct index for multiple tool calls", () => {
		const tracker = makeTracker();
		// Register first tool call
		tracker.getIndex("call_1");
		tracker.getIndex("call_2");

		const tc2: ToolCall = { type: "toolCall", id: "call_2", name: "read", arguments: {} };
		const event = { type: "toolcall_delta", delta: '{"path":', contentIndex: 1, partial: { content: [{}, tc2] } } as any;
		const chunks = eventToSSEChunks(event, MODEL, MSG_ID, tracker);
		const data = JSON.parse(chunks[0].replace("data: ", "").trim());
		expect(data.choices[0].delta.tool_calls[0].index).toBe(1);
	});

	it("converts done event with usage and finish reason", () => {
		const msg = { stopReason: "stop", usage: mockUsage } as any;
		const chunks = eventToSSEChunks({ type: "done", message: msg } as any, MODEL, MSG_ID, makeTracker());
		expect(chunks).toHaveLength(2);
		const data = JSON.parse(chunks[0].replace("data: ", "").trim());
		expect(data.choices[0].finish_reason).toBe("stop");
		expect(data.usage.prompt_tokens).toBe(10);
		expect(data.usage.completion_tokens).toBe(20);
		expect(chunks[1]).toBe("data: [DONE]\n\n");
	});

	it("maps toolUse stop reason to tool_calls", () => {
		const msg = { stopReason: "toolUse", usage: mockUsage } as any;
		const chunks = eventToSSEChunks({ type: "done", message: msg } as any, MODEL, MSG_ID, makeTracker());
		const data = JSON.parse(chunks[0].replace("data: ", "").trim());
		expect(data.choices[0].finish_reason).toBe("tool_calls");
	});

	it("converts error event", () => {
		const chunks = eventToSSEChunks({ type: "error", error: { errorMessage: "fail" } } as any, MODEL, MSG_ID, makeTracker());
		expect(chunks).toHaveLength(2);
		expect(chunks[1]).toBe("data: [DONE]\n\n");
	});
});

describe("eventToNonStreamingResponse", () => {
	it("converts text response", () => {
		const msg: AssistantMessage = {
			role: "assistant",
			content: [{ type: "text", text: "Hello world" }],
			api: "openai-completions" as any,
			provider: "test",
			model: "test",
			usage: mockUsage,
			stopReason: "stop",
			timestamp: Date.now(),
		};
		const resp = eventToNonStreamingResponse(msg, MODEL, MSG_ID);
		expect(resp.choices[0].message.content).toBe("Hello world");
		expect(resp.choices[0].finish_reason).toBe("stop");
		expect(resp.usage.prompt_tokens).toBe(10);
	});

	it("converts tool call response", () => {
		const msg: AssistantMessage = {
			role: "assistant",
			content: [{ type: "toolCall", id: "call_1", name: "search", arguments: { q: "test" } }],
			api: "openai-completions" as any,
			provider: "test",
			model: "test",
			usage: mockUsage,
			stopReason: "toolUse",
			timestamp: Date.now(),
		};
		const resp = eventToNonStreamingResponse(msg, MODEL, MSG_ID);
		expect(resp.choices[0].message.tool_calls).toHaveLength(1);
		expect(resp.choices[0].message.tool_calls[0].function.name).toBe("search");
		expect(resp.choices[0].finish_reason).toBe("tool_calls");
	});
});
