/**
 * PCG play-loop rhythm — the chart is the film.
 * Grade taps on the cue sheet in picture-time. Never Date.now.
 * Buttons on Bolt illegal. Asteroid HOLD. No Pack seats. No coordinates.
 */

import { mayPeak, picturePhase, pictureTimeMs, type PicturePhase } from "./pcg-rail.ts";
import { afterPlate, applyTapObserve, type OnlineStrip, type TapObserve } from "./pcg-wfc.ts";

export type CueSide = "A" | "B" | "none";
export type CueKind = "walk" | "enter-arm" | "breath";
export type HitClass = "early" | "hit" | "late" | "miss" | "idle";

/** Cue window in media seconds = video.currentTime. */
export type Cue = {
  side: CueSide;
  on: number;
  off: number;
  kind: CueKind;
};

/** One film plate. Duration is from the file, never a wall clock. */
export type Plate = {
  clip: string;
  duration: number;
  cues: Cue[];
  stillStart: string;
  stillEnd: string;
};

export const COYOTE_MS_MIN = 180;
export const COYOTE_MS_MAX = 280;
/** Mid-band default. Cut at next cue.on. */
export const COYOTE_MS = 230;
export const COYOTE_S = COYOTE_MS / 1000;
/** Optional pre-on buffer that still grades Hit. */
export const PRE_ON_HIT_MS = 80;
export const PRE_ON_HIT_S = PRE_ON_HIT_MS / 1000;
/** Smoke glow: readable window must be at least this long. */
export const MIN_CUE_WINDOW_S = 0.35;
export const HOWL_COST = 0;

const HIT_M = 0.07;
const LATE_M = -0.02;
const EARLY_M = -0.015;
const IDLE_M = -0.02;
const MISS_LAMBDA = 0.32;
const DECODER_SKIP_S = 0.12;

export type PlayClock = {
  committedMs: number;
  platePlayedMs: number;
  playing: boolean;
  paused: boolean;
  hidden: boolean;
  waitingOnCook: boolean;
};

export type DoorWalkHits = { A: boolean; B: boolean };

export type PlayFreeze = {
  pictureTime: boolean;
  ca: boolean;
  wfc: boolean;
  prefetch: boolean;
};

export type HowlAct = { act: "breath"; cost: 0 };

