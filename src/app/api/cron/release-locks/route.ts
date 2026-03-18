import { NextRequest, NextResponse } from "next/server";
import { getAllETLocks, releaseETLock } from "@/lib/et-wallet";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const locks = await getAllETLocks();
  const now = Math.floor(Date.now() / 1000);
  const due = locks.filter((l: any) => l.status === "locked" && Number(l.unlockTimestamp) <= now);

  if (!due.length) return NextResponse.json({ released: 0, message: "No locks due" });

  const results = [];
  for (const lock of due) {
    try {
      const txSig = await releaseETLock(lock.id);
      results.push({ id: lock.id, winner: lock.winner, txSig, status: "released" });
    } catch (e: any) {
      results.push({ id: lock.id, error: e.message, status: "failed" });
    }
  }
  return NextResponse.json({ released: results.filter(r => r.status === "released").length, results });
}
