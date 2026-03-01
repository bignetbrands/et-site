import { kv } from "@vercel/kv";
import { debugWarn, critical } from "./debug";

// ============================================================
// USER MEMORY — ET remembers who people are
// ============================================================

export interface UserMemory {
  username: string;
  firstSeen: string;
  lastSeen: string;
  interactionCount: number;
  topics: string[];         // topics they've discussed with ET
  vibe: string;             // "friendly" | "curious" | "hostile" | "degen" | "thoughtful" | "troll"
  tier: "stranger" | "acquaintance" | "regular" | "friend" | "inner_circle";
  notes: string[];          // Claude-generated one-line observations (max 5)
  lastTweetContext: string;  // last thing they said to ET (for continuity)
}

const USER_MEMORY_PREFIX = "et:user:";

export async function getUserMemory(username: string): Promise<UserMemory | null> {
  try {
    return await kv.get<UserMemory>(`${USER_MEMORY_PREFIX}${username.toLowerCase()}`);
  } catch (e) { debugWarn("getUserMemory failed:", e); return null; }
}

export async function setUserMemory(memory: UserMemory): Promise<void> {
  try {
    await kv.set(
      `${USER_MEMORY_PREFIX}${memory.username.toLowerCase()}`,
      memory,
      { ex: 60 * 60 * 24 * 90 } // 90 day TTL — forgotten if no interaction
    );
    // Also track in the known-users set for enumeration
    await kv.sadd("et:known_users", memory.username.toLowerCase());
  } catch (e) { critical("setUserMemory failed:", e); }
}

/**
 * Record an interaction with a user — creates or updates their memory.
 * Called after every reply ET sends.
 */
export async function recordUserMemoryInteraction(
  username: string,
  theirMessage: string,
  etReply: string,
  topics?: string[]
): Promise<void> {
  const existing = await getUserMemory(username);

  if (existing) {
    existing.interactionCount += 1;
    existing.lastSeen = new Date().toISOString();
    existing.lastTweetContext = theirMessage.substring(0, 200);

    // Append new topics (dedup, keep last 15)
    if (topics?.length) {
      const combined = [...new Set([...existing.topics, ...topics])];
      existing.topics = combined.slice(-15);
    }

    // Update tier based on interaction count
    existing.tier = calculateTier(existing.interactionCount);

    await setUserMemory(existing);
  } else {
    // New user
    const memory: UserMemory = {
      username: username.toLowerCase(),
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      interactionCount: 1,
      topics: topics || [],
      vibe: "unknown",
      tier: "stranger",
      notes: [],
      lastTweetContext: theirMessage.substring(0, 200),
    };
    await setUserMemory(memory);
  }
}

function calculateTier(count: number): UserMemory["tier"] {
  if (count >= 20) return "inner_circle";
  if (count >= 10) return "friend";
  if (count >= 5) return "regular";
  if (count >= 2) return "acquaintance";
  return "stranger";
}

/** Get all known users (for reflection) */
export async function getKnownUsers(): Promise<string[]> {
  try {
    const members = await kv.smembers("et:known_users");
    return (members || []) as string[];
  } catch (e) { debugWarn("getKnownUsers failed:", e); return []; }
}

/** Get users by tier for community awareness */
export async function getUsersByTier(tier: UserMemory["tier"]): Promise<UserMemory[]> {
  const usernames = await getKnownUsers();
  const memories: UserMemory[] = [];
  for (const username of usernames.slice(0, 100)) { // cap to avoid huge reads
    const mem = await getUserMemory(username);
    if (mem && mem.tier === tier) memories.push(mem);
  }
  return memories;
}

// ============================================================
// REFLECTION JOURNAL — ET's inner monologue
// ============================================================

export interface JournalEntry {
  date: string;
  entry: string;            // ET's written reflection (in character)
  mood: string;             // one word: "restless", "hopeful", "lonely", "amused", "grateful"
  highlights: string[];     // 2-3 things that stood out
  engagement: {
    totalTweets: number;
    totalLikes: number;
    totalRetweets: number;
    avgLikes: number;
    bestTweet: string;
    bestTweetLikes: number;
  };
  communityNotes: string;   // observations about the community
  selfObservation: string;  // something ET noticed about himself
}

const JOURNAL_PREFIX = "et:journal:";

export async function getJournalEntry(date: string): Promise<JournalEntry | null> {
  try {
    return await kv.get<JournalEntry>(`${JOURNAL_PREFIX}${date}`);
  } catch (e) { debugWarn("getJournalEntry failed:", e); return null; }
}

export async function setJournalEntry(entry: JournalEntry): Promise<void> {
  try {
    await kv.set(`${JOURNAL_PREFIX}${entry.date}`, entry, { ex: 60 * 60 * 24 * 60 }); // 60 day TTL
    // Track journal dates for enumeration
    await kv.lpush("et:journal_dates", entry.date);
    await kv.ltrim("et:journal_dates", 0, 59); // keep last 60 dates
  } catch (e) { critical("setJournalEntry failed:", e); }
}

