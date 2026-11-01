import test from "node:test";
import assert from "node:assert/strict";
import { pendingHint } from "./payment-hint.ts";

test("pendingHint explains each reason and tolerates empty replies", () => {
  assert.match(pendingHint({ reason: "KEYS_MISSING" }), /RAZORPAY_KEY_ID/);
  assert.match(pendingHint({ reason: "NO_PAYMENT" }), /no payment for this order yet/);
  assert.match(pendingHint({ reason: "NO_PAYMENT", seen: ["failed ₹1", "created ₹1"] }), /failed ₹1, created ₹1/);
  assert.match(pendingHint({ reason: "ERROR", detail: "Authentication failed" }), /Authentication failed/);
  assert.equal(pendingHint({ error: "Too many requests." }), "Too many requests.");
  assert.equal(pendingHint(null), "");
  assert.equal(pendingHint({}), "");
});
