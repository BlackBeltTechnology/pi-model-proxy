/**
 * Request logging — append JSON Lines to a log file
 */

import { appendFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import type { RequestLogEntry } from "./types.js";

const DEFAULT_LOG_PATH = join(homedir(), ".pi", "model-proxy-log.jsonl");

export interface LogRequestOptions {
	method: string;
	path: string;
	status: number;
	startTime: number;
	model?: string;
	inputTokens?: number;
	outputTokens?: number;
	error?: string;
}

/**
 * Build and log a request entry. Safe to call with null logger (no-op).
 */
export function logRequest(logger: RequestLogger | null, opts: LogRequestOptions): void {
	if (!logger) return;
	const entry: RequestLogEntry = {
		timestamp: new Date().toISOString(),
		method: opts.method,
		path: opts.path,
		status: opts.status,
		latency_ms: Date.now() - opts.startTime,
	};
	if (opts.model) entry.model = opts.model;
	if (opts.inputTokens !== undefined) entry.input_tokens = opts.inputTokens;
	if (opts.outputTokens !== undefined) entry.output_tokens = opts.outputTokens;
	if (opts.error) entry.error = opts.error;
	logger.log(entry);
}

export class RequestLogger {
	private readonly logPath: string;

	constructor(logPath?: string) {
		this.logPath = logPath || DEFAULT_LOG_PATH;
	}

	/**
	 * Format a log entry object (useful for testing without file I/O).
	 */
	formatEntry(entry: RequestLogEntry): string {
		return JSON.stringify(entry);
	}

	/**
	 * Log a completed request by appending a JSON line to the log file.
	 */
	log(entry: RequestLogEntry): void {
		const dir = dirname(this.logPath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		appendFileSync(this.logPath, this.formatEntry(entry) + "\n", "utf-8");
	}
}
