import { NextResponse } from "next/server";
import {
  submitTarget,
  getTargets,
  checkSubmitRateLimit,
} from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/targets
 *
 * Public — returns current target leaderboard.
 */
export async function GET() {
  try {
    const targets = await getTargets();

    return NextResponse.json({
      targets: targets.map((t) => ({
        handle: t.handle,
        votes: t.votes,
        forced: t.forced || false,
        submittedAt: t.submittedAt,
      })),
      total: targets.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch targets" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/targets
 *
 * Community submission — submit or upvote a target handle.
 * Rate limited: 5 submissions per IP per hour.
 *
 * Body: { handle: "@username" }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const handle = body.handle;

    if (!handle || typeof handle !== "string") {
      return NextResponse.json(
        { error: "Missing handle" },
        { status: 400 }
      );
    }

    const clean = handle.replace(/^@/, "").toLowerCase().trim();

    // Basic validation
    if (!clean.match(/^[a-z0-9_]{1,30}$/)) {
      return NextResponse.json(
        { error: "Invalid X handle" },
        { status: 400 }
      );
    }

    // Don't allow targeting ET's own account
    if (clean === "etalienx") {
      return NextResponse.json(
        { error: "ET can't target himself. that's just a mirror." },
        { status: 400 }
      );
    }

    // Rate limit by IP
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const allowed = await checkSubmitRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: "Slow down — max 5 submissions per hour" },
        { status: 429 }
      );
    }

    const { target, isNew } = await submitTarget(clean);

    return NextResponse.json({
      success: true,
      handle: target.handle,
      votes: target.votes,
      isNew,
      message: isNew
        ? `@${target.handle} added to the target queue`
        : `+1 vote for @${target.handle} (${target.votes} total)`,
    });
  } catch (error) {
    console.error("[Targets] Submit error:", error);
    return NextResponse.json(
      { error: "Failed to submit target" },
      { status: 500 }
    );
  }
}
