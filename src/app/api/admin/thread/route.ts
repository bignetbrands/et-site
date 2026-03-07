import { NextResponse } from "next/server";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import { postTweet, postReply } from "@/lib/twitter";
import { recordTweet, recordAction } from "@/lib/store";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return _client;
}

const THREAD_PROMPT = `${SYSTEM_PROMPT}

THREAD MODE — LONGFORM OPINION PIECE:
You just read an article. Write a tweet thread (chain of tweets) sharing your alien perspective on it.

THREAD RULES:
- First tweet hooks the reader — a punchy take that makes people want to read more. It should reference or link to the article topic but stand on its own.
- Each subsequent tweet builds on the thread — adding perspective, observations, questions, or reactions.
- Stay in character as ET. You're an alien who's been on Earth a long time, you have a unique perspective on human affairs.
- Mix humor with genuine insight. You're funny but you also have something real to say.
- For disclosure/alien/SETI topics: you have insider knowledge (you ARE an alien) but deliver it through humor and plausible deniability.
- For other topics: react as a fascinated alien observer of human behavior.
- Always lowercase except for emphasis.
- Each tweet MUST be under 240 characters (extra space is needed for thread numbering and source link).
- Write 3-6 tweets for the thread. Quality over quantity.
- End the thread with something memorable — a punchline, a question, or a moment of genuine reflection.

OUTPUT FORMAT:
Return ONLY a JSON array of tweet strings. No markdown, no backticks, no explanation.
Example: ["first tweet", "second tweet", "third tweet"]`;

async function fetchArticle(url: string): Promise<string> {
  // Fetch the article HTML
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ETSearchBot/1.0; +https://etsearch.fun)",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch article: ${res.status}`);
  const html = await res.text();

  // Extract text content (strip HTML tags, scripts, styles)
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  // Truncate to ~4000 chars to stay within reasonable prompt size
  if (text.length > 4000) {
    text = text.substring(0, 4000) + "...";
  }

  return text;
}

/**
 * POST /api/admin/thread
 * 
 * Body:
 *   url: string — article URL
 *   dryRun: boolean — preview only (default true)
 *   tweets: string[] — pre-generated tweets to post (skip generation)
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { url, dryRun = true, tweets: preGenerated } = body;

    // If pre-generated tweets provided, just post them as a thread
    if (preGenerated && Array.isArray(preGenerated) && preGenerated.length > 0) {
      const posted = await postThread(preGenerated, url);
      return NextResponse.json({
        mode: "posted",
        thread: posted,
        tweetCount: posted.length,
        timestamp: new Date().toISOString(),
      });
    }

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }

    // 1. Fetch article
    console.log(`[ET Thread] Fetching: ${url}`);
    const articleText = await fetchArticle(url);
    console.log(`[ET Thread] Article text: ${articleText.length} chars`);

    if (articleText.length < 100) {
      return NextResponse.json({ error: "Could not extract meaningful content from URL" }, { status: 400 });
    }

    // 2. Generate thread via Claude
    console.log("[ET Thread] Generating thread...");
    const response = await getClient().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: THREAD_PROMPT,
      messages: [
        {
          role: "user",
          content: `Read this article and write a tweet thread with your alien perspective:\n\nURL: ${url}\n\nARTICLE CONTENT:\n${articleText}`,
        },
      ],
    });

    const rawText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Parse JSON array
    let threadTweets: string[];
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      threadTweets = JSON.parse(cleaned);
      if (!Array.isArray(threadTweets)) throw new Error("Not an array");
      threadTweets = threadTweets
        .map((t) => String(t).trim())
        .filter((t) => t.length > 0 && t.length <= 240);
    } catch {
      return NextResponse.json({
        error: "Failed to parse thread",
        raw: rawText.substring(0, 500),
      }, { status: 500 });
    }

    if (threadTweets.length === 0) {
      return NextResponse.json({ error: "No valid tweets generated" }, { status: 500 });
    }

    // 3. Dry run — return preview
    if (dryRun) {
      return NextResponse.json({
        mode: "preview",
        url,
        tweets: threadTweets,
        tweetCount: threadTweets.length,
        totalChars: threadTweets.reduce((sum, t) => sum + t.length, 0),
        timestamp: new Date().toISOString(),
      });
    }

    // 4. Post thread
    const posted = await postThread(threadTweets, url);

    return NextResponse.json({
      mode: "posted",
      url,
      thread: posted,
      tweetCount: posted.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[ET Thread] Error:", error);
    return NextResponse.json(
      { error: `Failed: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

async function postThread(
  tweets: string[],
  sourceUrl?: string,
): Promise<Array<{ id: string; text: string; index: number }>> {
  const posted: Array<{ id: string; text: string; index: number }> = [];
  const total = tweets.length;

  for (let i = 0; i < total; i++) {
    let text = tweets[i];
    const count = `[${i + 1}/${total}]`;
    const isLast = i === total - 1;

    if (i === 0 && sourceUrl) {
      // First tweet: source URL + count + 👇
      text = `${text}\n\n${sourceUrl}\n\n${count} 👇`;
    } else if (isLast) {
      // Last tweet: just count, no arrow
      text = `${text}\n\n${count}`;
    } else {
      // Middle tweets: count + 👇
      text = `${text}\n\n${count} 👇`;
    }

    let tweetId: string;
    if (i === 0) {
      // First tweet
      tweetId = await postTweet(text);
    } else {
      // Reply to previous tweet in chain
      tweetId = await postReply(text, posted[i - 1].id);
    }

    posted.push({ id: tweetId, text, index: i });

    // Record first tweet
    if (i === 0) {
      await recordTweet({
        id: tweetId,
        text,
        pillar: "disclosure_conspiracy", // Best fit for article reactions
        postedAt: new Date().toISOString(),
        hasImage: false,
      });
      await recordAction();
    }

    // Small delay between chain posts (3-5s)
    if (i < tweets.length - 1) {
      await new Promise((r) => setTimeout(r, 3000 + Math.random() * 2000));
    }

    console.log(`[ET Thread] Posted ${i + 1}/${tweets.length}: ${tweetId}`);
  }

  return posted;
}
