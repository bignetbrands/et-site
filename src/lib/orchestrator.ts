import { ContentPillar, TweetRecord, GeneratedTweet } from "@/types";
import { PILLAR_CONFIGS } from "./prompts";
import { generateTweet, generateImageDescription } from "./claude";
import { generateLoreImage, downloadImage } from "./dalle";
import { postTweet, postTweetWithImage } from "./twitter";
import { recordTweet, getRecentTweets } from "./store";

/**
 * Full pipeline: generate tweet → (optionally) generate image → post to X → record.
 *
 * Returns the posted tweet record, or null if something failed.
 */
export async function executeTweet(
  pillar: ContentPillar
): Promise<TweetRecord | null> {
  const config = PILLAR_CONFIGS[pillar];

  console.log(`[ET] Generating ${config.name} tweet...`);

  try {
    // 1. Get recent tweets for variety context
    const recentTweets = await getRecentTweets();

    // 2. Generate tweet text via Claude
    const tweetText = await generateTweet(pillar, recentTweets);

    if (!tweetText || tweetText.length > 280) {
      console.error(
        `[ET] Invalid tweet generated: ${tweetText?.length || 0} chars`
      );
      // Retry once with a nudge
      const retry = await generateTweet(pillar, [
        ...recentTweets,
        "(IMPORTANT: keep under 280 characters)",
      ]);
      if (!retry || retry.length > 280) {
        console.error("[ET] Retry also failed. Skipping.");
        return null;
      }
      return await postAndRecord(retry, pillar, config.generateImage);
    }

    return await postAndRecord(tweetText, pillar, config.generateImage);
  } catch (error) {
    console.error(`[ET] Error in executeTweet:`, error);
    return null;
  }
}

/**
 * Post the tweet (with optional image) and record it.
 */
async function postAndRecord(
  tweetText: string,
  pillar: ContentPillar,
  shouldGenerateImage: boolean
): Promise<TweetRecord> {
  let tweetId: string;
  let hasImage = false;

  // 3. If lore tweet, generate image
  if (shouldGenerateImage && pillar === "personal_lore") {
    try {
      console.log("[ET] Generating lore image...");

      // Generate scene description via Claude
      const sceneDescription = await generateImageDescription(tweetText);
      console.log(`[ET] Scene: ${sceneDescription}`);

      // Generate image via DALL-E
      const imageUrl = await generateLoreImage(sceneDescription);

      // Download image
      const imageBuffer = await downloadImage(imageUrl);

      // Post tweet with image
      tweetId = await postTweetWithImage(tweetText, imageBuffer);
      hasImage = true;

      console.log(`[ET] Posted lore tweet with image: ${tweetId}`);
    } catch (imageError) {
      console.error("[ET] Image generation failed, posting text-only:", imageError);
      // Fall back to text-only
      tweetId = await postTweet(tweetText);
      console.log(`[ET] Posted text-only fallback: ${tweetId}`);
    }
  } else {
    // 4. Post text-only tweet
    tweetId = await postTweet(tweetText);
    console.log(`[ET] Posted tweet: ${tweetId}`);
  }

  // 5. Record the tweet
  const record: TweetRecord = {
    id: tweetId,
    text: tweetText,
    pillar,
    postedAt: new Date().toISOString(),
    hasImage,
  };

  await recordTweet(record);

  return record;
}

/**
 * Dry run — generates a tweet without posting.
 * Useful for testing and calibrating the voice.
 */
export async function dryRun(
  pillar: ContentPillar
): Promise<GeneratedTweet> {
  const recentTweets = await getRecentTweets();
  const tweetText = await generateTweet(pillar, recentTweets);

  const result: GeneratedTweet = {
    text: tweetText,
    pillar,
  };

  // Generate image preview for lore
  if (pillar === "personal_lore") {
    try {
      const sceneDescription = await generateImageDescription(tweetText);
      const imageUrl = await generateLoreImage(sceneDescription);
      result.imageUrl = imageUrl;
    } catch (error) {
      console.error("[ET] Image preview failed:", error);
    }
  }

  return result;
}
