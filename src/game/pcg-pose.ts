/**
 * Citadel pose state machine — film graph, not a 3D dungeon.
 * Always two doors A/B. Poses: spawn | atA | atB. Modes: breath | walk | enter | paused.
 * Walk = pose-transition clip. Breath = idle film on a pose (hall frozen, feet glued, side none).
 * HARD LOCK: breath ALWAYS loops until walk / Howl / Pause / enter. Never play-once-then-freeze.
 * loop=true ONLY for breath|decay. Walk/enter: loop=false, then the machine chains to breath.
 * Walk ended → pose=arrive → play breath(pose) loop. onEnded while already breath → same breath(pose); pose unchanged.
 * A breath lap must NOT recook, arm enter, raise m, advance WFC, or tick wall-clock.
 * Pose advances on plate ended, never on tap. Armed only on a walk Hit.
 * Picture-time only — never Date.now in states. Relic is not door C.
 * A/B taps (video-layout hit regions) feed this SM. Asteroid HOLD. No Pack seats. No Imagine wakes.
 */

import {
  MIN_CUE_WINDOW_S,
  activeCueIndex,
  gradeTapSide,
  pauseFreeze,
  type Cue,
  type CueSide,
  type HitClass,
  type PlayFreeze,
} from "./pcg-play.ts";
import { playNodeId } from "./play-frame.ts";
import { mayPaidEnterCook, type PaidEnterTicket } from "./pcg-rail.ts";

export type CitadelPose = "spawn" | "atA" | "atB";
export type PoseMode = "breath" | "walk" | "enter" | "paused";
export type DoorSide = "A" | "B";

export type PoseClipId =
  | "breath-spawn"
  | "breath-A"
  | "breath-B"
  | "walk-spawn-A"
  | "walk-spawn-B"
  | "walk-A-B"
  | "walk-B-A"
  | "enter-A"
  | "enter-B"
  | "decay";

export type PoseClipShelf = Partial<Record<PoseClipId, string>>;

export type PoseState = {
  pose: CitadelPose;
  mode: PoseMode;
  armed: { A: boolean; B: boolean };
  side: CueSide;
  clip: PoseClipId;
  /** Breath plates are always true. Never a one-shot freeze. */
  loop: boolean;
  committedHall: boolean;
  cookQueued: boolean;
  waitingOnCook: boolean;
  pictureMs: number;
  /** Current plate clock. Reset on every plan→run swap. Not wall-clock. */
  plateTimeMs: number;
  /** Breath/decay native-loop count. Laps do not change pose or recook. */
  breathLaps: number;
  walkFrom: CitadelPose;
  walkSide: CueSide;
  pausedFrom?: PoseMode;
};

/** Keep graph — seed + halls + A/B edges. Share ids, never a mesh. */
export type KeepEdge = { from: string; side: DoorSide; to: string; clipKey?: PoseClipId };
export type KeepHall = {
  id: string;
  biome?: string;
  chunkA?: string;
  chunkB?: string;
  poses: readonly CitadelPose[];
  clips: PoseClipShelf;
  /** Aligned stills per pose — not a minimap. */
  stills?: Partial<Record<CitadelPose, { stillStart?: string; stillEnd?: string }>>;
};
export type CitadelKeep = { seed: string; nodes: KeepHall[]; edges: KeepEdge[] };

/** Keep / hall schema — ship text. Tests lock these lines. */
export const KEEP_LAW = [
  "Keep = { seed s, nodes: Hall[], edges: { from, side: A|B, to, clipKey? } }",
  "Citadel starts Hall0 catalog biome pose spawn; grows only via enter PASS (or Hang existing artifact).",
  "Share = seed + node/chunk ids not mesh.",
  "New Citadel = new s; Continue = this graph. No minimap.",
  "Hall = biome + chunkA/B + poses spawn|atA|atB + clips (breath-spawn/A/B, walk-spawn-A/B, optional A-B/B-A, decay) + aligned stills.",
  "Always two doors in spawn plan. Walk = same node other pose. Enter = new node + spawn + bone quiet reset.",
  "Room = same Hall memory with enter to other biome tag — never a 3D cube vs corridor.",
  "Dead-end = no legal edges → breath only.",
  "Healthy Keep ~4–8 halls; always 2 doors; ~6 stock clips + 1–2 enters. PCG picks which chunk on A/B, not door count.",
] as const;

