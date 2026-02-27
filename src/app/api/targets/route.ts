import { NextResponse } from "next/server";
import {
  addTarget,
  voteTarget,
  getTargets,
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
 * Community actions:
 *   action: "submit" (default) — add a new target to the queue
 *   action: "vote" — upvote an existing target
 *
 * Body: { handle: "@username", action?: "submit" | "vote" }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const handle = body.handle;
    const action = body.action || "submit";

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

    if (action === "vote") {
      const target = await voteTarget(clean);
      return NextResponse.json({
        success: true,
        handle: target.handle,
        votes: target.votes,
        message: `+1 vote for @${target.handle} (${target.votes} total)`,
      });
    }

    // Default: submit
    const { target, isNew } = await addTarget(clean);

    return NextResponse.json({
      success: true,
      handle: target.handle,
      votes: target.votes,
      isNew,
      message: isNew
        ? `@${target.handle} added to the target queue`
        : `@${target.handle} is already in the queue — vote it up!`,
    });
  } catch (error) {
    console.error("[Targets] Error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
