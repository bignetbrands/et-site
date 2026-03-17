import { NextRequest, NextResponse } from "next/server";
import { getAllRiddles, getRiddleContext, markRiddleSolved, addToRewardsQueue } from "@/lib/store";
import { nanoid } from "nanoid";

function auth(req: NextRequest) {
  return req.headers.get("authorization") === `Bearer ${process.env.ADMIN_SECRET}`;
}

// GET — list all riddles
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const riddles = await getAllRiddles();
  return NextResponse.json({ riddles });
}

// POST — admin actions on riddles
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, tweetId, winner, walletAddress, winnerTweetUrl } = await req.json();

  if (action === "pick_winner") {
    if (!tweetId || !winner) {
      return NextResponse.json({ error: "Missing tweetId or winner" }, { status: 400 });
    }

    const riddle = await getRiddleContext(tweetId);
    if (!riddle) return NextResponse.json({ error: "Riddle not found" }, { status: 404 });

    // Mark riddle solved
    await markRiddleSolved(tweetId, winner);

    // If wallet provided, add to rewards queue
    if (walletAddress) {
      const tweetIdMatch = winnerTweetUrl?.match(/status\/(\d+)/);
      await addToRewardsQueue({
        id: nanoid(10),
        conversationId: tweetId,
        taskTweetId: tweetId,
        taskContext: `Riddle winner: "${riddle.question.substring(0, 100)}"`,
        winner: winner.replace(/^@/, ""),
        walletAddress,
        walletTweetId: tweetIdMatch?.[1] || "",
        submittedAt: new Date().toISOString(),
      });
      return NextResponse.json({ success: true, action: "winner_picked_and_queued" });
    }

    return NextResponse.json({ success: true, action: "winner_picked" });
  }

  if (action === "manual_add") {
    const { tweetUrl, question, answer } = await req.json().catch(() => ({}));
    if (!tweetUrl || !question || !answer) {
      return NextResponse.json({ error: "Missing tweetUrl, question, or answer" }, { status: 400 });
    }
    const tweetIdMatch = tweetUrl.match(/status\/(\d+)/);
    if (!tweetIdMatch) return NextResponse.json({ error: "Invalid tweet URL" }, { status: 400 });
    const tweetId = tweetIdMatch[1];
    const { setRiddleContext } = await import("@/lib/store");
    await setRiddleContext(tweetId, {
      tweetId,
      question: question.trim(),
      answer: answer.trim(),
      postedAt: new Date().toISOString(),
      solved: false,
    });
    return NextResponse.json({ success: true, tweetId });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
