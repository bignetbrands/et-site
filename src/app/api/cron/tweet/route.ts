import { NextResponse } from "next/server";
import { shouldTweet } from "@/lib/scheduler";
import { executeTweet } from "@/lib/orchestrator";
import { isKillSwitchActive } from "@/lib/kill-switch";

export const maxDuration = 60; // Allow up to 60s for image generation
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/tweet
 *
 * Called by Vercel cron every 15 minutes.
 * The scheduler decides whether to actually tweet based on randomized intervals.
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

    // Check for scheduled tweets first
    const { getDueScheduledTweets, removeScheduledTweet, recordTweet } = await import("@/lib/store");
    const { postTweet, postTweetWithImage } = await import("@/lib/twitter");
    const { downloadImage } = await import("@/lib/dalle");

    const dueTweets = await getDueScheduledTweets();
    if (dueTweets.length > 0) {
      const scheduled = dueTweets[0]; // Post one per cron run
      console.log(`[ET Cron] Posting scheduled tweet: "${scheduled.text.substring(0, 60)}..."`);

      let tweetId: string;
      let hasImage = false;

      if (scheduled.imageUrl) {
        try {
          const imageBuffer = await downloadImage(scheduled.imageUrl);
          tweetId = await postTweetWithImage(scheduled.text, imageBuffer);
          hasImage = true;
        } catch {
          tweetId = await postTweet(scheduled.text);
        }
      } else {
        tweetId = await postTweet(scheduled.text);
      }

      await recordTweet({
        id: tweetId,
        text: scheduled.text,
        pillar: scheduled.pillar,
        postedAt: new Date().toISOString(),
        hasImage,
      });
      await removeScheduledTweet(scheduled);

      console.log(`[ET Cron] Scheduled tweet posted: ${tweetId}`);

      return NextResponse.json({
        posted: true,
        scheduled: true,
        tweet: { id: tweetId, text: scheduled.text, pillar: scheduled.pillar, hasImage },
        timestamp: new Date().toISOString(),
      });
    }

    // Normal scheduling
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
    const record = await executeTweet(decision.pillar, decision.useTrending);

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
