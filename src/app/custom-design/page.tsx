"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/components/providers";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGES, extFor, validateInquiry } from "@/lib/inquiry";

export default function CustomDesignPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => { if (!loading && !user) router.replace("/login?next=/custom-design"); }, [loading, user, router]);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const problem = validateInquiry({ name, phone, description, files });
    if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    try {
      const inquiryRef = doc(collection(db, "custom_inquiries"));
      const imagePaths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i]!;
        const path = `custom_inquiries/${user.uid}/${inquiryRef.id}_${i}.${extFor(f.type)}`;
        await uploadBytes(ref(storage, path), f, { contentType: f.type });
        imagePaths.push(path);
      }
      await setDoc(inquiryRef, {
        uid: user.uid, name: name.trim(), phone: `+91${phone.trim()}`, email: user.email ?? null,
        description: description.trim(), imagePaths, status: "NEW", createdAt: Date.now(),
      });
      setDone(true);
    } catch (err) {
      console.error(err);
      setError("Could not send your request. Check your connection and try again.");
    } finally { setBusy(false); }
  }

  if (loading || !user) return <p className="text-muted">Checking your login…</p>;
  if (done)
    return (
      <div role="status">
        <h1 className="text-4xl font-semibold text-emerald">Request received</h1>
        <p className="mt-2 max-w-md text-muted">Thank you. We will review your design and message you on WhatsApp with a quote.</p>
      </div>
    );

  return (
    <form onSubmit={submit} className="max-w-lg space-y-4">
      <h1 className="text-4xl font-semibold text-emerald">Custom design</h1>
      <p className="text-sm text-muted">Tell us what you would like made. Add up to {MAX_IMAGES} sketches or reference photos. We will reply with a quote.</p>
      <div>
        <label htmlFor="name" className="label">Your name</label>
        <input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>
      <div>
        <label htmlFor="phone" className="label">Mobile number (we will send your quote on WhatsApp)</label>
        <input id="phone" className="field" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} autoComplete="tel-national" />
      </div>
      <div>
        <label htmlFor="desc" className="label">Describe the design (metal, size, weight, occasion)</label>
        <textarea id="desc" className="field min-h-32" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        <p className="mt-1 text-xs text-muted">{description.length}/2000</p>
      </div>
      <div>
        <label htmlFor="imgs" className="label">Sketches or photos (JPG, PNG or WebP, under 5 MB each)</label>
        <input id="imgs" type="file" multiple accept={ALLOWED_IMAGE_TYPES.join(",")} className="text-sm"
          onChange={(e) => { setFiles(Array.from(e.target.files ?? []).slice(0, MAX_IMAGES + 1)); }} />
        {previews.length > 0 && (
          <ul className="mt-3 flex gap-3">
            {previews.map((u, i) => (
              <li key={u}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt={`Selected image ${i + 1}`} className="h-20 w-20 border border-line object-cover" />
                <button type="button" className="mt-1 text-xs text-muted underline" onClick={() => setFiles((cur) => cur.filter((_, k) => k !== i))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button className="btn-primary" disabled={busy}>{busy ? "Sending…" : "Send request"}</button>
    </form>
  );
}
