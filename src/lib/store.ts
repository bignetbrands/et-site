import { kv } from "@vercel/kv";
import { ContentPillar, TweetRecord, DailyState } from "@/types";
import { PILLAR_CONFIGS } from "./prompts";

const ALL_PILLARS: ContentPillar[] = [
  "human_observation",
  "research_drop",
  "crypto_community",
  "personal_lore",
  "existential",
  "disclosure_conspiracy",
];

function todayKey(): string {
  const now = new Date();
  return `daily:${now.toISOString().split("T")[0]}`;
}

function recentKey(): string {
  return "recent_tweets";
}

/**
 * Get today's posting state.
 */
export async function getDailyState(): Promise<DailyState> {
  const key = todayKey();

  try {
    const state = await kv.get<DailyState>(key);
    if (state) return state;
  } catch {
    // KV not configured or error — return fresh state
  }

  // Fresh day
  const fresh: DailyState = {
    date: new Date().toISOString().split("T")[0],
    tweets: [],
    pillarCounts: Object.fromEntries(
      ALL_PILLARS.map((p) => [p, 0])
    ) as Record<ContentPillar, number>,
  };

  return fresh;
}

/**
 * Record a posted tweet in today's state.
 */
export async function recordTweet(record: TweetRecord): Promise<void> {
  const key = todayKey();
  const state = await getDailyState();

  state.tweets.push(record);
  state.pillarCounts[record.pillar] =
    (state.pillarCounts[record.pillar] || 0) + 1;

  try {
    // Expire at end of day + 24h buffer (so we can look back)
    await kv.set(key, state, { ex: 172800 });

    // Also push to recent tweets list (keep last 50)
    const recent = await getRecentTweets();
    recent.unshift(record.text);
    await kv.set(recentKey(), recent.slice(0, 50));
  } catch {
    // KV not configured — state won't persist but bot still works
    console.warn("KV not available — tweet recorded in memory only");
  }
}

/**
 * Get recent tweet texts for variety context.
 */
export async function getRecentTweets(): Promise<string[]> {
  try {
    const recent = await kv.get<string[]>(recentKey());
    return recent || [];
  } catch {
    return [];
  }
}

/**
 * Get how many total tweets have been posted today.
 */
export async function getTodayTweetCount(): Promise<number> {
  const state = await getDailyState();
  return state.tweets.length;
}

/**
 * Get the timestamp of the last tweet posted today.
 */
export async function getLastTweetTime(): Promise<Date | null> {
  const state = await getDailyState();
  if (state.tweets.length === 0) return null;
  return new Date(state.tweets[state.tweets.length - 1].postedAt);
}

/**
 * Get remaining pillar capacity for today.
 * Returns pillars that haven't hit their max target.
 */
export async function getAvailablePillars(): Promise<ContentPillar[]> {
  const state = await getDailyState();

  return ALL_PILLARS.filter((pillar) => {
    const count = state.pillarCounts[pillar] || 0;
    const max = PILLAR_CONFIGS[pillar].dailyTarget.max;
    return count < max;
  });
}

/**
 * Get pillars that haven't met their minimum target yet.
 * These should be prioritized.
 */
export async function getUnderservedPillars(): Promise<ContentPillar[]> {
  const state = await getDailyState();

  return ALL_PILLARS.filter((pillar) => {
    const count = state.pillarCounts[pillar] || 0;
    const min = PILLAR_CONFIGS[pillar].dailyTarget.min;
    return count < min;
  });
}
