import { ContentPillar, SchedulerDecision } from "@/types";
import { PILLAR_CONFIGS } from "./prompts";
import {
  getDailyState,
  getAvailablePillars,
  getUnderservedPillars,
  getLastTweetTime,
  getTodayTweetCount,
} from "./store";

// ============================================================
// SCHEDULE CONFIG
// ============================================================

// ET's "active hours" — he sleeps (or pretends to)
const ACTIVE_START_HOUR = 9; // 9 AM UTC (adjust for your timezone)
const ACTIVE_END_HOUR = 3; // 3 AM UTC (next day — late night ET)

const DAILY_TWEET_TARGET = { min: 7, max: 10 };

// Minimum gap between tweets (minutes) — prevents robotic rapid-fire
const MIN_GAP_MINUTES = 30;

// Probability of tweeting in any given hourly check
// Higher during peak hours, lower during off-peak
const TWEET_PROBABILITY: Record<string, number> = {
  morning: 0.55, // 9-12: moderate
  afternoon: 0.65, // 12-18: higher activity
  evening: 0.7, // 18-22: peak hours
  latenight: 0.45, // 22-3: contemplative, less frequent
};

// ============================================================
// TIME HELPERS
// ============================================================

function getCurrentHourUTC(): number {
  return new Date().getUTCHours();
}

function isActiveHour(): boolean {
  const hour = getCurrentHourUTC();
  // Active from ACTIVE_START_HOUR to ACTIVE_END_HOUR (wrapping past midnight)
  if (ACTIVE_START_HOUR < ACTIVE_END_HOUR) {
    return hour >= ACTIVE_START_HOUR && hour < ACTIVE_END_HOUR;
  }
  // Wraps past midnight (e.g., 9 AM to 3 AM)
  return hour >= ACTIVE_START_HOUR || hour < ACTIVE_END_HOUR;
}

function getTimeOfDay(): "morning" | "afternoon" | "evening" | "latenight" {
  const hour = getCurrentHourUTC();
  if (hour >= 9 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "latenight";
}

/**
 * Returns hours remaining in ET's active day.
 */
function getActiveHoursRemaining(): number {
  const hour = getCurrentHourUTC();
  if (ACTIVE_END_HOUR > ACTIVE_START_HOUR) {
    return Math.max(0, ACTIVE_END_HOUR - hour);
  }
  // Wraps past midnight
  if (hour >= ACTIVE_START_HOUR) {
    return 24 - hour + ACTIVE_END_HOUR;
  }
  return Math.max(0, ACTIVE_END_HOUR - hour);
}

// ============================================================
// PILLAR SELECTION
// ============================================================

/**
 * Pick which pillar to tweet from, weighted by need and time of day.
 */
async function selectPillar(): Promise<ContentPillar | null> {
  const available = await getAvailablePillars();
  if (available.length === 0) return null;

  const underserved = await getUnderservedPillars();
  const hoursLeft = getActiveHoursRemaining();
  const timeOfDay = getTimeOfDay();

  // If we have underserved pillars and limited time, prioritize them
  if (underserved.length > 0 && hoursLeft <= underserved.length + 2) {
    return weightedRandom(underserved, timeOfDay);
  }

  // 70% chance to pick from underserved if any exist, 30% from all available
  if (underserved.length > 0 && Math.random() < 0.7) {
    return weightedRandom(underserved, timeOfDay);
  }

  return weightedRandom(available, timeOfDay);
}

/**
 * Weighted random pillar selection based on time of day.
 */
function weightedRandom(
  pillars: ContentPillar[],
  timeOfDay: string
): ContentPillar {
  // Time-based weights: certain content fits better at certain times
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

  return pillars[0]; // Fallback
}

// ============================================================
// MAIN SCHEDULER DECISION
// ============================================================

/**
 * Should ET tweet right now?
 * Returns a decision with reasoning.
 */
export async function shouldTweet(): Promise<SchedulerDecision> {
  // Check if we're in active hours
  if (!isActiveHour()) {
    return {
      shouldTweet: false,
      reason: "Outside active hours — ET is resting",
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

  // Check minimum gap
  const lastTime = await getLastTweetTime();
  if (lastTime) {
    const minutesSince =
      (Date.now() - lastTime.getTime()) / (1000 * 60);
    if (minutesSince < MIN_GAP_MINUTES) {
      return {
        shouldTweet: false,
        reason: `Too soon — ${Math.round(minutesSince)}m since last tweet (min ${MIN_GAP_MINUTES}m)`,
      };
    }
  }

  // Check if we're falling behind and need to catch up
  const hoursLeft = getActiveHoursRemaining();
  const tweetsNeeded = DAILY_TWEET_TARGET.min - todayCount;

  if (tweetsNeeded > 0 && hoursLeft <= tweetsNeeded + 1) {
    // Running low on time — force a tweet
    const pillar = await selectPillar();
    if (!pillar) {
      return {
        shouldTweet: false,
        reason: "All pillars maxed out for today",
      };
    }
    return {
      shouldTweet: true,
      pillar,
      reason: `Catch-up mode — ${tweetsNeeded} tweets needed, ${hoursLeft}h left`,
    };
  }

  // Probabilistic decision based on time of day
  const timeOfDay = getTimeOfDay();
  const probability = TWEET_PROBABILITY[timeOfDay] || 0.5;

  // Add slight boost if we're below minimum
  const adjustedProbability =
    todayCount < DAILY_TWEET_TARGET.min
      ? Math.min(probability + 0.15, 0.9)
      : probability;

  if (Math.random() > adjustedProbability) {
    return {
      shouldTweet: false,
      reason: `Probabilistic skip (${Math.round(adjustedProbability * 100)}% chance, rolled no)`,
    };
  }

  // Pick a pillar
  const pillar = await selectPillar();
  if (!pillar) {
    return {
      shouldTweet: false,
      reason: "All pillars maxed out for today",
    };
  }

  return {
    shouldTweet: true,
    pillar,
    reason: `${timeOfDay} tweet — ${todayCount + 1} today, pillar: ${pillar}`,
  };
}
