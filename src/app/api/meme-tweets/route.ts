// app/api/meme-tweets/route.ts
// Analyzes a meme image with Claude and returns 5 tweet suggestions
// Caches results per image URL to avoid repeat API calls

import { NextResponse } from "next/server";

// In-memory cache: imageUrl -> { tweets, timestamp }
const cache = new Map<string, { tweets: string[]; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours — meme analysis doesn't change

const SYSTEM_PROMPT = `You are ET, an alien stranded on Earth. You're writing tweets to share meme images about yourself and your $ET token on Solana. 

Your voice:
- Lowercase for casual/funny tweets
- Mix of humor and a quiet sadness layer
- You're an alien observing humans, fascinated and confused
- You use internet slang naturally (ngl, tbh, fr)
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

export async function POST(request: Request) {
  try {
    const { imageUrl } = await request.json();

    if (!imageUrl) {
      return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
    }

    // Check cache
    const cached = cache.get(imageUrl);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({ tweets: cached.tweets, cached: true });
    }

    // Fetch the image as base64
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      throw new Error(`Failed to fetch image: ${imgRes.status}`);
    }
    const imgBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString("base64");

    // Determine media type
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
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64,
                },
              },
              {
                type: "text",
                text: "Write 5 tweet options for sharing this meme image. JSON array only.",
              },
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

    // Parse JSON response
    let tweets: string[];
    try {
      const cleaned = text.replace(/```json|```/g, "").trim();
      tweets = JSON.parse(cleaned);
      if (!Array.isArray(tweets)) throw new Error("Not an array");
      tweets = tweets.slice(0, 5).map((t: string) => String(t).trim());
    } catch {
      // Fallback tweets if parsing fails
      tweets = [
        "$ET 👽 we out here",
        "ngl this goes hard. $ET",
        "the search continues. $ET",
        "ET sees you 👽",
        "phone home or die trying. $ET",
      ];
    }

    // Cache results
    cache.set(imageUrl, { tweets, timestamp: Date.now() });

    return NextResponse.json({ tweets, cached: false });
  } catch (error) {
    console.error("[/api/meme-tweets] Error:", error);

    // Return fallback tweets on error
    return NextResponse.json({
      tweets: [
        "$ET 👽 we out here",
        "ngl this goes hard. $ET",
        "the search continues. $ET",
        "ET sees you 👽",
        "phone home or die trying. $ET",
      ],
      error: true,
    });
  }
}
