import { ContentPillar, TweetRecord, GeneratedTweet } from "@/types";
import { PILLAR_CONFIGS } from "./prompts";
import { generateTweet, generateImageDescription, generateReply } from "./claude";
import { generateLoreImage, downloadImage } from "./dalle";
import { postTweet, postTweetWithImage, postReply, getMentions, getTweet, getTrendingContext, type Mention } from "./twitter";
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
 * If useTrending is true, fetches current trending topics and injects as context.
 */
export async function executeTweet(
  pillar: ContentPillar,
  useTrending: boolean = false
): Promise<TweetRecord | null> {
  const config = PILLAR_CONFIGS[pillar];

  console.log(`[ET] Generating ${config.name} tweet...${useTrending ? " (with trending context)" : ""}`);

  try {
    // 1. Get recent tweets for variety context
    const recentTweets = await getRecentTweets();

    // 2. Optionally fetch trending topics
    let trendingContext: string[] | undefined;
    if (useTrending) {
      try {
        trendingContext = await getTrendingContext();
        console.log(`[ET] Fetched ${trendingContext.length} trending items`);
      } catch (e) {
        console.warn("[ET] Trending fetch failed, proceeding without:", e);
      }
    }

    // 3. Generate tweet text via Claude
    const tweetText = await generateTweet(pillar, recentTweets, trendingContext);

    if (!tweetText || tweetText.length > 280) {
      console.error(
        `[ET] Invalid tweet generated: ${tweetText?.length || 0} chars`
      );
      const retry = await generateTweet(pillar, [
        ...recentTweets,
        "(IMPORTANT: keep under 280 characters)",
      ], trendingContext);
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

  console.log(`[ET Replies] Generating reply to @${authorUsername}: "${mention.text.substring(0, 60)}..."${mention.imageUrls ? ` (${mention.imageUrls.length} image(s))` : ""}`);

  // Generate the reply
  const replyText = await generateReply(
    mention.text,
    authorUsername,
    conversationContext,
    mention.imageUrls
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
 * Interact with a target account — fetch their tweets, pick one, reply.
 */
export async function interactWithTarget(
  handle: string
): Promise<{ success: boolean; tweetId?: string; replyText?: string; replyId?: string; error?: string }> {
  const { getUserRecentTweets } = await import("./twitter");
  const { generateTargetInteraction } = await import("./claude");
  const { resolveTarget } = await import("./store");

  console.log(`[ET Target] Interacting with @${handle}...`);

  try {
    // 1. Fetch their recent tweets
    const tweets = await getUserRecentTweets(handle, 10);
    if (tweets.length === 0) {
      return { success: false, error: `No recent tweets found for @${handle}` };
    }

    console.log(`[ET Target] Found ${tweets.length} tweets from @${handle}`);

    // 2. Generate reply via Claude
    const interaction = await generateTargetInteraction(handle, tweets);
    if (!interaction) {
      return { success: false, error: "Failed to generate interaction" };
    }

    console.log(`[ET Target] Replying to tweet ${interaction.tweetId}: "${interaction.replyText.substring(0, 60)}..."`);

    // 3. Try posting as reply first
    try {
      const replyId = await postReply(interaction.replyText, interaction.tweetId);
      await resolveTarget(handle);
      console.log(`[ET Target] Posted reply ${replyId} to @${handle}`);
      return { success: true, tweetId: interaction.tweetId, replyText: interaction.replyText, replyId };
    } catch (replyError: any) {
      const code = replyError?.code || replyError?.data?.status || replyError?.status;
      console.warn(`[ET Target] Reply failed (${code}), falling back to standalone mention...`);

      // 4. Fallback: post as a standalone tweet mentioning them
      const mentionText = `@${handle} ${interaction.replyText}`;
      const truncated = mentionText.length > 280 ? mentionText.substring(0, 277) + "..." : mentionText;

      try {
        const tweetId = await postTweet(truncated);
        await resolveTarget(handle);
        console.log(`[ET Target] Posted mention tweet ${tweetId} to @${handle}`);
        return { success: true, tweetId: interaction.tweetId, replyText: truncated, replyId: tweetId };
      } catch (mentionError) {
        console.error(`[ET Target] Mention fallback also failed:`, mentionError);
        throw mentionError;
      }
    }
  } catch (error) {
    console.error(`[ET Target] Error interacting with @${handle}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Dry run — generates a tweet without posting.
 * Useful for testing and calibrating the voice.
 */
export async function dryRun(
  pillar: ContentPillar,
  useTrending: boolean = false
): Promise<GeneratedTweet> {
  const recentTweets = await getRecentTweets();

  let trendingContext: string[] | undefined;
  if (useTrending) {
    try {
      trendingContext = await getTrendingContext();
    } catch { /* proceed without */ }
  }

  const tweetText = await generateTweet(pillar, recentTweets, trendingContext);

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
