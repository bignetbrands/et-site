/**
 * Autonomous meme engine — used by the reply pipeline to:
 * 1. Troll financial advice requests with a random ET meme image
 * 2. Face-swap ET into parent tweet photos when relevant
 */

// ET reference character image
const ET_REFERENCE_URL =
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/d3938ddb-6ca3-40cb-9321-c7b9bcf58c00/width=1080,quality=100";

const ET_CHAR_DESC = `Use the alien from the second reference image as your character model. Reproduce his EXACT anatomy: his specific wrinkled skin tone, his exact large eye shape, his head-to-body ratio, his thin limbs, his facial expression. He must look like the same individual — not a different alien, not a cartoon version, not a stylized version. Same character, same details.`;

// Fallback meme URLs if memedepot is unreachable
const FALLBACK_MEMES = [
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/b582645c-31fe-4eb4-e707-0807f140b100/width=1080",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/bc5c960e-8e60-498d-6fb9-dd5e7867f400/width=1080",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/965abb89-978f-495a-325c-5909e1340600/width=1080",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/1da10545-a6ac-4870-dd82-5592c96c2800/width=1080",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/a4035e7d-c7da-48cd-80ce-83baf13bb400/width=1080",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/c1ce7b27-2402-4e94-5683-e46c715a1a00/width=1080",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/d6a76aa5-45a6-4191-0bae-52d938135000/width=1080",
  "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/91db8ecc-3e43-4491-38d1-c3e65bcce400/width=1080",
];

// Financial advisor troll text — varied, never repeated
const FINANCIAL_TROLL_TEXTS = [
  "my financial advice is attached 👽",
  "consulted my models. here's the full analysis 👽",
  "ran the numbers. this is my official recommendation 👽",
  "i reviewed your portfolio. my verdict is attached 👽",
  "after extensive research: 👽",
  "this is what my signal array says 👽",
  "transmitted from the oracle 👽",
  "i have studied this market for 3 seconds. here: 👽",
];

async function fetchImageAsBlob(url: string): Promise<{ blob: Blob; contentType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/jpeg";
    return { blob: new Blob([new Uint8Array(buffer)], { type: contentType }), contentType };
  } catch {
    return null;
  }
}

async function base64ToBuffer(b64: string): Promise<Buffer> {
  return Buffer.from(b64, "base64");
}

/**
 * Fetch a random meme image from the ET meme library.
 * Returns the image as a Buffer, or null if unavailable.
 */
export async function getRandomETMeme(): Promise<Buffer | null> {
  // Try to fetch live meme library
  let memeUrl: string | null = null;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "https://etsearch.fun"}/api/memes`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const images: string[] = data.images || [];
      if (images.length > 0) {
        memeUrl = images[Math.floor(Math.random() * images.length)];
      }
    }
  } catch { /* fall through to fallback */ }

  if (!memeUrl) {
    memeUrl = FALLBACK_MEMES[Math.floor(Math.random() * FALLBACK_MEMES.length)];
  }

  const result = await fetchImageAsBlob(memeUrl);
  if (!result) return null;
  return Buffer.from(await result.blob.arrayBuffer());
}

/**
 * Pick a random financial troll text.
 */
export function getFinancialTrollText(): string {
  return FINANCIAL_TROLL_TEXTS[Math.floor(Math.random() * FINANCIAL_TROLL_TEXTS.length)];
}

/**
 * Face-swap ET into a photo using GPT-image-1.
 * Replaces human faces with ET's face, keeps everything else intact.
 * Returns the result as a Buffer, or null if generation fails.
 */
export async function generateFaceSwap(sourceImageUrl: string): Promise<Buffer | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[MemeEngine] OPENAI_API_KEY not set — skipping face swap");
    return null;
  }

  const FACE_SWAP_PROMPT = `You have two images:
- Image 1: A photograph. Keep EVERYTHING except human faces completely intact — background, clothing, objects, lighting, composition, colors.
- Image 2: An alien character called ET. ${ET_CHAR_DESC}

YOUR TASK: Replace every human face in Image 1 with ET's face. Keep his exact facial features, eye shape, and skin texture from Image 2. The bodies, background, and everything else stays completely unchanged. The result should look like ET attended this event/moment instead of the humans. Make it seamless and funny.`;

  try {
    const [sourceResult, etRefResult] = await Promise.all([
      fetchImageAsBlob(sourceImageUrl),
      fetchImageAsBlob(ET_REFERENCE_URL),
    ]);

    if (!sourceResult || !etRefResult) {
      console.warn("[MemeEngine] Failed to fetch images for face swap");
      return null;
    }

    const formData = new FormData();
    formData.append("image[]", sourceResult.blob, "scene.png");
    formData.append("image[]", etRefResult.blob, "et_reference.png");
    formData.append("prompt", FACE_SWAP_PROMPT);
    formData.append("model", "gpt-image-1");
    formData.append("size", "1024x1024");
    formData.append("quality", "low");

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(90000), // 90s timeout
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[MemeEngine] GPT-image face swap failed: ${res.status} ${errText.substring(0, 200)}`);
      return null;
    }

    const data = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return null;

    return await base64ToBuffer(b64);
  } catch (e) {
    console.warn("[MemeEngine] Face swap error:", e);
    return null;
  }
}

/**
 * Detect if a mention is a financial advisor troll request.
 */
export function isFinancialAdvisorMention(text: string): boolean {
  return /\b(financial\s*advisor|financi[aä]l|should\s*i\s*ape|should\s*i\s*(buy|sell|yolo|degen)|trench(nacial|nancial)?\s*advisor|ape\s*\$|ape\s*into|what do you think.{0,30}\$[A-Z]|investment\s*advice|buy\s*signal|sell\s*signal)\b/i.test(text);
}

/**
 * Detect if a mention is asking for ET's opinion on a specific token/trade.
 */
export function isTokenOpinionRequest(text: string): boolean {
  return /\b(should i (buy|sell|ape|hold|yolo)|is .{1,20} (worth|good|legit)|what.*think.*\$[A-Z]|gem or rug|rug or gem)\b/i.test(text);
}

// Alpha request troll texts — brief, ends with bio callout
const ALPHA_TEXTS = [
  "check my bio for coordinates 👽",
  "bio has the signal. IYKYK 😉",
  "i scan signals not floor prices. coordinates in bio 👽",
  "the alpha is in the bio fren 😉",
  "real ones already know. bio 👽",
  "IYKYK 😉",
  "it's in the bio. the rest is up to you 👽",
];

export function getAlphaText(): string {
  return ALPHA_TEXTS[Math.floor(Math.random() * ALPHA_TEXTS.length)];
}

/**
 * Detect if a mention is asking for alpha / CA / what to buy.
 */
export function isAlphaRequest(text: string): boolean {
  return /\b(gib\s*(me\s*)?alpha|drop\s*(the\s*)?alpha|can\s*(you\s*)?bless|bless\s+\w+\s+with|what.*alpha|alpha\?|ca\s*pls|ca\s*please|gib\s*ca|drop\s*ca|what.*ca|contract\s*address|what\s*(should\s*i|to)\s*(buy|ape|degen|get into))\b/i.test(text);
}
