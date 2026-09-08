/**
 * PCG rail 1 — run seed, plate / enter hashes, clip cache.
 * PCG rail 2 — enter-ready glow, hot-path enter (cache / stock), graph commit, paid ticket.
 * Asteroid HOLD. No Imagine on walk-toward-door speculation.
 * Double-tap never Imagines. Paid forge/ticket only on explicit confirm. No paid speculate on approach.
 */

import { HALL_LOOP } from "./stock-room.ts";

const FNV_OFF = 2166136261;
const FNV_PRIME = 16777619;

const RUN_KEY = "bolt-pcg-run-v1";
const CLIP_KEY = "bolt-pcg-clips-v1";

export type ImagineJob = "plate" | "enter" | "forge" | "walk-toward-door" | "speculate" | "approach" | "enter-hot";
export type PaidJob = "plate" | "enter" | "forge";
export type ClipCacheKind = "plate" | "enter";
export type GlowArm = "walk" | "enter" | "stay" | null | "";
export type GlowPulse = "walk" | "enter";

/** Living-hall stock bridge when s_enter is cold. Never an Imagine URL. */
export const STOCK_ENTER_BRIDGE = HALL_LOOP;

export type ForgeTicket = {
  job: PaidJob;
  confirm: true;
  at: number;
};

let forgeTickets: Partial<Record<PaidJob, ForgeTicket>> = {};

export type ClipCacheRow = {
  url: string;
  kind: ClipCacheKind;
  at: number;
};

type RunBag = { id?: string; seed: string };
type ClipBag = Record<string, ClipCacheRow>;

function storage(): Storage | undefined {
  try {
    if (typeof localStorage === "undefined") return undefined;
    return localStorage;
  } catch {
    return undefined;
  }
}

