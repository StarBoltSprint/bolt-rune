/**
 * Play chrome law — text labels and door wireframes stay off the film.
 * SEATS / FILMS / ROOMS / REFS and giant A/B boxes belong in Pause / forge only.
 * Play hit regions are video-layout A/B (pcg-input) with pointer-events.
 * Asteroid HOLD. No Pack seats. No Imagine cook wakes.
 */

import { playSideHitRect, zoneOfX, type PlaySide, type VideoLayout } from "./pcg-input.ts";

export const PLAY_CHROME_LABELS = ["SEATS", "FILMS", "ROOMS", "REFS"] as const;

/** Ship text. Tests lock these lines. */
export const PLAY_CHROME_LAW = [
  "play = no text chrome",
  "SEATS/FILMS/ROOMS/REFS belong in Pause / forge UI only",
  "Hit regions stay logical (video-layout A/B) — not Imagine-baked rectangles",
  "spawn = behind still; mood/profile = Vault ref only; still-pair required",
  "Doors are architecture IN the plate, not chrome rectangles on glass",
] as const;

export function playPaintsChrome(phase?: string | null, paused = false): boolean {
  if (paused) return true;
  const p = String(phase || "").trim();
  if (p === "play" || p === "run") return false;
  return p === "forge" || p === "pause" || p === "refs" || p === "gate";
}

export function playPaintsDoorBox(phase?: string | null, paused = false): boolean {
  return playPaintsChrome(phase, paused);
}

export function playPaintsLabel(label: string, phase?: string | null, paused = false): boolean {
  const tag = String(label || "").trim().toUpperCase();
  if ((PLAY_CHROME_LABELS as readonly string[]).includes(tag) && !playPaintsChrome(phase, paused)) return false;
  return playPaintsChrome(phase, paused);
}

export function playDoorAt(nx: number, ny: number): "m1" | "m2" | null {
  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
  const z = zoneOfX(nx);
  if (z === "A") return "m1";
  if (z === "B") return "m2";
  return null;
}

export function playHitRects(layout: VideoLayout): { side: PlaySide; door: "m1" | "m2"; box: VideoLayout }[] {
  return [
    { side: "A", door: "m1", box: playSideHitRect("A", layout) },
    { side: "B", door: "m2", box: playSideHitRect("B", layout) },
  ];
}
