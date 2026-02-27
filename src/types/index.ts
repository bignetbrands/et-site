export type ContentPillar =
  | "human_observation"
  | "research_drop"
  | "crypto_community"
  | "personal_lore"
  | "existential"
  | "disclosure_conspiracy";

export interface PillarConfig {
  name: string;
  description: string;
  tone: string;
  dailyTarget: { min: number; max: number };
  model: "sonnet" | "opus";
  generateImage: boolean;
  exampleTweets: string[];
}

export interface GeneratedTweet {
  text: string;
  pillar: ContentPillar;
  imageUrl?: string;
  rawImageUrl?: string; // Original DALL-E URL (before film processing) — used for posting
  imageMediaId?: string;
}

export interface TweetRecord {
  id: string;
  text: string;
  pillar: ContentPillar;
  postedAt: string;
  hasImage: boolean;
}

export interface DailyState {
  date: string;
  tweets: TweetRecord[];
  pillarCounts: Record<ContentPillar, number>;
}

export interface SchedulerDecision {
  shouldTweet: boolean;
  pillar?: ContentPillar;
  useTrending?: boolean;
  reason: string;
}
