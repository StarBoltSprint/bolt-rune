/**
 * Plate transition machine — planTransition → runTransition → play.
 * Never set video.src from goTo / tap / Howl. The player prepares B, then commits.
 *
 * BAN: dissolve via an 8-step timer loop — blocks the thread, not the GPU, waits network mid-fade.
 *
 * USE:
 * 1) Double buffer — two <video> (A visible, B decodes). prepare(url) loads B BEFORE fade.
 *    commitIncoming = opacity swap + pointer flip.
 * 2) WAAPI — one opacity anim 0→1 / 1→0 with will-change:opacity. No 8-step loop.
 * 3) Cut more often — same still, or breath→breath same pose → 0ms. Decay → hold (no fade).
 *    Dissolve max 280ms.
 * 4) prefers-reduced-motion → 80ms.
 * 5) AbortSignal — Howl / Pause abort an in-flight fade.
 * 6) Still overlay only if the end still is not already on screen; wait canplay before showing B.
 *
 * stillEnd === stillStart → never fade.
 * Prefetch arrival breath during walk (set breath-A src as soon as the walk tap commits).
 * prepare(url) tries pre.take(plateId) first — steal a ready preload buffer into B.
 * Breath ALWAYS loops. Dissolve cannot fix a bad encode. Asteroid HOLD. Picture-time only.
 */

import { actLoops, type CitadelPose, type PoseMode } from "./pcg-pose.ts";

export type TransitionAct = "breath" | "walk" | "enter" | "decay" | "first";
export type TransitionKind = "cut" | "dissolve" | "hold" | "decay";
export type JoinWarn = "encode-mismatch" | null;

export const DISSOLVE_MAX_MS = 280;
export const HOLD_FIRST_MS = 80;
export const REDUCED_MOTION_MS = 80;

export type TransitionPlate = {
  clip?: string | null;
  stillStart?: string | null;
  stillEnd?: string | null;
  pose?: CitadelPose | string | null;
  biome?: string | null;
  act?: TransitionAct | PoseMode | string | null;
};

export type TransitionPlan = {
  kind: TransitionKind;
  ms: number;
  fade: boolean;
  fromStill: string;
  toStill: string;
  url: string;
  loop: boolean;
  decay: boolean;
  spinner: false;
  resetPlateTime: true;
  play: boolean;
  joinWarn: JoinWarn;
};

export type TransitionIO = {
  fade?: (fromStill: string, toStill: string, ms: number) => void | Promise<void>;
  swapUrl: (url: string, loop: boolean) => void;
  resetPlateTime: () => void;
  play: () => void | Promise<void>;
};

export type PlanOpts = {
  smoke?: { smoke?: string } | null;
  first?: boolean;
  decayUrl?: string | null;
  reducedMotion?: boolean;
};

export type RunOpts = {
  signal?: AbortSignal;
  prefetch?: string | null;
  loop?: boolean;
  resetPlateTime?: () => void;
  play?: () => void | Promise<void>;
  plateId?: string;
  pre?: { take: (id: string) => HTMLVideoElement | null };
};

export type DomTransitionEls = {
  outgoing: HTMLVideoElement | null;
  incoming: HTMLVideoElement | null;
  still?: HTMLElement | null;
  assignSrc?: (el: HTMLVideoElement, url: string, loop: boolean) => void;
  onCommit?: () => void;
  plateId?: string;
  pre?: { take: (id: string) => HTMLVideoElement | null };
};

export type DomTransitionPlayer = {
  prepare: (url: string, loop?: boolean, plateId?: string) => Promise<void>;
  prefetchArrival: (url: string) => void;
  commitIncoming: () => void;
  fade: (ms: number, signal?: AbortSignal) => Promise<void>;
  hold: (ms: number, signal?: AbortSignal) => Promise<void>;
  showStill: (src: string) => void;
  hideStill: () => void;
  stillOnScreen: (src: string) => boolean;
  abort: () => void;
  signal: AbortSignal;
};

function text(v?: string | null) {
  return String(v || "").trim();
}

function stillEnd(plate?: TransitionPlate | null) {
  return text(plate?.stillEnd) || text(plate?.stillStart);
}

function stillStart(plate?: TransitionPlate | null) {
  return text(plate?.stillStart) || text(plate?.stillEnd);
}

function actOf(plate?: TransitionPlate | null): TransitionAct {
  const a = text(plate?.act);
  if (a === "walk" || a === "enter" || a === "decay" || a === "first" || a === "breath") return a;
  return "breath";
}

function samePose(from?: TransitionPlate | null, to?: TransitionPlate | null) {
  const a = text(from?.pose);
  const b = text(to?.pose);
  return Boolean(a && b && a === b);
}

