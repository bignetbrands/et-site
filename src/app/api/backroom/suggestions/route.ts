import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const dynamic = "force-dynamic";

const SUGGESTIONS_KEY = "et:backroom:suggestions";

export interface Suggestion {
  id: string;
  text: string;           // ET's processed version of the suggestion
  originalText: string;   // what the user actually said
  status: "pending" | "acknowledged" | "implemented" | "rejected";
  votes: number;
  submittedAt: string;
  submittedBy: string;    // wallet address or "anon"
}

/** GET /api/backroom/suggestions — list all suggestions */
export async function GET() {
  try {
    const suggestions = await kv.get<Suggestion[]>(SUGGESTIONS_KEY) || [];
    // Sort by votes descending
    suggestions.sort((a, b) => b.votes - a.votes);
    return NextResponse.json({ suggestions });
  } catch (e) {
    console.error("[Backroom] Failed to load suggestions:", e);
    return NextResponse.json({ suggestions: [] });
  }
}

/** POST /api/backroom/suggestions — submit or vote */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "submit") {
      const { text, processedText, submittedBy } = body;
      if (!text || !processedText) {
        return NextResponse.json({ error: "Missing text" }, { status: 400 });
      }

      const suggestions = await kv.get<Suggestion[]>(SUGGESTIONS_KEY) || [];

      // Max 50 suggestions
      if (suggestions.length >= 50) {
        return NextResponse.json({ error: "Suggestion board is full. Vote on existing ones!" }, { status: 400 });
      }

      const suggestion: Suggestion = {
        id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        text: processedText,
        originalText: text,
        status: "pending",
        votes: 1, // auto-vote by submitter
        submittedAt: new Date().toISOString(),
        submittedBy: submittedBy || "anon",
      };

      suggestions.push(suggestion);
      await kv.set(SUGGESTIONS_KEY, suggestions);

      return NextResponse.json({ success: true, suggestion });
    }

    if (action === "vote") {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "Missing suggestion id" }, { status: 400 });

      const suggestions = await kv.get<Suggestion[]>(SUGGESTIONS_KEY) || [];
      const idx = suggestions.findIndex(s => s.id === id);
      if (idx === -1) return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });

      suggestions[idx].votes += 1;
      await kv.set(SUGGESTIONS_KEY, suggestions);

      return NextResponse.json({ success: true, votes: suggestions[idx].votes });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    console.error("[Backroom] Error:", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
