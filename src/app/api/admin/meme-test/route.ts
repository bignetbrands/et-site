import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/admin/meme-test
 * 
 * Quick test: downloads a sample image, asks GPT Image to photobomb it with ET,
 * returns the edited image as base64.
 * 
 * Query params:
 *   ?url=<image_url>  — optional, use a custom source image
 *   ?prompt=<text>    — optional, custom edit prompt
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    // Also check query param for easy browser testing
    const { searchParams } = new URL(request.url);
    if (searchParams.get("secret") !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get("url") || "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png";
  const customPrompt = searchParams.get("prompt");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });
  }

  try {
    // 1. Download source image
    console.log(`[Meme Test] Downloading: ${imageUrl}`);
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      return NextResponse.json({ error: `Failed to download image: ${imgRes.status}` }, { status: 400 });
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get("content-type") || "image/png";
    const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png";
    console.log(`[Meme Test] Downloaded ${imgBuffer.length} bytes (${contentType})`);

    // 2. Build multipart form data
    const prompt = customPrompt || 
      "Edit this image to add a small, cute alien (grey-green skin, large reflective eyes, slim body) " +
      "photobombing the scene. The alien should be subtly hidden — peeking from behind an object, " +
      "visible in a reflection, sitting in the corner, or observing from a distance. " +
      "The alien should look like it was always there. Keep the original image intact and recognizable. " +
      "The alien should be playful and slightly mischievous, as if secretly observing humans.";

    // Use the /v1/images/edits endpoint with gpt-image-1
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imgBuffer)], { type: contentType });
    formData.append("image", blob, `source.${ext}`);
    formData.append("prompt", prompt);
    formData.append("model", "gpt-image-1"); // Use gpt-image-1 (most widely available)
    formData.append("size", "1024x1024");
    formData.append("quality", "medium");

    console.log("[Meme Test] Calling OpenAI /v1/images/edits...");
    const startTime = Date.now();

    const editRes = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
      body: formData,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!editRes.ok) {
      const errText = await editRes.text();
      console.error(`[Meme Test] OpenAI error (${editRes.status}):`, errText);
      return NextResponse.json({ 
        error: `OpenAI API error: ${editRes.status}`,
        details: errText,
        elapsed: `${elapsed}s`,
      }, { status: 500 });
    }

    const editData = await editRes.json();
    console.log(`[Meme Test] Success in ${elapsed}s`);

    // 3. Return result
    const resultImage = editData.data?.[0]?.b64_json || editData.data?.[0]?.url;
    const isBase64 = !!editData.data?.[0]?.b64_json;

    return NextResponse.json({
      success: true,
      elapsed: `${elapsed}s`,
      prompt: prompt.substring(0, 100) + "...",
      sourceUrl: imageUrl,
      resultType: isBase64 ? "base64" : "url",
      result: isBase64 ? `data:image/png;base64,${resultImage}` : resultImage,
      // If you want to see it in the browser, visit the /preview endpoint below
    });

  } catch (error) {
    console.error("[Meme Test] Error:", error);
    return NextResponse.json({
      error: `Failed: ${error instanceof Error ? error.message : String(error)}`,
    }, { status: 500 });
  }
}

/**
 * POST /api/admin/meme-test
 * 
 * Test with a custom image upload (base64 body).
 * Body: { image: "base64...", prompt: "..." }
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { image, prompt, url } = body;

    let imgBuffer: Buffer;
    let contentType = "image/png";

    if (url) {
      const imgRes = await fetch(url);
      imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      contentType = imgRes.headers.get("content-type") || "image/png";
    } else if (image) {
      // Strip data URL prefix if present
      const b64 = image.replace(/^data:image\/\w+;base64,/, "");
      imgBuffer = Buffer.from(b64, "base64");
    } else {
      return NextResponse.json({ error: "Provide 'url' or 'image' (base64)" }, { status: 400 });
    }

    const editPrompt = prompt || 
      "Add a small cute alien photobombing this scene — hidden but visible, observing humans with curiosity.";

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imgBuffer)], { type: contentType });
    formData.append("image", blob, "source.png");
    formData.append("prompt", editPrompt);
    formData.append("model", "gpt-image-1");
    formData.append("size", "1024x1024");
    formData.append("quality", "medium");

    const startTime = Date.now();
    const editRes = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: formData,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!editRes.ok) {
      const errText = await editRes.text();
      return NextResponse.json({ error: `OpenAI error: ${editRes.status}`, details: errText }, { status: 500 });
    }

    const editData = await editRes.json();
    const resultImage = editData.data?.[0]?.b64_json;

    return NextResponse.json({
      success: true,
      elapsed: `${elapsed}s`,
      result: resultImage ? `data:image/png;base64,${resultImage}` : null,
    });

  } catch (error) {
    return NextResponse.json({
      error: `Failed: ${error instanceof Error ? error.message : String(error)}`,
    }, { status: 500 });
  }
}
