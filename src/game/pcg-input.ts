/**
 * Bolt Engine play input.
 * Hardware reports side (A/B) and when. The film already chose A or B.
 * Hit math is VIDEO LAYOUT (object-fit contain / 9:16), not raw screen.
 * Same cue sheet as audio / haptics / a11y. No XYZ, no WASD locomotion, no second camera.
 * Asteroid HOLD. No Pack seats.
 */

import { RESONANCE_GUTTER, RESONANCE_HEIGHT, type CueSide } from "./pcg-play.ts";

export const FRAME_ASPECT = 9 / 16;
/** Left / right hit bands of the picture. Center ~20% is not a grade. */
export const SIDE_BAND = 0.4;
export const CENTER_LO = SIDE_BAND;
export const CENTER_HI = 1 - SIDE_BAND;
/** Device-edge gutter so iOS swipe-back cannot steal a miss on A. */
export const EDGE_GUTTER_PX = 24;
export const LONG_PRESS_MS = 480;
export const DOUBLE_TAP_S = 0.36;
export const SWIPE_MIN_PX = 36;

export type HitZone = "A" | "B" | "center" | "gutter" | "outside" | "resonance";
export type PlaySide = "A" | "B";

export type VideoLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type EdgeInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type PlayKeyAct =
  | { kind: "side"; side: PlaySide }
  | { kind: "howl" }
  | { kind: "recall" }
  | { kind: "pause" }
  | { kind: "mute" };

export type PlayIntent =
  | { act: "grade"; side: PlaySide }
  | { act: "enter"; side: PlaySide }
  | { act: "howl" }
  | { act: "recall" }
  | { act: "pause" }
  | { act: "mute" }
  | { act: "ignore" };

export type TapMemory = {
  side: PlaySide;
  playhead: number;
};

export type HowlMode = "hold" | "tap";

const ZERO_INSET: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

function num(n: number | null | undefined) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

/**
 * object-fit: contain of a 9:16 lock-off inside the viewport (or safe box).
 * Landscape pillarboxes the same picture — A/B stay left/right of the *picture*.
 */
export function videoLayoutRect(vw: number, vh: number, inset: EdgeInsets = ZERO_INSET): VideoLayout {
  const left = Math.max(0, num(inset.left));
  const right = Math.max(0, num(inset.right));
  const top = Math.max(0, num(inset.top));
  const bottom = Math.max(0, num(inset.bottom));
  const boxW = Math.max(1, num(vw) - left - right);
  const boxH = Math.max(1, num(vh) - top - bottom);
  const view = boxW / boxH;
  if (view > FRAME_ASPECT) {
    const h = boxH;
    const w = h * FRAME_ASPECT;
    return { x: left + (boxW - w) / 2, y: top, w, h };
  }
  const w = boxW;
  const h = w / FRAME_ASPECT;
  return { x: left, y: top + (boxH - h) / 2, w, h };
}

export function contactInLayout(
  clientX: number,
  clientY: number,
  origin: { left: number; top: number },
  layout: VideoLayout,
): { nx: number; ny: number; inside: boolean } {
  const x = num(clientX) - num(origin.left) - layout.x;
  const y = num(clientY) - num(origin.top) - layout.y;
  const nx = layout.w > 0 ? x / layout.w : 0;
  const ny = layout.h > 0 ? y / layout.h : 0;
  const inside = nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1;
  return { nx, ny, inside };
}

/** Resonance chrome is never a hit target — pointer-events none + this guard. */
export function inResonanceBar(nx: number, ny: number): boolean {
  if (nx < RESONANCE_GUTTER || nx > 1 - RESONANCE_GUTTER) return false;
  return ny >= 1 - RESONANCE_HEIGHT;
}

/**
 * Map picture-normalized x to a zone.
 * Default: A ~left 40%, B ~right 40%, center ~20%.
 * Widen 50/50: no dead center (Howl stays on H / long-press if the press started center).
 */
export function zoneOfX(nx: number, widen = false): "A" | "B" | "center" {
  if (widen) return nx < 0.5 ? "A" : "B";
  if (nx < CENTER_LO) return "A";
  if (nx > CENTER_HI) return "B";
  return "center";
}

