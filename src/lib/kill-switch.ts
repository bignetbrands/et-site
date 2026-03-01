import { kv } from "@vercel/kv";
import { debugWarn } from "./debug";

const KILL_SWITCH_KEY = "et:kill_switch";

export async function isKillSwitchActive(): Promise<boolean> {
  try {
    const val = await kv.get(KILL_SWITCH_KEY);
    // @vercel/kv auto-deserializes: "true" → boolean true, "false" → boolean false
    return val === true || val === "true";
  } catch (e) {
    debugWarn("Kill switch read failed:", e);
    return false;
  }
}

export async function setKillSwitch(enabled: boolean): Promise<void> {
  await kv.set(KILL_SWITCH_KEY, String(enabled));
}

export async function getKillSwitch(): Promise<boolean> {
  return isKillSwitchActive();
}
