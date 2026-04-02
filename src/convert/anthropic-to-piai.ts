/**
 * Convert Anthropic Messages API requests → pi-ai Context
 */

import type {
	Context,
	Message,
	UserMessage,
	AssistantMessage,
	ToolResultMessage,
	TextContent,
	ImageContent,
	ToolCall,
	Api,
} from "@mariozechner/pi-ai";
import type {
	AnthropicMessagesRequest,
	AnthropicMessage,
	AnthropicContentBlock,
	AnthropicTool,
} from "../types.js";

/**
 * Convert Anthropic Messages request into pi-ai Context.
 */
export function convertAnthropicMessages(request: AnthropicMessagesRequest): { systemPrompt?: string; messages: Message[] } {
	const systemPrompt = extractSystemPrompt(request.system);
	const messages: Message[] = [];

	for (const msg of request.messages) {
		if (msg.role === "user") {
			const converted = convertUserMessage(msg);
			// User messages may contain tool_result blocks — split them out
			messages.push(...converted);
		} else if (msg.role === "assistant") {
			messages.push(convertAssistantMessage(msg));
		}
	}

	return { systemPrompt: systemPrompt || undefined, messages };
}

/**
 * Convert Anthropic tool definitions to pi-ai tool format.
 */
export function convertAnthropicTools(tools: AnthropicTool[]): Context["tools"] {
	return tools.map(t => ({
		name: t.name,
		description: t.description || "",
		parameters: t.input_schema || { type: "object", properties: {} },
	}));
}

function extractSystemPrompt(system: string | AnthropicContentBlock[] | undefined): string | undefined {
	if (!system) return undefined;
	if (typeof system === "string") return system;
	return system
		.filter(b => b.type === "text")
		.map(b => (b as { type: "text"; text: string }).text)
		.join("\n") || undefined;
}

function convertUserMessage(msg: AnthropicMessage): Message[] {
	if (typeof msg.content === "string") {
		return [{
			role: "user",
			content: msg.content,
			timestamp: Date.now(),
		} as UserMessage];
	}

	const results: Message[] = [];
	const userParts: (TextContent | ImageContent)[] = [];

	for (const block of msg.content as AnthropicContentBlock[]) {
		if (block.type === "text") {
			userParts.push({ type: "text", text: block.text });
		} else if (block.type === "image") {
			userParts.push({
				type: "image",
				mimeType: block.source.media_type,
				data: block.source.data,
			});
		} else if (block.type === "tool_result") {
			// Flush accumulated user parts before tool result
			if (userParts.length > 0) {
				results.push({
					role: "user",
					content: userParts.length === 1 && userParts[0].type === "text" ? userParts[0].text : [...userParts],
					timestamp: Date.now(),
				} as UserMessage);
				userParts.length = 0;
			}
			const toolContent = typeof block.content === "string"
				? block.content
				: Array.isArray(block.content)
					? block.content.map(b => b.text).join("")
					: "";
			results.push({
				role: "toolResult",
				toolCallId: block.tool_use_id,
				toolName: "",
				content: [{ type: "text", text: toolContent }],
				isError: block.is_error || false,
				timestamp: Date.now(),
			} as ToolResultMessage);
		}
	}

	// Flush remaining user parts
	if (userParts.length > 0) {
		results.push({
			role: "user",
			content: userParts.length === 1 && userParts[0].type === "text" ? userParts[0].text : [...userParts],
			timestamp: Date.now(),
		} as UserMessage);
	}

	// If no messages were generated (e.g., empty content), push an empty user message
	if (results.length === 0) {
		results.push({ role: "user", content: "", timestamp: Date.now() } as UserMessage);
	}

	return results;
}

function convertAssistantMessage(msg: AnthropicMessage): AssistantMessage {
	const content: (TextContent | ToolCall)[] = [];

	if (typeof msg.content === "string") {
		if (msg.content) content.push({ type: "text", text: msg.content });
	} else {
		for (const block of msg.content as AnthropicContentBlock[]) {
			if (block.type === "text") {
				content.push({ type: "text", text: block.text });
			} else if (block.type === "tool_use") {
				content.push({
					type: "toolCall",
					id: block.id,
					name: block.name,
					arguments: block.input,
				});
			}
		}
	}

	return {
		role: "assistant",
		content,
		api: "anthropic" as Api,
		provider: "proxy",
		model: "proxy",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "stop",
		timestamp: Date.now(),
	};
}
