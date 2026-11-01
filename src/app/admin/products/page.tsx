"use client";
import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/components/providers";
import { adminFetch } from "@/lib/admin-client";
import { gramsToMg, parseHighlights, parseSpecs, percentToBps, specsToText } from "@/lib/admin-logic";
import { rupeesToPaise } from "@/lib/admin-logic";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, extFor } from "@/lib/inquiry";
import { formatGrams, formatINR } from "@/lib/pricing";

interface Prod { id: string; name: string; category: string; description?: string; highlights?: string[]; specs?: { label: string; value: string }[]; purity: string; netWeightMg: number; makingType: string; makingValue: number; stonePaise: number; fixedPricePaise: number | null; stock: number; active: boolean; images: string[] }
interface Form { id: string; name: string; category: string; description: string; highlights: string; specs: string; purity: string; weight: string; makingType: string; making: string; stone: string; fixed: string; stock: string; active: boolean; images: string[]; files: File[] }

const blank = (): Form => ({ id: "", name: "", category: "", description: "", highlights: "", specs: "", purity: "22K", weight: "", makingType: "PERCENT", making: "10", stone: "0", fixed: "", stock: "0", active: true, images: [], files: [] });
const toForm = (p: Prod): Form => ({
  id: p.id, name: p.name, category: p.category, description: p.description ?? "", highlights: (p.highlights ?? []).join("\n"), specs: specsToText(p.specs), purity: p.purity, weight: String(p.netWeightMg / 1000),
  makingType: p.makingType, making: p.makingType === "PERCENT" ? String(p.makingValue / 100) : (p.makingValue / 100).toFixed(2),
  stone: (p.stonePaise / 100).toFixed(2), fixed: p.fixedPricePaise === null ? "" : (p.fixedPricePaise / 100).toFixed(2), stock: String(p.stock), active: p.active, images: p.images ?? [], files: [],
});

