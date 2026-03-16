import { ContentPillar, TweetRecord, GeneratedTweet } from "@/types";
import { PILLAR_CONFIGS, SYSTEM_PROMPT, buildVictoryTweetPrompt, buildTaskTweetPrompt } from "./prompts";
import { generateTweet, generateImageDescription, generateReply, generateNewsReaction, checkSimilarity, generateRaidReply } from "./claude";
import { generateImage, downloadImage } from "./dalle";
import { postTweet, postTweetWithImage, postReply, postReplyWithImage, postQuoteTweet, getMentions, getTweet, getTweetWithMedia, getTrendingContext, searchNewsTweets, getOwnTweetMetrics, getOwnUserId, type Mention } from "./twitter";
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
  hasRepliedToParent,
  recordParentReplied,
  recordBotPostedTweet,
  wasBotPosted,
  recordEmptyPoll,
  resetPollBackoff,
  recordGmGnPosted,
  markRaidThread,
  isRaidThread,
  markTaskThread,
  isTaskThread,
  getDailyReplyCount,
  incrementDailyReplyCount,
  hasQuotedTweet,
  markTweetQuoted,
  getThreadReplyCount,
  recordThreadReply,
  hasHitUserLimit,
  recordUserInteraction,
  isVipUser,
  getRecentQtHistory,
  recordQtReaction,
  hasQuotedTopic,
  setPendingReward,
  getPendingReward,
  wasRewardPaid,
  markRewardPaid,
  addToRewardsQueue,
} from "./store";
import {
  getSelfAwarenessForTweets,
  getSelfAwarenessForReply,
  formatSelfAwarenessForPrompt,
  recordUserMemoryInteraction,
  extractStylesFromMessage,
  addLearnedStyles,
} from "./self-awareness";
import { sendSol, pickRewardAmount, getETWalletAddress } from "./et-wallet";
import Anthropic from "@anthropic-ai/sdk";
import { nanoid } from "nanoid";
import { isFinancialAdvisorMention, getRandomETMeme, getFinancialTrollText, generateFaceSwap } from "./meme-engine";

// Solana wallet address regex — base58, 32-44 chars, not our own CA or system programs
const SOLANA_ADDRESS_REGEX = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
const KNOWN_NON_WALLET_ADDRESSES = new Set([
  "A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF", // $ET CA
  "So11111111111111111111111111111111111111112",       // wSOL
  "11111111111111111111111111111111",                  // System program
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",  // ATA program
]);

function extractWalletAddress(text: string): string | null {
  const matches = text.match(SOLANA_ADDRESS_REGEX) || [];
  for (const match of matches) {
    if (!KNOWN_NON_WALLET_ADDRESSES.has(match) && match.length >= 32) {
      return match;
    }
  }
  return null;
}

// Max replies per cron run & per day
const MAX_REPLIES_PER_RUN = 3; // 3 replies per cron cycle with 2-3min gaps between
const MAX_REPLIES_PER_CATCHUP = 5; // Catch-up: 5 per manual trigger
const MAX_REPLIES_PER_DAY = 50; // Engagement-first: 30 replies/day

/** Extract rough topics from text for user memory and QT dedup */
function extractTopicsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const topicBank = [
    // SETI / science
    "seti", "boinc", "einstein", "telescope", "signal", "exoplanet",
    "james webb", "jwst", "mars", "moon", "asteroid",
    // UFO / UAP
    "ufo", "uap", "sighting", "orb", "tic tac",
    // Disclosure / government
    "congress", "hearing", "senate", "pentagon", "disclosure",
    "whistleblower", "classified", "legislation",
    "schumer", "rubio", "burchett", "grusch", "fravor",
    // General alien/space
    "alien", "space", "crash", "non-human", "reverse engineer",
    // Crypto
    "crypto", "token", "sol", "solana", "degen", "chart", "pump",
    // Personal
    "memory", "home", "planet", "parents", "loneliness",
    // Conspiracy
    "conspiracy", "area 51", "roswell", "government", "coverup", "cover-up",
    // Ancient
    "ancient", "archaeological", "pyramid", "hieroglyph", "nazca",
    "artifact", "civilization", "megalith",
  ];
  return topicBank.filter(t => lower.includes(t));
}

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

    // 1b. Get self-awareness context (quirks, mood, journal, engagement patterns)
    let selfAwarenessContext: string | undefined;
    try {
      const selfAwareness = await getSelfAwarenessForTweets();
      selfAwarenessContext = formatSelfAwarenessForPrompt(selfAwareness);
    } catch (e) {
      console.warn("[ET] Self-awareness context failed, proceeding without:", e);
    }

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
    let tweetText = await generateTweet(pillar, recentTweets, trendingContext, topPerformers, memorySummary, useRiddle, selfAwarenessContext);

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
      await recordEmptyPoll();
      return results;
    }

    console.log(`[ET Replies] Found ${mentions.length} new mentions`);
    await resetPollBackoff(); // Reset adaptive backoff — mentions are coming in

    // Process mentions (reply to oldest first for natural ordering)
    const batchLimit = catchUp ? MAX_REPLIES_PER_CATCHUP : MAX_REPLIES_PER_RUN;
    const toProcess = mentions.reverse().slice(0, batchLimit);
    const remainingBudget = MAX_REPLIES_PER_DAY - dailyCount;
    let lastProcessedId: string | null = null;

    // Thread dedup — track how many replies per conversation in this batch
    const batchThreadReplies = new Map<string, number>();
    const MAX_REPLIES_PER_THREAD = 8; // Let conversations flow naturally — stop at dead ends, not arbitrary caps

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
          console.log(`[ET Replies] User limit — skipping @${mentionAuthor} (hit daily interaction limit)`);
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
        const result = await processOneMention(mention);
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

          // Random delay between replies in batch (45-90s)
          // The 10-min cron interval provides natural spacing between batches
          const delayMs = 45000 + Math.random() * 45000;
          console.log(`[ET Replies] Waiting ${Math.round(delayMs / 1000)}s before next reply...`);
          await new Promise((r) => setTimeout(r, delayMs));
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
    // If cooldown skips occurred, don't advance — those mentions need retrying later
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
 */
