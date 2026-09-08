/**
 * Picture-time audio buses (SmiR).
 * Picture stays the clock. Audio is a second layer that must obey that clock, not replace it.
 *
 * Two buses:
 * 1) Plate/Imagine — diegetic weather (space tone, wind, paw, lightning). Locked to clip decode.
 *    Mute if a strong musical downbeat mismatches cue.on, or speech / countdown / TAP voice.
 * 2) Engine — Hit/Late/Miss ticks, Resonance drain, Howl, UI seats. Fired from GRADE, not a DAW grid.
 *
 * Engine one-shots: Hit soft crystal tick; Late quieter/duller; Miss short drain/wind (no buzzer/voice);
 * Early silence; Idle bed only; Peak = film storm already, no second drop. Don't stereo-pan A/B only.
 *
 * Trail CA: none thin bed; thin light crackle; full storm; decay filter over 1 plate — don't snap storm off.
 * Mute M / system: both buses; picture-time still grades. Pause freezes both. Howl sound once.
 *
 * No wav assets in this tree — placeholder Web Audio oscillators / noise buffers (documented).
 * Prefetch stock includes audio decode. No second audio-only Imagine cook.
 * No wall-clock metronome. Click track must not tick in Pause or Imagine lag.
 * Asteroid HOLD. No Pack seats.
 */

import type { SmokeResult } from "./smoke-gate.ts";

/** Local aliases — no runtime import from pcg-play / pcg-prompt (keeps play-clip prefetch acyclic). */
export type HitClass = "early" | "hit" | "late" | "miss" | "idle";
export type TrailSlot = "none" | "thin" | "full";
export type PlayClockLike = {
  paused?: boolean;
  waitingOnCook?: boolean;
  hidden?: boolean;
};

export type AudioBus = "plate" | "engine";
export type EngineShot = "hit" | "late" | "miss" | "early" | "idle" | "peak" | "howl" | "drain";
export type TrailVoice = "thin-bed" | "light-crackle" | "storm" | "decay-filter";
export type PlateKind = "space" | "wind" | "paw" | "lightning" | "crackle" | "storm" | "decay";

/** Placeholder voices — no wav / mp3 shipped. Web Audio oscillators implement these. */
export const AUDIO_PLACEHOLDER = "oscillator" as const;

export const ENGINE_VOICES = {
  hit: { kind: "crystal-tick", gain: 0.14, dull: false, pan: 0 },
  late: { kind: "crystal-tick", gain: 0.08, dull: true, pan: 0 },
  miss: { kind: "drain-wind", gain: 0.09, buzzer: false, voice: false, pan: 0 },
  early: { kind: "silence", gain: 0, pan: 0 },
  idle: { kind: "bed-only", gain: 0, pan: 0 },
  peak: { kind: "none", gain: 0, pan: 0 },
  howl: { kind: "breath-howl", gain: 0.1, once: true, pan: 0 },
  drain: { kind: "drain-wind", gain: 0.07, buzzer: false, voice: false, pan: 0 },
} as const;

export type PictureAudioClock = {
  /** video.currentTime — same playhead as cue.on */
  playhead: number;
  paused: boolean;
  waitingOnCook: boolean;
  hidden?: boolean;
  muted?: boolean;
  trail?: TrailSlot | null;
  role?: string | null;
  /** Plate index. Trail CA / decay step only when this advances. */
  plate?: number;
};

export type EngineEvent = {
  bus: "engine";
  shot: EngineShot;
  playhead: number;
  audible: boolean;
};

export type PictureAudioState = {
  playhead: number;
  held: boolean;
  muted: { plate: boolean; engine: boolean };
  bedsFrozen: boolean;
  plateOpen: boolean;
  trail: TrailSlot;
  trailVoice: TrailVoice;
  decayFilter: number;
  lastEngine: EngineEvent | null;
  engineEvents: EngineEvent[];
  howlCount: number;
  prefetch: string[];
  cook: false;
  placeholder: typeof AUDIO_PLACEHOLDER;
  platePolicy: "open" | "mismatch-downbeat" | "speech" | "countdown" | "tap-voice" | "held" | "muted";
};

