import { ContentPillar, TweetRecord, GeneratedTweet } from "@/types";
import { PILLAR_CONFIGS } from "./prompts";
import { generateTweet, generateImageDescription, generateReply } from "./claude";
import { generateLoreImage, downloadImage } from "./dalle";
import { postTweet, postTweetWithImage, postReply, getMentions, getTweet, type Mention } from "./twitter";
import {
  recordTweet,
  getRecentTweets,
  getLastMentionId,
  setLastMentionId,
  hasReplied,
  recordReply,
  getDailyReplyCount,
  incrementDailyReplyCount,
} from "./store";

// Max replies per cron run & per day
const MAX_REPLIES_PER_RUN = 5;
const MAX_REPLIES_PER_DAY = 50;

export interface ReplyResult {
  mentionId: string;
  mentionText: string;
  authorUsername: string;
  replyText: string;
  replyId: string;
  skipped?: boolean;
  skipReason?: string;
}

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
 * Process mentions and reply to them in character.
 */
export async function processReplies(): Promise<ReplyResult[]> {
  const results: ReplyResult[] = [];

  try {
    // Check daily limit
    const dailyCount = await getDailyReplyCount();
    if (dailyCount >= MAX_REPLIES_PER_DAY) {
      console.log(`[ET Replies] Daily limit reached (${dailyCount}/${MAX_REPLIES_PER_DAY})`);
      return results;
    }

    // Fetch mentions since last processed
    const lastId = await getLastMentionId();
    console.log(`[ET Replies] Fetching mentions since: ${lastId || "beginning"}`);

    const { mentions, newestId } = await getMentions(lastId || undefined, 20);

    if (mentions.length === 0) {
      console.log("[ET Replies] No new mentions");
      return results;
    }

    console.log(`[ET Replies] Found ${mentions.length} new mentions`);

    // Process mentions (newest first, but reply to oldest first for natural ordering)
    const toProcess = mentions.reverse().slice(0, MAX_REPLIES_PER_RUN);
    const remainingBudget = MAX_REPLIES_PER_DAY - dailyCount;

    for (const mention of toProcess) {
      if (results.length >= remainingBudget) {
        console.log("[ET Replies] Daily budget exhausted during run");
        break;
      }

      try {
        const result = await processOneMention(mention);
        results.push(result);

        if (!result.skipped) {
          await incrementDailyReplyCount();
          // Small delay between replies to avoid rate limits
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (error) {
        console.error(`[ET Replies] Error processing mention ${mention.id}:`, error);
        results.push({
          mentionId: mention.id,
          mentionText: mention.text,
          authorUsername: mention.authorUsername || "unknown",
          replyText: "",
          replyId: "",
          skipped: true,
          skipReason: `Error: ${error instanceof Error ? error.message : "unknown"}`,
        });
      }
    }

    // Update last processed ID
    if (newestId) {
      await setLastMentionId(newestId);
    }
  } catch (error) {
    console.error("[ET Replies] Error in processReplies:", error);
  }

  return results;
}

/**
 * Process a single mention and generate/post a reply.
 */
async function processOneMention(mention: Mention): Promise<ReplyResult> {
  const authorUsername = mention.authorUsername || "someone";

  // Skip if already replied
  if (await hasReplied(mention.id)) {
    return {
      mentionId: mention.id,
      mentionText: mention.text,
      authorUsername,
      replyText: "",
      replyId: "",
      skipped: true,
      skipReason: "Already replied",
    };
  }

  // Skip very short/empty mentions (just tagging with no substance)
  const textWithoutMentions = mention.text.replace(/@\w+/g, "").trim();
  if (textWithoutMentions.length < 3) {
    await recordReply(mention.id); // Mark as processed so we don't retry
    return {
      mentionId: mention.id,
      mentionText: mention.text,
      authorUsername,
      replyText: "",
      replyId: "",
      skipped: true,
      skipReason: "Empty mention (just a tag)",
    };
  }

  // Get conversation context if this is a reply to one of our tweets
  let conversationContext: string | undefined;
  if (mention.inReplyToId) {
    const parentTweet = await getTweet(mention.inReplyToId);
    if (parentTweet) {
      conversationContext = parentTweet.text;
    }
  }

  console.log(`[ET Replies] Generating reply to @${authorUsername}: "${mention.text.substring(0, 60)}..."`);

  // Generate the reply
  const replyText = await generateReply(
    mention.text,
    authorUsername,
    conversationContext
  );

  if (!replyText || replyText.length > 280) {
    await recordReply(mention.id);
    return {
      mentionId: mention.id,
      mentionText: mention.text,
      authorUsername,
      replyText: replyText || "",
      replyId: "",
      skipped: true,
      skipReason: `Invalid reply: ${replyText?.length || 0} chars`,
    };
  }

  // Post the reply
  const replyId = await postReply(replyText, mention.id);
  await recordReply(mention.id);

  console.log(`[ET Replies] Posted reply ${replyId} to @${authorUsername}`);

  return {
    mentionId: mention.id,
    mentionText: mention.text,
    authorUsername,
    replyText,
    replyId,
  };
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