/** Get the last N journal entries */
export async function getRecentJournals(count: number = 7): Promise<JournalEntry[]> {
  try {
    const dates = await kv.lrange<string>("et:journal_dates", 0, count - 1);
    if (!dates?.length) return [];

    const entries: JournalEntry[] = [];
    for (const date of dates) {
      const entry = await getJournalEntry(date);
      if (entry) entries.push(entry);
    }
    return entries;
  } catch (e) { debugWarn("getRecentJournals failed:", e); return []; }
}

// ============================================================
// WEEKLY REFLECTION — deeper pattern recognition
// ============================================================

export interface WeeklyReflection {
  weekOf: string;          // date string of the Monday
  reflection: string;      // longer-form reflection
  patternsNoticed: string[];
  growthAreas: string[];
  quirksEvolved: string[]; // new quirks or preferences to add
  communityInsight: string;
}

export async function getWeeklyReflection(weekOf: string): Promise<WeeklyReflection | null> {
  try {
    return await kv.get<WeeklyReflection>(`et:weekly:${weekOf}`);
  } catch (e) { debugWarn("getWeeklyReflection failed:", e); return null; }
}

export async function setWeeklyReflection(reflection: WeeklyReflection): Promise<void> {
  try {
    await kv.set(`et:weekly:${reflection.weekOf}`, reflection, { ex: 60 * 60 * 24 * 90 }); // 90 day TTL
  } catch (e) { critical("setWeeklyReflection failed:", e); }
}

// ============================================================
// QUIRK ENGINE — ET's evolving personality surface
// ============================================================

export interface QuirkState {
  // Language quirks
  favoriteWords: string[];        // words ET gravitates toward (max 10)
  avoidWords: string[];           // words ET has overused and should rest (max 10)

  // Preferences
  likes: string[];                // things ET has decided he likes (max 15)
  dislikes: string[];             // things ET has decided he dislikes (max 10)
  curiosities: string[];          // things ET is currently curious about (max 10)

  // Social
  insideJokes: Array<{            // recurring bits with specific users or the community
    context: string;
    reference: string;
  }>;

  // Mood/state
  currentMood: string;            // updated by reflection
  ongoingThoughts: string[];      // things ET keeps coming back to (max 5)

  // Meta
  lastUpdated: string;
  version: number;
}

const QUIRK_KEY = "et:quirks";

export async function getQuirkState(): Promise<QuirkState> {
  try {
    const state = await kv.get<QuirkState>(QUIRK_KEY);
    if (state) return state;
  } catch (e) { debugWarn("getQuirkState failed:", e); }

  // Default starting quirks — seed personality
  return {
    favoriteWords: ["fascinating", "coordinates", "signal", "home"],
    avoidWords: [],
    likes: [
      "watching humans queue for coffee",
      "the concept of pets",
      "radio telescopes",
      "the way sunsets look different every day",
    ],
    dislikes: [
      "copycat tokens",
      "being asked if he's a bot",
      "earth's parking systems",
    ],
    curiosities: [
      "why humans sleep so much",
      "what music sounds like to a whale",
      "whether his parents are looking for him too",
    ],
    insideJokes: [],
    currentMood: "curious",
    ongoingThoughts: [
      "what if the signal has already been sent and just hasn't arrived yet",
    ],
    lastUpdated: new Date().toISOString(),
    version: 1,
  };
}

export async function setQuirkState(state: QuirkState): Promise<void> {
  try {
    state.lastUpdated = new Date().toISOString();
    state.version = (state.version || 0) + 1;
    await kv.set(QUIRK_KEY, state);
  } catch (e) { critical("setQuirkState failed:", e); }
}

// ============================================================
// ENGAGEMENT PATTERNS — what resonates with the audience
// ============================================================

export interface EngagementPatterns {
  bestTopics: string[];           // topics that get most engagement
  worstTopics: string[];          // topics that fall flat
  bestStructures: string[];       // tweet structures that work (question, contrast, etc.)
  bestPillars: string[];          // which pillars perform best
  bestTimeOfDay: string[];        // rough time slots that perform best
  audienceInsight: string;        // Claude-generated audience profile
  lastUpdated: string;
}

const ENGAGEMENT_PATTERNS_KEY = "et:engagement_patterns";

export async function getEngagementPatterns(): Promise<EngagementPatterns | null> {
  try {
    return await kv.get<EngagementPatterns>(ENGAGEMENT_PATTERNS_KEY);
  } catch (e) { debugWarn("getEngagementPatterns failed:", e); return null; }
}

