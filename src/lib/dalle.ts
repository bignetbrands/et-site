import OpenAI from "openai";
import { LORE_IMAGE_PROMPT_PREFIX, OBSERVATION_IMAGE_PROMPT_PREFIX, EXISTENTIAL_IMAGE_PROMPT_PREFIX } from "./prompts";
import { ContentPillar } from "@/types";

let _openai: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return _openai;
}

/**
 * Generate an image using DALL-E 3 for the given pillar.
 * - personal_lore: Found footage / classified leak — ET barely visible, grainy, surveillance aesthetic
 * - human_observation: Prehistoric cave painting of modern behavior
 * - existential: Abstract Picasso/Dalí surrealism with futuristic warp
 * Returns the image URL (temporary — must be downloaded before posting).
 */
export async function generateImage(
  sceneDescription: string,
  pillar: ContentPillar = "personal_lore"
): Promise<string> {
  let prefix: string;
  if (pillar === "human_observation") {
    prefix = OBSERVATION_IMAGE_PROMPT_PREFIX;
  } else if (pillar === "existential") {
    prefix = EXISTENTIAL_IMAGE_PROMPT_PREFIX;
  } else {
    prefix = LORE_IMAGE_PROMPT_PREFIX;
  }

  const fullPrompt = `${prefix} ${sceneDescription}`;

  const response = await getClient().images.generate({
    model: "dall-e-3",
    prompt: fullPrompt,
    n: 1,
    size: "1024x1024",
    quality: "hd",
    style: "natural", // Organic look for all styles
  });

  const imageUrl = response.data?.[0]?.url;
  if (!imageUrl) {
    throw new Error("DALL-E returned no image URL");
  }

  return imageUrl;
}

// Keep backward-compatible alias
export const generateLoreImage = generateImage;

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
