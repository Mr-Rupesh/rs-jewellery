import { NextResponse } from "next/server";
import { adminDb } from "@/server/firebase-admin";
import { requireAdmin } from "@/server/admin-auth";
import { parseProductInput, slugify } from "@/lib/admin-logic";
import { ValidationError } from "@/lib/validate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (typeof body.id !== "string" || !/^[A-Za-z0-9_-]{5,40}$/.test(body.id)) throw new ValidationError("Invalid product id");
    const p = parseProductInput(body);
    const ref = adminDb().collection("products").doc(body.id);
    if ((await ref.get()).exists) return NextResponse.json({ error: "A product with this id already exists." }, { status: 409 });
    const now = Date.now();
    await ref.set({ ...p, slug: slugify(p.name), createdAt: now, updatedAt: now });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("product create failed", e);
    return NextResponse.json({ error: "Could not create the product." }, { status: 500 });
  }
}
