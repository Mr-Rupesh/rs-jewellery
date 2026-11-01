"use client";
import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatINR } from "@/lib/pricing";

interface Cust { id: string; name?: string; email?: string | null; phone?: string | null; joinedAt?: number; lastLoginAt?: number }
interface O { uid: string; status: string; totalPaise: number; createdAt: number }

export default function CustomersPage() {
  const [users, setUsers] = useState<Cust[]>([]);
  const [orders, setOrders] = useState<O[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const a = onSnapshot(query(collection(db, "users"), limit(500)), (s) => setUsers(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Cust, "id">) }))), () => setErr("Could not load customers."));
    const b = onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(500)), (s) => setOrders(s.docs.map((d) => d.data() as O)), () => {});
    return () => { a(); b(); };
  }, []);

  const rows = useMemo(() => {
    const stats = new Map<string, { n: number; spent: number; last: number }>();
    for (const o of orders) {
      const s = stats.get(o.uid) ?? { n: 0, spent: 0, last: 0 };
      s.n += 1; s.last = Math.max(s.last, o.createdAt);
      if (["PAID", "SHIPPED", "DELIVERED"].includes(o.status)) s.spent += o.totalPaise;
      stats.set(o.uid, s);
    }
    const needle = q.trim().toLowerCase();
    return users
      .map((u) => ({ ...u, ...(stats.get(u.id) ?? { n: 0, spent: 0, last: 0 }) }))
      .filter((u) => !needle || `${u.name ?? ""} ${u.email ?? ""} ${u.phone ?? ""}`.toLowerCase().includes(needle))
      .sort((a, b) => b.spent - a.spent);
  }, [users, orders, q]);

  return (
    <div>
      <h1 className="text-4xl font-semibold">Customers</h1>
      <input className="field mt-4 max-w-sm" placeholder="Search name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
      {err && <p role="alert" className="mt-3 text-sm text-red-700">{err}</p>}
      <div className="mt-4 overflow-x-auto border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-muted"><tr><th className="p-3">Customer</th><th>Email</th><th>Phone</th><th>Joined</th><th>Orders</th><th>Spent</th><th>Last order</th><th /></tr></thead>
          <tbody>{rows.map((u) => (
            <tr key={u.id} className="border-b border-line last:border-0">
              <td className="p-3">{u.name || "—"}</td><td>{u.email ?? "—"}</td><td>{u.phone ?? "—"}</td>
              <td>{u.joinedAt ? new Date(u.joinedAt).toLocaleDateString("en-IN") : "—"}</td>
              <td>{u.n}</td><td>{formatINR(u.spent)}</td><td>{u.last ? new Date(u.last).toLocaleDateString("en-IN") : "—"}</td>
              <td>{u.phone && <a className="text-golddeep underline" target="_blank" rel="noreferrer" href={`https://wa.me/${u.phone.replace(/\D/g, "")}`}>WhatsApp</a>}</td>
            </tr>))}</tbody>
        </table>
        {rows.length === 0 && <p className="p-4 text-sm text-muted">No customers yet. A customer appears here after they log in.</p>}
      </div>
      <p className="mt-3 text-xs text-muted">Order counts and spend use the most recent 500 orders.</p>
    </div>
  );
}
