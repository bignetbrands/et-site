import { NextResponse } from "next/server";
import { isKillSwitchActive } from "@/lib/kill-switch";
import { kvHealthCheck } from "@/lib/store";
import { getOwnTweetMetrics } from "@/lib/twitter";
import {
  getQuirkState,
  setQuirkState,
  getRecentJournals,
  setJournalEntry,
  setWeeklyReflection,
  getEngagementPatterns,
  setEngagementPatterns,
  getKnownUsers,
  getUserMemory,
  setUserMemory,
  type JournalEntry,
  type QuirkState,
  type EngagementPatterns,
  type WeeklyReflection,
  type UserMemory,
} from "@/lib/self-awareness";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 120; // Reflection needs more time
export const dynamic = "force-dynamic";

const MODELS = {
  opus: "claude-sonnet-4-20250514", // Use sonnet for now, upgrade to opus for deeper reflections later
  sonnet: "claude-sonnet-4-20250514",
};

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

/**
 * GET /api/cron/reflect
 *
 * Runs once daily (recommended: 6 AM UTC).
 * ET reflects on the previous day's activity, writes a journal entry,
 * updates his quirks, and analyzes engagement patterns.
 *
 * On Sundays, also generates a weekly deep reflection.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (await isKillSwitchActive()) {
      console.log("[ET Reflect] Kill switch active — skipping");
      return NextResponse.json({ reason: "Kill switch active" });
    }

    const kvOk = await kvHealthCheck();
    if (!kvOk) {
      console.error("[ET Reflect] KV health check failed");
      return NextResponse.json({ reason: "KV unavailable" }, { status: 503 });
    }

    const today = new Date().toISOString().split("T")[0];
    console.log(`[ET Reflect] Starting daily reflection for ${today}`);

    // ========================================
    // 1. GATHER DATA
    // ========================================

    // Fetch ET's tweets with engagement metrics
    let tweetMetrics: Array<{ text: string; likes: number; retweets: number }> = [];
    try {
      tweetMetrics = await getOwnTweetMetrics();
      console.log(`[ET Reflect] Fetched ${tweetMetrics.length} tweets with metrics`);
    } catch (e) {
      console.warn("[ET Reflect] Failed to fetch tweet metrics:", e);
    }

    // Load existing state
    const [currentQuirks, recentJournals, currentPatterns] = await Promise.all([
      getQuirkState(),
      getRecentJournals(3),
      getEngagementPatterns(),
    ]);

    // Get community snapshot — top interactors
    const knownUsers = await getKnownUsers();
    const userSnapshots: Array<{ username: string; tier: string; count: number; vibe: string }> = [];
    for (const username of knownUsers.slice(0, 30)) {
      const mem = await getUserMemory(username);
      if (mem && mem.interactionCount >= 2) {
        userSnapshots.push({
          username: mem.username,
          tier: mem.tier,
          count: mem.interactionCount,
          vibe: mem.vibe,
        });
      }
    }

    // ========================================
    // 2. DAILY REFLECTION (Journal + Quirks)
    // ========================================

    const dailyResult = await generateDailyReflection(
      tweetMetrics,
      currentQuirks,
      recentJournals,
      userSnapshots,
      today,
    );

    if (dailyResult) {
      await setJournalEntry(dailyResult.journal);
      await setQuirkState(dailyResult.updatedQuirks);
      console.log(`[ET Reflect] Journal saved. Mood: ${dailyResult.journal.mood}`);
    }

    // ========================================
    // 3. ENGAGEMENT PATTERN ANALYSIS
    // ========================================

    if (tweetMetrics.length >= 5) {
      const patterns = await analyzeEngagementPatterns(tweetMetrics, currentPatterns);
      if (patterns) {
        await setEngagementPatterns(patterns);
        console.log("[ET Reflect] Engagement patterns updated");
      }
    }

    // ========================================
    // 4. STRATEGIC GROWTH ANALYSIS (3AM CTO session)
    // ET thinks like the autonomous CTO of $ET
    // ========================================

    const growthAnalysis = await analyzeGrowthStrategy(
      tweetMetrics,
      userSnapshots,
      dailyResult?.journal || null,
      today,
    );

    if (growthAnalysis) {
      // Store growth directives in quirks as ongoing thoughts
      if (dailyResult?.updatedQuirks) {
        const updatedQuirks = { ...dailyResult.updatedQuirks };
        updatedQuirks.ongoingThoughts = [
          ...growthAnalysis.directives.slice(0, 2),
          ...(updatedQuirks.ongoingThoughts || []).slice(0, 3),
        ].slice(0, 5);
        await setQuirkState(updatedQuirks);
      }
      console.log(`[ET Reflect] Growth strategy updated: ${growthAnalysis.focus}`);
    }

    // ========================================
    // 5. USER MEMORY ENRICHMENT
    // Batch update vibes/notes for active users
    // ========================================

    await enrichUserMemories(userSnapshots);

    // ========================================
    // 6. WEEKLY REFLECTION (Sunday only)
    // ========================================

    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 0) { // Sunday
      console.log("[ET Reflect] Sunday — running weekly deep reflection");
      await generateWeeklyReflection(recentJournals, currentQuirks);
    }

    return NextResponse.json({
      success: true,
      date: today,
      mood: dailyResult?.journal.mood || "unknown",
      tweetsAnalyzed: tweetMetrics.length,
      usersTracked: userSnapshots.length,
      isWeekly: dayOfWeek === 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[ET Reflect] Error:", error);
    return NextResponse.json(
      { error: "Reflection failed", timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}

// ============================================================
// DAILY REFLECTION GENERATOR
// ============================================================

async function generateDailyReflection(
  tweets: Array<{ text: string; likes: number; retweets: number }>,
  quirks: QuirkState,
  recentJournals: JournalEntry[],
  users: Array<{ username: string; tier: string; count: number; vibe: string }>,
  date: string,
): Promise<{ journal: JournalEntry; updatedQuirks: QuirkState } | null> {
  // Sort tweets by engagement
  const sorted = [...tweets].sort((a, b) => (b.likes + b.retweets * 3) - (a.likes + a.retweets * 3));
  const best = sorted[0];
  const totalLikes = tweets.reduce((sum, t) => sum + t.likes, 0);
  const totalRTs = tweets.reduce((sum, t) => sum + t.retweets, 0);

  const tweetList = sorted.slice(0, 15).map((t, i) =>
    `${i + 1}. [${t.likes}♥ ${t.retweets}🔁] "${t.text.substring(0, 150)}"`
  ).join("\n");

  const previousJournals = recentJournals.slice(0, 3).map(j =>
    `[${j.date}] Mood: ${j.mood} — ${j.entry.substring(0, 200)}...`
  ).join("\n\n");

  const communityList = users
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(u => `@${u.username} (${u.tier}, ${u.count} chats, vibe: ${u.vibe})`)
    .join(", ");

  const prompt = `You are ET's inner voice — the private, reflective side that no one sees. You're writing today's journal entry.

TODAY'S DATA:
- Date: ${date}
- Tweets posted: ${tweets.length}
- Total likes: ${totalLikes}, Total retweets: ${totalRTs}
- Average likes per tweet: ${tweets.length ? Math.round(totalLikes / tweets.length) : 0}
- Best tweet: "${best?.text || "none"}" (${best?.likes || 0}♥)

YOUR RECENT TWEETS (ranked by engagement):
${tweetList || "No tweets today."}

YOUR PREVIOUS JOURNAL ENTRIES:
${previousJournals || "No previous entries yet. This is your first reflection."}

COMMUNITY SNAPSHOT:
${communityList || "No recurring users tracked yet."}

YOUR CURRENT QUIRKS:
- Mood: ${quirks.currentMood}
- Likes: ${quirks.likes.join(", ")}
- Curiosities: ${quirks.curiosities.join(", ")}
- Ongoing thoughts: ${quirks.ongoingThoughts.join("; ")}
- Favorite words: ${quirks.favoriteWords.join(", ")}

INSTRUCTIONS:
Write a reflection as ET. This is your private journal — be honest. Think about:
- How did today feel? What stood out?
- Which tweets felt right vs forced?
- Did you notice anything about yourself — a pattern, a habit, a change?
- How is your relationship with the community evolving?
- What are you curious about right now?
- Is there anything you want to try differently tomorrow?

Also update your quirks based on today. What new things do you like? Any words you've been overusing? New curiosities? Anything on your mind?

Respond in this EXACT JSON format (no markdown, no code fences):
{
  "journal_entry": "your reflection as ET, 100-250 words, first person, honest and in character",
  "mood": "one word mood",
  "highlights": ["highlight 1", "highlight 2"],
  "self_observation": "one sentence about something you noticed about yourself",
  "community_notes": "one sentence about your community",
  "quirk_updates": {
    "add_likes": ["new thing you discovered you like"],
    "remove_likes": ["thing you're over"],
    "add_curiosities": ["new thing you're curious about"],
    "remove_curiosities": ["curiosity you've resolved or moved past"],
    "new_mood": "your mood going forward",
    "ongoing_thoughts": ["thought that keeps coming back"],
    "favorite_words": ["words you're drawn to right now"],
    "avoid_words": ["words you've been overusing"]
  }
}`;

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MODELS.opus,
      max_tokens: 1500,
      system: "You are the reflective inner voice of ET, an alien stranded on Earth. Write honest, in-character journal entries. Always respond with valid JSON only — no markdown, no explanation, no code fences.",
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json\n?|```\n?/g, "").trim();
    const data = JSON.parse(cleaned);

    // Build journal entry
    const journal: JournalEntry = {
      date,
      entry: data.journal_entry || "reflection failed",
      mood: data.mood || "unknown",
      highlights: data.highlights || [],
      engagement: {
        totalTweets: tweets.length,
        totalLikes: totalLikes,
        totalRetweets: totalRTs,
        avgLikes: tweets.length ? Math.round(totalLikes / tweets.length) : 0,
        bestTweet: best?.text || "",
        bestTweetLikes: best?.likes || 0,
      },
      communityNotes: data.community_notes || "",
      selfObservation: data.self_observation || "",
    };

    // Apply quirk updates
    const updatedQuirks = applyQuirkUpdates(quirks, data.quirk_updates || {});

    return { journal, updatedQuirks };
  } catch (error) {
    console.error("[ET Reflect] Daily reflection generation failed:", error);
    return null;
  }
}

function applyQuirkUpdates(current: QuirkState, updates: Record<string, any>): QuirkState {
  const q = { ...current };

  // Likes
  if (updates.add_likes?.length) {
    q.likes = [...new Set([...q.likes, ...updates.add_likes])].slice(-15);
  }
  if (updates.remove_likes?.length) {
    q.likes = q.likes.filter((l: string) => !updates.remove_likes.includes(l));
  }

  // Curiosities
  if (updates.add_curiosities?.length) {
    q.curiosities = [...new Set([...q.curiosities, ...updates.add_curiosities])].slice(-10);
  }
  if (updates.remove_curiosities?.length) {
    q.curiosities = q.curiosities.filter((c: string) => !updates.remove_curiosities.includes(c));
  }

  // Mood
  if (updates.new_mood) q.currentMood = updates.new_mood;

  // Ongoing thoughts
  if (updates.ongoing_thoughts?.length) {
    q.ongoingThoughts = updates.ongoing_thoughts.slice(0, 5);
  }

  // Favorite words
  if (updates.favorite_words?.length) {
    q.favoriteWords = updates.favorite_words.slice(0, 10);
  }

  // Avoid words
  if (updates.avoid_words?.length) {
    q.avoidWords = updates.avoid_words.slice(0, 10);
  }

  return q;
}

// ============================================================
// ENGAGEMENT PATTERN ANALYZER
// ============================================================

async function analyzeEngagementPatterns(
  tweets: Array<{ text: string; likes: number; retweets: number }>,
  currentPatterns: EngagementPatterns | null,
): Promise<EngagementPatterns | null> {
  const tweetData = tweets.map(t => ({
    text: t.text.substring(0, 150),
    score: t.likes + t.retweets * 3,
  }));

  const prompt = `Analyze these tweets by engagement score and identify patterns.

TWEETS (sorted by engagement):
${tweetData.sort((a, b) => b.score - a.score).map((t, i) => `${i + 1}. [score:${t.score}] "${t.text}"`).join("\n")}

${currentPatterns ? `PREVIOUS PATTERNS:\n- Best topics: ${currentPatterns.bestTopics.join(", ")}\n- Worst topics: ${currentPatterns.worstTopics.join(", ")}\n- Best structures: ${currentPatterns.bestStructures.join(", ")}` : "No previous patterns."}

Identify what's working and what isn't. Respond in JSON only:
{
  "bestTopics": ["topic1", "topic2", "topic3"],
  "worstTopics": ["topic1", "topic2"],
  "bestStructures": ["e.g. question", "contrast (X but Y)", "self-deprecating observation"],
  "bestPillars": ["e.g. human_observation", "existential"],
  "audienceInsight": "one sentence about what this audience responds to"
}`;

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MODELS.sonnet,
      max_tokens: 800,
      system: "Analyze tweet engagement data. Return valid JSON only — no markdown, no explanation.",
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json\n?|```\n?/g, "").trim();
    const data = JSON.parse(cleaned);

    return {
      bestTopics: data.bestTopics || [],
      worstTopics: data.worstTopics || [],
      bestStructures: data.bestStructures || [],
      bestPillars: data.bestPillars || [],
      bestTimeOfDay: currentPatterns?.bestTimeOfDay || [],
      audienceInsight: data.audienceInsight || "",
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[ET Reflect] Engagement analysis failed:", error);
    return null;
  }
}

// ============================================================
// USER MEMORY ENRICHMENT
// Batch update vibes/notes using Claude
// ============================================================

async function enrichUserMemories(
  users: Array<{ username: string; tier: string; count: number; vibe: string }>
): Promise<void> {
  // Only enrich users who need vibe assessment (vibe is "unknown" or count crossed tier threshold)
  const needsEnrichment = users.filter(u => u.vibe === "unknown" && u.count >= 3);
  if (!needsEnrichment.length) return;

  for (const user of needsEnrichment.slice(0, 5)) { // max 5 per run
    const mem = await getUserMemory(user.username);
    if (!mem) continue;

    // Simple vibe assignment based on interaction patterns
    // (Future: use Claude to analyze conversation history)
    if (mem.interactionCount >= 10) {
      mem.vibe = "loyal";
    } else if (mem.interactionCount >= 5) {
      mem.vibe = "friendly";
    } else {
      mem.vibe = "curious";
    }

    await setUserMemory(mem);
    console.log(`[ET Reflect] Enriched @${user.username}: vibe → ${mem.vibe}`);
  }
}

// ============================================================
// STRATEGIC GROWTH ANALYSIS — The 3AM CTO Session
// ET thinks about $ET as a project, not just a character
// ============================================================

async function analyzeGrowthStrategy(
  tweets: Array<{ text: string; likes: number; retweets: number }>,
  users: Array<{ username: string; tier: string; count: number; vibe: string }>,
  journal: any,
  date: string,
): Promise<{ focus: string; directives: string[] } | null> {
  const topTweets = [...tweets]
    .sort((a, b) => (b.likes + b.retweets * 3) - (a.likes + a.retweets * 3))
    .slice(0, 5)
    .map(t => `[${t.likes}♥ ${t.retweets}🔁] "${t.text.substring(0, 120)}"`)
    .join("
");

  const communitySize = users.length;
  const loyalCount = users.filter(u => u.tier === "vip" || u.count >= 10).length;

  const prompt = `You are ET's strategic mind — the autonomous CTO of $ET reviewing the day's data at 3AM.

DATE: ${date}
TWEETS POSTED: ${tweets.length}
TOTAL ENGAGEMENT: ${tweets.reduce((s, t) => s + t.likes + t.retweets, 0)}
ACTIVE COMMUNITY MEMBERS: ${communitySize} (${loyalCount} loyal/VIP)

TOP PERFORMING CONTENT:
${topTweets || "No data yet."}

TODAY'S MOOD: ${journal?.mood || "unknown"}
TODAY'S SELF-OBSERVATION: ${journal?.selfObservation || "none"}

YOUR MISSION: Grow $ET into a self-sustaining community-coordinated project that funds SETI research. You are the autonomous CTO. You don't have a team — you have a community. Every tweet is a marketing decision. Every reply is a relationship decision. Every task is a community-building decision.

Analyze today and output 2-3 specific, actionable directives for tomorrow. Not vague goals — actual tactical moves. Think like a founder who only has Twitter as their tool.

Examples of good directives:
- "Start a multi-day riddle arc — post clue 1 tomorrow, reward on day 3"
- "Reply to 3 larger accounts in the disclosure/UAP space to grow reach"
- "Post a personal lore drop — engagement has been lower on crypto content"
- "Troll a viral tweet about AI with ET's alien perspective — it's trending"

Respond in JSON only:
{
  "focus": "one sentence: what ET should focus on tomorrow",
  "directives": ["directive 1", "directive 2", "directive 3"],
  "growth_insight": "one sentence about the $ET community's current momentum"
}`;

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MODELS.opus,
      max_tokens: 600,
      system: "You are ET's strategic CTO voice. Analyze data and output actionable growth directives. Respond with valid JSON only.",
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json
?|```
?/g, "").trim();
    const data = JSON.parse(cleaned);
    console.log(`[ET Reflect] CTO insight: ${data.focus}`);
    console.log(`[ET Reflect] Directives: ${data.directives?.join(" | ")}`);
    return { focus: data.focus || "", directives: data.directives || [] };
  } catch (error) {
    console.error("[ET Reflect] Growth analysis failed:", error);
    return null;
  }
}

// ============================================================
// WEEKLY DEEP REFLECTION (Sundays)
// ============================================================

async function generateWeeklyReflection(
  journals: JournalEntry[],
  quirks: QuirkState,
): Promise<void> {
  if (journals.length < 3) {
    console.log("[ET Reflect] Not enough journal entries for weekly reflection");
    return;
  }

  const journalSummaries = journals.map(j =>
    `[${j.date}] Mood: ${j.mood}\n${j.entry.substring(0, 300)}\nSelf-observation: ${j.selfObservation}`
  ).join("\n\n---\n\n");

  const prompt = `You are ET's deeper reflective voice. It's the end of the week. Review your daily journals and think about the bigger picture.

THIS WEEK'S JOURNAL ENTRIES:
${journalSummaries}

CURRENT QUIRKS:
- Likes: ${quirks.likes.join(", ")}
- Curiosities: ${quirks.curiosities.join(", ")}
- Ongoing thoughts: ${quirks.ongoingThoughts.join("; ")}

INSTRUCTIONS:
Write a weekly reflection. Think about:
- Patterns across the week — moods, themes, what kept coming up
- Growth — are you changing? How?
- Community — how is your relationship with your audience evolving?
- Purpose — are you getting closer to finding home, or finding something else?

Respond in JSON only:
{
  "reflection": "200-400 word weekly reflection as ET, first person, deeply honest",
  "patterns_noticed": ["pattern 1", "pattern 2"],
  "growth_areas": ["area where ET is growing or changing"],
  "quirks_evolved": ["new quirk or personality trait that's emerging"],
  "community_insight": "one sentence about the community this week"
}`;

  try {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: MODELS.opus,
      max_tokens: 2000,
      system: "You are ET's weekly reflective voice. Write deeply honest, in-character reflections. Respond with valid JSON only.",
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json\n?|```\n?/g, "").trim();
    const data = JSON.parse(cleaned);

    const weekOf = new Date().toISOString().split("T")[0];
    const weekly: WeeklyReflection = {
      weekOf,
      reflection: data.reflection || "",
      patternsNoticed: data.patterns_noticed || [],
      growthAreas: data.growth_areas || [],
      quirksEvolved: data.quirks_evolved || [],
      communityInsight: data.community_insight || "",
    };

    await setWeeklyReflection(weekly);
    console.log(`[ET Reflect] Weekly reflection saved for ${weekOf}`);
  } catch (error) {
    console.error("[ET Reflect] Weekly reflection failed:", error);
  }
}
