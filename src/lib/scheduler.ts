import { ContentPillar, SchedulerDecision } from "@/types";
import { PILLAR_CONFIGS } from "./prompts";
import {
  getDailyState,
  getAvailablePillars,
  getUnderservedPillars,
  getLastTweetTime,
  getTodayTweetCount,
  getNextTweetTime,
  setNextTweetTime,
} from "./store";

// ============================================================
// SCHEDULE CONFIG — Organic, human-like timing
// ============================================================

// ET's "active hours" (UTC)
const ACTIVE_START_HOUR = 9; // 9 AM UTC
const ACTIVE_END_HOUR = 3; // 3 AM UTC (next day)

// Quiet hours — WITHIN active hours, ET goes silent during low-engagement periods
// These are UTC hours where shouldTweet() returns false (no new tweets, replies still process)
// Based on crypto Twitter engagement patterns (US-centric audience):
//   - 6-8 AM ET (11-13 UTC): Too early, low scroll rates
//   - 2-4 PM ET (19-21 UTC): Work grind, meetings, low engagement
const QUIET_HOURS_UTC: number[] = [11, 12, 19, 20];

const DAILY_TWEET_TARGET = { min: 7, max: 10 };

// Random gap range between tweets (minutes)
// Varies by time of day for organic feel
const GAP_RANGES: Record<string, { min: number; max: number }> = {
  morning: { min: 50, max: 130 },   // slower start
  afternoon: { min: 40, max: 100 },  // more active
  evening: { min: 35, max: 90 },     // peak hours, tighter gaps
  latenight: { min: 60, max: 160 },  // sparse, contemplative
};

// Chance of a trending/reactive tweet instead of pillar tweet
const TRENDING_CHANCE = 0.50; // 50% of tweets reference current topics

// Chance of a riddle/puzzle tweet for engagement
const RIDDLE_CHANCE = 0.15; // ~15% of tweets are riddles, puzzles, or "what am I looking at" image challenges

// ============================================================
// TIME HELPERS
// ============================================================

function getCurrentHourUTC(): number {
  return new Date().getUTCHours();
}

function isActiveHour(): boolean {
  const hour = getCurrentHourUTC();
  if (ACTIVE_START_HOUR < ACTIVE_END_HOUR) {
    return hour >= ACTIVE_START_HOUR && hour < ACTIVE_END_HOUR;
  }
  return hour >= ACTIVE_START_HOUR || hour < ACTIVE_END_HOUR;
}

function isQuietHour(): boolean {
  const hour = getCurrentHourUTC();
  return QUIET_HOURS_UTC.includes(hour);
}

