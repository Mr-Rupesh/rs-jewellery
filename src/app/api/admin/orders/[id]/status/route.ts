import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/admin-auth";
import { changeOrderStatus } from "@/server/orders";
import { parseStatusChange } from "@/lib/admin-logic";
import { ValidationError } from "@/lib/validate";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  try {
    const { status, tracking, carrier } = parseStatusChange(await req.json());
    const r = await changeOrderStatus(id, status, tracking, carrier);
    if (r.code !== 200) return NextResponse.json({ error: r.error }, { status: r.code });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("status change failed", e);
    return NextResponse.json({ error: "Could not update the order." }, { status: 500 });
  }
}