/** Library plate the SM may play. No clip, no move. */
export type PosePlateAct = "breath" | "walk" | "enter" | "decay";
export type PosePlate = {
  id: PoseClipId | string;
  url: string;
  duration: number;
  cues: Cue[];
  stillStart: string;
  stillEnd: string;
  poseStart: CitadelPose;
  poseEnd: CitadelPose;
  biome?: string;
  act: PosePlateAct;
  side?: DoorSide | "none";
  smoke?: "PASS" | "FAIL";
};

export type PlateResolve = "play" | "cook-decay" | "decay";

/** Clip / plate library — ship text. Tests lock these lines. */
export const CLIP_LIBRARY_LAW = [
  "Citadel is a library of clips the SM may play — not streamed geometry.",
  "Plate = { id, url, duration, cues[], stillStart, stillEnd, poseStart, poseEnd, biome, act: breath|walk|enter|decay, side?, smoke PASS }",
  "No clip, no move. Missing + no ticket → decay, not spinner.",
  "breath: idle on pose, loop yes, no pose change, stock",
  "walk: spawn→A / A→B, loop no, pose yes, stock first",
  "enter: hall→Hall′, loop no, reset spawn new hall, ticket if new; ONLY clip that may add Keep node",
  "decay: fail-forward, optional loop, no rewrite Keep, prepaid stock",
  "IDs: {biome}/breath-{spawn|atA|atB}, {biome}/walk-spawn-A, {biome}/walk-A-B, {biome}/decay, {from}→{to}/enter-A",
  "Cache key for cooked = id + railsVersion + seed/slots hash. Catalog stock ignores run seed.",
  "stillEnd(walk-spawn-A) === stillStart(breath-A) → cut; else short dissolve.",
  "Authors: catalog stock ~6–8/biome; hung artifacts same shape; cooked Imagine only on confirm → Smoke → cache.",
  "Play thread only load(url) of PASS.",
  "Cues: walk one window one side; breath side none; enter optional one-shot enter-arm.",
  "resolve: PASS+url → prepare→transition→play; missing+ticket → queueCook+decay; missing/FAIL → decay.",
  "Preload next family (after walk-A, breath-A prio 0).",
  "NOT a clip: 3D room, nav path, one long citadel video, Resonance, door seat chat.",
  "walk-A-B and walk-B-A remain OPTIONAL in the library.",
  "Minimum playable hall stock: breath-spawn, breath-A, breath-B, walk-spawn-A, walk-spawn-B, decay.",
  "If cross-walk missing: from atA tap B → stay breath-A (fail-forward), player can Recall→spawn then walk-spawn-B. Do not require authors to cook A↔B.",
] as const;

/** Play leftovers — ship text. Tests lock these lines. */
export const PLAY_LEFTOVERS_LAW = [
  "Walk = pose translation, NOT camera.",
  "Truck/orbit/follow-through-door = enter wearing walk tag → Smoke FAIL / don't match breath-A.",
  "Never blend walk→walk. ended(walk) ALWAYS → breath(newPose).",
  "First breath after walk: start at t=0.",
  "Hall change ONLY enter plate + Keep rewrite + spawn breath new biome.",
  "Walk through doorway must NOT onHallCommitted.",
  "armed dies when leaving door: walk-A-B / Howl / Recall → armed.A=false.",
  "Decay = pose-preserving stay.",
  "Fail-forward decay in current pose if have it; else spawn breath.",
  "Picture-time on loop wrap: loop=true MUST detect currentTime wrap.",
  "After enter PASS: drop old hall warm walks from preload; keep decay + new spawn breath.",
  "No stick forward. Forward = film-lit side.",
  "Holding A through walk does not auto-enter.",
] as const;

/** PASS+url plays; ticket queues cook under decay; else fail-forward decay. */
export function resolvePlatePath(
  plate?: Pick<PosePlate, "url" | "smoke"> | null,
  ticket?: boolean,
): PlateResolve {
  const url = String(plate?.url || "").trim();
  if (url && plate?.smoke === "PASS") return "play";
  if (ticket) return "cook-decay";
  return "decay";
}

export type DoorLit = "unlit" | "lit" | "armed" | "committed" | "blocked";

