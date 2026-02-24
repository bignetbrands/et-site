import { NextResponse } from "next/server";
import { shouldTweet } from "@/lib/scheduler";
import { executeTweet } from "@/lib/orchestrator";
import { isKillSwitchActive } from "@/lib/kill-switch";

export const maxDuration = 60; // Allow up to 60s for image generation
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/tweet
 *
 * Called by Vercel cron every hour.
 * The scheduler decides whether to actually tweet.
 *
 * Protected by CRON_SECRET to prevent unauthorized triggers.
 */
export async function GET(request: Request) {
  // Verify cron secret (Vercel sends this automatically for cron jobs)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check kill switch first
    if (await isKillSwitchActive()) {
      console.log("[ET Cron] Kill switch active — skipping");
      return NextResponse.json({
        posted: false,
        reason: "Kill switch active — ET is paused",
        timestamp: new Date().toISOString(),
      });
    }
    // Ask the scheduler if we should tweet
    const decision = await shouldTweet();

    console.log(`[ET Cron] Decision: ${decision.reason}`);

    if (!decision.shouldTweet || !decision.pillar) {
      return NextResponse.json({
        posted: false,
        reason: decision.reason,
        timestamp: new Date().toISOString(),
      });
    }

    // Execute the tweet
    const record = await executeTweet(decision.pillar);

    if (!record) {
      return NextResponse.json({
        posted: false,
        reason: "Tweet generation or posting failed",
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      posted: true,
      tweet: {
        id: record.id,
        text: record.text,
        pillar: record.pillar,
        hasImage: record.hasImage,
      },
      reason: decision.reason,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[ET Cron] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
