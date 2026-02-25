import { NextResponse } from "next/server";
import { processReplies } from "@/lib/orchestrator";
import { isKillSwitchActive } from "@/lib/kill-switch";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/manual/replies
 *
 * Manually trigger reply processing from the bot dashboard.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { secret } = body;

    if (secret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (await isKillSwitchActive()) {
      return NextResponse.json({
        error: "Kill switch is active. Resume ET first.",
      }, { status: 400 });
    }

    console.log("[ET Manual] Processing replies...");
    const results = await processReplies();

    const posted = results.filter((r) => !r.skipped);
    const skipped = results.filter((r) => r.skipped);

    return NextResponse.json({
      success: true,
      replied: posted.length,
      skipped: skipped.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[ET Manual] Reply error:", error);
    return NextResponse.json(
      {
        error: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
