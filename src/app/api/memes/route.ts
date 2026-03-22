// app/api/memes/route.ts
// Scrapes memedepot.com/d/et for $ET meme images
// Caches results for 5 minutes to avoid hammering memedepot

import { NextResponse } from "next/server";

const MEMEDEPOT_URL = "https://memedepot.com/d/et";
const CDN_PATTERN =
  /https:\/\/memedepot\.com\/cdn-cgi\/imagedelivery\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/width=\d+/g;

// Known good meme IDs — always available as baseline
const KNOWN_MEME_IDS = [
  "b582645c-31fe-4eb4-e707-0807f140b100",
  "bc5c960e-8e60-498d-6fb9-dd5e7867f400",
  "965abb89-978f-495a-325c-5909e1340600",
  "1da10545-a6ac-4870-dd82-5592c96c2800",
  "a4035e7d-c7da-48cd-80ce-83baf13bb400",
  "c1ce7b27-2402-4e94-5683-e46c715a1a00",
  "d6a76aa5-45a6-4191-0bae-52d938135000",
  "91db8ecc-3e43-4491-38d1-c3e65bcce400",
];
const CDN_BASE = "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw";
const FALLBACK_URLS = KNOWN_MEME_IDS.map(id => `${CDN_BASE}/${id}/width=1080`);

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
        // Normalize to width=600 — other sizes return 403 from CDN
        images.push(url.replace(/width=\d+[^,]*/, "width=600"));
      }
    }

    // Filter out the depot's own banner (appears as the first/profile image)
    // The banner is typically "20a62c4a-dcd0-46d4-88c9-65f043f86300"
    const filtered = images.filter(
      (url) => !url.includes("20a62c4a-dcd0-46d4-88c9-65f043f86300")
    );

    // Update cache
    cache = { images: filtered, timestamp: Date.now() };

    // Merge scraped images with known fallbacks (deduplicate by ID)
    const allIds = new Set<string>();
    const merged: string[] = [];
    for (const url of [...filtered, ...FALLBACK_URLS]) {
      const m = url.match(/imagedelivery\/[a-zA-Z0-9_-]+\/([a-zA-Z0-9_-]+)\//);
      const id = m ? m[1] : url;
      if (!allIds.has(id)) { allIds.add(id); merged.push(url); }
    }

    cache = { images: merged, timestamp: Date.now() };

    return NextResponse.json({
      images: merged,
      cached: false,
      count: merged.length,
      scraped: filtered.length,
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

    // No cache — return at least the known fallbacks
    return NextResponse.json({
      images: FALLBACK_URLS,
      cached: false,
      stale: true,
      count: FALLBACK_URLS.length,
    });
  }
}
