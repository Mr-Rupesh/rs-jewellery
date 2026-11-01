import Link from "next/link";
import { SHOP } from "@/lib/shop";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-gold/40 bg-ink text-ivory print:hidden">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-[1fr_auto]">
        <div className="flex gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-light-96.png" alt="" width={64} height={64} className="h-16 w-16 shrink-0" />
          <div className="text-ivory/70">
            <p className="font-display text-xl text-gold">{SHOP.name}</p>
            <p className="mt-1">{SHOP.address}</p>
            <p>{SHOP.phone} &middot; {SHOP.email}</p>
            {SHOP.gstin && <p>GSTIN: {SHOP.gstin}</p>}
          </div>
        </div>
        <nav className="flex flex-col gap-1.5 text-ivory/70" aria-label="Policies">
          <Link href="/policies/terms" className="hover:text-gold">Terms &amp; Conditions</Link>
          <Link href="/policies/privacy" className="hover:text-gold">Privacy Policy</Link>
          <Link href="/policies/shipping" className="hover:text-gold">Shipping &amp; Delivery</Link>
          <Link href="/policies/returns" className="hover:text-gold">Returns &amp; Exchange</Link>
          <Link href="/policies/cancellation" className="hover:text-gold">Cancellation &amp; Refund</Link>
        </nav>
      </div>
      <p className="border-t border-gold/20 py-3 text-center text-xs text-ivory/50">&copy; {new Date().getFullYear()} {SHOP.name}. All rights reserved.</p>
    </footer>
  );
}
