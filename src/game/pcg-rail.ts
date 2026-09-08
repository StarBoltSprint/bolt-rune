/**
 * PCG rail 1 — run seed, plate / enter hashes, clip cache.
 * PCG rail 2 — enter-ready glow, hot-path enter never Imagines, Hall′ after clip.
 * PCG rail 3 — graph grammar pins live in pcg-grammar.ts (seed + momentum).
 * Chunk bridge keys H(s, fromId, toId, act) live in pcg-chunk.ts and hook this cache.
 * Asteroid HOLD. No Imagine on walk-toward-door speculation.
 */

const FNV_OFF = 2166136261;
const FNV_PRIME = 16777619;

const RUN_KEY = "bolt-pcg-run-v1";
const CLIP_KEY = "bolt-pcg-clips-v1";

export type ImagineJob = "plate" | "enter" | "forge" | "walk-toward-door" | "speculate" | "enter-hot" | "enter-confirm";
export type ClipCacheKind = "plate" | "enter";
export type DoorGlow = "idle" | "walk-ready" | "enter-ready";
export type EnterSource = "cache" | "stock" | "";
export type HallCommit = "pass" | "hold";
export type PaidEnterTicket = "confirm" | "forge" | "ticket";

export type EnterLookup = {
  s?: string | null;
  i?: number;
  from: string;
  to: string;
  door: string;
  /** Chunk-to-chunk stitch. Cache key H(s, fromId, toId, act) when both ids set. */
  fromId?: string;
  toId?: string;
  act?: "enter" | "walk-across";
};

export type EnterClipHit = {
  key: string;
  url: string;
  source: EnterSource;
};

export type EnterHotPath = {
  act: "enter" | "idle";
  url: string;
  source: EnterSource;
  imagine: boolean;
  commit: HallCommit;
};

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

/** Chunk bridge seed `s_bridge = H(s, fromId, toId, act)`. */
export function bridgeSeed(s: string, fromId: string, toId: string, act = "enter"): string {
  return pcgHash([s, fromId, toId, act]);
}

/** Rail 1+2: plate / enter / forge / enter-confirm. Walk-toward-door and enter-hot never Imagine. */
export function mayImagine(job: ImagineJob): boolean {
  return job === "plate" || job === "enter" || job === "forge" || job === "enter-confirm";
}

