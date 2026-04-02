import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { loadConfig, resolveModelAlias } from "../src/config.js";
import type { ProxyConfig } from "../src/types.js";

const TEST_DIR = join(tmpdir(), "pi-model-proxy-test-" + Date.now());
const TEST_CONFIG = join(TEST_DIR, "config.json");

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("loadConfig", () => {
	it("creates default config when file does not exist", () => {
		const config = loadConfig(TEST_CONFIG);
		expect(config.port).toBe(9876);
		expect(config.requestTimeoutMs).toBe(120000);
		expect(existsSync(TEST_CONFIG)).toBe(true);
	});

	it("loads custom config values", () => {
		writeFileSync(TEST_CONFIG, JSON.stringify({
			port: 3000,
			defaultModel: "anthropic/claude-sonnet-4-5-20250929",
			apiKey: "test-key",
			rateLimit: 60,
		}));
		const config = loadConfig(TEST_CONFIG);
		expect(config.port).toBe(3000);
		expect(config.defaultModel).toBe("anthropic/claude-sonnet-4-5-20250929");
		expect(config.apiKey).toBe("test-key");
		expect(config.rateLimit).toBe(60);
		expect(config.requestTimeoutMs).toBe(120000); // default preserved
	});

	it("returns defaults for invalid JSON", () => {
		writeFileSync(TEST_CONFIG, "not json");
		const config = loadConfig(TEST_CONFIG);
		expect(config.port).toBe(9876);
	});

	it("loads aliases", () => {
		writeFileSync(TEST_CONFIG, JSON.stringify({
			aliases: { "sonnet": "anthropic/claude-sonnet-4-5-20250929" },
		}));
		const config = loadConfig(TEST_CONFIG);
		expect(config.aliases).toEqual({ "sonnet": "anthropic/claude-sonnet-4-5-20250929" });
	});

	it("throws on invalid alias (no slash)", () => {
		writeFileSync(TEST_CONFIG, JSON.stringify({
			aliases: { "bad": "no-slash-here" },
		}));
		expect(() => loadConfig(TEST_CONFIG)).toThrow(/Invalid alias "bad"/);
	});
});

describe("resolveModelAlias", () => {
	const config: ProxyConfig = {
		port: 9876,
		aliases: {
			"sonnet": "anthropic/claude-sonnet-4-5-20250929",
			"gpt4": "openai/gpt-4o",
		},
	};

	it("resolves known alias", () => {
		expect(resolveModelAlias("sonnet", config)).toBe("anthropic/claude-sonnet-4-5-20250929");
		expect(resolveModelAlias("gpt4", config)).toBe("openai/gpt-4o");
	});

	it("returns literal when no alias match", () => {
		expect(resolveModelAlias("anthropic/claude-sonnet-4-5-20250929", config)).toBe("anthropic/claude-sonnet-4-5-20250929");
	});

	it("returns literal when no aliases configured", () => {
		expect(resolveModelAlias("anthropic/claude-sonnet-4-5-20250929", { port: 9876 })).toBe("anthropic/claude-sonnet-4-5-20250929");
	});
});
