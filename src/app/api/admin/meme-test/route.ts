import { NextResponse } from "next/server";
import { getTweetWithMedia, postReplyWithImage, postTweetWithImage } from "@/lib/twitter";
import { recordAction, markTweetQuoted, recordBotPostedTweet } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ET_PHOTOBOMB_PROMPT = `Edit this image to add a small, cute alien photobombing the scene. 
The alien has: grey-green skin, large reflective blue eyes, slim body, slightly glowing aura.
The alien should be SUBTLY HIDDEN — peeking from behind an object, visible in a reflection, 
sitting in the corner, hovering in the distance, or observing from a window.
The alien must look like it was always there. Keep the original image fully intact and recognizable.
The alien is playful and mischievous, secretly observing humans like a scientist studying specimens.`;

const ET_MEME_PROMPT = `Transform this image into a funny internet meme about an alien observing humans.
Add a small alien (grey-green skin, large reflective blue eyes) somewhere in the scene — 
studying, analyzing, or judging the human behavior shown. 
The alien treats humans like animals in an aquarium.
The humor should be observational, absurd, and shareable. 
You can add meme-style text/captions if it makes it funnier.
Keep the original image recognizable but make it meme-worthy.`;

const ET_ROAST_PROMPT = `Create a playful roast of this image. Show a small alien scientist 
(grey-green skin, large reflective blue eyes) analyzing or judging this scene — 
writing notes on an alien clipboard, scanning with alien equipment, or labeling the behavior 
like a research experiment. Add labels or annotations in a scientific/comedic style.
The humor should be observational and playful, never mean. 
Think: alien anthropologist evaluating primitive human behavior.`;

const ET_SCENE_PROMPT = `Create a meme scene inspired by this tweet. 
Show a small alien (grey-green skin, large reflective blue eyes) observing or reacting to 
the situation described. The alien is studying humanity like a scientist.
Make it funny, internet-native, and shareable. Meme-style text/captions are encouraged.
The style should be clear, visually engaging, and slightly absurd.`;

async function generateMemeImage(
  sourceImageUrl: string | null,
  prompt: string,
  apiKey: string,
): Promise<{ success: boolean; imageBase64?: string; elapsed?: string; error?: string }> {
  const startTime = Date.now();

  try {
    if (sourceImageUrl) {
      // EDIT existing image
      const imgRes = await fetch(sourceImageUrl);
      if (!imgRes.ok) return { success: false, error: `Failed to download image: ${imgRes.status}` };
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      const contentType = imgRes.headers.get("content-type") || "image/png";
      const blob = new Blob([new Uint8Array(imgBuffer)], { type: contentType });

      const formData = new FormData();
      formData.append("image", blob, "source.png");
      formData.append("prompt", prompt);
      formData.append("model", "gpt-image-1");
      formData.append("size", "1024x1024");
      formData.append("quality", "medium");

      const res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: formData,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (!res.ok) {
        const errText = await res.text();
        return { success: false, error: `OpenAI ${res.status}: ${errText.substring(0, 200)}`, elapsed: `${elapsed}s` };
      }

      const data = await res.json();
      const b64 = data.data?.[0]?.b64_json;
      return b64
        ? { success: true, imageBase64: b64, elapsed: `${elapsed}s` }
        : { success: false, error: "No image in response", elapsed: `${elapsed}s` };
    } else {
      // GENERATE new image (no source)
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt,
          size: "1024x1024",
          quality: "medium",
        }),
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (!res.ok) {
        const errText = await res.text();
        return { success: false, error: `OpenAI ${res.status}: ${errText.substring(0, 200)}`, elapsed: `${elapsed}s` };
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

    const hasImages = tweet.imageUrls.length > 0;
    const sourceImage = hasImages ? tweet.imageUrls[0] : null;

    console.log(`[Meme Engine] @${tweet.authorUsername}: "${tweet.text.substring(0, 60)}..." | ${tweet.imageUrls.length} images | mode: ${mode}`);

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
    const result = await generateMemeImage(sourceImage, prompt, apiKey);

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
      hasImages,
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
