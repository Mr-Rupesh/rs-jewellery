import { NextResponse } from "next/server";
import { adminDb } from "@/server/firebase-admin";
import { requireAdmin } from "@/server/admin-auth";
import { parseProductInput, parseProductPatch, slugify } from "@/lib/admin-logic";
import { ValidationError } from "@/lib/validate";

export const runtime = "nodejs";

/** Full edit when the body has a name; otherwise a quick toggle of active/stock. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const ref = adminDb().collection("products").doc(id);
    if (!(await ref.get()).exists) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    if ("name" in body) { const p = parseProductInput(body); await ref.update({ ...p, slug: slugify(p.name), updatedAt: Date.now() }); }
    else await ref.update(parseProductPatch(body));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("product update failed", e);
    return NextResponse.json({ error: "Could not update the product." }, { status: 500 });
  }
}

/** Past orders keep their own item snapshot, so deleting a product never changes order history. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  try {
    await adminDb().collection("products").doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("product delete failed", e);
    return NextResponse.json({ error: "Could not delete the product." }, { status: 500 });
  }
}
