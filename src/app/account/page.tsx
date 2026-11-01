"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth, useCart } from "@/components/providers";
import { ChatPanel } from "@/components/chat";
import { formatINR } from "@/lib/pricing";
import { validateReturn } from "@/lib/admin-logic";
import type { QuoteLine } from "@/types";

interface MyOrder { id: string; address?: { phone?: string }; status: string; totalPaise: number; createdAt: number; invoiceNo?: string; carrier?: string; tracking?: string; items: { name: string; qty: number }[] }
interface MyReturn { id: string; type: string; status: string; reason: string; adminNote?: string; createdAt: number }
const TABS = [["orders", "My orders"], ["wishlist", "Wishlist"], ["returns", "Returns"], ["support", "Support"], ["profile", "Profile"]] as const;

export default function AccountPage() {
  const router = useRouter();
  const { user, loading, signOut, wishlist, toggleWishlist } = useAuth();
  const { add } = useCart();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("orders");
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [returns, setReturns] = useState<MyReturn[]>([]);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState("");
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [returnFor, setReturnFor] = useState<string | null>(null);
  const [rType, setRType] = useState("RETURN");
  const [rReason, setRReason] = useState("");
  const [rError, setRError] = useState("");

  useEffect(() => { if (!loading && !user) router.replace("/login?next=/account"); }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    const off = [
      onSnapshot(query(collection(db, "orders"), where("uid", "==", user.uid)),
        (s) => setOrders(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MyOrder, "id">) })).sort((a, b) => b.createdAt - a.createdAt)), () => {}),
      onSnapshot(query(collection(db, "returns"), where("uid", "==", user.uid)),
        (s) => setReturns(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MyReturn, "id">) })).sort((a, b) => b.createdAt - a.createdAt)), () => {}),
      onSnapshot(doc(db, "users", user.uid), (s) => setName(String(s.data()?.name ?? user.displayName ?? "")), () => {}),
    ];
    return () => off.forEach((f) => f());
  }, [user]);

  useEffect(() => {
    if (tab !== "wishlist" || wishlist.length === 0) { setLines([]); return; }
    fetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: wishlist.slice(0, 20).map((productId) => ({ productId, qty: 1 })) }) })
      .then((r) => r.json()).then((d) => setLines(d.lines ?? [])).catch(() => setLines([]));
  }, [tab, wishlist]);

  async function submitReturn(o: MyOrder) {
    if (!user) return;
    const problem = validateReturn({ type: rType, reason: rReason });
    if (problem) { setRError(problem); return; }
    setRError("");
    try {
      await setDoc(doc(db, "returns", o.id), { uid: user.uid, orderId: o.id, type: rType, reason: rReason.trim(), status: "REQUESTED", createdAt: Date.now(), name, phone: o.address?.phone ? `+91${o.address.phone}` : (user.phoneNumber ?? null) });
      setReturnFor(null); setRReason("");
    } catch { setRError("Could not send the request. Please try again."); }
  }

  async function saveName() {
    if (!user) return;
    try { await setDoc(doc(db, "users", user.uid), { name: name.trim().slice(0, 80) }, { merge: true }); setSaved("Saved."); }
    catch { setSaved("Could not save."); }
  }

  if (loading || !user) return <p className="text-muted">Loading your account…</p>;

  return (
    <div>
      <h1 className="text-5xl font-semibold">Your account</h1>
      <nav className="mt-6 flex flex-wrap gap-5 border-b border-line text-sm" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`pb-2 ${tab === k ? "border-b-2 border-gold font-medium" : "text-muted hover:text-ink"}`}>{label}</button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "orders" && (orders.length === 0
          ? <p>No orders yet. <Link href="/catalog" className="text-golddeep underline">Browse the collection</Link></p>
          : <ul className="space-y-3">
              {orders.map((o) => {
                const ret = returns.find((r) => r.id === o.id);
                return (
                  <li key={o.id} className="border border-line bg-white p-4 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="font-medium">Order {o.id.slice(0, 8)} <span className="font-normal text-muted">· {new Date(o.createdAt).toLocaleDateString("en-IN")}</span></p>
                      <p><strong>{o.status}</strong> · {formatINR(o.totalPaise)}</p>
                    </div>
                    <p className="mt-1 text-muted">{o.items.map((i) => `${i.name} × ${i.qty}`).join(", ")}</p>
                    {(o.carrier || o.tracking) && <p className="mt-1">Shipped via {o.carrier || "courier"}{o.tracking ? ` · ${o.tracking}` : ""}</p>}
                    <div className="mt-2 flex flex-wrap gap-3">
                      <Link className="text-golddeep underline" href={`/orders/${o.id}`}>Details</Link>
                      {o.invoiceNo && <Link className="text-golddeep underline" href={`/orders/${o.id}/invoice`}>Invoice</Link>}
                      {o.status === "DELIVERED" && !ret && <button className="text-golddeep underline" onClick={() => { setReturnFor(returnFor === o.id ? null : o.id); setRError(""); }}>Return or exchange</button>}
                      {ret && <span>Return request: <strong>{ret.status}</strong></span>}
                    </div>
                    {returnFor === o.id && (
                      <div className="mt-3 space-y-2 border-t border-line pt-3">
                        <select className="field w-48" value={rType} onChange={(e) => setRType(e.target.value)} aria-label="Request type">
                          <option value="RETURN">Return</option><option value="EXCHANGE">Exchange</option>
                        </select>
                        <textarea className="field min-h-24" value={rReason} maxLength={1000} onChange={(e) => setRReason(e.target.value)} placeholder="Tell us what is wrong" aria-label="Reason" />
                        {rError && <p role="alert" className="text-red-700">{rError}</p>}
                        <button className="btn-primary" onClick={() => void submitReturn(o)}>Send request</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>)}

        {tab === "wishlist" && (wishlist.length === 0
          ? <p>Your wishlist is empty. Tap the heart on any piece to save it.</p>
          : <ul className="space-y-3">
              {lines.map((l) => (
                <li key={l.productId} className="flex flex-wrap items-center justify-between gap-3 border border-line bg-white p-4 text-sm">
                  <div><Link href={`/product/${l.productId}`} className="text-lg font-semibold">{l.name}</Link>{l.error && <p className="text-red-700">{l.error}</p>}</div>
                  <div className="flex items-center gap-3">
                    <span>{l.unit ? formatINR(l.unit.totalPaise) : "—"}</span>
                    <button className="btn-primary" disabled={!!l.error} onClick={() => add(l.productId)}>Add to cart</button>
                    <button className="text-muted underline" onClick={() => void toggleWishlist(l.productId)}>Remove</button>
                  </div>
                </li>
              ))}
            </ul>)}

        {tab === "returns" && (returns.length === 0
          ? <p>No return or exchange requests. You can request one from a delivered order.</p>
          : <ul className="space-y-3">{returns.map((r) => (
              <li key={r.id} className="border border-line bg-white p-4 text-sm">
                <p><strong>{r.type}</strong> for order {r.id.slice(0, 8)} · {r.status}</p>
                <p className="mt-1 text-muted">{r.reason}</p>
                {r.adminNote && <p className="mt-1">Store note: {r.adminNote}</p>}
              </li>))}</ul>)}

        {tab === "support" && <div className="max-w-xl"><ChatPanel threadId={user.uid} role="customer" customerName={name} /></div>}

        {tab === "profile" && (
          <div className="max-w-sm space-y-4">
            <p className="text-sm">Signed in as <strong>{user.email ?? user.phoneNumber ?? "-"}</strong></p>
            <div><label htmlFor="pname" className="label">Your name</label><input id="pname" className="field" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setSaved(""); }} /></div>
            <div className="flex items-center gap-3"><button className="btn-primary" onClick={() => void saveName()}>Save</button>{saved && <span role="status" className="text-sm">{saved}</span>}</div>
            <button className="btn-quiet" onClick={async () => { await signOut(); router.push("/"); }}>Log out</button>
          </div>
        )}
      </div>
    </div>
  );
}
