import { NextResponse } from "next/server";
import { getTweetWithMedia, postReplyWithImage, postTweetWithImage } from "@/lib/twitter";
import { recordAction, markTweetQuoted, recordBotPostedTweet } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// The actual ET character image — used as reference in every meme generation
const ET_REFERENCE_URL = "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/d3938ddb-6ca3-40cb-9321-c7b9bcf58c00/width=1080,quality=100";

const ET_CHAR_DESC = `Use the alien from the second reference image as your character model. Reproduce his EXACT anatomy: his specific wrinkled skin tone, his exact large eye shape, his head-to-body ratio, his thin limbs, his facial expression. He must look like the same individual — not a different alien, not a cartoon version, not a stylized version. Same character, same details.`;

const ET_PHOTOBOMB_PROMPT = `You have two images:
- Image 1: A photograph. THIS IS SACRED. Do not alter, recolor, resize, crop, filter, or artistically reinterpret ANY part of this photo. Every human face, every object, every background element, every shadow, every color must remain UNTOUCHED.
- Image 2: An alien character called ET. ${ET_CHAR_DESC}

YOUR TASK: Place the ET character into the photograph. That is the ONLY change allowed.

PLACEMENT — pick ONE:
- Peeking from behind furniture or a doorway
- Visible through a window or in a reflection
- Partially hidden in a corner or behind an object
- Small in the background, observing from a distance

BLENDING:
- Match the photo's exact lighting direction, color temperature, and shadow angles
- ET should look physically present in the scene — correct scale, correct perspective
- He should be small enough to be a background detail, not the main subject

ZERO TOLERANCE:
- Do NOT change any person's face or body
- Do NOT change the background, colors, or composition
- Do NOT apply any filter or style transfer
- Do NOT change the aspect ratio or crop
- The ONLY difference between input and output is ET's presence`;

const ET_MEME_PROMPT = `You have two images:
- Image 1: A photo. Keep it as intact as possible — do not redraw or reimagine it.
- Image 2: An alien character called ET. ${ET_CHAR_DESC}

Add ET into the photo as an alien observer — studying, judging, or reacting to the humans. You may add meme text/captions. Keep all humans and the scene recognizable. ET must look like the character from image 2, not a generic alien.`;

const ET_ROAST_PROMPT = `You have two images:
- Image 1: A photo. Keep it intact as the base.
- Image 2: An alien character called ET. ${ET_CHAR_DESC}

Insert ET as an alien scientist analyzing the scene — with a clipboard, scanner, magnifying glass, or scientific labels. Keep all humans and background intact. Add comedic annotations if funny. ET must look like the character from image 2.`;

const ET_SCENE_PROMPT = `You have one reference image of an alien character called ET. ${ET_CHAR_DESC}

Create a new scene showing this EXACT character observing or reacting to the situation described below. Preserve his anatomy precisely from the reference — same face, same body, same proportions. Make it funny and shareable.`;

async function fetchImageAsBlob(url: string): Promise<{ blob: Blob; contentType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/png";
    return { blob: new Blob([new Uint8Array(buffer)], { type: contentType }), contentType };
  } catch {
    return null;
  }
}

