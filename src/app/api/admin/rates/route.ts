import { NextResponse } from "next/server";
import { adminDb } from "@/server/firebase-admin";
import { requireAdmin } from "@/server/admin-auth";
import { NeedsConfirmation, parseGstBps, rupeesToPaise, validateRates } from "@/lib/admin-logic";
import { ValidationError } from "@/lib/validate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const b = (await req.json()) as Record<string, unknown>;
    const next = {
      r18: rupeesToPaise(String(b.rate18k ?? ""), "18K rate"),
      r22: rupeesToPaise(String(b.rate22k ?? ""), "22K rate"),
      r24: rupeesToPaise(String(b.rate24k ?? ""), "24K rate"),
    };
    const gstBps = parseGstBps(String(b.gstPercent ?? ""));

    const db = adminDb();
    const ref = db.doc("settings/pricing");
    const prevSnap = await ref.get();
    const p = prevSnap.data();
    const prev = p ? { r18: p.rate18kPaisePerGram as number, r22: p.rate22kPaisePerGram as number, r24: p.rate24kPaisePerGram as number } : null;
    validateRates(prev, next, b.confirmLargeChange === true);

    const now = Date.now();
    const batch = db.batch();
    batch.set(ref, {
      rate18kPaisePerGram: next.r18, rate22kPaisePerGram: next.r22, rate24kPaisePerGram: next.r24,
      gstBps, updatedAt: now, updatedBy: admin.uid,
    });
    batch.set(ref.collection("rateHistory").doc(), { prev, next, gstBps, at: now, by: admin.uid });
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NeedsConfirmation) return NextResponse.json({ error: "CONFIRM_LARGE_CHANGE", message: e.message }, { status: 409 });
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("rates update failed", e);
    return NextResponse.json({ error: "Could not save rates." }, { status: 500 });
  }
}
