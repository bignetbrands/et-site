import { TwitterApi, type TwitterApiReadWrite } from "twitter-api-v2";

// ⚠️ HARD HALT — set to true to block ALL Twitter API calls
const TWITTER_HALTED = false;

function assertNotHalted(action: string) {
  if (TWITTER_HALTED) {
    console.warn(`[Twitter] HALTED — blocked: ${action}`);
    throw new Error(`Twitter API halted — ${action} blocked`);
  }
}

// ============================================================
// RATE LIMIT TRACKING
// ============================================================
// Twitter returns rate limit headers on every response.
// We track them and refuse to act if we're close to the limit.

interface RateLimitState {
  remaining: number;
  limit: number;
  reset: number; // Unix timestamp (seconds)
  lastChecked: number;
}

const rateLimits: Record<string, RateLimitState> = {};

function trackRateLimit(endpoint: string, rateLimit: { limit: number; remaining: number; reset: number } | undefined) {
  if (!rateLimit) return;

  rateLimits[endpoint] = {
    remaining: rateLimit.remaining,
    limit: rateLimit.limit,
    reset: rateLimit.reset,
    lastChecked: Date.now(),
  };

  if (rateLimit.remaining <= 2) {
    const resetIn = Math.max(0, rateLimit.reset - Math.floor(Date.now() / 1000));
    console.warn(`[Twitter] ⚠️ Rate limit critical for ${endpoint}: ${rateLimit.remaining} remaining, resets in ${resetIn}s`);
  } else if (rateLimit.remaining <= 5) {
    console.log(`[Twitter] Rate limit low for ${endpoint}: ${rateLimit.remaining}/${rateLimit.limit} remaining`);
  }
}

function checkRateLimit(endpoint: string): { ok: boolean; waitSeconds?: number } {
  const state = rateLimits[endpoint];
  if (!state) return { ok: true }; // No data yet, proceed cautiously

  if (state.remaining <= 1) {
    const now = Math.floor(Date.now() / 1000);
    if (state.reset > now) {
      return { ok: false, waitSeconds: state.reset - now };
    }
    // Reset time passed, allow through
  }
  return { ok: true };
}

/** Get current rate limit status for monitoring */
export function getRateLimits(): Record<string, RateLimitState> {
  return { ...rateLimits };
}

let _rwClient: TwitterApiReadWrite | null = null;

function getClient() {
  if (!_rwClient) {
    const twitter = new TwitterApi({
      appKey: process.env.X_API_KEY!,
      appSecret: process.env.X_API_SECRET!,
      accessToken: process.env.X_ACCESS_TOKEN!,
      accessSecret: process.env.X_ACCESS_SECRET!,
    });
    _rwClient = twitter.readWrite;
  }
  return _rwClient;
}

export interface Mention {
  id: string;
  text: string;
  authorId: string;
  authorUsername?: string;
  conversationId?: string;
  inReplyToId?: string;
  createdAt?: string;
  imageUrls?: string[];
}

/**
 * Post a text-only tweet.
 * Returns the tweet ID.
 */
export async function postTweet(text: string): Promise<string> {
  assertNotHalted("postTweet");
  const rl = checkRateLimit("tweets/create");
  if (!rl.ok) {
    throw new Error(`Rate limited on tweets/create — wait ${rl.waitSeconds}s`);
  }
  const response = await getClient().v2.tweet(text);
  trackRateLimit("tweets/create", (response as any).rateLimit);
  return response.data.id;
}

/**
 * Post a reply to a specific tweet.
 */
export async function postReply(
  text: string,
  replyToId: string
): Promise<string> {
  assertNotHalted("postReply");
  const rl = checkRateLimit("tweets/create");
  if (!rl.ok) {
    throw new Error(`Rate limited on tweets/create — wait ${rl.waitSeconds}s`);
  }
  try {
    const response = await getClient().v2.tweet({
      text,
      reply: { in_reply_to_tweet_id: replyToId },
    });
    trackRateLimit("tweets/create", (response as any).rateLimit);
    return response.data.id;
  } catch (error: any) {
    // Log the full Twitter error for debugging
    const details = error?.data || error?.errors || error?.message || error;
    console.error(`[Twitter] postReply failed (tweet ${replyToId}):`, JSON.stringify(details, null, 2));
    throw error;
  }
}

