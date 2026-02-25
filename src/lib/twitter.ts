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
  const response = await getClient().v2.tweet({
    text,
    reply: { in_reply_to_tweet_id: replyToId },
  });
  return response.data.id;
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
    "tweet.fields": "created_at,conversation_id,in_reply_to_user_id,author_id,referenced_tweets",
    expansions: "author_id",
    "user.fields": "username",
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

  const mentions: Mention[] = [];
  if (timeline.data?.data) {
    for (const tweet of timeline.data.data) {
      // Skip our own tweets (self-mentions)
      if (tweet.author_id === userId) continue;

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
