import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import { postTweet } from "@/lib/twitter";
import { recordTweet } from "@/lib/store";

function auth(req: NextRequest) {
  return req.headers.get("authorization") === `Bearer ${process.env.ADMIN_SECRET}`;
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { prompt, post = false } = await req.json();
  if (!prompt?.trim()) return NextResponse.json({ error: "Missing prompt" }, { status: 400 });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const res = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: `The admin is giving you a direct instruction for a tweet to write. Follow their intent while staying 100% in ET character.\n\nAdmin instruction: "${prompt}"\n\nWrite ONLY the tweet text. Under 280 characters. No quotes, no labels, no preamble. Just the tweet.`,
    }],
    temperature: 0.95,
  });

  const tweetText = res.content[0].type === "text"
    ? res.content[0].text.trim().replace(/^["']|["']$/g, "").trim()
    : "";

  if (!tweetText) return NextResponse.json({ error: "Failed to generate tweet" }, { status: 500 });

  if (!post) {
    return NextResponse.json({ success: true, tweet: tweetText });
  }

  const tweetId = await postTweet(tweetText);
  await recordTweet({
    id: tweetId,
    text: tweetText,
    pillar: "human_observation",
    postedAt: new Date().toISOString(),
    hasImage: false,
  });

  return NextResponse.json({ success: true, tweet: tweetText, tweetId });
}
