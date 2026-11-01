"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { RETURN_NEXT } from "@/lib/admin-logic";

interface Ret { id: string; type: string; status: string; reason: string; adminNote?: string; name?: string; phone?: string | null; createdAt: number }
const LABEL: Record<string, string> = { APPROVED: "Approve", REJECTED: "Reject", COMPLETED: "Mark completed" };

export default function ReturnsAdmin() {
  const [rows, setRows] = useState<Ret[]>([]);
  const [filter, setFilter] = useState("REQUESTED");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  useEffect(() => onSnapshot(query(collection(db, "returns"), orderBy("createdAt", "desc"), limit(200)),
    (s) => setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Ret, "id">) }))), () => setMsg("Could not load requests.")), []);

  async function setStatus(r: Ret, status: string) {
    setMsg("");
    try { await updateDoc(doc(db, "returns", r.id), { status, adminNote: (notes[r.id] ?? r.adminNote ?? "").slice(0, 500), updatedAt: Date.now() }); }
    catch { setMsg("Could not update this request."); }
  }

  const shown = rows.filter((r) => filter === "ALL" || r.status === filter);
  return (
    <div>
      <h1 className="text-4xl font-semibold">Returns and exchanges</h1>
      <p className="mt-1 text-sm text-muted">Refunds and replacements are not automatic. Do them in Razorpay or your shipping process, then record the outcome in the note.</p>
      <div className="mt-4 flex flex-wrap gap-2" role="tablist">
        {["REQUESTED", "APPROVED", "COMPLETED", "REJECTED", "ALL"].map((k) => (
          <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`btn ${filter === k ? "bg-ink text-ivory" : "border border-line bg-white"}`}>
            {k === "ALL" ? "All" : k[0] + k.slice(1).toLowerCase()} ({k === "ALL" ? rows.length : rows.filter((r) => r.status === k).length})
          </button>))}
      </div>
      {msg && <p role="alert" className="mt-3 text-sm text-red-700">{msg}</p>}
      {shown.length === 0 && <p className="mt-6 text-sm text-muted">Nothing here.</p>}
      <ul className="mt-4 space-y-3">{shown.map((r) => (
        <li key={r.id} className="border border-line bg-white p-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <p className="font-medium">{r.type} · {r.name || "Customer"} <span className="font-normal text-muted">· {new Date(r.createdAt).toLocaleString("en-IN")}</span></p>
            <p><strong>{r.status}</strong></p>
          </div>
          <p className="mt-2 whitespace-pre-wrap">{r.reason}</p>
          <p className="mt-1"><Link className="text-golddeep underline" href={`/admin/orders/${r.id}`}>View order {r.id.slice(0, 8)}</Link></p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input className="field w-72" placeholder="Note for the customer" maxLength={500} value={notes[r.id] ?? r.adminNote ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} aria-label="Note" />
            {(RETURN_NEXT[r.status] ?? []).map((s) => <button key={s} className={s === "REJECTED" ? "btn-quiet" : "btn-primary"} onClick={() => void setStatus(r, s)}>{LABEL[s]}</button>)}
            {r.phone && <a className="btn-quiet" target="_blank" rel="noreferrer" href={`https://wa.me/${r.phone.replace(/\D/g, "")}`}>WhatsApp</a>}
          </div>
        </li>))}</ul>
    </div>
  );
}
