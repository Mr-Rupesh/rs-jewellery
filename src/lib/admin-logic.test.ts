import test from "node:test";
import assert from "node:assert/strict";
import { rupeesToPaise, parseGstBps, validateRates, NeedsConfirmation, canTransition, parseStatusChange, parseProductPatch, shouldChime, isStalePending, gramsToMg, percentToBps, parseProductInput, slugify, filterOrders, dayStats, ordersToCsv, parseBulk, validateReturn, parsePincodes, isServiceable, parseHighlights, parseSpecs, specsToText, parseLegal, splitBold, orderUpdateMessage, parseAdminEmails, adminSyncDecision } from "./admin-logic.ts";
import { ValidationError } from "./validate.ts";

test("rupeesToPaise exact and strict", () => {
  assert.equal(rupeesToPaise("11,900"), 1_190_000);
  assert.equal(rupeesToPaise("11900.5"), 1_190_050);
  assert.equal(rupeesToPaise("0.07"), 7);
  for (const bad of ["", "abc", "12.345", "-5", "1e5", "12 000x"]) assert.throws(() => rupeesToPaise(bad), ValidationError);
});

test("parseGstBps", () => {
  assert.equal(parseGstBps("3"), 300);
  assert.equal(parseGstBps("5.5"), 550);
  assert.throws(() => parseGstBps("29"), ValidationError);
  assert.throws(() => parseGstBps("-1"), ValidationError);
});

const prev = { r18: 975_000, r22: 1_190_000, r24: 1_300_000 };
test("validateRates: normal change ok, ordering and bounds enforced", () => {
  validateRates(prev, { r18: 980_000, r22: 1_200_000, r24: 1_310_000 }, false);
  assert.throws(() => validateRates(null, { r18: 1_300_000, r22: 1_190_000, r24: 975_000 }, false), ValidationError);
  assert.throws(() => validateRates(null, { r18: 5, r22: 6, r24: 7 }, false), ValidationError);
  assert.throws(() => validateRates(null, { r18: 1, r22: 20_000, r24: 30_000_000 }, false), ValidationError);
});
test("validateRates: >20% jump needs confirmation (typo guard)", () => {
  const dropped = { r18: 97_500, r22: 119_000, r24: 130_000 }; // a zero missing: within bounds, but -90%
  assert.throws(() => validateRates(prev, dropped, false), NeedsConfirmation);
  validateRates(prev, dropped, true);
  // an extra zero (x10) is blocked outright by the Rs 1,00,000/g upper limit
  assert.throws(() => validateRates(prev, { r18: 9_750_000, r22: 11_900_000, r24: 13_000_000 }, true), ValidationError);
});

test("status transitions", () => {
  assert.ok(canTransition("PAID", "SHIPPED"));
  assert.ok(canTransition("SHIPPED", "DELIVERED"));
  assert.ok(canTransition("PENDING", "CANCELLED"));
  assert.ok(!canTransition("PENDING", "PAID"));      // only the webhook may do this
  assert.ok(!canTransition("DELIVERED", "PAID"));
  assert.ok(!canTransition("CANCELLED", "SHIPPED"));
  assert.ok(!canTransition("nonsense", "PAID"));
  assert.throws(() => parseStatusChange({ status: "HACKED" }), ValidationError);
  assert.equal(parseStatusChange({ status: "SHIPPED", tracking: " AWB123 " }).tracking, "AWB123");
});

test("product patch validation", () => {
  assert.deepEqual(parseProductPatch({ active: false, stock: 4 }), { active: false, stock: 4 });
  assert.throws(() => parseProductPatch({}), ValidationError);
  assert.throws(() => parseProductPatch({ stock: -1 }), ValidationError);
  assert.throws(() => parseProductPatch({ stock: 1.5 }), ValidationError);
  assert.throws(() => parseProductPatch({ active: "yes" }), ValidationError);
});

test("shouldChime: only on transition to PAID after first load", () => {
  assert.equal(shouldChime("PENDING", "PAID", false), true);
  assert.equal(shouldChime(undefined, "PAID", false), true);
  assert.equal(shouldChime("PENDING", "PAID", true), false);
  assert.equal(shouldChime("PAID", "PAID", false), false);
  assert.equal(shouldChime("PAID", "SHIPPED", false), false);
  assert.equal(shouldChime(undefined, "PENDING", false), false);
});

test("isStalePending: only old PENDING orders", () => {
  const H = 3600 * 1000;
  assert.equal(isStalePending({ status: "PENDING", createdAt: 0 }, 49 * H), true);
  assert.equal(isStalePending({ status: "PENDING", createdAt: 0 }, 47 * H), false);
  assert.equal(isStalePending({ status: "PAID", createdAt: 0 }, 500 * H), false);
  assert.equal(isStalePending({ status: "CANCELLED", createdAt: 0 }, 500 * H), false);
});

