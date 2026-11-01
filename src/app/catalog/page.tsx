import Link from "next/link";
import { getSettings, listActiveProducts } from "@/server/catalog";
import { ProductCard } from "@/components/product-card";

export const dynamic = "force-dynamic";

export default async function Catalog({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; purity?: string }> }) {
  const { q = "", category = "", purity = "" } = await searchParams;
  let all, settings;
  try { settings = await getSettings(); all = await listActiveProducts(); }
  catch (e) { return <p className="border border-line bg-white p-4 text-sm">{e instanceof Error ? e.message : "Catalogue unavailable."}</p>; }

  const categories = [...new Set(all.map((p) => p.category))].sort();
  const needle = q.trim().toLowerCase();
  const shown = all.filter((p) =>
    (!category || p.category === category) && (!purity || p.purity === purity) &&
    (!needle || `${p.name} ${p.category} ${p.purity} ${p.description ?? ""}`.toLowerCase().includes(needle)));

  return (
    <div>
      <h1 className="text-5xl font-semibold">Find your forever piece.</h1>
      <form action="/catalog" className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <input name="q" defaultValue={q} className="field" placeholder="Search jewellery" aria-label="Search jewellery" />
        <select name="category" defaultValue={category} className="field" aria-label="Category">
          <option value="">All categories</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select name="purity" defaultValue={purity} className="field" aria-label="Gold purity">
          <option value="">All purities</option>{["18K", "22K", "24K"].map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <button className="btn-primary">Search</button>
      </form>
      <p className="mt-4 text-sm text-muted">{shown.length} {shown.length === 1 ? "piece" : "pieces"}</p>
      {shown.length === 0
        ? <p className="mt-6">No jewellery matches your search. <Link href="/catalog" className="text-golddeep underline">Clear filters</Link></p>
        : <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{shown.map((p) => <ProductCard key={p.id} p={p} settings={settings} />)}</ul>}
    </div>
  );
}
