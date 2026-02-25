import Anthropic from "@anthropic-ai/sdk";
import { ContentPillar } from "@/types";
import {
  SYSTEM_PROMPT,
  REPLY_SYSTEM_PROMPT,
  PILLAR_CONFIGS,
  buildTweetPrompt,
  buildImageDescriptionPrompt,
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
  trendingContext?: string[]
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
        content: buildTweetPrompt(pillar, recentTweets, trendingContext),
      },
    ],
    temperature: 0.9,
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Clean up: remove quotes if Claude wrapped the tweet in them
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
 * Generate an image description for a lore tweet (fed to DALL-E).
 */
export async function generateImageDescription(
  tweetText: string
): Promise<string> {
  const response = await getClient().messages.create({
    model: MODELS.sonnet,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: buildImageDescriptionPrompt(tweetText),
      },
    ],
    temperature: 0.8,
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  return text.trim();
}
