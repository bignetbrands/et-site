import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await kv.del("last_mention_id");
  return NextResponse.json({ success: true, message: "last_mention_id cleared — reply cron will start fresh on @etalienx" });
}
