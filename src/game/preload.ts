/**
 * Preload law — warm ONLY the next probable PASS film. Never Imagine.
 *
 * Priority:
 * 0 during walk toward A → breath-atA (almost certain on ended)
 * 1 during breath → walk-spawn-A and walk-spawn-B (or the far-door walk from atA/atB)
 * 2 always → biome decay
 * 3 fallback → breath-spawn
 * Enter ONLY if already on disk; otherwise no warm (ticket + cook).
 *
 * Mechanics: max 4 offscreen 1×1 <video preload=auto>. canplay / canplaythrough = ready.
 * take(id) steals the buffer into the dissolve double-buffer.
 * Pause → pauseAll(). Pose change → re-warm, ignore old generation.
 * link rel=preload as=video is a network hint only — not a 5th decode.
 *
 * syncPreload(sm, lib, pre) after startHall / onTap / onEnded.
 * prepare(url) tries pre.take(plateId) first.
 * Breath ALWAYS loops. Asteroid HOLD. No Pack seats.
 */

import {
  arrive,
  breathClip,
  enterClip,
  isDoorSide,
  walkClip,
  type PoseClipId,
  type PoseState,
} from "./pcg-pose.ts";

export const PRELOAD_SLOTS = 4;

export type PreloadWant = {
  id: PoseClipId;
  priority: number;
  loop: boolean;
  /** Enter rows warm only when lib says the file is already on disk. */
  needsDisk?: boolean;
};

export type PreloadLib = {
  url: (id: PoseClipId) => string | null | undefined;
  onDisk?: (id: PoseClipId) => boolean;
};

export type PreloadFill = {
  id: PoseClipId;
  url: string;
  loop: boolean;
  priority: number;
};

export type PreloadPool = {
  gen: number;
  warm: (fill: PreloadFill[], gen?: number) => void;
  take: (id: string) => HTMLVideoElement | null;
  pauseAll: () => void;
  ready: (id: string) => boolean;
  hint: (url: string) => void;
  slots: () => { id: string; url: string; ready: boolean; gen: number }[];
};

export type PreloadFactory = {
  createVideo?: () => HTMLVideoElement | null;
  createLink?: () => HTMLLinkElement | null;
};

function text(v?: string | null) {
  return String(v || "").trim();
}

function poseKey(sm: PoseState) {
  return `${sm.pose}:${sm.mode}:${sm.walkSide}:${sm.clip}`;
}

function isEnterId(id: PoseClipId) {
  return id === "enter-A" || id === "enter-B";
}

/**
 * Next probable plates. Does not touch Imagine, video.src, or the network.
 */
export function planPreload(sm: PoseState): PreloadWant[] {
  const wants: PreloadWant[] = [];

  if (sm.mode === "walk" && isDoorSide(sm.walkSide)) {
    const land = arrive(sm.walkFrom, sm.walkSide);
    wants.push({ id: breathClip(land), priority: 0, loop: true });
  }

  if (sm.mode === "breath" || (sm.mode === "paused" && sm.pausedFrom === "breath")) {
    const a = walkClip(sm.pose, "A");
    const b = walkClip(sm.pose, "B");
    if (a) wants.push({ id: a, priority: 1, loop: false });
    if (b) wants.push({ id: b, priority: 1, loop: false });
    if (sm.pose === "atA" || sm.armed.A) wants.push({ id: enterClip("A"), priority: 1, loop: false, needsDisk: true });
    if (sm.pose === "atB" || sm.armed.B) wants.push({ id: enterClip("B"), priority: 1, loop: false, needsDisk: true });
  }

  wants.push({ id: "decay", priority: 2, loop: true });
  wants.push({ id: "breath-spawn", priority: 3, loop: true });
  return wants;
}

export function mayPreloadImagine(): false {
  return false;
}

function onDisk(lib: PreloadLib, id: PoseClipId) {
  if (typeof lib.onDisk === "function") return Boolean(lib.onDisk(id));
  return Boolean(text(lib.url(id)));
}

/** Filter wants to PASS/stock urls. Enter without a file on disk is skipped. Cap at 4. */
export function pickPreload(sm: PoseState, lib: PreloadLib): PreloadFill[] {
  const out: PreloadFill[] = [];
  const seen = new Set<string>();
  for (const want of planPreload(sm).sort((a, b) => a.priority - b.priority)) {
    if (want.needsDisk || isEnterId(want.id)) {
      if (!onDisk(lib, want.id)) continue;
    }
    const url = text(lib.url(want.id));
    if (!url || seen.has(want.id) || seen.has(url)) continue;
    seen.add(want.id);
    seen.add(url);
    out.push({ id: want.id, url, loop: want.loop, priority: want.priority });
    if (out.length >= PRELOAD_SLOTS) break;
  }
  return out;
}