export type PoseAct = "stay" | "walk" | "enter" | "decay" | "howl" | "recall" | "pause" | "resume";

export type PoseResult = {
  state: PoseState;
  act: PoseAct;
  clipId: PoseClipId;
  url: string;
};

export type PoseIntent =
  | { act: "grade"; side: DoorSide }
  | { act: "enter"; side: DoorSide }
  | { act: "howl" }
  | { act: "recall" }
  | { act: "pause" }
  | { act: "resume" }
  | { act: "miss" };

export type PoseContext = {
  shelf?: PoseClipShelf;
  ticket?: PaidEnterTicket | boolean | "" | null;
  mediaT?: number;
  duration?: number;
  cues?: Cue[];
  enterPass?: boolean;
};

/** Walk-A chart: 0–1.5 none, 1.5–2.8 A walk, rest none. One Hit. Ends at-A. */
export const WALK_APPROACH_S = 1.5;
export const WALK_HIT_OFF_S = 2.8;

/** Relic is an extra pin, never a third front door. Hang pins A/B — no 3rd hitbox. */
export const RELIC_IS_DOOR_C = false;
export const DOOR_SIDES = ["A", "B"] as const;
export const DOOR_COUNT = 2;
export const ENTER_ARM_ONCE_S = 1.2;

/** Door law — ship text. Tests lock these lines. */
export const DOOR_LAW = [
  "Doors are NOT meshes. They are two sides of the plan + arm state.",
  "Layers: pixels (glow A/B), hitbox (L/R 9:16 only in on..off+coyote), graph edge Hall--A/B→, clip (walk changes pose, enter changes room).",
  "Always two doors in encode — never one, never three. Relic ≠ door C.",
  "Per-side states: unlit | lit | armed | committed | blocked. armed.A does not arm B.",
  "spawn + tap A → walk-spawn-A if clip else fail-forward (do not invent door)",
  "during walk-A cue: Hit → armed.A; Late → not armed; Miss/wrong side → not armed, m drops",
  "atA + tap A: if armed + enter PASS cached → play enter-A; if armed + ticket → cook + decay wait; else stay breath-A (no free double-tap)",
  "atA + tap B → walk-A-B if clip else stay",
  "Enter NEVER first tap from spawn — must have walked with Hit first",
  "A is an edge not a destination; graph picks `to`",
  "Walk cues ONLY on walk clips. breath-atA: side none, except one short enter-arm ONCE after Hit — not every loop (prevents m farm)",
  "Both doors glow same time = Smoke FAIL; tap A during glow B = Miss; Recall mid-walk → spawn armed off; Howl mid-walk → breath fromPose; Enter Smoke FAIL → graph intact decay armed off; illegal adjacency → blocked no cook",
  "Hang pins chunk on edge A/B without adding a 3rd hitbox.",
] as const;

/** Four nested clocks — do not mix. Tests lock these lines. */
export const NESTED_CYCLES_LAW = [
  "Four nested clocks — do not mix:",
  "1) Micro plate (6–15s): play→cues→grade→ended→transition→play. Does not change room alone.",
  "2) Room poses: breath-spawn ⇄ walk → breath-atA/B; Howl=re-breath; Recall=spawn; Pause=out. Breath loops. No mandatory peak here.",
  "3) Bone ~60s picture-time: quiet→lean→peak permitted; miss=decay. Unit=sum of played plates. WFC+m+CA. Idle/Howl advance bone (slow decay); Pause does not. Peak = permission on SAME A/B not a 5th door.",
  "4) Citadel graph: Hall enter→Hall′ (ticket, Smoke PASS), rare/paid, always respawn breath-spawn.",
  "One tap crosses ONE level at a time. If spawn tap does planet+lightning, cycle is broken.",
  "Enter PASS restarts bone to quiet in new hall.",
  "Anti-patterns already known: breath-as-walk; enter every walk; wall-clock peak; breath re-grade glow; walk→walk without breath.",
] as const;

const EMPTY_ARMED = { A: false, B: false };

function num(n: number | null | undefined) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function shelfOf(ctx?: PoseContext): PoseClipShelf {
  return ctx?.shelf || {};
}

function clipUrl(shelf: PoseClipShelf, id: PoseClipId): string {
  return String(shelf[id] || "").trim();
}

