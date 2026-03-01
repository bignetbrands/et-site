import { NextResponse } from "next/server";
import { isKillSwitchActive } from "@/lib/kill-switch";
import {
  getWatchlist,
  getWatchlistLastSeen,
  setWatchlistLastSeen,
  kvHealthCheck,
  hasQuotedTweet,
  markTweetQuoted,
  recordUserInteraction,
  hasHitUserLimit,
  recordTweet,
} from "@/lib/store";

export const maxDuration = 30; // Keep it fast
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/notis
 *
 * Called every 2 minutes by Vercel cron.
 * Polls watchlist accounts for new tweets and replies instantly.
 * Goal: reply within 1-2 minutes of a VIP account posting.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (await isKillSwitchActive()) {
      return NextResponse.json({ skipped: true, reason: "Kill switch active" });
    }

    const kvOk = await kvHealthCheck();
    if (!kvOk) {
      return NextResponse.json({ skipped: true, reason: "KV unavailable" });
    }

    const watchlist = await getWatchlist();
    if (watchlist.length === 0) {
      return NextResponse.json({ skipped: true, reason: "Watchlist empty" });
    }

    const { getUserRecentTweets } = await import("@/lib/twitter");
    const { generateReply } = await import("@/lib/claude");
    const { postReply } = await import("@/lib/twitter");
    const { REPLY_SYSTEM_PROMPT, buildReplyPrompt } = await import("@/lib/prompts");

    const results: Array<{
      handle: string;
      newTweet?: string;
      replied?: boolean;
      replyText?: string;
      error?: string;
    }> = [];

    for (const account of watchlist) {
      try {
        // Fetch their most recent tweet
        const tweets = await getUserRecentTweets(account.handle, 3);
        if (tweets.length === 0) {
          results.push({ handle: account.handle, error: "No tweets found" });
          continue;
        }

        const latest = tweets[0];
        const lastSeen = await getWatchlistLastSeen(account.handle);

        // Always update last seen to the latest tweet
        await setWatchlistLastSeen(account.handle, latest.id);

        // If this is the first poll (no lastSeen), just mark position — don't reply to old tweets
        if (!lastSeen) {
          console.log(`[Notis] First poll for @${account.handle} — marking position at ${latest.id}`);
          results.push({ handle: account.handle, newTweet: "(first poll, marking position)" });
          continue;
        }

        // Check if there's a new tweet since last seen
        if (latest.id === lastSeen) {
          results.push({ handle: account.handle }); // No new tweet
          continue;
        }

        // NEW TWEET DETECTED — find all tweets newer than lastSeen
        const newTweets = tweets.filter(t => t.id > lastSeen);
        if (newTweets.length === 0) {
          results.push({ handle: account.handle });
          continue;
        }

        console.log(`[Notis] 🚨 @${account.handle} posted ${newTweets.length} new tweet(s)!`);

        // Reply to the NEWEST tweet only (the one followers are seeing right now)
        const target = newTweets[0];

        // Skip if already interacted with this tweet
        if (await hasQuotedTweet(target.id)) {
          console.log(`[Notis] Already replied to ${target.id}, skipping`);
          results.push({ handle: account.handle, newTweet: target.text.substring(0, 60), replied: false, error: "Already replied" });
          continue;
        }

        // Skip if hit user interaction limit
        if (await hasHitUserLimit(account.handle)) {
          console.log(`[Notis] User limit hit for @${account.handle}, skipping`);
          results.push({ handle: account.handle, newTweet: target.text.substring(0, 60), replied: false, error: "User limit" });
          continue;
        }

        // Check tweet age — only reply if under 10 minutes old (don't reply to tweets we missed by a lot)
        if (target.createdAt) {
          const ageMs = Date.now() - new Date(target.createdAt).getTime();
          const ageMin = Math.round(ageMs / 60000);
          if (ageMin > 10) {
            console.log(`[Notis] Tweet from @${account.handle} is ${ageMin}m old — too stale, skipping`);
            results.push({ handle: account.handle, newTweet: target.text.substring(0, 60), replied: false, error: `Too old (${ageMin}m)` });
            continue;
          }
        }

        // Generate reply
        const replyText = await generateReply(target.text, account.handle);
        if (!replyText || replyText.length > 280) {
          console.warn(`[Notis] Bad reply for @${account.handle}: ${replyText?.length || 0} chars`);
          results.push({ handle: account.handle, newTweet: target.text.substring(0, 60), replied: false, error: "Bad reply generated" });
          continue;
        }

        // Post reply directly under the tweet
        const replyId = await postReply(replyText, target.id);
        console.log(`[Notis] ⚡ Replied to @${account.handle} tweet ${target.id}: "${replyText.substring(0, 60)}..."`);

        // Record everything
        await markTweetQuoted(target.id);
        await recordUserInteraction(account.handle);
        await recordTweet({
          id: replyId,
          text: replyText,
          pillar: "human_observation",
          postedAt: new Date().toISOString(),
          hasImage: false,
        });

        results.push({
          handle: account.handle,
          newTweet: target.text.substring(0, 80),
          replied: true,
          replyText: replyText.substring(0, 80),
        });
      } catch (err) {
        console.error(`[Notis] Error polling @${account.handle}:`, err);
        results.push({
          handle: account.handle,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const replied = results.filter(r => r.replied);
    console.log(`[Notis] Polled ${watchlist.length} accounts — ${replied.length} new replies`);

    return NextResponse.json({
      polled: watchlist.length,
      replied: replied.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Notis Cron] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