test("gramsToMg and percentToBps", () => {
  assert.equal(gramsToMg("0.62"), 620); assert.equal(gramsToMg("1"), 1000); assert.equal(gramsToMg("12.345"), 12345);
  for (const bad of ["0", "0.000", "-1", "1.2345", "abc", ""]) assert.throws(() => gramsToMg(bad), ValidationError);
  assert.equal(percentToBps("12.5", 100), 1250); assert.equal(percentToBps("100", 100), 10000);
  assert.throws(() => percentToBps("101", 100), ValidationError); assert.throws(() => percentToBps("x", 100), ValidationError);
});

const goodProduct = { name: "Petal Ring", category: "Rings", description: "", purity: "22K", netWeightMg: 620, makingType: "PERCENT", makingValue: 1200, stonePaise: 0, fixedPricePaise: null, stock: 5, active: true, images: ["https://x.test/a.jpg"] };
test("parseProductInput accepts a good product and rejects bad ones", () => {
  assert.equal(parseProductInput(goodProduct).name, "Petal Ring");
  assert.equal(parseProductInput({ ...goodProduct, fixedPricePaise: 70000 }).fixedPricePaise, 70000);
  for (const bad of [{ name: "x" }, { purity: "14K" }, { netWeightMg: 0 }, { netWeightMg: 1.5 }, { stock: -1 }, { makingType: "X" }, { fixedPricePaise: 5 },
    { makingValue: 10001 }, { active: "yes" }, { images: ["javascript:alert(1)"] }, { images: new Array(6).fill("https://x.test/a.jpg") }])
    assert.throws(() => parseProductInput({ ...goodProduct, ...bad }), ValidationError);
  assert.equal(slugify("  Petal Ring (22K)! "), "petal-ring-22k");
});

const rows = [
  { id: "a1", status: "PAID", totalPaise: 10000, createdAt: 1000, paidAt: 2000, address: { name: "Asha", city: "Pune", phone: "9876543210" }, items: [{ name: "Petal Ring", qty: 1 }] },
  { id: "b2", status: "PENDING", totalPaise: 5000, createdAt: 3000, address: { name: "Ravi", city: "Latur" }, items: [{ name: "Chain", qty: 2 }] },
  { id: "c3", status: "DELIVERED", totalPaise: 7000, createdAt: 500, paidAt: 900, address: { name: "=cmd|x", city: "Pune" }, items: [] },
];
test("filterOrders: status, text, dates", () => {
  assert.deepEqual(filterOrders(rows, { status: "PAID" }).map((r) => r.id), ["a1"]);
  assert.deepEqual(filterOrders(rows, { q: "latur" }).map((r) => r.id), ["b2"]);
  assert.deepEqual(filterOrders(rows, { q: "petal" }).map((r) => r.id), ["a1"]);
  assert.deepEqual(filterOrders(rows, { fromMs: 1000, toMs: 2000 }).map((r) => r.id), ["a1"]);
  assert.equal(filterOrders(rows, { status: "ALL" }).length, 3);
});
test("dayStats counts only paid money from today", () => {
  const s = dayStats(rows, 1500);
  assert.equal(s.todayPaise, 10000); assert.equal(s.toFulfil, 1); assert.equal(s.awaitingPayment, 1);
});
test("ordersToCsv quotes, escapes and blocks formula cells", () => {
  const csv = ordersToCsv([{ ...rows[2]!, address: { name: 'Bad "name", =cmd', city: "=HYPERLINK(1)" } }, rows[0]!]);
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[1]!.includes('"Bad ""name"", =cmd"'));   // starts with B, not a formula, quotes doubled
  assert.ok(lines[1]!.includes("\"'=HYPERLINK(1)\""));    // formula cell neutralised
  assert.ok(lines[2]!.includes('"100.00"'));
});
test("parseBulk validates ids and status", () => {
  assert.deepEqual(parseBulk({ ids: ["a", "a", "b"], status: "SHIPPED" }), { ids: ["a", "b"], status: "SHIPPED" });
  assert.throws(() => parseBulk({ ids: [], status: "SHIPPED" }), ValidationError);
  assert.throws(() => parseBulk({ ids: new Array(51).fill("x"), status: "SHIPPED" }), ValidationError);
  assert.throws(() => parseBulk({ ids: ["a"], status: "NOPE" }), ValidationError);
});
test("validateReturn", () => {
  assert.equal(validateReturn({ type: "RETURN", reason: "The ring is too small for me" }), null);
  assert.ok(validateReturn({ type: "REFUND", reason: "long enough reason here" }));
  assert.ok(validateReturn({ type: "EXCHANGE", reason: "short" }));
  assert.ok(validateReturn({ type: "EXCHANGE", reason: "x".repeat(1001) }));
});

