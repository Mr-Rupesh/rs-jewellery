"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/providers";
import { SHOP } from "@/lib/shop";
import { formatINR, formatGrams } from "@/lib/pricing";
import { gstSplit } from "@/lib/invoice";

interface OrderDoc {
  status: string; invoiceNo?: string; paidAt?: number; totalPaise: number; gstPaise: number;
  address: { name: string; phone: string; line1: string; line2: string; city: string; state: string; pincode: string };
  items: { name: string; purity: string; netWeightMg: number; qty: number; unit: { subtotalPaise: number; gstPaise: number; totalPaise: number } }[];
}

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading } = useAuth();
  const [o, setO] = useState<OrderDoc | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "orders", id), (s) => (s.exists() ? setO(s.data() as OrderDoc) : setError("Order not found.")), () => setError("You don't have access to this invoice."));
  }, [id, user]);

  if (loading) return <p className="text-muted">Loading…</p>;
  if (!user) return <p>Please <Link className="underline" href={`/login?next=/orders/${id}/invoice`}>log in</Link>.</p>;
  if (error) return <p role="alert" className="text-red-700">{error}</p>;
  if (!o) return <p className="text-muted">Loading invoice…</p>;
  if (!o.invoiceNo) return <p>An invoice is created after payment is confirmed.</p>;

  const split = gstSplit(o.gstPaise, SHOP.state, o.address.state);
  const taxable = o.totalPaise - o.gstPaise;
  const a = o.address;

  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-sm">
      <button className="btn-primary mb-4 print:hidden" onClick={() => window.print()}>Print or save as PDF</button>
      <div className="flex flex-wrap justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-3xl font-semibold text-emerald">{SHOP.gstin ? "Tax Invoice" : "Invoice"}</h1>
          <p className="font-medium">{SHOP.name}</p>
          <p>{SHOP.address}</p>
          <p>{SHOP.phone} · {SHOP.email}</p>
          {SHOP.gstin && <p>GSTIN: {SHOP.gstin}</p>}
        </div>
        <div className="text-right">
          <p>Invoice no: <strong>{o.invoiceNo}</strong></p>
          <p>Date: {o.paidAt ? new Date(o.paidAt).toLocaleDateString("en-IN") : "-"}</p>
          <p>Order: {id}</p>
        </div>
      </div>
      <div className="py-4">
        <p className="text-muted">Billed and shipped to</p>
        <p className="font-medium">{a.name}</p>
        <p>{a.line1}{a.line2 ? `, ${a.line2}` : ""}</p>
        <p>{a.city}, {a.state} {a.pincode}</p>
        <p>{a.phone}</p>
      </div>
      <table className="w-full text-left">
        <thead className="border-y border-line"><tr><th className="py-2">Item</th><th>HSN</th><th className="text-right">Qty</th><th className="text-right">Taxable value</th><th className="text-right">GST</th><th className="text-right">Amount</th></tr></thead>
        <tbody>
          {o.items.map((i, k) => (
            <tr key={k} className="border-b border-line align-top">
              <td className="py-2">{i.name}<span className="block text-xs text-muted">{i.purity} · {formatGrams(i.netWeightMg)}</span></td>
              <td>7113</td>
              <td className="text-right">{i.qty}</td>
              <td className="text-right">{formatINR(i.unit.subtotalPaise * i.qty)}</td>
              <td className="text-right">{formatINR(i.unit.gstPaise * i.qty)}</td>
              <td className="text-right">{formatINR(i.unit.totalPaise * i.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto mt-4 w-64 space-y-1">
        <div className="flex justify-between"><dt>Taxable value</dt><dd>{formatINR(taxable)}</dd></div>
        {split.type === "INTRA" ? (
          <>
            <div className="flex justify-between"><dt>CGST</dt><dd>{formatINR(split.cgstPaise)}</dd></div>
            <div className="flex justify-between"><dt>SGST</dt><dd>{formatINR(split.sgstPaise)}</dd></div>
          </>
        ) : (
          <div className="flex justify-between"><dt>IGST</dt><dd>{formatINR(split.igstPaise)}</dd></div>
        )}
        <div className="flex justify-between border-t border-line pt-1 text-base font-semibold"><dt>Total</dt><dd>{formatINR(o.totalPaise)}</dd></div>
      </dl>
      <p className="mt-8 text-xs text-muted">This is a computer-generated invoice. Confirm the required invoice format with your accountant.</p>
    </div>
  );
}
