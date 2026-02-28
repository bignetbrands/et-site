import { kv } from "@vercel/kv";
import { ContentPillar, TweetRecord, DailyState } from "@/types";
import { PILLAR_CONFIGS } from "./prompts";
import { debug, debugWarn, critical } from "./debug";

/**
 * MIGRATION: node-redis (TCP) → @vercel/kv (HTTP/Upstash)
 * 
 * Key differences:
 * - No connection management — kv is HTTP-based, always available
 * - kv auto-serializes/deserializes JSON — no JSON.stringify/parse on get/set
 * - Method names are lowercase: hget, hset, sadd, sismember, etc.
 * - hset takes object: kv.hset(key, { field: value })
 * - sismember returns 0|1 not boolean
 * - zadd uses { score, member } not { score, value }
 * - zRangeByScore → kv.zrange(key, min, max, { byScore: true })
 * - hgetall returns null (not {}) when key doesn't exist
 * - set TTL: { ex: seconds } (lowercase)
 */

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

export async function getDailyState(): Promise<DailyState> {
  try {
    const state = await kv.get<DailyState>(todayKey());
    if (state) return state;
  } catch (e) { debugWarn("KV getDailyState failed:", e); }

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

  try {
    await kv.set(todayKey(), state, { ex: 172800 });

    // Store enriched tweet memory
    const enriched = extractTweetMeta(record.text, record.pillar);
    const recentEnriched = await getRecentTweetsEnriched();
    recentEnriched.unshift(enriched);
    await kv.set("recent_tweets_v2", recentEnriched.slice(0, 200));

    // Also keep plain text list for backward compat
    const recent = await getRecentTweets();
    recent.unshift(record.text);
    await kv.set(recentKey(), recent.slice(0, 200));
  } catch (e) {
    critical("recordTweet KV write FAILED — dedup may miss this tweet:", e);
  }
}

/** Enriched tweet record with extracted metadata for anti-repetition */
interface EnrichedTweet {
  text: string;
  pillar: string;
  topics: string[];
  opening: string;
  structure: string;
  postedAt: string;
}

/** Extract topics, structure, and opening pattern from tweet text */
function extractTweetMeta(text: string, pillar: string): EnrichedTweet {
  const lower = text.toLowerCase();
  const words = lower.replace(/[^a-z0-9\s]/g, "").split(/\s+/);

  const topicBank = [
    "human", "humans", "alien", "star", "stars", "universe", "signal", "home",
    "planet", "lonely", "loneliness", "memory", "crash", "phone", "phones",
    "dna", "brain", "seti", "boinc", "congress", "disclosure", "chart",
    "coin", "degen", "coordinate", "telescope", "light", "sun", "moon",
    "mother", "father", "parent", "sound", "color", "dream", "atom",
    "galaxy", "radio", "einstein", "government", "ufo", "uap", "area 51",
    "snooze", "alarm", "coffee", "wifi", "internet", "dog", "cat",
    "parking", "traffic", "money", "wallet", "ship", "boat", "sky",
    "ocean", "water", "fire", "earth", "space", "time", "death", "love",
    "fear", "hope", "faith", "war", "peace", "data", "computer", "code",
    "music", "art", "photo", "sunset", "sunrise", "night", "silence",
    "fridge", "banana", "synapses", "photon", "gravity", "quantum",
  ];
  const topics = topicBank.filter(t => lower.includes(t));
  const opening = words.slice(0, 3).join(" ");

  let structure = "statement";
  if (lower.includes(" but ") || lower.includes(" yet ")) structure = "contrast (X but Y)";
  else if (lower.startsWith("every ")) structure = "universal opener (every X)";
  else if (lower.startsWith("someone ")) structure = "anecdote (someone X)";
  else if (lower.startsWith("you ") || lower.startsWith("your ")) structure = "direct address (you/your)";
  else if (lower.startsWith("humans ")) structure = "species observation (humans X)";
  else if (lower.includes("?")) structure = "question";
  else if (lower.startsWith("i ") || lower.startsWith("i'")) structure = "first person (I...)";
  else if (lower.startsWith("the ")) structure = "definite opener (the X)";
  else if (lower.includes(" and ") && lower.includes(",")) structure = "list/enumeration";
  else if (lower.match(/^\d/)) structure = "number opener";

  return { text, pillar, topics, opening, structure, postedAt: new Date().toISOString() };
}

