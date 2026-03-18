import { NextRequest, NextResponse } from "next/server";
import { releaseETLock } from "@/lib/et-wallet";

export const maxDuration = 60;

function auth(req: NextRequest) {
  return req.headers.get("authorization") === `Bearer ${process.env.ADMIN_SECRET}`;
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { lockId } = await req.json();
  if (!lockId) return NextResponse.json({ error: "Missing lockId" }, { status: 400 });
  try {
    const txSig = await releaseETLock(lockId);
    return NextResponse.json({ success: true, txSig });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
