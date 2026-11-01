import Link from "next/link";
import { Gem, MessageCircle, Scale, ShieldCheck } from "lucide-react";
import { getSettings, listActiveProducts } from "@/server/catalog";
import type { PricingSettings, Product } from "@/types";
import { ProductCard } from "@/components/product-card";

export const dynamic = "force-dynamic";

const TRUST = [
  { Icon: Scale, title: "Today's gold rate", text: "Priced by weight at the live rate shown on every page." },
  { Icon: Gem, title: "Custom designs", text: "Send a sketch and our manufacturing team will quote it." },
  { Icon: ShieldCheck, title: "Secure payment", text: "Pay safely online through Razorpay." },
  { Icon: MessageCircle, title: "Personal service", text: "Order updates and help on WhatsApp." },
];

export default async function Home() {
  let all: Product[] = [];
  let settings: PricingSettings | null = null;
  try { settings = await getSettings(); all = await listActiveProducts(); } catch { /* page still renders without products */ }
  const featured = all.slice(0, 4);
  const categories = [...new Set(all.map((p) => p.category))].slice(0, 4).map((c) => ({ name: c, image: all.find((p) => p.category === c)?.images?.[0] }));

  return (
    <div className="space-y-20">
      {/* Hero: cover photo with a dark overlay for the headline */}
      <section className="full-bleed relative -mt-8 overflow-hidden bg-ink text-ivory">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/cover-1920.jpg" srcSet="/brand/cover-960.jpg 960w, /brand/cover-1920.jpg 1920w" sizes="100vw" fetchPriority="high"
          alt="A gold pendant necklace resting in an open black jewellery box" className="absolute inset-0 h-full w-full object-cover object-[70%_50%]" />
        <div className="absolute inset-0 bg-ink/55 sm:hidden" />
        <div className="absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(23,18,14,0.9)_0%,rgba(23,18,14,0.55)_50%,rgba(23,18,14,0)_100%)] sm:block" />
        <div className="relative mx-auto max-w-6xl px-4 py-24 sm:py-36">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-gold">Retail &amp; manufacturing &middot; Mumbai</p>
          <h1 className="mt-4 max-w-xl text-5xl font-semibold leading-[1.1] sm:text-7xl">Crafted to be timeless.</h1>
          <p className="mt-5 max-w-md text-lg text-ivory/80">Lightweight gold jewellery, priced by weight at today&rsquo;s gold rate.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/catalog" className="btn-primary px-7 py-3">Shop the collection</Link>
            <Link href="/custom-design" className="btn border border-gold px-7 py-3 text-gold hover:bg-gold hover:text-ink">Custom design</Link>
          </div>
        </div>
      </section>

      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {TRUST.map(({ Icon, title, text }) => (
          <li key={title} className="flex gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold/60 text-golddeep"><Icon size={20} /></span>
            <span><span className="block font-medium">{title}</span><span className="text-sm text-muted">{text}</span></span>
          </li>
        ))}
      </ul>

      {settings && featured.length > 0 && (
        <section>
          <div className="flex items-end justify-between">
            <div><p className="eyebrow">New &amp; popular</p><h2 className="mt-2 text-4xl font-semibold">Featured collection</h2><div className="gold-rule" /></div>
            <Link href="/catalog" className="text-sm text-golddeep underline">Browse all</Link>
          </div>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{featured.map((p) => <ProductCard key={p.id} p={p} settings={settings} />)}</ul>
        </section>
      )}

      {categories.length > 0 && (
        <section>
          <p className="eyebrow">Explore</p><h2 className="mt-2 text-4xl font-semibold">Shop by category</h2><div className="gold-rule" />
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((c) => (
              <li key={c.name}>
                <Link href={`/catalog?category=${encodeURIComponent(c.name)}`} className="card-lift group relative flex h-48 items-end overflow-hidden bg-ink p-5">
                  {c.image /* eslint-disable-next-line @next/next/no-img-element */ && <img src={c.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60 transition-transform duration-500 group-hover:scale-105" />}
                  <span className="absolute inset-0 bg-gradient-to-t from-ink/90 to-ink/10" />
                  <span className="relative font-display text-2xl text-gold">{c.name} <span aria-hidden>&rarr;</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid overflow-hidden md:grid-cols-2">
        <div className="bg-ivory p-8 sm:p-14">
          <p className="eyebrow">Manufacturing</p>
          <h2 className="mt-3 text-4xl font-semibold">Made with care. Made for you.</h2>
          <div className="gold-rule" />
          <p className="mt-5 text-muted">Custom designs, wholesale supply and product development. Send us a sketch or a reference photo and we will reply with a quote.</p>
          <Link href="/custom-design" className="btn-primary mt-7 px-7 py-3">Start a custom design</Link>
        </div>
        <div className="relative flex min-h-64 items-center justify-center bg-[radial-gradient(ellipse_at_center,#2b2218,#17120E_70%)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-light-320.png" alt="" width={220} height={220} className="h-52 w-52 opacity-90" />
        </div>
      </section>

      <blockquote className="mx-auto max-w-2xl text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-gold-160.png" alt="" width={72} height={72} className="mx-auto mb-4 h-[72px] w-[72px]" />
        <p className="font-display text-3xl leading-snug">Jewellery is not what you wear. It is what you keep.</p>
      </blockquote>
    </div>
  );
}
