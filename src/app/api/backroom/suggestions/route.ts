import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const dynamic = "force-dynamic";

const SUGGESTIONS_KEY = "et:backroom:suggestions";

export interface Suggestion {
  id: string;
  text: string;
  originalText: string;
  status: "pending" | "acknowledged" | "implemented" | "rejected";
  votes: number;
  voters: string[];
  submittedAt: string;
  submittedBy: string;
}

export async function GET() {
  try {
    const suggestions = await kv.get<Suggestion[]>(SUGGESTIONS_KEY) || [];
    suggestions.sort((a, b) => b.votes - a.votes);
    return NextResponse.json({ suggestions });
  } catch (e) {
    console.error("[Backroom] Failed to load suggestions:", e);
    return NextResponse.json({ suggestions: [] });
  }
}

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
      if (suggestions.length >= 50) {
        return NextResponse.json({ error: "Suggestion board is full." }, { status: 400 });
      }

      const voterId = submittedBy || "anon";
      const suggestion: Suggestion = {
        id: `sug_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        text: processedText,
        originalText: text,
        status: "pending",
        votes: 1,
        voters: [voterId],
        submittedAt: new Date().toISOString(),
        submittedBy: voterId,
      };

      suggestions.push(suggestion);
      await kv.set(SUGGESTIONS_KEY, suggestions);
      return NextResponse.json({ success: true, suggestion });
    }

    if (action === "vote") {
      const { id, voterId } = body;
      if (!id) return NextResponse.json({ error: "Missing suggestion id" }, { status: 400 });

      const voter = voterId || "anon";
      const suggestions = await kv.get<Suggestion[]>(SUGGESTIONS_KEY) || [];
      const idx = suggestions.findIndex(s => s.id === id);
      if (idx === -1) return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });

      if (!suggestions[idx].voters) suggestions[idx].voters = [];

      if (suggestions[idx].voters.includes(voter)) {
        return NextResponse.json({ error: "Already voted", votes: suggestions[idx].votes, alreadyVoted: true }, { status: 409 });
      }

      suggestions[idx].voters.push(voter);
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
