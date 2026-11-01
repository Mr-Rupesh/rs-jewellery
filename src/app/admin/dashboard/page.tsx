"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { collection, doc, getCountFromServer, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/providers";
import { adminFetch } from "@/lib/admin-client";
import { enableAlerts, notify, playChime } from "@/lib/chime";
import { dayStats, filterOrders, orderUpdateMessage, ordersToCsv, shouldChime, type OrderRow } from "@/lib/admin-logic";
import { formatINR } from "@/lib/pricing";

type Order = OrderRow & { needsReview?: boolean; reviewReason?: string; refundPending?: boolean };
const FILTERS = [["PAID", "Paid"], ["SHIPPED", "Shipped"], ["DELIVERED", "Delivered"], ["PENDING", "Awaiting payment"], ["CANCELLED", "Cancelled"], ["ALL", "All"]] as const;

export default function Dashboard() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<string>("PAID");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState("SHIPPED");
  const [alertsOn, setAlertsOn] = useState(false);
  const [msg, setMsg] = useState("");
  const [customers, setCustomers] = useState<number | null>(null);
  const [lowStock, setLowStock] = useState(0);
  const known = useRef<Map<string, string>>(new Map());
  const initial = useRef(true);

  useEffect(() => {
    known.current = new Map(); initial.current = true;
    return onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(500)), (snap) => {
      let chimed = false;
      snap.docChanges().forEach((c) => {
        if (c.type === "removed") return;
        const o = c.doc.data() as Order;
        if (!chimed && shouldChime(known.current.get(c.doc.id), o.status, initial.current)) {
          chimed = true; playChime(); notify("New paid order", `${o.address?.name ?? "Customer"} · ${formatINR(o.totalPaise)}`);
        }
        known.current.set(c.doc.id, o.status);
      });
      initial.current = false;
      setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, "id">) })));
    }, () => setMsg("Could not load orders."));
  }, []);

  useEffect(() => {
    getCountFromServer(collection(db, "users")).then((s) => setCustomers(s.data().count)).catch(() => setCustomers(null));
    let threshold = 5, products: { stock: number; active: boolean }[] = [];
    const recount = () => setLowStock(products.filter((p) => p.active && p.stock <= threshold).length);
    const a = onSnapshot(doc(db, "settings", "store"), (s) => { threshold = Number(s.data()?.lowStockThreshold ?? 5); recount(); }, () => {});
    const b = onSnapshot(collection(db, "products"), (s) => { products = s.docs.map((d) => d.data() as { stock: number; active: boolean }); recount(); }, () => {});
    return () => { a(); b(); };
  }, []);

  const range = useMemo(() => ({
    fromMs: from ? new Date(`${from}T00:00:00`).getTime() : undefined,
    toMs: to ? new Date(`${to}T23:59:59.999`).getTime() : undefined,
  }), [from, to]);
  const base = useMemo(() => filterOrders(orders, { q, ...range }), [orders, q, range]);
  const shown = useMemo(() => (filter === "ALL" ? base : base.filter((o) => o.status === filter)), [base, filter]);
  const stats = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return dayStats(orders, d.getTime()); }, [orders]);

  async function change(id: string, status: string) {
    if (!user) return;
    setMsg("");
    const r = await adminFetch(user, `/api/admin/orders/${id}/status`, { status });
    if (!r.ok) setMsg(r.data.error ?? "Update failed.");
  }

  async function applyBulk() {
    if (!user || selected.length === 0) return;
    if (!window.confirm(`Change ${selected.length} order(s) to ${bulk}? Orders that cannot make this change are skipped.`)) return;
    const r = await adminFetch(user, "/api/admin/orders/bulk", { ids: selected, status: bulk });
    if (!r.ok) { setMsg(r.data.error ?? "Bulk update failed."); return; }
    const results = (r.data as unknown as { results: { ok: boolean; error?: string }[] }).results;
    const failed = results.filter((x) => !x.ok);
    setMsg(`${results.length - failed.length} updated, ${failed.length} skipped${failed[0]?.error ? ` (${failed[0].error})` : ""}.`);
    setSelected([]);
  }

  function exportCsv() {
    const blob = new Blob(["\ufeff" + ordersToCsv(shown)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const tile = (label: string, value: string) => (
    <div className="border border-line bg-white p-4"><p className="text-xs uppercase tracking-widest text-muted">{label}</p><p className="mt-1 font-display text-3xl">{value}</p></div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl font-semibold">Orders</h1>
        <button className="btn-quiet" onClick={() => { enableAlerts(); setAlertsOn(true); playChime(); }}>{alertsOn ? "Alerts on (test chime played)" : "Enable sound and alerts"}</button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tile("Today's order value", formatINR(stats.todayPaise))}
        {tile("To fulfil (paid)", String(stats.toFulfil))}
        {tile("Awaiting payment", String(stats.awaitingPayment))}
        {tile("Customers", customers === null ? "–" : String(customers))}
        {tile("Low stock items", String(lowStock))}
      </div>
      {lowStock > 0 && <p role="alert" className="mt-3 text-sm text-red-700">{lowStock} product(s) are at or below the low-stock threshold. <Link className="underline" href="/admin/products">Review stock</Link></p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search order id, name, phone, city, item, invoice" aria-label="Search orders" />
        <label className="text-sm text-muted">From <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm text-muted">To <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="btn-quiet self-end" onClick={exportCsv} disabled={shown.length === 0}>Export CSV ({shown.length})</button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="tablist">
        {FILTERS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={filter === k} onClick={() => { setFilter(k); setSelected([]); }}
            className={`btn ${filter === k ? "bg-ink text-ivory" : "border border-line bg-white"}`}>
            {label} ({k === "ALL" ? base.length : base.filter((o) => o.status === k).length})
          </button>
        ))}
      </div>
      {filter === "PENDING" && <button className="btn-quiet mt-3" onClick={async () => {
        if (!user || !window.confirm("Cancel all unpaid orders older than 48 hours?")) return;
        const r = await adminFetch(user, "/api/admin/orders/cleanup", {});
        setMsg(r.ok ? `Cancelled ${r.data.cancelled} abandoned order(s).` : r.data.error ?? "Cleanup failed.");
      }}>Clear abandoned orders (older than 48h)</button>}
      {msg && <p role="status" className="mt-3 text-sm">{msg}</p>}

      {shown.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={selected.length === shown.length} onChange={(e) => setSelected(e.target.checked ? shown.map((o) => o.id) : [])} />Select all shown</label>
          {selected.length > 0 && (<>
            <select className="field w-40" value={bulk} onChange={(e) => setBulk(e.target.value)} aria-label="Bulk status">
              <option value="SHIPPED">Mark shipped</option><option value="DELIVERED">Mark delivered</option><option value="CANCELLED">Cancel</option>
            </select>
            <button className="btn-primary" onClick={() => void applyBulk()}>Apply to {selected.length}</button>
          </>)}
        </div>
      )}
      {shown.length === 0 && <p className="mt-6 text-sm text-muted">No orders in this view.</p>}

      <ul className="mt-3 space-y-3">
        {shown.map((o) => (
          <li key={o.id} className="border border-line bg-white p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <label className="flex items-start gap-3">
                <input type="checkbox" className="mt-1" checked={selected.includes(o.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, o.id] : s.filter((x) => x !== o.id)))} aria-label={`Select order ${o.id}`} />
                <span>
                  <span className="block text-base font-medium">{o.address?.name} <span className="font-normal text-muted">· {o.address?.city}</span></span>
                  <span className="text-muted">{new Date(o.createdAt).toLocaleString("en-IN")} · {o.id}</span>
                </span>
              </label>
              <div className="text-right"><p className="text-lg">{formatINR(o.totalPaise)}</p><p className="font-medium">{o.status}</p></div>
            </div>
            <p className="mt-2">{(o.items ?? []).map((i) => `${i.name} × ${i.qty}`).join("; ")}</p>
            {(o.carrier || o.tracking) && <p className="text-muted">Shipped via {o.carrier || "courier"} {o.tracking}</p>}
            {o.needsReview && <p role="alert" className="mt-1 text-red-700">Needs your review: {o.reviewReason}</p>}
            {o.refundPending && <p role="alert" className="mt-1 text-red-700">Cancelled after payment. Refund this customer in the Razorpay dashboard.</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className="btn-quiet" href={`/admin/orders/${o.id}`}>{o.status === "PAID" ? "Details and ship" : "Details"}</Link>
              {o.status === "SHIPPED" && <button className="btn-primary" onClick={() => void change(o.id, "DELIVERED")}>Mark delivered</button>}
              {(o.status === "PENDING" || o.status === "PAID") && <button className="btn-quiet" onClick={() => { if (window.confirm("Cancel this order?")) void change(o.id, "CANCELLED"); }}>Cancel order</button>}
              {o.invoiceNo && <a className="btn-quiet" target="_blank" rel="noreferrer" href={`/orders/${o.id}/invoice`}>Invoice {o.invoiceNo}</a>}
              {o.address?.phone && <a className="btn-quiet" target="_blank" rel="noreferrer" href={`https://wa.me/91${o.address.phone}?text=${encodeURIComponent(orderUpdateMessage({ name: o.address?.name, id: o.id, status: o.status, carrier: o.carrier, tracking: o.tracking }))}`}>Send WhatsApp update</a>}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">Showing the most recent 500 orders.</p>
    </div>
  );
}