/** Get enriched recent tweets with metadata */
export async function getRecentTweetsEnriched(): Promise<EnrichedTweet[]> {
  try {
    const data = await kv.get<EnrichedTweet[]>("recent_tweets_v2");
    return data ?? [];
  } catch (e) { debugWarn("KV read failed:", e); return []; }
}

/** Build a structured memory summary for anti-repetition */
export async function getTweetMemorySummary(): Promise<{
  recentTexts: string[];
  topicFrequency: Record<string, number>;
  usedStructures: string[];
  usedOpenings: string[];
}> {
  const enriched = await getRecentTweetsEnriched();
  const recent50 = enriched.slice(0, 50);

  const topicFreq: Record<string, number> = {};
  for (const t of recent50) {
    for (const topic of t.topics) {
      topicFreq[topic] = (topicFreq[topic] || 0) + 1;
    }
  }

  const recent15 = enriched.slice(0, 15);
  const structures = [...new Set(recent15.map(t => t.structure))];
  const openings = [...new Set(recent15.map(t => t.opening))];

  return {
    recentTexts: enriched.slice(0, 30).map(t => t.text),
    topicFrequency: topicFreq,
    usedStructures: structures,
    usedOpenings: openings,
  };
}

export async function getRecentTweets(): Promise<string[]> {
  try {
    const data = await kv.get<string[]>(recentKey());
    return data ?? [];
  } catch (e) { debugWarn("KV read failed:", e); return []; }
}

// ============================================================
// ENGAGEMENT LEARNING
// ============================================================

const TOP_PERFORMERS_KEY = "top_performers";