/**
 * Post a quote tweet (retweet with comment).
 */
export async function postQuoteTweet(
  text: string,
  quoteTweetId: string
): Promise<string> {
  assertNotHalted("postQuoteTweet");
  const rl = checkRateLimit("tweets/create");
  if (!rl.ok) {
    throw new Error(`Rate limited on tweets/create — wait ${rl.waitSeconds}s`);
  }
  try {
    const response = await getClient().v2.tweet({
      text,
      quote_tweet_id: quoteTweetId,
    });
    trackRateLimit("tweets/create", (response as any).rateLimit);
    return response.data.id;
  } catch (error: any) {
    const details = error?.data || error?.errors || error?.message || error;
    console.error(`[Twitter] postQuoteTweet failed (tweet ${quoteTweetId}):`, JSON.stringify(details, null, 2));
    throw error;
  }
}

/**
 * Post a tweet with an image.
 * Uploads the image first via v1.1 media endpoint, then posts the tweet.
 * Returns the tweet ID.
 */
export async function postTweetWithImage(
  text: string,
  imageBuffer: Buffer
): Promise<string> {
  assertNotHalted("postTweetWithImage");
  // Upload media via v1.1 (v2 doesn't support media upload directly)
  const mediaId = await getClient().v1.uploadMedia(imageBuffer, {
    mimeType: "image/png",
    target: "tweet",
  });

  // Post tweet with media
  const response = await getClient().v2.tweet({
    text,
    media: { media_ids: [mediaId] },
  });

  return response.data.id;
}

/**
 * Post a reply with an image attached.
 * Combines reply threading with image upload.
 */
export async function postReplyWithImage(
  text: string,
  replyToId: string,
  imageBuffer: Buffer
): Promise<string> {
  assertNotHalted("postReplyWithImage");
  // Upload media via v1.1
  const mediaId = await getClient().v1.uploadMedia(imageBuffer, {
    mimeType: "image/png",
    target: "tweet",
  });

  // Post as reply with media
  const response = await getClient().v2.tweet({
    text,
    reply: { in_reply_to_tweet_id: replyToId },
    media: { media_ids: [mediaId] },
  });

  return response.data.id;
}

// Cache our own user ID — never changes, no need to fetch every 15 minutes
let _cachedUserId: string | null = null;

async function getOwnUserId(): Promise<string> {
  if (_cachedUserId) return _cachedUserId;
  const me = await getClient().v2.me();
  _cachedUserId = me.data.id;
  return _cachedUserId;
}

/**
 * Fetch recent mentions of the authenticated user.
 * Returns mentions since the given ID (exclusive), or the most recent ones.
 */
