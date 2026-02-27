import { NextResponse } from "next/server";
import { ContentPillar } from "@/types";
import { PILLAR_CONFIGS } from "@/lib/prompts";
import { executeTweet, dryRun } from "@/lib/orchestrator";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const VALID_PILLARS = Object.keys(PILLAR_CONFIGS) as ContentPillar[];

/**
 * POST /api/manual/tweet
 *
 * Manual tweet trigger for testing and overrides.
 *
 * Body:
 *   pillar: ContentPillar (required)
 *   dryRun: boolean (optional, default false)
 *
 * Protected by ADMIN_SECRET.
 */
export async function POST(request: Request) {
  // Auth check
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const pillar = body.pillar as ContentPillar;
    const isDryRun = body.dryRun === true;
    const previewText = body.text as string | undefined;
    const previewImageUrl = body.imageUrl as string | undefined;
    const scheduleHours = body.scheduleHours as number | undefined;

    // Validate pillar
    if (!pillar || !VALID_PILLARS.includes(pillar)) {
      return NextResponse.json(
        {
          error: "Invalid pillar",
          validPillars: VALID_PILLARS,
        },
        { status: 400 }
      );
    }

    if (isDryRun) {
      // Generate without posting
      const result = await dryRun(pillar);
      return NextResponse.json({
        mode: "dry_run",
        tweet: result.text,
        pillar: result.pillar,
        imageUrl: result.imageUrl || null,
        rawImageUrl: result.rawImageUrl || result.imageUrl || null,
        charCount: result.text.length,
        timestamp: new Date().toISOString(),
      });
    }

    // If preview text is provided, post or schedule that exact tweet
    if (previewText) {
      // Schedule for later
      if (scheduleHours && scheduleHours > 0) {
        const { scheduletweet, storeScheduledImage } = await import("@/lib/store");
        const { downloadImage } = await import("@/lib/dalle");
        const scheduledAt = Date.now() + scheduleHours * 60 * 60 * 1000;
        const scheduledDate = new Date(scheduledAt);
        const tweetId = `sched_${Date.now()}`;

        // Download and store image now (DALL-E URLs expire in ~1hr)
        let imageKey: string | undefined;
        if (previewImageUrl) {
          try {
            const imageBuffer = await downloadImage(previewImageUrl, pillar);
            imageKey = await storeScheduledImage(tweetId, imageBuffer);
            console.log(`[ET Schedule] Stored image (${Math.round(imageBuffer.length / 1024)}KB) for ${tweetId}`);
          } catch (e) {
            console.error("[ET Schedule] Failed to store image:", e);
          }
        }

        await scheduletweet({
          id: tweetId,
          text: previewText,
          pillar,
          imageKey,
          scheduledAt,
          createdAt: new Date().toISOString(),
        });

        return NextResponse.json({
          mode: "scheduled",
          scheduledFor: scheduledDate.toISOString(),
          hoursFromNow: scheduleHours,
          tweet: previewText,
          pillar,
          hasImage: !!imageKey,
          charCount: previewText.length,
          timestamp: new Date().toISOString(),
        });
      }

      // Post immediately
      const { postTweet, postTweetWithImage } = await import("@/lib/twitter");
      const { downloadImage } = await import("@/lib/dalle");
      const { recordTweet } = await import("@/lib/store");

      let tweetId: string;
      let hasImage = false;

      if (previewImageUrl) {
        try {
          const imageBuffer = await downloadImage(previewImageUrl, pillar);
          tweetId = await postTweetWithImage(previewText, imageBuffer);
          hasImage = true;
        } catch {
          // Fallback to text-only if image download fails
          tweetId = await postTweet(previewText);
        }
      } else {
        tweetId = await postTweet(previewText);
      }

      // Record it
      await recordTweet({
        id: tweetId,
        text: previewText,
        pillar,
        postedAt: new Date().toISOString(),
        hasImage,
      });

      return NextResponse.json({
        mode: "posted",
        tweet: {
          id: tweetId,
          text: previewText,
          pillar,
          hasImage,
          charCount: previewText.length,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Force post (generate new)
    const record = await executeTweet(pillar);

    if (!record) {
      return NextResponse.json(
        { error: "Tweet generation or posting failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      mode: "posted",
      tweet: {
        id: record.id,
        text: record.text,
        pillar: record.pillar,
        hasImage: record.hasImage,
        charCount: record.text.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[ET Manual] Error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Internal server error: ${msg}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/manual/tweet
 *
 * Returns available pillars and current state.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    pillars: VALID_PILLARS.map((p) => ({
      id: p,
      name: PILLAR_CONFIGS[p].name,
      model: PILLAR_CONFIGS[p].model,
      generatesImage: PILLAR_CONFIGS[p].generateImage,
      dailyTarget: PILLAR_CONFIGS[p].dailyTarget,
    })),
    usage: {
      endpoint: "POST /api/manual/tweet",
      body: {
        pillar: "human_observation | research_drop | crypto_community | personal_lore | existential | disclosure_conspiracy",
        dryRun: "boolean (optional)",
      },
    },
  });
}
