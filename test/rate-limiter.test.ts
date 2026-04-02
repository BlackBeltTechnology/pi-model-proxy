import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../src/rate-limiter.js";

describe("RateLimiter", () => {
	it("allows requests under limit", () => {
		const limiter = new RateLimiter(5);
		for (let i = 0; i < 5; i++) {
			expect(limiter.check()).toEqual({ allowed: true });
		}
	});

	it("rejects requests at limit", () => {
		const limiter = new RateLimiter(3);
		limiter.check(); // 1
		limiter.check(); // 2
		limiter.check(); // 3
		const result = limiter.check(); // 4 — should be rejected
		expect(result.allowed).toBe(false);
		if (!result.allowed) {
			expect(result.retryAfterSeconds).toBeGreaterThan(0);
		}
	});

	it("allows requests after window expires", () => {
		vi.useFakeTimers();
		const limiter = new RateLimiter(2);
		limiter.check(); // 1
		limiter.check(); // 2
		expect(limiter.check().allowed).toBe(false);

		// Advance past the 60s window
		vi.advanceTimersByTime(61_000);
		expect(limiter.check()).toEqual({ allowed: true });
		vi.useRealTimers();
	});

	it("allows all requests when limit is 0 (disabled)", () => {
		const limiter = new RateLimiter(0);
		for (let i = 0; i < 100; i++) {
			expect(limiter.check()).toEqual({ allowed: true });
		}
	});

	it("reset clears tracked requests", () => {
		const limiter = new RateLimiter(1);
		limiter.check();
		expect(limiter.check().allowed).toBe(false);
		limiter.reset();
		expect(limiter.check()).toEqual({ allowed: true });
	});
});
