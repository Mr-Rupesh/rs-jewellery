import { ValidationError } from "./validate.ts";

export class NeedsConfirmation extends Error {}

/** "12,345.50" -> 1234550 paise. Strict: digits, optional 1-2 decimals. */
export function rupeesToPaise(input: string, field = "Amount"): number {
  const t = String(input).trim().replace(/,/g, "");
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(t)) throw new ValidationError(`${field} must be a number with up to 2 decimals`);
  const [w, f = ""] = t.split(".");
  return Number(w) * 100 + Number(f.padEnd(2, "0"));
}

/** "3" or "3.00" -> 300 basis points. Max 28%. */
export function parseGstBps(input: string): number {
  const t = String(input).trim();
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) throw new ValidationError("GST % must be a number like 3 or 5.5");
  const [w, f = ""] = t.split(".");
  const bps = Number(w) * 100 + Number(f.padEnd(2, "0"));
  if (bps > 2800) throw new ValidationError("GST % cannot be more than 28");
  return bps;
}

export interface RateSet { r18: number; r22: number; r24: number }
const MIN_RATE = 10_000;      // Rs 100 / g
const MAX_RATE = 10_000_000;  // Rs 1,00,000 / g

export function validateRates(prev: RateSet | null, next: RateSet, confirmLargeChange: boolean): void {
  for (const [k, v] of Object.entries(next)) {
    if (v < MIN_RATE || v > MAX_RATE) throw new ValidationError(`${k.slice(1)}K rate looks wrong (must be Rs 100 to Rs 1,00,000 per gram)`);
  }
  if (!(next.r24 > next.r22 && next.r22 > next.r18)) throw new ValidationError("Rates must satisfy 24K > 22K > 18K");
  if (prev && !confirmLargeChange) {
    for (const k of ["r18", "r22", "r24"] as const) {
      if (prev[k] > 0 && Math.abs(next[k] - prev[k]) / prev[k] > 0.2)
        throw new NeedsConfirmation(`${k.slice(1)}K rate changed by more than 20%. Check for a typo, then confirm.`);
    }
  }
}

export type Status = "PENDING" | "PAID" | "SHIPPED" | "DELIVERED" | "CANCELLED";
const NEXT: Record<Status, Status[]> = {
  PENDING: ["CANCELLED"], PAID: ["SHIPPED", "CANCELLED"], SHIPPED: ["DELIVERED"], DELIVERED: [], CANCELLED: [],
};
export const canTransition = (from: string, to: string): boolean => (NEXT[from as Status] ?? []).includes(to as Status);

export function parseStatusChange(raw: unknown): { status: Status; tracking: string; carrier: string } {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (typeof o.status !== "string" || !(o.status in NEXT)) throw new ValidationError("Invalid status");
  const tracking = typeof o.tracking === "string" ? o.tracking.trim() : "";
  if (tracking.length > 100) throw new ValidationError("Tracking note is too long");
  const carrier = typeof o.carrier === "string" ? o.carrier.trim() : "";
  if (carrier.length > 60) throw new ValidationError("Carrier name is too long");
  return { status: o.status as Status, tracking, carrier };
}

export function parseProductPatch(raw: unknown): { active?: boolean; stock?: number } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const out: { active?: boolean; stock?: number } = {};
  if (o.active !== undefined) {
    if (typeof o.active !== "boolean") throw new ValidationError("active must be true or false");
    out.active = o.active;
  }
  if (o.stock !== undefined) {
    if (typeof o.stock !== "number" || !Number.isInteger(o.stock) || o.stock < 0 || o.stock > 100_000)
      throw new ValidationError("Stock must be a whole number 0-100000");
    out.stock = o.stock;
  }
  if (Object.keys(out).length === 0) throw new ValidationError("Nothing to update");
  return out;
}

/** Chime only when an order BECOMES paid after the first snapshot. */
export const shouldChime = (prev: string | undefined, next: string, initialLoad: boolean): boolean =>
  !initialLoad && next === "PAID" && prev !== "PAID";

/** An unpaid order the customer walked away from. Cancelling it never touches stock (stock is taken only on payment). */
export const isStalePending = (o: { status: string; createdAt: number }, now: number, hours = 48): boolean =>
  o.status === "PENDING" && now - o.createdAt > hours * 3600 * 1000;

// ---------- Product management ----------
const intIn = (v: unknown, field: string, min: number, max: number): number => {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw new ValidationError(`${field} must be a whole number from ${min} to ${max}`);
  return v;
};
const text = (v: unknown, field: string, min: number, max: number): string => {
  const t = typeof v === "string" ? v.trim() : "";
  if (t.length < min || t.length > max) throw new ValidationError(`${field} must be ${min}-${max} characters`);
  return t;
};