function hasTicket(ticket?: PoseContext["ticket"]): boolean {
  if (ticket === true) return true;
  if (ticket === "confirm" || ticket === "forge" || ticket === "ticket") return mayPaidEnterCook(ticket);
  return false;
}

export function isDoorSide(v: unknown): v is DoorSide {
  return v === "A" || v === "B";
}

export function poseOfNode(node?: string | null): CitadelPose {
  const id = playNodeId(node);
  if (id === "m1") return "atA";
  if (id === "m2") return "atB";
  return "spawn";
}

export function nodeOfPose(pose: CitadelPose): "spawn" | "m1" | "m2" {
  if (pose === "atA") return "m1";
  if (pose === "atB") return "m2";
  return "spawn";
}

export function doorOfPose(pose: CitadelPose): DoorSide | "none" {
  if (pose === "atA") return "A";
  if (pose === "atB") return "B";
  return "none";
}

export function poseAtSide(pose: CitadelPose, side: DoorSide): boolean {
  return doorOfPose(pose) === side;
}

export function breathClip(pose: CitadelPose): PoseClipId {
  if (pose === "atA") return "breath-A";
  if (pose === "atB") return "breath-B";
  return "breath-spawn";
}

export function plateIsBreath(clip?: PoseClipId | null): boolean {
  return clip === "breath-spawn" || clip === "breath-A" || clip === "breath-B";
}

/**
 * walkClip(from, side) — pose-transition id.
 * Already standing at that door → null (same-door tap uses armed for enter, else stay breath).
 * Optional A↔B ids are returned even if the shelf has not cached them yet.
 */
export function walkClip(from: CitadelPose, side: DoorSide): PoseClipId | null {
  if (from === "atA" && side === "A") return null;
  if (from === "atB" && side === "B") return null;
  if (from === "spawn" && side === "A") return "walk-spawn-A";
  if (from === "spawn" && side === "B") return "walk-spawn-B";
  if (from === "atA" && side === "B") return "walk-A-B";
  if (from === "atB" && side === "A") return "walk-B-A";
  return null;
}

export function enterClip(side: DoorSide): PoseClipId {
  return side === "A" ? "enter-A" : "enter-B";
}

/** Arrive only after the walk plate ends. Tap never calls this. */
export function arrive(fromPose: CitadelPose, side: DoorSide): CitadelPose {
  void fromPose;
  return side === "A" ? "atA" : "atB";
}

export function poseOfSide(side: DoorSide): CitadelPose {
  return side === "A" ? "atA" : "atB";
}

/** Breath-after-walk loop law — ship text. Tests lock these six lines. */
export const BREATH_AFTER_WALK_LAW = [
  "walk ended → pose arrive → play breath(pose) with loop=true",
  "onEnded while already breath → same breath(pose) again (loop), pose unchanged",
  "loop=true ONLY for breath|decay; walk/enter loop=false then chain to breath",
  "NEVER play-once-then-freeze for breath",
  "loop must not recook / arm enter / raise m / advance WFC / wall-clock; idle-decay m per media second",
  "dual-buffer WAAPI transitions + stock/cache-only preload (max 4)",
] as const;

/**
 * HARD LOCK: loop=true ONLY when the act is breath|decay.
 * Walk / enter play once (loop=false); the machine then chains to breath.
 */
export function actLoops(act?: PoseAct | PosePlateAct | PoseMode | string | null): boolean {
  return act === "breath" || act === "decay";
}

/**
 * HARD LOCK: breath ALWAYS loops until the next act (walk / Howl / Pause / enter).
 * Never "play once then freeze last frame." Picture never stops on a still freeze for breath.
 */
export function poseBreathLoops(state: PoseState): boolean {
  if (state.mode === "breath") return true;
  if (plateIsBreath(state.clip)) return true;
  if (state.clip === "decay") return true;
  if (state.mode === "paused" && (state.pausedFrom === "breath" || plateIsBreath(state.clip) || state.clip === "decay")) return true;
  return false;
}

/** Breath plates must not seek-to-end + pause. Walk/enter may end. */
export function mayFreezePlate(state: PoseState): boolean {
  if (poseBreathLoops(state) || state.mode === "breath" || plateIsBreath(state.clip)) return false;
  return state.mode === "walk" || state.mode === "enter";
}

