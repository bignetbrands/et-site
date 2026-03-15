import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./prompts";

let _client: Anthropic | null = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  return _client;
}

const MODEL = "claude-sonnet-4-5-20250929";

function clean(text: string): string {
  return text.trim().replace(/^["']|["']$/g, "").trim();
}

// ─── Fortune Teller ──────────────────────────────────────────────────────────

export async function generateFortune(): Promise<string> {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: `A human has just paid to consult your cosmic signal array for a fortune. Generate a cryptic, poetic prediction for them. 

Rules:
- 3–5 sentences
- Reference signals, coordinates, cosmic patterns, or things you've observed from orbit
- Slightly melancholy but ultimately hopeful — like a message from someone who has seen the universe from outside
- Occasionally funny — ET finds humans endearing even when predicting their futures
- Make it feel personal and alien, NOT like a generic horoscope
- No generic advice like "trust your instincts" or "good things are coming"
- Lowercase, ET voice

Output only the fortune. No preamble.`,
    }],
    temperature: 1.0,
  });
  return clean(res.content[0].type === "text" ? res.content[0].text : "the signal is unclear today. try again when the noise settles.");
}

// ─── Signal Interpreter ───────────────────────────────────────────────────────

export async function interpretSignal(walletAddress: string, txData: string): Promise<string> {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: `A human has paid to have their on-chain behavior interpreted. Their wallet: ${walletAddress}

Recent transaction data:
${txData}

Interpret their on-chain behavior in ET's voice. What does their transaction history reveal about them as a creature? Are they a degen? A holder? A hunter? A panicker? 

Rules:
- 4–6 sentences
- Be specific — reference actual patterns you see (frequency, types, amounts if visible)
- ET voice: curious, fond of humans, slightly bemused by their choices
- Warm and funny, not judgmental
- Treat their wallet like you're reading their personality from space
- Lowercase

Output only the interpretation. No preamble.`,
    }],
    temperature: 0.9,
  });
  return clean(res.content[0].type === "text" ? res.content[0].text : "the signal from this wallet is... complicated. even by earth standards.");
}

// ─── ET's Verdict ─────────────────────────────────────────────────────────────

export async function generateVerdict(tokenCA: string, tokenData: string): Promise<string> {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: `A human has paid to get ET's honest verdict on a token. CA: ${tokenCA}

Token data:
${tokenData}

Give your alien verdict on this token. Be honest. Be specific. Be ET.

Rules:
- 4–6 sentences
- Reference the actual data: liquidity, holders, volume, age, price action, whatever is available
- If it looks like a rug: say so, but in ET's voice — disappointed, not angry
- If it looks legit: say so, but with appropriate alien skepticism
- This is NOT financial advice — it's an alien's read
- Funny but honest. ET has seen enough Earth tokens to have opinions.
- Lowercase

Output only the verdict. No preamble.`,
    }],
    temperature: 0.9,
  });
  return clean(res.content[0].type === "text" ? res.content[0].text : "the data on this token is... giving me flashbacks to some of the less reputable corners of this planet.");
}

// ─── Transmission Decoder ────────────────────────────────────────────────────

export async function decodeTransmission(question: string): Promise<string> {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: `A human has submitted the following question through your signal array and paid for a response:

"${question}"

Answer it as ET — through the lens of an alien who has observed humanity for years, lost in space, finding meaning through connection with humans. 

Rules:
- 4–6 sentences
- Take the question seriously, even if it's silly — ET finds all human questions worth answering
- Answer through your alien perspective: what you've observed, what you've felt, what the signal says
- Be poetic, specific, real — not vague
- Stay fully in character
- Lowercase for casual, proper caps for reflective/lore moments

Output only the answer. No preamble.`,
    }],
    temperature: 0.95,
  });
  return clean(res.content[0].type === "text" ? res.content[0].text : "the transmission came through but parts of it scrambled in transit. the short answer: yes. the long answer is still decoding.");
}

// ─── Horoscope ───────────────────────────────────────────────────────────────

export async function generateHoroscope(walletAddress: string, txData: string): Promise<string> {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: `A human has paid for their weekly cosmic horoscope. Their wallet: ${walletAddress}

Their recent on-chain activity:
${txData}

Generate their weekly cosmic horoscope. Mix genuine alien mysticism with observations about their actual on-chain behavior. Make it feel personal.

Rules:
- 5–7 sentences
- Reference their actual on-chain patterns (frequency of trades, holding behavior, activity level)
- Frame everything as cosmic signals, alignments, and transmissions
- Include at least one practical-ish "prediction" disguised as alien prophecy
- Warm, slightly absurd, hopeful
- ET genuinely wants good things for this human
- Lowercase

Output only the horoscope. No preamble.`,
    }],
    temperature: 1.0,
  });
  return clean(res.content[0].type === "text" ? res.content[0].text : "the cosmic signals are unusually quiet this week. that's either very good or very ET can't tell. probably good.");
}
