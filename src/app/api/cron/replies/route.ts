import { NextResponse } from "next/server";
import { processReplies, interactWithTarget } from "@/lib/orchestrator";
import { isKillSwitchActive } from "@/lib/kill-switch";
import { getNextTarget, getLastMentionId, setLastMentionId } from "@/lib/store";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/replies
 *
 * Called by Vercel cron every 15 minutes.
 * 1. Fetches new mentions and replies to them in character.
 * 2. Processes one community target if any are queued.
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

    // KV health check — if we can't persist reply tracking, don't process.
    // Without working KV, hasReplied always returns false → re-replies to
    // every mention every 15 minutes → spam.
    try {
      const probe = await getLastMentionId();
      await setLastMentionId(probe ?? "health_check");
      const verify = await getLastMentionId();
      if (verify === null) {
        console.error("[ET Replies Cron] KV write failed — refusing to process replies");
        return NextResponse.json({
          processed: 0,
          reason: "KV unavailable — skipping to prevent duplicate replies",
          timestamp: new Date().toISOString(),
        });
      }
      // Restore original value if we overwrote with health_check
      if (probe && verify === "health_check") {
        await setLastMentionId(probe);
      }
    } catch (kvError) {
      console.error("[ET Replies Cron] KV health check failed:", kvError);
      return NextResponse.json({
        processed: 0,
        reason: "KV health check failed — skipping to prevent duplicate replies",
        timestamp: new Date().toISOString(),
      });
    }

    // 1. Process mentions
    const results = await processReplies();

    const posted = results.filter((r) => !r.skipped);
    const skipped = results.filter((r) => r.skipped);

    console.log(
      `[ET Replies Cron] Mentions: ${posted.length} replied, ${skipped.length} skipped`
    );

    // 2. Process one community target (25% chance per run to keep it organic)
    let targetResult = null;
    if (Math.random() < 0.25) {
      const nextTarget = await getNextTarget();
      if (nextTarget) {
        console.log(`[ET Replies Cron] Processing target: @${nextTarget.handle} (${nextTarget.votes} votes, forced: ${!!nextTarget.forced})`);
        targetResult = await interactWithTarget(nextTarget.handle);
      }
    }

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
      target: targetResult
        ? {
            handle: targetResult.success ? targetResult.replyText?.substring(0, 80) : undefined,
            success: targetResult.success,
            error: targetResult.error || undefined,
          }
        : null,
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
