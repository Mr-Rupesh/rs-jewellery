"use client";
import Link from "next/link";
import { ShoppingBag, User } from "lucide-react";
import { useAuth, useCart } from "./providers";

export function Header() {
  const { user, loading } = useAuth();
  const { count } = useCart();
  return (
    <header className="sticky top-0 z-40 border-b border-gold/30 bg-ink/95 text-ivory backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5">
        <Link href="/" className="flex items-center gap-3" aria-label="RS Jewellers home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-light-96.png" alt="" width={44} height={44} className="h-11 w-11" />
          <span className="font-display text-xl font-semibold tracking-wide text-gold">RS Jewellers</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/" className="hidden hover:text-gold sm:inline">Home</Link>
          <Link href="/catalog" className="hover:text-gold">Shop</Link>
          <Link href="/custom-design" className="hover:text-gold">Manufacturing</Link>
          <Link href={!loading && user ? "/account" : "/login?next=/account"} className="flex items-center gap-1 hover:text-gold">
            <User size={18} /><span className="hidden sm:inline">{!loading && user ? "Account" : "Log in"}</span>
          </Link>
          <Link href="/cart" className="relative hover:text-gold" aria-label={`Bag, ${count} items`}>
            <ShoppingBag size={20} />
            {count > 0 && <span className="absolute -right-2 -top-2 rounded-full bg-gold px-1.5 text-[11px] font-medium text-ink">{count}</span>}
          </Link>
        </nav>
      </div>
    </header>
  );
}
