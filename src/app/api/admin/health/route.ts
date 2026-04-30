import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/health
 * 
 * Comprehensive health check:
 * - Shadowban detection (search visibility test)
 * - Rate limit status
 * - Global throttle status
 * - Daily action count
 * 
 * Protected by ADMIN_SECRET.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
  };

  // 1. Global throttle status
  try {
    const { canAct, getGlobalActionCount } = await import("@/lib/store");
    const throttle = await canAct();
    const actionCount = await getGlobalActionCount();
    results.throttle = {
      canAct: throttle.allowed,
      reason: throttle.reason,
      actionsToday: actionCount,
    };
  } catch (e) {
    results.throttle = { error: String(e) };
  }

  // 2. Rate limit status (populated after twitter is re-enabled)
  results.rateLimits = {
    note: "Rate limit tracking starts when TWITTER_HALTED is set to false. Limits are tracked per-endpoint after each API call.",
  };

  // 3. Kill switch status
  try {
    const { getKillSwitch } = await import("@/lib/kill-switch");
    results.killSwitch = await getKillSwitch();
  } catch (e) {
    results.killSwitch = { error: String(e) };
  }

  // 4. Shadowban check — search for own tweets
  try {
    results.shadowban = {
      note: "Twitter is currently halted — cannot run live shadowban check. Use manual checks.",
      manualCheckUrl: "https://search.x.com/search?q=from%3Aetalienx&src=typed_query&f=live",
      incognitoTest: "Search 'from:etalienx' in an incognito/private browser window. If 0 results, you're search-banned.",
    };
  } catch {
    results.shadowban = { status: "check_failed" };
  }

  // 5. Recent tweet count
  try {
    const { getRecentTweets, getTodayTweetCount } = await import("@/lib/store");
    const recent = await getRecentTweets();
    const todayCount = await getTodayTweetCount();
    results.tweets = {
      today: todayCount,
      recentStored: recent.length,
      lastTweet: recent.length > 0 ? recent[recent.length - 1] : null,
    };
  } catch (e) {
    results.tweets = { error: String(e) };
  }

  // 6. Recovery mode indicator
  results.mode = "RECOVERY";
  results.recoverySettings = {
    globalGapMinutes: 15,
    maxActionsPerDay: 10,
    maxTweetsPerDay: "2-3",
    maxRepliesPerDay: 5,
    notisEnabled: false,
    targetsEnabled: false,
    twitterHalted: true,
  };

  return NextResponse.json(results);
}
// Note: after switching Twitter accounts, clear last_mention_id in KV
// so the reply cron starts fresh on the new account
