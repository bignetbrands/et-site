import { NextResponse } from "next/server";
import { getRecentTweets, getTopPerformers, getRecentTweetsEnriched, getTweetMemorySummary } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Get stored recent tweets (our memory)
    const storedTweets = await getRecentTweets();

    // 2. Get top performers
    const topPerformers = await getTopPerformers();

    // 2b. Get structured memory summary
    const memorySummary = await getTweetMemorySummary();
    const enrichedTweets = await getRecentTweetsEnriched();

    // 3. Fetch from Twitter API
    const { TwitterApi } = await import("twitter-api-v2");
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY!,
      appSecret: process.env.TWITTER_API_SECRET!,
      accessToken: process.env.TWITTER_ACCESS_TOKEN!,
      accessSecret: process.env.TWITTER_ACCESS_SECRET!,
    });

    let liveTweets: Array<{ text: string; created_at?: string; likes: number; retweets: number }> = [];
    try {
      const results = await client.v2.search("from:etalienx -is:retweet", {
        max_results: 100,
        "tweet.fields": "public_metrics,created_at",
        sort_order: "recency",
      });

      if (results.data?.data) {
        liveTweets = results.data.data.map(t => ({
          text: t.text.replace(/https:\/\/t\.co\/\w+/g, "").trim(),
          created_at: t.created_at,
          likes: t.public_metrics?.like_count || 0,
          retweets: t.public_metrics?.retweet_count || 0,
        }));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Twitter fetch failed:", msg);
    }

    // 4. Analyze redundancy
    const textCounts = new Map<string, number>();

    for (const tweet of liveTweets) {
      const normalized = tweet.text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      textCounts.set(normalized, (textCounts.get(normalized) || 0) + 1);
    }

    // Find exact dupes
    const exactDupes = Array.from(textCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([text, count]) => ({ text: text.substring(0, 100), count }));

    // Find repeated openings (same first 3 words)
    const openingPatterns = new Map<string, string[]>();
    for (const tweet of liveTweets) {
      const opening = tweet.text.toLowerCase().split(/\s+/).slice(0, 3).join(" ");
      if (!openingPatterns.has(opening)) openingPatterns.set(opening, []);
      openingPatterns.get(opening)!.push(tweet.text);
    }
    const repeatedOpenings = Array.from(openingPatterns.entries())
      .filter(([, tweets]) => tweets.length > 1)
      .map(([opening, tweets]) => ({
        opening,
        count: tweets.length,
        examples: tweets.slice(0, 3).map(t => t.substring(0, 100)),
      }))
      .sort((a, b) => b.count - a.count);

    // Find repeated topics/themes (key nouns appearing in multiple tweets)
    const topicWords = ["alien", "human", "star", "universe", "signal", "home", "planet", "lonely", "memory", "crash", "phone", "dna", "brain", "seti", "boinc", "congress", "disclosure", "chart", "coin", "degen", "coordinate"];
    const topicCounts: Record<string, number> = {};
    for (const tweet of liveTweets) {
      const lower = tweet.text.toLowerCase();
      for (const word of topicWords) {
        if (lower.includes(word)) {
          topicCounts[word] = (topicCounts[word] || 0) + 1;
        }
      }
    }

    return NextResponse.json({
      memory: {
        storedCount: storedTweets.length,
        topStored: storedTweets.slice(0, 30),
        enrichedCount: enrichedTweets.length,
        memorySummary: {
          overusedTopics: Object.entries(memorySummary.topicFrequency)
            .filter(([, count]) => count >= 3)
            .sort((a, b) => b[1] - a[1]),
          usedStructures: memorySummary.usedStructures,
          usedOpenings: memorySummary.usedOpenings,
        },
      },
      topPerformers: topPerformers.slice(0, 10),
      live: {
        totalTweets: liveTweets.length,
        tweets: liveTweets,
      },
      analysis: {
        exactDuplicates: exactDupes,
        repeatedOpenings,
        topicFrequency: Object.entries(topicCounts).sort((a, b) => b[1] - a[1]),
        uniqueTweets: liveTweets.length - exactDupes.reduce((sum, d) => sum + d.count - 1, 0),
      },
    });
  } catch (error) {
    console.error("Audit error:", error);
    return NextResponse.json({ error: "Audit failed" }, { status: 500 });
  }
}
