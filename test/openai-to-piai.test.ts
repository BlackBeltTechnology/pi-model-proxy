import { describe, it, expect } from "vitest";
import { convertOpenAIMessages, convertOpenAITools } from "../src/convert/openai-to-piai.js";
import type { OpenAIMessage, OpenAITool } from "../src/types.js";

describe("convertOpenAIMessages", () => {
	it("extracts system prompt", () => {
		const msgs: OpenAIMessage[] = [
			{ role: "system", content: "You are helpful." },
			{ role: "user", content: "Hi" },
		];
		const { systemPrompt, messages } = convertOpenAIMessages(msgs);
		expect(systemPrompt).toBe("You are helpful.");
		expect(messages).toHaveLength(1);
	});

	it("concatenates multiple system messages", () => {
		const msgs: OpenAIMessage[] = [
			{ role: "system", content: "Part 1" },
			{ role: "system", content: "Part 2" },
		];
		const { systemPrompt } = convertOpenAIMessages(msgs);
		expect(systemPrompt).toBe("Part 1\nPart 2");
	});

	it("converts user text message", () => {
		const msgs: OpenAIMessage[] = [{ role: "user", content: "Hello" }];
		const { messages } = convertOpenAIMessages(msgs);
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("user");
		expect((messages[0] as any).content).toBe("Hello");
	});

	it("converts user multimodal message with base64 image", () => {
		const msgs: OpenAIMessage[] = [{
			role: "user",
			content: [
				{ type: "text", text: "What is this?" },
				{ type: "image_url", image_url: { url: "data:image/png;base64,abc123" } },
			],
		}];
		const { messages } = convertOpenAIMessages(msgs);
		const content = (messages[0] as any).content;
		expect(content).toHaveLength(2);
		expect(content[0]).toEqual({ type: "text", text: "What is this?" });
		expect(content[1]).toEqual({ type: "image", mimeType: "image/png", data: "abc123" });
	});

	it("converts assistant message with text", () => {
		const msgs: OpenAIMessage[] = [{ role: "assistant", content: "I can help!" }];
		const { messages } = convertOpenAIMessages(msgs);
		expect(messages[0].role).toBe("assistant");
		expect((messages[0] as any).content[0]).toEqual({ type: "text", text: "I can help!" });
	});

	it("converts assistant message with tool calls", () => {
		const msgs: OpenAIMessage[] = [{
			role: "assistant",
			content: null,
			tool_calls: [{
				id: "call_1",
				type: "function",
				function: { name: "search", arguments: '{"q":"test"}' },
			}],
		}];
		const { messages } = convertOpenAIMessages(msgs);
		const content = (messages[0] as any).content;
		expect(content).toHaveLength(1);
		expect(content[0]).toMatchObject({ type: "toolCall", id: "call_1", name: "search", arguments: { q: "test" } });
	});

	it("converts tool result message", () => {
		const msgs: OpenAIMessage[] = [{
			role: "tool",
			content: "Result data",
			tool_call_id: "call_1",
			name: "search",
		}];
		const { messages } = convertOpenAIMessages(msgs);
		expect(messages[0].role).toBe("toolResult");
		expect((messages[0] as any).toolCallId).toBe("call_1");
		expect((messages[0] as any).toolName).toBe("search");
	});

	it("returns undefined systemPrompt when none provided", () => {
		const msgs: OpenAIMessage[] = [{ role: "user", content: "Hi" }];
		const { systemPrompt } = convertOpenAIMessages(msgs);
		expect(systemPrompt).toBeUndefined();
	});
});

describe("convertOpenAITools", () => {
	it("converts function tools", () => {
		const tools: OpenAITool[] = [{
			type: "function",
			function: { name: "search", description: "Search the web", parameters: { type: "object", properties: { q: { type: "string" } } } },
		}];
		const result = convertOpenAITools(tools);
		expect(result).toHaveLength(1);
		expect(result![0]).toEqual({
			name: "search",
			description: "Search the web",
			parameters: { type: "object", properties: { q: { type: "string" } } },
		});
	});
});
