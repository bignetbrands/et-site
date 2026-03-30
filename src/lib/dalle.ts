import OpenAI from "openai";
import { LORE_IMAGE_PROMPT_PREFIX, getRandomObservationStyle, buildObservationPrompt, OBSERVATION_NEGATIVE_CONSTRAINTS, EXISTENTIAL_IMAGE_PROMPT_PREFIX, GM_IMAGE_PROMPT_PREFIX, GN_IMAGE_PROMPT_PREFIX, ET_ARCHIVE_IMAGE_PROMPT_PREFIX, buildArchivePrompt } from "./prompts";
import { ContentPillar } from "@/types";
import { applyFilmGrain } from "./film-process";

let _openai: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return _openai;
}

/**
 * Generate an image using DALL-E 3 for the given pillar.
 * - personal_lore: 1970s Kodak Super 8 documentary realism — ET silhouetted, muted earth tones, practical lighting
 *   → Post-processed with real film grain, vignette, scan lines, color degradation
 * - human_observation: Randomly selected ancient art style (Saharan, Petroglyph, South American, Lascaux, Aboriginal)
 * - existential: Abstract Picasso/Dalí surrealism with futuristic warp
 * Returns the image URL (temporary — must be downloaded before posting).
 */
export async function generateImage(
  sceneDescription: string,
  pillar: ContentPillar = "personal_lore"
): Promise<string> {
  let prefix: string;
  let styleName = "";
  if (pillar === "human_observation") {
    // Human Observation uses the master archival photography prompt
    // sceneDescription is wrapped with master prompt + checksums in buildObservationPrompt()
    // We set prefix to empty — the full prompt is built below
    prefix = "";
    styleName = "Archival Historical Photography";
    console.log(`[DALL-E] Observation: Archival Historical Photography master prompt`);
  } else if (pillar === "existential") {
    prefix = EXISTENTIAL_IMAGE_PROMPT_PREFIX;
  } else if (pillar === "gm") {
    prefix = GM_IMAGE_PROMPT_PREFIX;
  } else if (pillar === "gn") {
    prefix = GN_IMAGE_PROMPT_PREFIX;
  } else if (pillar === "et_archive") {
    prefix = "";
    styleName = "Baroque Archive Oil Painting";
    console.log(`[DALL-E] Archive: Baroque oil painting master prompt`);
  } else {
    prefix = LORE_IMAGE_PROMPT_PREFIX;
  }

  const fullPrompt = pillar === "human_observation"
    ? buildObservationPrompt(sceneDescription)
    : pillar === "et_archive"
    ? buildArchivePrompt(sceneDescription)
    : `${prefix} ${sceneDescription}`;

  const finalPrompt = pillar === "human_observation"
    ? `${fullPrompt} Negative: ${OBSERVATION_NEGATIVE_CONSTRAINTS}`
    : fullPrompt;

  const response = await getClient().images.generate({
    model: "dall-e-3",
    prompt: finalPrompt,
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
 * For personal_lore images, applies film grain post-processing.
 * Needed because DALL-E URLs are temporary and Twitter needs the raw bytes.
 */
export async function downloadImage(url: string, pillar?: ContentPillar): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  let buffer: Buffer = Buffer.from(arrayBuffer) as Buffer;

  // Apply film grain post-processing to personal_lore images
  if (pillar === "personal_lore") {
    try {
      console.log(`[Film Process] Applying analog artifacts to lore image (${Math.round(buffer.length / 1024)}KB input)`);
      buffer = await applyFilmGrain(buffer);
      console.log(`[Film Process] Done (${Math.round(buffer.length / 1024)}KB output)`);
    } catch (err) {
      console.warn(`[Film Process] Failed, using original:`, err);
    }
  }

  return buffer;
}
