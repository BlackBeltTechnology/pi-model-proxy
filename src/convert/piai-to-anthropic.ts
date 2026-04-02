/**
 * Convert pi-ai AssistantMessageEvent stream → Anthropic Messages API SSE or non-streaming response
 */

import type {
	AssistantMessageEvent,
	AssistantMessage,
	TextContent,
	ToolCall,
} from "@mariozechner/pi-ai";

/**
 * Track content block indices for Anthropic SSE events.
 */
export class AnthropicBlockTracker {
	private currentIndex = -1;

	nextIndex(): number {
		return ++this.currentIndex;
	}

	getCurrentIndex(): number {
		return this.currentIndex;
	}
}

/**
 * Convert a pi-ai event to Anthropic SSE event strings.
 */
export function eventToAnthropicSSE(
	event: AssistantMessageEvent,
	model: string,
	msgId: string,
	tracker: AnthropicBlockTracker,
): string[] {
	const chunks: string[] = [];

	const makeSSE = (eventType: string, data: any) =>
		`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;

	switch (event.type) {
		case "start":
			chunks.push(makeSSE("message_start", {
				type: "message_start",
				message: {
					id: msgId,
					type: "message",
					role: "assistant",
					content: [],
					model,
					stop_reason: null,
					stop_sequence: null,
					usage: { input_tokens: 0, output_tokens: 0 },
				},
			}));
			break;

		case "text_delta": {
			const idx = tracker.getCurrentIndex();
			if (idx < 0) {
				// First text — start a content block
				const newIdx = tracker.nextIndex();
				chunks.push(makeSSE("content_block_start", {
					type: "content_block_start",
					index: newIdx,
					content_block: { type: "text", text: "" },
				}));
			}
			chunks.push(makeSSE("content_block_delta", {
				type: "content_block_delta",
				index: Math.max(0, tracker.getCurrentIndex()),
				delta: { type: "text_delta", text: event.delta },
			}));
			break;
		}

		case "thinking_delta": {
			const idx = tracker.getCurrentIndex();
			if (idx < 0) {
				const newIdx = tracker.nextIndex();
				chunks.push(makeSSE("content_block_start", {
					type: "content_block_start",
					index: newIdx,
					content_block: { type: "thinking", thinking: "" },
				}));
			}
			chunks.push(makeSSE("content_block_delta", {
				type: "content_block_delta",
				index: Math.max(0, tracker.getCurrentIndex()),
				delta: { type: "thinking_delta", thinking: event.delta },
			}));
			break;
		}

		case "toolcall_start": {
			const tc = event.partial.content[event.contentIndex] as ToolCall;
			// Close previous content block
			if (tracker.getCurrentIndex() >= 0) {
				chunks.push(makeSSE("content_block_stop", {
					type: "content_block_stop",
					index: tracker.getCurrentIndex(),
				}));
			}
			const newIdx = tracker.nextIndex();
			chunks.push(makeSSE("content_block_start", {
				type: "content_block_start",
				index: newIdx,
				content_block: { type: "tool_use", id: tc.id, name: tc.name, input: {} },
			}));
			break;
		}

		case "toolcall_delta": {
			chunks.push(makeSSE("content_block_delta", {
				type: "content_block_delta",
				index: tracker.getCurrentIndex(),
				delta: { type: "input_json_delta", partial_json: event.delta },
			}));
			break;
		}

		case "done": {
			const msg = event.message;
			// Close last content block
			if (tracker.getCurrentIndex() >= 0) {
				chunks.push(makeSSE("content_block_stop", {
					type: "content_block_stop",
					index: tracker.getCurrentIndex(),
				}));
			}
			const stopReason = msg.stopReason === "toolUse" ? "tool_use"
				: msg.stopReason === "length" ? "max_tokens"
				: "end_turn";
			chunks.push(makeSSE("message_delta", {
				type: "message_delta",
				delta: { stop_reason: stopReason, stop_sequence: null },
				usage: { output_tokens: msg.usage.output },
			}));
			chunks.push(makeSSE("message_stop", { type: "message_stop" }));
			break;
		}

		case "error": {
			chunks.push(makeSSE("error", {
				type: "error",
				error: { type: "api_error", message: event.error?.errorMessage || "Provider error" },
			}));
			break;
		}
	}

	return chunks;
}

/**
 * Convert a completed pi-ai AssistantMessage to a non-streaming Anthropic response.
 */
export function eventToAnthropicResponse(finalMsg: AssistantMessage, model: string, msgId: string): any {
	const content: any[] = [];

	for (const item of finalMsg.content) {
		if (item.type === "text") {
			content.push({ type: "text", text: (item as TextContent).text });
		} else if (item.type === "toolCall") {
			const tc = item as ToolCall;
			content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments });
		}
	}

	const stopReason = finalMsg.stopReason === "toolUse" ? "tool_use"
		: finalMsg.stopReason === "length" ? "max_tokens"
		: "end_turn";

	return {
		id: msgId,
		type: "message",
		role: "assistant",
		content,
		model,
		stop_reason: stopReason,
		stop_sequence: null,
		usage: {
			input_tokens: finalMsg.usage.input,
			output_tokens: finalMsg.usage.output,
		},
	};
}