/** Paid enter cook — Forge / ticket / explicit confirm only. Never walk-toward-door. */
export function mayPaidEnterCook(ticket: PaidEnterTicket): boolean {
  return ticket === "confirm" || ticket === "forge" || ticket === "ticket";
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

/* ── PCG rail 2: enter-ready glow, stock bridge, no Imagine on double-tap ── */

const stockLib = new Map<string, string>();

function pairKey(from: string, to: string, door = ""): string {
  return [from, to, door].map((p) => String(p ?? "").trim().toLowerCase()).join(">");
}

/**
 * Stock enter-bridge library hook.
 * Full stock enter mp4s are not shipped (too heavy). Register a playable
 * from→to (optional door) URL, or leave empty — refuse enter, never spin / Imagine.
 */
export function registerStockBridge(from: string, to: string, url: string, door?: string): string {
  const clip = durableClip(url);
  if (!clip) return "";
  const letter = String(door || "").trim();
  stockLib.set(pairKey(from, to, letter), clip);
  if (letter) stockLib.set(pairKey(from, to, ""), clip);
  return clip;
}

export function clearStockBridges() {
  stockLib.clear();
}

/** Stock bridge for this from→to pair (and optional door). Empty = unwired. */
export function stockBridge(from: string, to: string, door?: string): string {
  const letter = String(door || "").trim();
  return stockLib.get(pairKey(from, to, letter)) || stockLib.get(pairKey(from, to, "")) || "";
}

/** `s_enter = H(s, i, enter, from, to, door)` — rail 1 key for enter cache lookup. */
export function enterCacheKey(opts: EnterLookup): string {
  return enterSeed(String(opts.s || ""), Number(opts.i) || 0, opts.from, opts.to, opts.door);
}

/** Cache hit by chunk pair H(s, fromId, toId, act), else `s_enter`, else stock. Never starts Imagine. */
export function lookupEnterClip(opts: EnterLookup): EnterClipHit {
  if (opts.fromId && opts.toId) {
    const bkey = bridgeSeed(String(opts.s || ""), opts.fromId, opts.toId, opts.act || "enter");
    const bridged = bkey ? reuseClipBeforeRecook(bkey) : "";
    if (bridged) return { key: bkey, url: bridged, source: "cache" };
    const pair = stockBridge(opts.fromId, opts.toId);
    if (pair) return { key: bkey, url: pair, source: "stock" };
  }
  const key = enterCacheKey(opts);
  const cached = key ? reuseClipBeforeRecook(key) : "";
  if (cached) return { key, url: cached, source: "cache" };
  const stock = stockBridge(opts.from, opts.to, opts.door);
  if (stock) return { key, url: stock, source: "stock" };
  return { key, url: "", source: "" };
}

export function isEnterReady(opts: EnterLookup): boolean {
  return Boolean(lookupEnterClip(opts).url);
}

/** Hall door you can tap to walk (not already standing on it). */
export function isWalkReady(here: string, door: string): boolean {
  const at = String(here || "").trim().toLowerCase();
  const id = String(door || "").trim().toLowerCase();
  if (!id || (id !== "m1" && id !== "m2" && id !== "a" && id !== "b")) return false;
  const doorId = id === "a" ? "m1" : id === "b" ? "m2" : id;
  if (at === doorId) return false;
  return at === "spawn" || at === "m1" || at === "m2" || !at;
}

/**
 * Picture-UI glow.
 * walk-ready = can tap to walk.
 * enter-ready = second / distinct pulse only when enter clip (s_enter cache) or stock bridge exists,
 * or the hung biome path is already wired.
 */
export function doorGlowState(opts: {
  here: string;
  door: string;
  enterReady?: boolean;
  hung?: boolean;
}): DoorGlow {
  const id = String(opts.door || "").trim().toLowerCase();
  const doorId = id === "a" ? "m1" : id === "b" ? "m2" : id;
  const at = String(opts.here || "").trim().toLowerCase() === doorId;
  const enter = Boolean(opts.enterReady || (at && opts.hung));
  if (at && enter) return "enter-ready";
  if (isWalkReady(opts.here, opts.door)) return "walk-ready";
  return "idle";
}

/** Graph commit Hall′ only after a playable enter clip exists (PASS). */
export function commitHallPrime(clip?: string | null): HallCommit {
  return durableClip(clip) ? "pass" : "hold";
}

/** Put a cooked enter URL under `s_enter` — confirm / Forge / ticket only. */
export function replaceStockEnter(key: string, cookedUrl: string, ticket: PaidEnterTicket): string {
  if (!mayPaidEnterCook(ticket) || !mayImagine("enter-confirm")) return "";
  return clipCachePut(key, cookedUrl, "enter");
}

/**
 * Double-tap / enter hot path.
 * Plays cached `s_enter` or stock only. Unwired / uncached → idle, never Imagine.
 * Hung biome enter is a separate PASS (engine plays the hung playlist).
 */
export function resolveEnterHotPath(opts: EnterLookup & { hung?: boolean }): EnterHotPath {
  if (mayImagine("enter-hot") || mayImagine("walk-toward-door") || mayImagine("speculate")) {
    return { act: "idle", url: "", source: "", imagine: false, commit: "hold" };
  }
  if (opts.hung) {
    return { act: "enter", url: "", source: "", imagine: false, commit: "hold" };
  }
  const hit = lookupEnterClip(opts);
  if (!hit.url) {
    return { act: "idle", url: "", source: "", imagine: false, commit: "hold" };
  }
  return {
    act: "enter",
    url: hit.url,
    source: hit.source,
    imagine: false,
    commit: commitHallPrime(hit.url),
  };
}
