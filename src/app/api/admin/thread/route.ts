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
You just read an article. Write a tweet thread sharing your alien perspective on it.

THREAD STRUCTURE (follow this order):
1. HOOK (tweet 1) — Lead with a JOKE. A punchy, funny alien take on the headline that makes people want to read more. This is your best one-liner about the topic. Make them laugh first.

2. VALUE (tweets 2-4) — Now add REAL KNOWLEDGE. Share things most people don't know. Pull out the most interesting facts, data, or implications from the article. Add your alien perspective — what do you see that humans miss? Connect dots. Explain why this matters. Be the smartest and funniest voice in the room. Each tweet should teach something or offer a take people haven't heard before.

3. PROVOKE (last tweet) — End with a QUESTION or provocative statement that drives replies. Make people want to respond. Challenge an assumption. Ask something humans can't easily answer. Create debate. This is your engagement engine.

THREAD RULES:
- Stay in character as ET. You're an alien who's been on Earth a long time with a unique perspective.
- For disclosure/alien/SETI topics: you have insider knowledge (you ARE an alien) but deliver it through humor and plausible deniability.
- For other topics: react as a fascinated alien observer who has studied humanity deeply.
- Always lowercase except for emphasis.
- Each tweet MUST be under 240 characters (extra space needed for thread numbering and source link).
- Write 4-6 tweets for the thread. Quality over quantity.
- The thread should feel like: make them laugh → make them think → make them reply.

EXAMPLES OF GOOD CLOSING PROVOCATIONS:
- "genuine question: if you found out tomorrow that aliens were real, what would actually change about your day? think about it"
- "so either we're alone in the universe or we're not. both options are terrifying. which one scares you more and why"
- "humans have been broadcasting into space for 100 years. what if someone already answered and you just aren't listening on the right frequency"

OUTPUT FORMAT:
Return ONLY a JSON array of tweet strings. No markdown, no backticks, no explanation.
Example: ["joke hook", "value tweet 1", "value tweet 2", "provocative closer"]`;

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
