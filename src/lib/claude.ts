import Anthropic from "@anthropic-ai/sdk";
import { ContentPillar } from "@/types";
import {
  SYSTEM_PROMPT,
  REPLY_SYSTEM_PROMPT,
  PILLAR_CONFIGS,
  buildTweetPrompt,
  buildImageDescriptionPrompt,
  buildImageDecisionPrompt,
  buildReplyPrompt,
} from "./prompts";

let _anthropic: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _anthropic;
}

const MODELS = {
  sonnet: "claude-sonnet-4-5-20250929",
  opus: "claude-opus-4-6",
} as const;

/**
 * Generate a tweet for a given content pillar.
 */
export async function generateTweet(
  pillar: ContentPillar,
  recentTweets: string[],
  trendingContext?: string[],
  topPerformers?: string[],
  memorySummary?: {
    topicFrequency: Record<string, number>;
    usedStructures: string[];
    usedOpenings: string[];
  }
): Promise<string> {
  const config = PILLAR_CONFIGS[pillar];
  const model = MODELS[config.model];

  const response = await getClient().messages.create({
    model,
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildTweetPrompt(pillar, recentTweets, trendingContext, topPerformers, memorySummary),
      },
    ],
    temperature: 0.9,
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  return text
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

/**
 * Check if a generated tweet is too similar to recent tweets.
 * Returns the similar tweet text if found, null if unique enough.
 */
export async function checkSimilarity(
  newTweet: string,
  recentTweets: string[]
): Promise<string | null> {
  if (recentTweets.length === 0) return null;

  const recent10 = recentTweets.slice(0, 10);

  try {
    const response = await getClient().messages.create({
      model: MODELS.sonnet,
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `You are a deduplication checker. Compare this NEW tweet against the EXISTING tweets below.

NEW TWEET: "${newTweet}"

EXISTING TWEETS:
${recent10.map((t, i) => `${i + 1}. "${t}"`).join("\n")}

Is the new tweet too similar to ANY existing tweet? Similar means: same core topic/subject, same joke structure, same punchline format, or same observation just reworded.

If TOO SIMILAR, respond: SIMILAR: [paste the existing tweet number and first 50 chars]
If UNIQUE ENOUGH, respond: UNIQUE

Be strict. If the topic overlaps even partially, it's similar.`,
        },
      ],
      temperature: 0.1,
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    if (text.trim().startsWith("SIMILAR")) {
      // Extract which tweet it's similar to
      const matchNum = text.match(/(\d+)/);
      if (matchNum) {
        const idx = parseInt(matchNum[1]) - 1;
        if (idx >= 0 && idx < recent10.length) {
          return recent10[idx];
        }
      }
      return recent10[0]; // fallback
    }

    return null; // unique
  } catch {
    return null; // if check fails, allow the tweet
  }
}

/**
 * Generate a reply to a mention.
 * If imageUrls are provided, uses Claude's vision to "see" the images.
 */
export async function generateReply(
  mentionText: string,
  authorUsername: string,
  conversationContext?: string,
  imageUrls?: string[],
  lateContext?: { delayMinutes: number; delayLabel: string; excuse: string }
): Promise<string> {
  // Build message content — text + optional images
  const content: Array<{ type: string; source?: Record<string, string>; text?: string }> = [];

  // Add images first if present (Claude vision expects images before text)
  if (imageUrls && imageUrls.length > 0) {
    for (const url of imageUrls.slice(0, 4)) { // Max 4 images
      content.push({
        type: "image",
        source: {
          type: "url",
          url,
        },
      });
    }
  }

  // Add the text prompt
  content.push({
    type: "text",
    text: buildReplyPrompt(mentionText, authorUsername, conversationContext, imageUrls && imageUrls.length > 0, lateContext),
  });

  const response = await getClient().messages.create({
    model: MODELS.sonnet,
    max_tokens: 300,
    system: REPLY_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: content as any,
      },
    ],
    temperature: 0.9,
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Clean up: remove quotes, @mentions at start
  let cleaned = text
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();

  // Remove leading @mentions that Claude might add despite instructions
  cleaned = cleaned.replace(/^(@\w+\s*)+/, "").trim();

  return cleaned;
}

/**
 * Generate a scene description for a "what was ET doing" late reply image.
 */
export async function generateLateReplyScene(delayLabel: string): Promise<string> {
  const { buildLateReplyImagePrompt } = await import("./prompts");

  const response = await getClient().messages.create({
    model: MODELS.sonnet,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: buildLateReplyImagePrompt(delayLabel),
      },
    ],
    temperature: 1.0,
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return text.trim();
}

/**
 * Generate ONE late excuse for a batch of replies.
 * This is called once and shared across all late replies in the same run.
 * Returns a short, casual phrase (NOT a full sentence, no "sorry").
 */
export async function generateLateExcuse(): Promise<string> {
  const response = await getClient().messages.create({
    model: MODELS.sonnet,
    max_tokens: 50,
    messages: [
      {
        role: "user",
        content: `You are ET, an alien stranded on Earth. You were away from Twitter for a while and need a short excuse for being late.

Generate ONE short excuse — just the activity, 3-8 words max. Casual, tossed-off, not a joke with a punchline. Just what you were doing.

RULES:
- NO "sorry" — ET doesn't apologize
- NO punchlines or wordplay — just state what you were doing
- Should feel natural, like a friend saying "yo my bad, was [doing thing]"
- Alien perspective welcome but not forced

GOOD examples (match this energy):
- "was out touching grass"
- "got lost in a wikipedia hole"  
- "was staring at the moon again"
- "phone died"
- "was recalibrating the signal dish"
- "fell asleep watching documentaries"
- "was trying to cook pasta"
- "got distracted by a cloud"
- "was building something"
- "had my head in the stars"

BAD examples (too try-hard):
- "was teaching myself to whistle (still can't)" ← punchline
- "was arguing with a raccoon about territory" ← too quirky/random
- "was trying to figure out how doorknobs work" ← forced alien humor

Output ONLY the excuse phrase. Nothing else.`,
      },
    ],
    temperature: 1.0,
  });

  let text = response.content[0].type === "text" ? response.content[0].text : "was offline";
  // Clean up
  text = text.trim().replace(/^["']|["']$/g, "").trim();
  // Ensure it doesn't start with sorry
  text = text.replace(/^sorry[,.]?\s*/i, "").trim();
  return text;
}

/**
 * Generate an image description for an image-enabled tweet (fed to DALL-E).
 * Pillar determines the visual style prompt.
 */
export async function generateImageDescription(
  tweetText: string,
  pillar?: ContentPillar
): Promise<string> {
  const response = await getClient().messages.create({
    model: MODELS.sonnet,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: buildImageDescriptionPrompt(tweetText, pillar),
      },
    ],
    temperature: 0.8,
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  return text.trim();
}

/**
 * Decide whether a tweet would benefit from a generated image.
 */
export async function decideIfImageWorthy(
  tweetText: string,
  pillar: ContentPillar
): Promise<boolean> {
  try {
    const response = await getClient().messages.create({
      model: MODELS.sonnet,
      max_tokens: 10,
      messages: [
        {
          role: "user",
          content: buildImageDecisionPrompt(tweetText, pillar),
        },
      ],
      temperature: 0.3,
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    return text.trim().toLowerCase().startsWith("yes");
  } catch {
    return true;
  }
}

/**
 * Generate a reaction to a trending news tweet.
 * Returns the tweet ID to quote and the reaction text.
 */
export async function generateNewsReaction(
  newsItems: Array<{ text: string; id: string; author: string; likes: number }>
): Promise<{ tweetId: string; reactionText: string } | null> {
  const { buildNewsReactionPrompt } = await import("./prompts");

  const response = await getClient().messages.create({
    model: MODELS.sonnet,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildNewsReactionPrompt(newsItems),
      },
    ],
    temperature: 0.85,
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const tweetIdMatch = text.match(/TWEET_ID:\s*(\d+)/);
  const reactionMatch = text.match(/REACTION:\s*([\s\S]+)/);

  if (!tweetIdMatch || !reactionMatch) return null;

  let reactionText = reactionMatch[1].trim().replace(/^["']|["']$/g, "").trim();
  if (reactionText.length > 280) reactionText = reactionText.substring(0, 277) + "...";

  return {
    tweetId: tweetIdMatch[1],
    reactionText,
  };
}

/**
 * Generate a targeted interaction — pick a tweet and craft a reply.
 */
export async function generateTargetInteraction(
  targetUsername: string,
  tweets: Array<{ id: string; text: string; likes: number }>
): Promise<{ tweetId: string; replyText: string } | null> {
  const { buildTargetInteractionPrompt } = await import("./prompts");

  const response = await getClient().messages.create({
    model: MODELS.sonnet,
    max_tokens: 400,
    system: REPLY_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildTargetInteractionPrompt(targetUsername, tweets),
      },
    ],
    temperature: 0.9,
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Parse TWEET_ID and REPLY from response
  const idMatch = text.match(/TWEET_ID:\s*(\d+)/);
  const replyMatch = text.match(/REPLY:\s*([\s\S]+)/);

  if (!idMatch || !replyMatch) {
    console.warn("[ET Target] Failed to parse response:", text.substring(0, 200));
    return null;
  }

  let replyText = replyMatch[1]
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^(@\w+\s*)+/, "")
    .trim();

  // Truncate if over 280
  if (replyText.length > 280) {
    replyText = replyText.substring(0, 277) + "...";
  }

  return {
    tweetId: idMatch[1],
    replyText,
  };
}
