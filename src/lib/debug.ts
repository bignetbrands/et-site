/**
 * Debug mode for ET bot.
 * 
 * DEV:  Set ET_DEBUG=true in Vercel env vars → verbose logging everywhere
 * PROD: Remove ET_DEBUG or set to false → only critical errors logged
 * 
 * Usage: import { debug, debugWarn, debugError } from "./debug";
 */

export const DEBUG = process.env.ET_DEBUG === "true";

/** Log only in debug mode */
export function debug(...args: unknown[]): void {
  if (DEBUG) console.log("[DEBUG]", ...args);
}

/** Warn only in debug mode (non-critical failures) */
export function debugWarn(...args: unknown[]): void {
  if (DEBUG) console.warn("[DEBUG WARN]", ...args);
}

/** Always log — critical errors that affect behavior regardless of mode */
export function critical(...args: unknown[]): void {
  console.error("[CRITICAL]", ...args);
}
