import test from "node:test";
import assert from "node:assert/strict";
import { validateInquiry, extFor } from "./inquiry.ts";

const ok = { name: "Asha", phone: "9876543210", description: "A small leaf pendant in 22K", files: [{ type: "image/png", size: 1000 }] };
test("valid inquiry passes", () => assert.equal(validateInquiry(ok), null));
test("rejects bad name, short/long description", () => {
  assert.ok(validateInquiry({ ...ok, name: " " }));
  for (const bad of ["", "12345", "1234567890", "98765 43210"]) assert.ok(validateInquiry({ ...ok, phone: bad }));
  assert.ok(validateInquiry({ ...ok, description: "short" }));
  assert.ok(validateInquiry({ ...ok, description: "x".repeat(2001) }));
  assert.equal(validateInquiry({ ...ok, description: "x".repeat(2000) }), null);
});
test("rejects too many, wrong type, oversize images", () => {
  const f = { type: "image/jpeg", size: 10 };
  assert.ok(validateInquiry({ ...ok, files: [f, f, f, f] }));
  assert.ok(validateInquiry({ ...ok, files: [{ type: "application/pdf", size: 10 }] }));
  assert.ok(validateInquiry({ ...ok, files: [{ type: "image/jpeg", size: 5 * 1024 * 1024 }] }));
  assert.equal(validateInquiry({ ...ok, files: [{ type: "image/jpeg", size: 5 * 1024 * 1024 - 1 }] }), null);
  assert.equal(validateInquiry({ ...ok, files: [] }), null);
});
test("extFor", () => { assert.equal(extFor("image/png"), "png"); assert.equal(extFor("image/webp"), "webp"); assert.equal(extFor("image/jpeg"), "jpg"); });
