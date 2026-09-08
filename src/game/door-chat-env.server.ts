/**
 * Server-only seat secret loader. Never import from a React component.
 *
 * Grok Build Clés secrètes do not reliably become `process.env.SMOKE_WAKE_URL`
 * on the Vercel handler. This reads, in order:
 *   1. live `globalThis.process.env` (runtime Vercel / Node)
 *   2. explicit `process.env.SMOKE_WAKE_URL` etc. (Vite may inline at build)
 *   3. `virtual:seat-secrets` baked from `.grok/*` + builder env at `vite build`
 *   4. `.grok` / `data` secret files still on disk
 *
 * Wake URLs never come from VITE_*.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BAKED_SEAT_SECRETS } from "virtual:seat-secrets";
import {
  bagFromProcessEnv,
  bagFromSecretFiles,
  mergeSecretBags,
  seatSecretSlice,
} from "../../scripts/grok-seat-secrets.mjs";

export { SEAT_SECRET_KEYS } from "../../scripts/grok-seat-secrets.mjs";

function readUtf8(rel: string, root: string) {
  return readFileSync(join(root, rel), "utf8");
}

/** Vite/Nitro cannot statically replace `globalThis.process.env[dynamicKey]`. */
export function liveProcessEnv(): Record<string, string | undefined> {
  try {
    const env = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } })
      .process?.env;
    return env && typeof env === "object" ? env : {};
  } catch {
    return {};
  }
}

/**
 * Static member access so a Grok Build / Vite define of these keys at
 * `vite build` still lands in the server bundle when runtime env is empty.
 */
export function inlinedSeatEnv(): Record<string, string | undefined> {
  return {
    DOOR_WAKE_URL: process.env.DOOR_WAKE_URL,
    SMOKE_WAKE_URL: process.env.SMOKE_WAKE_URL,
    DOOR_BOT_ID: process.env.DOOR_BOT_ID,
    SMOKE_BOT_ID: process.env.SMOKE_BOT_ID,
    DOOR_CHAT_WAKE_SECRET: process.env.DOOR_CHAT_WAKE_SECRET,
    GROK_DOOR_WAKE_URL: process.env.GROK_DOOR_WAKE_URL,
    GROK_SMOKE_WAKE_URL: process.env.GROK_SMOKE_WAKE_URL,
    GROK_SECRETS: process.env.GROK_SECRETS,
    GROK_APP_SECRETS: process.env.GROK_APP_SECRETS,
    GROK_SECRET_KEYS: process.env.GROK_SECRET_KEYS,
    APP_SECRETS: process.env.APP_SECRETS,
    SEAT_SECRETS: process.env.SEAT_SECRETS,
  };
}

function diskSecretBag(): Record<string, string | undefined> {
  try {
    return bagFromSecretFiles(process.cwd(), readUtf8);
  } catch {
    return {};
  }
}

/** Canonical seat keys only. Safe to pass into `resolveSeatWake`. */
export function loadSeatSecretEnv(): Record<string, string> {
  return seatSecretSlice(
    mergeSecretBags(
      BAKED_SEAT_SECRETS,
      bagFromProcessEnv(inlinedSeatEnv()),
      diskSecretBag(),
      bagFromProcessEnv(liveProcessEnv()),
    ),
  );
}
