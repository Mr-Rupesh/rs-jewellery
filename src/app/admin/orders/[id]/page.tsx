"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/providers";
import { adminFetch } from "@/lib/admin-client";
import { formatGrams, formatINR } from "@/lib/pricing";
import { orderUpdateMessage } from "@/lib/admin-logic";

interface Item { name: string; purity: string; netWeightMg: number; qty: number; unit: { mode: string; ratePaisePerGram: number | null; metalPaise: number; makingPaise: number; stonePaise: number; gstPaise: number; totalPaise: number } }
interface Order {
  status: string; totalPaise: number; gstPaise: number; createdAt: number; paidAt?: number; phone?: string | null; email?: string | null; invoiceNo?: string; carrier?: string; tracking?: string;
  needsReview?: boolean; reviewReason?: string; refundPending?: boolean; payment?: { razorpayOrderId?: string; paymentId?: string };
  address: { name: string; phone: string; line1: string; line2: string; city: string; state: string; pincode: string }; items: Item[];
}

export default function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const [o, setO] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => onSnapshot(doc(db, "orders", id), (s) => (s.exists() ? setO(s.data() as Order) : setError("Order not found.")), () => setError("Could not load this order.")), [id]);

  async function change(status: string) {
    if (!user) return;
    setMsg("");
    const r = await adminFetch(user, `/api/admin/orders/${id}/status`, { status, carrier, tracking });
    setMsg(r.ok ? "Updated." : r.data.error ?? "Update failed.");
  }

  if (error) return <p role="alert" className="text-red-700">{error}</p>;
  if (!o) return <p className="text-muted">Loading order…</p>;
  const a = o.address;
  return (
    <div className="space-y-6">
      <p><Link href="/admin/dashboard" className="text-sm text-golddeep underline">Back to orders</Link></p>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-4xl font-semibold">Order {id.slice(0, 8)}</h1><p className="text-sm text-muted">{id}</p></div>
        <div className="text-right"><p className="font-display text-3xl">{formatINR(o.totalPaise)}</p><p className="font-medium">{o.status}</p></div>
      </div>
      {o.needsReview && <p role="alert" className="text-red-700">Needs your review: {o.reviewReason}</p>}
      {o.refundPending && <p role="alert" className="text-red-700">Cancelled after payment. Refund this customer in the Razorpay dashboard.</p>}

      <div className="grid gap-4 md:grid-cols-3">
        <section className="border border-line bg-white p-4 text-sm"><h2 className="text-xl font-semibold">Customer</h2>
          <p className="mt-2 font-medium">{a.name}</p><p>{a.line1}{a.line2 ? `, ${a.line2}` : ""}</p><p>{a.city}, {a.state} {a.pincode}</p><p>Delivery phone: {a.phone}</p><p>Login: {o.email ?? o.phone ?? "-"}</p>
          <a className="mt-2 inline-block text-golddeep underline" target="_blank" rel="noreferrer" href={`https://wa.me/91${a.phone}?text=${encodeURIComponent(orderUpdateMessage({ name: a.name, id, status: o.status, carrier: o.carrier, tracking: o.tracking }))}`}>Send WhatsApp update</a></section>
        <section className="border border-line bg-white p-4 text-sm"><h2 className="text-xl font-semibold">Payment</h2>
          <p className="mt-2">Placed: {new Date(o.createdAt).toLocaleString("en-IN")}</p><p>Paid: {o.paidAt ? new Date(o.paidAt).toLocaleString("en-IN") : "not yet"}</p>
          <p className="break-all">Razorpay order: {o.payment?.razorpayOrderId ?? "-"}</p><p className="break-all">Payment id: {o.payment?.paymentId ?? "-"}</p>
          <p>GST: {formatINR(o.gstPaise)}</p>
          {o.invoiceNo && <Link className="text-golddeep underline" href={`/orders/${id}/invoice`}>Invoice {o.invoiceNo}</Link>}</section>
        <section className="border border-line bg-white p-4 text-sm"><h2 className="text-xl font-semibold">Shipping</h2>
          {o.status === "PAID" ? (
            <div className="mt-2 space-y-2">
              <input className="field" placeholder="Courier / carrier" value={carrier} maxLength={60} onChange={(e) => setCarrier(e.target.value)} aria-label="Carrier" />
              <input className="field" placeholder="Tracking number" value={tracking} maxLength={100} onChange={(e) => setTracking(e.target.value)} aria-label="Tracking number" />
              <button className="btn-primary" onClick={() => void change("SHIPPED")}>Mark shipped</button>
            </div>
          ) : (<p className="mt-2">{o.carrier || o.tracking ? `${o.carrier ?? "Courier"} ${o.tracking ?? ""}` : "No shipment recorded."}</p>)}
          {o.status === "SHIPPED" && <button className="btn-primary mt-3" onClick={() => void change("DELIVERED")}>Mark delivered</button>}
          {(o.status === "PENDING" || o.status === "PAID") && <button className="btn-quiet mt-3" onClick={() => { if (window.confirm("Cancel this order?")) void change("CANCELLED"); }}>Cancel order</button>}
          {msg && <p role="status" className="mt-2">{msg}</p>}</section>
      </div>

      <section className="overflow-x-auto border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-muted"><tr><th className="p-3">Item</th><th>Qty</th><th>Gold rate</th><th>Metal</th><th>Making</th><th>Stone</th><th>GST</th><th className="pr-3 text-right">Total</th></tr></thead>
          <tbody>{o.items.map((i, k) => (
            <tr key={k} className="border-b border-line last:border-0">
              <td className="p-3">{i.name}<span className="block text-xs text-muted">{i.purity} · {formatGrams(i.netWeightMg)}{i.unit.mode === "FIXED" ? " · fixed price" : ""}</span></td>
              <td>{i.qty}</td><td>{i.unit.ratePaisePerGram ? `${formatINR(i.unit.ratePaisePerGram)}/g` : "-"}</td>
              <td>{formatINR(i.unit.metalPaise)}</td><td>{formatINR(i.unit.makingPaise)}</td><td>{formatINR(i.unit.stonePaise)}</td><td>{formatINR(i.unit.gstPaise)}</td>
              <td className="pr-3 text-right">{formatINR(i.unit.totalPaise * i.qty)}</td>
            </tr>))}</tbody>
        </table>
      </section>
    </div>
  );
}
