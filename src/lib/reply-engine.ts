/**
 * reply-engine.ts
 *
 * ALL reply intelligence lives here. Every code path that generates an ET reply
 * calls decideReply() — autonomous cron, Target Queue, watchlist, manual force reply.
 *
 * The paths differ only in:
 *   - How they fetch the tweet (already done before calling here)
 *   - How they post the result (handled by the caller)
 *
 * decideReply() owns:
 *   - Financial advisor troll detection → meme image reply
 *   - Face swap detection → ET face swap image reply
 *   - Video blindness injection → warns Claude it can't watch videos
 *   - Task thread context injection → prevents duplicate task assignment
 *   - Wallet address detection → adds to rewards queue
 *   - Community task tweet generation → posts standalone task + reply with link
 *   - Manual reply detection → skip if admin claimed thread
 *   - Claude text reply generation
 */

import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, REPLY_SYSTEM_PROMPT, buildReplyPrompt, buildTaskTweetPrompt } from "./prompts";
import { generateReply } from "./claude";
import { postTweet, postReply, postReplyWithImage } from "./twitter";
import {
  isTaskThread,
  markTaskThread,
  setPendingReward,
  getPendingReward,
  wasRewardPaid,
  addToRewardsQueue,
  getRiddleContext,
} from "./store";
import {
  isFinancialAdvisorMention,
  isAlphaRequest,
  getRandomETMeme,
  getFinancialTrollText,
  getAlphaText,
  generateFaceSwap,
} from "./meme-engine";
import { nanoid } from "nanoid";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReplyInput {
  // Core tweet data
  tweetId: string;
  tweetText: string;
  authorUsername: string;
  imageUrls?: string[];         // images on the mention itself
  parentImageUrls?: string[];   // images from parent tweets (thread walk)
  hasVideo?: boolean;

  // Thread context
  conversationId?: string;
  conversationContext?: string; // assembled [USER]/[YOU] thread text
  threadDepth?: number;
  isManuallyClaimedThread?: boolean; // admin replied directly in thread

  // Self-awareness context from ET's reflection system
  selfAwarenessContext?: string;
}

export interface ReplyDecision {
  type: "text" | "image" | "skip";
  // For text replies
  text?: string;
  // For image replies
  imageBuffer?: Buffer;
  imageCaption?: string;        // text posted alongside image (can be empty string)
  // For skips
  skipReason?: string;
  // Side effects the caller should execute
  sideEffects?: ReplyDecision_SideEffects;
}

export interface ReplyDecision_SideEffects {
  markTaskThread?: boolean;
  taskContext?: string;
  taskTweetId?: string;         // set after posting the standalone task tweet
  addToRewardsQueue?: {
    conversationId: string;
    walletAddress: string;
    walletTweetId: string;
    taskTweetId: string;
    taskContext: string;
    winner: string;
  };
  acknowledgeWalletReceipt?: boolean; // ET should ack the wallet submission in thread
}

// Known non-wallet Solana addresses to filter out
const KNOWN_NON_WALLET_ADDRESSES = new Set([
  "A1NZ4kjhJxdmMMHQTGF8HaU7k6JCch5gSyHEeAKE3xRMF",
  "So11111111111111111111111111111111111111112",
  "11111111111111111111111111111111",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
]);

function extractWalletAddress(text: string): string | null {
  const matches = text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g) || [];
  for (const match of matches) {
    if (!KNOWN_NON_WALLET_ADDRESSES.has(match) && match.length >= 32) return match;
  }
  return null;
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Decide what ET should reply with.
 * Contains ALL reply intelligence. Callers just fetch the tweet and post the result.
 */
