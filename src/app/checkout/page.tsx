"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useCart } from "@/components/providers";
import { useQuote } from "@/lib/use-quote";
import { formatINR } from "@/lib/pricing";

interface RzpInstance { open(): void; on(ev: string, cb: (r: unknown) => void): void }
type RzpCtor = new (o: Record<string, unknown>) => RzpInstance;

function loadRazorpay(): Promise<RzpCtor | null> {
  const w = window as unknown as { Razorpay?: RzpCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(w.Razorpay ?? null);
    s.onerror = () => resolve(null);
    document.body.appendChild(s);
  });
}

const empty = { name: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "" };

function F({ id, label, ...rest }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (<div><label htmlFor={id} className="label">{label}</label><input id={id} className="field" {...rest} /></div>);
}

export default function CheckoutPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { items, ready, clear } = useCart();
  const { quote, refresh } = useQuote(items, ready);
  const [addr, setAddr] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { if (!authLoading && !user) router.replace("/login?next=/checkout"); }, [authLoading, user, router]);
  useEffect(() => { if (ready && items.length === 0) router.replace("/cart"); }, [ready, items.length, router]);
  useEffect(() => {
    try { const p = localStorage.getItem("rs_pin"); if (p && /^[1-9]\d{5}$/.test(p)) setAddr((a) => ({ ...a, pincode: p })); } catch { /* storage unavailable */ }
  }, []);

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) => setAddr((a) => ({ ...a, [k]: e.target.value }));

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !quote?.ok) return;
    setBusy(true); setMsg("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items, address: addr, expectedTotalPaise: quote.totalPaise }),
      });
      const data = await res.json();
      if (res.status === 409 && data.error === "PRICE_CHANGED") {
        await refresh();
        setMsg(`The gold rate changed. The new total is ${formatINR(data.totalPaise)}. Review it and press Pay again.`);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Could not start payment");

      const Rzp = await loadRazorpay();
      if (!Rzp) throw new Error("Could not load the payment window. Check your connection and try again.");
      const rzp = new Rzp({
        key: data.keyId, amount: data.amount, currency: data.currency, order_id: data.razorpayOrderId,
        name: "RS Jewellers", description: "Gold jewellery order",
        prefill: { name: addr.name, contact: user.phoneNumber ?? addr.phone, email: user.email ?? undefined },
        theme: { color: "#0F3D2E" },
        handler: () => { clear(); router.push(`/orders/${data.orderId}`); },
        modal: { ondismiss: () => { setBusy(false); setMsg("Payment was not completed. You can press Pay to try again."); } },
      });
      rzp.on("payment.failed", () => { setBusy(false); setMsg("Payment failed. You can try again or use another method."); });
      rzp.open();
      return;
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
    setBusy(false);
  }

  if (authLoading || !user) return <p className="text-muted">Checking your login…</p>;

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_280px]">
      <form onSubmit={pay} className="space-y-4">
        <h1 className="text-4xl font-semibold text-emerald">Delivery address</h1>
        <F id="name" value={addr.name} onChange={set("name")} label="Full name" required autoComplete="name" />
        <F id="phone" value={addr.phone} onChange={set("phone")} label="Mobile number for delivery" required inputMode="numeric" maxLength={10} autoComplete="tel-national" />
        <F id="line1" value={addr.line1} onChange={set("line1")} label="Address line 1" required autoComplete="address-line1" />
        <F id="line2" value={addr.line2} onChange={set("line2")} label="Address line 2 (optional)" autoComplete="address-line2" />
        <div className="grid gap-4 sm:grid-cols-3">
          <F id="city" value={addr.city} onChange={set("city")} label="City" required autoComplete="address-level2" />
          <F id="state" value={addr.state} onChange={set("state")} label="State" required autoComplete="address-level1" />
          <F id="pincode" value={addr.pincode} onChange={set("pincode")} label="PIN code" required inputMode="numeric" maxLength={6} autoComplete="postal-code" />
        </div>
        {msg && <p role="alert" className="text-sm text-red-700">{msg}</p>}
        <button className="btn-primary" disabled={busy || !quote?.ok}>{busy ? "Starting payment…" : `Pay ${quote ? formatINR(quote.totalPaise) : ""}`}</button>
      </form>
      <aside className="h-fit border border-line bg-white p-4 text-sm">
        <h2 className="text-xl font-semibold">Your order</h2>
        <ul className="mt-2 space-y-1">
          {quote?.lines.map((l) => (
            <li key={l.productId} className="flex justify-between gap-2"><span>{l.name} × {l.qty}</span><span>{l.lineTotalPaise !== undefined ? formatINR(l.lineTotalPaise) : "—"}</span></li>
          ))}
        </ul>
        <p className="mt-3 border-t border-line pt-2 font-medium">Total {quote ? formatINR(quote.totalPaise) : "—"}</p>
      </aside>
    </div>
  );
}
