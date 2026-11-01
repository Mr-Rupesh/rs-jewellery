import { NextResponse } from "next/server";
import { parseItems, ValidationError } from "@/lib/validate";
import { quoteItems } from "@/server/catalog";
import { RateLimiter, clientIp } from "@/lib/rate-limit";

const limiter = new RateLimiter(60, 60_000);

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!limiter.check(clientIp(req))) return NextResponse.json({ error: "Too many requests. Please wait a minute." }, { status: 429 });
  try {
    const body = (await req.json()) as { items?: unknown };
    const items = parseItems(body.items);
    return NextResponse.json(await quoteItems(items));
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("quote failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Quote failed" }, { status: 500 });
  }
}