/** "0.62" grams -> 620 mg. */
export function gramsToMg(input: string, field = "Weight"): number {
  const t = String(input).trim();
  if (!/^\d{1,4}(\.\d{1,3})?$/.test(t)) throw new ValidationError(`${field} must be in grams, up to 3 decimals`);
  const [w, f = ""] = t.split(".");
  const mg = Number(w) * 1000 + Number(f.padEnd(3, "0"));
  if (mg < 1) throw new ValidationError(`${field} must be more than 0`);
  return mg;
}

/** "12.5" percent -> 1250 basis points, capped at maxPercent. */
export function percentToBps(input: string, maxPercent: number, field = "Percent"): number {
  const t = String(input).trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) throw new ValidationError(`${field} must be a number like 12 or 12.5`);
  const [w, f = ""] = t.split(".");
  const bps = Number(w) * 100 + Number(f.padEnd(2, "0"));
  if (bps > maxPercent * 100) throw new ValidationError(`${field} cannot be more than ${maxPercent}%`);
  return bps;
}

export interface ProductInput {
  name: string; category: string; description: string; purity: "18K" | "22K" | "24K";
  netWeightMg: number; makingType: "PERCENT" | "FLAT"; makingValue: number; stonePaise: number;
  fixedPricePaise: number | null; stock: number; active: boolean; images: string[];
  highlights: string[]; specs: { label: string; value: string }[];
}

