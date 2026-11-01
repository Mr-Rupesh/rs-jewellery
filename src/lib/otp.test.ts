import test from "node:test";
import assert from "node:assert/strict";
import { generateCode, hashCode, codeMatches, emailDocId, normalizeEmail, checkSend, evaluateAttempt, OTP_TTL_MS, OTP_MAX_ATTEMPTS, RESEND_COOLDOWN_MS, MAX_SENDS_PER_HOUR, type OtpRecord } from "./otp.ts";

const S = "test-secret";
const rec = (over: Partial<OtpRecord> = {}): OtpRecord => ({ codeHash: hashCode("123456", "a@b.co", S), expiresAt: 1_000_000, attempts: 0, lastSentAt: 0, windowStart: 0, sendCount: 1, ...over });

test("codes are always exactly 6 digits", () => {
  for (let i = 0; i < 2000; i++) assert.match(generateCode(), /^\d{6}$/);
});
test("hash depends on code, email (case-insensitive) and secret; matching is exact", () => {
  const h = hashCode("123456", "A@B.co", S);
  assert.equal(h, hashCode("123456", " a@b.co ", S));
  assert.notEqual(h, hashCode("123457", "a@b.co", S));
  assert.notEqual(h, hashCode("123456", "a@b.co", "other"));
  assert.ok(codeMatches("123456", "a@b.co", S, h));
  assert.ok(!codeMatches("000000", "a@b.co", S, h));
  assert.ok(!codeMatches("123456", "a@b.co", S, "short"));
  assert.ok(!h.includes("123456"));
});
test("document id is a hash that ignores case and does not contain the email", () => {
  assert.equal(emailDocId("Asha@Mail.com "), emailDocId("asha@mail.com"));
  assert.ok(!emailDocId("asha@mail.com").includes("asha"));
  assert.equal(normalizeEmail("  X@Y.IN "), "x@y.in");
});
test("checkSend: first send, 30s cooldown, hourly cap, window reset", () => {
  assert.deepEqual(checkSend(null, 5), { ok: true, windowStart: 5, sendCount: 1 });
  const first = rec({ lastSentAt: 1000, windowStart: 1000, sendCount: 1 });
  const early = checkSend(first, 1000 + 10_000);
  assert.equal(early.ok, false); assert.equal((early as { retryAfterSec: number }).retryAfterSec, 20);
  assert.deepEqual(checkSend(first, 1000 + RESEND_COOLDOWN_MS), { ok: true, windowStart: 1000, sendCount: 2 });
  const capped = rec({ lastSentAt: 100_000, windowStart: 0, sendCount: MAX_SENDS_PER_HOUR });
  const blocked = checkSend(capped, 200_000);
  assert.equal(blocked.ok, false); assert.ok((blocked as { retryAfterSec: number }).retryAfterSec > 3000);
  assert.deepEqual(checkSend(capped, 3_700_000), { ok: true, windowStart: 3_700_000, sendCount: 1 }); // new hour
});
test("evaluateAttempt covers every outcome", () => {
  assert.equal(evaluateAttempt(null, "123456", "a@b.co", S, 0), "NO_CODE");
  assert.equal(evaluateAttempt(rec(), "123456", "a@b.co", S, 500), "OK");
  assert.equal(evaluateAttempt(rec(), "123456", "A@B.CO", S, 500), "OK");
  assert.equal(evaluateAttempt(rec(), "000000", "a@b.co", S, 500), "WRONG");
  assert.equal(evaluateAttempt(rec(), "123456", "other@b.co", S, 500), "WRONG");      // code is tied to the email
  assert.equal(evaluateAttempt(rec(), "123456", "a@b.co", S, 1_000_001), "EXPIRED");
  assert.equal(evaluateAttempt(rec({ attempts: OTP_MAX_ATTEMPTS }), "123456", "a@b.co", S, 500), "LOCKED"); // even the right code
  assert.equal(OTP_TTL_MS, 600_000);
});