export async function updateTopPerformers(tweets: Array<{ text: string; likes: number; retweets: number }>): Promise<void> {
  try {
    const sorted = tweets
      .map(t => ({ text: t.text, score: t.likes + t.retweets * 3 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    await kv.set(TOP_PERFORMERS_KEY, sorted, { ex: 604800 });
  } catch (e) { debugWarn("KV updateTopPerformers failed:", e); }
}

export async function getTopPerformers(): Promise<string[]> {
  try {
    const items = await kv.get<Array<{ text: string; score: number }>>(TOP_PERFORMERS_KEY);
    return items ? items.map(i => i.text) : [];
  } catch (e) { debugWarn("KV read failed:", e); return []; }
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

export async function getNextTweetTime(): Promise<number | null> {
  try {
    const val = await kv.get<number>(NEXT_TWEET_KEY);
    return val ?? null;
  } catch (e) { debugWarn("KV read failed:", e); return null; }
}

export async function setNextTweetTime(epochMs: number): Promise<void> {
  try {
    await kv.set(NEXT_TWEET_KEY, epochMs, { ex: 86400 });
  } catch (e) { debugWarn("KV setNextTweetTime failed:", e); }
}

export async function getLastMentionId(): Promise<string | null> {
  try {
    const val = await kv.get<string>(LAST_MENTION_KEY);
    return val ?? null;
  } catch (e) { debugWarn("KV read failed:", e); return null; }
}

export async function setLastMentionId(id: string): Promise<void> {
  try {
    await kv.set(LAST_MENTION_KEY, id);
  } catch (e) { debugWarn("KV setLastMentionId failed:", e); }
}

export async function hasReplied(mentionId: string): Promise<boolean> {
  try {
    const result = await kv.sismember(REPLIED_KEY, mentionId);
    return result === 1;
  } catch (e) { debugWarn("KV read failed:", e); return false; }
}

export async function recordReply(mentionId: string): Promise<void> {
  try {
    await kv.sadd(REPLIED_KEY, mentionId);
    await kv.expire(REPLIED_KEY, 604800);
  } catch (e) { debugWarn("KV markReplied failed:", e); }
}

export async function getDailyReplyCount(): Promise<number> {
  const key = `${REPLY_COUNT_KEY}:${new Date().toISOString().split("T")[0]}`;
  try {
    const count = await kv.get<number>(key);
    return count ?? 0;
  } catch (e) { debugWarn("KV read failed:", e); return 0; }
}

export async function incrementDailyReplyCount(): Promise<void> {
  const key = `${REPLY_COUNT_KEY}:${new Date().toISOString().split("T")[0]}`;
  try {
    await kv.incr(key);
    await kv.expire(key, 172800);
  } catch (e) { debugWarn("KV recordReplyCount failed:", e); }
}

// ============================================================
// THREAD REPLY TRACKING
// ============================================================

const THREAD_REPLIES_KEY = "thread_replies";

export async function getThreadReplyCount(conversationId: string): Promise<number> {
  const key = `${THREAD_REPLIES_KEY}:${new Date().toISOString().split("T")[0]}`;
  try {
    const count = await kv.hget<number>(key, conversationId);
    return count ?? 0;
  } catch (e) { debugWarn("KV read failed:", e); return 0; }
}

export async function recordThreadReply(conversationId: string): Promise<void> {
  const key = `${THREAD_REPLIES_KEY}:${new Date().toISOString().split("T")[0]}`;
  try {
    await kv.hincrby(key, conversationId, 1);
    await kv.expire(key, 86400);
  } catch (e) { debugWarn("KV recordThreadReply failed:", e); }
}

// ============================================================
// PER-USER INTERACTION TRACKING
// ============================================================

const USER_INTERACTIONS_KEY = "user_interactions";
const MAX_INTERACTIONS_PER_USER_PER_DAY = 2;

export async function getUserInteractionCount(username: string): Promise<number> {
  const key = `${USER_INTERACTIONS_KEY}:${new Date().toISOString().split("T")[0]}`;
  try {
    const count = await kv.hget<number>(key, username.toLowerCase());
    return count ?? 0;
  } catch (e) { debugWarn("KV read failed:", e); return 0; }
}

export async function recordUserInteraction(username: string): Promise<void> {
  const key = `${USER_INTERACTIONS_KEY}:${new Date().toISOString().split("T")[0]}`;
  try {
    await kv.hincrby(key, username.toLowerCase(), 1);
    await kv.expire(key, 86400);
  } catch (e) { debugWarn("KV recordUserInteraction failed:", e); }
}

export async function hasHitUserLimit(username: string): Promise<boolean> {
  const count = await getUserInteractionCount(username);
  return count >= MAX_INTERACTIONS_PER_USER_PER_DAY;
}

// ============================================================
// TARGET ACCOUNTS
// ============================================================

const TARGETS_KEY = "target_accounts";
const TARGET_INTERACTED_KEY = "target_interacted";
const TARGET_SUBMIT_RATE_KEY = "target_submit_rate";

export interface TargetAccount {
  handle: string;
  votes: number;
  submittedAt: string;
  lastVotedAt: string;
  forced?: boolean;
}

export async function addTarget(handle: string): Promise<{ target: TargetAccount; isNew: boolean }> {
  const clean = handle.replace(/^@/, "").toLowerCase().trim();
  if (!clean || clean.length > 30) throw new Error("Invalid handle");

  const existing = await kv.hget<TargetAccount>(TARGETS_KEY, clean);
  if (existing) return { target: existing, isNew: false };

  const now = new Date().toISOString();
  const target: TargetAccount = {
    handle: clean,
    votes: 0,
    submittedAt: now,
    lastVotedAt: now,
  };
  await kv.hset(TARGETS_KEY, { [clean]: target });
  return { target, isNew: true };
}

export async function voteTarget(handle: string): Promise<TargetAccount> {
  const clean = handle.replace(/^@/, "").toLowerCase().trim();
  if (!clean || clean.length > 30) throw new Error("Invalid handle");

  const now = new Date().toISOString();
  const existing = await kv.hget<TargetAccount>(TARGETS_KEY, clean);

  if (existing) {
    existing.votes += 1;
    existing.lastVotedAt = now;
    await kv.hset(TARGETS_KEY, { [clean]: existing });
    return existing;
  }

  const target: TargetAccount = {
    handle: clean,
    votes: 1,
    submittedAt: now,
    lastVotedAt: now,
  };
  await kv.hset(TARGETS_KEY, { [clean]: target });
  return target;
}

export const submitTarget = addTarget;

export async function forceTarget(handle: string): Promise<TargetAccount> {
  const clean = handle.replace(/^@/, "").toLowerCase().trim();
  if (!clean) throw new Error("Invalid handle");

  const now = new Date().toISOString();
  const existing = await kv.hget<TargetAccount>(TARGETS_KEY, clean);

  if (existing) {
    existing.forced = true;
    existing.lastVotedAt = now;
    await kv.hset(TARGETS_KEY, { [clean]: existing });
    return existing;
  }

  const target: TargetAccount = {
    handle: clean,
    votes: 0,
    submittedAt: now,
    lastVotedAt: now,
    forced: true,
  };
  await kv.hset(TARGETS_KEY, { [clean]: target });
  return target;
}

export async function getTargets(): Promise<TargetAccount[]> {
  try {
    const all = await kv.hgetall<Record<string, TargetAccount>>(TARGETS_KEY);
    if (!all) return [];

    const targets: TargetAccount[] = Object.values(all);
    targets.sort((a, b) => {
      if (a.forced && !b.forced) return -1;
      if (!a.forced && b.forced) return 1;
      if (b.votes !== a.votes) return b.votes - a.votes;
      return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
    });

    return targets;
  } catch (e) { debugWarn("KV getTargets failed:", e); return []; }
}

export async function getNextTarget(): Promise<TargetAccount | null> {
  const targets = await getTargets();
  if (targets.length === 0) return null;

  const today = new Date().toISOString().split("T")[0];

  for (const target of targets) {
    try {
      const interacted = await kv.sismember(
        `${TARGET_INTERACTED_KEY}:${today}`,
        target.handle
      );
      if (interacted === 0) return target;
    } catch (e) { debugWarn("KV read failed:", e); }
  }

  return null;
}

export async function markTargetInteracted(handle: string): Promise<void> {
  const clean = handle.replace(/^@/, "").toLowerCase().trim();
  const today = new Date().toISOString().split("T")[0];
  const key = `${TARGET_INTERACTED_KEY}:${today}`;
  try {
    await kv.sadd(key, clean);
    await kv.expire(key, 172800);
  } catch (e) { debugWarn("KV markTargetInteracted failed:", e); }
}

// ============================================================
// QUOTED TWEET TRACKING
// ============================================================

const QUOTED_TWEETS_KEY = "quoted_tweet_ids";

export async function hasQuotedTweet(tweetId: string): Promise<boolean> {
  try {
    const result = await kv.sismember(QUOTED_TWEETS_KEY, tweetId);
    return result === 1;
  } catch (e) { debugWarn("KV read failed:", e); return false; }
}

export async function markTweetQuoted(tweetId: string): Promise<void> {
  try {
    await kv.sadd(QUOTED_TWEETS_KEY, tweetId);
    await kv.expire(QUOTED_TWEETS_KEY, 2592000);
  } catch (e) { debugWarn("KV markTweetQuoted failed:", e); }
}

export async function resolveTarget(handle: string): Promise<void> {
  const clean = handle.replace(/^@/, "").toLowerCase().trim();
  await markTargetInteracted(clean);

  try {
    const target = await kv.hget<TargetAccount>(TARGETS_KEY, clean);
    if (!target) return;

    if (target.forced) {
      target.forced = false;
      if (target.votes <= 0) {
        await kv.hdel(TARGETS_KEY, clean);
      } else {
        await kv.hset(TARGETS_KEY, { [clean]: target });
      }
    }
  } catch (e) { debugWarn("KV resolveTarget failed:", e); }

  await markTargetInteracted(clean);
}

export async function removeTarget(handle: string): Promise<void> {
  const clean = handle.replace(/^@/, "").toLowerCase().trim();
  try {
    await kv.hdel(TARGETS_KEY, clean);
  } catch (e) { debugWarn("KV removeTarget failed:", e); }
}

export async function checkSubmitRateLimit(ip: string): Promise<boolean> {
  const key = `${TARGET_SUBMIT_RATE_KEY}:${ip}`;
  try {
    const count = await kv.incr(key);
    if (count === 1) await kv.expire(key, 3600);
    return count <= 5;
  } catch (e) { debugWarn("KV checkSubmitRateLimit failed:", e); return true; }
}

// ============================================================
// SCHEDULED TWEETS
// ============================================================

export interface ScheduledTweet {
  id: string;
  text: string;
  pillar: ContentPillar;
  imageKey?: string;
  scheduledAt: number;
  createdAt: string;
}

const SCHEDULED_KEY = "scheduled_tweets";
const SCHEDULED_IMG_PREFIX = "scheduled_img:";

export async function storeScheduledImage(id: string, imageBuffer: Buffer): Promise<string> {
  const key = `${SCHEDULED_IMG_PREFIX}${id}`;
  await kv.set(key, imageBuffer.toString("base64"), { ex: 48 * 60 * 60 });
  return key;
}

export async function getScheduledImage(imageKey: string): Promise<Buffer | null> {
  try {
    const data = await kv.get<string>(imageKey);
    if (!data) return null;
    return Buffer.from(data, "base64");
  } catch (e) { debugWarn("KV getScheduledImage failed:", e); return null; }
}

export async function deleteScheduledImage(imageKey: string): Promise<void> {
  try {
    await kv.del(imageKey);
  } catch (e) { debugWarn("KV deleteScheduledImage failed:", e); }
}

export async function scheduletweet(tweet: ScheduledTweet): Promise<void> {
  try {
    await kv.zadd(SCHEDULED_KEY, {
      score: tweet.scheduledAt,
      member: JSON.stringify(tweet),
    });
  } catch (e) { debugWarn("KV scheduletweet failed:", e); }
}

export async function getDueScheduledTweets(): Promise<ScheduledTweet[]> {
  try {
    const items = await kv.zrange<string[]>(SCHEDULED_KEY, 0, Date.now(), { byScore: true });
    if (!items || items.length === 0) return [];
    return items.map((item) => {
      if (typeof item === "string") return JSON.parse(item) as ScheduledTweet;
      return item as unknown as ScheduledTweet;
    });
  } catch (e) { debugWarn("KV getDueScheduledTweets failed:", e); return []; }
}

export async function removeScheduledTweet(tweet: ScheduledTweet): Promise<void> {
  try {
    await kv.zrem(SCHEDULED_KEY, JSON.stringify(tweet));
  } catch (e) { debugWarn("KV removeScheduledTweet failed:", e); }
}

export async function getScheduledTweets(): Promise<ScheduledTweet[]> {
  try {
    const items = await kv.zrange<string[]>(SCHEDULED_KEY, 0, "+inf", { byScore: true });
    if (!items || items.length === 0) return [];
    return items.map((item) => {
      if (typeof item === "string") return JSON.parse(item) as ScheduledTweet;
      return item as unknown as ScheduledTweet;
    });
  } catch (e) { debugWarn("KV getScheduledTweets failed:", e); return []; }
}