export function parseProductInput(raw: unknown): ProductInput {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (!["18K", "22K", "24K"].includes(o.purity as string)) throw new ValidationError("Purity must be 18K, 22K or 24K");
  if (o.makingType !== "PERCENT" && o.makingType !== "FLAT") throw new ValidationError("Making charge type is invalid");
  const images = o.images === undefined ? [] : o.images;
  if (!Array.isArray(images) || images.length > 5 || images.some((u) => typeof u !== "string" || !/^https?:\/\//.test(u) || u.length > 1500))
    throw new ValidationError("Images must be up to 5 uploaded image links");
  if (typeof o.active !== "boolean") throw new ValidationError("active must be true or false");
  const hl = o.highlights === undefined ? [] : o.highlights;
  if (!Array.isArray(hl) || hl.length > 6 || hl.some((h) => typeof h !== "string" || h.trim().length < 1 || h.length > 120)) throw new ValidationError("Highlights: up to 6 lines of 120 characters");
  const sp = o.specs === undefined ? [] : o.specs;
  if (!Array.isArray(sp) || sp.length > 10 || sp.some((x) => typeof x?.label !== "string" || typeof x?.value !== "string" || x.label.trim().length < 1 || x.label.length > 40 || x.value.trim().length < 1 || x.value.length > 120))
    throw new ValidationError("Specifications: up to 10 rows, each as Label: value");
  const description = o.description === undefined || o.description === "" ? "" : text(o.description, "Description", 0, 1000);
  return {
    name: text(o.name, "Name", 2, 100), category: text(o.category, "Category", 2, 40), description,
    purity: o.purity as ProductInput["purity"],
    netWeightMg: intIn(o.netWeightMg, "Weight", 1, 1_000_000),
    makingType: o.makingType,
    makingValue: intIn(o.makingValue, "Making charge", 0, o.makingType === "PERCENT" ? 10_000 : 100_000_000),
    stonePaise: intIn(o.stonePaise, "Stone charge", 0, 1_000_000_000),
    fixedPricePaise: o.fixedPricePaise === null || o.fixedPricePaise === undefined ? null : intIn(o.fixedPricePaise, "Fixed price", 100, 1_000_000_000),
    stock: intIn(o.stock, "Stock", 0, 100_000), active: o.active, images: images as string[],
    highlights: (hl as string[]).map((h) => h.trim()), specs: (sp as { label: string; value: string }[]).map((x) => ({ label: x.label.trim(), value: x.value.trim() })),
  };
}

export const slugify = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "product";

// ---------- Orders: search, stats, CSV, bulk ----------
export interface OrderRow {
  id: string; status: string; totalPaise: number; gstPaise?: number; createdAt: number; paidAt?: number;
  invoiceNo?: string; tracking?: string; carrier?: string; phone?: string | null;
  address?: { name?: string; phone?: string; city?: string };
  items?: { name: string; qty: number }[];
}

export function filterOrders<T extends OrderRow>(rows: T[], f: { q?: string; status?: string; fromMs?: number; toMs?: number }): T[] {
  const q = (f.q ?? "").trim().toLowerCase();
  return rows.filter((o) => {
    if (f.status && f.status !== "ALL" && o.status !== f.status) return false;
    if (f.fromMs !== undefined && o.createdAt < f.fromMs) return false;
    if (f.toMs !== undefined && o.createdAt > f.toMs) return false;
    if (!q) return true;
    const hay = [o.id, o.invoiceNo, o.address?.name, o.address?.phone, o.address?.city, o.phone, ...(o.items ?? []).map((i) => i.name)]
      .filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  });
}

const PAID_STATES = ["PAID", "SHIPPED", "DELIVERED"];
export function dayStats(rows: OrderRow[], startOfDayMs: number) {
  return {
    todayPaise: rows.filter((o) => PAID_STATES.includes(o.status) && (o.paidAt ?? o.createdAt) >= startOfDayMs).reduce((a, o) => a + o.totalPaise, 0),
    toFulfil: rows.filter((o) => o.status === "PAID").length,
    awaitingPayment: rows.filter((o) => o.status === "PENDING").length,
  };
}

/** CSV with quoting, and a guard so spreadsheet apps never run a cell as a formula. */
export function ordersToCsv(rows: OrderRow[]): string {
  const guard = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
  const cell = (v: unknown) => `"${guard(String(v ?? "")).replace(/"/g, '""')}"`;
  const rupees = (p: number | undefined) => ((p ?? 0) / 100).toFixed(2);
  const head = ["Order ID", "Date (UTC)", "Customer", "Phone", "City", "Items", "Total (INR)", "GST (INR)", "Status", "Invoice", "Carrier", "Tracking"];
  const lines = rows.map((o) => [
    o.id, new Date(o.createdAt).toISOString().slice(0, 19).replace("T", " "), o.address?.name, o.address?.phone ?? o.phone, o.address?.city,
    (o.items ?? []).map((i) => `${i.name} x${i.qty}`).join("; "), rupees(o.totalPaise), rupees(o.gstPaise), o.status, o.invoiceNo, o.carrier, o.tracking,
  ].map(cell).join(","));
  return [head.map(cell).join(","), ...lines].join("\r\n");
}

export function parseBulk(raw: unknown): { ids: string[]; status: Status } {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (!Array.isArray(o.ids) || o.ids.length < 1 || o.ids.length > 50 || o.ids.some((i) => typeof i !== "string" || i.length < 1 || i.length > 100))
    throw new ValidationError("Choose 1-50 orders");
  return { ids: [...new Set(o.ids as string[])], status: parseStatusChange({ status: o.status }).status };
}

// ---------- Returns ----------
export function validateReturn(i: { type: string; reason: string }): string | null {
  if (i.type !== "RETURN" && i.type !== "EXCHANGE") return "Choose return or exchange.";
  const r = i.reason.trim();
  if (r.length < 10) return "Please explain the reason in at least 10 characters.";
  if (r.length > 1000) return "Reason is too long (maximum 1000 characters).";
  return null;
}
export const RETURN_NEXT: Record<string, string[]> = { REQUESTED: ["APPROVED", "REJECTED"], APPROVED: ["COMPLETED"], REJECTED: [], COMPLETED: [] };

// ---------- Serviceable PIN codes ----------
/** "400002, 400001\n400003" -> sorted unique list. Throws on anything that is not a 6-digit PIN. */
export function parsePincodes(text: string): string[] {
  const parts = String(text).split(/[\s,;]+/).filter(Boolean);
  for (const p of parts) if (!/^[1-9]\d{5}$/.test(p)) throw new ValidationError(`"${p.slice(0, 12)}" is not a valid 6-digit PIN code`);
  const list = [...new Set(parts)].sort();
  if (list.length > 500) throw new ValidationError("Too many PIN codes (maximum 500)");
  return list;
}
/** An empty list means "deliver everywhere". */
export const isServiceable = (pin: string, list: string[]): boolean => list.length === 0 || list.includes(String(pin).trim());

// ---------- Product details (highlights + specifications) ----------
export function parseHighlights(text: string): string[] {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 6) throw new ValidationError("Highlights: at most 6 lines");
  if (lines.some((l) => l.length > 120)) throw new ValidationError("Each highlight must be 120 characters or fewer");
  return lines;
}
export function parseSpecs(text: string): { label: string; value: string }[] {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 10) throw new ValidationError("Specifications: at most 10 lines");
  return lines.map((l) => {
    const i = l.indexOf(":");
    const label = i > 0 ? l.slice(0, i).trim() : "", value = i > 0 ? l.slice(i + 1).trim() : "";
    if (!label || !value || label.length > 40 || value.length > 120) throw new ValidationError(`Specification "${l.slice(0, 30)}" must look like Label: value`);
    return { label, value };
  });
}
export const specsToText = (s: { label: string; value: string }[] | undefined): string => (s ?? []).map((x) => `${x.label}: ${x.value}`).join("\n");