function getTimeOfDay(): "morning" | "afternoon" | "evening" | "latenight" {
  const hour = getCurrentHourUTC();
  if (hour >= 9 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "latenight";
}

function getActiveHoursRemaining(): number {
  const hour = getCurrentHourUTC();
  if (ACTIVE_END_HOUR > ACTIVE_START_HOUR) {
    return Math.max(0, ACTIVE_END_HOUR - hour);
  }
  if (hour >= ACTIVE_START_HOUR) {
    return 24 - hour + ACTIVE_END_HOUR;
  }
  return Math.max(0, ACTIVE_END_HOUR - hour);
}

/**
 * Generate a random gap in minutes for the next tweet.
 */
function randomGap(): number {
  const tod = getTimeOfDay();
  const range = GAP_RANGES[tod] || { min: 45, max: 120 };
  return range.min + Math.floor(Math.random() * (range.max - range.min));
}

// ============================================================
// PILLAR SELECTION
// ============================================================

async function selectPillar(): Promise<ContentPillar | null> {
  const available = await getAvailablePillars();
  if (available.length === 0) return null;

  const underserved = await getUnderservedPillars();
  const hoursLeft = getActiveHoursRemaining();
  const timeOfDay = getTimeOfDay();

  if (underserved.length > 0 && hoursLeft <= underserved.length + 2) {
    return weightedRandom(underserved, timeOfDay);
  }

  if (underserved.length > 0 && Math.random() < 0.7) {
    return weightedRandom(underserved, timeOfDay);
  }

  return weightedRandom(available, timeOfDay);
}

function weightedRandom(
  pillars: ContentPillar[],
  timeOfDay: string
): ContentPillar {
  const timeWeights: Record<string, Partial<Record<ContentPillar, number>>> = {
    morning: {
      human_observation: 1.5,
      research_drop: 1.2,
      crypto_community: 1.0,
      disclosure_conspiracy: 1.0,
    },
    afternoon: {
      crypto_community: 1.5,
      human_observation: 1.2,
      disclosure_conspiracy: 1.3,
      research_drop: 1.0,
    },
    evening: {
      existential: 1.5,
      personal_lore: 1.3,
      human_observation: 1.0,
      disclosure_conspiracy: 1.2,
    },
    latenight: {
      existential: 1.8,
      personal_lore: 1.5,
      human_observation: 0.8,
    },
  };

  const weights = pillars.map((p) => {
    const w = timeWeights[timeOfDay]?.[p] ?? 1.0;
    return { pillar: p, weight: w };
  });

  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  let random = Math.random() * totalWeight;

  for (const { pillar, weight } of weights) {
    random -= weight;
    if (random <= 0) return pillar;
  }

  return pillars[0];
}

// ============================================================
// MAIN SCHEDULER DECISION
// ============================================================

/**
 * Should ET tweet right now?
 * Uses randomized next-tweet-time stored in KV for organic intervals.
 */
export async function shouldTweet(): Promise<SchedulerDecision> {
  // KV health check — if we can't persist state, don't tweet.
  // Without working KV, daily counts and next-tweet-time are lost,
  // causing ET to spam a tweet every 15-min cron cycle.
  try {
    const probe = await getNextTweetTime();
    if (probe === null) {
      // First run or KV was wiped — set a next-tweet-time so we don't fire again immediately
      await setNextTweetTime(Date.now() + randomGap() * 60000);
    }
    // Verify the write stuck
    const verify = await getNextTweetTime();
    if (verify === null) {
      return {
        shouldTweet: false,
        reason: "KV write failed — refusing to tweet without state tracking",
      };
    }
  } catch {
    return {
      shouldTweet: false,
      reason: "KV health check failed — refusing to tweet without state tracking",
    };
  }

  // Check if we're in active hours
  if (!isActiveHour()) {
    return {
      shouldTweet: false,
      reason: "Outside active hours — ET is resting",
    };
  }

  // Check quiet hours — ET takes breaks during low-engagement windows
  if (isQuietHour()) {
    return {
      shouldTweet: false,
      reason: `Quiet hour (${getCurrentHourUTC()}:00 UTC) — low engagement window, ET is lurking`,
    };
  }

  // Check daily limit
  const todayCount = await getTodayTweetCount();
  if (todayCount >= DAILY_TWEET_TARGET.max) {
    return {
      shouldTweet: false,
      reason: `Daily max reached (${todayCount}/${DAILY_TWEET_TARGET.max})`,
    };
  }

  const now = Date.now();

  // Check if we're falling behind and need to catch up
  const hoursLeft = getActiveHoursRemaining();
  const tweetsNeeded = DAILY_TWEET_TARGET.min - todayCount;
  const catchUp = tweetsNeeded > 0 && hoursLeft <= tweetsNeeded + 1;

  if (!catchUp) {
    // Check the randomized next-tweet-time
    const nextTime = await getNextTweetTime();

    if (nextTime && now < nextTime) {
      const minsLeft = Math.round((nextTime - now) / 60000);
      return {
        shouldTweet: false,
        reason: `Waiting — next tweet in ~${minsLeft}m`,
      };
    }
  }

  // Pick a pillar
  const useTrending = Math.random() < TRENDING_CHANCE;
  const useRiddle = !useTrending && Math.random() < RIDDLE_CHANCE; // Riddles don't combine with trending
  const pillar = await selectPillar();

  if (!pillar) {
    return {
      shouldTweet: false,
      reason: "All pillars maxed out for today",
    };
  }

  // Schedule the NEXT tweet with a random gap
  const gap = randomGap();
  await setNextTweetTime(now + gap * 60000);

  const timeOfDay = getTimeOfDay();
  const flags = [useTrending ? "trending" : "", useRiddle ? "riddle" : ""].filter(Boolean).join(", ");
  return {
    shouldTweet: true,
    pillar,
    useTrending,
    useRiddle,
    reason: catchUp
      ? `Catch-up — ${tweetsNeeded} needed, ${hoursLeft}h left. Pillar: ${pillar}${flags ? ` (${flags})` : ""}. Next in ~${gap}m`
      : `${timeOfDay} tweet — #${todayCount + 1} today, pillar: ${pillar}${flags ? ` (${flags})` : ""}. Next in ~${gap}m`,
  };
}
