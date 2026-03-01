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

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/notis
 *
 * Called every 10 minutes by Vercel cron.
 * Polls watchlist accounts for new tweets using ONE batched Twitter API call.
 * When a new tweet is detected, ET replies directly under it.
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

    // ONE batched API call for all watchlist accounts
    const { batchGetRecentTweets } = await import("@/lib/twitter");
    const handles = watchlist.map(a => a.handle);
    const tweetsByAuthor = await batchGetRecentTweets(handles, 10);

    const { generateReply } = await import("@/lib/claude");
    const { postReply } = await import("@/lib/twitter");

    const results: Array<{
      handle: string;
      newTweet?: string;
      replied?: boolean;
      replyText?: string;
      error?: string;
    }> = [];

    for (const account of watchlist) {
      try {
        const tweets = tweetsByAuthor.get(account.handle) || [];
        if (tweets.length === 0) {
          results.push({ handle: account.handle, error: "No tweets found" });
          continue;
        }

        const latest = tweets[0]; // Already sorted by recency
        const lastSeen = await getWatchlistLastSeen(account.handle);

        // Always advance cursor to latest tweet
        await setWatchlistLastSeen(account.handle, latest.id);

        // First poll — just mark position, don't reply to old tweets
        if (!lastSeen) {
          console.log(`[Notis] First poll for @${account.handle} — marking position at ${latest.id}`);
          results.push({ handle: account.handle, newTweet: "(first poll, marking position)" });
          continue;
        }

        // No new tweet since last check
        if (latest.id === lastSeen) {
          results.push({ handle: account.handle });
          continue;
        }

        // NEW TWEET DETECTED — find all tweets newer than lastSeen
        const newTweets = tweets.filter(t => t.id > lastSeen);
        if (newTweets.length === 0) {
          results.push({ handle: account.handle });
          continue;
        }

        console.log(`[Notis] 🚨 @${account.handle} posted ${newTweets.length} new tweet(s)!`);

        // Reply to the NEWEST tweet only
        const target = newTweets[0];

        // Skip if already interacted
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

        // Skip if tweet is too old (>15 min — we missed the window)
        if (target.createdAt) {
          const ageMs = Date.now() - new Date(target.createdAt).getTime();
          const ageMin = Math.round(ageMs / 60000);
          if (ageMin > 15) {
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

        // Post reply directly under their tweet
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
        console.error(`[Notis] Error processing @${account.handle}:`, err);
        results.push({
          handle: account.handle,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    const replied = results.filter(r => r.replied);
    console.log(`[Notis] Polled ${watchlist.length} accounts (1 API call) — ${replied.length} new replies`);

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
