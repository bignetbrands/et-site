import { NextResponse } from "next/server";
import {
  getScheduledTweets,
  removeScheduledTweetById,
  deleteScheduledImage,
  getScheduledImage,
  recordAction,
} from "@/lib/store";
import { postTweet, postTweetWithImage } from "@/lib/twitter";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/admin/scheduled — list all scheduled tweets
 * POST /api/admin/scheduled — cancel or publish now
 *   { action: "cancel", id: "..." }
 *   { action: "publish", id: "..." }
 */

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tweets = await getScheduledTweets();
  return NextResponse.json({
    scheduled: tweets.map(t => ({
      ...t,
      scheduledForISO: new Date(t.scheduledAt).toISOString(),
      hasImage: !!t.imageKey,
    })),
    count: tweets.length,
  });
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, id } = await request.json();

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (action === "cancel") {
    const removed = await removeScheduledTweetById(id);
    if (!removed) {
      return NextResponse.json({ error: "Scheduled tweet not found" }, { status: 404 });
    }
    if (removed.imageKey) {
      await deleteScheduledImage(removed.imageKey);
    }
    return NextResponse.json({
      success: true,
      action: "cancelled",
      cancelled: { id: removed.id, text: removed.text.substring(0, 60), pillar: removed.pillar },
    });
  }

  if (action === "publish") {
    const removed = await removeScheduledTweetById(id);
    if (!removed) {
      return NextResponse.json({ error: "Scheduled tweet not found" }, { status: 404 });
    }

    let tweetId: string;
    let hasImage = false;

    if (removed.imageKey) {
      try {
        const imageBuffer = await getScheduledImage(removed.imageKey);
        if (imageBuffer) {
          tweetId = await postTweetWithImage(removed.text, imageBuffer);
          hasImage = true;
        } else {
          tweetId = await postTweet(removed.text);
        }
      } catch {
        tweetId = await postTweet(removed.text);
      }
      await deleteScheduledImage(removed.imageKey);
    } else {
      tweetId = await postTweet(removed.text);
    }

    await recordAction();

    return NextResponse.json({
      success: true,
      action: "published",
      tweet: { id: tweetId, text: removed.text.substring(0, 60), pillar: removed.pillar, hasImage },
    });
  }

  return NextResponse.json({ error: "action must be 'cancel' or 'publish'" }, { status: 400 });
}
