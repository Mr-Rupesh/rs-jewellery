import { NextResponse } from "next/server";
import { adminDb } from "@/server/firebase-admin";
import { requireAdmin } from "@/server/admin-auth";
import { isStalePending } from "@/lib/admin-logic";

export const runtime = "nodejs";

/** Cancels unpaid orders older than 48h. A late payment on one is flagged for review by the webhook. */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const db = adminDb();
    const snap = await db.collection("orders").where("status", "==", "PENDING").limit(400).get();
    const now = Date.now();
    const stale = snap.docs.filter((d) => isStalePending({ status: d.data().status, createdAt: d.data().createdAt ?? now }, now));
    const batch = db.batch();
    stale.forEach((d) => batch.update(d.ref, { status: "CANCELLED", cancelReason: "ABANDONED", updatedAt: now }));
    if (stale.length) await batch.commit();
    return NextResponse.json({ ok: true, cancelled: stale.length });
  } catch (e) {
    console.error("cleanup failed", e);
    return NextResponse.json({ error: "Cleanup failed." }, { status: 500 });
  }
}
