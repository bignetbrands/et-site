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
  topPerformers?: string[]
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
        content: buildTweetPrompt(pillar, recentTweets, trendingContext, topPerformers),
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
 * Generate a reply to a mention.
 * If imageUrls are provided, uses Claude's vision to "see" the images.
 */
export async function generateReply(
  mentionText: string,
  authorUsername: string,
  conversationContext?: string,
  imageUrls?: string[]
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
    text: buildReplyPrompt(mentionText, authorUsername, conversationContext, imageUrls && imageUrls.length > 0),
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
