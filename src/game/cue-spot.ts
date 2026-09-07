import type { Beat, BeatKind, Lane, Spot } from "./films";

/**
 * In-picture SmiR ticks stay on the turn aisle / vault gap — never on Bolt
 * (the white GSD center silhouette). Picture x: 0 left, 1 right; y: 0 top.
 *
 * Left aisle ≤ CUE_AISLE_LEFT; right aisle ≥ CUE_AISLE_RIGHT.
 * Mid-path y is CUE_PATH_Y_MIN…CUE_PATH_Y_MAX (not on his back).
 * Jump / vault sits slightly above the path, in the vault gap — not x=0.5.
 */
export const CUE_AISLE_LEFT = 0.22;
export const CUE_AISLE_RIGHT = 0.78;
export const CUE_PATH_Y_MIN = 0.5;
export const CUE_PATH_Y_MAX = 0.62;
/** Vault gap — off his body, slightly above mid-path. */
export const CUE_JUMP_X = 0.28;
export const CUE_JUMP_Y = 0.42;
/** Center-dog band. Any cue that lands here is pushed off his silhouette. */
export const BOLT_BODY_X0 = 0.3;
export const BOLT_BODY_X1 = 0.7;

type CueBeat = {
  kind: BeatKind;
  lane: Lane;
  label: string;
  spot?: Spot;
  relic?: Spot;
};

export function spotOf(beat: Pick<Beat, "spot" | "relic">): Spot {
  return beat.spot ?? beat.relic ?? { x: 0.5, y: 0.5 };
}

export function cueSide(beat: CueBeat): "left" | "right" | "center" {
  if (beat.kind === "left") return "left";
  if (beat.kind === "right") return "right";
  if (beat.kind === "tap" && beat.lane === "c") return "center";
  if (/jump|vault|↑/i.test(beat.label)) return "center";
  if (beat.lane === "l") return "left";
  if (beat.lane === "r") return "right";
  return "center";
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function onBoltBody(x: number) {
  return x >= BOLT_BODY_X0 && x <= BOLT_BODY_X1;
}

/** Picture-space tick at the turn lane / vault — never over Bolt, never the Resonance HUD row. */
export function cuePictureSpot(beat: CueBeat): Spot {
  const side = cueSide(beat);
  const spot = spotOf(beat);
  const pathY = clamp(spot.y > 0.7 ? 0.56 : spot.y, CUE_PATH_Y_MIN, CUE_PATH_Y_MAX);
  if (side === "left") {
    const x = Math.min(spot.x, CUE_AISLE_LEFT);
    return { x: onBoltBody(x) ? CUE_AISLE_LEFT : x, y: pathY };
  }
  if (side === "right") {
    const x = Math.max(spot.x, CUE_AISLE_RIGHT);
    return { x: onBoltBody(x) ? CUE_AISLE_RIGHT : x, y: pathY };
  }
  /* Jump / vault — slightly above the path, into the vault gap. Never x on center-dog. */
  return {
    x: onBoltBody(spot.x) ? CUE_JUMP_X : spot.x,
    y: CUE_JUMP_Y,
  };
}