function sameBiome(from?: TransitionPlate | null, to?: TransitionPlate | null) {
  const a = text(from?.biome);
  const b = text(to?.biome);
  if (!a || !b) return true;
  return a === b;
}

/** HARD LOCK: dissolve cannot repair a bad encode join. */
export function dissolveFixesEncode(): false {
  return false;
}

export function stillsMatch(a?: string | null, b?: string | null) {
  const x = text(a);
  const y = text(b);
  return Boolean(x && y && x === y);
}

export function clipMissing(plate?: TransitionPlate | null) {
  return !text(plate?.clip);
}

export function smokeFailed(smoke?: PlanOpts["smoke"]) {
  return Boolean(smoke && text(smoke.smoke) === "FAIL");
}

export function prefersReducedMotion(): boolean {
  if (typeof matchMedia !== "function") return false;
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Dissolve duration after reduced-motion + max clamp. Cut stays 0. */
export function dissolveDuration(ms: number, reduced = prefersReducedMotion()): number {
  if (ms <= 0) return 0;
  if (reduced) return REDUCED_MOTION_MS;
  return Math.min(ms, DISSOLVE_MAX_MS);
}

function joinWarnOf(from: TransitionPlate, to: TransitionPlate): JoinWarn {
  if (actOf(from) !== "walk" || actOf(to) !== "breath") return null;
  const end = stillEnd(from);
  const start = stillStart(to);
  if (end && start && end !== start) return "encode-mismatch";
  return null;
}

function base(from: TransitionPlate, to: TransitionPlate, over: Partial<TransitionPlan>): TransitionPlan {
  return {
    kind: "cut",
    ms: 0,
    fade: false,
    fromStill: stillEnd(from),
    toStill: stillStart(to) || stillEnd(from),
    url: text(to.clip),
    loop: actLoops(actOf(to)) || actOf(to) === "first",
    decay: false,
    spinner: false,
    resetPlateTime: true,
    play: Boolean(text(to.clip)),
    joinWarn: joinWarnOf(from, to),
    ...over,
  };
}

/**
 * Plan the join. Does not change pose. Does not touch video.src.
 * Breath destinations always loop. stillEnd === stillStart never fades.
 */
export function planTransition(from: TransitionPlate, to: TransitionPlate, opts: PlanOpts = {}): TransitionPlan {
  const first = Boolean(opts.first) || actOf(to) === "first";
  const destAct = first ? "first" : actOf(to);
  const dest: TransitionPlate = { ...to, act: destAct };
  const fail = smokeFailed(opts.smoke) || clipMissing(dest);
  const warn = joinWarnOf(from, dest);
  const reduced = opts.reducedMotion ?? prefersReducedMotion();

  if (fail) {
    const url = text(opts.decayUrl);
    return base(from, dest, {
      kind: "decay",
      ms: HOLD_FIRST_MS,
      fade: false,
      url,
      loop: true,
      decay: true,
      play: Boolean(url),
      joinWarn: warn,
    });
  }

  const fromEnd = stillEnd(from);
  const toStart = stillStart(dest);
  const fromAct = actOf(from);

  if (stillsMatch(fromEnd, toStart)) {
    return base(from, dest, { kind: "cut", ms: 0, fade: false, joinWarn: warn });
  }

  if (fromAct === "breath" && destAct === "breath" && samePose(from, dest)) {
    return base(from, dest, { kind: "cut", ms: 0, fade: false, joinWarn: warn });
  }

  if (destAct === "decay") {
    return base(from, dest, { kind: "decay", ms: HOLD_FIRST_MS, fade: false, decay: true, loop: true, joinWarn: warn });
  }

  const enterish = destAct === "enter" || destAct === "first";
  const dissolveMs = dissolveDuration(DISSOLVE_MAX_MS, reduced);

  if (samePose(from, dest) && sameBiome(from, dest) && fromEnd && toStart && fromEnd !== toStart) {
    return base(from, dest, { kind: "dissolve", ms: dissolveMs, fade: true, joinWarn: warn });
  }

  if (enterish) {
    if (fromEnd && toStart && fromEnd !== toStart) {
      return base(from, dest, { kind: "dissolve", ms: dissolveMs, fade: true, joinWarn: warn });
    }
    return base(from, dest, { kind: "hold", ms: HOLD_FIRST_MS, fade: false, joinWarn: warn });
  }

  if (fromEnd && toStart && fromEnd !== toStart) {
    return base(from, dest, { kind: "dissolve", ms: dissolveMs, fade: true, joinWarn: warn });
  }

  return base(from, dest, { kind: "cut", ms: 0, fade: false, joinWarn: warn });
}

function isVideo(v: unknown): v is HTMLVideoElement {
  return Boolean(v && typeof v === "object" && (v as HTMLVideoElement).tagName === "VIDEO");
}

function isPlan(v: unknown): v is TransitionPlan {
  return Boolean(v && typeof v === "object" && "kind" in v && "resetPlateTime" in v && "spinner" in v);
}

function isIO(v: unknown): v is TransitionIO {
  return Boolean(v && typeof v === "object" && typeof (v as TransitionIO).swapUrl === "function");
}

function isPlayer(v: unknown): v is DomTransitionPlayer {
  return Boolean(v && typeof v === "object" && typeof (v as DomTransitionPlayer).prepare === "function" && typeof (v as DomTransitionPlayer).commitIncoming === "function");
}

function elSrc(el?: HTMLElement | HTMLVideoElement | null) {
  if (!el) return "";
  return text(el.getAttribute?.("src") || (el as HTMLVideoElement).currentSrc || (el as HTMLImageElement).src);
}

function waitCanPlay(el: HTMLVideoElement, signal?: AbortSignal): Promise<void> {
  if (el.readyState >= 3) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      el.removeEventListener("canplay", done);
      el.removeEventListener("loadeddata", done);
      el.removeEventListener("error", done);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    el.addEventListener("canplay", done, { once: true });
    el.addEventListener("loadeddata", done, { once: true });
    el.addEventListener("error", done, { once: true });
    signal?.addEventListener("abort", done, { once: true });
  });
}

