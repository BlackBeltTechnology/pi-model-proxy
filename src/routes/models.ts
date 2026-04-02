/**
 * GET /v1/models — list available models
 */

import type { ServerResponse } from "http";
import type { Model, Api } from "@mariozechner/pi-ai";
import { jsonResponse, errorResponse } from "../server.js";

export function handleModels(
	res: ServerResponse,
	getModelRegistry: () => any,
): void {
	const registry = getModelRegistry();
	if (!registry) {
		return errorResponse(res, 503, "Model registry not available yet", { "Retry-After": "1" });
	}
	const models = registry.getAvailable() as Model<Api>[];
	jsonResponse(res, 200, {
		object: "list",
		data: models.map((m: Model<Api>) => ({
			id: `${m.provider}/${m.id}`,
			object: "model",
			created: Math.floor(Date.now() / 1000),
			owned_by: m.provider,
		})),
	});
}
