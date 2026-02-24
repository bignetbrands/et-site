import Anthropic from "@anthropic-ai/sdk";
import { ContentPillar } from "@/types";
import {
  SYSTEM_PROMPT,
  PILLAR_CONFIGS,
  buildTweetPrompt,
  buildImageDescriptionPrompt,
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
  recentTweets: string[]
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
        content: buildTweetPrompt(pillar, recentTweets),
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