type Session = {
  playhead: number;
  paused: boolean;
  waitingOnCook: boolean;
  hidden: boolean;
  muted: boolean;
  platePolicy: PictureAudioState["platePolicy"];
  trail: TrailSlot;
  role: string;
  prevTrail: TrailSlot;
  decayFilter: number;
  lastEngine: EngineEvent | null;
  engineEvents: EngineEvent[];
  howlCount: number;
  prefetch: string[];
  plate: number;
};

const DECAY_PER_PLATE = 1;

function emptySession(): Session {
  return {
    playhead: 0,
    paused: false,
    waitingOnCook: false,
    hidden: false,
    muted: false,
    platePolicy: "open",
    trail: "none",
    role: "",
    prevTrail: "none",
    decayFilter: 0,
    lastEngine: null,
    engineEvents: [],
    howlCount: 0,
    prefetch: [],
    plate: -1,
  };
}

let session = emptySession();

function num(n: number | null | undefined) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

export function resetPictureAudio() {
  session = emptySession();
}

export function audioHeld(clock: Pick<PictureAudioClock, "paused" | "waitingOnCook" | "hidden">): boolean {
  return Boolean(clock.paused || clock.waitingOnCook || clock.hidden);
}

export function audioMaySound(clock: PictureAudioClock): boolean {
  if (clock.muted || session.muted) return false;
  if (audioHeld(clock)) return false;
  return true;
}

/** Click track / score follows the picture. Never ticks in Pause or Imagine lag. */
export function clickTrackMayTick(clock: PictureAudioClock = session): boolean {
  return audioMaySound(clock);
}

export function clockFromPlay(play: PlayClockLike, playhead: number): PictureAudioClock {
  return {
    playhead: num(playhead),
    paused: Boolean(play.paused),
    waitingOnCook: Boolean(play.waitingOnCook),
    hidden: Boolean(play.hidden),
  };
}

export function trailVoiceOf(trail: TrailSlot, decayFilter = 0, role?: string | null): TrailVoice {
  if (decayFilter > 0 || role === "decay") return "decay-filter";
  if (trail === "full") return "storm";
  if (trail === "thin") return "light-crackle";
  return "thin-bed";
}

/** Mute plate weather when it would fight the cue sheet or speak. */
export function platePolicyMute(opts: {
  downbeatMismatch?: boolean;
  speech?: boolean;
  countdown?: boolean;
  tapVoice?: boolean;
}): PictureAudioState["platePolicy"] | null {
  if (opts.downbeatMismatch) return "mismatch-downbeat";
  if (opts.speech) return "speech";
  if (opts.countdown) return "countdown";
  if (opts.tapVoice) return "tap-voice";
  return null;
}

export function applyPlatePolicy(opts: {
  downbeatMismatch?: boolean;
  speech?: boolean;
  countdown?: boolean;
  tapVoice?: boolean;
}): PictureAudioState["platePolicy"] {
  const reason = platePolicyMute(opts);
  session.platePolicy = reason || "open";
  return session.platePolicy;
}

export function plateMaySound(clock: PictureAudioClock = session): boolean {
  if (!audioMaySound(clock)) return false;
  if (session.platePolicy !== "open") return false;
  return true;
}

function sameShot(a: EngineEvent | null, shot: EngineShot, playhead: number) {
  if (!a) return false;
  return a.shot === shot && Math.abs(a.playhead - playhead) < 0.08;
}

function audibleShot(shot: EngineShot): boolean {
  if (shot === "early" || shot === "idle" || shot === "peak") return false;
  return ENGINE_VOICES[shot].gain > 0;
}

/**
 * Fire an engine one-shot from a gradeTap result.
 * Early is silence. Idle is bed only. Peak never adds a second drop.
 */
export function fireGradeAudio(hit: HitClass | EngineShot, playhead = session.playhead): EngineEvent | null {
  const shot = hit as EngineShot;
  const clock: PictureAudioClock = { ...session, playhead: num(playhead) };
  if (shot === "early") {
    return null;
  }
  if (shot === "idle") {
    return null;
  }
  if (shot === "peak") {
    return null;
  }
  if (!audibleShot(shot)) return null;
  if (sameShot(session.lastEngine, shot, clock.playhead)) return session.lastEngine;
  if (session.muted || audioHeld(clock)) return null;
  const ev: EngineEvent = { bus: "engine", shot, playhead: clock.playhead, audible: true };
  session.lastEngine = ev;
  session.engineEvents.push(ev);
  return ev;
}

