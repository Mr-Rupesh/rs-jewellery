import { NextResponse } from "next/server";
import { adminAuth } from "@/server/firebase-admin";
import { adminSyncDecision, parseAdminEmails } from "@/lib/admin-logic";
import { RateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
const limiter = new RateLimiter(30, 60_000);
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/**
 * Keeps the admin permission in step with the server's private ADMIN_EMAILS list.
 * The admin screens call this when they open. The browser then refreshes its login token.
 */
export async function POST(req: Request) {
  const authz = req.headers.get("authorization") ?? "";
  const auth = adminAuth();
  let decoded;
  try { decoded = await auth.verifyIdToken(authz.startsWith("Bearer ") ? authz.slice(7) : ""); }
  catch { return json({ error: "Please log in." }, 401); }
  if (!limiter.check(decoded.uid)) return json({ error: "Too many requests." }, 429);

  const decision = adminSyncDecision({
    isAdminNow: decoded.admin === true,
    viaAllowlist: decoded.adminVia === "allowlist",
    email: decoded.email,
    emailVerified: decoded.email_verified === true,
    allowlist: parseAdminEmails(process.env.ADMIN_EMAILS),
  });
  if (decision === "NOOP") return json({ admin: decoded.admin === true, changed: false });

  try {
    const user = await auth.getUser(decoded.uid);
    if (decision === "GRANT") {
      await auth.setCustomUserClaims(decoded.uid, { ...(user.customClaims ?? {}), admin: true, adminVia: "allowlist" });
      console.log(`[admin] granted admin to ${decoded.email} (${decoded.uid})`);
      return json({ admin: true, changed: true });
    }
    const claims = { ...(user.customClaims ?? {}) } as Record<string, unknown>;
    delete claims.admin; delete claims.adminVia;
    await auth.setCustomUserClaims(decoded.uid, claims);
    console.log(`[admin] withdrew admin from ${decoded.email} (${decoded.uid})`);
    return json({ admin: false, changed: true });
  } catch (e) {
    console.error("admin sync failed", e);
    return json({ error: "Could not update admin access." }, 500);
  }
}
