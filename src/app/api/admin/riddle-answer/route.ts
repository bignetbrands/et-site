import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "@/lib/prompts";

function auth(req: NextRequest) {
  return req.headers.get("authorization") === `Bearer ${process.env.ADMIN_SECRET}`;
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { question } = await req.json();
  if (!question?.trim()) return NextResponse.json({ error: "Missing question" }, { status: 400 });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const res = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: `The admin is asking you to determine the correct answer to a riddle you posted on Twitter.

The riddle you posted was:
"${question}"

Based on your established lore, your tweets, and your character bible — what is the single correct answer to this riddle? Reason through each clue carefully.

Reply with ONLY the answer in one concise sentence. No preamble, no explanation, just the answer a winning human would need to give.`,
    }],
    temperature: 0.3,
  });

  const answer = res.content[0].type === "text"
    ? res.content[0].text.trim().replace(/^["']|["']$/g, "").trim()
    : "";

  if (!answer) return NextResponse.json({ error: "Failed to generate answer" }, { status: 500 });

  return NextResponse.json({ success: true, answer });
}
