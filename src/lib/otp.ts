import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_TTL_MS = 10 * 60 * 1000;       // a code is valid for 10 minutes
export const OTP_MAX_ATTEMPTS = 5;              // wrong guesses allowed per code
export const RESEND_COOLDOWN_MS = 30 * 1000;    // minimum gap between two codes for one email
export const MAX_SENDS_PER_HOUR = 5;            // codes per email per hour
const HOUR_MS = 60 * 60 * 1000;

/** Server secret for hashing codes. Required in production; a fixed value is used only while developing. */
export const otpSecret = (): string => process.env.OTP_SECRET || (process.env.NODE_ENV !== "production" ? "dev-only-otp-secret-change-me" : "");

export const normalizeEmail = (s: string): string => s.trim().toLowerCase();
/** Document id for an email. A hash, so the address itself is not used as an id. */
export const emailDocId = (email: string): string => createHash("sha256").update(normalizeEmail(email)).digest("hex");
export const generateCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** Only a keyed hash of the code is stored, never the code itself. */
export const hashCode = (code: string, email: string, secret: string): string =>
  createHmac("sha256", secret).update(`${normalizeEmail(email)}:${code}`).digest("hex");

export function codeMatches(code: string, email: string, secret: string, expectedHash: string): boolean {
  const a = Buffer.from(hashCode(code, email, secret)), b = Buffer.from(expectedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface OtpRecord { codeHash: string; expiresAt: number; attempts: number; lastSentAt: number; windowStart: number; sendCount: number }

export type SendDecision = { ok: true; windowStart: number; sendCount: number } | { ok: false; retryAfterSec: number };

/** May we email a new code to this address now? Enforces a 30 s gap and 5 codes per hour. */
export function checkSend(rec: OtpRecord | null, now: number): SendDecision {
  if (!rec) return { ok: true, windowStart: now, sendCount: 1 };
  const sinceLast = now - rec.lastSentAt;
  if (sinceLast < RESEND_COOLDOWN_MS) return { ok: false, retryAfterSec: Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000) };
  const inWindow = now - rec.windowStart < HOUR_MS;
  const count = inWindow ? rec.sendCount : 0;
  if (count >= MAX_SENDS_PER_HOUR) return { ok: false, retryAfterSec: Math.ceil((rec.windowStart + HOUR_MS - now) / 1000) };
  return { ok: true, windowStart: inWindow ? rec.windowStart : now, sendCount: count + 1 };
}

export type VerifyOutcome = "OK" | "NO_CODE" | "EXPIRED" | "LOCKED" | "WRONG";

/** Judge one guess. "WRONG" must be recorded by the caller (attempts + 1); "OK" must delete the record (single use). */
export function evaluateAttempt(rec: OtpRecord | null, code: string, email: string, secret: string, now: number): VerifyOutcome {
  if (!rec) return "NO_CODE";
  if (now > rec.expiresAt) return "EXPIRED";
  if (rec.attempts >= OTP_MAX_ATTEMPTS) return "LOCKED";
  return codeMatches(code, email, secret, rec.codeHash) ? "OK" : "WRONG";
}
