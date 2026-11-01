"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "firebase/auth";
import { auth } from "@/lib/firebase";

function safeNext(): string {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
}

export function PhoneLogin() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const verifier = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => () => { verifier.current?.clear(); verifier.current = null; }, []);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^[6-9]\d{9}$/.test(phone)) return setError("Enter a valid 10-digit mobile number.");
    setBusy(true);
    try {
      verifier.current ??= new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      setConfirmation(await signInWithPhoneNumber(auth, `+91${phone}`, verifier.current));
    } catch (err) {
      console.error(err);
      verifier.current?.clear(); verifier.current = null;
      setError("Could not send the code. Check the number and try again.");
    } finally { setBusy(false); }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmation) return;
    setError(""); setBusy(true);
    try {
      await confirmation.confirm(code.trim());
      router.replace(safeNext());
    } catch { setError("That code is not correct. Check it and try again."); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-4xl font-semibold text-emerald">Log in</h1>
      <p className="mt-1 text-sm text-muted">We&rsquo;ll text a one-time code to your mobile number.</p>
      {!confirmation ? (
        <form onSubmit={sendCode} className="mt-6 space-y-4">
          <div>
            <label htmlFor="phone" className="label">Mobile number</label>
            <div className="flex">
              <span className="flex items-center rounded-l-sm border border-r-0 border-line bg-white px-3 text-sm text-muted">+91</span>
              <input id="phone" className="field rounded-l-none" inputMode="numeric" maxLength={10} value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} autoComplete="tel-national" />
            </div>
          </div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-6 space-y-4">
          <div>
            <label htmlFor="code" className="label">6-digit code sent to +91 {phone}</label>
            <input id="code" className="field" inputMode="numeric" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" />
          </div>
          <button className="btn-primary w-full" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Log in"}</button>
          <button type="button" className="btn-quiet w-full" onClick={() => { setConfirmation(null); setCode(""); }}>Use a different number</button>
        </form>
      )}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <div id="recaptcha-container" />
    </div>
  );
}
