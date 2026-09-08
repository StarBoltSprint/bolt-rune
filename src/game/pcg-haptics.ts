/**
 * Bolt Engine haptics — same cue sheet as gradeTap / audio. Not a second game.
 * navigator.vibrate is ok. Never block the play thread. Never invent BPM.
 * Intensity must NOT encode A vs B as the only signal.
 * Mute / reduce motion / system haptic off → no vibration.
 * Cue-on tick is OPTIONAL and OFF by default (spoils the film).
 * Don't haptic every lightning frame. Pause / ticket: none on Bolt.
 * Asteroid HOLD. No Pack seats.
 */

import type { HitClass } from "./pcg-play.ts";

export type HapticShot = "cue-on" | "hit" | "late" | "miss" | "enter-armed" | "howl" | "pause" | "ticket";

/** Patterns are grade/kind only — no side channel. */
export const HAPTIC_PATTERN: Record<HapticShot, readonly number[]> = {
  "cue-on": [8],
  hit: [22],
  late: [12],
  miss: [10, 36, 10],
  "enter-armed": [34],
  howl: [72],
  pause: [],
  ticket: [],
};

export type HapticPrefs = {
  muted?: boolean;
  reduceMotion?: boolean;
  systemOff?: boolean;
  /** Cue-on tick. Default off. */
  cueOn?: boolean;
};

export type HapticEvent = {
  shot: HapticShot;
  pattern: readonly number[];
  fired: boolean;
};

function emptyPattern(pattern: readonly number[]) {
  return pattern.length === 0 || pattern.every((n) => n <= 0);
}

export function hapticForGrade(hit: HitClass): HapticShot | null {
  if (hit === "hit") return "hit";
  if (hit === "late") return "late";
  if (hit === "miss") return "miss";
  return null;
}

export function mayHaptic(prefs: HapticPrefs = {}): boolean {
  if (prefs.muted || prefs.reduceMotion || prefs.systemOff) return false;
  return true;
}

export function hapticPattern(shot: HapticShot, prefs: HapticPrefs = {}): readonly number[] | null {
  if (shot === "cue-on" && !prefs.cueOn) return null;
  if (shot === "pause" || shot === "ticket") return null;
  if (!mayHaptic(prefs)) return null;
  const pattern = HAPTIC_PATTERN[shot];
  if (emptyPattern(pattern)) return null;
  return pattern;
}

/** Same pattern for A or B — side must not change intensity. */
export function hapticForSide(_side: "A" | "B" | null | undefined, shot: HapticShot, prefs: HapticPrefs = {}) {
  return hapticPattern(shot, prefs);
}

export function fireGradeHaptic(hit: HitClass | HapticShot, prefs: HapticPrefs = {}): HapticEvent | null {
  const shot = (hit === "hit" || hit === "late" || hit === "miss" ? hapticForGrade(hit) : hit) as HapticShot | null;
  if (!shot) return null;
  const pattern = hapticPattern(shot, prefs);
  if (!pattern) return null;
  queueHaptic(pattern);
  return { shot, pattern, fired: true };
}

function queueHaptic(pattern: readonly number[]) {
  try {
    const vibrate = typeof navigator !== "undefined" ? navigator.vibrate?.bind(navigator) : undefined;
    if (!vibrate) return;
    queueMicrotask(() => {
      try {
        vibrate(pattern.slice());
      } catch {
        /* never block play */
      }
    });
  } catch {
    /* never block play */
  }
}
