"use client";
import { useCallback, useEffect, useState } from "react";
import type { QuoteLine } from "@/types";
import type { CartItem } from "@/components/providers";

export type Quote = { lines: QuoteLine[]; ok: boolean; totalPaise: number };

export function useQuote(items: CartItem[], ready: boolean) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify(items);

  const refresh = useCallback(async () => {
    if (!ready || items.length === 0) { setQuote(null); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load prices");
      setQuote(data);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load prices"); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  useEffect(() => { refresh(); }, [refresh]);
  return { quote, error, loading, refresh };
}
