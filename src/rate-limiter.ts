/**
 * Sliding window rate limiter
 */

export class RateLimiter {
	private timestamps: number[] = [];
	private readonly windowMs = 60_000; // 1 minute

	constructor(private readonly maxRequests: number) {}

	/**
	 * Check if a request is allowed. If allowed, records the request.
	 * Returns { allowed: true } or { allowed: false, retryAfterSeconds }.
	 */
	check(): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
		if (this.maxRequests <= 0) {
			return { allowed: true };
		}

		const now = Date.now();
		const windowStart = now - this.windowMs;

		// Prune entries older than the window
		this.timestamps = this.timestamps.filter(t => t > windowStart);

		if (this.timestamps.length >= this.maxRequests) {
			const oldestInWindow = this.timestamps[0];
			const retryAfterSeconds = Math.ceil((oldestInWindow + this.windowMs - now) / 1000);
			return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
		}

		this.timestamps.push(now);
		return { allowed: true };
	}

	/** Reset all tracked requests (for testing) */
	reset(): void {
		this.timestamps = [];
	}
}
