import test from "node:test";
import assert from "node:assert/strict";
import { parseAddress, parseItems, parseCheckout, ValidationError, isValidEmail, safeNextPath } from "./validate.ts";

const addr = { name: "Asha Patil", phone: "9876543210", line1: "12 MG Road", line2: "", city: "Pune", state: "Maharashtra", pincode: "411001" };

test("valid address passes and is trimmed", () => {
  assert.equal(parseAddress({ ...addr, name: "  Asha Patil " }).name, "Asha Patil");
});
test("bad phone / pincode rejected", () => {
  assert.throws(() => parseAddress({ ...addr, phone: "1234567890" }), ValidationError);
  assert.throws(() => parseAddress({ ...addr, pincode: "011001" }), ValidationError);
  assert.throws(() => parseAddress({ ...addr, pincode: "41100" }), ValidationError);
});
test("items: bounds and types", () => {
  assert.throws(() => parseItems([]), ValidationError);
  assert.throws(() => parseItems([{ productId: "a", qty: 0 }]), ValidationError);
  assert.throws(() => parseItems([{ productId: "a", qty: 1.5 }]), ValidationError);
  assert.throws(() => parseItems([{ productId: "a", qty: "2" }]), ValidationError);
  assert.deepEqual(parseItems([{ productId: "a", qty: 2 }]), [{ productId: "a", qty: 2 }]);
});
test("checkout: expectedTotalPaise optional but validated", () => {
  const ok = parseCheckout({ items: [{ productId: "a", qty: 1 }], address: addr });
  assert.equal(ok.expectedTotalPaise, undefined);
  assert.throws(() => parseCheckout({ items: [{ productId: "a", qty: 1 }], address: addr, expectedTotalPaise: -5 }), ValidationError);
});

test("isValidEmail", () => {
  for (const ok of ["a@b.co", "asha.patil+shop@gmail.com", " x@y.in "]) assert.equal(isValidEmail(ok), true);
  for (const bad of ["", "abc", "a@b", "a b@c.com", "@x.com", "a@.com", "a@b.c", "x".repeat(250) + "@a.com"]) assert.equal(isValidEmail(bad), false);
});
test("safeNextPath only allows same-site paths", () => {
  assert.equal(safeNextPath("/checkout"), "/checkout");
  assert.equal(safeNextPath("/orders/abc?x=1"), "/orders/abc?x=1");
  for (const bad of [null, undefined, "", "checkout", "//evil.com", "https://evil.com", "/\\evil.com"]) assert.equal(safeNextPath(bad as string), "/");
});