/** Howl is one breath voice. Stacked H does not layer. */
export function howlOnce(playhead = session.playhead): EngineEvent | null {
  if (session.howlCount > 0) return null;
  const ev = fireGradeAudio("howl", playhead);
  if (!ev) return null;
  session.howlCount += 1;
  return ev;
}

export function mutePictureAudio(muted = true) {
  session.muted = Boolean(muted);
  if (session.muted && session.platePolicy === "open") session.platePolicy = "muted";
  if (!session.muted && session.platePolicy === "muted") session.platePolicy = "open";
}

export function toggleMutePictureAudio(): boolean {
  mutePictureAudio(!session.muted);
  return session.muted;
}

export function isPictureMuted() {
  return session.muted;
}

/**
 * Smoke FAIL / mute path. Uses `SmokeResult` from smoke-gate.
 * FAIL mutes both buses. Picture-time still grades.
 */
export function applySmokeAudioGate(smoke?: SmokeResult | { smoke?: string } | null): boolean {
  if (smoke && smoke.smoke === "FAIL") {
    mutePictureAudio(true);
    return true;
  }
  return false;
}

export function holdPictureAudio() {
  session.paused = true;
}

export function releasePictureAudio() {
  session.paused = false;
}

function stepDecay(next: TrailSlot, role?: string | null) {
  const leavingStorm = session.trail === "full" && next !== "full";
  if (role === "decay" || leavingStorm) {
    session.decayFilter = DECAY_PER_PLATE;
    return;
  }
  if (session.decayFilter > 0) {
    session.decayFilter = Math.max(0, session.decayFilter - 1);
  }
}

/** One trail step = one plate. Decay filter lasts that plate — never snap the storm off. */
export function setTrailCA(trail?: TrailSlot | null, role?: string | null) {
  const next = trail === "thin" || trail === "full" ? trail : "none";
  stepDecay(next, role);
  session.prevTrail = session.trail;
  session.trail = next;
  if (role) session.role = role;
}

/**
 * Playhead = video.currentTime (same as cue.on).
 * Pause / waitingOnCook / hidden freezes both buses. Never invents BPM.
 */
export function syncPictureAudio(clock: PictureAudioClock): PictureAudioState {
  session.playhead = num(clock.playhead);
  session.paused = Boolean(clock.paused);
  session.waitingOnCook = Boolean(clock.waitingOnCook);
  session.hidden = Boolean(clock.hidden);
  if (clock.muted != null) session.muted = Boolean(clock.muted);
  if (clock.plate != null && clock.plate !== session.plate) {
    session.plate = clock.plate;
    setTrailCA(clock.trail, clock.role);
  } else if (clock.plate == null && (clock.trail != null || clock.role != null)) {
    if (clock.trail !== session.trail || (clock.role && clock.role !== session.role)) {
      setTrailCA(clock.trail, clock.role);
    }
  }
  if (audioHeld(session) && session.platePolicy === "open") session.platePolicy = "held";
  if (!audioHeld(session) && session.platePolicy === "held") session.platePolicy = "open";
  return pictureAudioSnapshot();
}

/**
 * Prefetch stock includes audio decode. Never a second audio-only Imagine cook.
 */
export function prefetchStockAudio(url?: string | null): { decode: boolean; cook: false } {
  const src = String(url || "").trim();
  if (!src) return { decode: false, cook: false };
  if (/imgen|xai-vidgen|grok-imagine/i.test(src) && !src.startsWith("/") && !src.startsWith("blob:")) {
    return { decode: false, cook: false };
  }
  if (!session.prefetch.includes(src)) session.prefetch.push(src);
  return { decode: true, cook: false };
}

export function pictureAudioSnapshot(): PictureAudioState {
  const held = audioHeld(session);
  const muted = session.muted;
  return {
    playhead: session.playhead,
    held,
    muted: { plate: muted, engine: muted },
    bedsFrozen: held,
    plateOpen: plateMaySound(session),
    trail: session.trail,
    trailVoice: trailVoiceOf(session.trail, session.decayFilter, session.role),
    decayFilter: session.decayFilter,
    lastEngine: session.lastEngine,
    engineEvents: session.engineEvents.slice(),
    howlCount: session.howlCount,
    prefetch: session.prefetch.slice(),
    cook: false,
    placeholder: AUDIO_PLACEHOLDER,
    platePolicy: session.platePolicy,
  };
}

export function picturePlayhead() {
  return session.playhead;
}
