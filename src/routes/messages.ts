/**
 * POST /v1/messages — Anthropic Messages API compatible endpoint
 */

import type { IncomingMessage, ServerResponse } from "http";
import type { AssistantMessage, Api, Model, SimpleStreamOptions } from "@mariozechner/pi-ai";
import { streamSimple } from "@mariozechner/pi-ai";
import type { ProxyConfig, AnthropicMessagesRequest } from "../types.js";
import { resolveModelAlias } from "../config.js";
import { convertAnthropicMessages, convertAnthropicTools } from "../convert/anthropic-to-piai.js";
import { eventToAnthropicSSE, eventToAnthropicResponse, AnthropicBlockTracker } from "../convert/piai-to-anthropic.js";
import { readBody, jsonResponse, errorResponse } from "../server.js";
import { logRequest, type RequestLogger } from "../logging.js";

export async function handleMessages(
	req: IncomingMessage,
	res: ServerResponse,
	config: ProxyConfig,
	getModelRegistry: () => any,
	logger: RequestLogger | null,
	signal: AbortSignal,
): Promise<void> {
	const startTime = Date.now();
	const registry = getModelRegistry();
	if (!registry) {
		return errorResponse(res, 503, "Model registry not available yet", { "Retry-After": "1" });
	}

	let body: AnthropicMessagesRequest;
	try {
		body = JSON.parse(await readBody(req));
	} catch {
		return errorResponse(res, 400, "Invalid JSON body");
	}

	// Resolve model
	const rawModel = body.model || config.defaultModel;
	if (!rawModel) {
		return errorResponse(res, 400, "No model specified. Use 'provider/model-id' format or set defaultModel in config.");
	}

	const modelSpec = resolveModelAlias(rawModel, config);
	const slashIndex = modelSpec.indexOf("/");
	if (slashIndex === -1) {
		return errorResponse(res, 400, `Invalid model format "${modelSpec}". Use "provider/model-id".`);
	}

	const provider = modelSpec.slice(0, slashIndex);
	const modelId = modelSpec.slice(slashIndex + 1);
	const model = registry.find(provider, modelId) as Model<Api> | undefined;

	if (!model) {
		return errorResponse(res, 404, `Model "${modelSpec}" not found. Use GET /v1/models to list available models.`);
	}

	const authResult = await registry.getApiKeyAndHeaders(model);
	if (!authResult.ok) {
		return errorResponse(res, 401, `No API key for model "${modelSpec}": ${authResult.error}`);
	}

	// Convert messages and tools
	const { systemPrompt, messages } = convertAnthropicMessages(body);
	const context: any = { systemPrompt, messages };
	if (body.tools?.length) {
		context.tools = convertAnthropicTools(body.tools);
	}

	const streamOptions: SimpleStreamOptions = {
		apiKey: authResult.apiKey,
		headers: authResult.headers,
		maxTokens: body.max_tokens,
		temperature: body.temperature,
		signal,
	} as any;

	const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

	try {
		const eventStream = streamSimple(model, context, streamOptions);

		if (!body.stream) {
			// Non-streaming
			let finalMessage: AssistantMessage | undefined;
			for await (const event of eventStream) {
				if (signal.aborted) break;
				if (event.type === "done") {
					finalMessage = event.message;
				} else if (event.type === "error") {
					logRequest(logger, { method: "POST", path: "/v1/messages", model: modelSpec, status: 502, startTime, error: event.error.errorMessage });
					return errorResponse(res, 502, event.error.errorMessage || "Provider error");
				}
			}
			if (!finalMessage) {
				logRequest(logger, { method: "POST", path: "/v1/messages", model: modelSpec, status: 502, startTime, error: "No response from provider" });
				return errorResponse(res, 502, "No response from provider");
			}
			logRequest(logger, { method: "POST", path: "/v1/messages", model: modelSpec, status: 200, startTime, inputTokens: finalMessage.usage.input, outputTokens: finalMessage.usage.output });
			return jsonResponse(res, 200, eventToAnthropicResponse(finalMessage, modelSpec, msgId));
		}

		// Streaming
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			"Connection": "keep-alive",
			"Access-Control-Allow-Origin": config.allowedOrigins?.join(",") || "*",
		});

		const tracker = new AnthropicBlockTracker();
		let lastMessage: AssistantMessage | undefined;
		for await (const event of eventStream) {
			if (signal.aborted) break;
			if (event.type === "done") lastMessage = event.message;
			const sseChunks = eventToAnthropicSSE(event, modelSpec, msgId, tracker);
			for (const chunk of sseChunks) {
				res.write(chunk);
			}
		}
		logRequest(logger, { method: "POST", path: "/v1/messages", model: modelSpec, status: 200, startTime, inputTokens: lastMessage?.usage.input, outputTokens: lastMessage?.usage.output });
		res.end();
	} catch (err: any) {
		if (signal.aborted) {
			if (!res.headersSent) {
				return errorResponse(res, 504, "Request timeout or client disconnected");
			}
			res.end();
			return;
		}
		if (!res.headersSent) {
			logRequest(logger, { method: "POST", path: "/v1/messages", model: modelSpec, status: 502, startTime, error: err.message });
			return errorResponse(res, 502, `Provider error: ${err.message}`);
		}
		res.end();
	}
}


