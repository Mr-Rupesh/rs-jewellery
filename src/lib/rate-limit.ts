/** Sliding-window limiter, in memory. Per server instance only (not shared across instances). */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private max: number;
  private windowMs: number;
  constructor(max: number, windowMs: number) { this.max = max; this.windowMs = windowMs; }

  /** true = allowed, false = over the limit */
  check(key: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= this.max) { this.hits.set(key, recent); return false; }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (v.every((t) => t <= cutoff)) this.hits.delete(k);
    }
    return true;
  }
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
