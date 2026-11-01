import { adminDb } from "./firebase-admin";
import { decidePaid, takeStock, type PaymentFacts } from "../lib/webhook.ts";
import { financialYear, formatInvoiceNo } from "../lib/invoice.ts";
import { canTransition } from "../lib/admin-logic.ts";

export type PaidResult = "PAID" | "ALREADY_DONE" | "NEEDS_REVIEW" | "MISMATCH" | "NOT_FOUND";

/** Idempotent: safe to call repeatedly for the same payment. */
export async function markOrderPaid(ourOrderId: string, pay: PaymentFacts): Promise<PaidResult> {
  const db = adminDb();
  const orderRef = db.collection("orders").doc(ourOrderId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return "NOT_FOUND";
    const o = snap.data()!;
    const decision = decidePaid(
      { status: o.status, totalPaise: o.totalPaise, razorpayOrderId: o.payment?.razorpayOrderId ?? null }, pay);

    if (decision === "MISMATCH") {
      tx.update(orderRef, { needsReview: true, reviewReason: "PAYMENT_MISMATCH", updatedAt: Date.now() });
      return "MISMATCH";
    }
    if (decision === "REVIEW") {
      tx.update(orderRef, { needsReview: true, reviewReason: "PAID_AFTER_CANCEL", "payment.paymentId": pay.paymentId, updatedAt: Date.now() });
      return "NEEDS_REVIEW";
    }
    if (decision === "NOOP") return "ALREADY_DONE";

    // MARK_PAID: all reads before any writes
    const items = (o.items ?? []) as { productId: string; qty: number }[];
    const productRefs = items.map((i) => db.collection("products").doc(i.productId));
    const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)));
    const paidAt = Date.now();
    const counterRef = db.collection("counters").doc(`invoice-${financialYear(paidAt)}`);
    const counterSnap = await tx.get(counterRef); // all reads happen before any write
    const seq = ((counterSnap.exists ? counterSnap.data()!.last : 0) as number) + 1;
    let shortfall = false;
    productSnaps.forEach((ps, idx) => {
      if (!ps.exists) { shortfall = true; return; }
      const r = takeStock(ps.data()!.stock as number, items[idx]!.qty);
      shortfall ||= r.shortfall;
      tx.update(productRefs[idx]!, { stock: r.newStock });
    });
    tx.set(counterRef, { last: seq });
    tx.update(orderRef, {
      status: "PAID", "payment.paymentId": pay.paymentId, paidAt, updatedAt: paidAt,
      invoiceNo: formatInvoiceNo(financialYear(paidAt), seq),
      ...(shortfall ? { needsReview: true, reviewReason: "STOCK_SHORTFALL" } : {}),
    });
    return "PAID";
  });
}

export type ChangeResult = { code: 200 } | { code: 404 | 409; error: string };

/** One order status change. Cancelling a PAID order returns stock and flags a manual refund. */
export async function changeOrderStatus(id: string, status: string, tracking: string, carrier: string): Promise<ChangeResult> {
  const db = adminDb();
  const ref = db.collection("orders").doc(id);
  return db.runTransaction(async (tx): Promise<ChangeResult> => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { code: 404, error: "Order not found." };
    const o = snap.data()!;
    if (!canTransition(o.status, status)) return { code: 409, error: `Cannot change ${o.status} to ${status}.` };

    const update: Record<string, unknown> = { status, updatedAt: Date.now() };
    if (status === "SHIPPED") { if (tracking) update.tracking = tracking; if (carrier) update.carrier = carrier; }

    if (status === "CANCELLED" && o.status === "PAID") {
      update.refundPending = true; // refund must be done manually in Razorpay
      if (o.reviewReason !== "STOCK_SHORTFALL") {
        const items = (o.items ?? []) as { productId: string; qty: number }[];
        const refs = items.map((i) => db.collection("products").doc(i.productId));
        const snaps = await Promise.all(refs.map((r) => tx.get(r)));
        snaps.forEach((ps, idx) => { if (ps.exists) tx.update(refs[idx]!, { stock: (ps.data()!.stock as number) + items[idx]!.qty }); });
      }
    }
    tx.update(ref, update);
    return { code: 200 };
  });
}
