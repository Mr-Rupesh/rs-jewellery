import type { LinePrice, PricingSettings, Product, Purity } from "../types/index.ts";

export const MAX_QTY_PER_LINE = 10;

export function rateFor(purity: Purity, s: PricingSettings): number {
  switch (purity) {
    case "18K": return s.rate18kPaisePerGram;
    case "22K": return s.rate22kPaisePerGram;
    case "24K": return s.rate24kPaisePerGram;
  }
}

function assertInt(name: string, v: number) {
  if (!Number.isInteger(v) || v < 0) throw new Error(`${name} must be a non-negative integer, got ${v}`);
}

/** Price ONE unit of a product. Pure function; server-side only for checkout. */
export function priceUnit(p: Product, s: PricingSettings): LinePrice {
  assertInt("gstBps", s.gstBps);
  let result: Omit<LinePrice, "gstPaise" | "totalPaise">;

  if (p.fixedPricePaise !== null) {
    assertInt("fixedPricePaise", p.fixedPricePaise);
    result = {
      mode: "FIXED", ratePaisePerGram: null,
      metalPaise: 0, makingPaise: 0, stonePaise: 0,
      subtotalPaise: p.fixedPricePaise,
    };
  } else {
    assertInt("netWeightMg", p.netWeightMg);
    assertInt("makingValue", p.makingValue);
    assertInt("stonePaise", p.stonePaise);
    const rate = rateFor(p.purity, s);
    assertInt("rate", rate);
    if (rate === 0) throw new Error(`Gold rate for ${p.purity} is not set`);
    const metalPaise = Math.round((p.netWeightMg * rate) / 1000);
    const makingPaise = p.makingType === "PERCENT"
      ? Math.round((metalPaise * p.makingValue) / 10000)
      : p.makingValue;
    result = {
      mode: "LIVE", ratePaisePerGram: rate,
      metalPaise, makingPaise, stonePaise: p.stonePaise,
      subtotalPaise: metalPaise + makingPaise + p.stonePaise,
    };
  }
  const gstPaise = Math.round((result.subtotalPaise * s.gstBps) / 10000);
  return { ...result, gstPaise, totalPaise: result.subtotalPaise + gstPaise };
}

export interface CartInput { productId: string; qty: number }
export interface PricedLine { productId: string; qty: number; unit: LinePrice; lineTotalPaise: number }

/** Price a cart. Rejects inactive, out-of-stock, or bad quantities. */
export function priceCart(
  cart: CartInput[], products: Map<string, Product>, s: PricingSettings,
): { lines: PricedLine[]; totalPaise: number; gstPaise: number } {
  if (cart.length === 0) throw new Error("Cart is empty");
  const seen = new Set<string>();
  const lines: PricedLine[] = [];
  for (const { productId, qty } of cart) {
    if (seen.has(productId)) throw new Error(`Duplicate product ${productId}`);
    seen.add(productId);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) throw new Error(`Invalid quantity for ${productId}`);
    const p = products.get(productId);
    if (!p || !p.active) throw new Error(`Product ${productId} unavailable`);
    if (p.stock < qty) throw new Error(`Insufficient stock for ${p.name}`);
    const unit = priceUnit(p, s);
    lines.push({ productId, qty, unit, lineTotalPaise: unit.totalPaise * qty });
  }
  return {
    lines,
    totalPaise: lines.reduce((a, l) => a + l.lineTotalPaise, 0),
    gstPaise: lines.reduce((a, l) => a + l.unit.gstPaise * l.qty, 0),
  };
}

export const formatINR = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

export const formatGrams = (mg: number) => `${(mg / 1000).toFixed(3)} g`;
