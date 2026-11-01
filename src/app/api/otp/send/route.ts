import { NextResponse } from "next/server";
import { adminDb } from "@/server/firebase-admin";
import { sendEmail } from "@/server/email";
import { isValidEmail } from "@/lib/validate";
import { OTP_TTL_MS, checkSend, emailDocId, generateCode, hashCode, normalizeEmail, otpSecret, type OtpRecord } from "@/lib/otp";
import { RateLimiter, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
const ipLimiter = new RateLimiter(10, 10 * 60_000);
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/** Emails a 6-digit login code. The answer is the same whether or not the address already has an account. */
export async function POST(req: Request) {
  if (!ipLimiter.check(clientIp(req))) return json({ error: "Too many requests. Please wait a few minutes." }, 429);
  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  if (typeof body.email !== "string" || !isValidEmail(body.email)) return json({ error: "Enter a valid email address." }, 400);
  const email = normalizeEmail(body.email);
  const secret = otpSecret();
  if (!secret) return json({ error: "Login by email is not configured." }, 503);

  const ref = adminDb().collection("email_otps").doc(emailDocId(email));
  const now = Date.now();
  const result = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const decision = checkSend((snap.data() as OtpRecord | undefined) ?? null, now);
    if (!decision.ok) return decision;
    const code = generateCode();
    tx.set(ref, { codeHash: hashCode(code, email, secret), expiresAt: now + OTP_TTL_MS, attempts: 0, lastSentAt: now, windowStart: decision.windowStart, sendCount: decision.sendCount } satisfies OtpRecord);
    return { ok: true as const, code };
  });
  if (!result.ok) return json({ error: `Please wait ${result.retryAfterSec} seconds before asking for another code.`, retryAfterSec: result.retryAfterSec }, 429);

  const sent = await sendEmail({
    to: email,
    subject: `${result.code} is your RS Jewellers login code`,
    text: `Your RS Jewellers login code is ${result.code}\n\nIt expires in 10 minutes. If you did not ask for it, you can ignore this email.`,
  });
  if (sent === "NOT_CONFIGURED" || sent === "FAILED") {
    await ref.delete().catch(() => {}); // let the customer try again straight away
    return json({ error: sent === "FAILED" ? "We could not send the email. Please try again." : "Login by email is not configured." }, sent === "FAILED" ? 502 : 503);
  }
  return json({ ok: true });
}
