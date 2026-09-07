/**
 * Hung Door A / sprint playback rate.
 *
 * A MISS steps pace down by PACE_MISS_STEP (0.1). Hits may still raise pace
 * (see FilmStage judge). Floor is PACE_MIN (0.5) — the sensible 0.4–0.5 band;
 * 0.5 keeps the MP4 readable so a miss streak cannot crawl or stall the loop.
 */
export const PACE_MISS_STEP = 0.1;
export const PACE_MIN = 0.5;
export const PACE_MAX = 8;

export function paceAfterMiss(pace: number): number {
  return Math.max(PACE_MIN, pace - PACE_MISS_STEP);
}
