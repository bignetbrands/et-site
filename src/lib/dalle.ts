import OpenAI from "openai";
import { LORE_IMAGE_PROMPT_PREFIX } from "./prompts";

let _openai: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return _openai;
}

/**
 * Generate a lore image using DALL-E 3.
 * Returns the image URL (temporary — must be downloaded before posting).
 */
export async function generateLoreImage(
  sceneDescription: string
): Promise<string> {
  const fullPrompt = `${LORE_IMAGE_PROMPT_PREFIX} ${sceneDescription}`;

  const response = await getClient().images.generate({
    model: "dall-e-3",
    prompt: fullPrompt,
    n: 1,
    size: "1792x1024", // Landscape for Twitter cards
    quality: "hd",
    style: "natural", // Less "AI-looking" than vivid
  });

  const imageUrl = response.data?.[0]?.url;
  if (!imageUrl) {
    throw new Error("DALL-E returned no image URL");
  }

  return imageUrl;
}

/**
 * Download an image from URL and return as Buffer.
 * Needed because DALL-E URLs are temporary and Twitter needs the raw bytes.
 */
export async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
