import Link from "next/link";
import type { PricingSettings, Product } from "@/types";
import { formatGrams, formatINR, priceUnit } from "@/lib/pricing";
import { AddToCart } from "./add-to-cart";
import { WishlistButton } from "./store-ui";

export function ProductImage({ p, className = "h-56" }: { p: Product; className?: string }) {
  if (p.images?.[0]) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.images[0]} alt={p.name} className={`w-full object-cover transition-transform duration-500 group-hover:scale-105 ${className}`} />;
  }
  return (
    <div className={`flex w-full items-end bg-gradient-to-br from-ivory to-gold p-3 ${className}`}>
      <span className="font-display text-3xl font-semibold text-ink">{formatGrams(p.netWeightMg)}</span>
    </div>
  );
}

export function ProductCard({ p, settings }: { p: Product; settings: PricingSettings }) {
  let total = "Price unavailable";
  try { total = formatINR(priceUnit(p, settings).totalPaise); } catch { /* shown as unavailable */ }
  return (
    <li className="group card-lift flex flex-col border border-line bg-white">
      <div className="relative overflow-hidden">
        <Link href={`/product/${p.id}`}><ProductImage p={p} /></Link>
        <WishlistButton productId={p.id} className="absolute right-3 top-3" />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs uppercase tracking-widest text-golddeep">{p.purity} gold · {p.category}</p>
        <Link href={`/product/${p.id}`}><h2 className="mt-1 text-xl font-semibold">{p.name}</h2></Link>
        <p className="text-sm text-muted">{formatGrams(p.netWeightMg)}</p>
        <p className="mt-2 text-lg">{total}</p>
        <div className="mt-auto pt-3"><AddToCart productId={p.id} disabled={p.stock < 1} /></div>
      </div>
    </li>
  );
}
