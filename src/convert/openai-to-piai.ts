/**
 * Convert OpenAI Chat Completions messages → pi-ai Context
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
import type { OpenAIMessage, OpenAIContentPart, OpenAITool } from "../types.js";

/**
 * Convert an array of OpenAI messages into a pi-ai Context
 * (systemPrompt + messages array).
 */
export function convertOpenAIMessages(openaiMessages: OpenAIMessage[]): { systemPrompt?: string; messages: Message[] } {
	let systemPrompt: string | undefined;
	const messages: Message[] = [];

	for (const msg of openaiMessages) {
		if (msg.role === "system") {
			const text = extractText(msg.content);
			systemPrompt = systemPrompt ? `${systemPrompt}\n${text}` : text;
			continue;
		}

		if (msg.role === "user") {
			messages.push(convertUserMessage(msg));
			continue;
		}

		if (msg.role === "assistant") {
			messages.push(convertAssistantMessage(msg));
			continue;
		}

		if (msg.role === "tool") {
			messages.push(convertToolResult(msg));
			continue;
		}
	}

	return { systemPrompt, messages };
}

/**
 * Convert OpenAI tool definitions to pi-ai tool format.
 */
export function convertOpenAITools(tools: OpenAITool[]): Context["tools"] {
	return tools.map(t => ({
		name: t.function.name,
		description: t.function.description || "",
		parameters: t.function.parameters || { type: "object", properties: {} },
	}));
}

function convertUserMessage(msg: OpenAIMessage): UserMessage {
	return {
		role: "user",
		content: convertUserContent(msg.content),
		timestamp: Date.now(),
	};
}

function convertAssistantMessage(msg: OpenAIMessage): AssistantMessage {
	const content: (TextContent | ToolCall)[] = [];

	if (msg.content) {
		const text = extractText(msg.content);
		if (text) {
			content.push({ type: "text", text });
		}
	}

	if (msg.tool_calls) {
		for (const tc of msg.tool_calls) {
			content.push({
				type: "toolCall",
				id: tc.id,
				name: tc.function.name,
				arguments: tryParseJSON(tc.function.arguments),
			});
		}
	}

	return {
		role: "assistant",
		content,
		api: "openai-completions" as Api,
		provider: "proxy",
		model: "proxy",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

function convertToolResult(msg: OpenAIMessage): ToolResultMessage {
	return {
		role: "toolResult",
		toolCallId: msg.tool_call_id || "",
		toolName: msg.name || "",
		content: [{ type: "text", text: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content) }],
		isError: false,
		timestamp: Date.now(),
	};
}

function convertUserContent(content: string | OpenAIContentPart[] | null): string | (TextContent | ImageContent)[] {
	if (!content) return "";
	if (typeof content === "string") return content;

	const parts: (TextContent | ImageContent)[] = [];
	for (const part of content) {
		if (part.type === "text" && part.text) {
			parts.push({ type: "text", text: part.text });
		} else if (part.type === "image_url" && part.image_url?.url) {
			const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
			if (match) {
				parts.push({ type: "image", mimeType: match[1], data: match[2] });
			}
		}
	}
	return parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts;
}

function extractText(content: string | OpenAIContentPart[] | null): string {
	if (!content) return "";
	if (typeof content === "string") return content;
	return content.filter(p => p.type === "text").map(p => p.text!).join("");
}

function tryParseJSON(s: string): Record<string, any> {
	try { return JSON.parse(s); } catch { return {}; }
}
