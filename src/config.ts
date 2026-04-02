/**
 * Configuration loading and validation
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { ProxyConfig } from "./types.js";

export const CONFIG_PATH = join(homedir(), ".pi", "model-proxy.json");

export const DEFAULT_CONFIG: ProxyConfig = {
	port: 9876,
	requestTimeoutMs: 120000,
};

/**
 * Load config from ~/.pi/model-proxy.json, creating defaults if missing.
 * Validates alias values contain '/' separator.
 */
export function loadConfig(configPath: string = CONFIG_PATH): ProxyConfig {
	if (!existsSync(configPath)) {
		writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
		return { ...DEFAULT_CONFIG };
	}
	try {
		const raw = JSON.parse(readFileSync(configPath, "utf-8"));
		const config: ProxyConfig = { ...DEFAULT_CONFIG, ...raw };
		validateAliases(config);
		return config;
	} catch (err: any) {
		if (err.message?.startsWith("Invalid alias")) {
			throw err;
		}
		return { ...DEFAULT_CONFIG };
	}
}

/**
 * Validate that all alias values contain a '/' separator (provider/model-id format).
 */
function validateAliases(config: ProxyConfig): void {
	if (!config.aliases) return;
	for (const [alias, target] of Object.entries(config.aliases)) {
		if (!target.includes("/")) {
			throw new Error(`Invalid alias "${alias}": value "${target}" must be in "provider/model-id" format (contain a '/' separator)`);
		}
	}
}

/**
 * Resolve a model string through aliases, then return provider/model-id.
 * Returns the alias target if matched, otherwise the original string.
 */
export function resolveModelAlias(modelSpec: string, config: ProxyConfig): string {
	if (config.aliases && modelSpec in config.aliases) {
		return config.aliases[modelSpec];
	}
	return modelSpec;
}
