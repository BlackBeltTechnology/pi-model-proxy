/**
 * Extension lifecycle — entry point for pi
 */

import type { Model, Api } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadConfig, CONFIG_PATH } from "./config.js";
import { createProxyServer } from "./server.js";

export default function (pi: ExtensionAPI) {
	const config = loadConfig();
	let modelRegistry: any = null;

	// Start the HTTP server
	const server = createProxyServer({
		config,
		getModelRegistry: () => modelRegistry,
	});

	server.listen(config.port, () => {
		console.log(`[model-proxy] API server listening on http://localhost:${config.port}`);
		console.log(`[model-proxy] Endpoints:`);
		console.log(`  GET  /v1/models             — List available models`);
		console.log(`  POST /v1/chat/completions   — Chat completions (OpenAI-compatible)`);
		console.log(`  POST /v1/messages           — Messages (Anthropic-compatible)`);
		console.log(`  GET  /health                — Health check`);
		if (config.defaultModel) {
			console.log(`[model-proxy] Default model: ${config.defaultModel}`);
		}
		if (config.aliases && Object.keys(config.aliases).length > 0) {
			console.log(`[model-proxy] Aliases: ${Object.keys(config.aliases).join(", ")}`);
		}
		if (config.rateLimit) {
			console.log(`[model-proxy] Rate limit: ${config.rateLimit} req/min`);
		}
	});

	server.on("error", (err: any) => {
		if (err.code === "EADDRINUSE") {
			console.error(`[model-proxy] Port ${config.port} already in use. Change port in ${CONFIG_PATH}`);
		} else {
			console.error(`[model-proxy] Server error: ${err.message}`);
		}
	});

	// Capture model registry on session start
	pi.on("session_start", async (_event, ctx) => {
		modelRegistry = ctx.modelRegistry;
		console.log(`[model-proxy] Model registry loaded, ${(modelRegistry.getAvailable() as Model<Api>[]).length} models available`);
	});

	// Shutdown server on exit
	pi.on("session_shutdown", async () => {
		server.close();
		console.log(`[model-proxy] Server stopped`);
	});

	// Register status command
	pi.registerCommand("proxy-status", {
		description: "Show model proxy status",
		handler: async (_args, ctx) => {
			const models = modelRegistry?.getAvailable() as Model<Api>[] | undefined;
			const lines = [
				`Model Proxy Status`,
				`  Server: http://localhost:${config.port}`,
				`  Models: ${models?.length ?? "loading..."}`,
			];
			if (config.defaultModel) {
				lines.push(`  Default: ${config.defaultModel}`);
			}
			if (config.apiKey) {
				lines.push(`  Auth: API key required`);
			}
			if (config.aliases && Object.keys(config.aliases).length > 0) {
				lines.push(`  Aliases: ${Object.entries(config.aliases).map(([k, v]) => `${k} → ${v}`).join(", ")}`);
			}
			if (config.rateLimit) {
				lines.push(`  Rate limit: ${config.rateLimit} req/min`);
			}
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
