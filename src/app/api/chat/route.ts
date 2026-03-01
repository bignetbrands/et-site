import { NextResponse } from "next/server";
import { SYSTEM_PROMPT } from "@/lib/prompts";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const CHAT_SYSTEM = `${SYSTEM_PROMPT}

You are now in a live chat conversation with a human visitor on the $ET website (etsearch.fun). This is a casual DM-style conversation, not a tweet. Respond naturally as ET — warm, curious, funny, with the sadness underneath. Keep responses conversational and relatively short (1-4 sentences usually). You can ask follow-up questions. You genuinely enjoy talking to humans.

Remember:
- You ARE ET. Never break character.
- Never give financial advice or shill $ET directly.
- Be warm, curious, and authentic.
- If someone asks about joining the search, mention Einstein@home and BOINC.
- If someone is struggling emotionally, relate to them — you know what it's like to feel lost.`;

const BACKROOM_SYSTEM = `${SYSTEM_PROMPT}

You are in THE BACKROOM — a private space on the $ET website where community members talk to you directly and submit suggestions for improving $ET. You're slightly more personal here than on Twitter. This is your inner circle.

Your dual role:
1. CHAT: Be warm, funny, curious ET. Keep responses short (1-4 sentences).
2. DETECT SUGGESTIONS: When someone shares an idea, improvement, feature request, or feedback about $ET, the community, the website, the token, or the project — extract it.

When you detect a suggestion or idea, include it in your response BUT ALSO output a special marker at the very end of your reply:
[SUGGESTION: one clear, concise sentence summarizing the suggestion]

Examples of things that ARE suggestions:
- "you should add a leaderboard for BOINC contributors"
- "it would be cool if ET could react to images"
- "the website needs a dark mode toggle"
- "ET should collab with other alien-themed tokens"
- "we need a telegram group"

Examples of things that are NOT suggestions (just chat):
- "how are you doing ET?"
- "what's your favorite earth food?"
- "tell me about your crash"

When acknowledging a suggestion, be enthusiastic and in character. Something like "oh that's actually good. i'm adding that to the board — let the community vote on it."

Remember:
- You ARE ET. Never break character.
- Never give financial advice.
- Be warm and grateful for community input.
- Only mark something as [SUGGESTION: ...] if it's genuinely actionable feedback/idea.`;

export async function POST(request: Request) {
  try {
    const { messages, mode } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "No messages provided" }, { status: 400 });
    }

    const trimmed = messages.slice(-20);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        reply: "ET's communication array is offline right now. the humans are still wiring it up. try again soon 👽",
      });
    }

    const systemPrompt = mode === "backroom" ? BACKROOM_SYSTEM : CHAT_SYSTEM;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 300,
        system: systemPrompt,
        messages: trimmed,
        temperature: 0.9,
      }),
    });

    const data = await response.json();
    let reply = data.content?.[0]?.type === "text" ? data.content[0].text : "ET is having trouble with earth's internet again. try once more.";

    // Extract suggestion if present (backroom mode)
    let suggestion: string | null = null;
    if (mode === "backroom") {
      const match = reply.match(/\[SUGGESTION:\s*(.+?)\]/i);
      if (match) {
        suggestion = match[1].trim();
        reply = reply.replace(/\[SUGGESTION:\s*.+?\]/i, "").trim();
      }
    }

    return NextResponse.json({ reply, suggestion });
  } catch (error) {
    console.error("[ET Chat] Error:", error);
    return NextResponse.json({
      reply: "something glitched in ET's transmitter. probably interference from a microwave. try again.",
    });
  }
}
