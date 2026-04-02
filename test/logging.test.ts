import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { RequestLogger } from "../src/logging.js";
import type { RequestLogEntry } from "../src/types.js";

const TEST_DIR = join(tmpdir(), "pi-model-proxy-log-test-" + Date.now());
const LOG_PATH = join(TEST_DIR, "subdir", "test.jsonl");

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("RequestLogger", () => {
	it("formats entry as JSON", () => {
		const logger = new RequestLogger(LOG_PATH);
		const entry: RequestLogEntry = {
			timestamp: "2026-01-01T00:00:00.000Z",
			model: "test/model",
			method: "POST",
			path: "/v1/chat/completions",
			status: 200,
			latency_ms: 150,
			input_tokens: 10,
			output_tokens: 20,
		};
		const formatted = logger.formatEntry(entry);
		const parsed = JSON.parse(formatted);
		expect(parsed.model).toBe("test/model");
		expect(parsed.latency_ms).toBe(150);
	});

	it("creates parent directories and writes log file", () => {
		const logger = new RequestLogger(LOG_PATH);
		const entry: RequestLogEntry = {
			timestamp: "2026-01-01T00:00:00.000Z",
			method: "POST",
			path: "/v1/chat/completions",
			status: 200,
			latency_ms: 100,
		};
		logger.log(entry);
		expect(existsSync(LOG_PATH)).toBe(true);
		const content = readFileSync(LOG_PATH, "utf-8");
		const lines = content.trim().split("\n");
		expect(lines).toHaveLength(1);
		expect(JSON.parse(lines[0]).status).toBe(200);
	});

	it("appends multiple entries", () => {
		const logger = new RequestLogger(LOG_PATH);
		const makeEntry = (status: number): RequestLogEntry => ({
			timestamp: new Date().toISOString(),
			method: "POST",
			path: "/v1/chat/completions",
			status,
			latency_ms: 50,
		});
		logger.log(makeEntry(200));
		logger.log(makeEntry(500));
		const lines = readFileSync(LOG_PATH, "utf-8").trim().split("\n");
		expect(lines).toHaveLength(2);
		expect(JSON.parse(lines[1]).status).toBe(500);
	});
});
