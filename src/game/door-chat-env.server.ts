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
  HALL_SEAT_IDS,
  HALL_SEATS,
  seatWakeDebugFlags,
  type HallSeatId,
  type SeatWakeDebug,
} from "./door-chat";
import {
  bagFromProcessEnv,
  bagFromSecretFiles,
  mergeSecretBags,
  pickSecret,
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

/**
 * Why a seat is wired or not. Booleans + urlKind only — never the URL.
 * `urlKind: "non-http"` is the grok sidebar / deep-link leftover case.
 */
export function inspectSeatWakeDebug(): Record<HallSeatId, SeatWakeDebug> {
  const live = bagFromProcessEnv(liveProcessEnv());
  const inlined = bagFromProcessEnv(inlinedSeatEnv());
  const baked = BAKED_SEAT_SECRETS && typeof BAKED_SEAT_SECRETS === "object" ? BAKED_SEAT_SECRETS : {};
  const disk = diskSecretBag();
  const resolved = loadSeatSecretEnv();
  const out = {} as Record<HallSeatId, SeatWakeDebug>;
  for (const id of HALL_SEAT_IDS) {
    const key = HALL_SEATS[id].wakeEnv;
    out[id] = seatWakeDebugFlags({
      resolved: pickSecret(resolved, key),
      live: pickSecret(live, key),
      inlined: pickSecret(inlined, key),
      baked: pickSecret(baked, key),
      disk: pickSecret(disk, key),
    });
  }
  return out;
}