export async function getMentions(
  sinceId?: string,
  maxResults: number = 20
): Promise<{ mentions: Mention[]; newestId?: string }> {
  assertNotHalted("getMentions");
  const userId = await getOwnUserId();

  const params: Record<string, unknown> = {
    max_results: Math.min(maxResults, 100),
    "tweet.fields": "created_at,conversation_id,in_reply_to_user_id,author_id,referenced_tweets,attachments",
    expansions: "author_id,attachments.media_keys",
    "user.fields": "username",
    "media.fields": "url,preview_image_url,type",
  };

  if (sinceId) {
    params.since_id = sinceId;
  }

  const timeline = await getClient().v2.userMentionTimeline(userId, params);

  const users = new Map<string, string>();
  if (timeline.includes?.users) {
    for (const u of timeline.includes.users) {
      users.set(u.id, u.username);
    }
  }

  // Build media key → URL map (photos get full URL, GIFs/videos get preview thumbnail)
  const mediaMap = new Map<string, string>();
  if (timeline.includes?.media) {
    for (const m of timeline.includes.media) {
      if (m.type === "photo" && (m.url || m.preview_image_url)) {
        mediaMap.set(m.media_key, m.url || m.preview_image_url || "");
      } else if ((m.type === "animated_gif" || m.type === "video") && m.preview_image_url) {
        // GIFs/videos: use the static preview thumbnail so Claude can "see" it
        mediaMap.set(m.media_key, m.preview_image_url);
      }
    }
  }

  const mentions: Mention[] = [];
  if (timeline.data?.data) {
    for (const tweet of timeline.data.data) {
      // Skip our own tweets (self-mentions)
      if (tweet.author_id === userId) continue;

      // Extract image URLs from attachments
      const imageUrls: string[] = [];
      if (tweet.attachments?.media_keys) {
        for (const key of tweet.attachments.media_keys) {
          const url = mediaMap.get(key);
          if (url) imageUrls.push(url);
        }
      }

      mentions.push({
        id: tweet.id,
        text: tweet.text,
        authorId: tweet.author_id || "",
        authorUsername: users.get(tweet.author_id || "") || undefined,
        conversationId: tweet.conversation_id,
        inReplyToId: tweet.referenced_tweets?.find(
          (r) => r.type === "replied_to"
        )?.id,
        createdAt: tweet.created_at,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      });
    }
  }

  // newest ID for pagination
  const newestId =
    timeline.data?.meta?.newest_id || (mentions.length > 0 ? mentions[0].id : undefined);

  return { mentions, newestId };
}

/**
 * Fetch a single tweet by ID (for getting conversation context).
 */
export async function getTweet(
  tweetId: string
): Promise<{ text: string; authorId: string; authorUsername?: string; inReplyToId?: string } | null> {
  assertNotHalted("getTweet");
  try {
    const tweet = await getClient().v2.singleTweet(tweetId, {
      "tweet.fields": "author_id,conversation_id,referenced_tweets",
      expansions: "author_id",
      "user.fields": "username",
    });

    const username = tweet.includes?.users?.[0]?.username;
    const inReplyToId = tweet.data.referenced_tweets?.find(
      (r: any) => r.type === "replied_to"
    )?.id;

    return {
      text: tweet.data.text,
      authorId: tweet.data.author_id || "",
      authorUsername: username || undefined,
      inReplyToId,
    };
  } catch {
    return null;
  }
}

/**
 * Verify credentials are working.
 * Call this during setup to confirm API access.
 */
export async function verifyCredentials(): Promise<{
  id: string;
  username: string;
}> {
  assertNotHalted("verifyCredentials");
  const me = await getClient().v2.me();
  return { id: me.data.id, username: me.data.username };
}

/**
 * Search for recent popular tweets in ET's topic areas.
 */
export async function getTrendingContext(): Promise<string[]> {
  assertNotHalted("getTrendingContext");
  const queries = [
    "UFO OR UAP OR alien disclosure -is:retweet lang:en",
    "SETI OR exoplanet OR telescope discovery -is:retweet lang:en",
    "solana OR memecoin OR crypto -is:retweet lang:en",
  ];

  // Pick 1-2 random topic areas to search
  const shuffled = queries.sort(() => Math.random() - 0.5);
  const toSearch = shuffled.slice(0, 2);

  const trending: string[] = [];

  for (const query of toSearch) {
    try {
      const results = await getClient().v2.search(query, {
        max_results: 10,
        sort_order: "relevancy",
        "tweet.fields": "public_metrics,created_at",
      });

      if (results.data?.data) {
        // Pick tweets with decent engagement
        const popular = results.data.data
          .filter((t) => {
            const likes = t.public_metrics?.like_count || 0;
            return likes >= 10 && t.text.length > 30;
          })
          .slice(0, 3)
          .map((t) => t.text.replace(/https:\/\/t\.co\/\w+/g, "").trim());

        trending.push(...popular);
      }
    } catch (error) {
      console.warn(`[ET Trending] Search failed for query:`, error);
    }
  }

  return trending;
}

/**
 * Fetch recent tweets from a specific user by username.
 * Returns their most engaging recent tweets for ET to reply to.
 */
