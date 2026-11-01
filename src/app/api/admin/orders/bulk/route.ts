import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/admin-auth";
import { changeOrderStatus } from "@/server/orders";
import { parseBulk } from "@/lib/admin-logic";
import { ValidationError } from "@/lib/validate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const { ids, status } = parseBulk(await req.json());
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of ids) {
      const r = await changeOrderStatus(id, status, "", "");
      results.push(r.code === 200 ? { id, ok: true } : { id, ok: false, error: r.error });
    }
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("bulk status failed", e);
    return NextResponse.json({ error: "Bulk update failed." }, { status: 500 });
  }
}
