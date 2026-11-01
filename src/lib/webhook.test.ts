import test from "node:test";
import assert from "node:assert/strict";
import { verifySignature, sign, decidePaid, takeStock, extractCaptured, pickPayment } from "./webhook.ts";

const body = JSON.stringify({ event: "payment.captured" });

test("signature: valid, tampered, wrong secret, missing", () => {
  const sig = sign(body, "s3cret");
  assert.equal(verifySignature(body, sig, "s3cret"), true);
  assert.equal(verifySignature(body + " ", sig, "s3cret"), false);
  assert.equal(verifySignature(body, sig, "other"), false);
  assert.equal(verifySignature(body, null, "s3cret"), false);
  assert.equal(verifySignature(body, "short", "s3cret"), false);
  assert.equal(verifySignature(body, sig, ""), false);
});

const order = { status: "PENDING", totalPaise: 679_800, razorpayOrderId: "order_1" };
const pay = { paymentId: "pay_1", razorpayOrderId: "order_1", amountPaise: 679_800, currency: "INR" };

test("decidePaid covers pending, replay, cancelled, mismatches", () => {
  assert.equal(decidePaid(order, pay), "MARK_PAID");
  assert.equal(decidePaid({ ...order, status: "PAID" }, pay), "NOOP");
  assert.equal(decidePaid({ ...order, status: "SHIPPED" }, pay), "NOOP");
  assert.equal(decidePaid({ ...order, status: "CANCELLED" }, pay), "REVIEW");
  assert.equal(decidePaid(order, { ...pay, amountPaise: 100 }), "MISMATCH");
  assert.equal(decidePaid(order, { ...pay, razorpayOrderId: "order_x" }), "MISMATCH");
  assert.equal(decidePaid(order, { ...pay, currency: "USD" }), "MISMATCH");
  assert.equal(decidePaid({ ...order, razorpayOrderId: null }, pay), "MISMATCH");
});

test("takeStock never goes negative and flags shortfall", () => {
  assert.deepEqual(takeStock(5, 2), { newStock: 3, shortfall: false });
  assert.deepEqual(takeStock(2, 2), { newStock: 0, shortfall: false });
  assert.deepEqual(takeStock(1, 2), { newStock: 0, shortfall: true });
});

test("extractCaptured only accepts well-formed payment.captured", () => {
  const ev = { event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 5, currency: "INR", notes: { orderId: "abc" } } } } };
  assert.equal(extractCaptured(ev)?.ourOrderId, "abc");
  assert.equal(extractCaptured({ ...ev, event: "payment.failed" }), null);
  assert.equal(extractCaptured({ event: "payment.captured", payload: {} }), null);
  assert.equal(extractCaptured(null), null);
});

test("pickPayment only accepts a matching, successful payment", () => {
  const p = (o: object) => ({ id: "pay_1", status: "captured", amount: 100, currency: "INR", order_id: "order_1", ...o });
  assert.deepEqual(pickPayment([p({})], "order_1", 100), { id: "pay_1", status: "captured" });
  assert.deepEqual(pickPayment([p({ status: "authorized" })], "order_1", 100), { id: "pay_1", status: "authorized" });
  assert.deepEqual(pickPayment([p({ id: "a", status: "authorized" }), p({ id: "c" })], "order_1", 100), { id: "c", status: "captured" }); // captured wins
  for (const bad of [{ status: "failed" }, { status: "created" }, { amount: 99 }, { currency: "USD" }, { order_id: "order_x" }]) assert.equal(pickPayment([p(bad)], "order_1", 100), null);
  assert.equal(pickPayment([], "order_1", 100), null);
});
