import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { adminAuth, adminDb } from "@/server/firebase-admin";
import { markOrderPaid } from "@/server/orders";
import { pickPayment, type RzpPayment } from "@/lib/webhook";
import { RateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
const limiter = new RateLimiter(30, 60_000);
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const dev = process.env.NODE_ENV !== "production";

/**
 * Asks Razorpay (server to server, with our secret key) whether this order has been paid, and if so marks it PAID.
 * Needs no public URL, so it works on a laptop. Safe to call repeatedly; the Razorpay webhook is a backup path.
 */
export async function POST(req: Request) {
  const authz = req.headers.get("authorization") ?? "";
  let uid: string;
  try { uid = (await adminAuth().verifyIdToken(authz.startsWith("Bearer ") ? authz.slice(7) : "")).uid; }
  catch { return json({ error: "Please log in." }, 401); }
  if (!limiter.check(uid)) return json({ error: "Too many requests." }, 429);

  const body = (await req.json().catch(() => ({}))) as { orderId?: unknown };
  if (typeof body.orderId !== "string" || body.orderId.length < 5 || body.orderId.length > 100) return json({ error: "Invalid request." }, 400);

  const snap = await adminDb().collection("orders").doc(body.orderId).get();
  if (!snap.exists || snap.data()!.uid !== uid) return json({ error: "Order not found." }, 404);
  const o = snap.data()!;
  if (o.status === "PAID" || o.status === "SHIPPED" || o.status === "DELIVERED") return json({ status: "PAID" });
  if (o.status !== "PENDING") return json({ status: o.status });
  const rzpOrderId = o.payment?.razorpayOrderId as string | null | undefined;
  if (!rzpOrderId) return json({ status: "PENDING" });

  const keyId = process.env.RAZORPAY_KEY_ID, keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return json({ status: "PENDING", reason: "KEYS_MISSING", error: "Payments are not configured." }, 503);

  try {
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const list = await rzp.orders.fetchPayments(rzpOrderId);
    const items = (list.items ?? []) as unknown as RzpPayment[];
    const pick = pickPayment(items, rzpOrderId, o.totalPaise);
    if (!pick) return json({ status: "PENDING", reason: "NO_PAYMENT", ...(dev ? { seen: items.map((p) => `${p.status} ₹${p.amount / 100}`) } : {}) });
    if (pick.status === "authorized") await rzp.payments.capture(pick.id, o.totalPaise, "INR");

    const result = await markOrderPaid(body.orderId, { paymentId: pick.id, razorpayOrderId: rzpOrderId, amountPaise: o.totalPaise, currency: "INR" });
    return json({ status: result === "PAID" || result === "ALREADY_DONE" ? "PAID" : "REVIEW" });
  } catch (e) {
    console.error("payment confirm failed", e);
    const detail = (e as { error?: { description?: string } })?.error?.description ?? (e instanceof Error ? e.message : String(e));
    return json({ status: "PENDING", reason: "ERROR", ...(dev ? { detail: detail.slice(0, 300) } : {}) }); // the page simply asks again in a few seconds
  }
}