async function generateMemeImage(
  sourceImageUrl: string | null,
  prompt: string,
  apiKey: string,
): Promise<{ success: boolean; imageBase64?: string; elapsed?: string; error?: string }> {
  const startTime = Date.now();

  try {
    // Always fetch ET reference image
    const etRef = await fetchImageAsBlob(ET_REFERENCE_URL);
    if (!etRef) return { success: false, error: "Failed to download ET reference image" };

    if (sourceImageUrl) {
      // EDIT: source image + ET reference
      const source = await fetchImageAsBlob(sourceImageUrl);
      if (!source) return { success: false, error: `Failed to download source image` };

      const formData = new FormData();
      // First image = scene to edit, Second image = ET character reference
      formData.append("image[]", source.blob, "scene.png");
      formData.append("image[]", etRef.blob, "et_reference.png");
      formData.append("prompt", prompt);
      formData.append("model", "gpt-image-1");
      formData.append("size", "1024x1024");
      formData.append("quality", "low");

      const res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: formData,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (!res.ok) {
        const errText = await res.text();
        if (errText.includes("safety_violations") || errText.includes("safety system")) {
          const violation = errText.match(/safety_violations=\[(\w+)\]/)?.[1] || "content policy";
          return { success: false, error: `OpenAI rejected this image (${violation} filter). Try a different source image.`, elapsed: `${elapsed}s` };
        }
        return { success: false, error: `OpenAI ${res.status}: ${errText.substring(0, 300)}`, elapsed: `${elapsed}s` };
      }

      const data = await res.json();
      const b64 = data.data?.[0]?.b64_json;
      return b64
        ? { success: true, imageBase64: b64, elapsed: `${elapsed}s` }
        : { success: false, error: "No image in response", elapsed: `${elapsed}s` };
    } else {
      // GENERATE: ET reference only (no source scene)
      const formData = new FormData();
      formData.append("image[]", etRef.blob, "et_reference.png");
      formData.append("prompt", prompt);
      formData.append("model", "gpt-image-1");
      formData.append("size", "1024x1024");
      formData.append("quality", "low");

      const res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: formData,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (!res.ok) {
        const errText = await res.text();
        if (errText.includes("safety_violations") || errText.includes("safety system")) {
          const violation = errText.match(/safety_violations=\[(\w+)\]/)?.[1] || "content policy";
          return { success: false, error: `OpenAI rejected this (${violation} filter). Try different content.`, elapsed: `${elapsed}s` };
        }
        return { success: false, error: `OpenAI ${res.status}: ${errText.substring(0, 300)}`, elapsed: `${elapsed}s` };
      }

      const data = await res.json();
      const b64 = data.data?.[0]?.b64_json;
      return b64
        ? { success: true, imageBase64: b64, elapsed: `${elapsed}s` }
        : { success: false, error: "No image in response", elapsed: `${elapsed}s` };
    }
  } catch (e) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return { success: false, error: `${e instanceof Error ? e.message : String(e)}`, elapsed: `${elapsed}s` };
  }
}

