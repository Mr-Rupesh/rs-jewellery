"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthProvider, signInWithCustomToken, signInWithPopup } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { isValidEmail, safeNextPath } from "@/lib/validate";

type Step = "form" | "code";
type Reply = { ok: boolean; status: number; data: { error?: string; retryAfterSec?: number; token?: string } };

async function post(url: string, body: unknown): Promise<Reply> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

/** Google sign-in, or a 6-digit code emailed to the customer. No SMS, so no per-login cost. */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const next = () => safeNextPath(new URLSearchParams(window.location.search).get("next"));

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const address = email.trim().toLowerCase();
    if (!isValidEmail(address)) { setError("Enter a valid email address."); return; }
    setBusy(true); setError("");
    try {
      const r = await post("/api/otp/send", { email: address });
      if (r.ok) { setEmail(address); setCode(""); setStep("code"); setCooldown(30); }
      else { setError(r.data.error ?? "Could not send the code. Please try again."); if (r.data.retryAfterSec) { setEmail(address); setStep("code"); setCooldown(r.data.retryAfterSec); } }
    } catch { setError("Could not reach the server. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) { setError("Enter the 6-digit code from your email."); return; }
    setBusy(true); setError("");
    try {
      const r = await post("/api/otp/verify", { email, code });
      if (!r.ok || !r.data.token) { setError(r.data.error ?? "Could not sign you in. Please try again."); return; }
      await signInWithCustomToken(auth, r.data.token);
      router.replace(next());
    } catch { setError("Could not sign you in. Please try again."); }
    finally { setBusy(false); }
  }

  async function google() {
    setBusy(true); setError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      router.replace(next());
    } catch (err) {
      const c = (err as { code?: string }).code ?? "";
      if (c !== "auth/popup-closed-by-user" && c !== "auth/cancelled-popup-request")
        setError("Google sign-in did not work here. Use the email code instead, or open this page in Chrome or Safari.");
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-4xl font-semibold">Log in or sign up</h1>
      <p className="mt-1 text-sm text-muted">Use your Google account, or we will email you a 6-digit code. No password needed.</p>

      {step === "form" && (
        <div className="mt-6 space-y-4">
          <button type="button" className="btn-quiet w-full py-3" onClick={() => void google()} disabled={busy}>Continue with Google</button>
          <p className="text-center text-xs uppercase tracking-widest text-muted">or</p>
          <form onSubmit={sendCode} className="space-y-3">
            <div>
              <label htmlFor="email" className="label">Email address</label>
              <input id="email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
            </div>
            <button className="btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Email me a code"}</button>
          </form>
        </div>
      )}

      {step === "code" && (
        <form onSubmit={verify} className="mt-6 space-y-3">
          <p className="text-sm">We sent a 6-digit code to <strong>{email}</strong>. It expires in 10 minutes. If you can&rsquo;t see it, check your spam folder.</p>
          <div>
            <label htmlFor="code" className="label">6-digit code</label>
            <input id="code" className="field text-center font-mono text-xl tracking-[0.4em]" inputMode="numeric" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" autoFocus />
          </div>
          <button className="btn-primary w-full" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Log in"}</button>
          <div className="flex justify-between text-sm">
            <button type="button" className="underline disabled:no-underline disabled:opacity-50" disabled={busy || cooldown > 0} onClick={() => void sendCode()}>
              {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
            </button>
            <button type="button" className="underline" onClick={() => { setStep("form"); setError(""); }}>Use a different email</button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </div>
  );
}
