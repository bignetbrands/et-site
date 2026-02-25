import { NextResponse } from "next/server";
import {
  forceTarget,
  removeTarget,
  getNextTarget,
} from "@/lib/store";
import { interactWithTarget } from "@/lib/orchestrator";
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

      default:
        return NextResponse.json(
          { error: "Invalid action. Use: force, interact, remove" },
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