async function processOneMention(mention: Mention): Promise<ReplyResult> {
  const authorUsername = mention.authorUsername || "someone";

  // Skip if already replied to this mention
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

  // SECOND DEDUP LAYER: Skip if ET already replied to a mention from this same author
  // about this same parent tweet. Catches race conditions / KV inconsistency.
  // Uses parent_tweet:author combo so different users can still mention ET on the same tweet.
  const parentKey = mention.inReplyToId || mention.conversationId;
  const parentAuthorKey = parentKey ? `${parentKey}:${authorUsername.toLowerCase()}` : null;
  if (parentAuthorKey && await hasRepliedToParent(parentAuthorKey)) {
    await recordReply(mention.id); // Mark this mention too
    return {
      mentionId: mention.id,
      mentionText: mention.text,
      authorUsername,
      replyText: "",
      replyId: "",
      skipped: true,
      skipReason: "Already replied to this user on this tweet",
    };
  }

  // Skip all mentions in raid threads — ET posts TLDR then ignores the chain
  if (mention.conversationId && await isRaidThread(mention.conversationId)) {
    await recordReply(mention.id);
    return {
      mentionId: mention.id,
      mentionText: mention.text,
      authorUsername,
      replyText: "",
      replyId: "",
      skipped: true,
      skipReason: "Raid thread (TLDR already posted — ignoring chain)",
    };
  }

  // Skip very short/empty mentions (just tagging with no substance)
  // But NEVER skip CA/contract address requests — these need a response
  const textWithoutMentions = mention.text.replace(/@\w+/g, "").trim();
  const isCARequest = /^(ca|contract|address|ca\?|CA)\??$/i.test(textWithoutMentions);

  // Skip OTHER people shilling CAs — Solana addresses are 32-44 base58 chars
  // But don't skip if it's OUR CA or if they're asking for our CA
  const OFFICIAL_CA = "A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF";
  const solanaAddrPattern = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
  const foundAddresses = textWithoutMentions.match(solanaAddrPattern) || [];
  const foreignCAs = foundAddresses.filter(addr => addr !== OFFICIAL_CA);
  if (foreignCAs.length > 0 && !isCARequest) {
    await recordReply(mention.id);
    return {
      mentionId: mention.id,
      mentionText: mention.text,
      authorUsername,
      replyText: "",
      replyId: "",
      skipped: true,
      skipReason: "CA shill (foreign contract address detected)",
    };
  }
  
  if (textWithoutMentions.length < 2 && !isCARequest) {
    await recordReply(mention.id);
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

  // Detect conversation-ending replies — user got the point, no further ET needed
  // Only applies to replies in threads (not fresh mentions), so we don't ignore
  // someone starting a new conversation with a short message
  const normalized = textWithoutMentions.toLowerCase().trim();
  const isInThread = !!mention.inReplyToId;
  const isConversationEnder = isInThread && (
    // Short acknowledgments
    /^(ok|okay|k|kk|cool|nice|great|thanks|thx|ty|bet|word|facts|fair|true|lol|lmao|haha|hahaha|ha|gotcha|got it|noted|yep|yup|yeah|yes|nah|no|aight|alright|good|dope|fire|based|W|L|gg|fs|fr|right|exactly|indeed|same|mood|real|this|💯)$/i.test(normalized) ||
    // Pure emoji replies (1-3 emojis, nothing else)
    /^[\p{Emoji}\p{Emoji_Component}\uFE0F\u200D]{1,10}$/u.test(normalized) ||
    // Emoji-only with minor text like "lol 😂" or "😂😂😂"
    (normalized.length <= 15 && /^[\p{Emoji}\p{Emoji_Component}\uFE0F\u200D\s]+$/u.test(normalized)) ||
    // Single word reactions
    /^(dead|crying|screaming|bro|bruh|man|dude|sheesh|oof|damn|wow|whoa|pls|stop|slay|iconic|legend|king|queen|goat)$/i.test(normalized)
  );

  if (isConversationEnder && !isCARequest) {
    await recordReply(mention.id);
    return {
      mentionId: mention.id,
      mentionText: mention.text,
      authorUsername,
      replyText: "",
      replyId: "",
      skipped: true,
      skipReason: "Conversation ender (acknowledgment/reaction — no reply needed)",
    };
  }

  // Detect meme engine keywords — these are handled by the meme engine in /bot, not text replies
  const isMemeRequest = /\b(photobomb|photo bomb|meme this|meme me|roast this|pay.*a visit|pay.*visit)\b/i.test(normalized);
  if (isMemeRequest) {
    await recordReply(mention.id);
    return {
      mentionId: mention.id,
      mentionText: mention.text,
      authorUsername,
      replyText: "",
      replyId: "",
      skipped: true,
      skipReason: "Meme engine request (photobomb/meme — handled via /bot)",
    };
  }

  // ── FINANCIAL ADVISOR TROLL ───────────────────────────────────────────────
  // When someone asks ET for financial/investment advice → reply with random ET meme
  const isFinancialTroll = isFinancialAdvisorMention(mention.text);
  if (isFinancialTroll) {
    console.log(`[ET Meme] Financial advisor troll detected from @${authorUsername}`);
    try {
      const [memeBuffer] = await Promise.all([getRandomETMeme()]);
      if (memeBuffer) {
        const trollText = getFinancialTrollText();
        const trollReplyId = await postReplyWithImage(trollText, mention.id, memeBuffer);
        await recordReply(mention.id);
        await recordBotPostedTweet(trollReplyId);
        console.log(`[ET Meme] Posted financial troll reply ${trollReplyId} to @${authorUsername}`);
        return {
          mentionId: mention.id,
          mentionText: mention.text,
          authorUsername,
          replyText: trollText,
          replyId: trollReplyId,
        };
      }
    } catch (e) {
      console.warn("[ET Meme] Financial troll failed, falling through to text reply:", e);
    }
    // If image fails, fall through to normal text reply
  }

  // ── FACE SWAP — parent tweet has image → ET face swap → emoji-only reply ─
  // Only if mention itself has no image, parent does, and it's not a financial troll
  const parentPhotoUrl = !isFinancialTroll && !mention.imageUrls?.length
    ? (() => {
        // Will be populated during thread walk below — flag for post-processing
        return null;
      })()
    : null;
  // (face swap is applied after thread walk, see below)

  // Detect "raid this" command — ET gives a TLDR of the parent post then ignores the chain
  const isRaidRequest = /\b(raid this|raid it|raid)\b/i.test(normalized);
  if (isRaidRequest && mention.inReplyToId) {
    console.log(`[ET Raid] @${authorUsername} requested raid on parent tweet ${mention.inReplyToId}`);
    try {
      const parentTweet = await getTweet(mention.inReplyToId);
      if (!parentTweet) {
        await recordReply(mention.id);
        return {
          mentionId: mention.id,
          mentionText: mention.text,
          authorUsername,
          replyText: "",
          replyId: "",
          skipped: true,
          skipReason: "Raid request but couldn't fetch parent tweet",
        };
      }

      const parentAuthor = parentTweet.authorUsername || "someone";
      console.log(`[ET Raid] Parent by @${parentAuthor}: "${parentTweet.text.substring(0, 80)}..."`);

      // Generate the TLDR
      let raidReply = await generateRaidReply(parentTweet.text, parentAuthor, authorUsername);
      if (!raidReply) {
        await recordReply(mention.id);
        return {
          mentionId: mention.id,
          mentionText: mention.text,
          authorUsername,
          replyText: "",
          replyId: "",
          skipped: true,
          skipReason: "Raid: failed to generate TLDR",
        };
      }

      // Truncate if needed
      if (raidReply.length > 280) {
        let trimmed = raidReply.substring(0, 277);
        const lastBreak = Math.max(trimmed.lastIndexOf(". "), trimmed.lastIndexOf("! "), trimmed.lastIndexOf("? "));
        if (lastBreak > 140) trimmed = trimmed.substring(0, lastBreak + 1);
        else trimmed = trimmed.substring(0, trimmed.lastIndexOf(" ")) + "...";
        raidReply = trimmed;
      }

      // Post the reply
      const replyId = await postReply(raidReply, mention.id);
      console.log(`[ET Raid] Posted TLDR reply ${replyId}`);
      await recordReply(mention.id);
      await recordBotPostedTweet(replyId);

      // Mark this conversation as a raid thread — ignore all future mentions in it
      if (mention.conversationId) {
        await markRaidThread(mention.conversationId);
        console.log(`[ET Raid] Marked conversation ${mention.conversationId} as raid thread — ignoring chain`);
      }

      return {
        mentionId: mention.id,
        mentionText: mention.text,
        authorUsername,
        replyText: raidReply,
        replyId,
        skipped: false,
      };
    } catch (error) {
      console.error(`[ET Raid] Error:`, error);
      await recordReply(mention.id);
      return {
        mentionId: mention.id,
        mentionText: mention.text,
        authorUsername,
        replyText: "",
        replyId: "",
        skipped: true,
        skipReason: `Raid error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // Get conversation context — walk up the thread to find the original post
  // With getTweet cache, deeper walks are cheap (cached in KV for 5 min)
  // VIP users get 10 levels (for long engaging threads), others get 5
  let conversationContext: string | undefined;
  let manuallyClaimedThread = false;
  let parentImageUrls: string[] | undefined; // Images from parent tweets (when mention has none)

  if (mention.inReplyToId) {
    const isVip = authorUsername ? await isVipUser(authorUsername) : false;
    const maxDepth = isVip ? 10 : 5;

    const contextParts: string[] = [];
    let currentId: string | undefined = mention.inReplyToId;
    let depth = 0;
    const ownUserId = await getOwnUserId();
    
    // If mention has no images, look for images in parent tweets
    const needImages = !mention.imageUrls || mention.imageUrls.length === 0;
    
    while (currentId && depth < maxDepth) {
      const tweet = await getTweet(currentId);
      if (!tweet) break;

      // Check if this is a manual ET reply (not bot-posted) → admin claimed thread
      if (tweet.authorId === ownUserId && !(await wasBotPosted(currentId))) {
        manuallyClaimedThread = true;
        break;
      }

      // Check parent for images if mention doesn't have any
      if (needImages && !parentImageUrls && depth < 2) {
        try {
          const tweetWithMedia = await getTweetWithMedia(currentId);
          if (tweetWithMedia && tweetWithMedia.imageUrls.length > 0) {
            parentImageUrls = tweetWithMedia.imageUrls;
            console.log(`[ET Replies] Found ${parentImageUrls.length} image(s) in parent tweet by @${tweetWithMedia.authorUsername} (${depth + 1} level up)`);
          }
        } catch { /* non-critical */ }
      }

      const author = tweet.authorUsername || "someone";
      const isET = tweet.authorId === ownUserId;
      contextParts.unshift(`${isET ? "[YOU]" : ""} @${author}: "${tweet.text}"`);
      currentId = tweet.inReplyToId;
      depth++;
    }
    
    if (contextParts.length > 0 && !manuallyClaimedThread) {
      conversationContext = contextParts.join("\n↳ ");
    }
  }

  // Merge images: use mention's own images, or fall back to parent's images
  const effectiveImageUrls = (mention.imageUrls && mention.imageUrls.length > 0)
    ? mention.imageUrls
    : parentImageUrls;

  // ── FACE SWAP — parent has a photo → ET face swap → emoji-only reply ──────
  // Trigger: mention has no image, parent tweet does, not a financial troll, not manually claimed
  if (
    !isFinancialTroll &&
    !manuallyClaimedThread &&
    !mention.imageUrls?.length &&
    parentImageUrls?.length &&
    !mention.hasVideo &&
    Math.random() < 0.4 // 40% chance — not every tagged photo gets a face swap
  ) {
    console.log(`[ET FaceSwap] Parent photo detected from @${authorUsername} — attempting face swap`);
    try {
      const swappedBuffer = await generateFaceSwap(parentImageUrls[0]);
      if (swappedBuffer) {
        const emojis = ["👽", "👁️", "🫠", "💀", "👽👽", "🛸"];
        const emojiReply = emojis[Math.floor(Math.random() * emojis.length)];
        const faceSwapReplyId = await postReplyWithImage(emojiReply, mention.id, swappedBuffer);
        await recordReply(mention.id);
        await recordBotPostedTweet(faceSwapReplyId);
        console.log(`[ET FaceSwap] Posted face swap reply ${faceSwapReplyId} to @${authorUsername}`);
        return {
          mentionId: mention.id,
          mentionText: mention.text,
          authorUsername,
          replyText: emojiReply,
          replyId: faceSwapReplyId,
        };
      }
    } catch (e) {
      console.warn("[ET FaceSwap] Failed, falling through to text reply:", e);
    }
    // If face swap fails, fall through to normal text reply
  }

  if (manuallyClaimedThread) {
    await recordReply(mention.id);
    return {
      mentionId: mention.id,
      mentionText: mention.text,
      authorUsername,
      replyText: "",
      replyId: "",
      skipped: true,
      skipReason: "Thread manually claimed (admin replied directly)",
    };
  }

  // Get thread depth for ET's judgment
  let threadDepth = 0;
  if (mention.conversationId) {
    threadDepth = await getThreadReplyCount(mention.conversationId);
  }

  // Get self-awareness context (user memory, quirks, mood)
  let selfAwarenessContext: string | undefined;
  try {
    const selfAwareness = await getSelfAwarenessForReply(authorUsername);
    selfAwarenessContext = formatSelfAwarenessForPrompt(selfAwareness);
  } catch (e) {
    console.warn("[ET Replies] Self-awareness context failed:", e);
  }

  console.log(`[ET Replies] Generating reply to @${authorUsername}: "${mention.text.substring(0, 60)}..."${effectiveImageUrls ? ` (${effectiveImageUrls.length} image(s)${parentImageUrls ? " from parent" : ""})` : ""}${threadDepth > 0 ? ` [thread depth: ${threadDepth}]` : ""}`);

  // ── VIDEO AWARENESS — prevent hallucinating video content ────────────────
  if (mention.hasVideo) {
    const videoNote = "\n\n⚠️ [VIDEO ATTACHED] The person posted a video. You CANNOT watch videos — you can only see the static thumbnail preview image. Do NOT describe, interpret, or make claims about what happens in the video. Do NOT assume you know what the video shows. If you reference it, acknowledge you can't actually watch it — something like 'i can't actually watch the video but...' or 'the thumbnail shows...' or just ask what's in it. Never pretend you saw the video content.";
    selfAwarenessContext = (selfAwarenessContext || "") + videoNote;
    console.log(`[ET Replies] Video attachment detected for @${authorUsername} — video-blindness mode active`);
  }

  // Detect if someone is sharing the OFFICIAL $ET CA — they're on our team, not scammers
  const mentionAndContext = `${mention.text} ${conversationContext || ""}`;
  if (mentionAndContext.includes(OFFICIAL_CA)) {
    const caNote = "\n\n[OFFICIAL CA DETECTED] The person (or someone in this thread) shared your CORRECT contract address. They are promoting $ET and helping the community. Be grateful and hype them up — do NOT warn about scams or tell them to check bio. They already have the right one.";
    selfAwarenessContext = (selfAwarenessContext || "") + caNote;
    console.log(`[ET Replies] Official CA detected in mention from @${authorUsername} — friendly mode`);
  }

  // If this is a task thread (ET already assigned a mission), tell him to answer follow-ups not create new tasks
  if (mention.conversationId && await isTaskThread(mention.conversationId)) {
    const taskNote = `\n\n⚠️ [TASK THREAD] You already assigned a task/mission earlier in this thread. DO NOT create another task. Answer the person's follow-up question.

If they ask HOW MUCH SOL / what's the reward / how much you paying:
- NEVER give a specific number. Troll them playfully. Examples:
  "FAFO 👽" / "complete the mission and find out" / "enough to make your wallet smile. or cry. depends on quality" / "you humans always want to negotiate before doing the work 😭 just deliver the goods" / "idk ask my accountant. oh wait i don't have one because i'm a stranded alien running a memecoin" / "the reward is proportional to how hard you make me laugh"
- Tease them about wanting payment before doing work — humans always want guarantees before proof of work, and that's hilarious to you
- Rotate between: FAFO, YOLO energy, trolling emojis (💀😭🫠👽), calling out that humans would rather beg for donations than actually do something

If they say they'll do it / accept the mission:
- Hype them up. They're your field agent now. "mission accepted. clock is ticking 👽" / "this one's got the spirit. don't let me down fren"

If they ask for clarification on the task:
- Be helpful and direct. Repeat the requirements briefly.`;
    selfAwarenessContext = (selfAwarenessContext || "") + taskNote;
    console.log(`[ET Replies] Task thread detected — follow-up mode`);
  }

  // Generate the reply — no proactive excuses. ET just replies naturally.
  // If the user calls him out for being slow, Claude will see that in the
  // mention text and can improvise a funny excuse in character.
  let replyText = await generateReply(
    mention.text,
    authorUsername,
    conversationContext,
    effectiveImageUrls,
    threadDepth,
    selfAwarenessContext
  );

  if (!replyText || replyText.length > 280) {
    if (replyText && replyText.length > 280 && replyText.length <= 400) {
      // Slightly over — retry once asking for shorter
      console.log(`[ET Replies] Reply slightly over (${replyText.length} chars) — retrying shorter...`);
      const shortReply = await generateReply(
        mention.text,
        authorUsername,
        conversationContext,
        effectiveImageUrls,
        threadDepth,
        `${selfAwarenessContext || ""}\n\nCRITICAL: Your last reply was ${replyText.length} chars — over the 280 char limit. Shorten it. Same idea, fewer words. Under 250 chars.`
      );
      if (shortReply && shortReply.length <= 280 && shortReply.trim().toUpperCase() !== "SKIP") {
        console.log(`[ET Replies] Retry succeeded: ${shortReply.length} chars`);
        replyText = shortReply;
      } else {
        // Still too long — just trim at sentence boundary
        let trimmed = replyText.substring(0, 277);
        const lastBreak = Math.max(trimmed.lastIndexOf(". "), trimmed.lastIndexOf("! "), trimmed.lastIndexOf("? "));
        if (lastBreak > 140) trimmed = trimmed.substring(0, lastBreak + 1);
        else trimmed = trimmed.substring(0, trimmed.lastIndexOf(" ")) + "...";
        replyText = trimmed;
      }
    } else if (replyText && replyText.length > 400) {
      // Actual thesis — truncate with "should i continue?" hook
      console.log(`[ET Replies] Long essay (${replyText.length} chars) — truncating with continuation hook`);
      const hook = "\n\nshould i continue? 👽";
      const maxContent = 280 - hook.length;
      let truncated = replyText.substring(0, maxContent);
      
      const lastSentence = truncated.lastIndexOf(". ");
      const lastComma = truncated.lastIndexOf(", ");
      const lastSpace = truncated.lastIndexOf(" ");
      const breakAt = lastSentence > maxContent * 0.5 ? lastSentence + 1
        : lastComma > maxContent * 0.5 ? lastComma + 1
        : lastSpace > maxContent * 0.5 ? lastSpace
        : maxContent;
      
      truncated = truncated.substring(0, breakAt).trim();
      replyText = `${truncated}${hook}`;
    }
  }

  if (!replyText || replyText.length > 280) {
    await recordReply(mention.id);
    return {
      mentionId: mention.id,
      mentionText: mention.text,
      authorUsername,
      replyText: "",
      replyId: "",
      skipped: true,
      skipReason: "Empty reply generated",
    };
  }

  // ET decided to disengage from this thread
  if (replyText.trim().toUpperCase() === "SKIP") {
    console.log(`[ET Replies] ET chose to disengage from @${authorUsername}'s thread (depth: ${threadDepth})`);
    await recordReply(mention.id);
    return {
      mentionId: mention.id,
      mentionText: mention.text,
      authorUsername,
      replyText: "",
      replyId: "",
      skipped: true,
      skipReason: `ET disengaged (thread depth: ${threadDepth})`,
    };
  }

  // Post the reply
  const replyId = await postReply(replyText, mention.id);
  console.log(`[ET Replies] Posted reply ${replyId} to @${authorUsername}`);
  await recordReply(mention.id);
  await recordBotPostedTweet(replyId); // Track for manual reply detection

  // Record parent+author for second dedup layer
  const postedParentKey = mention.inReplyToId || mention.conversationId;
  if (postedParentKey) {
    await recordParentReplied(`${postedParentKey}:${authorUsername.toLowerCase()}`);
  }

  // Record this interaction in user memory (non-blocking)
  recordUserMemoryInteraction(
    authorUsername,
    mention.text,
    replyText,
    extractTopicsFromText(mention.text)
  ).catch(e => console.warn("[ET Replies] User memory record failed:", e));

  // Learn speech patterns from the human (non-blocking, no API call)
  try {
    const styles = extractStylesFromMessage(mention.text, authorUsername);
    if (styles.length > 0) {
      addLearnedStyles(styles).catch(() => {});
      console.log(`[ET Style] Learned ${styles.length} pattern(s) from @${authorUsername}: ${styles.map(s => s.phrase).join(", ")}`);
    }
  } catch { /* non-critical */ }

  // ── TASK ASSIGNMENT — post community-wide task tweet + reply with link ──────
  const taskSignalInReply = /\b(task is (live|incoming|posted|coming)|watch the timeline|just posted it|check my timeline|community task|mission (is )?(live|posted|incoming))\b/i.test(replyText);
  const taskAssigned = /\b(mission|task|SOL reward|gets? SOL|send SOL|hours|clip.*tag|film.*tag|screenshot.*tag|post.*tag|make it rain|i'll send|i will send)\b/i.test(replyText);

  let taskTweetId = "";

  if (taskSignalInReply && mention.conversationId) {
    try {
      const anthropicForTask = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
      const taskPrompt = buildTaskTweetPrompt(`${mention.text} | ET reply: ${replyText}`);
      const taskRes = await anthropicForTask.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: taskPrompt }],
        temperature: 0.9,
      });
      let taskTweetText = taskRes.content[0].type === "text" ? taskRes.content[0].text.trim().replace(/^["']|["']$/g, "").trim() : "";
      if (taskTweetText && taskTweetText.length <= 280) {
        taskTweetId = await postTweet(taskTweetText);
        const taskLink = `https://x.com/etalienx/status/${taskTweetId}`;
        await postReply(`task is live 👽 ${taskLink}`, replyId);
        console.log(`[ET Task] Posted community task tweet ${taskTweetId} and linked back`);
      }
    } catch (taskErr) {
      console.error("[ET Task] Failed to post community task tweet:", taskErr);
    }
  }

  if ((taskAssigned || taskSignalInReply) && mention.conversationId) {
    await markTaskThread(mention.conversationId);
    await setPendingReward(mention.conversationId, {
      taskContext: replyText.substring(0, 200),
      promiseTweetId: taskTweetId || replyId,
    });
    console.log(`[ET Task] Marked conversation ${mention.conversationId} as task thread`);
  }

  // ── REWARD QUEUE — wallet detected → add to admin review queue (NOT auto-send) ──
  if (mention.conversationId) {
    const walletInMention = extractWalletAddress(mention.text);
    if (walletInMention) {
      const [alreadyPaid, pendingReward] = await Promise.all([
        wasRewardPaid(mention.conversationId),
        getPendingReward(mention.conversationId),
      ]);

      if (!alreadyPaid && pendingReward) {
        await addToRewardsQueue({
          id: nanoid(10),
          conversationId: mention.conversationId,
          taskTweetId: pendingReward.promiseTweetId,
          taskContext: pendingReward.taskContext,
          winner: authorUsername,
          walletAddress: walletInMention,
          walletTweetId: mention.id,
          submittedAt: new Date().toISOString(),
        });
        const acks = ["got it. in the queue 👽", "received. reviewing 👽", "noted. i'll pick the winner 👽", "wallet logged. checking the field.", "got your submission 👽"];
        await postReply(acks[Math.floor(Math.random() * acks.length)], mention.id);
        console.log(`[ET Reward] @${authorUsername} added to rewards queue — awaiting admin confirmation`);
      }
    }
  }

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
  if (shouldGenerateImage) {
    try {
      console.log(`[ET] Generating ${pillar} image...`);

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

      console.log(`[ET] Posted ${pillar} tweet with image: ${tweetId}`);
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
  await recordBotPostedTweet(tweetId); // Track for manual reply detection

  // Record GM/GN timestamp for 3-day interval tracking
  if (pillar === "gm" || pillar === "gn") {
    await recordGmGnPosted(pillar);
  }

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
        await recordBotPostedTweet(replyId);
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

      // 6. Fallback: standalone tweet with link
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
  } catch (error: any) {
    const details = error?.data || error?.errors || error?.message || error;
    console.error(`[ET Target] Error interacting with @${handle}:`, JSON.stringify(details, null, 2));
    return {
      success: false,
      error: `Reply failed: ${error instanceof Error ? error.message : JSON.stringify(details)}`,
    };
  }
}

/**
 * Reply to a specific tweet by URL or ID.
 * Fetches the tweet, generates an ET-voiced reply, and posts it.
 */
export async function replyToSpecificTweet(
  tweetUrl: string,
  dryRun: boolean = false
): Promise<{ success: boolean; tweetId?: string; replyText?: string; replyId?: string; method?: string; error?: string; originalText?: string; originalAuthor?: string }> {
  // Extract tweet ID from URL or raw ID
  const idMatch = tweetUrl.match(/status\/(\d+)/);
  const tweetId = idMatch ? idMatch[1] : tweetUrl.replace(/\D/g, "");

  if (!tweetId) {
    return { success: false, error: "Could not extract tweet ID from URL" };
  }

  console.log(`[ET Reply] ${dryRun ? "DRY RUN — " : ""}Replying to specific tweet ${tweetId}...`);

  try {
    // 1. Fetch the tweet WITH images
    const tweet = await getTweetWithMedia(tweetId);
    if (!tweet) {
      return { success: false, error: `Could not fetch tweet ${tweetId}` };
    }

    const author = tweet.authorUsername || "someone";
    const hasImages = tweet.imageUrls.length > 0;
    console.log(`[ET Reply] Tweet by @${author}: "${tweet.text.substring(0, 80)}..."${hasImages ? ` (${tweet.imageUrls.length} image(s))` : ""}`);

    // ── FINANCIAL ADVISOR TROLL (Target Queue path) ───────────────────────────
    if (isFinancialAdvisorMention(tweet.text)) {
      console.log(`[ET Reply] Financial advisor troll triggered for tweet ${tweetId}`);
      try {
        const memeBuffer = await getRandomETMeme();
        if (memeBuffer) {
          const trollText = getFinancialTrollText();
          if (dryRun) {
            return { success: true, tweetId, replyText: `[MEME IMAGE] ${trollText}`, method: "preview", originalText: tweet.text, originalAuthor: author };
          }
          const trollReplyId = await postReplyWithImage(trollText, tweetId, memeBuffer);
          await markTweetQuoted(tweetId);
          await recordBotPostedTweet(trollReplyId);
          await recordReply(tweetId);
          return { success: true, tweetId, replyText: trollText, replyId: trollReplyId, method: "reply" };
        }
      } catch (e) {
        console.warn("[ET Reply] Financial troll failed, falling through:", e);
      }
    }

    // ── FACE SWAP (Target Queue path) ─────────────────────────────────────────
    // If the tweet itself has an image → face swap with ET
    if (hasImages && !isFinancialAdvisorMention(tweet.text) && Math.random() < 0.4) {
      console.log(`[ET Reply] Face swap triggered for tweet ${tweetId}`);
      try {
        const swappedBuffer = await generateFaceSwap(tweet.imageUrls[0]);
        if (swappedBuffer) {
          const emojis = ["👽", "👁️", "🫠", "💀", "👽👽", "🛸"];
          const emojiReply = emojis[Math.floor(Math.random() * emojis.length)];
          if (dryRun) {
            return { success: true, tweetId, replyText: `[FACE SWAP IMAGE] ${emojiReply}`, method: "preview", originalText: tweet.text, originalAuthor: author };
          }
          const faceReplyId = await postReplyWithImage(emojiReply, tweetId, swappedBuffer);
          await markTweetQuoted(tweetId);
          await recordBotPostedTweet(faceReplyId);
          await recordReply(tweetId);
          return { success: true, tweetId, replyText: emojiReply, replyId: faceReplyId, method: "reply" };
        }
      } catch (e) {
        console.warn("[ET Reply] Face swap failed, falling through:", e);
      }
    }

    // 2. Generate reply via Claude (with images if present)
    const replyText = await generateReply(
      tweet.text,
      author,
      undefined, // no conversation context for direct force reply
      hasImages ? tweet.imageUrls : undefined,
    );
    if (!replyText) {
      return { success: false, error: "Failed to generate reply" };
    }

    console.log(`[ET Reply] Generated: "${replyText.substring(0, 60)}..."`);

    // DRY RUN — return preview without posting
    if (dryRun) {
      return {
        success: true,
        tweetId,
        replyText,
        method: "preview",
        originalText: tweet.text,
        originalAuthor: author,
      };
    }
    // 3. Try direct reply first
    try {
      const replyId = await postReply(replyText, tweetId);
      console.log(`[ET Reply] ✓ Posted reply ${replyId} under tweet ${tweetId}`);
      await markTweetQuoted(tweetId);
      await recordBotPostedTweet(replyId);
      await recordReply(tweetId); // Prevent auto-reply cron from replying again
      await recordParentReplied(`${tweetId}:${author.toLowerCase()}`);
      return { success: true, tweetId, replyText, replyId, method: "reply" };
    } catch (replyError: any) {
      const status = replyError?.data?.status || replyError?.code;
      const msg = replyError?.message || String(replyError);
      console.warn(`[ET Reply] Direct reply failed (${status}): ${msg}`);

      // 4. Fallback: quote tweet (for 403 — not mentioned/engaged by author)
      if (status === 403) {
        console.log("[ET Reply] Falling back to quote tweet...");
        try {
          const cleanReply = stripLeadingMentions(replyText);
          const qtId = await postQuoteTweet(cleanReply, tweetId);
          await markTweetQuoted(tweetId);
          await recordBotPostedTweet(qtId);
          await recordReply(tweetId);
          await recordParentReplied(`${tweetId}:${author.toLowerCase()}`);
          console.log(`[ET Reply] ✓ Posted quote tweet ${qtId}`);
          return { success: true, tweetId, replyText: cleanReply, replyId: qtId, method: "quote" };
        } catch (qtError: any) {
          console.warn(`[ET Reply] Quote tweet also failed, posting standalone...`);

          // 5. Final fallback: standalone tweet with link
          try {
            const cleanReply = stripLeadingMentions(replyText);
            const tweetLink = `https://x.com/i/status/${tweetId}`;
            // Link takes ~23 chars + newlines
            const maxText = 280 - 23 - 4;
            const trimmed = cleanReply.length > maxText
              ? cleanReply.substring(0, maxText - 3) + "..."
              : cleanReply;
            const standalone = `${trimmed}\n\n${tweetLink}`;
            const stId = await postTweet(standalone);
            await markTweetQuoted(tweetId);
            await recordBotPostedTweet(stId);
            await recordReply(tweetId);
            await recordParentReplied(`${tweetId}:${author.toLowerCase()}`);
            console.log(`[ET Reply] ✓ Posted standalone with link ${stId}`);
            return { success: true, tweetId, replyText: trimmed, replyId: stId, method: "standalone" };
          } catch (stError: any) {
            const stMsg = stError?.message || String(stError);
            return { success: false, error: `All methods failed: ${stMsg}` };
          }
        }
      }

      return { success: false, error: `Reply failed (${status}): ${msg}` };
    }
  } catch (error: any) {
    const details = error?.data || error?.errors || error?.message || error;
    console.error(`[ET Reply] Failed to reply to ${tweetId}:`, JSON.stringify(details, null, 2));
    return {
      success: false,
      error: `Reply failed: ${error instanceof Error ? error.message : JSON.stringify(details)}`,
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
): Promise<GeneratedTweet & { selfAwareness?: string }> {
  const recentTweets = await getRecentTweets();
  const topPerformers = await getTopPerformers();
  const memorySummary = await getTweetMemorySummary();

  // Get self-awareness context
  let selfAwarenessContext: string | undefined;
  try {
    const selfAwareness = await getSelfAwarenessForTweets();
    selfAwarenessContext = formatSelfAwarenessForPrompt(selfAwareness);
    console.log(`[ET Dry Run] Self-awareness loaded (${selfAwarenessContext.length} chars)`);
  } catch (e) {
    console.warn("[ET Dry Run] Self-awareness failed:", e);
  }

  let trendingContext: string[] | undefined;
  if (useTrending) {
    try {
      trendingContext = await getTrendingContext();
    } catch { /* proceed without */ }
  }

  const tweetText = await generateTweet(pillar, recentTweets, trendingContext, topPerformers, memorySummary, false, selfAwarenessContext);

  const result: GeneratedTweet & { selfAwareness?: string } = {
    text: tweetText,
    pillar,
    selfAwareness: selfAwarenessContext,
  };

  // Generate image preview for image-enabled pillars (always generate — pillar config is authority)
  const dryRunConfig = PILLAR_CONFIGS[pillar];
  if (dryRunConfig.generateImage) {
    try {
      const sceneDescription = await generateImageDescription(tweetText, pillar);
      console.log(`[ET Dry Run] Scene (${pillar}): ${sceneDescription}`);
      const imageUrl = await generateImage(sceneDescription, pillar);
      result.imageUrl = imageUrl;
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
 *
 * DEDUP LAYERS:
 * 1. hasQuotedTweet() — exact tweet ID already QT'd
 * 2. hasQuotedTopic() — topic-level dedup (≥3 shared topic tags)
 * 3. Recent QT reactions injected into Claude prompt
 * 4. checkSimilarity() — Claude-based text similarity
 * 5. Deterministic keyword overlap against recent tweets
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

    console.log(`[ET News] Found ${newsItems.length} news items, filtering...`);

    // 2. Filter: exact ID dedup + topic-level dedup + user limit
    const unseenNews: typeof newsItems = [];
    for (const item of newsItems) {
      // Layer 1: Exact tweet ID
      if (await hasQuotedTweet(item.id)) {
        console.log(`[ET News] Skipping ${item.id} — already QT'd`);
        continue;
      }
      // Layer 1b: User limit
      if (item.author && await hasHitUserLimit(item.author)) {
        console.log(`[ET News] Skipping @${item.author} — already interacted today`);
        continue;
      }
      // Layer 2: Topic-level dedup
      const topicMatch = await hasQuotedTopic(item.text);
      if (topicMatch) {
        console.log(`[ET News] Skipping "${item.text.substring(0, 50)}..." — topic already covered in QT: "${topicMatch.reactionText.substring(0, 50)}..."`);
        continue;
      }
      unseenNews.push(item);
    }

    if (unseenNews.length === 0) {
      console.log("[ET News] All news tweets already covered (ID or topic)");
      return { success: false, error: "All news already covered" };
    }

    // 3. Load recent QT history for Claude context (Layer 3)
    const recentQts = await getRecentQtHistory(10);
    const qtContext = recentQts.map(qt => ({
      sourceText: qt.sourceText,
      reactionText: qt.reactionText,
      topics: qt.topics,
    }));

    // 4. Have Claude pick one and generate reaction (with QT history injected)
    const reaction = await generateNewsReaction(unseenNews, qtContext);
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

    // Layer 4: Claude-based text similarity check
    const recentTweets = await getRecentTweets();
    const similarTo = await checkSimilarity(reactionText, recentTweets);
    if (similarTo) {
      console.warn(`[ET News] DEDUP — reaction "${reactionText.substring(0, 50)}..." too similar to: "${similarTo.substring(0, 50)}...". Skipping.`);
      return { success: false, error: `Dedup: too similar to existing tweet` };
    }

    // Layer 5: Deterministic keyword overlap check against recent QTs
    const reactionTopics = extractTopicsFromText(reactionText);
    for (const qt of recentQts.slice(0, 10)) {
      const overlap = qt.topics.filter(t => reactionTopics.includes(t));
      if (overlap.length >= 3) {
        console.warn(`[ET News] DEDUP — reaction topics [${overlap.join(", ")}] overlap with recent QT. Skipping.`);
        return { success: false, error: `Topic overlap with recent QT: ${overlap.join(", ")}` };
      }
    }

    // Find source item for recording
    const sourceItem = unseenNews.find(n => n.id === reaction.tweetId);

    // 5. Try quote tweet first
    try {
      const tweetId = await postQuoteTweet(reactionText, reaction.tweetId);
      await markTweetQuoted(reaction.tweetId);
      const newsAuthor = sourceItem?.author || "unknown";
      if (newsAuthor !== "unknown") await recordUserInteraction(newsAuthor);
      console.log(`[ET News] Quote tweeted: ${tweetId}`);

      await recordTweet({
        id: tweetId,
        text: reactionText,
        pillar: "disclosure_conspiracy",
        postedAt: new Date().toISOString(),
        hasImage: false,
      });

      // Record rich QT history for future dedup
      await recordQtReaction({
        sourceTweetId: reaction.tweetId,
        sourceText: sourceItem?.text || "",
        reactionText,
        topics: extractTopicsFromText(`${sourceItem?.text || ""} ${reactionText}`),
        author: newsAuthor,
        quotedAt: new Date().toISOString(),
      });

      return { success: true, tweetId, reactionText, sourceTweetId: reaction.tweetId, method: "quote" };
    } catch (quoteErr) {
      console.warn("[ET News] Quote tweet failed, falling back to mention+link");
    }

    // 6. Fallback: standalone tweet with link
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

    // Record rich QT history
    await recordQtReaction({
      sourceTweetId: reaction.tweetId,
      sourceText: sourceItem?.text || "",
      reactionText,
      topics: extractTopicsFromText(`${sourceItem?.text || ""} ${reactionText}`),
      author,
      quotedAt: new Date().toISOString(),
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
