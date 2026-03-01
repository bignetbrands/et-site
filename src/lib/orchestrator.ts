import { ContentPillar, TweetRecord, GeneratedTweet } from "@/types";
import { PILLAR_CONFIGS } from "./prompts";
import { generateTweet, generateImageDescription, generateReply, generateNewsReaction, checkSimilarity } from "./claude";
import { generateImage, downloadImage } from "./dalle";
import { postTweet, postTweetWithImage, postReply, postQuoteTweet, getMentions, getTweet, getTrendingContext, searchNewsTweets, getOwnTweetMetrics, type Mention } from "./twitter";
import {
  recordTweet,
  getRecentTweets,
  getTopPerformers,
  updateTopPerformers,
  getTweetMemorySummary,
  getLastMentionId,
  setLastMentionId,
  hasReplied,
  recordReply,
  getDailyReplyCount,
  incrementDailyReplyCount,
  hasQuotedTweet,
  markTweetQuoted,
  getThreadReplyCount,
  recordThreadReply,
  hasHitUserLimit,
  recordUserInteraction,
} from "./store";

// Max replies per cron run & per day
const MAX_REPLIES_PER_RUN = 10;
const MAX_REPLIES_PER_DAY = 75;

/**
 * Strip leading @mentions from text so tweets appear in timeline, not replies.
 * Replies (postReply) are fine with @ since they're threaded.
 * But standalone tweets and quote tweets must NOT start with @.
 */
function stripLeadingMentions(text: string): string {
  // Remove all leading @username patterns
  let cleaned = text.replace(/^(\s*@\w+\s*)+/, "").trim();
  // If stripping removed everything, return original without the leading @
  if (!cleaned && text.trim()) {
    cleaned = text.trim().replace(/^@/, "");
  }
  return cleaned;
}

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
  useTrending: boolean = false,
  useRiddle: boolean = false
): Promise<TweetRecord | null> {
  const config = PILLAR_CONFIGS[pillar];

  console.log(`[ET] Generating ${config.name} tweet...${useTrending ? " (with trending context)" : ""}${useRiddle ? " (RIDDLE)" : ""}`);

  try {
    // 1. Get recent tweets + top performers + structured memory
    const recentTweets = await getRecentTweets();
    const topPerformers = await getTopPerformers();
    const memorySummary = await getTweetMemorySummary();

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
    let tweetText = await generateTweet(pillar, recentTweets, trendingContext, topPerformers, memorySummary, useRiddle);

    if (!tweetText || tweetText.length > 280) {
      console.error(
        `[ET] Invalid tweet generated: ${tweetText?.length || 0} chars`
      );
      const retry = await generateTweet(pillar, [
        ...recentTweets,
        "(IMPORTANT: keep under 280 characters)",
      ], trendingContext, topPerformers, memorySummary, useRiddle);
      if (!retry || retry.length > 280) {
        console.error("[ET] Retry also failed. Skipping.");
        return null;
      }
      tweetText = retry;
    }

    // 4. DEDUP CHECK — verify the tweet is unique enough before posting
    const similarTo = await checkSimilarity(tweetText, recentTweets);
    if (similarTo) {
      console.warn(`[ET] Similarity detected! "${tweetText.substring(0, 60)}..." is too similar to: "${similarTo.substring(0, 60)}..."`);
      console.log("[ET] Regenerating with explicit exclusion...");

      // Regenerate with the similar tweet explicitly blocked
      const dedupRetry = await generateTweet(pillar, [
        ...recentTweets,
        `(CRITICAL: Your last attempt was too similar to "${similarTo}". Write something COMPLETELY DIFFERENT in topic, structure, and phrasing.)`,
      ], trendingContext, topPerformers, memorySummary, useRiddle);

      if (dedupRetry && dedupRetry.length <= 280) {
        tweetText = dedupRetry;
        console.log(`[ET] Dedup retry succeeded: "${tweetText.substring(0, 60)}..."`);
      } else {
        console.warn("[ET] Dedup retry failed, posting original anyway");
      }
    }

    return await postAndRecord(tweetText, pillar, config.generateImage || useRiddle);
  } catch (error) {
    console.error(`[ET] Error in executeTweet:`, error);
    return null;
  }
}

