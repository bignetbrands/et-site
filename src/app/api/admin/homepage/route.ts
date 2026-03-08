import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const dynamic = "force-dynamic";

const HOMEPAGE_KEY = "et:homepage_mode";

export async function GET() {
  try {
    const mode = (await kv.get<string>(HOMEPAGE_KEY)) || "new";
    return NextResponse.json({ mode });
  } catch {
    return NextResponse.json({ mode: "new" });
  }
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const current = (await kv.get<string>(HOMEPAGE_KEY)) || "new";
    const next = current === "new" ? "research" : "new";
    await kv.set(HOMEPAGE_KEY, next);
    return NextResponse.json({ mode: next, previous: current });
  } catch (e) {
    return NextResponse.json({ error: `Failed: ${e}` }, { status: 500 });
  }
}
