/**
 * Bolt Engine play a11y. Same cue sheet — not a second game.
 * Playable with no sound, no haptics, color-not-only (side + door shape).
 * Pause anywhere = clock freeze. One hand portrait.
 * No auto-Hit. No forced auto-enter. No required speech. No text on the dog.
 * Asteroid HOLD. No Pack seats.
 */

import {
  ASSIST_COYOTE_S,
  COYOTE_S,
  clampCoyoteS,
  type HitClass,
} from "./pcg-play.ts";
import type { HowlMode } from "./pcg-input.ts";

export type PlayA11y = {
  /** 350–400ms Late assist. Still Late — no free peak. */
  coyoteAssist: boolean;
  howlMode: HowlMode;
  /** 50/50 A/B. Resonance stays dead to hits. */
  hitboxWiden: boolean;
  /** Off. No required speech. */
  captions: false;
  /** Cap lightning slots. Bar does not strobe. */
  reduceFlash: boolean;
  /** Cue-on haptic tick. Default off. */
  cueOnHaptic: boolean;
};

export const DEFAULT_PLAY_A11Y: PlayA11y = {
  coyoteAssist: false,
  howlMode: "hold",
  hitboxWiden: false,
  captions: false,
  reduceFlash: false,
  cueOnHaptic: false,
};

export function defaultPlayA11y(): PlayA11y {
  return { ...DEFAULT_PLAY_A11Y };
}

export function playCoyoteS(a11y: PlayA11y | null | undefined): number {
  return clampCoyoteS(a11y?.coyoteAssist ? ASSIST_COYOTE_S : COYOTE_S);
}

/** Assist Late is still Late. Peak stays on picture-time × m — never a free peak. */
export function assistStillLate(hit: HitClass): boolean {
  return hit === "late";
}

export function reduceMotionOn(prefers?: boolean): boolean {
  if (prefers != null) return Boolean(prefers);
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function flashCap(a11y: PlayA11y | null | undefined, slots = 1): number {
  if (a11y?.reduceFlash) return Math.min(1, slots);
  return slots;
}

export const PLAY_A11Y_LABEL = {
  surface: "Play film. Left or right.",
  pause: "Pause menu",
  coyote: "Larger late window",
  howlHold: "Hold center to Howl",
  howlTap: "Tap center to Howl",
  widen: "Wider left and right",
  flash: "Reduce flash",
  captions: "Captions off",
} as const;
