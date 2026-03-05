// app/api/memes/route.ts
// Scrapes memedepot.com/d/et for $ET meme images
// Caches results for 5 minutes to avoid hammering memedepot

import { NextResponse } from "next/server";

const MEMEDEPOT_URL = "https://memedepot.com/d/et";
const CDN_PATTERN =
  /https:\/\/memedepot\.com\/cdn-cgi\/imagedelivery\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/width=3840/g;

// Simple in-memory cache
let cache: { images: string[]; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  try {
    // Return cached if fresh
    if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
      return NextResponse.json({
        images: cache.images,
        cached: true,
        count: cache.images.length,
      });
    }

    // Fetch memedepot page
    const res = await fetch(MEMEDEPOT_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ETSearchBot/1.0; +https://etsearch.fun)",
      },
      next: { revalidate: 300 }, // Next.js fetch cache: 5 min
    });

    if (!res.ok) {
      throw new Error(`memedepot returned ${res.status}`);
    }

    const html = await res.text();

    // Extract all CDN image URLs at width=3840
    const matches = html.match(CDN_PATTERN) || [];

    // Deduplicate and filter out the depot banner/logo image
    const seen = new Set<string>();
    const images: string[] = [];

    for (const url of matches) {
      // Extract the image ID from the URL
      const idMatch = url.match(
        /imagedelivery\/[a-zA-Z0-9_-]+\/([a-zA-Z0-9_-]+)\//
      );
      const id = idMatch ? idMatch[1] : url;

      if (!seen.has(id)) {
        seen.add(id);
        images.push(url);
      }
    }

    // Filter out the depot's own banner (appears as the first/profile image)
    // The banner is typically "20a62c4a-dcd0-46d4-88c9-65f043f86300"
    const filtered = images.filter(
      (url) => !url.includes("20a62c4a-dcd0-46d4-88c9-65f043f86300")
    );

    // Update cache
    cache = { images: filtered, timestamp: Date.now() };

    return NextResponse.json({
      images: filtered,
      cached: false,
      count: filtered.length,
    });
  } catch (error) {
    console.error("[/api/memes] Error scraping memedepot:", error);

    // Return stale cache if available
    if (cache) {
      return NextResponse.json({
        images: cache.images,
        cached: true,
        stale: true,
        count: cache.images.length,
      });
    }

    return NextResponse.json(
      { error: "Failed to fetch memes", images: [] },
      { status: 502 }
    );
  }
}
