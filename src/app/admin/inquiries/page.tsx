"use client";
import { useEffect, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { rupeesToPaise } from "@/lib/admin-logic";
import { formatINR } from "@/lib/pricing";

interface Inquiry {
  id: string; name: string; phone: string | null; description: string; imagePaths: string[];
  status: string; createdAt: number; quotedPaise?: number;
}
const FILTERS = [["NEW", "New"], ["QUOTED", "Quoted"], ["CLOSED", "Closed"], ["ALL", "All"]] as const;

function Thumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { getDownloadURL(ref(storage, path)).then(setUrl).catch(() => setFailed(true)); }, [path]);
  if (failed) return <span className="text-xs text-red-700">Image unavailable</span>;
  if (!url) return <span className="h-24 w-24 animate-pulse bg-line" />;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Customer sketch" className="h-24 w-24 border border-line object-cover" />
    </a>
  );
}

export default function InquiriesPage() {
  const [items, setItems] = useState<Inquiry[]>([]);
  const [filter, setFilter] = useState<string>("NEW");
  const [quote, setQuote] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  useEffect(() => onSnapshot(query(collection(db, "custom_inquiries"), orderBy("createdAt", "desc"), limit(100)),
    (s) => setItems(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Inquiry, "id">) }))),
    () => setMsg("Could not load inquiries.")), []);

  async function saveQuote(i: Inquiry) {
    setMsg("");
    try {
      const paise = rupeesToPaise(quote[i.id] ?? "", "Quote");
      if (paise < 100) throw new Error("Quote must be at least ₹1");
      await updateDoc(doc(db, "custom_inquiries", i.id), { status: "QUOTED", quotedPaise: paise });
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not save the quote."); }
  }
  const close = (i: Inquiry) => updateDoc(doc(db, "custom_inquiries", i.id), { status: "CLOSED" }).catch(() => setMsg("Could not close."));

  const waLink = (i: Inquiry) => {
    const digits = (i.phone ?? "").replace(/\D/g, "");
    const text = i.quotedPaise
      ? `Hello ${i.name}, regarding your custom design request: our quote is ${formatINR(i.quotedPaise)} (incl. GST). Please reply to confirm.`
      : `Hello ${i.name}, thank you for your custom design request. Could you share a few more details?`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  };

  const shown = items.filter((i) => filter === "ALL" || i.status === filter);
  return (
    <div>
      <h1 className="text-4xl font-semibold text-emerald">Custom design inquiries</h1>
      <div className="mt-4 flex flex-wrap gap-2" role="tablist">
        {FILTERS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
            className={`btn ${filter === k ? "bg-emerald text-white" : "border border-line bg-white"}`}>
            {label} ({k === "ALL" ? items.length : items.filter((i) => i.status === k).length})
          </button>
        ))}
      </div>
      {msg && <p role="alert" className="mt-3 text-sm text-red-700">{msg}</p>}
      {shown.length === 0 && <p className="mt-6 text-sm text-muted">No inquiries in this view.</p>}
      <ul className="mt-4 space-y-3">
        {shown.map((i) => (
          <li key={i.id} className="border border-line bg-white p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="text-base font-medium">{i.name} <span className="font-normal text-muted">· {i.phone ?? "no phone"}</span></p>
              <p className="text-muted">{new Date(i.createdAt).toLocaleString("en-IN")} · <strong className="text-ink">{i.status}</strong></p>
            </div>
            <p className="mt-2 whitespace-pre-wrap">{i.description}</p>
            {i.imagePaths?.length > 0 && <div className="mt-3 flex flex-wrap gap-3">{i.imagePaths.map((p) => <Thumb key={p} path={p} />)}</div>}
            {i.quotedPaise && <p className="mt-2">Quoted: <strong>{formatINR(i.quotedPaise)}</strong></p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input aria-label={`Quote in rupees for ${i.name}`} className="field w-32" inputMode="decimal" placeholder="Quote ₹"
                value={quote[i.id] ?? ""} onChange={(e) => setQuote((q) => ({ ...q, [i.id]: e.target.value }))} />
              <button className="btn-primary" onClick={() => void saveQuote(i)}>Save quote</button>
              {i.phone && <a className="btn-quiet" target="_blank" rel="noreferrer" href={waLink(i)}>Open WhatsApp chat</a>}
              {i.status !== "CLOSED" && <button className="btn-quiet" onClick={() => void close(i)}>Close</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
