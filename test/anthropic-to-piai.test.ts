import { describe, it, expect } from "vitest";
import { convertAnthropicMessages, convertAnthropicTools } from "../src/convert/anthropic-to-piai.js";
import type { AnthropicMessagesRequest } from "../src/types.js";

describe("convertAnthropicMessages", () => {
	it("extracts string system prompt", () => {
		const req: AnthropicMessagesRequest = {
			model: "test",
			messages: [{ role: "user", content: "Hi" }],
			system: "You are helpful.",
			max_tokens: 1024,
		};
		const { systemPrompt } = convertAnthropicMessages(req);
		expect(systemPrompt).toBe("You are helpful.");
	});

	it("extracts content block system prompt", () => {
		const req: AnthropicMessagesRequest = {
			model: "test",
			messages: [{ role: "user", content: "Hi" }],
			system: [{ type: "text", text: "Part 1" }, { type: "text", text: "Part 2" }],
			max_tokens: 1024,
		};
		const { systemPrompt } = convertAnthropicMessages(req);
		expect(systemPrompt).toBe("Part 1\nPart 2");
	});

	it("converts user text message", () => {
		const req: AnthropicMessagesRequest = {
			model: "test",
			messages: [{ role: "user", content: "Hello" }],
			max_tokens: 1024,
		};
		const { messages } = convertAnthropicMessages(req);
		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("user");
		expect((messages[0] as any).content).toBe("Hello");
	});

	it("converts user content blocks with image", () => {
		const req: AnthropicMessagesRequest = {
			model: "test",
			messages: [{
				role: "user",
				content: [
					{ type: "text", text: "Describe this" },
					{ type: "image", source: { type: "base64", media_type: "image/png", data: "abc123" } },
				],
			}],
			max_tokens: 1024,
		};
		const { messages } = convertAnthropicMessages(req);
		const content = (messages[0] as any).content;
		expect(content).toHaveLength(2);
		expect(content[1]).toEqual({ type: "image", mimeType: "image/png", data: "abc123" });
	});

	it("converts assistant message with tool_use blocks", () => {
		const req: AnthropicMessagesRequest = {
			model: "test",
			messages: [{
				role: "assistant",
				content: [
					{ type: "tool_use", id: "tu_1", name: "search", input: { q: "test" } },
				],
			}],
			max_tokens: 1024,
		};
		const { messages } = convertAnthropicMessages(req);
		expect(messages[0].role).toBe("assistant");
		const content = (messages[0] as any).content;
		expect(content[0]).toMatchObject({ type: "toolCall", id: "tu_1", name: "search", arguments: { q: "test" } });
	});

	it("converts user message with tool_result blocks", () => {
		const req: AnthropicMessagesRequest = {
			model: "test",
			messages: [{
				role: "user",
				content: [
					{ type: "tool_result", tool_use_id: "tu_1", content: "Search result" },
				],
			}],
			max_tokens: 1024,
		};
		const { messages } = convertAnthropicMessages(req);
		expect(messages[0].role).toBe("toolResult");
		expect((messages[0] as any).toolCallId).toBe("tu_1");
	});

	it("returns undefined systemPrompt when none provided", () => {
		const req: AnthropicMessagesRequest = {
			model: "test",
			messages: [{ role: "user", content: "Hi" }],
			max_tokens: 1024,
		};
		const { systemPrompt } = convertAnthropicMessages(req);
		expect(systemPrompt).toBeUndefined();
	});
});

describe("convertAnthropicTools", () => {
	it("converts Anthropic tool definitions", () => {
		const tools = [{ name: "search", description: "Search", input_schema: { type: "object", properties: { q: { type: "string" } } } }];
		const result = convertAnthropicTools(tools);
		expect(result).toHaveLength(1);
		expect(result![0]).toEqual({ name: "search", description: "Search", parameters: { type: "object", properties: { q: { type: "string" } } } });
	});
});
