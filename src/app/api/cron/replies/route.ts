import { NextResponse } from "next/server";
import { processReplies } from "@/lib/orchestrator";
import { isKillSwitchActive } from "@/lib/kill-switch";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/replies
 *
 * Called by Vercel cron every 15 minutes.
 * Fetches new mentions and replies to them in character.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (await isKillSwitchActive()) {
      console.log("[ET Replies Cron] Kill switch active — skipping");
      return NextResponse.json({
        processed: 0,
        reason: "Kill switch active",
        timestamp: new Date().toISOString(),
      });
    }

    const results = await processReplies();

    const posted = results.filter((r) => !r.skipped);
    const skipped = results.filter((r) => r.skipped);

    console.log(
      `[ET Replies Cron] Done: ${posted.length} replied, ${skipped.length} skipped`
    );

    return NextResponse.json({
      processed: results.length,
      replied: posted.length,
      skipped: skipped.length,
      results: results.map((r) => ({
        mentionId: r.mentionId,
        author: r.authorUsername,
        mention: r.mentionText.substring(0, 80),
        reply: r.replyText.substring(0, 80) || undefined,
        skipped: r.skipped || undefined,
        skipReason: r.skipReason || undefined,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[ET Replies Cron] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
