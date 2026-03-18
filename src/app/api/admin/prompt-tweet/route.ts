import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "@/lib/prompts";
import { postTweet, postTweetWithImage } from "@/lib/twitter";
import { recordTweet, setRiddleContext } from "@/lib/store";
import { getRandomETMeme } from "@/lib/meme-engine";

function auth(req: NextRequest) {
  return req.headers.get("authorization") === `Bearer ${process.env.ADMIN_SECRET}`;
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { prompt, post = false, riddleAnswer = "" } = await req.json();
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

  // Strip [ATTACH_MEME] from display text
  const hasMeme = tweetText.includes("[ATTACH_MEME]");
  const cleanText = tweetText.replace("[ATTACH_MEME]", "").trim();

  if (!post) {
    return NextResponse.json({ success: true, tweet: cleanText + (hasMeme ? "\n[ATTACH_MEME]" : "") });
  }

  // Post it
  let tweetId: string;
  let hasImage = false;

  if (hasMeme) {
    const memeBuffer = await getRandomETMeme();
    if (memeBuffer) {
      tweetId = await postTweetWithImage(cleanText, memeBuffer);
      hasImage = true;
      console.log(`[Prompt ET] Posted with meme image: ${tweetId}`);
    } else {
      tweetId = await postTweet(cleanText);
      console.warn("[Prompt ET] Meme fetch failed, posted text-only");
    }
  } else {
    tweetId = await postTweet(cleanText);
  }

  await recordTweet({
    id: tweetId,
    text: cleanText,
    pillar: "human_observation",
    postedAt: new Date().toISOString(),
    hasImage,
  });

  // If admin provided an answer, store the riddle context
  if (riddleAnswer.trim()) {
    await setRiddleContext(tweetId, {
      tweetId,
      question: tweetText,
      answer: riddleAnswer.trim(),
      postedAt: new Date().toISOString(),
      solved: false,
    });
    console.log(`[Prompt ET] Riddle posted ${tweetId} — answer stored`);
  }

  return NextResponse.json({ success: true, tweet: tweetText, tweetId, hasRiddle: !!riddleAnswer.trim() });
}