function waapiWait(el: Element | null, ms: number, keyframes: Keyframe[], signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (!el || typeof el.animate !== "function") return Promise.resolve();
  const anim = el.animate(keyframes, { duration: ms, easing: "linear", fill: "forwards" });
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = () => {
      try {
        anim.cancel();
      } catch {
        /* */
      }
      done();
    };
    anim.addEventListener("finish", done, { once: true });
    anim.addEventListener("cancel", done, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });
    void anim.finished.then(done).catch(done);
  });
}

function playerFromVideo(video: HTMLVideoElement): DomTransitionPlayer {
  const parent = video.parentElement;
  const videos = parent ? Array.from(parent.querySelectorAll("video")) : [video];
  const incoming = videos.find((v) => v !== video) || null;
  const still = (parent?.querySelector("img") as HTMLElement | null) || null;
  return createDomTransitionPlayer({ outgoing: video, incoming, still });
}

export function createDomTransitionPlayer(els: DomTransitionEls): DomTransitionPlayer {
  let outgoing = els.outgoing;
  let incoming = els.incoming;
  const still = els.still || null;
  let ctl = new AbortController();

  const arm = (el: HTMLVideoElement | null, url: string, loop: boolean) => {
    if (!el || !url) return;
    el.muted = true;
    el.playsInline = true;
    el.loop = loop;
    el.style.willChange = "opacity";
    if (els.assignSrc) els.assignSrc(el, url, loop);
    else if (el.getAttribute("src") !== url) el.src = url;
  };

  const player: DomTransitionPlayer = {
    get signal() {
      return ctl.signal;
    },
    abort() {
      ctl.abort();
      ctl = new AbortController();
    },
    stillOnScreen(src: string) {
      const want = text(src);
      if (!want) return true;
      if (elSrc(still) === want) return true;
      if (elSrc(outgoing) === want) return true;
      return false;
    },
    showStill(src: string) {
      if (!still || !src) return;
      if (player.stillOnScreen(src)) return;
      if ("src" in still) (still as HTMLImageElement).src = src;
      else still.setAttribute("src", src);
      still.style.opacity = "1";
      still.style.willChange = "opacity";
    },
    hideStill() {
      if (!still) return;
      still.style.opacity = "0";
    },
    async prepare(url: string, loop = false, plateId?: string) {
      if (!url || !incoming) return;
      const id = text(plateId) || text(els.plateId);
      const stolen = id && els.pre ? els.pre.take(id) : null;
      const src = stolen ? text(stolen.currentSrc || stolen.getAttribute?.("src") || url) || url : url;
      arm(incoming, src, loop);
      incoming.style.willChange = "opacity";
      if (outgoing) outgoing.style.willChange = "opacity";
      if (stolen && (stolen.readyState >= 3 || incoming.readyState >= 3)) return;
      await waitCanPlay(incoming, ctl.signal);
    },
    prefetchArrival(url: string) {
      if (!url) return;
      const slot = incoming || outgoing;
      if (!slot) return;
      slot.loop = true;
      arm(slot, url, true);
    },
    commitIncoming() {
      if (incoming) {
        incoming.style.opacity = "1";
        incoming.style.pointerEvents = "auto";
        incoming.style.willChange = "opacity";
      }
      if (outgoing) {
        outgoing.style.opacity = "0";
        outgoing.style.pointerEvents = "none";
      }
      els.onCommit?.();
      const swap = outgoing;
      outgoing = incoming;
      incoming = swap;
    },
    async fade(ms: number, signal?: AbortSignal) {
      const sig = signal || ctl.signal;
      const dur = dissolveDuration(ms);
      if (dur <= 0 || sig.aborted) return;
      if (outgoing) outgoing.style.willChange = "opacity";
      if (incoming) incoming.style.willChange = "opacity";
      await Promise.all([
        waapiWait(outgoing, dur, [{ opacity: 1 }, { opacity: 0 }], sig),
        waapiWait(incoming, dur, [{ opacity: 0 }, { opacity: 1 }], sig),
      ]);
    },
    async hold(ms: number, signal?: AbortSignal) {
      const sig = signal || ctl.signal;
      const dur = ms <= 0 ? 0 : HOLD_FIRST_MS;
      if (dur <= 0 || sig.aborted) return;
      const clock = incoming || outgoing;
      await waapiWait(clock, dur, [{ opacity: 1 }, { opacity: 1 }], sig);
    },
  };
  return player;
}

