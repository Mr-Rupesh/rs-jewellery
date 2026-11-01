import { NextResponse } from "next/server";
import { extractCaptured, verifySignature } from "@/lib/webhook";
import { markOrderPaid } from "@/server/orders";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
  const raw = await req.text(); // must be the exact raw body for the signature check
  if (!verifySignature(raw, req.headers.get("x-razorpay-signature"), secret))
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  let event: unknown;
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }

  const captured = extractCaptured(event);
  if (!captured) return NextResponse.json({ ok: true, ignored: true }); // other events: acknowledge

  try {
    const result = await markOrderPaid(captured.ourOrderId, captured);
    if (result === "MISMATCH" || result === "NEEDS_REVIEW") console.warn("webhook needs review", captured.ourOrderId, result);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("webhook processing failed", e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 }); // non-2xx makes Razorpay retry
  }
}
