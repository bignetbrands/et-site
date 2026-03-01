import { NextResponse } from "next/server";
import {
  addWatchlistAccount,
  removeWatchlistAccount,
  getWatchlist,
} from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/notis — List all watchlist accounts
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await getWatchlist();
  return NextResponse.json({
    accounts,
    count: accounts.length,
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/notis — Add or remove watchlist accounts
 *
 * Body:
 *   action: "add" | "remove"
 *   handle: string (@username)
 *   note?: string (optional, for "add" only)
 *   secret: string (ADMIN_SECRET)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, handle, note, secret } = body;

    if (secret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!handle) {
      return NextResponse.json({ error: "Missing handle" }, { status: 400 });
    }

    switch (action) {
      case "add": {
        const account = await addWatchlistAccount(handle, note);
        const all = await getWatchlist();
        console.log(`[Notis] Added @${account.handle} to watchlist (total: ${all.length})`);
        return NextResponse.json({
          success: true,
          action: "added",
          account,
          total: all.length,
        });
      }

      case "remove": {
        await removeWatchlistAccount(handle);
        const all = await getWatchlist();
        console.log(`[Notis] Removed @${handle.replace(/^@/, "").toLowerCase()} from watchlist (total: ${all.length})`);
        return NextResponse.json({
          success: true,
          action: "removed",
          handle: handle.replace(/^@/, "").toLowerCase().trim(),
          total: all.length,
        });
      }

      default:
        return NextResponse.json(
          { error: "Invalid action. Use: add, remove" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("[Notis] Error:", error);
    return NextResponse.json(
      { error: `Error: ${error instanceof Error ? error.message : "Unknown"}` },
      { status: 500 }
    );
  }
}
