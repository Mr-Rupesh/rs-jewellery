import test from "node:test";
import assert from "node:assert/strict";
import { RateLimiter, clientIp } from "./rate-limit.ts";

test("allows up to max, then blocks, then recovers after the window", () => {
  const r = new RateLimiter(3, 1000);
  assert.ok(r.check("a", 0)); assert.ok(r.check("a", 100)); assert.ok(r.check("a", 200));
  assert.equal(r.check("a", 300), false);
  assert.equal(r.check("a", 999), false);
  assert.ok(r.check("a", 1201)); // oldest hits have expired
});
test("keys are independent", () => {
  const r = new RateLimiter(1, 1000);
  assert.ok(r.check("a", 0)); assert.ok(r.check("b", 0)); assert.equal(r.check("a", 1), false);
});
test("clientIp takes the first forwarded address, falls back to local", () => {
  assert.equal(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } })), "1.2.3.4");
  assert.equal(clientIp(new Request("http://x")), "local");
});