function clamp01(n: number) {
  const x = Number(n) || 0;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

function num(n: number | null | undefined) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

export function clampCoyoteS(coyote = COYOTE_S) {
  const s = num(coyote);
  const lo = COYOTE_MS_MIN / 1000;
  const hi = COYOTE_MS_MAX / 1000;
  if (s <= 0) return COYOTE_S;
  return Math.max(lo, Math.min(hi, s));
}

/** Coyote after off, cut at the next cue's on. */
export function coyoteEnd(cue: Cue, coyote = COYOTE_S, nextOn?: number | null) {
  const off = num(cue.off);
  const end = off + clampCoyoteS(coyote);
  const cut = Number(nextOn);
  if (Number.isFinite(cut) && cut > off) return Math.min(end, cut);
  return end;
}

export function beginPlayClock(): PlayClock {
  return {
    committedMs: 0,
    platePlayedMs: 0,
    playing: true,
    paused: false,
    hidden: false,
    waitingOnCook: false,
  };
}

/**
 * Picture-time advances only while playing, not paused / hidden / waitingOnCook.
 * Never Date.now — the caller passes media dt (video.currentTime delta).
 */
export function mayAdvancePicture(clock: PlayClock): boolean {
  return Boolean(clock.playing) && !clock.paused && !clock.hidden && !clock.waitingOnCook;
}

/** Live picture-time = committed plates + time actually played on this plate. */
export function pictureTimeNow(clock: PlayClock): number {
  return Math.max(0, num(clock.committedMs) + num(clock.platePlayedMs));
}

export function advancePictureTime(clock: PlayClock, dtMs: number): PlayClock {
  if (!mayAdvancePicture(clock)) return clock;
  const dt = num(dtMs);
  if (dt <= 0) return clock;
  return { ...clock, platePlayedMs: num(clock.platePlayedMs) + dt };
}

/** On plate end: pictureTime += plateTimeActuallyPlayed. */
export function endPlateClock(clock: PlayClock, plateTimeActuallyPlayed?: number): PlayClock {
  const played = plateTimeActuallyPlayed == null ? num(clock.platePlayedMs) : Math.max(0, num(plateTimeActuallyPlayed));
  return {
    ...clock,
    committedMs: num(clock.committedMs) + played,
    platePlayedMs: 0,
  };
}

export function pausePlayClock(clock: PlayClock): PlayClock {
  return { ...clock, paused: true, playing: false };
}

export function resumePlayClock(clock: PlayClock): PlayClock {
  return { ...clock, paused: false, playing: true };
}

export function hidePlayClock(clock: PlayClock, hidden: boolean): PlayClock {
  return { ...clock, hidden: Boolean(hidden) };
}

export function cookWaitPlayClock(clock: PlayClock, waitingOnCook: boolean): PlayClock {
  return { ...clock, waitingOnCook: Boolean(waitingOnCook) };
}

export function playPhase(clock: PlayClock, momentum = 0): PicturePhase {
  return picturePhase(pictureTimeNow(clock), momentum);
}

export function playMayPeak(clock: PlayClock, momentum = 0): boolean {
  return mayPeak(pictureTimeNow(clock), momentum);
}

/** Re-export rail sum so callers stay on one clock. */
export function committedPictureTimeMs(playedPlates: Parameters<typeof pictureTimeMs>[0] = []) {
  return pictureTimeMs(playedPlates);
}

/**
 * Grade a tap at media time t against one cue.
 * Hit: on≤t≤off, or ≤80ms pre-on.
 * Late: off<t≤off+coyote (cut at nextOn).
 * Early: before the pre-on buffer.
 * Miss: past coyote (empty window).
 */
export function gradeTap(t: number, cue: Cue, coyote = COYOTE_S, nextOn?: number | null): HitClass {
  const media = num(t);
  const on = num(cue.on);
  const off = num(cue.off);
  if (off <= on) return "miss";
  if (media >= on && media <= off) return "hit";
  if (media >= on - PRE_ON_HIT_S && media < on) return "hit";
  if (media < on) return "early";
  if (media > off && media <= coyoteEnd(cue, coyote, nextOn) + 1e-9) return "late";
  return "miss";
}

/** Wrong side is always a miss. side none matches any tap. */
export function gradeTapSide(
  t: number,
  cue: Cue,
  side: CueSide | null | undefined,
  coyote = COYOTE_S,
  nextOn?: number | null,
): HitClass {
  if (side && cue.side !== "none" && side !== cue.side) return "miss";
  return gradeTap(t, cue, coyote, nextOn);
}

export function applyGradeMomentum(m: number, hit: HitClass): number {
  const cur = clamp01(m);
  if (hit === "hit") return clamp01(cur + HIT_M);
  if (hit === "late") return clamp01(cur + LATE_M);
  if (hit === "early") return clamp01(cur + EARLY_M);
  if (hit === "idle") return clamp01(cur + IDLE_M);
  if (hit === "miss") return clamp01(cur * MISS_LAMBDA);
  return cur;
}

export function observeFromGrade(hit: HitClass): TapObserve | null {
  if (hit === "hit") return "hit";
  if (hit === "late") return "late";
  if (hit === "miss") return "miss";
  if (hit === "idle") return "idle";
  return null;
}

export function noteWalkHit(hits: DoorWalkHits, cue: Cue, hit: HitClass): DoorWalkHits {
  if (hit !== "hit" || cue.kind !== "walk") return hits;
  if (cue.side === "A") return { ...hits, A: true };
  if (cue.side === "B") return { ...hits, B: true };
  return hits;
}

/** Enter-arm only after a walk Hit on that door. */
export function mayEnterArm(hits: DoorWalkHits, side: CueSide): boolean {
  if (side === "A") return Boolean(hits.A);
  if (side === "B") return Boolean(hits.B);
  return false;
}

export function gradeEnterArm(
  t: number,
  cue: Cue,
  hits: DoorWalkHits,
  coyote = COYOTE_S,
  nextOn?: number | null,
  side?: CueSide | null,
): HitClass {
  const raw = gradeTapSide(t, cue, side, coyote, nextOn);
  if (cue.kind !== "enter-arm") return raw;
  if (mayEnterArm(hits, cue.side)) return raw;
  if (raw === "hit" || raw === "late") return "miss";
  return raw;
}

export function nextCueOn(cues: readonly Cue[], i: number): number | null {
  const next = cues[i + 1];
  return next ? num(next.on) : null;
}

export function activeCueIndex(cues: readonly Cue[], t: number, coyote = COYOTE_S, graded: readonly boolean[] = []): number {
  const media = num(t);
  let soon = -1;
  let soonDt = Infinity;
  for (let i = 0; i < cues.length; i++) {
    if (graded[i]) continue;
    const cue = cues[i]!;
    const lateEnd = coyoteEnd(cue, coyote, nextCueOn(cues, i));
    if (media > lateEnd) continue;
    if (media >= cue.on - PRE_ON_HIT_S) return i;
    const dt = cue.on - media;
    if (dt >= 0 && dt < soonDt) {
      soon = i;
      soonDt = dt;
    }
  }
  return soon;
}

/**
 * Decoder skip: currentTime jumped over the window.
 * That is not a miss — the frame never sat in the cue.
 */
export function decoderSkipNotMiss(prevT: number, nextT: number, cue: Cue, coyote = COYOTE_S, nextOn?: number | null): boolean {
  const a = num(prevT);
  const b = num(nextT);
  if (!(b - a > DECODER_SKIP_S)) return false;
  return a < num(cue.on) && b > coyoteEnd(cue, coyote, nextOn);
}

export function expireCue(
  t: number,
  cue: Cue,
  coyote = COYOTE_S,
  nextOn?: number | null,
  decoderSkip = false,
): HitClass | null {
  if (decoderSkip) return null;
  if (num(t) <= coyoteEnd(cue, coyote, nextOn)) return null;
  return cue.kind === "breath" ? "idle" : "miss";
}

export type GlowIssue = { i: number; reason: "on>=off" | "off>duration" | "window<0.35s" };

/** Structural Smoke helper. Human Smoke stays visual. */
export function glowContractIssues(plate: Plate): GlowIssue[] {
  const duration = num(plate.duration);
  const issues: GlowIssue[] = [];
  for (let i = 0; i < plate.cues.length; i++) {
    const cue = plate.cues[i]!;
    const on = num(cue.on);
    const off = num(cue.off);
    if (on >= off) issues.push({ i, reason: "on>=off" });
    if (off > duration) issues.push({ i, reason: "off>duration" });
    if (off - on < MIN_CUE_WINDOW_S) issues.push({ i, reason: "window<0.35s" });
  }
  return issues;
}

export function glowReadable(plate: Plate): boolean {
  return glowContractIssues(plate).length === 0;
}

export function makePlate(input: Partial<Plate> & Pick<Plate, "clip" | "duration">): Plate {
  return {
    clip: String(input.clip || ""),
    duration: Math.max(0, num(input.duration)),
    cues: (input.cues || []).slice(),
    stillStart: String(input.stillStart || ""),
    stillEnd: String(input.stillEnd || input.stillStart || ""),
  };
}

type BeatLike = {
  at: number;
  win?: number;
  kind?: string;
  lane?: string;
};

export function sideFromLane(lane?: string | null): CueSide {
  if (lane === "l" || lane === "A" || lane === "left") return "A";
  if (lane === "r" || lane === "B" || lane === "right") return "B";
  return "none";
}

export function cueFromBeat(beat: BeatLike, duration = Infinity): Cue {
  const on = num(beat.at);
  const rawOff = on + Math.max(MIN_CUE_WINDOW_S, num(beat.win) || MIN_CUE_WINDOW_S);
  const off = Number.isFinite(duration) && duration > 0 ? Math.min(duration, rawOff) : rawOff;
  const lane = beat.kind === "left" ? "l" : beat.kind === "right" ? "r" : beat.lane;
  const kind: CueKind = beat.kind === "left" || beat.kind === "right" || beat.kind === "swipe" ? "walk" : "breath";
  return { side: sideFromLane(lane), on, off, kind };
}

export function cuesFromBeats(beats: readonly BeatLike[] = [], duration = Infinity): Cue[] {
  return beats.map((beat) => cueFromBeat(beat, duration));
}

/** Howl is a breath act. Never spends. Never Imagine. */
export function howlAct(): HowlAct {
  return { act: "breath", cost: HOWL_COST };
}

const nodeStill = new Map<string, string>();

/** Last committed still of a node. Not undo Keep enter. */
export function commitNodeStill(nodeId: string, still?: string | null) {
  const id = String(nodeId || "").trim();
  const url = String(still || "").trim();
  if (!id || !url) return;
  nodeStill.set(id, url);
}

export function recallStill(nodeId: string, plate?: Plate | null): string {
  const id = String(nodeId || "").trim();
  if (id && nodeStill.has(id)) return nodeStill.get(id) || "";
  return String(plate?.stillEnd || plate?.stillStart || "").trim();
}

export function clearNodeStills() {
  nodeStill.clear();
}

export function pauseFreeze(): PlayFreeze {
  return { pictureTime: true, ca: true, wfc: true, prefetch: true };
}

export function mayAdvanceWfc(clock: PlayClock): boolean {
  return mayAdvancePicture(clock);
}

export function mayPrefetch(clock: PlayClock): boolean {
  return mayAdvancePicture(clock);
}

export function applyPlayTap(
  strip: OnlineStrip,
  i: number,
  hit: HitClass,
  m: number,
  pictureTime: number,
): OnlineStrip {
  const tap = observeFromGrade(hit);
  if (!tap) return strip;
  return applyTapObserve(strip, i, tap, m, pictureTime);
}

export function afterPlayPlate(
  strip: OnlineStrip,
  i: number,
  hit: HitClass,
  m: number,
  pictureTime: number,
): OnlineStrip {
  const tap = observeFromGrade(hit) ?? "idle";
  return afterPlate(strip, i, tap, m, pictureTime);
}

export function plateTapFromGrades(grades: readonly HitClass[]): TapObserve {
  let miss = 0;
  let hit = 0;
  let late = 0;
  for (const g of grades) {
    if (g === "miss") miss += 1;
    else if (g === "hit") hit += 1;
    else if (g === "late") late += 1;
  }
  if (miss > 0) return "miss";
  if (hit > 0) return "hit";
  if (late > 0) return "late";
  return "idle";
}
