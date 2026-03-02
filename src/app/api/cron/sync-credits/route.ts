import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REGISTRATIONS_KEY = "et:rewards:registrations";

interface Registration {
  wallet: string;
  einsteinId: string;
  einsteinName: string;
  totalCredit: number;
  recentCredit: number;
  registeredAt: string;
  lastSynced: string;
}

async function fetchEinsteinUser(userId: string): Promise<{ name: string; totalCredit: number; recentCredit: number } | null> {
  try {
    const url = `https://einsteinathome.org/show_user.php?userid=${encodeURIComponent(userId)}&format=xml`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const text = await res.text();

    const nameMatch = text.match(/<n>([^<]*)<\/name>/);
    const nMatch = text.match(/<n>([^<]*)<\/n>/);
    const totalMatch = text.match(/<total_credit>([\d.]+)<\/total_credit>/);
    const recentMatch = text.match(/<expavg_credit>([\d.]+)<\/expavg_credit>/);

    const name = nameMatch?.[1] || nMatch?.[1];
    if (!name && !totalMatch) return null;

    return {
      name: name || `User ${userId}`,
      totalCredit: parseFloat(totalMatch?.[1] || "0"),
      recentCredit: parseFloat(recentMatch?.[1] || "0"),
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const registrations = await kv.get<Registration[]>(REGISTRATIONS_KEY) || [];

    if (registrations.length === 0) {
      return NextResponse.json({ synced: 0, message: "No registrations" });
    }

    let synced = 0;
    let failed = 0;
    const now = new Date().toISOString();

    // Sync each user with a small delay to be polite to Einstein@home servers
    for (const reg of registrations) {
      const user = await fetchEinsteinUser(reg.einsteinId);
      if (user) {
        reg.einsteinName = user.name;
        reg.totalCredit = user.totalCredit;
        reg.recentCredit = user.recentCredit;
        reg.lastSynced = now;
        synced++;
      } else {
        failed++;
      }
      // 500ms delay between requests to be respectful
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    await kv.set(REGISTRATIONS_KEY, registrations);

    console.log(`[Sync Credits] Synced ${synced}/${registrations.length} users, ${failed} failed`);

    return NextResponse.json({ synced, failed, total: registrations.length });
  } catch (e) {
    console.error("[Sync Credits] Error:", e);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
