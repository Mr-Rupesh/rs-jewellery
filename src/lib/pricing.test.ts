import test from "node:test";
import assert from "node:assert/strict";
import { priceUnit, priceCart } from "./pricing.ts";
import type { PricingSettings, Product } from "../types/index.ts";

const settings: PricingSettings = {
  rate18kPaisePerGram: 1_000_000, rate22kPaisePerGram: 1_200_000, rate24kPaisePerGram: 1_300_000,
  gstBps: 300, updatedAt: 0, updatedBy: "t",
};
const base: Product = {
  id: "a", name: "Ring", slug: "ring", category: "Rings", purity: "22K",
  netWeightMg: 500, makingType: "PERCENT", makingValue: 1000, stonePaise: 0,
  fixedPricePaise: null, images: [], stock: 5, active: true,
};

test("live price: 0.5g 22K, 10% making, 3% GST", () => {
  const r = priceUnit(base, settings);
  assert.equal(r.metalPaise, 600_000);
  assert.equal(r.makingPaise, 60_000);
  assert.equal(r.subtotalPaise, 660_000);
  assert.equal(r.gstPaise, 19_800);
  assert.equal(r.totalPaise, 679_800);
});

test("flat making + stone", () => {
  const r = priceUnit({ ...base, makingType: "FLAT", makingValue: 50_000, stonePaise: 10_000 }, settings);
  assert.equal(r.subtotalPaise, 660_000);
});

test("fixed override ignores rate and weight", () => {
  const r = priceUnit({ ...base, fixedPricePaise: 500_000 }, settings);
  assert.equal(r.mode, "FIXED");
  assert.equal(r.totalPaise, 515_000);
});

test("odd rate and weight still yield integer paise", () => {
  const r = priceUnit({ ...base, netWeightMg: 333 }, { ...settings, rate22kPaisePerGram: 1_234_567 });
  assert.ok(Number.isInteger(r.totalPaise));
});

test("unset rate is rejected", () => {
  assert.throws(() => priceUnit(base, { ...settings, rate22kPaisePerGram: 0 }));
});

test("cart rejects stock, inactive, duplicates, bad qty", () => {
  const m = new Map([["a", base]]);
  assert.throws(() => priceCart([{ productId: "a", qty: 6 }], m, settings), /stock/);
  assert.throws(() => priceCart([{ productId: "a", qty: 0 }], m, settings), /quantity/);
  assert.throws(() => priceCart([{ productId: "a", qty: 1 }, { productId: "a", qty: 1 }], m, settings), /Duplicate/);
  assert.throws(() => priceCart([{ productId: "a", qty: 1 }], new Map([["a", { ...base, active: false }]]), settings), /unavailable/);
  assert.equal(priceCart([{ productId: "a", qty: 2 }], m, settings).totalPaise, 679_800 * 2);
});
