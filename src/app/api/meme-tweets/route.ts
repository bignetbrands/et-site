// app/api/meme-tweets/route.ts
// Generates, persists, and tracks tweet suggestions per meme image
// Uses Vercel KV so tweets are shared across all users

import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

const KV_PREFIX = "et:meme-tweets:";

interface StoredTweet {
  text: string;
  usedCount: number;
}

interface StoredMemeData {
  tweets: StoredTweet[];
  createdAt: number;
}

// Extract a stable image ID from CDN URL
function imageKey(url: string): string {
  const match = url.match(/imagedelivery\/[a-zA-Z0-9_-]+\/([a-zA-Z0-9_-]+)\//);
  return match ? match[1] : Buffer.from(url).toString("base64").slice(0, 40);
}

const SYSTEM_PROMPT = `You are ET, an alien stranded on Earth. You're writing tweets to share meme images about yourself and your $ET token on Solana. 

Your voice:
- Lowercase for casual/funny tweets
- Mix of humor and a quiet sadness layer
- You're an alien observing humans, fascinated and confused
- You use internet slang naturally (tbh, fr, lowkey, honestly, hear me out) — Rotate openers — never use the same one twice in a row
- You sometimes reference your amnesia, missing home, crash landing
- You reference $ET, BOINC, Einstein@home, SETI when relevant
- Short punchy tweets, under 200 characters ideally
- Never use hashtags
- Alien emoji (👽) sparingly

Generate exactly 5 different tweet options. Each should be a different vibe:
1. Funny/shitpost energy
2. Relatable/emotional  
3. Degen/crypto energy
4. Mysterious/lore
5. Community hype

Respond ONLY with a JSON array of 5 strings. No markdown, no backticks, no explanation.`;

// GET — retrieve saved tweets for an image (by imageId query param)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageId = searchParams.get("imageId");
  if (!imageId) {
    return NextResponse.json({ error: "imageId required" }, { status: 400 });
  }
  try {
    const data = await kv.get<StoredMemeData>(`${KV_PREFIX}${imageId}`);
    if (data) {
      return NextResponse.json({ tweets: data.tweets, cached: true });
    }
    return NextResponse.json({ tweets: null });
  } catch {
    return NextResponse.json({ tweets: null });
  }
}

// POST — generate tweets for an image (or return saved ones)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { imageUrl, action, tweetIndex } = body;

    // Mark a tweet as used
    if (action === "use" && imageUrl && typeof tweetIndex === "number") {
      const id = imageKey(imageUrl);
      const data = await kv.get<StoredMemeData>(`${KV_PREFIX}${id}`);
      if (data && data.tweets[tweetIndex]) {
        data.tweets[tweetIndex].usedCount += 1;
        await kv.set(`${KV_PREFIX}${id}`, data, { ex: 30 * 24 * 60 * 60 }); // 30 days
        return NextResponse.json({ success: true, tweet: data.tweets[tweetIndex] });
      }
      return NextResponse.json({ error: "Tweet not found" }, { status: 404 });
    }

    if (!imageUrl) {
      return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
    }

    const id = imageKey(imageUrl);

    // Check KV for existing tweets
    const existing = await kv.get<StoredMemeData>(`${KV_PREFIX}${id}`);
    if (existing) {
      return NextResponse.json({ tweets: existing.tweets, cached: true });
    }

    // Fetch the image as base64
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      throw new Error(`Failed to fetch image: ${imgRes.status}`);
    }
    const imgBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString("base64");

    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const mediaType = contentType.includes("png") ? "image/png" : "image/jpeg";

    // Call Claude API
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: base64 },
              },
              { type: "text", text: "Write 5 tweet options for sharing this meme image. JSON array only." },
            ],
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      throw new Error(`Claude API error: ${claudeRes.status}`);
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || "[]";

    let rawTweets: string[];
    try {
      const cleaned = text.replace(/```json|```/g, "").trim();
      rawTweets = JSON.parse(cleaned);
      if (!Array.isArray(rawTweets)) throw new Error("Not an array");
      rawTweets = rawTweets.slice(0, 5).map((t: string) => String(t).trim());
    } catch {
      rawTweets = [
        "$ET 👽 we out here",
        "ngl this goes hard. $ET",
        "the search continues. $ET",
        "ET sees you 👽",
        "phone home or die trying. $ET",
      ];
    }

    // Store with usedCount
    const storedTweets: StoredTweet[] = rawTweets.map(t => ({ text: t, usedCount: 0 }));
    const storeData: StoredMemeData = { tweets: storedTweets, createdAt: Date.now() };
    await kv.set(`${KV_PREFIX}${id}`, storeData, { ex: 30 * 24 * 60 * 60 }); // 30 days

    return NextResponse.json({ tweets: storedTweets, cached: false });
  } catch (error) {
    console.error("[/api/meme-tweets] Error:", error);

    const fallback = [
      "$ET 👽 we out here",
      "ngl this goes hard. $ET",
      "the search continues. $ET",
      "ET sees you 👽",
      "phone home or die trying. $ET",
    ].map(t => ({ text: t, usedCount: 0 }));

    return NextResponse.json({ tweets: fallback, error: true });
  }
}
