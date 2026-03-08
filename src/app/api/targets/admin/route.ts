import { NextResponse } from "next/server";
import {
  forceTarget,
  removeTarget,
  getNextTarget,
} from "@/lib/store";
import { interactWithTarget, replyToSpecificTweet } from "@/lib/orchestrator";
import { isKillSwitchActive } from "@/lib/kill-switch";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/targets/admin
 *
 * Admin actions on targets.
 *
 * Body:
 *   action: "force" | "interact" | "remove"
 *   handle: string (required for force/remove, optional for interact)
 *   secret: string (ADMIN_SECRET)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, handle, secret } = body;

    if (secret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    switch (action) {
      case "force": {
        // Force-add a target to front of queue
        if (!handle) {
          return NextResponse.json({ error: "Missing handle" }, { status: 400 });
        }
        const target = await forceTarget(handle);
        return NextResponse.json({
          success: true,
          action: "forced",
          target: { handle: target.handle, votes: target.votes, forced: true },
        });
      }

      case "interact": {
        // Interact with a specific handle or the next in queue
        if (await isKillSwitchActive()) {
          return NextResponse.json({
            error: "Kill switch active — resume ET first",
          }, { status: 400 });
        }

        let targetHandle = handle?.replace(/^@/, "").toLowerCase().trim();

        if (!targetHandle) {
          // Get next from queue
          const next = await getNextTarget();
          if (!next) {
            return NextResponse.json({
              success: false,
              error: "No targets in queue",
            });
          }
          targetHandle = next.handle;
        }

        const result = await interactWithTarget(targetHandle);
        return NextResponse.json({
          handle: targetHandle,
          ...result,
        });
      }

      case "remove": {
        if (!handle) {
          return NextResponse.json({ error: "Missing handle" }, { status: 400 });
        }
        await removeTarget(handle);
        return NextResponse.json({
          success: true,
          action: "removed",
          handle: handle.replace(/^@/, "").toLowerCase().trim(),
        });
      }

      case "reply": {
        // Reply to a specific tweet by URL
        if (await isKillSwitchActive()) {
          return NextResponse.json({
            error: "Kill switch active — resume ET first",
          }, { status: 400 });
        }

        const tweetUrl = body.tweetUrl || body.handle; // accept either field
        if (!tweetUrl) {
          return NextResponse.json({ error: "Missing tweetUrl" }, { status: 400 });
        }

        const result = await replyToSpecificTweet(tweetUrl);
        return NextResponse.json(result);
      }

      case "dryReply": {
        // Preview reply without posting
        const dryUrl = body.tweetUrl || body.handle;
        if (!dryUrl) {
          return NextResponse.json({ error: "Missing tweetUrl" }, { status: 400 });
        }

        const dryResult = await replyToSpecificTweet(dryUrl, true);
        return NextResponse.json(dryResult);
      }

      case "postPreview": {
        // Post a pre-generated reply text to a specific tweet
        if (await isKillSwitchActive()) {
          return NextResponse.json({
            error: "Kill switch active — resume ET first",
          }, { status: 400 });
        }

        const previewUrl = body.tweetUrl;
        const previewText = body.replyText;
        if (!previewUrl || !previewText) {
          return NextResponse.json({ error: "Missing tweetUrl or replyText" }, { status: 400 });
        }

        // Extract tweet ID
        const { postReply, postQuoteTweet, postTweet } = await import("@/lib/twitter");
        const { markTweetQuoted, recordBotPostedTweet, recordAction } = await import("@/lib/store");
        
        const idMatch2 = previewUrl.match(/status\/(\d+)/);
        const tid = idMatch2 ? idMatch2[1] : previewUrl.replace(/\D/g, "");

        // Try reply → quote → standalone (same fallback chain)
        try {
          const rid = await postReply(previewText, tid);
          await markTweetQuoted(tid);
          await recordBotPostedTweet(rid);
          await recordAction();
          return NextResponse.json({ success: true, tweetId: tid, replyText: previewText, replyId: rid, method: "reply" });
        } catch (e: any) {
          if (e?.data?.status === 403 || e?.code === 403) {
            try {
              const qtId = await postQuoteTweet(previewText, tid);
              await markTweetQuoted(tid);
              await recordBotPostedTweet(qtId);
              await recordAction();
              return NextResponse.json({ success: true, tweetId: tid, replyText: previewText, replyId: qtId, method: "quote" });
            } catch {
              const link = `https://x.com/i/status/${tid}`;
              const max = 280 - 23 - 4;
              const trimmed = previewText.length > max ? previewText.substring(0, max - 3) + "..." : previewText;
              const stId = await postTweet(`${trimmed}\n\n${link}`);
              await markTweetQuoted(tid);
              await recordBotPostedTweet(stId);
              await recordAction();
              return NextResponse.json({ success: true, tweetId: tid, replyText: trimmed, replyId: stId, method: "standalone" });
            }
          }
          return NextResponse.json({ success: false, error: `Reply failed: ${e?.message || e}` });
        }
      }

      default:
        return NextResponse.json(
          { error: "Invalid action. Use: force, interact, remove, reply" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("[Targets Admin] Error:", error);
    return NextResponse.json(
      { error: `Error: ${error instanceof Error ? error.message : "Unknown"}` },
      { status: 500 }
    );
  }
}