export function landBreath(pose: CitadelPose, prev?: Partial<PoseState>): PoseState {
  return {
    pose,
    mode: "breath",
    armed: prev?.armed ? { A: Boolean(prev.armed.A), B: Boolean(prev.armed.B) } : { ...EMPTY_ARMED },
    side: "none",
    clip: breathClip(pose),
    loop: true,
    committedHall: Boolean(prev?.committedHall),
    cookQueued: Boolean(prev?.cookQueued),
    waitingOnCook: Boolean(prev?.waitingOnCook),
    pictureMs: Math.max(0, num(prev?.pictureMs)),
    plateTimeMs: 0,
    breathLaps: 0,
    walkFrom: pose,
    walkSide: "none",
    pausedFrom: undefined,
  };
}

export function beginPose(): PoseState {
  return landBreath("spawn");
}

/** Spawn / hall-entry law — ship text. Tests lock these lines. */
export const SPAWN_LAW = [
  "Hall entry: pose=spawn, clip=breath-spawn loop. Center of hall, not stuck to a door, not already running. Both A and B readable in same lock-off frame.",
  "pictureTime=0, m ~0.15–0.25, quiet phase, no required glow first ~2s.",
  "Sequence: load hall → still cook-biome.jpg spawn → play breath-spawn → tap A/B → walk-spawn-* → breath-at*.",
  "First enter only after walk Hit + second pulse. Nobody spawns into Hall′ mid-run.",
  "Forbidden: spawn mid-walk; spawn facing only one door; spawn after failed enter as if Hall′ existed; camera not lock-off behind him.",
  "New Citadel / new room: always spawn+breath. Continue restores Keep node; safe play = breath on saved pose (may show atA still if Keep saved it), never resume mid-cut walk clip.",
] as const;

export const SPAWN_QUIET_MS = 2000;

export function isHallSpawn(state: PoseState): boolean {
  return state.pose === "spawn" && state.mode === "breath" && state.clip === "breath-spawn" && state.loop;
}

/** No required door glow for the first ~2s of spawn breath. */
export function spawnGlowRequired(pictureMs: number): boolean {
  return num(pictureMs) >= SPAWN_QUIET_MS;
}

/**
 * Continue / Load: breath on the saved pose. Never resume a mid-cut walk or enter clip.
 * Mid-walk save lands breath on walkFrom (fromPose), not atA mid-sprint.
 */
export function continueKeepPose(saved?: Partial<PoseState> | CitadelPose | null): PoseState {
  if (saved === "atA" || saved === "atB" || saved === "spawn") return landBreath(saved);
  const row = saved && typeof saved === "object" ? saved : null;
  const midCut = row?.mode === "walk" || row?.mode === "enter";
  const pose = midCut ? row?.walkFrom || "spawn" : row?.pose || "spawn";
  return landBreath(pose, row || undefined);
}

export function resultOf(state: PoseState, act: PoseAct, shelf: PoseClipShelf = {}): PoseResult {
  return { state, act, clipId: state.clip, url: clipUrl(shelf, state.clip) };
}

export function breathCueSheet(duration: number): Cue[] {
  const d = Math.max(0, num(duration));
  return [{ side: "none", on: 0, off: d, kind: "breath" }];
}

export function walkCueSheet(side: DoorSide, duration: number): Cue[] {
  const d = Math.max(MIN_CUE_WINDOW_S, num(duration));
  const hitOff = Math.min(WALK_HIT_OFF_S, d);
  const hitOn = Math.min(WALK_APPROACH_S, Math.max(0, hitOff - MIN_CUE_WINDOW_S));
  const walkOff = Math.max(hitOn + MIN_CUE_WINDOW_S, hitOff);
  const cues: Cue[] = [];
  if (hitOn > 0) cues.push({ side: "none", on: 0, off: hitOn, kind: "breath" });
  cues.push({ side, on: hitOn, off: Math.min(d, walkOff), kind: "walk" });
  const tailOn = cues[cues.length - 1]!.off;
  if (d - tailOn >= MIN_CUE_WINDOW_S) cues.push({ side: "none", on: tailOn, off: d, kind: "breath" });
  return cues;
}

/** No miss if no tap — expireCue already returns idle for kind breath. */
export function breathMissesIfIdle(_state?: PoseState): false {
  return false;
}