async function runTransitionIO(plan: TransitionPlan, io: TransitionIO): Promise<TransitionPlan> {
  if (plan.kind === "decay" && !plan.url) {
    io.resetPlateTime();
    return plan;
  }
  if (plan.fade && io.fade) await io.fade(plan.fromStill, plan.toStill, plan.ms);
  else if (!plan.fade && plan.kind === "hold" && plan.ms > 0 && io.fade) await io.fade(plan.fromStill, plan.toStill, 0);
  if (plan.url) io.swapUrl(plan.url, plan.loop);
  io.resetPlateTime();
  if (plan.play) await io.play();
  return plan;
}

async function runTransitionDom(player: DomTransitionPlayer, plan: TransitionPlan, url?: string, opts: RunOpts = {}): Promise<TransitionPlan> {
  const src = text(url) || plan.url;
  const loop = opts.loop ?? plan.loop;
  const sig = opts.signal || player.signal;
  if (sig.aborted) {
    opts.resetPlateTime?.();
    return plan;
  }
  if (plan.kind === "decay" && !src) {
    opts.resetPlateTime?.();
    return plan;
  }
  if (plan.fade && plan.fromStill && !player.stillOnScreen(plan.fromStill)) player.showStill(plan.fromStill);
  if (src) await player.prepare(src, loop, opts.plateId);
  if (sig.aborted) {
    opts.resetPlateTime?.();
    return plan;
  }
  player.hideStill();
  if (plan.fade) await player.fade(plan.ms, sig);
  else if (plan.kind === "hold" || plan.kind === "decay") await player.hold(plan.ms, sig);
  if (sig.aborted) {
    opts.resetPlateTime?.();
    return plan;
  }
  if (src) player.commitIncoming();
  if (opts.prefetch) player.prefetchArrival(opts.prefetch);
  opts.resetPlateTime?.();
  if (plan.play && opts.play) await opts.play();
  else if (loop) {
    /* Breath ALWAYS loops — the committed plate keeps playing. Never freeze last frame. */
  }
  return plan;
}

function resolvePlayer(target: DomTransitionPlayer | DomTransitionEls | HTMLVideoElement): DomTransitionPlayer {
  if (isPlayer(target)) return target;
  if (isVideo(target)) return playerFromVideo(target);
  return createDomTransitionPlayer(target);
}

/**
 * runTransition(video, planTransition(from, to), to.url)
 * runTransition(createDomTransitionPlayer({ outgoing, incoming, still }), plan, url)
 * runTransition(plan, io) — IO adapter (swapUrl is the only legal src write)
 */
export function runTransition(plan: TransitionPlan, io: TransitionIO): Promise<TransitionPlan>;
export function runTransition(
  video: DomTransitionPlayer | DomTransitionEls | HTMLVideoElement,
  plan: TransitionPlan,
  url?: string,
  opts?: RunOpts,
): Promise<TransitionPlan>;
export function runTransition(
  a: TransitionPlan | DomTransitionPlayer | DomTransitionEls | HTMLVideoElement,
  b: TransitionIO | TransitionPlan,
  url?: string,
  opts?: RunOpts,
): Promise<TransitionPlan> {
  if (isPlan(a) && isIO(b)) return runTransitionIO(a, b);
  return runTransitionDom(resolvePlayer(a as DomTransitionPlayer | DomTransitionEls | HTMLVideoElement), b as TransitionPlan, url, opts);
}

export function playTransition(from: TransitionPlate, to: TransitionPlate, io: TransitionIO, opts?: PlanOpts) {
  return runTransition(planTransition(from, to, opts), io);
}

export function resetPlateTime<T extends { plateTimeMs?: number }>(clock: T): T {
  return { ...clock, plateTimeMs: 0 };
}

export function transitionLoops(plan: TransitionPlan): boolean {
  return Boolean(plan.loop);
}
