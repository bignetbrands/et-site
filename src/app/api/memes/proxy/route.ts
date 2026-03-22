import { NextRequest, NextResponse } from "next/server";

// Proxy memedepot CDN images — browser can't load them directly (403)
// This route fetches server-side and streams back with correct headers

export async function GET(req: NextRequest) {
  const imageId = req.nextUrl.searchParams.get("id");
  const width = req.nextUrl.searchParams.get("w") || "400";

  if (!imageId || !/^[a-zA-Z0-9_-]{20,50}$/.test(imageId)) {
    return new NextResponse("Invalid image ID", { status: 400 });
  }

  const url = `https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw/${imageId}/width=${width}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ETSearchBot/1.0)",
        "Referer": "https://memedepot.com/",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return new NextResponse(`Upstream error: ${res.status}`, { status: res.status });
    }

    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "image/jpeg";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400", // cache 24h
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return new NextResponse("Failed to fetch image", { status: 502 });
  }
}
