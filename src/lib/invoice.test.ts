import test from "node:test";
import assert from "node:assert/strict";
import { financialYear, formatInvoiceNo, gstSplit } from "./invoice.ts";

test("financial year boundaries are decided in IST", () => {
  assert.equal(financialYear(Date.parse("2026-03-31T12:00:00+05:30")), "2526");
  assert.equal(financialYear(Date.parse("2026-04-01T00:30:00+05:30")), "2627");
  assert.equal(financialYear(Date.parse("2026-03-31T19:00:00Z")), "2627"); // already 1 Apr in IST
  assert.equal(financialYear(Date.parse("2026-10-24T10:00:00Z")), "2627");
  assert.equal(financialYear(Date.parse("2026-01-15T10:00:00Z")), "2526");
  assert.equal(financialYear(Date.parse("2099-12-31T10:00:00Z")), "9900");
});
test("invoice number format", () => {
  assert.equal(formatInvoiceNo("2627", 1), "RS/2627/000001");
  assert.equal(formatInvoiceNo("2627", 123456), "RS/2627/123456");
});
test("gst split: intra-state halves sum exactly (odd paise), inter-state IGST, unknown seller state", () => {
  const a = gstSplit(63_001, "Maharashtra", " maharashtra ");
  assert.deepEqual(a, { type: "INTRA", cgstPaise: 31_500, sgstPaise: 31_501 });
  assert.deepEqual(gstSplit(300, "Maharashtra", "Karnataka"), { type: "INTER", igstPaise: 300 });
  assert.deepEqual(gstSplit(300, "", ""), { type: "INTER", igstPaise: 300 });
});