export async function getUserRecentTweets(
  username: string,
  maxResults: number = 10
): Promise<Array<{ id: string; text: string; likes: number; createdAt?: string }>> {
  assertNotHalted("getUserRecentTweets");
  try {
    // Use search API instead of userTimeline (more accessible on pay-per-use)
    const clean = username.replace(/^@/, "");
    const results = await getClient().v2.search(`from:${clean} -is:retweet -is:reply`, {
      max_results: Math.min(maxResults, 100),
      "tweet.fields": "public_metrics,created_at",
      sort_order: "recency",
    });

    if (!results.data?.data) return [];

    return results.data.data
      .map((t) => ({
        id: t.id,
        text: t.text.replace(/https:\/\/t\.co\/\w+/g, "").trim(),
        likes: t.public_metrics?.like_count || 0,
        createdAt: t.created_at,
      }))
      .filter((t) => t.text.length > 15);
      // Already sorted by recency from search API (sort_order: "recency")
  } catch (error) {
    console.warn(`[ET Targets] Failed to fetch tweets for @${username}:`, error);
    return [];
  }
}

/**
 * Batch-fetch recent tweets from multiple accounts in ONE API call.
 * Uses `from:user1 OR from:user2` query to minimize Twitter API usage.
 * Returns tweets grouped by author username.
 */
export async function batchGetRecentTweets(
  usernames: string[],
  maxResults: number = 10
): Promise<Map<string, Array<{ id: string; text: string; likes: number; createdAt?: string }>>> {
  const result = new Map<string, Array<{ id: string; text: string; likes: number; createdAt?: string }>>();

  if (usernames.length === 0) return result;
  assertNotHalted("batchGetRecentTweets");

  // Initialize empty arrays for all usernames
  const cleanNames = usernames.map(u => u.replace(/^@/, "").toLowerCase());
  for (const name of cleanNames) {
    result.set(name, []);
  }

  try {
    const fromQuery = cleanNames.map(u => `from:${u}`).join(" OR ");
    const query = `(${fromQuery}) -is:retweet -is:reply`;

    const searchResult = await getClient().v2.search(query, {
      max_results: Math.min(maxResults, 100),
      "tweet.fields": "public_metrics,created_at,author_id",
      expansions: "author_id",
      "user.fields": "username",
      sort_order: "recency",
    });

    if (!searchResult.data?.data) return result;

    // Build author_id → username map
    const authorMap = new Map<string, string>();
    if (searchResult.includes?.users) {
      for (const u of searchResult.includes.users) {
        authorMap.set(u.id, u.username.toLowerCase());
      }
    }

    // Group tweets by author
    for (const t of searchResult.data.data) {
      const author = authorMap.get(t.author_id || "") || "";
      if (!author || !result.has(author)) continue;

      const cleanText = t.text.replace(/https:\/\/t\.co\/\w+/g, "").trim();
      if (cleanText.length <= 15) continue;

      result.get(author)!.push({
        id: t.id,
        text: cleanText,
        likes: t.public_metrics?.like_count || 0,
        createdAt: t.created_at,
      });
    }

    return result;
  } catch (error) {
    console.warn(`[Notis] Batch search failed:`, error);
    return result;
  }
}

/**
 * Search for trending news tweets about UFOs, aliens, space discoveries, ancient findings.
 * Returns high-engagement tweets with links that ET can quote tweet or react to.
 */
