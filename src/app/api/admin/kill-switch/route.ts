import { NextResponse } from "next/server";
import { getKillSwitch, setKillSwitch } from "@/lib/kill-switch";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/kill-switch
 * Check kill switch status.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const enabled = await getKillSwitch();
  return NextResponse.json({
    killSwitch: enabled,
    status: enabled ? "PAUSED — ET is silent" : "ACTIVE — ET is posting",
  });
}

/**
 * POST /api/admin/kill-switch
 * Toggle kill switch. Body: { enabled: boolean }
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const enabled = body.enabled === true;
    await setKillSwitch(enabled);

    return NextResponse.json({
      killSwitch: enabled,
      status: enabled
        ? "⚠️ KILL SWITCH ENGAGED — ET will not post until re-enabled"
        : "✅ Kill switch disengaged — ET is active",
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to set kill switch" },
      { status: 500 }
    );
  }
}
