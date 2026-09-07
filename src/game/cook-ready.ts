/** Persist biome / Bot Biome cook READY so a remount does not look like a new 0% cook. */

import { biomePlaySrc, isPlayableClipSrc, playableClipSrc, stockBiomeLoop } from "./play-clip.ts";

export type CookReadySnap = {
  biome: string;
  urls: string[];
  watch?: string;
  still?: string;
  frost?: string;
};

export type CookStudioMount = {
  gate: "cook" | "studio" | "world" | "rifts" | "howl" | "rune";
  forging: boolean;
  ready: boolean;
};

const READY_KEY = "bolt-cook-ready-v1";
const DONE_KEY = "bolt-look-forge-done-v1";

export function cookUrlsReady(urls?: string[] | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls || []) {
    if (typeof raw !== "string") continue;
    if (!/\.mp4(\?|$)/i.test(raw) && !raw.includes("xai-vidgen") && !raw.startsWith("/api/clip")) continue;
    const u = playableClipSrc(raw);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/** READY watch src: playable proxy / same-origin, else stock biome loop. */
export function biomeReadySrc(urls?: string[] | null, biome?: string | null): string {
  const ready = cookUrlsReady(urls);
  const watch = ready.find((u) => isPlayableClipSrc(u)) || biomePlaySrc(ready, biome);
  return watch || stockBiomeLoop(biome);
}

/** Hash `#forge/cook` with no READY snap must not mount an empty forging overlay. */
export function resolveCookStudioMount(input: {
  gate?: string | null;
  readyUrls?: string[] | null;
}): CookStudioMount {
  const urls = cookUrlsReady(input.readyUrls);
  const gate = String(input.gate || "rifts");
  if (gate === "cook") {
    if (urls.length) return { gate: "cook", forging: false, ready: true };
    return { gate: "studio", forging: false, ready: false };
  }
  if (gate === "studio" || gate === "world" || gate === "howl" || gate === "rune" || gate === "rifts") {
    return { gate, forging: false, ready: false };
  }
  return { gate: "rifts", forging: false, ready: false };
}

export function cookOverlayForging(input: { busy?: boolean; cookingIndex?: number; readyN?: number }): boolean {
  if (input.busy) return true;
  if (typeof input.cookingIndex === "number" && input.cookingIndex >= 0) return true;
  return false;
}

export function writeCookReady(snap: CookReadySnap): CookReadySnap | null {
  const biome = String(snap.biome || "asteroid").replace(/[^a-z]/g, "").slice(0, 16) || "asteroid";
  const mapped = cookUrlsReady(snap.urls);
  const watch = biomeReadySrc([snap.watch || "", ...mapped], biome);
  const urls = mapped.length ? mapped : watch ? [watch] : [];
  if (!urls.length) return null;
  const next: CookReadySnap = {
    biome,
    urls,
    watch: urls.includes(watch) ? watch : urls[0],
    still: snap.still || undefined,
    frost: snap.frost || "MP4 ready · touch the path to enter",
  };
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(READY_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return next;
}

export function readCookReady(): CookReadySnap | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(READY_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as CookReadySnap;
    const urls = cookUrlsReady(snap?.urls);
    if (!urls.length) return null;
    const watch = biomeReadySrc([snap.watch || "", ...urls], snap.biome);
    return { ...snap, urls, watch: urls.includes(watch) ? watch : urls[0] };
  } catch {
    return null;
  }
}

export function clearCookReady() {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(READY_KEY);
  } catch {
    /* */
  }
}

export function markLookForgeDone(key = "load") {
  try {
    if (typeof sessionStorage === "undefined") return;
    const prev = sessionStorage.getItem(DONE_KEY) || "";
    const parts = prev.split("\n").filter(Boolean);
    if (!parts.includes(key)) parts.push(key);
    sessionStorage.setItem(DONE_KEY, parts.join("\n"));
  } catch {
    /* */
  }
}

export function lookForgeAlreadyDone(key = "load"): boolean {
  try {
    if (typeof sessionStorage === "undefined") return false;
    const prev = sessionStorage.getItem(DONE_KEY) || "";
    return prev.split("\n").includes(key);
  } catch {
    return false;
  }
}

export function resetLookForgeDone(key?: string) {
  try {
    if (typeof sessionStorage === "undefined") return;
    if (!key) {
      sessionStorage.removeItem(DONE_KEY);
      return;
    }
    const next = (sessionStorage.getItem(DONE_KEY) || "").split("\n").filter((k) => k && k !== key);
    if (next.length) sessionStorage.setItem(DONE_KEY, next.join("\n"));
    else sessionStorage.removeItem(DONE_KEY);
  } catch {
    /* */
  }
}

/** After a successful bot/biome cook, remount should resume play — not look + auto-start. */
export function shouldResumeForgePlay(input: { done?: boolean; liveId?: string | null; walks?: number | boolean }): boolean {
  if (!input.done || !input.liveId) return false;
  if (input.walks === false || input.walks === 0) return false;
  return true;
}

/** /artifacts remount: keep a deeper forge loc; only default to rifts when hash is empty/title. */
export function bootCookLoc(input: {
  bootScreen?: string;
  hashed?: { screen?: string; gate?: string; page?: number; biome?: string } | null;
  stored?: { screen?: string; gate?: string; page?: number; biome?: string } | null;
}): { screen: "cook" | "title" | "how" | "play" | "result"; gate?: string; page?: number; biome?: string } {
  const hashed = input.hashed;
  const stored = input.stored;
  if (input.bootScreen === "cook") {
    if (hashed?.screen === "cook") return hashed as { screen: "cook"; gate?: string; page?: number; biome?: string };
    if (stored?.screen === "cook") return stored as { screen: "cook"; gate?: string; page?: number; biome?: string };
    return { screen: "cook", gate: "rifts", page: 0 };
  }
  if (hashed?.screen) return hashed as { screen: "cook"; gate?: string; page?: number; biome?: string };
  if (stored?.screen) return stored as { screen: "cook"; gate?: string; page?: number; biome?: string };
  return { screen: "title" };
}
