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
 * Generate an image for the given pillar.
 * - personal_lore: gpt-image-1 (medium) — follows prompts faithfully for candid snapshot style
 * - human_observation: DALL-E 3 — archival historical photography
 * - existential: DALL-E 3 — Rembrandt oil painting
 * - gm/gn: DALL-E 3 — folk art
 * Returns the image URL (temporary — must be downloaded before posting).
 * For gpt-image-1, returns a data URL (base64).
 */
export async function generateImage(
  sceneDescription: string,
  pillar: ContentPillar = "personal_lore"
): Promise<string> {

  // ── PERSONAL LORE: gpt-image-1 (medium quality) ──────────────
  if (pillar === "personal_lore") {
    const fullPrompt = `${LORE_IMAGE_PROMPT_PREFIX} ${sceneDescription}`;
    console.log(`[gpt-image-1] Generating lore image (medium quality)...`);

    const response = await getClient().images.generate({
      model: "gpt-image-1",
      prompt: fullPrompt,
      n: 1,
      size: "1024x1024",
      quality: "medium",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("gpt-image-1 returned no image data");
    }

    // Return as data URL — downloadImage will handle conversion
    return `data:image/png;base64,${b64}`;
  }

  // ── ALL OTHER PILLARS: DALL-E 3 ──────────────────────────────
  let prefix: string;
  let styleName = "";
  if (pillar === "human_observation") {
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
    style: "natural",
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
 * Handles both regular URLs (DALL-E 3) and data URLs (gpt-image-1 base64).
 * Needed because image URLs are temporary and Twitter needs the raw bytes.
 */
export async function downloadImage(url: string, pillar?: ContentPillar): Promise<Buffer> {
  let buffer: Buffer;

  // Handle base64 data URLs from gpt-image-1
  if (url.startsWith("data:")) {
    const base64Data = url.split(",")[1];
    buffer = Buffer.from(base64Data, "base64");
    console.log(`[Image] Decoded base64 image (${Math.round(buffer.length / 1024)}KB)`);
  } else {
    // Regular URL download (DALL-E 3)
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    buffer = Buffer.from(arrayBuffer) as Buffer;
  }

  // Apply film grain post-processing ONLY to non-lore pillars that need it
  // Personal lore now uses gpt-image-1 with built-in snapshot aesthetic — no post-processing needed
  if (pillar && pillar !== "personal_lore" && pillar !== "human_observation" && pillar !== "existential" && pillar !== "gm" && pillar !== "gn" && pillar !== "et_archive") {
    try {
      console.log(`[Film Process] Applying analog artifacts (${Math.round(buffer.length / 1024)}KB input)`);
      buffer = await applyFilmGrain(buffer);
      console.log(`[Film Process] Done (${Math.round(buffer.length / 1024)}KB output)`);
    } catch (err) {
      console.warn(`[Film Process] Failed, using original:`, err);
    }
  }

  return buffer;
}
