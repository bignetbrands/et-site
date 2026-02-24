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

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "No messages provided" }, { status: 400 });
    }

    // Limit conversation length to prevent abuse
    const trimmed = messages.slice(-20);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        reply: "ET's communication array is offline right now. the humans are still wiring it up. try again soon 👽",
      });
    }

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
        system: CHAT_SYSTEM,
        messages: trimmed,
        temperature: 0.9,
      }),
    });

    const data = await response.json();
    const reply = data.content?.[0]?.type === "text" ? data.content[0].text : "ET is having trouble with earth's internet again. try once more.";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("[ET Chat] Error:", error);
    return NextResponse.json({
      reply: "something glitched in ET's transmitter. probably interference from a microwave. try again.",
    });
  }
}