/**
 * Process mentions and reply to them in character.
 * @param catchUp - If true, fetches recent mentions ignoring the sinceId cursor (for recovering missed replies)
 */
export async function processReplies(catchUp: boolean = false): Promise<ReplyResult[]> {
  const results: ReplyResult[] = [];

  try {
    // Check daily limit
    const dailyCount = await getDailyReplyCount();
    if (dailyCount >= MAX_REPLIES_PER_DAY) {
      console.log(`[ET Replies] Daily limit reached (${dailyCount}/${MAX_REPLIES_PER_DAY})`);
      return results;
    }

    // Fetch mentions — either since last processed, or recent (catch-up mode)
    let lastId: string | null = null;
    if (!catchUp) {
      lastId = await getLastMentionId();
    }
    console.log(`[ET Replies] Fetching mentions ${catchUp ? "(CATCH-UP MODE — no cursor)" : `since: ${lastId || "beginning"}`}`);

    const { mentions, newestId } = await getMentions(lastId || undefined, 20);

    if (mentions.length === 0) {
      console.log("[ET Replies] No new mentions");
      return results;
    }

    console.log(`[ET Replies] Found ${mentions.length} new mentions`);

    // Process mentions (reply to oldest first for natural ordering)
    const toProcess = mentions.reverse().slice(0, MAX_REPLIES_PER_RUN);
    const remainingBudget = MAX_REPLIES_PER_DAY - dailyCount;
    let lastProcessedId: string | null = null;

    // Thread dedup — track how many replies per conversation in this batch
    const batchThreadReplies = new Map<string, number>();
    const MAX_REPLIES_PER_THREAD = 2; // Max 2 replies per thread per day

    // Pre-generate ONE shared late excuse for this batch
    // (ET was doing one thing — same excuse for everyone in this run)
    let sharedLateExcuse: string | null = null;
    const oldestMention = toProcess[0];
    if (oldestMention?.createdAt) {
      const delayMs = Date.now() - new Date(oldestMention.createdAt).getTime();
      const delayMinutes = Math.floor(delayMs / 60000);
      if (delayMinutes >= 60) {
        try {
          const { generateLateExcuse } = await import("./claude");
          sharedLateExcuse = await generateLateExcuse();
          console.log(`[ET Replies] Shared late excuse for batch: "${sharedLateExcuse}"`);
        } catch (e) {
          console.warn("[ET Replies] Failed to generate late excuse:", e);
        }
      }
    }

    for (const mention of toProcess) {
      if (results.length >= remainingBudget) {
        console.log("[ET Replies] Daily budget exhausted during run");
        break;
      }

      // PER-USER LIMIT — skip if we've already engaged this user enough today
      const mentionAuthor = mention.authorUsername || "";
      if (mentionAuthor) {
        const userLimitHit = await hasHitUserLimit(mentionAuthor);
        if (userLimitHit) {
          console.log(`[ET Replies] User limit — skipping @${mentionAuthor} (already 2+ interactions today)`);
          await recordReply(mention.id);
          lastProcessedId = mention.id;
          results.push({
            mentionId: mention.id,
            mentionText: mention.text,
            authorUsername: mentionAuthor,
            replyText: "",
            replyId: "",
            skipped: true,
            skipReason: `User limit (already interacted with @${mentionAuthor} today)`,
          });
          continue;
        }
      }

      // THREAD DEDUP — skip if we've already replied enough in this conversation
      if (mention.conversationId) {
        const batchCount = batchThreadReplies.get(mention.conversationId) || 0;
        const todayCount_thread = await getThreadReplyCount(mention.conversationId);
        const totalInThread = batchCount + todayCount_thread;

        if (totalInThread >= MAX_REPLIES_PER_THREAD) {
          console.log(`[ET Replies] Thread dedup — skipping @${mention.authorUsername || "?"} in conversation ${mention.conversationId} (already ${totalInThread} replies in thread)`);
          await recordReply(mention.id); // Mark as processed so we don't retry
          lastProcessedId = mention.id;
          results.push({
            mentionId: mention.id,
            mentionText: mention.text,
            authorUsername: mention.authorUsername || "someone",
            replyText: "",
            replyId: "",
            skipped: true,
            skipReason: `Thread dedup (${totalInThread}/${MAX_REPLIES_PER_THREAD} replies in this thread)`,
          });
          continue;
        }
      }

      try {
        const result = await processOneMention(mention, sharedLateExcuse);
        results.push(result);
        // Track the highest ID we actually processed (mentions are oldest→newest after reverse)
        lastProcessedId = mention.id;

        if (!result.skipped) {
          await incrementDailyReplyCount();

          // Record thread reply for dedup
          if (mention.conversationId) {
            await recordThreadReply(mention.conversationId);
            batchThreadReplies.set(
              mention.conversationId,
              (batchThreadReplies.get(mention.conversationId) || 0) + 1
            );
          }

          // Record per-user interaction
          if (mention.authorUsername) {
            await recordUserInteraction(mention.authorUsername);
          }

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
        // Still advance past this one so we don't retry broken mentions forever
        lastProcessedId = mention.id;
      }
    }

    // CRITICAL: Only advance cursor to last ACTUALLY PROCESSED mention
    // Not the newest fetched — otherwise unprocessed mentions are lost forever
    // In catch-up mode, don't advance cursor (these are behind it already)
    if (lastProcessedId && !catchUp) {
      await setLastMentionId(lastProcessedId);
      console.log(`[ET Replies] Cursor advanced to: ${lastProcessedId} (processed ${results.length}/${mentions.length} mentions)`);
    } else if (catchUp) {
      console.log(`[ET Replies] Catch-up mode — cursor not advanced (processed ${results.length} mentions)`);
    }
  } catch (error) {
    console.error("[ET Replies] Error in processReplies:", error);
  }

  return results;
}

/**
 * Process a single mention and generate/post a reply.
 * @param sharedLateExcuse - Pre-generated excuse shared across all late replies in this batch
 */
async function processOneMention(mention: Mention, sharedLateExcuse: string | null = null): Promise<ReplyResult> {
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
  // But NEVER skip CA/contract address requests — these need a response
  const textWithoutMentions = mention.text.replace(/@\w+/g, "").trim();
  const isCARequest = /^(ca|contract|address|ca\?|CA)\??$/i.test(textWithoutMentions);
  
  if (textWithoutMentions.length < 2 && !isCARequest) {
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

  // Detect reply delay and build late context
  let lateContext: { delayMinutes: number; delayLabel: string; excuse: string } | undefined;
  if (mention.createdAt && sharedLateExcuse) {
    const mentionTime = new Date(mention.createdAt).getTime();
    const delayMs = Date.now() - mentionTime;
    const delayMinutes = Math.floor(delayMs / 60000);

    if (delayMinutes >= 60) {
      const hours = Math.floor(delayMinutes / 60);
      let delayLabel: string;
      if (hours >= 24) {
        const days = Math.floor(hours / 24);
        delayLabel = days === 1 ? "a day" : `${days} days`;
      } else {
        delayLabel = hours === 1 ? "an hour" : `${hours} hours`;
      }
      lateContext = { delayMinutes, delayLabel, excuse: sharedLateExcuse };
      console.log(`[ET Replies] Late reply: ${delayLabel} delay for @${authorUsername} (excuse: "${sharedLateExcuse}")`);
    }
  }

  // Get conversation context if this is a reply to one of our tweets
  let conversationContext: string | undefined;
  if (mention.inReplyToId) {
    const parentTweet = await getTweet(mention.inReplyToId);
    if (parentTweet) {
      conversationContext = parentTweet.text;
    }
  }

  console.log(`[ET Replies] Generating reply to @${authorUsername}: "${mention.text.substring(0, 60)}..."${mention.imageUrls ? ` (${mention.imageUrls.length} image(s))` : ""}${lateContext ? ` [LATE: ${lateContext.delayLabel}]` : ""}`);

  // Generate the reply
  const replyText = await generateReply(
    mention.text,
    authorUsername,
    conversationContext,
    mention.imageUrls,
    lateContext
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

  // For very late replies (2+ hours), sometimes attach a "what ET was doing" image (30% chance, once per batch)
  let lateImageBuffer: Buffer | null = null;
  if (lateContext && lateContext.delayMinutes >= 120 && Math.random() < 0.3) {
    try {
      const { generateLateReplyScene } = await import("./claude");
      const sceneDescription = await generateLateReplyScene(lateContext.delayLabel);
      console.log(`[ET Replies] Late image scene: ${sceneDescription}`);

      const imageUrl = await generateImage(sceneDescription, "personal_lore");
      lateImageBuffer = await downloadImage(imageUrl, "personal_lore");
      console.log(`[ET Replies] Late image generated: ${Math.round(lateImageBuffer.length / 1024)}KB`);
    } catch (imgErr) {
      console.warn(`[ET Replies] Late image failed, continuing with text:`, imgErr);
    }
  }

  // Post the reply (with image if we have one)
  let replyId: string;
  if (lateImageBuffer) {
    const { postReplyWithImage } = await import("./twitter");
    replyId = await postReplyWithImage(replyText, mention.id, lateImageBuffer);
    console.log(`[ET Replies] Posted reply WITH IMAGE ${replyId} to @${authorUsername} (late: ${lateContext!.delayLabel})`);
  } else {
    replyId = await postReply(replyText, mention.id);
    console.log(`[ET Replies] Posted reply ${replyId} to @${authorUsername}${lateContext ? ` (late: ${lateContext.delayLabel})` : ""}`);
  }
  await recordReply(mention.id);

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

  // Safety: never start a standalone tweet with @
  tweetText = stripLeadingMentions(tweetText);

  // 3. If pillar is configured for images, ALWAYS generate (pillar config is the authority)
  if (shouldGenerateImage && (pillar === "personal_lore" || pillar === "human_observation" || pillar === "existential")) {
    try {
      const label = pillar === "personal_lore" ? "lore" : pillar === "human_observation" ? "observation" : "existential";
      console.log(`[ET] Generating ${label} image...`);

      // Generate scene description via Claude (pillar-aware)
      const sceneDescription = await generateImageDescription(tweetText, pillar);
      console.log(`[ET] Scene: ${sceneDescription}`);

      // Generate image via DALL-E (pillar-aware style)
      const imageUrl = await generateImage(sceneDescription, pillar);
      console.log(`[ET] DALL-E URL received: ${imageUrl.substring(0, 80)}...`);

      // Download image
      const imageBuffer = await downloadImage(imageUrl, pillar);
      console.log(`[ET] Image downloaded: ${Math.round(imageBuffer.length / 1024)}KB`);

      // Post tweet with image
      tweetId = await postTweetWithImage(tweetText, imageBuffer);
      hasImage = true;

      console.log(`[ET] Posted ${label} tweet with image: ${tweetId}`);
    } catch (imageError) {
      const errMsg = imageError instanceof Error ? imageError.message : String(imageError);
      console.error(`[ET] Image generation failed (${pillar}): ${errMsg}`);
      console.error("[ET] Full error:", imageError);
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
 * Interact with a target account — find a tweet and engage with it.
 * Fresh tweets (under 30 min): reply directly under the tweet (natural, conversational).
 * Older tweets: quote tweet (gives ET's followers context they wouldn't otherwise see).
 */
export async function interactWithTarget(
  handle: string
): Promise<{ success: boolean; tweetId?: string; replyText?: string; replyId?: string; method?: string; error?: string }> {
  const { getUserRecentTweets } = await import("./twitter");
  const { generateTargetInteraction } = await import("./claude");
  const { resolveTarget } = await import("./store");

  // Check per-user daily limit before doing any work
  if (await hasHitUserLimit(handle)) {
    console.log(`[ET Target] Skipping @${handle} — already interacted 2+ times today`);
    return { success: false, error: `Already interacted with @${handle} today (daily limit)` };
  }

  console.log(`[ET Target] Looking for fresh tweets from @${handle}...`);

  try {
    // 1. Fetch their recent tweets (sorted by recency)
    const tweets = await getUserRecentTweets(handle, 10);
    if (tweets.length === 0) {
      return { success: false, error: `No recent tweets found for @${handle}` };
    }

    // 2. Filter out tweets we've already quoted
    const unseenTweets: typeof tweets = [];
    for (const t of tweets) {
      if (!(await hasQuotedTweet(t.id))) {
        unseenTweets.push(t);
      }
    }

    if (unseenTweets.length === 0) {
      return { success: false, error: `All recent tweets from @${handle} already quoted` };
    }

    // 3. Prefer very fresh tweets (under 5 min), fall back to recent
    const now = Date.now();
    const fiveMinAgo = now - 5 * 60 * 1000;
    const freshTweets = unseenTweets.filter(t => t.createdAt && new Date(t.createdAt).getTime() > fiveMinAgo);

    const tweetsToUse = freshTweets.length > 0 ? freshTweets : unseenTweets;
    if (freshTweets.length > 0) {
      console.log(`[ET Target] Found ${freshTweets.length} fresh unseen tweet(s) (under 5 min)`);
    } else {
      console.log(`[ET Target] No fresh tweets, using ${unseenTweets.length} unseen recent tweets`);
    }

    // 4. Generate reaction via Claude
    const interaction = await generateTargetInteraction(handle, tweetsToUse);
    if (!interaction) {
      return { success: false, error: "Failed to generate interaction" };
    }

    // Double-check the picked tweet wasn't already quoted (Claude might pick wrong one)
    if (await hasQuotedTweet(interaction.tweetId)) {
      console.warn(`[ET Target] Claude picked already-quoted tweet ${interaction.tweetId}, skipping`);
      return { success: false, error: "Selected tweet already quoted" };
    }

    // Strip leading @ so it shows in timeline
    const reactionText = stripLeadingMentions(interaction.replyText);

    // DEDUP CHECK — make sure this reaction isn't too similar to recent tweets
    const recentTweets = await getRecentTweets();
    const similarTo = await checkSimilarity(reactionText, recentTweets);
    if (similarTo) {
      console.warn(`[ET Target] DEDUP — reaction for @${handle} too similar to: "${similarTo.substring(0, 50)}...". Skipping.`);
      return { success: false, error: `Dedup: too similar to existing tweet` };
    }

    console.log(`[ET Target] Engaging ${interaction.tweetId}: "${reactionText.substring(0, 60)}..."`);

    // 5. Decide method based on tweet age: reply if fresh, quote if old
    const pickedTweet = tweetsToUse.find(t => t.id === interaction.tweetId) || tweetsToUse[0];
    const tweetAgeMs = pickedTweet.createdAt ? Date.now() - new Date(pickedTweet.createdAt).getTime() : Infinity;
    const FRESH_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
    const isFresh = tweetAgeMs < FRESH_THRESHOLD_MS;

    if (isFresh) {
      // FRESH TWEET → reply directly under it (feels like joining a live conversation)
      console.log(`[ET Target] Tweet is ${Math.round(tweetAgeMs / 60000)}m old — replying directly`);
      try {
        const replyId = await postReply(reactionText, interaction.tweetId);
        await resolveTarget(handle);
        await markTweetQuoted(interaction.tweetId);
        await recordUserInteraction(handle);
        console.log(`[ET Target] Posted direct reply ${replyId} to @${handle}`);

        await recordTweet({
          id: replyId,
          text: reactionText,
          pillar: "human_observation",
          postedAt: new Date().toISOString(),
          hasImage: false,
        });

        return { success: true, tweetId: interaction.tweetId, replyText: reactionText, replyId, method: "reply" };
      } catch (replyError: any) {
        const status = replyError?.data?.status || replyError?.code;
        console.warn(`[ET Target] Direct reply failed (${status}), falling back to quote tweet...`);
        // Fall through to quote tweet below
      }
    } else {
      console.log(`[ET Target] Tweet is ${Math.round(tweetAgeMs / 60000)}m old — quote tweeting for visibility`);
    }

    // OLDER TWEET or reply fallback → quote tweet (gives ET's followers context)
    try {
      const qtId = await postQuoteTweet(reactionText, interaction.tweetId);
      await resolveTarget(handle);
      await markTweetQuoted(interaction.tweetId);
      await recordUserInteraction(handle);
      console.log(`[ET Target] Posted quote tweet ${qtId} for @${handle}`);

      await recordTweet({
        id: qtId,
        text: reactionText,
        pillar: "human_observation",
        postedAt: new Date().toISOString(),
        hasImage: false,
      });

      return { success: true, tweetId: interaction.tweetId, replyText: reactionText, replyId: qtId, method: "quote" };
    } catch (qtError: any) {
      const status = qtError?.data?.status || qtError?.code;
      console.warn(`[ET Target] Quote tweet failed (${status}), trying standalone mention+link...`);

      // 6. Fallback: standalone tweet with link (no leading @)
      const tweetLink = `https://x.com/${handle}/status/${interaction.tweetId}`;
      const maxTextLen = 280 - 23 - 2;
      let text = reactionText;
      if (text.length > maxTextLen) {
        text = text.substring(0, maxTextLen - 3) + "...";
      }
      text = `${text}\n\n${tweetLink}`;

      const tweetId = await postTweet(text);
      await resolveTarget(handle);
      await markTweetQuoted(interaction.tweetId);
      await recordUserInteraction(handle);
      console.log(`[ET Target] Posted standalone mention+link ${tweetId} for @${handle}`);
      return { success: true, tweetId: interaction.tweetId, replyText: reactionText, replyId: tweetId, method: "mention" };
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
 * Reply to a specific tweet by URL or ID.
 * Fetches the tweet, generates an ET-voiced reply, and posts it.
 */
export async function replyToSpecificTweet(
  tweetUrl: string
): Promise<{ success: boolean; tweetId?: string; replyText?: string; replyId?: string; method?: string; error?: string }> {
  // Extract tweet ID from URL or raw ID
  const idMatch = tweetUrl.match(/status\/(\d+)/);
  const tweetId = idMatch ? idMatch[1] : tweetUrl.replace(/\D/g, "");

  if (!tweetId) {
    return { success: false, error: "Could not extract tweet ID from URL" };
  }

  console.log(`[ET Reply] Replying to specific tweet ${tweetId}...`);

  try {
    // 1. Fetch the tweet
    const tweet = await getTweet(tweetId);
    if (!tweet) {
      return { success: false, error: `Could not fetch tweet ${tweetId}` };
    }

    const author = tweet.authorUsername || "someone";
    console.log(`[ET Reply] Tweet by @${author}: "${tweet.text.substring(0, 80)}..."`);

    // 2. Generate reply via Claude
    const replyText = await generateReply(tweet.text, author);
    if (!replyText) {
      return { success: false, error: "Failed to generate reply" };
    }

    console.log(`[ET Reply] Generated: "${replyText.substring(0, 60)}..."`);

    // 3. Try direct reply first
    try {
      const replyId = await postReply(replyText, tweetId);
      console.log(`[ET Reply] Posted reply ${replyId} to tweet ${tweetId}`);
      return { success: true, tweetId, replyText, replyId, method: "reply" };
    } catch (replyError: any) {
      const status = replyError?.data?.status || replyError?.code;
      console.warn(`[ET Reply] Direct reply failed (${status}), trying quote tweet...`);

      // 4. Fallback: quote tweet (strip leading @ so it shows in timeline)
      try {
        const cleanReply = stripLeadingMentions(replyText);
        const qtId = await postQuoteTweet(cleanReply, tweetId);
        await markTweetQuoted(tweetId);
        console.log(`[ET Reply] Posted quote tweet ${qtId} for tweet ${tweetId}`);
        return { success: true, tweetId, replyText: cleanReply, replyId: qtId, method: "quote" };
      } catch (qtError: any) {
        const qtStatus = qtError?.data?.status || qtError?.code;
        console.warn(`[ET Reply] Quote tweet failed (${qtStatus}), posting as standalone+link...`);

        // 5. Final fallback: standalone tweet with link (no leading @)
        const tweetLink = `https://x.com/${author}/status/${tweetId}`;
        const maxTextLen = 280 - 23 - 2;
        const cleanReply = stripLeadingMentions(replyText);
        const trimmedText = cleanReply.length > maxTextLen
          ? cleanReply.substring(0, maxTextLen - 3) + "..."
          : cleanReply;
        const fullTweet = `${trimmedText}\n\n${tweetLink}`;

        const mentionId = await postTweet(fullTweet);
        await markTweetQuoted(tweetId);
        console.log(`[ET Reply] Posted standalone+link ${mentionId}`);
        return { success: true, tweetId, replyText: trimmedText, replyId: mentionId, method: "mention" };
      }
    }
  } catch (error) {
    console.error(`[ET Reply] Error:`, error);
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
  const topPerformers = await getTopPerformers();
  const memorySummary = await getTweetMemorySummary();

  let trendingContext: string[] | undefined;
  if (useTrending) {
    try {
      trendingContext = await getTrendingContext();
    } catch { /* proceed without */ }
  }

  const tweetText = await generateTweet(pillar, recentTweets, trendingContext, topPerformers, memorySummary);

  const result: GeneratedTweet = {
    text: tweetText,
    pillar,
  };

  // Generate image preview for image-enabled pillars (always generate — pillar config is authority)
  if (pillar === "personal_lore" || pillar === "human_observation" || pillar === "existential") {
    try {
      const sceneDescription = await generateImageDescription(tweetText, pillar);
      console.log(`[ET Dry Run] Scene (${pillar}): ${sceneDescription}`);
      const imageUrl = await generateImage(sceneDescription, pillar);

      // For personal_lore, download and process to show the actual film-treated result
      if (pillar === "personal_lore") {
        try {
          const processedBuffer = await downloadImage(imageUrl, "personal_lore");
          result.imageUrl = `data:image/png;base64,${processedBuffer.toString("base64")}`;
          // Also store the raw URL for posting later
          result.rawImageUrl = imageUrl;
        } catch (procErr) {
          console.warn(`[ET Dry Run] Film processing failed, using raw:`, procErr);
          result.imageUrl = imageUrl;
        }
      } else {
        result.imageUrl = imageUrl;
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ET Dry Run] Image preview failed (${pillar}): ${errMsg}`);
    }
  }

  return result;
}

/**
 * Search for trending news and post a reaction (quote tweet or mention+link).
 * Uses fallback chain: quote tweet → standalone tweet with link.
 */
export async function reactToNews(): Promise<{
  success: boolean;
  tweetId?: string;
  reactionText?: string;
  sourceTweetId?: string;
  method?: string;
  error?: string;
}> {
  try {
    // 1. Search for hot news tweets
    const newsItems = await searchNewsTweets();
    if (newsItems.length === 0) {
      console.log("[ET News] No trending news found");
      return { success: false, error: "No news found" };
    }

    console.log(`[ET News] Found ${newsItems.length} news items, picking best one...`);

    // 1b. Filter out already-quoted tweets AND authors we've already interacted with today
    const unseenNews: typeof newsItems = [];
    for (const item of newsItems) {
      if (await hasQuotedTweet(item.id)) continue;
      if (item.author && await hasHitUserLimit(item.author)) {
        console.log(`[ET News] Skipping news from @${item.author} — already interacted today`);
        continue;
      }
      unseenNews.push(item);
    }

    if (unseenNews.length === 0) {
      console.log("[ET News] All news tweets already quoted");
      return { success: false, error: "All news already quoted" };
    }

    // 2. Have Claude pick one and generate reaction
    const reaction = await generateNewsReaction(unseenNews);
    if (!reaction) {
      console.log("[ET News] Failed to generate reaction");
      return { success: false, error: "Failed to generate reaction" };
    }

    // Double-check the picked tweet wasn't already quoted
    if (await hasQuotedTweet(reaction.tweetId)) {
      console.warn(`[ET News] Claude picked already-quoted tweet ${reaction.tweetId}, skipping`);
      return { success: false, error: "Selected news tweet already quoted" };
    }

    console.log(`[ET News] Reacting to tweet ${reaction.tweetId}: "${reaction.reactionText.substring(0, 60)}..."`);

    // Strip leading @ so it shows in timeline
    const reactionText = stripLeadingMentions(reaction.reactionText);

    // DEDUP CHECK — make sure this reaction isn't too similar to recent tweets
    const recentTweets = await getRecentTweets();
    const similarTo = await checkSimilarity(reactionText, recentTweets);
    if (similarTo) {
      console.warn(`[ET News] DEDUP — reaction "${reactionText.substring(0, 50)}..." too similar to: "${similarTo.substring(0, 50)}...". Skipping.`);
      return { success: false, error: `Dedup: too similar to existing tweet` };
    }

    // 3. Try quote tweet first
    try {
      const tweetId = await postQuoteTweet(reactionText, reaction.tweetId);
      await markTweetQuoted(reaction.tweetId);
      const newsAuthor = unseenNews.find(n => n.id === reaction.tweetId)?.author;
      if (newsAuthor) await recordUserInteraction(newsAuthor);
      console.log(`[ET News] Quote tweeted: ${tweetId}`);

      await recordTweet({
        id: tweetId,
        text: reactionText,
        pillar: "disclosure_conspiracy",
        postedAt: new Date().toISOString(),
        hasImage: false,
      });

      return { success: true, tweetId, reactionText, sourceTweetId: reaction.tweetId, method: "quote" };
    } catch (quoteErr) {
      console.warn("[ET News] Quote tweet failed, falling back to mention+link");
    }

    // 4. Fallback: standalone tweet with link
    const sourceItem = unseenNews.find(n => n.id === reaction.tweetId);
    const author = sourceItem?.author || "unknown";
    const linkUrl = `https://x.com/${author}/status/${reaction.tweetId}`;

    // Trim text to fit with link (t.co wraps to 23 chars)
    const maxTextLen = 280 - 23 - 2;
    let text = reactionText;
    if (text.length > maxTextLen) {
      text = text.substring(0, maxTextLen - 3) + "...";
    }
    text = `${text}\n\n${linkUrl}`;

    const tweetId = await postTweet(text);
    await markTweetQuoted(reaction.tweetId);
    if (author !== "unknown") await recordUserInteraction(author);
    console.log(`[ET News] Posted mention+link: ${tweetId}`);

    await recordTweet({
      id: tweetId,
      text: reactionText,
      pillar: "disclosure_conspiracy",
      postedAt: new Date().toISOString(),
      hasImage: false,
    });

    return { success: true, tweetId, reactionText, sourceTweetId: reaction.tweetId, method: "mention" };
  } catch (error) {
    console.error("[ET News] Error:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Refresh engagement data — fetch our own tweet metrics and update top performers.
 */
export async function refreshEngagement(): Promise<void> {
  try {
    const metrics = await getOwnTweetMetrics();
    if (metrics.length > 0) {
      await updateTopPerformers(metrics);
      const topLikes = metrics.sort((a, b) => b.likes - a.likes).slice(0, 3);
      console.log(`[ET Engagement] Updated top performers from ${metrics.length} tweets. Top: ${topLikes.map(t => `${t.likes}❤️`).join(", ")}`);
    }
  } catch (error) {
    console.warn("[ET Engagement] Failed to refresh:", error);
  }
}
