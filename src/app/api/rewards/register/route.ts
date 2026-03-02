import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const dynamic = "force-dynamic";

const REGISTRATIONS_KEY = "et:rewards:registrations";
const ET_TEAM_ID = "233793";
const ET_TEAM_URL = "https://einsteinathome.org/community/teams/233793";

export interface Registration {
  wallet: string;
  einsteinId: string;
  einsteinName: string;
  totalCredit: number;
  recentCredit: number;
  registeredAt: string;
  lastSynced: string;
}

/** Fetch user info from Einstein@home BOINC XML API */
async function fetchEinsteinUser(userId: string): Promise<{
  name: string;
  totalCredit: number;
  recentCredit: number;
  teamId: string;
} | null> {
  try {
    const url = `https://einsteinathome.org/show_user.php?userid=${encodeURIComponent(userId)}&format=xml`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const text = await res.text();

    const nameMatch = text.match(/<name>([^<]*)<\/name>/);
    const nMatch = text.match(/<n>([^<]*)<\/n>/);
    const totalMatch = text.match(/<total_credit>([\d.]+)<\/total_credit>/);
    const recentMatch = text.match(/<expavg_credit>([\d.]+)<\/expavg_credit>/);
    const teamMatch = text.match(/<teamid>(\d+)<\/teamid>/);

    const name = nameMatch?.[1] || nMatch?.[1];
    if (!name && !totalMatch) return null;

    return {
      name: name || `User ${userId}`,
      totalCredit: parseFloat(totalMatch?.[1] || "0"),
      recentCredit: parseFloat(recentMatch?.[1] || "0"),
      teamId: teamMatch?.[1] || "0",
    };
  } catch (err) {
    console.error(`[Rewards] Failed to fetch Einstein@home user ${userId}:`, err);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { wallet, einsteinId } = await request.json();

    if (!wallet || typeof wallet !== "string" || wallet.length < 32 || wallet.length > 44) {
      return NextResponse.json({ error: "Invalid Solana wallet address" }, { status: 400 });
    }
    if (!einsteinId || typeof einsteinId !== "string" || !/^\d+$/.test(einsteinId.trim())) {
      return NextResponse.json({ error: "BOINC ID must be numeric (found on your Account Credentials page)" }, { status: 400 });
    }

    const id = einsteinId.trim();

    // Verify user exists on Einstein@home
    const eUser = await fetchEinsteinUser(id);
    if (!eUser) {
      return NextResponse.json({
        error: "User not found. Make sure you're using your BOINC ID (Account Credentials page), not the number from your profile URL.",
      }, { status: 404 });
    }

    // Verify user is on Team $ET
    if (eUser.teamId !== ET_TEAM_ID) {
      return NextResponse.json({
        error: `You must join Team $ET on Einstein@home before registering. Go to ${ET_TEAM_URL} and click "Join this team", then try again.`,
        teamRequired: true,
        teamUrl: ET_TEAM_URL,
      }, { status: 403 });
    }

    // Load existing registrations
    const registrations = await kv.get<Registration[]>(REGISTRATIONS_KEY) || [];

    // Check for duplicate wallet
    const existingWallet = registrations.findIndex(r => r.wallet === wallet);
    if (existingWallet >= 0) {
      registrations[existingWallet].einsteinId = id;
      registrations[existingWallet].einsteinName = eUser.name;
      registrations[existingWallet].totalCredit = eUser.totalCredit;
      registrations[existingWallet].recentCredit = eUser.recentCredit;
      registrations[existingWallet].lastSynced = new Date().toISOString();
      await kv.set(REGISTRATIONS_KEY, registrations);

      return NextResponse.json({
        success: true,
        updated: true,
        name: eUser.name,
        totalCredit: eUser.totalCredit,
      });
    }

    // Check for duplicate Einstein ID
    const existingEinstein = registrations.find(r => r.einsteinId === id);
    if (existingEinstein) {
      return NextResponse.json({
        error: "This Einstein@home account is already registered with another wallet.",
      }, { status: 409 });
    }

    // Max 500 registrations
    if (registrations.length >= 500) {
      return NextResponse.json({ error: "Registration is full." }, { status: 400 });
    }

    // Create new registration
    const reg: Registration = {
      wallet,
      einsteinId: id,
      einsteinName: eUser.name,
      totalCredit: eUser.totalCredit,
      recentCredit: eUser.recentCredit,
      registeredAt: new Date().toISOString(),
      lastSynced: new Date().toISOString(),
    };

    registrations.push(reg);
    await kv.set(REGISTRATIONS_KEY, registrations);

    return NextResponse.json({
      success: true,
      name: eUser.name,
      totalCredit: eUser.totalCredit,
    });
  } catch (e) {
    console.error("[Rewards] Register error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
