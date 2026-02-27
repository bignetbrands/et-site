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
const NEXT_TWEET_KEY = "next_tweet_time";

/**
 * Get the scheduled next tweet time (epoch ms).
 */
export async function getNextTweetTime(): Promise<number | null> {
  const redis = await getRedis();
  if (redis) {
    try {
      const val = await redis.get(NEXT_TWEET_KEY);
      return val ? parseInt(val, 10) : null;
    } catch { /* fall through */ }
  }
  return null;
}

/**
 * Set the next scheduled tweet time (epoch ms).
 */
export async function setNextTweetTime(epochMs: number): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    try {
      await redis.set(NEXT_TWEET_KEY, epochMs.toString(), { EX: 86400 });
    } catch {
      console.warn("[Redis] Failed to save next tweet time");
    }
  }
}

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

// ============================================================
// TARGET ACCOUNTS — Community-driven interaction targets
// ============================================================

const TARGETS_KEY = "target_accounts";
const TARGET_INTERACTED_KEY = "target_interacted";
const TARGET_SUBMIT_RATE_KEY = "target_submit_rate";

export interface TargetAccount {
  handle: string;        // @username (stored without @)
  votes: number;         // number of community votes
  submittedAt: string;   // ISO timestamp of first submission
  lastVotedAt: string;   // ISO timestamp of last vote
  forced?: boolean;      // admin-forced (skip consensus)
}

/**
 * Add a new target account to the queue (starts at 0 votes).
 * If already exists, returns the existing target.
 */
export async function addTarget(handle: string): Promise<{ target: TargetAccount; isNew: boolean }> {
  const clean = handle.replace(/^@/, "").toLowerCase().trim();
  if (!clean || clean.length > 30) throw new Error("Invalid handle");

  const redis = await getRedis();
  if (!redis) throw new Error("Redis unavailable");

  const raw = await redis.hGet(TARGETS_KEY, clean);

  if (raw) {
    // Already in queue
    return { target: JSON.parse(raw), isNew: false };
  }

  // New target — starts at 0 votes
  const now = new Date().toISOString();
  const target: TargetAccount = {
    handle: clean,
    votes: 0,
    submittedAt: now,
    lastVotedAt: now,
  };
  await redis.hSet(TARGETS_KEY, clean, JSON.stringify(target));
  return { target, isNew: true };
}

/**
 * Upvote an existing target. Creates it if it doesn't exist.
 */
export async function voteTarget(handle: string): Promise<TargetAccount> {
  const clean = handle.replace(/^@/, "").toLowerCase().trim();
  if (!clean || clean.length > 30) throw new Error("Invalid handle");

  const redis = await getRedis();
  if (!redis) throw new Error("Redis unavailable");

  const now = new Date().toISOString();
  const raw = await redis.hGet(TARGETS_KEY, clean);

  if (raw) {
    const target: TargetAccount = JSON.parse(raw);
    target.votes += 1;
    target.lastVotedAt = now;
    await redis.hSet(TARGETS_KEY, clean, JSON.stringify(target));
    return target;
  }

  // Doesn't exist yet — add with 1 vote
  const target: TargetAccount = {
    handle: clean,
    votes: 1,
    submittedAt: now,
    lastVotedAt: now,
  };
  await redis.hSet(TARGETS_KEY, clean, JSON.stringify(target));
  return target;
}

/**
 * Legacy alias for backward compatibility.
 */
export const submitTarget = addTarget;

/**
 * Admin force-add a target (goes to front of queue).
 */
export async function forceTarget(handle: string): Promise<TargetAccount> {
  const clean = handle.replace(/^@/, "").toLowerCase().trim();
  if (!clean) throw new Error("Invalid handle");

  const redis = await getRedis();
  if (!redis) throw new Error("Redis unavailable");

  const now = new Date().toISOString();
  const raw = await redis.hGet(TARGETS_KEY, clean);

  if (raw) {
    const target: TargetAccount = JSON.parse(raw);
    target.forced = true;
    target.lastVotedAt = now;
    await redis.hSet(TARGETS_KEY, clean, JSON.stringify(target));
    return target;
  } else {
    const target: TargetAccount = {
      handle: clean,
      votes: 0,
      submittedAt: now,
      lastVotedAt: now,
      forced: true,
    };
    await redis.hSet(TARGETS_KEY, clean, JSON.stringify(target));
    return target;
  }
}

/**
 * Get all targets sorted by priority (forced first, then by votes).
 */
export async function getTargets(): Promise<TargetAccount[]> {
  const redis = await getRedis();
  if (!redis) return [];

  try {
    const all = await redis.hGetAll(TARGETS_KEY);
    const targets: TargetAccount[] = Object.values(all).map((v) => JSON.parse(v as string));

    // Sort: forced first, then by votes desc, then by oldest submission
    targets.sort((a, b) => {
      if (a.forced && !b.forced) return -1;
      if (!a.forced && b.forced) return 1;
      if (b.votes !== a.votes) return b.votes - a.votes;
      return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
    });

    return targets;
  } catch {
    return [];
  }
}

/**
 * Get the next target to interact with (highest priority, not yet interacted today).
 */
