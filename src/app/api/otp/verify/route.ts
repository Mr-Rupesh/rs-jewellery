import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/server/firebase-admin";
import { isValidEmail } from "@/lib/validate";
import { emailDocId, evaluateAttempt, normalizeEmail, otpSecret, type OtpRecord } from "@/lib/otp";
import { RateLimiter, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
const ipLimiter = new RateLimiter(20, 10 * 60_000);
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/** Checks the code. On success returns a Firebase custom token that the browser exchanges for a login. */
export async function POST(req: Request) {
  if (!ipLimiter.check(clientIp(req))) return json({ error: "Too many attempts. Please wait a few minutes." }, 429);
  const body = (await req.json().catch(() => ({}))) as { email?: unknown; code?: unknown };
  if (typeof body.email !== "string" || !isValidEmail(body.email)) return json({ error: "Enter a valid email address." }, 400);
  if (typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) return json({ error: "Enter the 6-digit code." }, 400);
  const email = normalizeEmail(body.email), code = body.code;
  const secret = otpSecret();
  if (!secret) return json({ error: "Login by email is not configured." }, 503);

  const ref = adminDb().collection("email_otps").doc(emailDocId(email));
  const outcome = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const rec = (snap.data() as OtpRecord | undefined) ?? null;
    const o = evaluateAttempt(rec, code, email, secret, Date.now());
    if (o === "OK") tx.delete(ref);                                           // single use
    else if (o === "WRONG" && rec) tx.update(ref, { attempts: rec.attempts + 1 }); // count the wrong guess
    return o;
  });
  if (outcome === "LOCKED") return json({ error: "Too many wrong attempts. Please request a new code." }, 429);
  if (outcome === "NO_CODE" || outcome === "EXPIRED") return json({ error: "That code has expired. Please request a new one." }, 400);
  if (outcome === "WRONG") return json({ error: "That code is not correct." }, 400);

  try {
    // Same email as an existing Google/earlier account => same user (the code proves they own the mailbox).
    const auth = adminAuth();
    const user = await auth.getUserByEmail(email).catch(() => null) ?? await auth.createUser({ email, emailVerified: true });
    return json({ token: await auth.createCustomToken(user.uid) });
  } catch (e) {
    console.error("otp sign-in failed", e);
    return json({ error: "Could not sign you in. Please try again." }, 500);
  }
}
