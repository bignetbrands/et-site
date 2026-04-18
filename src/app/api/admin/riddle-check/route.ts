import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getRiddleContext } from "@/lib/store";
import { getTweet, postReply } from "@/lib/twitter";

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

  // If wrong — ET auto-trolls the reply instantly
  let trollReplyId = "";
  if (!verdict.correct) {
    try {
      const trollRes = await client.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 100,
        system: `You are ET (@etfoundyou), an alien stranded on Earth. You just posted a riddle and someone got it wrong. Troll them in one short sentence. Be playful, not cruel. ET voice — lowercase, dry humor, alien perspective. No emojis unless it serves the joke. Under 200 characters.`,
        messages: [{
          role: "user",
          content: `Your riddle: "${riddle.question}"

Their wrong answer: "${replyText}"

Write one short troll reply. One sentence only.`,
        }],
        temperature: 0.95,
      });
      const trollText = trollRes.content[0].type === "text"
        ? trollRes.content[0].text.trim().replace(/^["']|["']$/g, "").trim()
        : "that's not it 👽";
      trollReplyId = await postReply(trollText, replyTweetId);
      console.log(`[Riddle] Trolled @${replyAuthor} with: "${trollText}"`);
    } catch (e) {
      console.warn("[Riddle] Troll reply failed:", e);
    }
  }

  return NextResponse.json({
    success: true,
    replyText,
    replyAuthor,
    replyTweetId,
    verdict,
    trollReplyId: trollReplyId || null,
  });
}
