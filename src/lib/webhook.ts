import { createHmac, timingSafeEqual } from "node:crypto";

/** Razorpay signs the RAW request body with HMAC-SHA256 (hex). */
export function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sign(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export interface PaymentFacts { paymentId: string; razorpayOrderId: string; amountPaise: number; currency: string }
export interface OrderFacts { status: string; totalPaise: number; razorpayOrderId: string | null }
export type PaidDecision = "MARK_PAID" | "NOOP" | "REVIEW" | "MISMATCH";

/** Decide what to do when a captured payment arrives for an order. */
export function decidePaid(order: OrderFacts, pay: PaymentFacts): PaidDecision {
  if (order.razorpayOrderId !== pay.razorpayOrderId) return "MISMATCH";
  if (pay.currency !== "INR" || pay.amountPaise !== order.totalPaise) return "MISMATCH";
  if (order.status === "PENDING") return "MARK_PAID";
  if (order.status === "CANCELLED") return "REVIEW";
  return "NOOP"; // PAID / SHIPPED / DELIVERED: replayed event
}

export function takeStock(stock: number, qty: number): { newStock: number; shortfall: boolean } {
  return stock >= qty ? { newStock: stock - qty, shortfall: false } : { newStock: 0, shortfall: true };
}

export function extractCaptured(event: unknown): (PaymentFacts & { ourOrderId: string }) | null {
  const e = event as { event?: string; payload?: { payment?: { entity?: Record<string, unknown> } } };
  if (e?.event !== "payment.captured") return null;
  const p = e.payload?.payment?.entity;
  const notes = (p?.notes ?? {}) as Record<string, unknown>;
  if (!p || typeof p.id !== "string" || typeof p.order_id !== "string" || typeof p.amount !== "number"
      || typeof p.currency !== "string" || typeof notes.orderId !== "string") return null;
  return { paymentId: p.id, razorpayOrderId: p.order_id, amountPaise: p.amount, currency: p.currency, ourOrderId: notes.orderId };
}

export interface RzpPayment { id: string; status: string; amount: number; currency: string; order_id?: string }

/**
 * From the payments Razorpay lists for one order, choose the one that proves this order is paid:
 * same order, same amount, INR, and captured (preferred) or authorized (must then be captured).
 */
export function pickPayment(items: RzpPayment[], razorpayOrderId: string, totalPaise: number): { id: string; status: "captured" | "authorized" } | null {
  const ok = items.filter((p) => (p.order_id === undefined || p.order_id === razorpayOrderId) && p.amount === totalPaise && p.currency === "INR");
  const captured = ok.find((p) => p.status === "captured");
  if (captured) return { id: captured.id, status: "captured" };
  const authorized = ok.find((p) => p.status === "authorized");
  return authorized ? { id: authorized.id, status: "authorized" } : null;
}