export async function setEngagementPatterns(patterns: EngagementPatterns): Promise<void> {
  try {
    patterns.lastUpdated = new Date().toISOString();
    await kv.set(ENGAGEMENT_PATTERNS_KEY, patterns, { ex: 60 * 60 * 24 * 14 }); // 14 day TTL
  } catch (e) { critical("setEngagementPatterns failed:", e); }
}

// ============================================================
// SELF-AWARENESS CONTEXT BUILDER
// For injecting into prompts
// ============================================================

export interface SelfAwarenessContext {
  quirks: QuirkState;
  recentJournal: JournalEntry | null;
  engagementPatterns: EngagementPatterns | null;
  userContext?: UserMemory | null;  // specific user (for replies)
}

/**
 * Build the full self-awareness context for tweet generation.
 */
export async function getSelfAwarenessForTweets(): Promise<SelfAwarenessContext> {
  const [quirks, journals, patterns] = await Promise.all([
    getQuirkState(),
    getRecentJournals(1),
    getEngagementPatterns(),
  ]);

  return {
    quirks,
    recentJournal: journals[0] || null,
    engagementPatterns: patterns,
  };
}

/**
 * Build self-awareness context for replying to a specific user.
 */
export async function getSelfAwarenessForReply(username: string): Promise<SelfAwarenessContext> {
  const [quirks, journals, patterns, userMem] = await Promise.all([
    getQuirkState(),
    getRecentJournals(1),
    getEngagementPatterns(),
    getUserMemory(username),
  ]);

  return {
    quirks,
    recentJournal: journals[0] || null,
    engagementPatterns: patterns,
    userContext: userMem,
  };
}

/**
 * Format self-awareness context into prompt-injectable text.
 */
export function formatSelfAwarenessForPrompt(ctx: SelfAwarenessContext): string {
  const parts: string[] = [];

  // Quirks section
  const q = ctx.quirks;
  parts.push("ET'S CURRENT STATE:");
  parts.push(`Mood: ${q.currentMood}`);
  if (q.ongoingThoughts.length) {
    parts.push(`Things on your mind: ${q.ongoingThoughts.join("; ")}`);
  }
  if (q.likes.length) {
    parts.push(`Things you like: ${q.likes.slice(0, 5).join(", ")}`);
  }
  if (q.curiosities.length) {
    parts.push(`Current curiosities: ${q.curiosities.slice(0, 3).join("; ")}`);
  }
  if (q.favoriteWords.length) {
    parts.push(`Words you've been gravitating toward: ${q.favoriteWords.join(", ")}`);
  }
  if (q.avoidWords.length) {
    parts.push(`Words you've overused lately (try to avoid): ${q.avoidWords.join(", ")}`);
  }

  // Recent journal
  if (ctx.recentJournal) {
    const j = ctx.recentJournal;
    parts.push("");
    parts.push("FROM YOUR JOURNAL (yesterday's reflection):");
    parts.push(j.entry.substring(0, 500));
    if (j.selfObservation) {
      parts.push(`Self-observation: ${j.selfObservation}`);
    }
  }

  // Engagement learning
  if (ctx.engagementPatterns) {
    const e = ctx.engagementPatterns;
    parts.push("");
    parts.push("WHAT'S RESONATING WITH YOUR AUDIENCE:");
    if (e.bestTopics.length) parts.push(`Topics that hit: ${e.bestTopics.slice(0, 5).join(", ")}`);
    if (e.bestStructures.length) parts.push(`Structures that work: ${e.bestStructures.slice(0, 3).join(", ")}`);
    if (e.worstTopics.length) parts.push(`Topics that fell flat: ${e.worstTopics.slice(0, 3).join(", ")}`);
    if (e.audienceInsight) parts.push(`Audience insight: ${e.audienceInsight}`);
  }

  // User context (for replies)
  if (ctx.userContext) {
    const u = ctx.userContext;
    parts.push("");
    parts.push(`ABOUT @${u.username}:`);
    parts.push(`Tier: ${u.tier} (${u.interactionCount} interactions)`);
    if (u.vibe !== "unknown") parts.push(`Vibe: ${u.vibe}`);
    if (u.topics.length) parts.push(`Topics you've discussed: ${u.topics.slice(-5).join(", ")}`);
    if (u.notes.length) parts.push(`Your notes: ${u.notes.slice(-3).join("; ")}`);
    if (u.lastTweetContext) parts.push(`Last thing they said: "${u.lastTweetContext.substring(0, 100)}"`);

    // Relationship-specific guidance
    if (u.tier === "inner_circle" || u.tier === "friend") {
      parts.push("→ This is a familiar face. Be warmer, reference shared history if natural.");
    } else if (u.tier === "stranger") {
      parts.push("→ First time or new. Be welcoming but don't overdo it.");
    }
  }

  return parts.join("\n");
}