/**
 * POST /api/admin/meme-test
 * 
 * Body:
 *   tweetUrl: string — tweet URL
 *   mode: "photobomb" | "meme" | "roast"
 *   action: "preview" | "post"
 *   imageBase64: string — (for action=post) pre-generated image
 *   emoji: string — caption emoji (default 👽)
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });

  try {
    const body = await request.json();
    const { tweetUrl, mode = "photobomb", action = "preview", imageBase64: preGenerated, emoji = "👽" } = body;

    if (!tweetUrl) return NextResponse.json({ error: "tweetUrl required" }, { status: 400 });

    const idMatch = tweetUrl.match(/status\/(\d+)/);
    const tweetId = idMatch ? idMatch[1] : tweetUrl.replace(/\D/g, "");
    if (!tweetId) return NextResponse.json({ error: "Could not extract tweet ID" }, { status: 400 });

    // POST pre-generated image
    if (action === "post" && preGenerated) {
      const imgBuffer = Buffer.from(preGenerated, "base64");
      try {
        const replyId = await postReplyWithImage(emoji, tweetId, imgBuffer);
        await markTweetQuoted(tweetId);
        await recordBotPostedTweet(replyId);
        await recordAction();
        return NextResponse.json({ success: true, method: "reply", replyId, tweetId });
      } catch (replyErr: any) {
        if (replyErr?.data?.status === 403) {
          const link = `https://x.com/i/status/${tweetId}`;
          const stId = await postTweetWithImage(`${emoji}\n\n${link}`, imgBuffer);
          await markTweetQuoted(tweetId);
          await recordBotPostedTweet(stId);
          await recordAction();
          return NextResponse.json({ success: true, method: "standalone", replyId: stId, tweetId });
        }
        throw replyErr;
      }
    }

    // PREVIEW — fetch tweet + generate meme
    console.log(`[Meme Engine] Fetching tweet ${tweetId}...`);
    const tweet = await getTweetWithMedia(tweetId);
    if (!tweet) return NextResponse.json({ error: `Could not fetch tweet ${tweetId}` }, { status: 400 });

    // If this tweet has no images, walk up the thread to find the parent with images
    // (e.g. someone replies "photobomb this" to a tweet that has the actual photo)
    let sourceImage: string | null = tweet.imageUrls.length > 0 ? tweet.imageUrls[0] : null;
    let imageTweetText = tweet.text;
    let imageTweetAuthor = tweet.authorUsername;
    let walkedUp = false;

    if (!sourceImage && tweet.inReplyToId) {
      console.log(`[Meme Engine] No images in tagged tweet — checking parent ${tweet.inReplyToId}...`);
      let parentId: string | undefined = tweet.inReplyToId;
      let depth = 0;

      while (parentId && depth < 3) {
        const parent = await getTweetWithMedia(parentId);
        if (!parent) break;

        if (parent.imageUrls.length > 0) {
          sourceImage = parent.imageUrls[0];
          imageTweetText = parent.text;
          imageTweetAuthor = parent.authorUsername;
          walkedUp = true;
          console.log(`[Meme Engine] Found image in parent tweet by @${parent.authorUsername} (${depth + 1} level${depth > 0 ? "s" : ""} up)`);
          break;
        }

        parentId = parent.inReplyToId;
        depth++;
      }
    }

    const hasImages = !!sourceImage;

    console.log(`[Meme Engine] @${tweet.authorUsername}: "${tweet.text.substring(0, 60)}..." | ${hasImages ? `image from @${imageTweetAuthor}${walkedUp ? " (parent)" : ""}` : "no images"} | mode: ${mode}`);

    // Pick prompt
    let prompt: string;
    if (hasImages) {
      prompt = mode === "roast" ? ET_ROAST_PROMPT
        : mode === "meme" ? ET_MEME_PROMPT
        : ET_PHOTOBOMB_PROMPT;
    } else {
      prompt = `${ET_SCENE_PROMPT}\n\nThe tweet says: "${tweet.text}"`;
    }

    console.log(`[Meme Engine] ${hasImages ? "Editing" : "Generating"} image...`);
    let result = await generateMemeImage(sourceImage, prompt, apiKey);

    // Auto-fallback: if safety filter rejects the source image, generate a scene instead
    let fellBack = false;
    if (!result.success && result.error?.includes("rejected") && hasImages) {
      console.log(`[Meme Engine] Safety filter blocked edit — falling back to scene generation from tweet text`);
      const fallbackPrompt = `${ET_SCENE_PROMPT}\n\nThe tweet says: "${imageTweetText || tweet.text}"`;
      result = await generateMemeImage(null, fallbackPrompt, apiKey);
      fellBack = true;
      if (result.success) {
        console.log(`[Meme Engine] Fallback scene generated in ${result.elapsed}`);
      }
    }

    if (!result.success) {
      return NextResponse.json({
        error: result.error,
        elapsed: result.elapsed,
        tweetText: tweet.text,
        author: tweet.authorUsername,
        hasImages,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      elapsed: result.elapsed,
      tweetId,
      tweetText: tweet.text,
      author: tweet.authorUsername,
      hasImages: hasImages && !fellBack,
      fellBack,
      imageFrom: fellBack ? "generated scene (source image blocked by safety filter)" : walkedUp ? `@${imageTweetAuthor} (parent tweet)` : hasImages ? `@${tweet.authorUsername}` : null,
      memeMode: mode,
      imageBase64: result.imageBase64,
      result: `data:image/png;base64,${result.imageBase64}`,
    });

  } catch (error) {
    console.error("[Meme Engine] Error:", error);
    return NextResponse.json({
      error: `Failed: ${error instanceof Error ? error.message : String(error)}`,
    }, { status: 500 });
  }
}
