"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { CheckCircle2 } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/providers";
import { formatINR, formatGrams } from "@/lib/pricing";
import { pendingHint } from "@/lib/payment-hint";

interface OrderDoc {
  status: string; totalPaise: number; createdAt: number; invoiceNo?: string; carrier?: string; tracking?: string;
  payment?: { razorpayOrderId?: string | null };
  items: { productId: string; name: string; purity: string; netWeightMg: number; qty: number }[];
}

const STATUS_TEXT: Record<string, string> = {
  PENDING: "Confirming your payment. This page updates by itself.",
  SHIPPED: "Your order has been shipped.",
  DELIVERED: "Delivered.",
  CANCELLED: "This order was cancelled.",
};
const MAX_CHECKS = 24; // about 2 minutes at one check every 5 seconds

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading } = useAuth();
  const [order, setOrder] = useState<OrderDoc | null>(null);
  const [error, setError] = useState("");
  const [gaveUp, setGaveUp] = useState(false);
  const [checking, setChecking] = useState(false);
  const [hint, setHint] = useState("");

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "orders", id),
      (s) => { if (s.exists()) { setOrder(s.data() as OrderDoc); setError(""); } else setError("Order not found."); },
      () => setError("You don't have access to this order."));
  }, [id, user]);

  async function confirmPayment() {
    if (!user) return;
    setChecking(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/payment/confirm", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ orderId: id }) });
      setHint(pendingHint(await res.json().catch(() => null)));
    } catch { setHint("Could not reach the server."); /* we try again shortly */ }
    finally { setChecking(false); }
  }

  // While the order is unpaid, ask the server to check with Razorpay. The page flips to "placed" on its own.
  const status = order?.status;
  const hasPayment = Boolean(order?.payment?.razorpayOrderId);
  useEffect(() => {
    if (status !== "PENDING" || !hasPayment || !user) return;
    let tries = 0, stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const run = async () => {
      if (stopped) return;
      tries += 1;
      await confirmPayment();
      if (tries >= MAX_CHECKS && !stopped) { stopped = true; if (timer) clearInterval(timer); setGaveUp(true); }
    };
    void run();
    timer = setInterval(run, 5000);
    return () => { stopped = true; if (timer) clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, hasPayment, user, id]);

  if (loading) return <p className="text-muted">Loading…</p>;
  if (!user) return <p>Please <Link className="underline" href={`/login?next=/orders/${id}`}>log in</Link> to see this order.</p>;
  if (error) return <p role="alert" className="text-red-700">{error}</p>;
  if (!order) return <p className="text-muted">Loading order…</p>;

  return (
    <div>
      {order.status === "PAID" && (
        <div role="status" className="mb-6 flex gap-3 border border-green-700 bg-green-50 p-4">
          <CheckCircle2 className="mt-0.5 shrink-0 text-green-700" />
          <div>
            <p className="text-xl font-semibold text-green-900">Order placed successfully</p>
            <p className="text-sm text-green-900">Your payment is confirmed. You will get an update on WhatsApp within 2 hours.</p>
          </div>
        </div>
      )}
      <h1 className="text-4xl font-semibold">Order {id.slice(0, 8)}</h1>
      {order.status !== "PAID" && <p className="mt-2" aria-live="polite">{STATUS_TEXT[order.status] ?? order.status}</p>}
      {order.status === "PENDING" && gaveUp && (
        <p className="mt-2 text-sm">Still waiting for the payment to be confirmed. If you paid, your money is safe.{" "}
          <button className="underline" disabled={checking} onClick={() => void confirmPayment()}>{checking ? "Checking…" : "Check again"}</button></p>
      )}
      {order.status === "PENDING" && hint && process.env.NODE_ENV !== "production" && (
        <p role="note" className="mt-2 border border-line bg-white p-2 text-xs text-muted">Developer note: {hint}</p>
      )}
      {order.invoiceNo && <p className="mt-2"><Link className="underline" href={`/orders/${id}/invoice`}>View invoice {order.invoiceNo}</Link></p>}
      {(order.carrier || order.tracking) && <p className="mt-2 text-sm">Shipped via {order.carrier || "courier"}{order.tracking ? ` · tracking ${order.tracking}` : ""}</p>}
      <ul className="mt-6 divide-y divide-line border border-line bg-white">
        {order.items.map((i) => (
          <li key={i.productId} className="flex justify-between p-4"><span>{i.name} <span className="text-sm text-muted">{i.purity} · {formatGrams(i.netWeightMg)} × {i.qty}</span></span></li>
        ))}
      </ul>
      <p className="mt-4 text-xl">Total <strong>{formatINR(order.totalPaise)}</strong></p>
    </div>
  );
}
