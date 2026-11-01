"use client";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/providers";
import { adminFetch } from "@/lib/admin-client";

const rs = (paise: number) => (paise / 100).toFixed(2);

export default function RatesPage() {
  const { user } = useAuth();
  const [f, setF] = useState({ rate24k: "", rate22k: "", rate18k: "", gstPercent: "3" });
  const [loaded, setLoaded] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmMsg, setConfirmMsg] = useState("");

  useEffect(() => {
    let first = true;
    return onSnapshot(doc(db, "settings", "pricing"), (s) => {
      const d = s.data();
      if (d && first) setF({ rate24k: rs(d.rate24kPaisePerGram), rate22k: rs(d.rate22kPaisePerGram), rate18k: rs(d.rate18kPaisePerGram), gstPercent: String(d.gstBps / 100) });
      if (d) setUpdatedAt(d.updatedAt);
      first = false;
      setLoaded(true);
    });
  }, []);

  async function save(confirmLargeChange: boolean) {
    if (!user) return;
    setBusy(true); setMsg(""); setConfirmMsg("");
    const r = await adminFetch(user, "/api/admin/rates", { ...f, confirmLargeChange });
    setBusy(false);
    if (r.ok) setMsg("Saved. Customers see the new rates immediately.");
    else if (r.status === 409 && r.data.error === "CONFIRM_LARGE_CHANGE") setConfirmMsg(r.data.message ?? "Large change. Confirm to save.");
    else setMsg(r.data.error ?? "Could not save.");
  }

  const field = (k: keyof typeof f, label: string, hint?: string) => (
    <div>
      <label htmlFor={k} className="label">{label}</label>
      <input id={k} className="field" inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(false); }} className="max-w-sm space-y-4">
      <h1 className="text-4xl font-semibold text-emerald">Gold rates</h1>
      <p className="text-sm text-muted">Price per gram in rupees. New orders use these rates; existing orders keep the rate they were placed at.</p>
      {field("rate24k", "24K per gram (₹)")}
      {field("rate22k", "22K per gram (₹)")}
      {field("rate18k", "18K per gram (₹)")}
      {field("gstPercent", "GST (%)", "Confirm the correct rate with your CA.")}
      {confirmMsg && (
        <div role="alert" className="border border-gold bg-white p-3 text-sm">
          <p>{confirmMsg}</p>
          <button type="button" className="btn-primary mt-2" disabled={busy} onClick={() => void save(true)}>Yes, save these rates</button>
        </div>
      )}
      {msg && <p role="status" className="text-sm">{msg}</p>}
      <button className="btn-primary" disabled={busy || !loaded}>{busy ? "Saving…" : "Save rates"}</button>
      {updatedAt && <p className="text-xs text-muted">Last updated {new Date(updatedAt).toLocaleString("en-IN")}</p>}
    </form>
  );
}
