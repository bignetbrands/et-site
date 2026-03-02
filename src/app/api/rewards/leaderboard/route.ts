import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const dynamic = "force-dynamic";

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

export async function GET() {
  try {
    const registrations = await kv.get<Registration[]>(REGISTRATIONS_KEY) || [];

    // Sort by total credit descending
    const sorted = [...registrations].sort((a, b) => b.totalCredit - a.totalCredit);
    const totalCredits = sorted.reduce((sum, r) => sum + r.totalCredit, 0);

    // Return leaderboard (hide full wallet addresses)
    const leaderboard = sorted.map((r, i) => ({
      rank: i + 1,
      name: r.einsteinName,
      wallet: r.wallet.slice(0, 4) + "..." + r.wallet.slice(-4),
      totalCredit: r.totalCredit,
      recentCredit: r.recentCredit,
      share: totalCredits > 0 ? ((r.totalCredit / totalCredits) * 100) : 0,
      lastSynced: r.lastSynced,
    }));

    return NextResponse.json({
      leaderboard,
      stats: {
        totalMembers: registrations.length,
        totalCredits,
        lastUpdated: registrations.length > 0
          ? registrations.reduce((latest, r) => r.lastSynced > latest ? r.lastSynced : latest, registrations[0].lastSynced)
          : null,
      },
    });
  } catch (e) {
    console.error("[Rewards] Leaderboard error:", e);
    return NextResponse.json({ leaderboard: [], stats: { totalMembers: 0, totalCredits: 0, lastUpdated: null } });
  }
}
