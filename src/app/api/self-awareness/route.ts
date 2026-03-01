import { NextResponse } from "next/server";
import {
  getQuirkState,
  getRecentJournals,
  getEngagementPatterns,
  getKnownUsers,
  getUserMemory,
  type UserMemory,
} from "@/lib/self-awareness";

export const dynamic = "force-dynamic";

/**
 * GET /api/self-awareness
 *
 * Returns ET's full self-awareness state:
 * - Current quirks (mood, likes, curiosities, ongoing thoughts)
 * - Recent journal entries
 * - Engagement patterns
 * - Known users and their tiers
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [quirks, journals, patterns] = await Promise.all([
      getQuirkState(),
      getRecentJournals(7),
      getEngagementPatterns(),
    ]);

    // Get user memory summary
    const knownUsernames = await getKnownUsers();
    const users: Array<{
      username: string;
      tier: string;
      interactions: number;
      vibe: string;
      firstSeen: string;
      lastSeen: string;
    }> = [];

    for (const username of knownUsernames.slice(0, 50)) {
      const mem = await getUserMemory(username);
      if (mem) {
        users.push({
          username: mem.username,
          tier: mem.tier,
          interactions: mem.interactionCount,
          vibe: mem.vibe,
          firstSeen: mem.firstSeen,
          lastSeen: mem.lastSeen,
        });
      }
    }

    // Sort users by interaction count
    users.sort((a, b) => b.interactions - a.interactions);

    return NextResponse.json({
      quirks: {
        mood: quirks.currentMood,
        likes: quirks.likes,
        dislikes: quirks.dislikes,
        curiosities: quirks.curiosities,
        ongoingThoughts: quirks.ongoingThoughts,
        favoriteWords: quirks.favoriteWords,
        avoidWords: quirks.avoidWords,
        insideJokes: quirks.insideJokes,
        version: quirks.version,
        lastUpdated: quirks.lastUpdated,
      },
      journals: journals.map(j => ({
        date: j.date,
        mood: j.mood,
        entry: j.entry,
        highlights: j.highlights,
        selfObservation: j.selfObservation,
        communityNotes: j.communityNotes,
        engagement: j.engagement,
      })),
      engagementPatterns: patterns,
      community: {
        totalKnown: knownUsernames.length,
        topUsers: users.slice(0, 20),
        tierBreakdown: {
          inner_circle: users.filter(u => u.tier === "inner_circle").length,
          friend: users.filter(u => u.tier === "friend").length,
          regular: users.filter(u => u.tier === "regular").length,
          acquaintance: users.filter(u => u.tier === "acquaintance").length,
          stranger: users.filter(u => u.tier === "stranger").length,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Self-Awareness API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch self-awareness state" },
      { status: 500 }
    );
  }
}
