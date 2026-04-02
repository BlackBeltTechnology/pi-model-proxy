/**
 * Convert pi-ai AssistantMessageEvent stream → OpenAI SSE chunks or non-streaming response
 */

import type {
	AssistantMessageEvent,
	AssistantMessage,
	TextContent,
	ToolCall,
} from "@mariozechner/pi-ai";

/**
 * Track tool call indices across the stream for proper multi-tool-call support.
 */
export class ToolCallIndexTracker {
	private idToIndex = new Map<string, number>();
	private nextIndex = 0;

	getIndex(toolCallId: string): number {
		if (!this.idToIndex.has(toolCallId)) {
			this.idToIndex.set(toolCallId, this.nextIndex++);
		}
		return this.idToIndex.get(toolCallId)!;
	}

	/** Get index for a toolcall_delta based on contentIndex (position in content array) */
	getIndexByContentIndex(contentIndex: number, partialContent: any[]): number {
		const item = partialContent[contentIndex];
		if (item?.type === "toolCall" && item.id) {
			return this.getIndex(item.id);
		}
		return 0;
	}
}

/**
 * Convert a single pi-ai event to OpenAI SSE chunk strings.
 */
export function eventToSSEChunks(
	event: AssistantMessageEvent,
	model: string,
	msgId: string,
	tracker: ToolCallIndexTracker,
): string[] {
	const chunks: string[] = [];

	const makeChunk = (delta: any, finishReason: string | null = null, usage?: any) => {
		const chunk: any = {
			id: `chatcmpl-${msgId}`,
			object: "chat.completion.chunk",
			created: Math.floor(Date.now() / 1000),
			model,
			choices: [{ index: 0, delta, finish_reason: finishReason }],
		};
		if (usage) chunk.usage = usage;
		return `data: ${JSON.stringify(chunk)}\n\n`;
	};

	switch (event.type) {
		case "start":
			chunks.push(makeChunk({ role: "assistant" }));
			break;

		case "text_delta":
			chunks.push(makeChunk({ content: event.delta }));
			break;

		case "thinking_delta":
			chunks.push(makeChunk({ reasoning_content: event.delta }));
			break;

		case "toolcall_start": {
			const tc = event.partial.content[event.contentIndex] as ToolCall;
			const idx = tracker.getIndex(tc.id);
			chunks.push(makeChunk({
				tool_calls: [{
					index: idx,
					id: tc.id,
					type: "function",
					function: { name: tc.name, arguments: "" },
				}],
			}));
			break;
		}

		case "toolcall_delta": {
			const idx = tracker.getIndexByContentIndex(event.contentIndex, event.partial.content);
			chunks.push(makeChunk({
				tool_calls: [{
					index: idx,
					function: { arguments: event.delta },
				}],
			}));
			break;
		}

		case "done": {
			const msg = event.message;
			const finishReason = msg.stopReason === "toolUse" ? "tool_calls"
				: msg.stopReason === "length" ? "length"
				: "stop";
			const usage = {
				prompt_tokens: msg.usage.input,
				completion_tokens: msg.usage.output,
				total_tokens: msg.usage.input + msg.usage.output,
			};
			chunks.push(makeChunk({}, finishReason, usage));
			chunks.push("data: [DONE]\n\n");
			break;
		}

		case "error": {
			chunks.push(makeChunk({}, "stop"));
			chunks.push("data: [DONE]\n\n");
			break;
		}
	}

	return chunks;
}

/**
 * Convert a completed pi-ai AssistantMessage to a non-streaming OpenAI response.
 */
export function eventToNonStreamingResponse(finalMsg: AssistantMessage, model: string, msgId: string): any {
	const textParts = finalMsg.content.filter(c => c.type === "text") as TextContent[];
	const toolCalls = finalMsg.content.filter(c => c.type === "toolCall") as ToolCall[];

	const message: any = {
		role: "assistant",
		content: textParts.map(t => t.text).join("") || null,
	};

	if (toolCalls.length > 0) {
		message.tool_calls = toolCalls.map((tc, i) => ({
			id: tc.id,
			type: "function",
			function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
		}));
	}

	return {
		id: `chatcmpl-${msgId}`,
		object: "chat.completion",
		created: Math.floor(Date.now() / 1000),
		model,
		choices: [{
			index: 0,
			message,
			finish_reason: finalMsg.stopReason === "toolUse" ? "tool_calls"
				: finalMsg.stopReason === "length" ? "length"
				: "stop",
		}],
		usage: {
			prompt_tokens: finalMsg.usage.input,
			completion_tokens: finalMsg.usage.output,
			total_tokens: finalMsg.usage.input + finalMsg.usage.output,
		},
	};
}
