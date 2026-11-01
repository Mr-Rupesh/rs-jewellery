import { adminDb } from "./firebase-admin";
import { priceUnit, MAX_QTY_PER_LINE, type CartInput } from "../lib/pricing.ts";
import type { PricingSettings, Product, QuoteLine } from "../types/index.ts";
import { LEGAL_DEFAULTS, type LegalKey } from "../lib/legal-defaults.ts";

export async function getSettings(): Promise<PricingSettings> {
  const snap = await adminDb().doc("settings/pricing").get();
  if (!snap.exists) throw new Error("Gold rates are not set yet. Run `npm run seed` or set them in admin.");
  return snap.data() as PricingSettings;
}

const toProduct = (id: string, d: FirebaseFirestore.DocumentData): Product => ({ ...(d as Omit<Product, "id">), id });

export async function listActiveProducts(): Promise<Product[]> {
  const snap = await adminDb().collection("products").where("active", "==", true).get();
  return snap.docs.map((d) => toProduct(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getProduct(id: string): Promise<Product | null> {
  const snap = await adminDb().collection("products").doc(id).get();
  return snap.exists ? toProduct(snap.id, snap.data()!) : null;
}

export async function getProductsByIds(ids: string[]): Promise<Map<string, Product>> {
  const unique = [...new Set(ids)];
  const out = new Map<string, Product>();
  if (unique.length === 0) return out;
  const db = adminDb();
  const snaps = await db.getAll(...unique.map((id) => db.collection("products").doc(id)));
  for (const s of snaps) if (s.exists) out.set(s.id, toProduct(s.id, s.data()!));
  return out;
}

/** Display-oriented pricing: never throws per line, reports errors instead. */
export async function quoteItems(items: CartInput[]) {
  const settings = await getSettings();
  const products = await getProductsByIds(items.map((i) => i.productId));
  const lines: QuoteLine[] = items.map((i) => {
    const p = products.get(i.productId);
    if (!p || !p.active) return { productId: i.productId, qty: i.qty, name: "Unavailable item", error: "No longer available" };
    const base = { productId: p.id, qty: i.qty, name: p.name, purity: p.purity, netWeightMg: p.netWeightMg };
    if (i.qty > MAX_QTY_PER_LINE) return { ...base, error: `Maximum ${MAX_QTY_PER_LINE} per order` };
    if (p.stock < i.qty) return { ...base, error: p.stock > 0 ? `Only ${p.stock} left` : "Out of stock" };
    try {
      const unit = priceUnit(p, settings);
      return { ...base, unit, lineTotalPaise: unit.totalPaise * i.qty };
    } catch (e) {
      return { ...base, error: e instanceof Error ? e.message : "Price unavailable" };
    }
  });
  const ok = lines.every((l) => !l.error);
  const totalPaise = lines.reduce((a, l) => a + (l.lineTotalPaise ?? 0), 0);
  return { lines, ok, totalPaise };
}

/** Serviceable PIN codes. Empty list = deliver everywhere. */
export async function getServicePins(): Promise<string[]> {
  const d = (await adminDb().doc("settings/service").get()).data();
  return Array.isArray(d?.pincodes) ? (d!.pincodes as unknown[]).filter((x): x is string => typeof x === "string") : [];
}

/** Policy text saved by the admin, or the built-in default. */
export async function getLegalText(key: LegalKey): Promise<string> {
  try {
    const t = (await adminDb().doc("settings/legal").get()).data()?.[key];
    return typeof t === "string" && t.trim() ? t : LEGAL_DEFAULTS[key];
  } catch { return LEGAL_DEFAULTS[key]; }
}
