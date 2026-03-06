import { NextResponse } from "next/server";
import { getScheduledTweets, removeScheduledTweet, deleteScheduledImage } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/scheduled — list all scheduled tweets
 * POST /api/admin/scheduled — cancel a scheduled tweet { action: "cancel", id: "..." }
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

  if (action !== "cancel" || !id) {
    return NextResponse.json({ error: "action: 'cancel' and id required" }, { status: 400 });
  }

  const tweets = await getScheduledTweets();
  const target = tweets.find(t => t.id === id);

  if (!target) {
    return NextResponse.json({ error: "Scheduled tweet not found" }, { status: 404 });
  }

  // Clean up stored image if exists
  if (target.imageKey) {
    await deleteScheduledImage(target.imageKey);
  }

  await removeScheduledTweet(target);

  return NextResponse.json({
    success: true,
    cancelled: { id: target.id, text: target.text.substring(0, 60), pillar: target.pillar },
  });
}