export function poseCues(state: PoseState, duration: number): Cue[] {
  if (state.mode === "walk" && isDoorSide(state.walkSide)) return walkCueSheet(state.walkSide, duration);
  if (state.mode === "enter" && isDoorSide(state.side)) {
    const d = Math.max(MIN_CUE_WINDOW_S, num(duration));
    return [{ side: state.side, on: 0, off: d, kind: "enter-arm" }];
  }
  const d = Math.max(0, num(duration));
  const armed = state.armed.A && poseAtSide(state.pose, "A") ? "A" : state.armed.B && poseAtSide(state.pose, "B") ? "B" : null;
  if (state.mode === "breath" && armed && num(state.breathLaps) === 0 && d > 0) {
    const off = Math.min(d, Math.max(MIN_CUE_WINDOW_S, ENTER_ARM_ONCE_S));
    const cues: Cue[] = [{ side: armed, on: 0, off, kind: "enter-arm" }];
    if (d - off >= MIN_CUE_WINDOW_S) cues.push({ side: "none", on: off, off: d, kind: "breath" });
    return cues;
  }
  return breathCueSheet(duration);
}

/** Two door glows overlapping = Smoke FAIL. Walk sheets are one side only. */
export function bothDoorsGlow(cues: Cue[] = []): boolean {
  const lit = cues.filter((c) => c.side === "A" || c.side === "B");
  for (let i = 0; i < lit.length; i++) {
    for (let j = i + 1; j < lit.length; j++) {
      const a = lit[i]!;
      const b = lit[j]!;
      if (a.side !== b.side && a.on < b.off && b.on < a.off) return true;
    }
  }
  return false;
}

export function cookWaitPose(state: PoseState, waitingOnCook: boolean): PoseState {
  return landBreath(state.pose, { ...state, waitingOnCook: Boolean(waitingOnCook) });
}

export function missPose(state: PoseState): PoseState {
  return landBreath(state.pose, { ...state, waitingOnCook: false, cookQueued: false });
}

/** Howl law — ship text. Tests lock these lines. */
export const HOWL_LAW = [
  "Howl = intentional breath. Not heal, not Pause, not miss.",
  "Pause: clock frozen, m frozen, same clip freeze, armed unchanged.",
  "Howl: clock runs, same idle-decay 0.95^dt, (re)launch breath(pose) loop, armed=false, credits 0.",
  "Idle doing nothing: clock runs, idle-decay, existing breath loop, armed unchanged.",
  "No extra -0.05 on Howl (Recall only). No miss λ=0.7 on Howl.",
  "Howl during walk: abandon trip, return breath on fromPose (walk start pose), do NOT teleport to atA mid-sprint.",
  "H / long-press center → armed=false; play breath(pose); loop ok.",
] as const;

export const HOWL_HOLD_MS = 420;

/** Center band for long-press Howl. Not a third door. */
export function centerHowlHit(nx: number, ny: number): boolean {
  return nx >= 0.42 && nx <= 0.58 && ny >= 0.22 && ny <= 0.72;
}

/**
 * Howl = intentional breath. Not heal, not Pause, not miss.
 * Walk abandons the trip — return to walkFrom (fromPose), never teleport mid-sprint.
 * armed=false. Clock keeps running. Credits 0. No extra −0.05 (Recall only).
 */
export function howlPose(state: PoseState): PoseState {
  const fromPose = state.mode === "walk" ? state.walkFrom : state.pose;
  return landBreath(fromPose, {
    ...state,
    waitingOnCook: false,
    cookQueued: false,
    armed: { ...EMPTY_ARMED },
  });
}

/** Cancel uncommitted cook. Return spawn breath. Committed Hall′ stays (do not undo Keep). */
export function recallPose(state: PoseState): PoseState {
  return landBreath("spawn", {
    ...state,
    cookQueued: false,
    waitingOnCook: false,
    armed: { ...EMPTY_ARMED },
    committedHall: Boolean(state.committedHall),
  });
}

export function pausePose(state: PoseState): PoseState {
  if (state.mode === "paused") return state;
  return {
    ...state,
    mode: "paused",
    pausedFrom: state.mode,
    loop: state.mode === "breath" || plateIsBreath(state.clip) || state.loop,
  };
}

