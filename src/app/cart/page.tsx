"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth, useCart } from "@/components/providers";
import { useQuote } from "@/lib/use-quote";
import { formatINR, formatGrams } from "@/lib/pricing";
import { isServiceable, isStalePending } from "@/lib/admin-logic";

type PinState = "unknown" | "yes" | "no" | "invalid" | "error";
interface RecentOrder { id: string; status: string; totalPaise: number; createdAt: number }

/** The customer's latest orders. Renders nothing for guests (the list is empty when nobody is logged in). */
function RecentOrders({ orders }: { orders: RecentOrder[] }) {
  if (orders.length === 0) return null;
  return (
    <section className="mt-10 max-w-2xl" aria-labelledby="recent-orders">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="recent-orders" className="text-2xl font-semibold">Your recent orders</h2>
        <Link href="/account" className="text-sm text-golddeep underline">View all orders</Link>
      </div>
      <ul className="mt-3 divide-y divide-line border border-line bg-white text-sm">
        {orders.map((o) => (
          <li key={o.id}>
            <Link href={`/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-ivory">
              <span>Order {o.id.slice(0, 8)} <span className="text-muted">· {new Date(o.createdAt).toLocaleDateString("en-IN")}</span></span>
              <span><strong>{o.status}</strong> · {formatINR(o.totalPaise)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function CartPage() {
  const { user } = useAuth();
  const { items, ready, setQty, remove } = useCart();
  const { quote, error, loading } = useQuote(items, ready);
  const [pin, setPin] = useState("");
  const [pinState, setPinState] = useState<PinState>("unknown");
  const [served, setServed] = useState<string[]>([]);
  const [orders, setOrders] = useState<RecentOrder[]>([]);

  useEffect(() => {
    if (!user) { setOrders([]); return; }
    return onSnapshot(query(collection(db, "orders"), where("uid", "==", user.uid)),
      (s) => {
        const now = Date.now();
        setOrders(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RecentOrder, "id">) }))
          .filter((o) => o.status !== "CANCELLED" && !isStalePending(o, now, 1)) // hide cancelled and abandoned attempts
          .sort((a, b) => b.createdAt - a.createdAt).slice(0, 3));
      }, () => setOrders([]));
  }, [user]);

  async function check(p: string) {
    if (!/^[1-9]\d{5}$/.test(p)) { setPinState("invalid"); return; }
    try {
      const d = (await getDoc(doc(db, "settings", "service"))).data();
      const list = Array.isArray(d?.pincodes) ? (d!.pincodes as string[]) : [];
      setServed(list);
      setPinState(isServiceable(p, list) ? "yes" : "no");
      try { localStorage.setItem("rs_pin", p); } catch { /* storage unavailable */ }
    } catch { setPinState("error"); }
  }

  useEffect(() => {
    try {
      const p = localStorage.getItem("rs_pin");
      if (p && /^[1-9]\d{5}$/.test(p)) { setPin(p); void check(p); }
    } catch { /* storage unavailable */ }
  }, []);

  if (ready && items.length === 0)
    return (
      <div>
        <h1 className="text-4xl font-semibold">Your bag is empty</h1>
        <Link href="/catalog" className="btn-primary mt-6">Browse the collection</Link>
        <RecentOrders orders={orders} />
      </div>
    );

  return (
    <div>
      <h1 className="text-4xl font-semibold">Bag</h1>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <ul className="mt-6 divide-y divide-line border border-line bg-white">
        {(quote?.lines ?? []).map((l) => (
          <li key={l.productId} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-lg font-semibold">{l.name}</p>
              {l.netWeightMg !== undefined && <p className="text-sm text-muted">{l.purity} · {formatGrams(l.netWeightMg)}</p>}
              {l.error && <p role="alert" className="text-sm text-red-700">{l.error}</p>}
            </div>
            <div className="flex items-center gap-4">
              <label className="text-sm text-muted">Qty
                <input type="number" min={1} max={10} value={l.qty} className="field ml-2 inline-block w-16" onChange={(e) => setQty(l.productId, Number(e.target.value) || 1)} />
              </label>
              <span className="w-28 text-right">{l.lineTotalPaise !== undefined ? formatINR(l.lineTotalPaise) : "—"}</span>
              <button className="text-sm text-muted underline hover:text-ink" onClick={() => remove(l.productId)}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
      {loading && !quote && <p className="mt-4 text-sm text-muted">Loading prices…</p>}

      <section className="mt-6 max-w-md border border-line bg-white p-4">
        <h2 className="text-xl font-semibold">Delivery availability</h2>
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void check(pin); }}>
          <input className="field" inputMode="numeric" maxLength={6} placeholder="Enter 6-digit PIN code" value={pin} aria-label="PIN code"
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setPinState("unknown"); }} />
          <button className="btn-quiet">Check</button>
        </form>
        <p role="status" className="mt-2 text-sm">
          {pinState === "yes" && <span className="text-green-700">Delivery is available to {pin}.</span>}
          {pinState === "no" && <span className="text-red-700">Sorry, we do not deliver to {pin} yet. We currently serve: {served.join(", ")}.</span>}
          {pinState === "invalid" && <span className="text-red-700">Enter a valid 6-digit PIN code.</span>}
          {pinState === "error" && <span className="text-red-700">Could not check right now. Please try again.</span>}
        </p>
      </section>

      {quote && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xl">Total <strong>{formatINR(quote.totalPaise)}</strong> <span className="text-sm text-muted">inclusive of all taxes</span></p>
          {!quote.ok ? <p className="text-sm text-red-700">Fix the items above to continue.</p>
            : pinState === "no" ? <button className="btn-primary" disabled>Not deliverable to {pin}</button>
            : <Link href="/checkout" className="btn-primary">Continue to checkout</Link>}
        </div>
      )}

      <RecentOrders orders={orders} />
    </div>
  );
}
