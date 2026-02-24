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

/**
 * Post a text-only tweet.
 * Returns the tweet ID.
 */
export async function postTweet(text: string): Promise<string> {
  const response = await getClient().v2.tweet(text);
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
