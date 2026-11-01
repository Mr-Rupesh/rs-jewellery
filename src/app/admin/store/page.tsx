"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { parsePincodes } from "@/lib/admin-logic";
import { LEGAL_DEFAULTS, LEGAL_KEYS, LEGAL_TITLES, type LegalKey } from "@/lib/legal-defaults";

export default function StorePages() {
  const [pins, setPins] = useState("");
  const [pinsLoaded, setPinsLoaded] = useState(false);
  const [pinMsg, setPinMsg] = useState("");
  const [saved, setSaved] = useState<Partial<Record<LegalKey, string>>>({});
  const [key, setKey] = useState<LegalKey>("terms");
  const [text, setText] = useState(LEGAL_DEFAULTS.terms);
  const [legalMsg, setLegalMsg] = useState("");

  useEffect(() => {
    let first = true;
    const a = onSnapshot(doc(db, "settings", "service"), (s) => { if (first) setPins(((s.data()?.pincodes as string[] | undefined) ?? []).join(", ")); first = false; setPinsLoaded(true); }, () => setPinMsg("Could not load PIN codes."));
    const b = onSnapshot(doc(db, "settings", "legal"), (s) => setSaved((s.data() ?? {}) as Partial<Record<LegalKey, string>>), () => {});
    return () => { a(); b(); };
  }, []);

  // load the chosen policy into the editor (saved text if any, otherwise the default)
  useEffect(() => { setText(saved[key] && saved[key]!.trim() ? saved[key]! : LEGAL_DEFAULTS[key]); setLegalMsg(""); }, [key, saved]);

  async function savePins() {
    try {
      const list = parsePincodes(pins);
      await setDoc(doc(db, "settings", "service"), { pincodes: list, updatedAt: Date.now() });
      setPins(list.join(", "));
      setPinMsg(list.length ? `Saved. Delivering to ${list.length} PIN code(s).` : "Saved. The list is empty, so we deliver everywhere.");
    } catch (e) { setPinMsg(e instanceof Error ? e.message : "Could not save."); }
  }

  async function saveLegal() {
    if (text.trim().length < 20) { setLegalMsg("The text is too short."); return; }
    if (text.length > 40000) { setLegalMsg("The text is too long (maximum 40,000 characters)."); return; }
    try { await setDoc(doc(db, "settings", "legal"), { [key]: text }, { merge: true }); setLegalMsg("Saved. The public page is updated."); }
    catch { setLegalMsg("Could not save."); }
  }

  const placeholders = (text.match(/\[[^\]\n]{2,60}\]/g) ?? []).length;
  return (
    <div className="space-y-12">
      <section className="max-w-xl">
        <h1 className="text-4xl font-semibold">Delivery area</h1>
        <p className="mt-2 text-sm text-muted">Customers can only check out if their PIN code is on this list. Leave it empty to deliver everywhere. Separate codes with commas, spaces or new lines.</p>
        <textarea className="field mt-3 min-h-24" value={pins} onChange={(e) => { setPins(e.target.value); setPinMsg(""); }} aria-label="Serviceable PIN codes" disabled={!pinsLoaded} />
        <div className="mt-3 flex items-center gap-3"><button className="btn-primary" onClick={() => void savePins()} disabled={!pinsLoaded}>Save PIN codes</button>{pinMsg && <span role="status" className="text-sm">{pinMsg}</span>}</div>
      </section>

      <section>
        <h2 className="text-3xl font-semibold">Policy pages</h2>
        <p className="mt-1 text-sm text-muted">Use <code># Title</code>, <code>## Heading</code>, <code>- bullet</code>, <code>1. numbered</code> and <code>**bold**</code>. Leave a blank line between paragraphs.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="tablist">
          {LEGAL_KEYS.map((k) => (
            <button key={k} role="tab" aria-selected={key === k} onClick={() => setKey(k)} className={`btn ${key === k ? "bg-ink text-ivory" : "border border-line bg-white"}`}>{LEGAL_TITLES[k]}</button>))}
        </div>
        <textarea className="field mt-3 min-h-[28rem] font-mono text-xs" value={text} onChange={(e) => { setText(e.target.value); setLegalMsg(""); }} aria-label={`${LEGAL_TITLES[key]} text`} />
        {placeholders > 0 && <p role="alert" className="mt-2 text-sm text-red-700">This text still has {placeholders} [bracketed] placeholder(s). Replace them before launch.</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn-primary" onClick={() => void saveLegal()}>Save</button>
          <button className="btn-quiet" onClick={() => { if (window.confirm("Replace the editor text with the original default?")) setText(LEGAL_DEFAULTS[key]); }}>Reset to default</button>
          <Link className="text-sm text-golddeep underline" href={`/policies/${key}`} target="_blank">View public page</Link>
          {legalMsg && <span role="status" className="text-sm">{legalMsg}</span>}
        </div>
      </section>
    </div>
  );
}
