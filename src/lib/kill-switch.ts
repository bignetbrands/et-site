import { createClient, type RedisClientType } from "redis";

const KILL_SWITCH_KEY = "et:kill_switch";

let _client: RedisClientType | null = null;

async function getRedis(): Promise<RedisClientType | null> {
  if (!process.env.REDIS_URL) return null;
  if (_client && _client.isOpen) return _client;
  try {
    _client = createClient({ url: process.env.REDIS_URL });
    _client.on("error", (err: Error) => console.error("[Redis] Error:", err));
    await _client.connect();
    return _client;
  } catch (e) {
    console.warn("[Redis] Connection failed:", e);
    return null;
  }
}

export async function isKillSwitchActive(): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return false;
  try {
    const val = await redis.get(KILL_SWITCH_KEY);
    return val === "true";
  } catch {
    return false;
  }
}

export async function setKillSwitch(enabled: boolean): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    await redis.set(KILL_SWITCH_KEY, String(enabled));
  }
}

export async function getKillSwitch(): Promise<boolean> {
  return isKillSwitchActive();
}