export function mapPlayContact(input: {
  clientX: number;
  clientY: number;
  viewport: { left: number; top: number; w: number; h: number };
  layout?: VideoLayout;
  widen?: boolean;
  gutterPx?: number;
}): { zone: HitZone; nx: number; ny: number; side: CueSide | null } {
  const gutter = input.gutterPx ?? EDGE_GUTTER_PX;
  const localX = num(input.clientX) - num(input.viewport.left);
  const localY = num(input.clientY) - num(input.viewport.top);
  if (localX < gutter || localX > input.viewport.w - gutter) {
    return { zone: "gutter", nx: 0, ny: 0, side: null };
  }
  const layout = input.layout ?? videoLayoutRect(input.viewport.w, input.viewport.h);
  const hit = contactInLayout(input.clientX, input.clientY, input.viewport, layout);
  if (!hit.inside) return { zone: "outside", nx: hit.nx, ny: hit.ny, side: null };
  if (inResonanceBar(hit.nx, hit.ny)) return { zone: "resonance", nx: hit.nx, ny: hit.ny, side: null };
  const band = zoneOfX(hit.nx, Boolean(input.widen));
  const side: CueSide | null = band === "center" ? null : band;
  return { zone: band, nx: hit.nx, ny: hit.ny, side };
}

/** Short dead-center tap = ignore. Long-press center / Howl key = breath. Tap mode is Pause-assist. */
export function centerTapIntent(kind: "short" | "long", howlMode: HowlMode = "hold"): "ignore" | "howl" {
  if (kind === "long") return "howl";
  return howlMode === "tap" ? "howl" : "ignore";
}

export function swipeSideOf(dx: number, minPx = SWIPE_MIN_PX): PlaySide | null {
  if (Math.abs(num(dx)) < minPx) return null;
  return dx < 0 ? "A" : "B";
}

/** Double-tap enter is gated on armed. Never force auto-enter. */
export function mayDoubleTapEnter(armed: boolean, sameSide: boolean): boolean {
  return Boolean(armed) && Boolean(sameSide);
}

export function isDoubleTap(prev: TapMemory | null | undefined, next: TapMemory, windowS = DOUBLE_TAP_S): boolean {
  if (!prev || prev.side !== next.side) return false;
  return Math.abs(num(next.playhead) - num(prev.playhead)) <= windowS;
}

/**
 * Keyboard: ←/A = side A, →/D = side B; H Howl, R Recall, Esc Pause, M mute.
 * W/S / arrows U/D are not locomotion. Volume keys stay OS volume.
 */
export function keyPlayAct(code: string): PlayKeyAct | null {
  const c = String(code || "");
  if (c === "ArrowLeft" || c === "KeyA") return { kind: "side", side: "A" };
  if (c === "ArrowRight" || c === "KeyD") return { kind: "side", side: "B" };
  if (c === "KeyH") return { kind: "howl" };
  if (c === "KeyR") return { kind: "recall" };
  if (c === "Escape" || c === "KeyP") return { kind: "pause" };
  if (c === "KeyM") return { kind: "mute" };
  return null;
}

export function isLocomotionKey(code: string): boolean {
  const c = String(code || "");
  return c === "KeyW" || c === "KeyS" || c === "ArrowUp" || c === "ArrowDown" || c === "KeyX" || c === "KeyY" || c === "KeyZ";
}

export function chromePauseOnly(target: EventTarget | null | undefined): boolean {
  const node = target instanceof Element ? target : null;
  if (!node) return false;
  return Boolean(node.closest("[data-seat],[data-ticket],[data-pause-only]"));
}

export function resolvePlayPointer(input: {
  zone: HitZone;
  side?: PlaySide | null;
  swipe?: PlaySide | null;
  center?: "short" | "long";
  howlMode?: HowlMode;
  armed?: boolean;
  prev?: TapMemory | null;
  playhead?: number;
}): PlayIntent {
  if (input.zone === "gutter" || input.zone === "resonance") return { act: "ignore" };
  if (input.zone === "outside") return { act: "pause" };
  const side = input.swipe || input.side || (input.zone === "A" || input.zone === "B" ? input.zone : null);
  if (input.zone === "center" && !input.swipe) {
    return centerTapIntent(input.center || "short", input.howlMode) === "howl" ? { act: "howl" } : { act: "ignore" };
  }
  if (!side) return { act: "ignore" };
  const next: TapMemory = { side, playhead: num(input.playhead) };
  if (isDoubleTap(input.prev, next) && mayDoubleTapEnter(Boolean(input.armed), true)) {
    return { act: "enter", side };
  }
  return { act: "grade", side };
}

export function laneOfSide(side: PlaySide): "l" | "r" {
  return side === "A" ? "l" : "r";
}