export async function searchNewsTweets(): Promise<Array<{
  id: string;
  text: string;
  author: string;
  likes: number;
  retweets: number;
  hasLink: boolean;
}>> {
  assertNotHalted("searchNewsTweets");
  const queries = [
    "UFO sighting OR UAP footage OR alien discovery -is:retweet lang:en has:links",
    "UFO OR UAP congress OR disclosure hearing -is:retweet lang:en",
    "ancient discovery OR archaeological find OR ancient civilization -is:retweet lang:en has:links",
    "SETI signal OR exoplanet discovery OR radio telescope -is:retweet lang:en",
    "alien OR extraterrestrial evidence -from:NASA OR -from:Reuters OR -from:AP -is:retweet lang:en",
  ];

  // Pick 2 random queries
  const shuffled = queries.sort(() => Math.random() - 0.5);
  const toSearch = shuffled.slice(0, 2);

  const results: Array<{
    id: string;
    text: string;
    author: string;
    likes: number;
    retweets: number;
    hasLink: boolean;
  }> = [];

  for (const query of toSearch) {
    try {
      const searchResults = await getClient().v2.search(query, {
        max_results: 10,
        sort_order: "relevancy",
        "tweet.fields": "public_metrics,created_at,entities",
        expansions: "author_id",
        "user.fields": "username",
      });

      if (searchResults.data?.data) {
        const users = new Map<string, string>();
        if (searchResults.includes?.users) {
          for (const u of searchResults.includes.users) {
            users.set(u.id, u.username);
          }
        }

        for (const t of searchResults.data.data) {
          const likes = t.public_metrics?.like_count || 0;
          const retweets = t.public_metrics?.retweet_count || 0;
          if (likes >= 20 && t.text.length > 40) {
            results.push({
              id: t.id,
              text: t.text.replace(/https:\/\/t\.co\/\w+/g, "").trim(),
              author: users.get(t.author_id || "") || "unknown",
              likes,
              retweets,
              hasLink: !!(t.entities?.urls?.length),
            });
          }
        }
      }
    } catch (error) {
      console.warn(`[ET News] Search failed:`, error);
    }
  }

  // Sort by engagement
  return results
    .sort((a, b) => (b.likes + b.retweets * 3) - (a.likes + a.retweets * 3))
    .slice(0, 8);
}

/**
 * Fetch ET's own recent tweets with engagement metrics for learning.
 */
export async function getOwnTweetMetrics(): Promise<Array<{
  text: string;
  likes: number;
  retweets: number;
}>> {
  assertNotHalted("getOwnTweetMetrics");
  try {
    const results = await getClient().v2.search("from:etalienx -is:retweet -is:reply", {
      max_results: 50,
      "tweet.fields": "public_metrics,created_at",
      sort_order: "recency",
    });

    if (!results.data?.data) return [];

    return results.data.data
      .map(t => ({
        text: t.text.replace(/https:\/\/t\.co\/\w+/g, "").trim(),
        likes: t.public_metrics?.like_count || 0,
        retweets: t.public_metrics?.retweet_count || 0,
      }))
      .filter(t => t.text.length > 15);
  } catch (error) {
    console.warn("[ET Metrics] Failed to fetch own tweets:", error);
    return [];
  }
}

/**
 * Shadowban health check.
 * Searches for ET's own tweets in Twitter search.
 * If recent tweets aren't appearing in search results, we're likely shadowbanned.
 * 
 * Returns:
 *   status: "visible" | "restricted" | "search_banned" | "error"
 *   visibleCount: number of recent tweets visible in search
 *   note: explanation
 */
export async function checkShadowban(): Promise<{
  status: "visible" | "restricted" | "search_banned" | "error";
  visibleCount: number;
  note: string;
}> {
  assertNotHalted("checkShadowban");

  try {
    const results = await getClient().v2.search("from:etalienx", {
      max_results: 10,
      sort_order: "recency",
      "tweet.fields": "created_at",
    });

    trackRateLimit("search", (results as any).rateLimit);

    const count = results.data?.data?.length || 0;

    if (count >= 5) {
      return {
        status: "visible",
        visibleCount: count,
        note: `${count} recent tweets visible in search — no shadowban detected`,
      };
    } else if (count > 0) {
      return {
        status: "restricted",
        visibleCount: count,
        note: `Only ${count} tweets visible in search (expected 10+) — possible partial restriction`,
      };
    } else {
      return {
        status: "search_banned",
        visibleCount: 0,
        note: "0 tweets visible in search — likely search-banned or shadowbanned",
      };
    }
  } catch (error) {
    console.error("[Shadowban Check] Error:", error);
    return {
      status: "error",
      visibleCount: 0,
      note: `Check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
