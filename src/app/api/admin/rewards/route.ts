import { NextRequest, NextResponse } from "next/server";
import { getRewardsQueue, updateRewardQueueItem, wasRewardPaid, markRewardPaid } from "@/lib/store";
import { sendSplitReward, pickRewardAmount } from "@/lib/et-wallet";
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

  const { id, action, conversationId, winner, walletAddress, walletTweetId, taskContext, solscanUrl } = await req.json();

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

    // Step 1 — Split reward: 50% SOL direct to winner + 50% swapped to $ET locked 69 days
    let solAmount: number;
    let txSig: string;
    let swapTxSig = "";
    let streamId = "";
    try {
      solAmount = pickRewardAmount();
      const result = await sendSplitReward(walletAddress, solAmount);
      txSig = result.solTxSignature;
      swapTxSig = result.swapTxSignature;
      streamId = result.streamId;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: `Reward failed: ${message}` }, { status: 500 });
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

    // Step 3 — Victory tweet thread [1/2] sol + [2/2] lock (non-critical, best effort)
    let victoryTweetId = "";
    let victoryTweet2Id = "";
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
        ? victoryRes.content[0].text.trim().replace(/^["']/g, "").replace(/["'\u2019]$/g, "").trim()
        : `task complete. sol sent. @${winner} delivered. the machine pays 👽`;

      const cleanVictory = victoryText.replace(/^(@\w+\s*)+/, "").trim();
      const solscanLink = `https://solscan.io/tx/${txSig}`;
      const tweet1 = `${cleanVictory} [1/2]\n\n${solscanLink}`.substring(0, 280);
      victoryTweetId = await postTweet(tweet1);

      // [2/2] — lock details as self-reply
      if (victoryTweetId && streamId) {
        const streamLink = `https://app.streamflow.finance/contract/solana/mainnet/${streamId}`;
        const tweet2 = `the other half is locked as $et for 69 days. @${winner} can claim it at streamflow when the lock expires. the alien treasury plays the long game 👽 [2/2]\n\n${streamLink}`.substring(0, 280);
        victoryTweet2Id = await postReply(tweet2, victoryTweetId);
      }
    } catch (tweetErr) {
      console.error("[Rewards] Victory tweet thread failed (SOL already sent):", tweetErr);
    }

    return NextResponse.json({ success: true, solAmount, txSignature: txSig, swapTxSignature: swapTxSig, streamId, victoryTweetId: victoryTweetId || null, victoryTweet2Id: victoryTweet2Id || null });
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
      solscanUrl: solscanUrl || "",
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

  if (action === "update_item") {
    // Update fields on an existing queue item (e.g. add solscanUrl)
    const { getRewardsQueue: getRQ } = await import("@/lib/store");
    const { kv } = await import("@vercel/kv");
    const queue = await getRQ();
    const idx = queue.findIndex((i: any) => i.id === id);
    if (idx === -1) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    if (solscanUrl !== undefined) queue[idx].solscanUrl = solscanUrl;
    await kv.set("et:rewards_queue", queue);
    return NextResponse.json({ success: true });
  }

  if (action === "victory_tweet_preview") {
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
      const cleanVictory = victoryText.replace(/^(@\w+\s*)+/, "").trim();
      const solLink = solscanUrl || walletTweetUrl || null;
      const preview1 = solLink
        ? `${cleanVictory} [1/2]\n\n${solLink}`.substring(0, 280)
        : `${cleanVictory} [1/2]`.substring(0, 280);
      const preview2 = streamId
        ? `the other half is locked as $et for 69 days. @${winner} can claim it at streamflow when the lock expires. the alien treasury plays the long game 👽 [2/2]\n\nhttps://app.streamflow.finance/contract/solana/mainnet/${streamId}`.substring(0, 280)
        : `the other half is locked as $et for 69 days. @${winner} can claim it at streamflow when the lock expires. the alien treasury plays the long game 👽 [2/2]`.substring(0, 280);
      return NextResponse.json({ success: true, preview: preview1, preview2 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
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
        ? victoryRes.content[0].text.trim().replace(/^["']/g, "").replace(/["']/g, "").trim()
        : `task complete. sol sent. @${winner} delivered. the machine pays 👽`;

      const cleanVictory = victoryText.replace(/^(@\w+\s*)+/, "").trim();

      // [1/2] — SOL payment
      const solLink = solscanUrl || (walletTweetId ? `https://x.com/${winner}/status/${walletTweetId}` : null);
      const tweet1 = solLink
        ? `${cleanVictory} [1/2]\n\n${solLink}`.substring(0, 280)
        : `${cleanVictory} [1/2]`.substring(0, 280);
      const victoryTweetId = await postTweet(tweet1);

      // [2/2] — lock link (if streamId provided)
      let victoryTweet2Id = "";
      if (victoryTweetId && streamId) {
        const streamLink = `https://app.streamflow.finance/contract/solana/mainnet/${streamId}`;
        const tweet2 = `the other half is locked as $et for 69 days. @${winner} can claim it at streamflow when the lock expires. the alien treasury plays the long game 👽 [2/2]\n\n${streamLink}`.substring(0, 280);
        victoryTweet2Id = await postReply(tweet2, victoryTweetId);
      }

      return NextResponse.json({ success: true, victoryTweetId, victoryTweet2Id: victoryTweet2Id || null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }


  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