function fnv1a(raw: string, seed = FNV_OFF): number {
  let h = seed;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/** Stable hex digest H(...parts). Same inputs → same 16-char key in Node and the browser. */
export function pcgHash(parts: Array<string | number>): string {
  const raw = parts.map((p) => String(p ?? "").trim().toLowerCase()).join("\0");
  const lo = fnv1a(raw);
  const hi = fnv1a(raw, 0x811c9dc5 ^ raw.length);
  return `${lo.toString(16).padStart(8, "0")}${hi.toString(16).padStart(8, "0")}`;
}

export function isRunSeed(v?: string | null): v is string {
  return !!v && /^s[a-z0-9]{8,32}$/i.test(v);
}

/** Fresh run seed `s` — New citadel / first Play. */
export function newRunSeed(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function readRunBag(): RunBag | null {
  try {
    const raw = storage()?.getItem(RUN_KEY);
    if (!raw) return null;
    const bag = JSON.parse(raw) as RunBag;
    return isRunSeed(bag?.seed) ? { id: bag.id, seed: bag.seed } : null;
  } catch {
    return null;
  }
}

function writeRunBag(seed: string, citadel?: string) {
  if (!isRunSeed(seed)) return;
  try {
    storage()?.setItem(RUN_KEY, JSON.stringify({ id: citadel || "", seed }));
  } catch {
    /* */
  }
}

export function readRunSeed(citadel?: string): string {
  const bag = readRunBag();
  if (!bag) return "";
  if (citadel && bag.id && bag.id !== citadel) return "";
  return bag.seed;
}

/**
 * Bind `s` to this citadel. Reuses a Keep-persisted seed; otherwise mints one.
 * New citadel should pass no existing seed so the run is unique.
 */
export function beginRunSeed(citadel: string, existing?: string | null): string {
  const id = String(citadel || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  if (isRunSeed(existing)) {
    writeRunBag(existing, id);
    return existing;
  }
  const bag = readRunBag();
  if (bag && isRunSeed(bag.seed) && (!id || !bag.id || bag.id === id)) {
    if (id && !bag.id) writeRunBag(bag.seed, id);
    return bag.seed;
  }
  const s = newRunSeed();
  writeRunBag(s, id);
  return s;
}

/** Plate seed `s_i = H(s, i, act, biome)`. */
export function plateSeed(s: string, i: number, act: string, biome: string): string {
  return pcgHash([s, Math.round(Number(i) || 0), act, biome]);
}

/** Enter seed `s_enter = H(s, i, enter, from, to, door)`. */
export function enterSeed(s: string, i: number, from: string, to: string, door: string): string {
  return pcgHash([s, Math.round(Number(i) || 0), "enter", from, to, door]);
}

/** Rail 1: Imagine only for plate / enter / explicit forge. Walk-toward-door is speculation. */
export function mayImagine(job: ImagineJob): boolean {
  return job === "plate" || job === "enter" || job === "forge";
}

/** Walk pulse on approach; enter pulse when the hung door is ready. Stay / empty = no glow. */
export function enterReadyGlow(arm?: GlowArm | string | null): GlowPulse | "" {
  if (arm === "walk") return "walk";
  if (arm === "enter") return "enter";
  return "";
}

export function stockEnterBridge(url?: string | null): string {
  return durableClip(url) || STOCK_ENTER_BRIDGE;
}

/**
 * Double-tap hot path: cached s_enter or stock bridge.
 * NEVER Imagine. Approach / speculate must not call this to spend.
 */
export function playEnterHot(key: string, stockBridge?: string | null): string {
  return reuseClipBeforeRecook(key) || stockEnterBridge(stockBridge);
}

/** Graph commit only when a real clip exists — cache hit or stock bridge, never an empty edge. */
export function mayCommitEnterGraph(clip?: string | null): boolean {
  return Boolean(durableClip(clip));
}

export function isPaidJob(job: ImagineJob): job is PaidJob {
  return job === "plate" || job === "enter" || job === "forge";
}

/** Explicit confirm — the only way a paid Imagine ticket is minted. */
export function confirmForgeTicket(job: PaidJob): ForgeTicket {
  const ticket: ForgeTicket = { job, confirm: true, at: Date.now() };
  forgeTickets[job] = ticket;
  return ticket;
}

export function peekForgeTicket(job?: PaidJob): ForgeTicket | null {
  if (job) return forgeTickets[job] || null;
  return forgeTickets.enter || forgeTickets.forge || forgeTickets.plate || null;
}

export function takeForgeTicket(job?: PaidJob): ForgeTicket | null {
  const ticket = peekForgeTicket(job);
  if (!ticket?.confirm) return null;
  delete forgeTickets[ticket.job];
  return ticket;
}

export function dropForgeTicket() {
  forgeTickets = {};
}

/**
 * Rail 2: paid Imagine only with an explicit confirm ticket.
 * Approach / walk-toward-door / speculate / enter-hot never spend.
 */
export function mayPaidImagine(job: ImagineJob, ticket?: ForgeTicket | null): boolean {
  if (job === "walk-toward-door" || job === "speculate" || job === "approach" || job === "enter-hot") return false;
  if (!isPaidJob(job) || !mayImagine(job)) return false;
  const hold = ticket === undefined ? forgeTickets[job] : ticket;
  return hold?.confirm === true && hold.job === job;
}

function durableClip(url?: string | null): string {
  const u = String(url || "").trim();
  if (!u || u.length > 2000) return "";
  if (u.startsWith("blob:") || u.startsWith("data:")) return "";
  if (u.startsWith("/") || /^https?:\/\//i.test(u)) return u;
  return "";
}

function readClipBag(): ClipBag {
  try {
    const raw = storage()?.getItem(CLIP_KEY);
    if (!raw) return {};
    const bag = JSON.parse(raw) as ClipBag;
    if (!bag || typeof bag !== "object") return {};
    const out: ClipBag = {};
    for (const [k, v] of Object.entries(bag)) {
      const url = durableClip(v?.url);
      if (!k || !url) continue;
      out[k] = { url, kind: v.kind === "enter" ? "enter" : "plate", at: Number(v.at) || 0 };
    }
    return out;
  } catch {
    return {};
  }
}

function writeClipBag(bag: ClipBag) {
  try {
    const keys = Object.keys(bag).sort((a, b) => (bag[b]!.at || 0) - (bag[a]!.at || 0)).slice(0, 96);
    const slim: ClipBag = {};
    for (const k of keys) slim[k] = bag[k]!;
    storage()?.setItem(CLIP_KEY, JSON.stringify(slim));
  } catch {
    /* */
  }
}

export function clipCacheGet(key: string): string {
  if (!key) return "";
  return durableClip(readClipBag()[key]?.url);
}

export function clipCachePut(key: string, url: string, kind: ClipCacheKind): string {
  const clip = durableClip(url);
  if (!key || !clip) return "";
  const bag = readClipBag();
  bag[key] = { url: clip, kind, at: Date.now() };
  writeClipBag(bag);
  return clip;
}

/** Reuse a cooked clip keyed by `s_i` / `s_enter` before any Imagine recook. */
export function reuseClipBeforeRecook(key: string): string {
  return clipCacheGet(key);
}

export function clipCacheSnapshot(): Record<string, string> {
  const bag = readClipBag();
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(bag)) {
    if (v?.url) out[k] = v.url;
  }
  return out;
}

export function hydrateClipCache(clips?: Record<string, string> | null, kind: ClipCacheKind = "plate") {
  if (!clips) return;
  const bag = readClipBag();
  for (const [k, url] of Object.entries(clips)) {
    const clip = durableClip(url);
    if (!k || !clip) continue;
    bag[k] = { url: clip, kind: bag[k]?.kind || kind, at: bag[k]?.at || Date.now() };
  }
  writeClipBag(bag);
}

export function packClipCache(clips?: Record<string, string> | null): Record<string, string> | undefined {
  const bag = { ...clipCacheSnapshot(), ...(clips || {}) };
  const out: Record<string, string> = {};
  for (const [k, url] of Object.entries(bag)) {
    const clip = durableClip(url);
    if (k && clip) out[k] = clip;
  }
  const keys = Object.keys(out);
  return keys.length ? out : undefined;
}

export function mergeClipCache(
  a?: Record<string, string> | null,
  b?: Record<string, string> | null,
): Record<string, string> | undefined {
  return packClipCache({ ...(a || {}), ...(b || {}) });
}
