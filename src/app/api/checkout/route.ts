import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { adminAuth, adminDb } from "@/server/firebase-admin";
import { getProductsByIds, getServicePins, getSettings } from "@/server/catalog";
import { parseCheckout, ValidationError } from "@/lib/validate";
import { isServiceable } from "@/lib/admin-logic";
import { priceCart } from "@/lib/pricing";
import { RateLimiter } from "@/lib/rate-limit";

const limiter = new RateLimiter(10, 60_000);

export const runtime = "nodejs";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

export async function POST(req: Request) {
  const authz = req.headers.get("authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) return json({ error: "Please log in to continue." }, 401);
  let decoded;
  try { decoded = await adminAuth().verifyIdToken(token); }
  catch { return json({ error: "Your session expired. Please log in again." }, 401); }

  if (!limiter.check(decoded.uid)) return json({ error: "Too many attempts. Please wait a minute." }, 429);

  let input;
  try { input = parseCheckout(await req.json()); }
  catch (e) { return json({ error: e instanceof ValidationError ? e.message : "Invalid request" }, 400); }

  try {
    if (!isServiceable(input.address.pincode, await getServicePins()))
      return json({ error: `Sorry, we do not deliver to PIN ${input.address.pincode} yet. Check the PIN codes we serve in your cart.` }, 400);
  } catch { return json({ error: "Could not check delivery availability. Please try again." }, 500); }

  const keyId = process.env.RAZORPAY_KEY_ID, keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return json({ error: "Payments are not configured (Razorpay test keys missing)." }, 503);

  let settings, products;
  try {
    settings = await getSettings();
    products = await getProductsByIds(input.items.map((i) => i.productId));
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Could not load prices" }, 500); }

  let priced;
  try { priced = priceCart(input.items, products, settings); }
  catch (e) { return json({ error: e instanceof Error ? e.message : "Cart is not valid" }, 409); }

  if (input.expectedTotalPaise !== undefined && input.expectedTotalPaise !== priced.totalPaise)
    return json({ error: "PRICE_CHANGED", totalPaise: priced.totalPaise }, 409);
  if (priced.totalPaise < 100) return json({ error: "Order total is too low." }, 400);

  const now = Date.now();
  const orderRef = adminDb().collection("orders").doc();
  await orderRef.set({
    uid: decoded.uid,
    phone: decoded.phone_number ?? null,
    email: decoded.email ?? null,
    items: priced.lines.map((l) => {
      const p = products.get(l.productId)!;
      return { productId: p.id, name: p.name, purity: p.purity, netWeightMg: p.netWeightMg, qty: l.qty, unit: l.unit };
    }),
    totalPaise: priced.totalPaise,
    gstPaise: priced.gstPaise,
    address: input.address,
    status: "PENDING",
    payment: { razorpayOrderId: null, paymentId: null },
    createdAt: now,
    updatedAt: now,
  });

  // Remember the delivery phone for the shop's customer list (best effort; never blocks the order).
  await adminDb().doc(`users/${decoded.uid}`).set({ uid: decoded.uid, phone: `+91${input.address.phone}`, lastOrderAt: now }, { merge: true }).catch(() => {});

  try {
    const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const created = await rzp.orders.create({
      amount: priced.totalPaise, currency: "INR", receipt: orderRef.id, notes: { orderId: orderRef.id },
    });
    await orderRef.update({ "payment.razorpayOrderId": created.id });
    return json({ orderId: orderRef.id, razorpayOrderId: created.id, amount: priced.totalPaise, currency: "INR", keyId });
  } catch (e) {
    console.error("razorpay order failed", e);
    await orderRef.delete().catch(() => {});
    return json({ error: "Could not start payment. Please try again." }, 502);
  }
}
