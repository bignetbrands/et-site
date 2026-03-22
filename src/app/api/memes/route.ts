// app/api/memes/route.ts
// Returns all $ET meme images from the memedepot library.
// Baseline: hardcoded known IDs (fast, always available).
// Enhancement: scrape memedepot for new images added after deploy.

import { NextResponse } from "next/server";

const CDN_BASE = "https://memedepot.com/cdn-cgi/imagedelivery/naCPMwxXX46-hrE49eZovw";
const BANNER_ID = "20a62c4a-dcd0-46d4-88c9-65f043f86300"; // depot profile banner — exclude

// All known meme IDs — extracted from homepage + memedepot manually
// Add new IDs here when new memes are uploaded to memedepot.com/d/et
const KNOWN_IDS = [
  "b582645c-31fe-4eb4-e707-0807f140b100",
  "bc5c960e-8e60-498d-6fb9-dd5e7867f400",
  "965abb89-978f-495a-325c-5909e1340600",
  "1da10545-a6ac-4870-dd82-5592c96c2800",
  "a4035e7d-c7da-48cd-80ce-83baf13bb400",
  "c1ce7b27-2402-4e94-5683-e46c715a1a00",
  "d6a76aa5-45a6-4191-0bae-52d938135000",
  "91db8ecc-3e43-4491-38d1-c3e65bcce400",
  "8f88cbb5-1db9-4ad4-4fb6-6d4ab5894200",
  "44d2f74f-8ef3-44b7-dcbf-008127f9c800",
  "930a5168-0c23-4231-9ab4-ee37ce35e800",
  "95faadc6-087e-410f-6d05-5c26d3591d00",
  "d3b2365e-8b0b-4484-cdae-f29e53c41300",
  "7f54dcf9-e9a0-472d-18db-985b02106600",
  "cd3caacb-b9b0-4979-f688-f9b398acda00",
  "f5600f4c-ccbe-4f7f-99dd-d9e7ea426c00",
  "c020cc21-66e9-4c01-d555-90ca8dd5b900",
  "8c770281-cb0f-48e5-e650-ed4c8e5fad00",
  "923d519a-154f-4c28-d713-106d1477a900",
  "d3ed819f-8449-438a-f8dc-7e78d287fc00",
  "22dd40c1-0ba1-4467-f729-ca967f5f5000",
];

const KNOWN_URLS = KNOWN_IDS.map(id => `${CDN_BASE}/${id}/width=600`);

// In-memory cache for scraped additions
let scrapeCache: { ids: Set<string>; timestamp: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 min

export async function GET() {
  const knownSet = new Set(KNOWN_IDS);

  // Try to scrape memedepot for any new images not in KNOWN_IDS
  let scrapedUrls: string[] = [];
  try {
    if (!scrapeCache || Date.now() - scrapeCache.timestamp > CACHE_TTL) {
      const res = await fetch("https://memedepot.com/d/et", {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ETSearchBot/1.0)" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const html = await res.text();
        // Match any imagedelivery UUID pattern
        const pattern = /imagedelivery\/[a-zA-Z0-9_-]+\/([a-f0-9-]{36})\//g;
        const foundIds = new Set<string>();
        let m;
        while ((m = pattern.exec(html)) !== null) {
          const id = m[1];
          if (id !== BANNER_ID && !knownSet.has(id)) foundIds.add(id);
        }
        scrapeCache = { ids: foundIds, timestamp: Date.now() };
        console.log(`[/api/memes] Scraped ${foundIds.size} new IDs from memedepot`);
      }
    }
    if (scrapeCache?.ids.size) {
      scrapedUrls = [...scrapeCache.ids].map(id => `${CDN_BASE}/${id}/width=600`);
    }
  } catch (e) {
    console.warn("[/api/memes] Scrape failed (non-fatal):", e);
  }

  const all = [...KNOWN_URLS, ...scrapedUrls];

  return NextResponse.json({
    images: all,
    count: all.length,
    known: KNOWN_IDS.length,
    scraped: scrapedUrls.length,
  });
}