export function resumePose(state: PoseState): PoseState {
  if (state.mode !== "paused") return state;
  const back = state.pausedFrom || "breath";
  if (back === "breath" || back === "paused") return landBreath(state.pose, { ...state, pausedFrom: undefined });
  return { ...state, mode: back, pausedFrom: undefined, loop: back === "breath" };
}

export function poseFreeze(state: PoseState): PlayFreeze {
  if (state.mode === "paused") return pauseFreeze();
  return { pictureTime: false, ca: false, wfc: false, prefetch: false };
}

/** Picture-time only. Caller passes media dt. Never Date.now. */
export function advancePosePicture(state: PoseState, dtMs: number): PoseState {
  if (state.mode === "paused" || state.waitingOnCook) return state;
  const dt = num(dtMs);
  if (dt <= 0) return state;
  return { ...state, pictureMs: state.pictureMs + dt, plateTimeMs: num(state.plateTimeMs) + dt };
}

/**
 * Armed only on Hit during walk. Early / Late / miss do not arm.
 * Pose does not move.
 */
export function gradePoseTap(state: PoseState, side: DoorSide, t: number, cues?: Cue[]): { state: PoseState; hit: HitClass | null } {
  if (state.mode !== "walk") return { state, hit: null };
  const duration = cues?.length ? Math.max(...cues.map((c) => c.off)) : 8;
  const sheet = cues?.length ? cues : walkCueSheet(isDoorSide(state.walkSide) ? state.walkSide : side, duration);
  const walk = sheet.find((c) => c.kind === "walk");
  if (!walk) return { state, hit: null };
  const hit = gradeTapSide(t, walk, side);
  if (hit === "hit" && (walk.side === "none" || walk.side === side)) {
    return { state: { ...state, armed: { ...state.armed, [side]: true } }, hit };
  }
  return { state, hit };
}

export function resetForNewHall(state: PoseState): PoseState {
  return landBreath("spawn", {
    pictureMs: 0,
    committedHall: true,
    cookQueued: false,
    waitingOnCook: false,
    armed: { ...EMPTY_ARMED },
  });
}

/**
 * Native-loop / ended while already breath|decay.
 * Replay the SAME breath(pose). Do not change pose, armed, or cook. Do not recook.
 */
export function onBreathLap(state: PoseState): PoseState {
  const looping = state.mode === "breath" || plateIsBreath(state.clip) || state.clip === "decay";
  if (!looping) return landBreath(state.pose, state);
  return {
    ...state,
    mode: "breath",
    pose: state.pose,
    clip: state.clip === "decay" ? "decay" : breathClip(state.pose),
    loop: true,
    side: "none",
    plateTimeMs: 0,
    breathLaps: num(state.breathLaps) + 1,
    walkFrom: state.pose,
    walkSide: "none",
    pausedFrom: undefined,
  };
}

/**
 * Walk plate ended → pose = arrive(from, side) then breath(pose) with loop=true.
 * Enter PASS → resetForNewHall (Keep commits Hall′).
 * Enter fail → stay breath.
 * Already breath|decay → onBreathLap (same pose/clip). Never freeze.
 */
export function onEndedPose(state: PoseState, ctx?: PoseContext): PoseState {
  if (state.mode === "walk" && isDoorSide(state.walkSide)) {
    return landBreath(arrive(state.walkFrom, state.walkSide), state);
  }
  if (state.mode === "enter") {
    if (ctx?.enterPass) return resetForNewHall(state);
    return landBreath(state.pose, { ...state, cookQueued: false, armed: { ...EMPTY_ARMED } });
  }
  if (state.mode === "paused") return state;
  if (state.mode === "breath" || plateIsBreath(state.clip) || state.clip === "decay") {
    return onBreathLap(state);
  }
  return landBreath(state.pose, state);
}

/** Per-side door light. armed.A does not arm B. Doors are sides of the plan, not meshes. */
export function doorLitOf(state: PoseState, side: DoorSide): DoorLit {
  if (state.mode === "enter" && state.side === side) return "committed";
  if (state.armed[side]) return "armed";
  if (state.mode === "walk" && state.walkSide === side) return "lit";
  if (!walkClip(state.pose, side) && !poseAtSide(state.pose, side)) return "blocked";
  return "unlit";
}

