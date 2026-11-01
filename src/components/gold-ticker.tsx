"use client";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

const inr = (paise: number) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(paise / 100)}`;

export function GoldTicker() {
  const [r, setR] = useState<{ a: number; b: number; c: number } | null>(null);
  useEffect(() => onSnapshot(doc(db, "settings", "pricing"),
    (s) => { const d = s.data(); if (d) setR({ a: d.rate24kPaisePerGram, b: d.rate22kPaisePerGram, c: d.rate18kPaisePerGram }); },
    () => setR(null)), []);
  if (!r) return null;
  return (
    <div className="border-b border-line bg-gold text-sm text-ink print:hidden">
      <p className="mx-auto max-w-5xl px-4 py-1.5">Today&rsquo;s gold per gram: 24K {inr(r.a)} &nbsp;|&nbsp; 22K {inr(r.b)} &nbsp;|&nbsp; 18K {inr(r.c)}</p>
    </div>
  );
}
