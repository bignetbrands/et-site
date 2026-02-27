import { TwitterApi, type TwitterApiReadWrite } from "twitter-api-v2";

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
  const response = await getClient().v2.tweet(text);
  return response.data.id;
}

/**
 * Post a reply to a specific tweet.
 */
export async function postReply(
  text: string,
  replyToId: string
): Promise<string> {
  try {
    const response = await getClient().v2.tweet({
      text,
      reply: { in_reply_to_tweet_id: replyToId },
    });
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
  try {
    const response = await getClient().v2.tweet({
      text,
      quote_tweet_id: quoteTweetId,
    });
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
 * Fetch recent mentions of the authenticated user.
 * Returns mentions since the given ID (exclusive), or the most recent ones.
 */
export async function getMentions(
  sinceId?: string,
  maxResults: number = 20
): Promise<{ mentions: Mention[]; newestId?: string }> {
  // Get our own user ID first
  const me = await getClient().v2.me();
  const userId = me.data.id;

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
): Promise<{ text: string; authorId: string; authorUsername?: string } | null> {
  try {
    const tweet = await getClient().v2.singleTweet(tweetId, {
      "tweet.fields": "author_id,conversation_id",
      expansions: "author_id",
      "user.fields": "username",
    });

    const username = tweet.includes?.users?.[0]?.username;

    return {
      text: tweet.data.text,
      authorId: tweet.data.author_id || "",
      authorUsername: username || undefined,
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
  const me = await getClient().v2.me();
  return { id: me.data.id, username: me.data.username };
}

/**
 * Search for recent popular tweets in ET's topic areas.
 */
export async function getTrendingContext(): Promise<string[]> {
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
      .filter((t) => t.text.length > 15)
      .sort((a, b) => b.likes - a.likes);
  } catch (error) {
    console.warn(`[ET Targets] Failed to fetch tweets for @${username}:`, error);
    return [];
  }
}
