import { kv } from "@vercel/kv";

const KILL_SWITCH_KEY = "et:kill_switch";

/**
 * Check if kill switch is active. Used by the cron route.
 */
export async function isKillSwitchActive(): Promise<boolean> {
  try {
    const enabled = await kv.get<boolean>(KILL_SWITCH_KEY);
    return enabled === true;
  } catch {
    return false; // If KV is down, default to active (don't block posting)
  }
}

/**
 * Set kill switch state.
 */
export async function setKillSwitch(enabled: boolean): Promise<void> {
  await kv.set(KILL_SWITCH_KEY, enabled);
}

/**
 * Get kill switch state.
 */
export async function getKillSwitch(): Promise<boolean> {
  try {
    const enabled = await kv.get<boolean>(KILL_SWITCH_KEY);
    return enabled === true;
  } catch {
    return false;
  }
}
