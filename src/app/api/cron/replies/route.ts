import { NextResponse } from "next/server";
import { processReplies } from "@/lib/orchestrator";
import { isKillSwitchActive } from "@/lib/kill-switch";
import { kvHealthCheck } from "@/lib/store";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/replies
 *
 * Called by Vercel cron every 5 minutes.
 * ~30% chance to skip each cycle for natural response timing (3-9 min range).
 * 1. Fetches new mentions and replies to them in character.
 * 2. Processes one community target if any are queued (~5% chance per run).
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

    // Quiet hours — no polling 11PM-9AM EST (saves ~40% of daily API calls)
    const nowEST = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const hour = nowEST.getHours();
    if (hour >= 23 || hour < 9) {
      return NextResponse.json({
        processed: 0,
        reason: `Quiet hours (${hour}:00 EST — polling resumes at 9AM)`,
        timestamp: new Date().toISOString(),
      });
    }

    // Global action throttle — prevents stacking with tweet/notis crons
    const { canAct, recordAction } = await import("@/lib/store");
    const throttle = await canAct();
    if (!throttle.allowed) {
      return NextResponse.json({
        processed: 0,
        reason: throttle.reason,
        timestamp: new Date().toISOString(),
      });
    }

    // Random skip for human-like response timing (~15% skip rate)
    // With 10-min cron: replies arrive 10-14 min after mention on average
    if (Math.random() < 0.15) {
      console.log("[ET Replies Cron] Random skip — adding human delay");
      return NextResponse.json({
        processed: 0,
        reason: "Human delay skip",
        timestamp: new Date().toISOString(),
      });
    }

    // Adaptive backoff — poll less when no mentions are coming in
    const { shouldSkipAdaptivePoll } = await import("@/lib/store");
    const adaptive = await shouldSkipAdaptivePoll();
    if (adaptive.skip) {
      console.log(`[ET Replies Cron] Adaptive skip — ${adaptive.emptyStreak} empty polls, effective interval: ${adaptive.effectiveInterval}`);
      return NextResponse.json({
        processed: 0,
        reason: `Adaptive backoff (${adaptive.emptyStreak} empty polls, ~${adaptive.effectiveInterval})`,
        timestamp: new Date().toISOString(),
      });
    }

    // KV health check — if we can't persist reply tracking, don't process.
    const kvOk = await kvHealthCheck();
    if (!kvOk) {
      console.error("[ET Replies Cron] KV health check failed — refusing to process replies");
      return NextResponse.json({
        processed: 0,
        reason: "KV unavailable — skipping to prevent duplicate replies",
        timestamp: new Date().toISOString(),
      });
    }

    // 1. Process mentions (max 1 per run due to MAX_REPLIES_PER_RUN)
    const results = await processReplies();

    const posted = results.filter((r) => !r.skipped);
    const skipped = results.filter((r) => r.skipped);

    // Record global action if we actually posted a reply
    if (posted.length > 0) {
      await recordAction();
    }

    console.log(
      `[ET Replies Cron] Mentions: ${posted.length} replied, ${skipped.length} skipped`
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
      target: null,
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