export async function decideReply(input: ReplyInput): Promise<ReplyDecision> {
  const {
    tweetId,
    tweetText,
    authorUsername,
    imageUrls,
    parentImageUrls,
    hasVideo,
    conversationId,
    conversationContext,
    threadDepth = 0,
    isManuallyClaimedThread = false,
  } = input;

  let { selfAwarenessContext } = input;

  // ── 1. SKIP — thread manually claimed by admin ─────────────────────────────
  if (isManuallyClaimedThread) {
    return { type: "skip", skipReason: "Thread manually claimed (admin replied directly)" };
  }

  // ── 2. FINANCIAL ADVISOR TROLL ─────────────────────────────────────────────
  if (isFinancialAdvisorMention(tweetText)) {
    try {
      const memeBuffer = await getRandomETMeme();
      if (memeBuffer) {
        return {
          type: "image",
          imageBuffer: memeBuffer,
          imageCaption: getFinancialTrollText(),
        };
      }
    } catch (e) {
      console.warn("[ReplyEngine] Financial troll image failed, falling through:", e);
    }
    // Fall through to text reply if image fetch fails
  }

  // ── 3. ALPHA / CA REQUEST — meme from library + bio callout ──────────────────
  if (isAlphaRequest(tweetText)) {
    try {
      const memeBuffer = await getRandomETMeme();
      if (memeBuffer) {
        return {
          type: "image",
          imageBuffer: memeBuffer,
          imageCaption: getAlphaText(),
        };
      }
    } catch (e) {
      console.warn("[ReplyEngine] Alpha meme fetch failed, falling through:", e);
    }
    // Fall through to text reply if image fetch fails
  }

  // ── 4. FACE SWAP — keyword-gated, only when explicitly requested ────────────
  // User must explicitly ask ET to insert himself / photobomb / swap faces + have a photo attached
  const FACE_SWAP_KEYWORDS = /\b(put yourself|insert yourself|photobomb|face swap|swap.*face|face.*swap|join this|get in (this|here)|where.*you in this|spot yourself|add yourself|you should be in|you.*belong in|you.*in this photo|place yourself|jump in (this|here))\b/i;
  const hasFaceSwapRequest = FACE_SWAP_KEYWORDS.test(tweetText);
  const photoUrl = imageUrls?.[0] || (!hasVideo ? parentImageUrls?.[0] : undefined);

  if (hasFaceSwapRequest && photoUrl && !hasVideo && !isFinancialAdvisorMention(tweetText) && !isAlphaRequest(tweetText)) {
    try {
      const swappedBuffer = await generateFaceSwap(photoUrl);
      if (swappedBuffer) {
        const emojis = ["👽", "👁️", "🫠", "💀", "👽👽", "🛸"];
        return {
          type: "image",
          imageBuffer: swappedBuffer,
          imageCaption: emojis[Math.floor(Math.random() * emojis.length)],
        };
      }
    } catch (e) {
      console.warn("[ReplyEngine] Face swap failed, falling through:", e);
    }
  }

  // ── 4. BUILD CONTEXT FOR CLAUDE ────────────────────────────────────────────

  // Video blindness — inject warning so ET doesn't hallucinate video content
  if (hasVideo) {
    const videoNote = "\n\n⚠️ [VIDEO ATTACHED] The person posted a video. You CANNOT watch videos — you can only see the static thumbnail preview image. Do NOT describe, interpret, or make claims about what happens in the video. Acknowledge you can't watch it, or ask what's in it. Never pretend you saw the video content.";
    selfAwarenessContext = (selfAwarenessContext || "") + videoNote;
  }

  // Task thread context — prevents creating duplicate tasks
  if (conversationId && await isTaskThread(conversationId)) {
    const taskNote = `\n\n⚠️ [TASK THREAD] You already assigned a task/mission earlier in this thread. DO NOT create another task. Answer the person's follow-up question.\n\nIf they ask HOW MUCH SOL / what's the reward:\n- NEVER give a specific number. Troll them: "FAFO 👽" / "complete the mission and find out" / "enough to make your wallet smile. or cry." / "you humans always want to negotiate before doing the work 😭"\n\nIf they say they'll do it: hype them. "mission accepted. clock is ticking 👽"\nIf they ask for clarification: be helpful and direct.`;
    selfAwarenessContext = (selfAwarenessContext || "") + taskNote;
  }

  // ── 4b. RIDDLE CONTEXT — ET acknowledges replies but never picks a winner ─────
  // Admin picks the winner manually in /bot. ET just engages with the replies.
  if (conversationId) {
    const riddle = await getRiddleContext(conversationId);
    if (riddle && !riddle.solved) {
      const riddleNote = `\n\n⚠️ [RIDDLE THREAD] You posted a riddle/challenge on this thread.\n\nYOUR RIDDLE: "${riddle.question}"\n\nYou know the answer but the admin (not you) will decide the winner. Your job is to:\n- Engage with replies naturally and stay in character\n- If their answer seems close or correct → be intrigued, say something like "interesting..." or "you might be onto something" — but DO NOT declare them winner or tell them to drop their wallet\n- If their answer is clearly wrong → troll gently or give a cryptic nudge without revealing the answer\n- Never reveal the correct answer\n- Never say "you win" or "drop your wallet" — the admin decides\n\nKeep the mystery alive. Build suspense.`;
      selfAwarenessContext = (selfAwarenessContext || "") + riddleNote;
    } else if (riddle && riddle.solved && riddle.solvedBy) {
      const solvedNote = `\n\n⚠️ [RIDDLE CLOSED] Admin has already picked a winner (@${riddle.solvedBy}) for this riddle. The challenge is over. If someone else tries to answer, let them know the winner was already chosen — but be warm about it.`;
      selfAwarenessContext = (selfAwarenessContext || "") + solvedNote;
    }
  }

  // ── 5. GENERATE CLAUDE TEXT REPLY ──────────────────────────────────────────
  const replyText = await generateReply(
    tweetText,
    authorUsername,
    conversationContext,
    imageUrls,
    threadDepth,
    selfAwarenessContext,
    forceReply,
  );

  if (!replyText || replyText.trim().toUpperCase() === "SKIP") {
    return { type: "skip", skipReason: "Claude returned empty or SKIP" };
  }

  // ── 6. SIDE EFFECTS — task detection + wallet detection ────────────────────
  const sideEffects: ReplyDecision_SideEffects = {};

  const taskSignalInReply = /\b(task is (live|incoming|posted|coming)|watch the timeline|just posted it|check my timeline|community task|mission (is )?(live|posted|incoming))\b/i.test(replyText);
  const taskAssigned = /\b(mission|task|SOL reward|gets? SOL|send SOL|hours|clip.*tag|film.*tag|screenshot.*tag|post.*tag|make it rain|i'll send|i will send|drop your wallet|post your wallet|send.*wallet|wallet.*address|if you.*paid|getting paid|you're getting paid|you get paid|pay you|send you|i'll pay|i will pay|reward|bounty|you.*earned|you.*win|winner|you.*got it|you qualify|that counts|proof.*wallet|wallet.*proof)\b/i.test(replyText);

  if ((taskAssigned || taskSignalInReply) && conversationId) {
    sideEffects.markTaskThread = true;
    sideEffects.taskContext = replyText.substring(0, 200);

    if (taskSignalInReply) {
      // Generate and post a community-wide standalone task tweet
      try {
        const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
        const taskPrompt = buildTaskTweetPrompt(`${tweetText} | ET reply: ${replyText}`);
        const taskRes = await anthropicClient.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: taskPrompt }],
          temperature: 0.9,
        });
        const taskTweetText = taskRes.content[0].type === "text"
          ? taskRes.content[0].text.trim().replace(/^["']|["']$/g, "").trim()
          : "";
        if (taskTweetText && taskTweetText.length <= 280) {
          const taskTweetId = await postTweet(taskTweetText);
          sideEffects.taskTweetId = taskTweetId;
        }
      } catch (e) {
        console.warn("[ReplyEngine] Community task tweet failed:", e);
      }
    }
  }

  // Wallet address detection — add to rewards queue
  if (conversationId) {
    const walletAddress = extractWalletAddress(tweetText);
    if (walletAddress) {
      const [alreadyPaid, pendingReward] = await Promise.all([
        wasRewardPaid(conversationId),
        getPendingReward(conversationId),
      ]);
      if (!alreadyPaid && pendingReward) {
        sideEffects.addToRewardsQueue = {
          conversationId,
          walletAddress,
          walletTweetId: tweetId,
          taskTweetId: pendingReward.promiseTweetId,
          taskContext: pendingReward.taskContext,
          winner: authorUsername,
        };
        sideEffects.acknowledgeWalletReceipt = true;
      }
    }
  }

  return {
    type: "text",
    text: replyText,
    sideEffects: Object.keys(sideEffects).length > 0 ? sideEffects : undefined,
  };
}

