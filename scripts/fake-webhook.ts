// Usage: npm run webhook:test -- <orderDocId>
// Sends a correctly SIGNED fake payment.captured event to the local webhook (dev only).
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
import { sign } from "../src/lib/webhook.ts";

async function main() {
  const orderId = process.argv[2];
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!orderId) throw new Error("Usage: npm run webhook:test -- <orderDocId>");
  if (!secret) throw new Error("Set RAZORPAY_WEBHOOK_SECRET in .env.local (any string for local testing)");

  const { initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const db = getFirestore(initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-rs-jewellers" }));
  // Accept our Firestore order id OR the Razorpay id (order_xxx).
  let snap = await db.collection("orders").doc(orderId).get();
  if (!snap.exists && orderId.startsWith("order_")) {
    const q = await db.collection("orders").where("payment.razorpayOrderId", "==", orderId).limit(1).get();
    if (!q.empty) snap = q.docs[0]!;
  }
  if (!snap.exists) throw new Error(`No order matching "${orderId}" in the emulator. Open http://localhost:4000/firestore and check the "orders" collection. Emulator data is lost when the emulators restart.`);
  const o = snap.data()!;
  const ourId = snap.id;

  const body = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: {
      id: `pay_fake_${Date.now()}`, order_id: o.payment.razorpayOrderId, amount: o.totalPaise, currency: "INR",
      status: "captured", notes: { orderId: ourId },
    } } },
  });
  const res = await fetch("http://localhost:3000/api/webhooks/razorpay", {
    method: "POST", headers: { "Content-Type": "application/json", "x-razorpay-signature": sign(body, secret) }, body,
  });
  console.log(res.status, await res.text());
}
main().catch((e) => { console.error(e.message); process.exit(1); });