function defaultVideo(): HTMLVideoElement | null {
  if (typeof document === "undefined") return null;
  const v = document.createElement("video");
  v.muted = true;
  v.defaultMuted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.setAttribute("playsinline", "true");
  v.setAttribute("muted", "true");
  v.setAttribute("aria-hidden", "true");
  v.setAttribute("data-preload-slot", "1");
  v.style.cssText = "position:fixed;left:-8px;top:-8px;width:1px;height:1px;opacity:0;pointer-events:none";
  (document.body || document.documentElement).appendChild(v);
  return v;
}

function defaultLink(): HTMLLinkElement | null {
  if (typeof document === "undefined") return null;
  const l = document.createElement("link");
  l.rel = "preload";
  l.as = "video";
  document.head.appendChild(l);
  return l;
}

type Slot = {
  id: string;
  url: string;
  ready: boolean;
  gen: number;
  el: HTMLVideoElement | null;
};

export function createPreloadPool(factory: PreloadFactory = {}): PreloadPool {
  const slots: Slot[] = Array.from({ length: PRELOAD_SLOTS }, () => ({
    id: "",
    url: "",
    ready: false,
    gen: 0,
    el: null,
  }));
  let gen = 0;
  const hints = new Map<string, HTMLLinkElement>();

  const markReady = (slot: Slot) => {
    return () => {
      if (slot.gen !== gen) return;
      slot.ready = true;
    };
  };

  const ensureEl = (slot: Slot) => {
    if (slot.el) return slot.el;
    slot.el = (factory.createVideo || defaultVideo)();
    return slot.el;
  };

  const pool: PreloadPool = {
    get gen() {
      return gen;
    },
    hint(url: string) {
      const src = text(url);
      if (!src || hints.has(src)) return;
      const l = (factory.createLink || defaultLink)();
      if (!l) return;
      l.rel = "preload";
      l.as = "video";
      l.href = src;
      hints.set(src, l);
    },
    warm(fill: PreloadFill[], nextGen = gen) {
      gen = nextGen;
      const keep = new Set(fill.map((f) => f.id));
      for (const slot of slots) {
        if (slot.id && !keep.has(slot.id)) {
          slot.id = "";
          slot.url = "";
          slot.ready = false;
          slot.gen = gen;
        }
      }
      for (const item of fill.slice(0, PRELOAD_SLOTS)) {
        let slot = slots.find((s) => s.id === item.id) || slots.find((s) => !s.id);
        if (!slot) slot = slots[0]!;
        const el = ensureEl(slot);
        const same = slot.id === item.id && slot.url === item.url && slot.gen === gen;
        slot.id = item.id;
        slot.url = item.url;
        slot.gen = gen;
        pool.hint(item.url);
        if (!el) continue;
        el.loop = item.loop;
        el.preload = "auto";
        if (!same || (el.getAttribute("src") || el.currentSrc || "") !== item.url) {
          slot.ready = false;
          el.src = item.url;
          try {
            el.load();
          } catch {
            /* */
          }
        }
        if (el.readyState >= 3) slot.ready = true;
        const ready = markReady(slot);
        el.addEventListener("canplay", ready);
        el.addEventListener("canplaythrough", ready);
      }
    },
    take(id: string) {
      const want = text(id);
      const slot = slots.find((s) => s.id === want && s.el);
      if (!slot?.el) return null;
      const el = slot.el;
      slot.el = null;
      slot.id = "";
      slot.url = "";
      slot.ready = false;
      return el;
    },
    pauseAll() {
      for (const slot of slots) {
        try {
          slot.el?.pause();
        } catch {
          /* */
        }
      }
    },
    ready(id: string) {
      const slot = slots.find((s) => s.id === text(id));
      if (!slot) return false;
      if (slot.ready) return true;
      return Boolean(slot.el && slot.el.readyState >= 3);
    },
    slots() {
      return slots.map((s) => ({ id: s.id, url: s.url, ready: s.ready, gen: s.gen }));
    },
  };
  return pool;
}

/**
 * Re-warm the next probable PASS films. Pose change bumps generation so stale canplay is ignored.
 * Paused SM only pauses decodes — it does not launch Imagine.
 */
export function syncPreload(sm: PoseState, lib: PreloadLib, pre: PreloadPool): PreloadFill[] {
  if (sm.mode === "paused") {
    pre.pauseAll();
    return [];
  }
  const fill = pickPreload(sm, lib);
  const nextGen = pre.gen + 1;
  pre.warm(fill, nextGen);
  return fill;
}

export function preloadPoseKey(sm: PoseState) {
  return poseKey(sm);
}