function L({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div><label htmlFor={id} className="label">{label}</label>{children}</div>;
}

export default function ProductsAdmin() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Prod[]>([]);
  const [threshold, setThreshold] = useState(5);
  const [thInput, setThInput] = useState("5");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const a = onSnapshot(collection(db, "products"), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Prod, "id">) })).sort((x, y) => x.name.localeCompare(y.name))), () => setMsg("Could not load products."));
    const b = onSnapshot(doc(db, "settings", "store"), (s) => { const t = Number(s.data()?.lowStockThreshold ?? 5); setThreshold(t); setThInput(String(t)); }, () => {});
    return () => { a(); b(); };
  }, []);

  async function saveThreshold() {
    const n = Number(thInput);
    if (!Number.isInteger(n) || n < 0 || n > 10000) { setMsg("Threshold must be a whole number from 0 to 10000."); return; }
    try { await setDoc(doc(db, "settings", "store"), { lowStockThreshold: n }, { merge: true }); setMsg("Low-stock threshold saved."); } catch { setMsg("Could not save the threshold."); }
  }

  async function quick(p: Prod, body: { active?: boolean }) {
    if (!user) return;
    const r = await adminFetch(user, `/api/admin/products/${p.id}`, body, "PATCH");
    if (!r.ok) setMsg(r.data.error ?? "Update failed.");
  }

  async function remove(p: Prod) {
    if (!user || !window.confirm(`Delete "${p.name}" permanently? Past orders keep their own record of this item.`)) return;
    const r = await adminFetch(user, `/api/admin/products/${p.id}`, {}, "DELETE");
    if (!r.ok) { setMsg(r.data.error ?? "Delete failed."); return; }
    await Promise.all((p.images ?? []).map((u) => deleteObject(ref(storage, u)).catch(() => {})));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form) return;
    setBusy(true); setMsg("");
    try {
      if (form.images.length + form.files.length > 5) throw new Error("A product can have at most 5 images.");
      for (const f of form.files) {
        if (!ALLOWED_IMAGE_TYPES.includes(f.type)) throw new Error("Images must be JPG, PNG or WebP.");
        if (f.size >= MAX_IMAGE_BYTES) throw new Error("Each image must be smaller than 5 MB.");
      }
      const id = isNew ? doc(collection(db, "products")).id : form.id;
      const uploaded: string[] = [];
      for (let i = 0; i < form.files.length; i++) {
        const f = form.files[i]!;
        const r = ref(storage, `products/${id}_${Date.now()}_${i}.${extFor(f.type)}`);
        await uploadBytes(r, f, { contentType: f.type });
        uploaded.push(await getDownloadURL(r));
      }
      const payload = {
        name: form.name, category: form.category, description: form.description, purity: form.purity,
        highlights: parseHighlights(form.highlights), specs: parseSpecs(form.specs),
        netWeightMg: gramsToMg(form.weight), makingType: form.makingType,
        makingValue: form.makingType === "PERCENT" ? percentToBps(form.making, 100, "Making charge") : rupeesToPaise(form.making || "0", "Making charge"),
        stonePaise: rupeesToPaise(form.stone || "0", "Stone charge"),
        fixedPricePaise: form.fixed.trim() === "" ? null : rupeesToPaise(form.fixed, "Fixed price"),
        stock: Number(form.stock), active: form.active, images: [...form.images, ...uploaded],
      };
      const r = isNew ? await adminFetch(user, "/api/admin/products", { id, ...payload }) : await adminFetch(user, `/api/admin/products/${id}`, payload, "PATCH");
      if (!r.ok) throw new Error(r.data.error ?? "Save failed.");
      await Promise.all(removed.map((u) => deleteObject(ref(storage, u)).catch(() => {})));
      setForm(null); setRemoved([]); setMsg("Product saved.");
    } catch (err) { setMsg(err instanceof Error ? err.message : "Save failed."); }
    finally { setBusy(false); }
  }

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f));
  const shown = rows.filter((p) => `${p.name} ${p.category}`.toLowerCase().includes(search.trim().toLowerCase()));
  const warn = rows.filter((p) => p.active && p.stock <= threshold).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl font-semibold">Products</h1>
        <button className="btn-primary" onClick={() => { setForm(blank()); setIsNew(true); setRemoved([]); setMsg(""); }}>Add product</button>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
        <label className="text-muted">Low-stock threshold <input className="field ml-2 inline-block w-20" inputMode="numeric" value={thInput} onChange={(e) => setThInput(e.target.value.replace(/\D/g, ""))} /></label>
        <button className="btn-quiet" onClick={() => void saveThreshold()}>Save</button>
        <input className="field w-60" placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search products" />
      </div>
      {warn > 0 && <p role="alert" className="mt-3 text-sm text-red-700">{warn} product(s) are at or below {threshold} in stock.</p>}
      {msg && <p role="status" className="mt-3 text-sm">{msg}</p>}

      {form && (
        <form onSubmit={submit} className="mt-4 grid gap-4 border border-gold bg-ivory p-4 sm:grid-cols-2">
          <h2 className="text-2xl font-semibold sm:col-span-2">{isNew ? "New product" : `Edit ${form.name}`}</h2>
          <L id="pn" label="Name"><input id="pn" className="field" value={form.name} onChange={set("name")} required /></L>
          <L id="pc" label="Category (e.g. Rings)"><input id="pc" className="field" value={form.category} onChange={set("category")} required /></L>
          <L id="pp" label="Purity"><select id="pp" className="field" value={form.purity} onChange={set("purity")}>{["18K", "22K", "24K"].map((x) => <option key={x}>{x}</option>)}</select></L>
          <L id="pw" label="Net weight (grams, e.g. 0.62)"><input id="pw" className="field" inputMode="decimal" value={form.weight} onChange={set("weight")} required /></L>
          <L id="pt" label="Making charge type"><select id="pt" className="field" value={form.makingType} onChange={set("makingType")}><option value="PERCENT">Percent of gold value</option><option value="FLAT">Flat amount (₹)</option></select></L>
          <L id="pm" label={form.makingType === "PERCENT" ? "Making charge (%)" : "Making charge (₹)"}><input id="pm" className="field" inputMode="decimal" value={form.making} onChange={set("making")} /></L>
          <L id="ps" label="Stone charge (₹)"><input id="ps" className="field" inputMode="decimal" value={form.stone} onChange={set("stone")} /></L>
          <L id="pf" label="Fixed price before GST (₹), leave empty to use the live gold rate"><input id="pf" className="field" inputMode="decimal" value={form.fixed} onChange={set("fixed")} /></L>
          <L id="pk" label="Stock"><input id="pk" className="field" inputMode="numeric" value={form.stock} onChange={set("stock")} /></L>
          <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />Shown in the shop</label>
          <div className="sm:col-span-2"><L id="pd" label="Description"><textarea id="pd" className="field min-h-20" maxLength={1000} value={form.description} onChange={set("description")} /></L></div>
          <div className="sm:col-span-2"><L id="ph" label="Highlights (one per line, up to 6)"><textarea id="ph" className="field min-h-20" value={form.highlights} onChange={set("highlights")} placeholder={"Lightweight everyday design\nSuitable for daily wear"} /></L></div>
          <div className="sm:col-span-2"><L id="psp" label="Specifications (one per line as Label: value, up to 10)"><textarea id="psp" className="field min-h-24" value={form.specs} onChange={set("specs")} placeholder={"Brand: R S Jewellers\nOccasion: Daily wear\nClosure: Push back"} /></L></div>
          <div className="sm:col-span-2">
            <p className="label">Images (up to 5; JPG, PNG or WebP under 5 MB)</p>
            <ul className="mb-2 flex flex-wrap gap-3">{form.images.map((u) => (
              <li key={u}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={u} alt="Product" className="h-20 w-20 border border-line object-cover" />
                <button type="button" className="text-xs underline" onClick={() => { setForm({ ...form, images: form.images.filter((x) => x !== u) }); setRemoved((r) => [...r, u]); }}>Remove</button></li>))}</ul>
            <input type="file" multiple accept={ALLOWED_IMAGE_TYPES.join(",")} onChange={(e) => setForm({ ...form, files: Array.from(e.target.files ?? []) })} className="text-sm" />
            {form.files.length > 0 && <p className="mt-1 text-xs text-muted">{form.files.length} new image(s) will upload when you save.</p>}
          </div>
          <div className="flex gap-3 sm:col-span-2">
            <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save product"}</button>
            <button type="button" className="btn-quiet" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 overflow-x-auto border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-muted"><tr><th className="p-3">Product</th><th>Weight</th><th>Price basis</th><th>Stock</th><th>Actions</th></tr></thead>
          <tbody>{shown.map((p) => (
            <tr key={p.id} className="border-b border-line last:border-0">
              <td className="flex items-center gap-3 p-3">
                {p.images?.[0] /* eslint-disable-next-line @next/next/no-img-element */ ? <img src={p.images[0]} alt="" className="h-12 w-12 object-cover" /> : <span className="h-12 w-12 bg-ivory" />}
                <span>{p.name}<span className="block text-xs text-muted">{p.purity} · {p.category}{p.active ? "" : " · hidden"}</span></span>
              </td>
              <td>{formatGrams(p.netWeightMg)}</td>
              <td>{p.fixedPricePaise !== null ? `Fixed ${formatINR(p.fixedPricePaise)}` : "Live gold rate"}</td>
              <td>{p.stock}{p.stock === 0 ? <span className="ml-2 text-red-700">Out of stock</span> : p.stock <= threshold ? <span className="ml-2 text-amber-700">Low stock</span> : null}</td>
              <td className="space-x-2 whitespace-nowrap">
                <button className="btn-quiet px-3 py-1.5" onClick={() => { setForm(toForm(p)); setIsNew(false); setRemoved([]); setMsg(""); }}>Edit</button>
                <button className="btn-quiet px-3 py-1.5" onClick={() => void quick(p, { active: !p.active })}>{p.active ? "Hide" : "Show"}</button>
                <button className="btn-quiet px-3 py-1.5 text-red-700" onClick={() => void remove(p)}>Delete</button>
              </td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