function stayBreath(state: PoseState, shelf: PoseClipShelf, act: PoseAct = "stay"): PoseResult {
  const next = landBreath(state.pose, state);
  return resultOf(next, act, shelf);
}

function failForwardBreath(state: PoseState, shelf: PoseClipShelf): PoseResult {
  const decay = clipUrl(shelf, "decay");
  if (decay) {
    const next = landBreath(state.pose, state);
    return resultOf({ ...next, clip: "decay", loop: true }, "decay", shelf);
  }
  return resultOf(landBreath("spawn", { ...state, armed: { ...EMPTY_ARMED } }), "stay", shelf);
}

function tryEnter(state: PoseState, side: DoorSide, ctx: PoseContext): PoseResult {
  const shelf = shelfOf(ctx);
  if (!poseAtSide(state.pose, side) || !state.armed[side]) return stayBreath(state, shelf);
  const id = enterClip(side);
  const url = clipUrl(shelf, id);
  if (url) {
    const next: PoseState = {
      ...state,
      mode: "enter",
      side,
      clip: id,
      loop: false,
      walkSide: side,
      waitingOnCook: false,
      plateTimeMs: 0,
    };
    return { state: next, act: "enter", clipId: id, url };
  }
  if (hasTicket(ctx.ticket)) {
    const queued = landBreath(state.pose, { ...state, cookQueued: true });
    if (clipUrl(shelf, "decay")) return resultOf({ ...queued, clip: "decay", loop: true }, "decay", shelf);
    return resultOf(queued, "decay", shelf);
  }
  return stayBreath(state, shelf);
}

function tryWalk(state: PoseState, side: DoorSide, ctx: PoseContext): PoseResult {
  const shelf = shelfOf(ctx);
  const id = walkClip(state.pose, side);
  if (!id) return tryEnter(state, side, ctx);
  const url = clipUrl(shelf, id);
  if (!url) return failForwardBreath(state, shelf);
  const next: PoseState = {
    ...state,
    mode: "walk",
    side,
    clip: id,
    loop: false,
    armed: { ...EMPTY_ARMED },
    walkFrom: state.pose,
    walkSide: side,
    waitingOnCook: false,
    plateTimeMs: 0,
  };
  return { state: next, act: "walk", clipId: id, url };
}

/**
 * A/B tap (from video-layout hit regions) while living.
 * Breath + far side → walk if cached, else decay / stay breath (no spinner).
 * Breath + same door + armed → enter (or queueCook + decay if ticket).
 * Walk → gradeTap only; Hit arms; pose stays until onEnded.
 */
export function applyPoseIntent(state: PoseState, intent: PoseIntent, ctx: PoseContext = {}): PoseResult {
  const shelf = shelfOf(ctx);
  if (intent.act === "pause") return resultOf(pausePose(state), "pause", shelf);
  if (intent.act === "resume") return resultOf(resumePose(state), "resume", shelf);
  if (intent.act === "howl") return resultOf(howlPose(state), "howl", shelf);
  if (intent.act === "recall") return resultOf(recallPose(state), "recall", shelf);
  if (intent.act === "miss") return resultOf(missPose(state), "stay", shelf);

  if (state.mode === "paused") return resultOf(state, "stay", shelf);
  if (state.waitingOnCook) return resultOf(cookWaitPose(state, true), "stay", shelf);

  const side = intent.side;
  if (state.mode === "walk") {
    const graded = gradePoseTap(state, side, num(ctx.mediaT), ctx.cues);
    return resultOf(graded.state, "stay", shelf);
  }
  if (state.mode === "enter") return resultOf(state, "stay", shelf);
  if (intent.act === "enter") return tryEnter(state, side, ctx);
  return tryWalk(state, side, ctx);
}

export function tapPose(state: PoseState, side: DoorSide, ctx: PoseContext = {}): PoseResult {
  return applyPoseIntent(state, { act: "grade", side }, ctx);
}

/** Sync Load / spawn / Howl onto breath at a node. Always looping. */
export function adoptPoseNode(state: PoseState, node?: string | null): PoseState {
  return landBreath(poseOfNode(node), state);
}

export function poseLoopAttr(state: PoseState): "1" | "0" {
  return poseBreathLoops(state) ? "1" : "0";
}
