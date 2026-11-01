import { NextResponse } from "next/server";
import { adminAuth } from "./firebase-admin";

/** Returns { uid } for a verified admin, or a ready-made error response. */
export async function requireAdmin(req: Request): Promise<{ uid: string } | NextResponse> {
  const authz = req.headers.get("authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  try {
    const d = await adminAuth().verifyIdToken(token);
    if (d.admin !== true) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    return { uid: d.uid };
  } catch {
    return NextResponse.json({ error: "Session expired. Log in again." }, { status: 401 });
  }
}