/**
 * Execute the side effects from a reply decision.
 * Call this AFTER successfully posting the reply.
 */
export async function executeSideEffects(
  decision: ReplyDecision,
  postedReplyId: string,
  tweetId: string,
  authorUsername: string,
): Promise<void> {
  const fx = decision.sideEffects;
  if (!fx) return;

  if (fx.markTaskThread && fx.taskContext) {
    const { conversationId } = fx.addToRewardsQueue || {};
    // Mark task thread using the conversation ID from rewards queue entry or from caller
    const convId = conversationId || tweetId; // fallback
    await markTaskThread(convId);
    await setPendingReward(convId, {
      taskContext: fx.taskContext,
      promiseTweetId: fx.taskTweetId || postedReplyId,
    });

    // Link the standalone task tweet back to the thread
    if (fx.taskTweetId) {
      try {
        const taskLink = `https://x.com/etalienx/status/${fx.taskTweetId}`;
        await postReply(`task is live 👽 ${taskLink}`, postedReplyId);
      } catch (e) {
        console.warn("[ReplyEngine] Failed to post task link reply:", e);
      }
    }
  }

  if (fx.addToRewardsQueue) {
    const q = fx.addToRewardsQueue;
    await addToRewardsQueue({
      id: nanoid(10),
      conversationId: q.conversationId,
      taskTweetId: q.taskTweetId,
      taskContext: q.taskContext,
      winner: q.winner,
      walletAddress: q.walletAddress,
      walletTweetId: q.walletTweetId,
      submittedAt: new Date().toISOString(),
    });
  }

  if (fx.acknowledgeWalletReceipt) {
    const acks = [
      "got it. in the queue 👽",
      "received. reviewing 👽",
      "noted. i'll pick the winner 👽",
      "wallet logged. checking the field.",
      "got your submission 👽",
    ];
    try {
      await postReply(acks[Math.floor(Math.random() * acks.length)], tweetId);
    } catch (e) {
      console.warn("[ReplyEngine] Wallet ack reply failed:", e);
    }
  }
}