// ---------- Editable policy pages ----------
export type LegalBlock =
  | { type: "h1"; text: string } | { type: "h2"; text: string } | { type: "p"; text: string }
  | { type: "ul"; items: string[] } | { type: "ol"; items: string[] };

/** Tiny markdown subset: "# ", "## ", "- " bullets, "1. " numbered lists, **bold**, blank-line paragraphs. */
export function parseLegal(text: string): LegalBlock[] {
  const out: LegalBlock[] = [];
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (para.length) { out.push({ type: "p", text: para.join(" ") }); para = []; }
    if (list) { out.push(list); list = null; }
  };
  for (const raw of String(text).replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    let m: RegExpMatchArray | null;
    if (!line) flush();
    else if ((m = line.match(/^(#{1,2})\s+(.*)$/))) { flush(); out.push({ type: m[1] === "#" ? "h1" : "h2", text: m[2]! }); }
    else if ((m = line.match(/^[-*]\s+(.*)$/))) { if (para.length || list?.type === "ol") flush(); list ??= { type: "ul", items: [] }; list.items.push(m[1]!); }
    else if ((m = line.match(/^\d+\.\s+(.*)$/))) { if (para.length || list?.type === "ul") flush(); list ??= { type: "ol", items: [] }; list.items.push(m[1]!); }
    else { if (list) flush(); para.push(line); }
  }
  flush();
  return out;
}

export function splitBold(s: string): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  let last = 0;
  for (const m of s.matchAll(/\*\*(.+?)\*\*/g)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: s.slice(last, at), bold: false });
    out.push({ text: m[1]!, bold: true });
    last = at + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), bold: false });
  return out;
}

/** Text the admin sends by hand on WhatsApp (opened pre-filled through a wa.me link). */
export function orderUpdateMessage(o: { name?: string; id: string; status: string; carrier?: string; tracking?: string }): string {
  const hi = `Hello ${o.name?.trim() || "there"},`;
  const ref = o.id.slice(0, 8);
  switch (o.status) {
    case "PAID": return `${hi} thank you for your order ${ref} with RS Jewellers. Your payment is confirmed and we are preparing your order. We will share the dispatch details here.`;
    case "SHIPPED": return `${hi} your order ${ref} has been shipped${o.carrier ? ` via ${o.carrier}` : ""}${o.tracking ? `, tracking: ${o.tracking}` : ""}.`;
    case "DELIVERED": return `${hi} your order ${ref} is marked as delivered. Thank you for shopping with RS Jewellers!`;
    case "CANCELLED": return `${hi} your order ${ref} has been cancelled. Please message us if you have any questions.`;
    default: return `${hi} regarding your order ${ref} at RS Jewellers.`;
  }
}

// ---------- Admin list (production way to make someone an admin) ----------
/** "a@x.com, B@y.com" -> ["a@x.com","b@y.com"]. Invalid entries are ignored. */
export function parseAdminEmails(text: string | undefined): string[] {
  return [...new Set(String(text ?? "").split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)))];
}

export type AdminSync = "GRANT" | "REVOKE" | "NOOP";

/**
 * Should this login gain or lose the admin permission, based on the server's ADMIN_EMAILS list?
 * - An empty list does nothing (a mistake can never lock everybody out).
 * - Only a VERIFIED email can be promoted.
 * - Only permissions that this list granted (adminVia = "allowlist") are ever withdrawn; one set by the set-admin script is left alone.
 */
export function adminSyncDecision(i: { isAdminNow: boolean; viaAllowlist: boolean; email?: string | null; emailVerified: boolean; allowlist: string[] }): AdminSync {
  if (i.allowlist.length === 0) return "NOOP";
  const listed = Boolean(i.email) && i.emailVerified && i.allowlist.includes(String(i.email).trim().toLowerCase());
  if (listed && !i.isAdminNow) return "GRANT";
  if (!listed && i.isAdminNow && i.viaAllowlist) return "REVOKE";
  return "NOOP";
}
