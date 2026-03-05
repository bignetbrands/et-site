import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import {
  getDailyReplyCount,
  canAct,
  getLastMentionId,
  getDailyState,
  getTodayTweetCount,
  getLastTweetTime,
  getAvailablePillars,
  getVipUsers,
  getUserInteractionCount,
  getGlobalActionCount,
} from "@/lib/store";
import { isKillSwitchActive } from "@/lib/kill-switch";

export const dynamic = "force-dynamic";

const MAX_REPLIES_PER_DAY = 50;
const GLOBAL_MAX_ACTIONS_PER_DAY = 60;
const GLOBAL_MIN_GAP_MS = 10 * 60 * 1000;
const MAX_INTERACTIONS_PER_USER_PER_DAY = 10;
const VIP_INTERACTIONS_PER_USER_PER_DAY = 30;

/**
 * GET /api/admin/status — Full dashboard state
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];

    // Kill switch
    const killSwitchActive = await isKillSwitchActive();

    // Global throttle
    const throttle = await canAct();
    const globalActions = await getGlobalActionCount();
    const lastActionTs = await kv.get<number>("et:global_last_action");
    const lastActionAgo = lastActionTs ? Math.round((now - lastActionTs) / 60000) : null;

    // Reply stats
    const dailyReplies = await getDailyReplyCount();
    const lastMentionId = await getLastMentionId();

    // Tweet stats
    const dailyTweets = await getTodayTweetCount();
    const lastTweetTime = await getLastTweetTime();
    const lastTweetAgo = lastTweetTime ? Math.round((now - lastTweetTime.getTime()) / 60000) : null;
    const availablePillars = await getAvailablePillars();

    // Daily state (pillar counts)
    const dailyState = await getDailyState();

    // VIP users + their interaction counts
    const vipUsers = await getVipUsers();
    const vipStatus = await Promise.all(
      vipUsers.map(async (u) => ({
        username: u,
        interactions: await getUserInteractionCount(u),
        limit: VIP_INTERACTIONS_PER_USER_PER_DAY,
      }))
    );

    // Top interacted users today (scan KV hash)
    let topUsers: Array<{ username: string; count: number; limit: number; isVip: boolean }> = [];
    try {
      const userKey = `user_interactions:${today}`;
      const allUsers = await kv.hgetall<Record<string, number>>(userKey);
      if (allUsers) {
        topUsers = Object.entries(allUsers)
          .map(([username, count]) => ({
            username,
            count: count as number,
            limit: vipUsers.includes(username) ? VIP_INTERACTIONS_PER_USER_PER_DAY : MAX_INTERACTIONS_PER_USER_PER_DAY,
            isVip: vipUsers.includes(username),
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 15);
      }
    } catch { /* ignore */ }

    // Blockers — what's preventing ET from acting right now
    const blockers: string[] = [];
    if (killSwitchActive) blockers.push("🔴 Kill switch is ACTIVE — ET is paused");
    if (globalActions >= GLOBAL_MAX_ACTIONS_PER_DAY) blockers.push(`🔴 Global action limit reached (${globalActions}/${GLOBAL_MAX_ACTIONS_PER_DAY})`);
    if (dailyReplies >= MAX_REPLIES_PER_DAY) blockers.push(`🔴 Daily reply limit reached (${dailyReplies}/${MAX_REPLIES_PER_DAY})`);
    if (lastActionTs && (now - lastActionTs) < GLOBAL_MIN_GAP_MS) {
      const waitMin = Math.round((GLOBAL_MIN_GAP_MS - (now - lastActionTs)) / 60000);
      blockers.push(`⏳ Throttle cooldown — ${waitMin}min until next action allowed`);
    }
    if (blockers.length === 0) blockers.push("✅ No blockers — ET is clear to act");

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      blockers,
      killSwitch: killSwitchActive,
      throttle: {
        canAct: throttle.allowed,
        reason: throttle.reason,
        lastActionMinAgo: lastActionAgo,
        minGapMin: GLOBAL_MIN_GAP_MS / 60000,
      },
      actions: {
        today: globalActions,
        limit: GLOBAL_MAX_ACTIONS_PER_DAY,
        remaining: Math.max(0, GLOBAL_MAX_ACTIONS_PER_DAY - globalActions),
      },
      tweets: {
        today: dailyTweets,
        lastTweetMinAgo: lastTweetAgo,
        availablePillars: availablePillars,
        pillarCounts: dailyState.pillarCounts || {},
      },
      replies: {
        today: dailyReplies,
        limit: MAX_REPLIES_PER_DAY,
        remaining: Math.max(0, MAX_REPLIES_PER_DAY - dailyReplies),
        lastMentionCursor: lastMentionId,
      },
      userInteractions: topUsers,
      vipUsers: vipStatus,
    });
  } catch (error) {
    console.error("[Status API] Error:", error);
    return NextResponse.json(
      { error: `Failed: ${error instanceof Error ? error.message : "unknown"}` },
      { status: 500 }
    );
  }
}
