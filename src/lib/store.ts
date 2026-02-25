import { createClient, type RedisClientType } from "redis";
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

let _client: RedisClientType | null = null;

async function getRedis(): Promise<RedisClientType | null> {
  if (!process.env.REDIS_URL) return null;
  if (_client && _client.isOpen) return _client;
  try {
    _client = createClient({ url: process.env.REDIS_URL });
    _client.on("error", (err: Error) => console.error("[Redis] Error:", err));
    await _client.connect();
    return _client;
  } catch (e) {
    console.warn("[Redis] Connection failed:", e);
    return null;
  }
}

function todayKey(): string {
  const now = new Date();
  return `daily:${now.toISOString().split("T")[0]}`;
}

function recentKey(): string {
  return "recent_tweets";
}

export async function getDailyState(): Promise<DailyState> {
  const redis = await getRedis();
  if (redis) {
    try {
      const raw = await redis.get(todayKey());
      if (raw) return JSON.parse(raw);
    } catch { /* fall through */ }
  }
  const fresh: DailyState = {
    date: new Date().toISOString().split("T")[0],
    tweets: [],
    pillarCounts: Object.fromEntries(
      ALL_PILLARS.map((p) => [p, 0])
    ) as Record<ContentPillar, number>,
  };
  return fresh;
}

export async function recordTweet(record: TweetRecord): Promise<void> {
  const state = await getDailyState();
  state.tweets.push(record);
  state.pillarCounts[record.pillar] = (state.pillarCounts[record.pillar] || 0) + 1;

  const redis = await getRedis();
  if (redis) {
    try {
      await redis.set(todayKey(), JSON.stringify(state), { EX: 172800 });
      const recent = await getRecentTweets();
      recent.unshift(record.text);
      await redis.set(recentKey(), JSON.stringify(recent.slice(0, 50)));
    } catch {
      console.warn("Redis not available — tweet recorded in memory only");
    }
  }
}

export async function getRecentTweets(): Promise<string[]> {
  const redis = await getRedis();
  if (redis) {
    try {
      const raw = await redis.get(recentKey());
      return raw ? JSON.parse(raw) : [];
    } catch { /* fall through */ }
  }
  return [];
}

export async function getTodayTweetCount(): Promise<number> {
  const state = await getDailyState();
  return state.tweets.length;
}

export async function getLastTweetTime(): Promise<Date | null> {
  const state = await getDailyState();
  if (state.tweets.length === 0) return null;
  return new Date(state.tweets[state.tweets.length - 1].postedAt);
}

export async function getAvailablePillars(): Promise<ContentPillar[]> {
  const state = await getDailyState();
  return ALL_PILLARS.filter((pillar) => {
    const count = state.pillarCounts[pillar] || 0;
    const max = PILLAR_CONFIGS[pillar].dailyTarget.max;
    return count < max;
  });
}

export async function getUnderservedPillars(): Promise<ContentPillar[]> {
  const state = await getDailyState();
  return ALL_PILLARS.filter((pillar) => {
    const count = state.pillarCounts[pillar] || 0;
    const min = PILLAR_CONFIGS[pillar].dailyTarget.min;
    return count < min;
  });
}

// ============================================================
// MENTION / REPLY TRACKING
// ============================================================

const LAST_MENTION_KEY = "last_mention_id";
const REPLIED_KEY = "replied_mentions";
const REPLY_COUNT_KEY = "reply_count_daily";

/**
 * Get the last processed mention ID.
 */
export async function getLastMentionId(): Promise<string | null> {
  const redis = await getRedis();
  if (redis) {
    try {
      return await redis.get(LAST_MENTION_KEY);
    } catch { /* fall through */ }
  }
  return null;
}

/**
 * Store the last processed mention ID.
 */
export async function setLastMentionId(id: string): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    try {
      await redis.set(LAST_MENTION_KEY, id);
    } catch {
      console.warn("[Redis] Failed to save last mention ID");
    }
  }
}

/**
 * Check if we already replied to a mention.
 */
export async function hasReplied(mentionId: string): Promise<boolean> {
  const redis = await getRedis();
  if (redis) {
    try {
      return (await redis.sIsMember(REPLIED_KEY, mentionId)) === true;
    } catch { /* fall through */ }
  }
  return false;
}

/**
 * Record that we replied to a mention.
 */
export async function recordReply(mentionId: string): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    try {
      await redis.sAdd(REPLIED_KEY, mentionId);
      // Expire the set after 7 days to prevent unbounded growth
      await redis.expire(REPLIED_KEY, 604800);
    } catch {
      console.warn("[Redis] Failed to record reply");
    }
  }
}

/**
 * Get today's reply count (rate limiting).
 */
export async function getDailyReplyCount(): Promise<number> {
  const redis = await getRedis();
  const key = `${REPLY_COUNT_KEY}:${new Date().toISOString().split("T")[0]}`;
  if (redis) {
    try {
      const count = await redis.get(key);
      return count ? parseInt(count, 10) : 0;
    } catch { /* fall through */ }
  }
  return 0;
}

/**
 * Increment today's reply count.
 */
export async function incrementDailyReplyCount(): Promise<void> {
  const redis = await getRedis();
  const key = `${REPLY_COUNT_KEY}:${new Date().toISOString().split("T")[0]}`;
  if (redis) {
    try {
      await redis.incr(key);
      await redis.expire(key, 172800); // 48h TTL
    } catch {
      console.warn("[Redis] Failed to increment reply count");
    }
  }
}
