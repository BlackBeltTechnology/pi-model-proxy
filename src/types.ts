/**
 * Shared type definitions for pi-model-proxy
 */

// =============================================================================
// Config Types
// =============================================================================

export interface ProxyConfig {
	/** Port for the local API server (default: 9876) */
	port: number;
	/** Default model in "provider/model-id" format */
	defaultModel?: string;
	/** Optional API key to protect the proxy endpoint */
	apiKey?: string;
	/** Allowed origins for CORS (default: ["*"]) */
	allowedOrigins?: string[];
	/** Model aliases: short name → "provider/model-id" */
	aliases?: Record<string, string>;
	/** Per-minute request rate limit (0 or undefined = disabled) */
	rateLimit?: number;
	/** Request timeout in milliseconds (default: 120000) */
	requestTimeoutMs?: number;
	/** Path to JSON Lines log file (default: ~/.pi/model-proxy-log.jsonl) */
	logPath?: string;
}

// =============================================================================
// OpenAI Types
// =============================================================================

export interface OpenAIChatRequest {
	model?: string;
	messages: OpenAIMessage[];
	temperature?: number;
	max_tokens?: number;
	stream?: boolean;
	tools?: OpenAITool[];
	tool_choice?: any;
}

export interface OpenAIMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string | OpenAIContentPart[] | null;
	tool_calls?: OpenAIToolCall[];
	tool_call_id?: string;
	name?: string;
}

export interface OpenAIContentPart {
	type: "text" | "image_url";
	text?: string;
	image_url?: { url: string };
}

export interface OpenAIToolCall {
	id: string;
	type: "function";
	function: { name: string; arguments: string };
}

export interface OpenAITool {
	type: "function";
	function: {
		name: string;
		description?: string;
		parameters?: any;
	};
}

// =============================================================================
// Anthropic Types
// =============================================================================

export interface AnthropicMessagesRequest {
	model?: string;
	messages: AnthropicMessage[];
	system?: string | AnthropicContentBlock[];
	max_tokens: number;
	temperature?: number;
	stream?: boolean;
	tools?: AnthropicTool[];
	tool_choice?: any;
}

export interface AnthropicMessage {
	role: "user" | "assistant";
	content: string | AnthropicContentBlock[];
}

export type AnthropicContentBlock =
	| AnthropicTextBlock
	| AnthropicImageBlock
	| AnthropicToolUseBlock
	| AnthropicToolResultBlock
	| AnthropicThinkingBlock;

export interface AnthropicTextBlock {
	type: "text";
	text: string;
}

export interface AnthropicImageBlock {
	type: "image";
	source: {
		type: "base64";
		media_type: string;
		data: string;
	};
}

export interface AnthropicToolUseBlock {
	type: "tool_use";
	id: string;
	name: string;
	input: Record<string, any>;
}

export interface AnthropicToolResultBlock {
	type: "tool_result";
	tool_use_id: string;
	content?: string | AnthropicTextBlock[];
	is_error?: boolean;
}

export interface AnthropicThinkingBlock {
	type: "thinking";
	thinking: string;
}

export interface AnthropicTool {
	name: string;
	description?: string;
	input_schema: any;
}

// =============================================================================
// Logging Types
// =============================================================================

export interface RequestLogEntry {
	timestamp: string;
	model?: string;
	method: string;
	path: string;
	status: number;
	latency_ms: number;
	input_tokens?: number;
	output_tokens?: number;
	error?: string;
}