test("parsePincodes and isServiceable", () => {
  assert.deepEqual(parsePincodes("400002, 400001\n400003;400002"), ["400001", "400002", "400003"]);
  assert.deepEqual(parsePincodes("  "), []);
  for (const bad of ["12345", "0123456", "40000a", "400002 abc"]) assert.throws(() => parsePincodes(bad), ValidationError);
  assert.equal(isServiceable("400002", ["400001", "400002"]), true);
  assert.equal(isServiceable("411001", ["400001", "400002"]), false);
  assert.equal(isServiceable("411001", []), true); // empty list = deliver everywhere
  assert.equal(isServiceable(" 400001 ", ["400001"]), true);
});
test("highlights and specs parsing", () => {
  assert.deepEqual(parseHighlights("Light\n\n  Daily wear "), ["Light", "Daily wear"]);
  assert.throws(() => parseHighlights("a\nb\nc\nd\ne\nf\ng"), ValidationError);
  assert.deepEqual(parseSpecs("Brand: R S Jewellers\nOccasion: Daily: wear"), [{ label: "Brand", value: "R S Jewellers" }, { label: "Occasion", value: "Daily: wear" }]);
  for (const bad of ["no colon here", ": value only", "Label:", "x".repeat(41) + ": v"]) assert.throws(() => parseSpecs(bad), ValidationError);
  assert.equal(specsToText(parseSpecs("A: 1\nB: 2")), "A: 1\nB: 2");
  assert.equal(specsToText(undefined), "");
  assert.deepEqual(parseProductInput({ ...goodProduct, highlights: ["Light"], specs: [{ label: "Brand", value: "RS" }] }).specs, [{ label: "Brand", value: "RS" }]);
  assert.deepEqual(parseProductInput(goodProduct).highlights, []);
  assert.throws(() => parseProductInput({ ...goodProduct, specs: [{ label: "", value: "x" }] }), ValidationError);
});
test("parseLegal handles headings, lists, paragraphs, windows line endings", () => {
  const b = parseLegal("# Title\r\n\r\n**Last updated: x**\r\n\r\n## 1. One\r\n\r\nLine a\r\nLine b\r\n\r\n- x\r\n- y\r\n\r\n1. first\r\n2. second\r\n\r\nEnd");
  assert.deepEqual(b, [
    { type: "h1", text: "Title" }, { type: "p", text: "**Last updated: x**" }, { type: "h2", text: "1. One" }, { type: "p", text: "Line a Line b" },
    { type: "ul", items: ["x", "y"] }, { type: "ol", items: ["first", "second"] }, { type: "p", text: "End" },
  ]);
  assert.deepEqual(parseLegal(""), []);
});
test("splitBold", () => {
  assert.deepEqual(splitBold("a **b** c"), [{ text: "a ", bold: false }, { text: "b", bold: true }, { text: " c", bold: false }]);
  assert.deepEqual(splitBold("plain"), [{ text: "plain", bold: false }]);
});

test("orderUpdateMessage covers each status and never prints undefined", () => {
  const base = { name: "Asha", id: "abcdefgh12345" };
  assert.match(orderUpdateMessage({ ...base, status: "PAID" }), /payment is confirmed/);
  assert.match(orderUpdateMessage({ ...base, status: "SHIPPED", carrier: "DTDC", tracking: "X1" }), /via DTDC, tracking: X1/);
  assert.match(orderUpdateMessage({ ...base, status: "DELIVERED" }), /delivered/);
  assert.match(orderUpdateMessage({ ...base, status: "CANCELLED" }), /cancelled/);
  for (const st of ["PAID", "SHIPPED", "DELIVERED", "CANCELLED", "PENDING"]) assert.ok(!orderUpdateMessage({ id: "abcdefgh1", status: st }).includes("undefined"));
  assert.ok(orderUpdateMessage({ ...base, status: "PAID" }).includes("abcdefgh"));
});

test("parseAdminEmails", () => {
  assert.deepEqual(parseAdminEmails("Owner@Shop.com, second@x.in;\nowner@shop.com"), ["owner@shop.com", "second@x.in"]);
  assert.deepEqual(parseAdminEmails("not-an-email, ,"), []);
  assert.deepEqual(parseAdminEmails(undefined), []);
});
test("adminSyncDecision: grant, revoke and the safety rules", () => {
  const base = { isAdminNow: false, viaAllowlist: false, email: "owner@shop.com", emailVerified: true, allowlist: ["owner@shop.com"] };
  assert.equal(adminSyncDecision(base), "GRANT");
  assert.equal(adminSyncDecision({ ...base, email: "OWNER@Shop.com " }), "GRANT");                    // case-insensitive
  assert.equal(adminSyncDecision({ ...base, emailVerified: false }), "NOOP");                         // unverified email never promoted
  assert.equal(adminSyncDecision({ ...base, email: "other@x.com" }), "NOOP");                         // not listed
  assert.equal(adminSyncDecision({ ...base, email: null }), "NOOP");
  assert.equal(adminSyncDecision({ ...base, isAdminNow: true, viaAllowlist: true }), "NOOP");         // already admin and still listed
  assert.equal(adminSyncDecision({ ...base, email: "gone@x.com", isAdminNow: true, viaAllowlist: true }), "REVOKE"); // removed from the list
  assert.equal(adminSyncDecision({ ...base, email: "gone@x.com", isAdminNow: true, viaAllowlist: false }), "NOOP");  // set by script: left alone
  assert.equal(adminSyncDecision({ ...base, allowlist: [] }), "NOOP");                                // empty list: never lock anyone out
  assert.equal(adminSyncDecision({ ...base, allowlist: [], isAdminNow: true, viaAllowlist: true }), "NOOP");
});
