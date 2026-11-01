import { notFound } from "next/navigation";
import { getProduct, getSettings } from "@/server/catalog";
import { formatGrams, formatINR, priceUnit } from "@/lib/pricing";
import { AddToCart } from "@/components/add-to-cart";
import { ProductImage } from "@/components/product-card";
import { WishlistButton } from "@/components/store-ui";
import { SHOP } from "@/lib/shop";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  try {
    const p = await getProduct((await params).id);
    return { title: p ? `${p.name} | RS Jewellers` : "Product | RS Jewellers" };
  } catch { return { title: "Product | RS Jewellers" }; }
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getProduct(id);
  if (!p || !p.active) notFound();
  let price: string | null = null;
  try { price = formatINR(priceUnit(p, await getSettings()).totalPaise); } catch { /* shown as unavailable */ }

  const specs: [string, string][] = [
    ["Category", p.category], ["Metal", `${p.purity} gold`], ["Net weight", formatGrams(p.netWeightMg)],
    ...(p.specs ?? []).map((s): [string, string] => [s.label, s.value]),
    ["Sold by", SHOP.name],
  ];

  return (
    <div className="space-y-10">
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <ProductImage p={p} className="h-96" />
          {p.images.length > 1 && (
            <ul className="mt-2 flex gap-2">{p.images.slice(1).map((u) => (
              // eslint-disable-next-line @next/next/no-img-element
              <li key={u}><img src={u} alt={`${p.name} view`} className="h-20 w-20 border border-line object-cover" /></li>))}</ul>
          )}
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-golddeep">{p.category}</p>
          <h1 className="mt-1 text-4xl font-semibold">{p.name}</h1>
          <p className="mt-4 font-display text-4xl">{price ?? "Price unavailable"}</p>
          <p className="text-sm text-muted">Inclusive of all taxes</p>
          <p className={`mt-3 text-sm font-medium ${p.stock > 0 ? "text-green-700" : "text-red-700"}`}>{p.stock > 0 ? "In stock" : "Out of stock"}</p>
          <div className="mt-5 flex items-center gap-3">
            <AddToCart productId={p.id} disabled={p.stock < 1 || !price} />
            <WishlistButton productId={p.id} className="border border-line" />
          </div>
          {(p.highlights ?? []).length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold">Highlights</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{p.highlights!.map((h) => <li key={h}>{h}</li>)}</ul>
            </div>
          )}
        </div>
      </div>

      <section className="max-w-3xl">
        <h2 className="text-2xl font-semibold">Specifications</h2>
        <dl className="mt-3 border border-line bg-white text-sm">
          {specs.map(([k, v], i) => (
            <div key={`${k}-${i}`} className="grid grid-cols-[10rem_1fr] border-b border-line last:border-0">
              <dt className="bg-ivory p-3 text-muted">{k}</dt><dd className="p-3">{v}</dd>
            </div>))}
        </dl>
      </section>

      {p.description && (
        <section className="max-w-3xl">
          <h2 className="text-2xl font-semibold">Description</h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted">{p.description}</p>
        </section>
      )}
    </div>
  );
}