export async function getNextTarget(): Promise<TargetAccount | null> {
  const targets = await getTargets();
  const redis = await getRedis();
  if (!redis || targets.length === 0) return null;

  const today = new Date().toISOString().split("T")[0];

  for (const target of targets) {
    const interacted = await redis.sIsMember(
      `${TARGET_INTERACTED_KEY}:${today}`,
      target.handle
    );
    if (!interacted) return target;
  }

  return null;
}

/**
 * Mark a target as interacted with today.
 */
export async function markTargetInteracted(handle: string): Promise<void> {
  const clean = handle.replace(/^@/, "").toLowerCase().trim();
  const redis = await getRedis();
  if (!redis) return;

  const today = new Date().toISOString().split("T")[0];
  const key = `${TARGET_INTERACTED_KEY}:${today}`;
  await redis.sAdd(key, clean);
  await redis.expire(key, 172800); // 48h TTL
}

/**
 * Resolve a target after successful interaction.
 * Forced targets lose forced flag. Voted targets stay in queue (marked interacted today).
 */
export async function resolveTarget(handle: string): Promise<void> {
  const clean = handle.replace(/^@/, "").toLowerCase().trim();
  const redis = await getRedis();
  if (!redis) return;

  const raw = await redis.hGet(TARGETS_KEY, clean);
  if (!raw) return;

  const target: TargetAccount = JSON.parse(raw);

  if (target.forced) {
    // Remove forced flag, keep in queue
    target.forced = false;
    if (target.votes <= 0) {
      await redis.hDel(TARGETS_KEY, clean);
    } else {
      await redis.hSet(TARGETS_KEY, clean, JSON.stringify(target));
    }
  }
  // Voted targets stay — they remain in queue for future interactions

  await markTargetInteracted(clean);
}

/**
 * Remove a target entirely (admin action).
 */
export async function removeTarget(handle: string): Promise<void> {
  const clean = handle.replace(/^@/, "").toLowerCase().trim();
  const redis = await getRedis();
  if (!redis) return;
  await redis.hDel(TARGETS_KEY, clean);
}

/**
 * Rate limit community submissions by IP (max 5 per hour).
 */
export async function checkSubmitRateLimit(ip: string): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return true; // allow if no redis

  const key = `${TARGET_SUBMIT_RATE_KEY}:${ip}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 3600); // 1 hour window
    return count <= 5;
  } catch {
    return true;
  }
}

// ============================================================
// SCHEDULED TWEETS
// ============================================================

export interface ScheduledTweet {
  id: string;
  text: string;
  pillar: ContentPillar;
  imageKey?: string; // Redis key for stored image data
  scheduledAt: number; // epoch ms
  createdAt: string;
}

const SCHEDULED_KEY = "scheduled_tweets";
const SCHEDULED_IMG_PREFIX = "scheduled_img:";

/**
 * Store image data for a scheduled tweet.
 */
export async function storeScheduledImage(id: string, imageBuffer: Buffer): Promise<string> {
  const redis = await getRedis();
  if (!redis) throw new Error("Redis not available");
  const key = `${SCHEDULED_IMG_PREFIX}${id}`;
  await redis.set(key, imageBuffer.toString("base64"));
  // Auto-expire after 48h as safety net
  await redis.expire(key, 48 * 60 * 60);
  return key;
}

/**
 * Retrieve stored image data for a scheduled tweet.
 */
export async function getScheduledImage(imageKey: string): Promise<Buffer | null> {
  const redis = await getRedis();
  if (!redis) return null;
  const data = await redis.get(imageKey);
  if (!data) return null;
  return Buffer.from(data, "base64");
}

/**
 * Delete stored image data after posting.
 */
export async function deleteScheduledImage(imageKey: string): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  await redis.del(imageKey);
}

/**
 * Schedule a tweet for future posting.
 */
export async function scheduletweet(tweet: ScheduledTweet): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  await redis.zAdd(SCHEDULED_KEY, {
    score: tweet.scheduledAt,
    value: JSON.stringify(tweet),
  });
}

/**
 * Get all due scheduled tweets (scheduledAt <= now).
 */
export async function getDueScheduledTweets(): Promise<ScheduledTweet[]> {
  const redis = await getRedis();
  if (!redis) return [];

  const now = Date.now();
  const items = await redis.zRangeByScore(SCHEDULED_KEY, 0, now);
  return items.map((item) => JSON.parse(item) as ScheduledTweet);
}

/**
 * Remove a scheduled tweet after posting.
 */
export async function removeScheduledTweet(tweet: ScheduledTweet): Promise<void> {
  const redis = await getRedis();
  if (!redis) return;
  await redis.zRem(SCHEDULED_KEY, JSON.stringify(tweet));
}

/**
 * Get all upcoming scheduled tweets.
 */
export async function getScheduledTweets(): Promise<ScheduledTweet[]> {
  const redis = await getRedis();
  if (!redis) return [];

  const items = await redis.zRangeByScore(SCHEDULED_KEY, 0, "+inf");
  return items.map((item) => JSON.parse(item) as ScheduledTweet);
}
