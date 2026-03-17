import { NextRequest, NextResponse } from "next/server";
import { getRewardsQueue, updateRewardQueueItem, wasRewardPaid, markRewardPaid } from "@/lib/store";
import { sendSol, pickRewardAmount } from "@/lib/et-wallet";
import { postTweet } from "@/lib/twitter";
import { buildVictoryTweetPrompt } from "@/lib/prompts";
import Anthropic from "@anthropic-ai/sdk";

function auth(req: NextRequest) {
  return req.headers.get("authorization") === `Bearer ${process.env.ADMIN_SECRET}`;
}

// GET — return the full rewards queue
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const queue = await getRewardsQueue();
  return NextResponse.json({ queue });
}

// POST — confirm or reject a reward
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, action, conversationId, winner, walletAddress, walletTweetId, taskContext } = await req.json();

  if (!id || !action) return NextResponse.json({ error: "Missing id or action" }, { status: 400 });

  if (action === "reject") {
    await updateRewardQueueItem(id, "rejected");
    return NextResponse.json({ success: true, action: "rejected" });
  }

  if (action === "confirm") {
    const alreadyPaid = await wasRewardPaid(conversationId);
    if (alreadyPaid) {
      await updateRewardQueueItem(id, "confirmed");
      return NextResponse.json({ success: false, error: "Already paid" });
    }
    if (!process.env.ET_WALLET_PRIVATE_KEY) {
      return NextResponse.json({ error: "ET_WALLET_PRIVATE_KEY not configured" }, { status: 500 });
    }

    // Step 1 — Send SOL (fail hard if this fails)
    let solAmount: number;
    let txSig: string;
    try {
      solAmount = pickRewardAmount();
      txSig = await sendSol(walletAddress, solAmount);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: `SOL transfer failed: ${message}` }, { status: 500 });
    }

    // Step 2 — Record payment immediately (before tweet, so it is never lost)
    await markRewardPaid({
      conversationId,
      winner,
      walletAddress,
      amount: solAmount,
      txSignature: txSig,
      walletTweetId,
      victoryTweetId: "",
      paidAt: new Date().toISOString(),
    });
    await updateRewardQueueItem(id, "confirmed");

    // Step 3 — Victory tweet (non-critical, best effort)
    let victoryTweetId = "";
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
      const victoryPrompt = buildVictoryTweetPrompt(winner, taskContext, solAmount, txSig);
      const victoryRes = await client.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 300,
        messages: [{ role: "user", content: victoryPrompt }],
        temperature: 0.9,
      });
      let victoryText = victoryRes.content[0].type === "text"
        ? victoryRes.content[0].text.trim().replace(/^["']/g, "").replace(/["']$/g, "").trim()
        : `task complete. ${solAmount} SOL sent to @${winner}. the machine pays 👽`;

      const walletTweetUrl = walletTweetId ? `https://x.com/${winner}/status/${walletTweetId}` : null;
      const fullVictory = walletTweetUrl
        ? `${victoryText}\n\n${walletTweetUrl}`.substring(0, 280)
        : victoryText.substring(0, 280);
      victoryTweetId = await postTweet(fullVictory);
    } catch (tweetErr) {
      console.error("[Rewards] Victory tweet failed (SOL already sent):", tweetErr);
    }

    return NextResponse.json({ success: true, solAmount, txSignature: txSig, victoryTweetId: victoryTweetId || null });
  }
  if (action === "manual_add") {
    // winner, walletAddress etc. already destructured from req.json() above
    if (!winner || !walletAddress) {
      return NextResponse.json({ error: "Missing winner or walletAddress" }, { status: 400 });
    }
    const { addToRewardsQueue } = await import("@/lib/store");
    const { nanoid } = await import("nanoid");
    const item = {
      id: nanoid(10),
      conversationId: `manual_${nanoid(6)}`,
      taskTweetId: walletTweetId || "",
      taskContext: taskContext || "manually added by admin",
      winner: winner.replace(/^@/, ""),
      walletAddress,
      walletTweetId: walletTweetId || "",
      submittedAt: new Date().toISOString(),
    };
    await addToRewardsQueue(item);
    return NextResponse.json({ success: true, item });
  }

  if (action === "mark_paid") {
    // Mark item as confirmed without sending SOL (for cases where SOL already sent but record failed)
    await updateRewardQueueItem(id, "confirmed");
    return NextResponse.json({ success: true });
  }

  if (action === "victory_tweet") {
    if (!winner) return NextResponse.json({ error: "Missing winner" }, { status: 400 });
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
      const victoryPrompt = buildVictoryTweetPrompt(winner, taskContext || "completed the mission", 0, "");
      const victoryRes = await client.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 300,
        messages: [{ role: "user", content: victoryPrompt }],
        temperature: 0.9,
      });
      let victoryText = victoryRes.content[0].type === "text"
        ? victoryRes.content[0].text.trim().replace(/^["']/g, "").replace(/["']$/g, "").trim()
        : `mission complete. SOL sent to @${winner}. the machine pays 👽`;

      const walletTweetUrl = walletTweetId ? `https://x.com/${winner}/status/${walletTweetId}` : null;
      const fullVictory = walletTweetUrl
        ? `${victoryText}\n\n${walletTweetUrl}`.substring(0, 280)
        : victoryText.substring(0, 280);
      const victoryTweetId = await postTweet(fullVictory);
      return NextResponse.json({ success: true, victoryTweetId });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
