import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getRiddleContext } from "@/lib/store";
import { getTweet } from "@/lib/twitter";

function auth(req: NextRequest) {
  return req.headers.get("authorization") === `Bearer ${process.env.ADMIN_SECRET}`;
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tweetId: riddleTweetId, replyUrl } = await req.json();
  if (!riddleTweetId || !replyUrl) {
    return NextResponse.json({ error: "Missing riddleTweetId or replyUrl" }, { status: 400 });
  }

  // Extract reply tweet ID from URL
  const replyIdMatch = replyUrl.match(/status\/(\d+)/);
  if (!replyIdMatch) return NextResponse.json({ error: "Invalid reply URL" }, { status: 400 });
  const replyTweetId = replyIdMatch[1];

  // Fetch riddle context
  const riddle = await getRiddleContext(riddleTweetId);
  if (!riddle) return NextResponse.json({ error: "Riddle not found" }, { status: 404 });

  // Fetch the reply tweet
  const tweet = await getTweet(replyTweetId);
  if (!tweet) return NextResponse.json({ error: "Could not fetch reply tweet" }, { status: 404 });

  const replyText = tweet.text;
  const replyAuthor = tweet.authorUsername || "unknown";

  // Ask Claude to judge
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const res = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 200,
    messages: [{
      role: "user",
      content: `You are judging a riddle competition.

RIDDLE: "${riddle.question}"

CORRECT ANSWER: "${riddle.answer}"

HUMAN'S REPLY: "${replyText}"

Does this reply contain or imply the correct answer? Be generous — allow for paraphrasing, partial phrasing, or the core meaning being present even if not word-for-word exact.

Reply with ONLY a JSON object in this format:
{"correct": true/false, "confidence": "high/medium/low", "reasoning": "one sentence explaining why"}`,
    }],
    temperature: 0.1,
  });

  let verdict = { correct: false, confidence: "low" as const, reasoning: "Could not parse verdict" };
  try {
    const raw = res.content[0].type === "text" ? res.content[0].text.trim() : "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    verdict = JSON.parse(cleaned);
  } catch { /* use default */ }

  return NextResponse.json({
    success: true,
    replyText,
    replyAuthor,
    replyTweetId,
    verdict,
  });
}
