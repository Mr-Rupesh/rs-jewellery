import type { Address } from "../types/index.ts";
import { MAX_QTY_PER_LINE, type CartInput } from "./pricing.ts";

export class ValidationError extends Error {}

const str = (v: unknown, field: string, min: number, max: number, optional = false): string => {
  if (v === undefined || v === null || v === "") {
    if (optional) return "";
    throw new ValidationError(`${field} is required`);
  }
  if (typeof v !== "string") throw new ValidationError(`${field} is invalid`);
  const t = v.trim();
  if (t.length < min || t.length > max) throw new ValidationError(`${field} must be ${min}-${max} characters`);
  return t;
};

export function parseItems(raw: unknown): CartInput[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 20) throw new ValidationError("Cart must have 1-20 items");
  return raw.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const productId = str(o.productId, "productId", 1, 100);
    const qty = o.qty;
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE)
      throw new ValidationError(`Quantity must be 1-${MAX_QTY_PER_LINE}`);
    return { productId, qty };
  });
}

export function parseAddress(raw: unknown): Address {
  const o = (raw ?? {}) as Record<string, unknown>;
  const phone = str(o.phone, "Phone", 10, 10);
  if (!/^[6-9]\d{9}$/.test(phone)) throw new ValidationError("Enter a valid 10-digit mobile number");
  const pincode = str(o.pincode, "PIN code", 6, 6);
  if (!/^[1-9]\d{5}$/.test(pincode)) throw new ValidationError("Enter a valid 6-digit PIN code");
  return {
    name: str(o.name, "Name", 2, 80), phone,
    line1: str(o.line1, "Address line 1", 5, 200),
    line2: str(o.line2, "Address line 2", 0, 200, true),
    city: str(o.city, "City", 2, 80), state: str(o.state, "State", 2, 80), pincode,
  };
}

export function parseCheckout(raw: unknown) {
  const o = (raw ?? {}) as Record<string, unknown>;
  const expected = o.expectedTotalPaise;
  if (expected !== undefined && (typeof expected !== "number" || !Number.isInteger(expected) || expected < 0))
    throw new ValidationError("expectedTotalPaise is invalid");
  return { items: parseItems(o.items), address: parseAddress(o.address), expectedTotalPaise: expected as number | undefined };
}

export const isValidEmail = (s: string): boolean => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

/** Where to go after login. Only same-site paths are allowed (blocks "//evil.com" style redirects). */
export function safeNextPath(raw: string | null | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/";
}
