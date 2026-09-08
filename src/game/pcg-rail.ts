/**
 * PCG rail 1 — run seed, plate / enter hashes, clip cache.
 * PCG rail 2 — enter-ready glow, hot-path enter never Imagines, Hall′ after clip.
 * PCG rail 3 — graph grammar pins live in pcg-grammar.ts (seed + momentum).
 * Chunk bridge keys H(s, fromId, toId, act) live in pcg-chunk.ts and hook this cache.
 * Rich cache key — hash(railsVersion, runSeed, plateIndex?, act, biomeFrom, biomeTo,
 *   chunkFromId, chunkToId, role, slotsHash, cueSheetHash). PASS rows only.
 * LRU + pin — Keep edges / hung artifacts / Hall′ spawn stills never evict.
 * Picture-time — sum of played plate durations; never Date.now in the generator.
 * Asteroid HOLD. No Imagine on walk-toward-door speculation.
 */

const FNV_OFF = 2166136261;
const FNV_PRIME = 16777619;

const RUN_KEY = "bolt-pcg-run-v1";
const CLIP_KEY = "bolt-pcg-clips-v1";
const PIN_KEY = "bolt-pcg-clip-pins-v1";
const FAIL_KEY = "bolt-pcg-clip-fail-v1";

/** Rails stamp on every PASS cache row + Keep share. */
export const RAILS_VERSION = "bolt-1" as const;

export const CLIP_CACHE_COUNT_CAP = 96;
export const CLIP_CACHE_BYTES_CAP = 64 * 1024 * 1024;
const FAIL_REASON_CAP = 32;

let testCaps: { count?: number; bytes?: number } | null = null;

export type ImagineJob = "plate" | "enter" | "forge" | "walk-toward-door" | "speculate" | "enter-hot" | "enter-confirm";
export type ClipCacheKind = "plate" | "enter";
export type DoorGlow = "idle" | "walk-ready" | "enter-ready";
export type EnterSource = "cache" | "stock" | "";
export type HallCommit = "pass" | "hold";
export type PaidEnterTicket = "confirm" | "forge" | "ticket";

/** Cue sheet slice stored on a PASS row — matches pcg-play Cue without importing it. */
export type ClipCue = {
  side: string;
  on: number;
  off: number;
  kind?: string;
};

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
  biomeFrom?: string;
  biomeTo?: string;
  role?: string;
  slots?: unknown;
  slotsHash?: string;
  cues?: ClipCue[];
  cueSheetHash?: string;
};

/** Inputs for the rich clip key — extends simple s_i / s_enter. */
export type RichClipParts = {
  railsVersion?: string;
  runSeed: string;
  plateIndex?: number | null;
  act: string;
  biomeFrom?: string;
  biomeTo?: string;
  chunkFromId?: string;
  chunkToId?: string;
  role?: string;
  slots?: unknown;
  slotsHash?: string;
  cues?: ClipCue[];
  cueSheetHash?: string;
};

export type ClipCacheKey = string | RichClipParts;

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
  key?: string;
  url: string;
  kind: ClipCacheKind;
  at: number;
  stillStart?: string;
  stillEnd?: string;
  cues?: ClipCue[];
  smoke?: "PASS";
  railsVersion?: typeof RAILS_VERSION | string;
  bytes?: number;
  createdAt?: number;
  pin?: boolean;
};

/** Playable cache row — FAIL never lives here. */
export type ClipCachePass = {
  key: string;
  url: string;
  stillStart: string;
  stillEnd: string;
  cues: ClipCue[];
  smoke: "PASS";
  railsVersion: typeof RAILS_VERSION;
  bytes: number;
  createdAt: number;
  kind: ClipCacheKind;
};

export type ClipCachePutMeta = {
  stillStart?: string;
  stillEnd?: string;
  cues?: ClipCue[];
  bytes?: number;
  pin?: boolean;
  createdAt?: number;
};

export type ClipCacheSmoke = {
  smoke?: string;
  reasons?: string[];
  attach?: {
    stillEnd?: string;
    stillStart?: string;
    cues?: ClipCue[];
    railsVersion?: string;
  };
} | null;

export type ClipFailRow = {
  key: string;
  reasons: string[];
  at: number;
};

export type KeepPinSession = {
  bank?: Array<{ key?: string; url?: string; start?: string; end?: string } | null> | null;
  halls?: Array<{
    still?: string;
    start?: string;
    plate?: string;
    bank?: Array<{ key?: string; url?: string; start?: string; end?: string } | null> | null;
    rift?: { m1?: { still?: string; playlist?: string[]; art?: string }; m2?: { still?: string; playlist?: string[]; art?: string } };
  } | null> | null;
  start?: string;
  plate?: string;
  clips?: Record<string, string> | null;
  rift?: { m1?: { still?: string; playlist?: string[]; art?: string }; m2?: { still?: string; playlist?: string[]; art?: string } };
  pins?: Array<{ id?: string } | null> | null;
};

export type HungPinArt = {
  still?: string;
  playlist?: string[] | null;
  id?: string;
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

function stableJson(value: unknown): string {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  return `{${keys.map((k) => `${k}:${stableJson(rec[k])}`).join(",")}}`;
}

/** Hash of prompt slots — same slots → same hex. */
export function slotsHash(slots?: unknown | null): string {
  if (slots == null) return pcgHash(["slots", ""]);
  return pcgHash(["slots", stableJson(slots)]);
}

/** Hash of a cue sheet — side/on/off/kind only. */
export function cueSheetHash(cues?: ClipCue[] | null): string {
  const rows = (Array.isArray(cues) ? cues : []).map((c) => {
    const on = Number(c?.on);
    const off = Number(c?.off);
    return [
      String(c?.side || "").trim().toLowerCase(),
      Number.isFinite(on) ? on.toFixed(3) : "0",
      Number.isFinite(off) ? off.toFixed(3) : "0",
      String(c?.kind || "").trim().toLowerCase(),
    ].join(":");
  });
  return pcgHash(["cues", rows.join("|")]);
}

/**
 * Rich clip key beyond simple s_i.
 * H(railsVersion, runSeed, plateIndex?, act, biomeFrom, biomeTo, chunkFromId, chunkToId, role, slotsHash, cueSheetHash)
 */
export function richClipKey(parts: RichClipParts): string {
  const i = parts.plateIndex;
  const plate = i == null || !Number.isFinite(Number(i)) ? "" : String(Math.round(Number(i)));
  const sh = parts.slotsHash || slotsHash(parts.slots);
  const ch = parts.cueSheetHash || cueSheetHash(parts.cues);
  return pcgHash([
    parts.railsVersion || RAILS_VERSION,
    parts.runSeed,
    plate,
    parts.act,
    parts.biomeFrom || "",
    parts.biomeTo || "",
    parts.chunkFromId || "",
    parts.chunkToId || "",
    parts.role || "",
    sh,
    ch,
  ]);
}

export function clipCacheKey(key: ClipCacheKey): string {
  if (typeof key === "string") return key;
  return richClipKey(key);
}

function hasRichParts(opts: EnterLookup): boolean {
  return Boolean(
    opts.biomeFrom ||
      opts.biomeTo ||
      opts.role ||
      opts.slots ||
      opts.slotsHash ||
      opts.cues ||
      opts.cueSheetHash,
  );
}

export function richEnterKey(opts: EnterLookup): string {
  const act = opts.act || "enter";
  return richClipKey({
    railsVersion: RAILS_VERSION,
    runSeed: String(opts.s || ""),
    plateIndex: opts.i,
    act,
    biomeFrom: opts.biomeFrom || opts.from,
    biomeTo: opts.biomeTo || opts.to,
    chunkFromId: opts.fromId || opts.from,
    chunkToId: opts.toId || opts.to,
    role: opts.role || act,
    slots: opts.slots,
    slotsHash: opts.slotsHash,
    cues: opts.cues,
    cueSheetHash: opts.cueSheetHash,
  });
}

export function isRunSeed(v?: string | null): v is string {
  return !!v && /^s[a-z0-9]{8,32}$/i.test(v);
}

/** Fresh run seed `s` — New citadel / first Play. Date.now here is an id, not the film clock. */
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

export function clipCacheTestCaps(caps: { count?: number; bytes?: number } | null) {
  testCaps = caps;
}

function countCap() {
  return testCaps?.count ?? CLIP_CACHE_COUNT_CAP;
}

function bytesCap() {
  return testCaps?.bytes ?? CLIP_CACHE_BYTES_CAP;
}

function readPinSet(): Set<string> {
  try {
    const raw = storage()?.getItem(PIN_KEY);
    if (!raw) return new Set();
    const list = JSON.parse(raw) as string[];
    if (!Array.isArray(list)) return new Set();
    return new Set(list.map((k) => String(k || "")).filter(Boolean).slice(0, 256));
  } catch {
    return new Set();
  }
}

function writePinSet(pins: Set<string>) {
  try {
    storage()?.setItem(PIN_KEY, JSON.stringify([...pins].slice(0, 256)));
  } catch {
    /* */
  }
}

function isPinnedKey(key: string, row?: ClipCacheRow | null, pins?: Set<string>): boolean {
  if (!key) return false;
  if (row?.pin) return true;
  return (pins || readPinSet()).has(key);
}

function rowBytes(row?: ClipCacheRow | null): number {
  const n = Number(row?.bytes);
  if (Number.isFinite(n) && n > 0) return n;
  return Math.max(1, String(row?.url || "").length);
}

function slimCues(cues?: ClipCue[] | null): ClipCue[] {
  if (!Array.isArray(cues)) return [];
  return cues
    .map((c) => ({
      side: String(c?.side || "").trim(),
      on: Number(c?.on) || 0,
      off: Number(c?.off) || 0,
      kind: c?.kind ? String(c.kind) : undefined,
    }))
    .filter((c) => c.side)
    .slice(0, 16);
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
      if (v?.smoke && v.smoke !== "PASS") continue;
      out[k] = {
        key: k,
        url,
        kind: v.kind === "enter" ? "enter" : "plate",
        at: Number(v.at) || 0,
        stillStart: String(v.stillStart || "") || undefined,
        stillEnd: String(v.stillEnd || "") || undefined,
        cues: slimCues(v.cues).length ? slimCues(v.cues) : undefined,
        smoke: "PASS",
        railsVersion: v.railsVersion || RAILS_VERSION,
        bytes: Number(v.bytes) || rowBytes({ url } as ClipCacheRow),
        createdAt: Number(v.createdAt) || Number(v.at) || 0,
        pin: Boolean(v.pin),
      };
    }
    return out;
  } catch {
    return {};
  }
}

function evictClipBag(bag: ClipBag): ClipBag {
  const pins = readPinSet();
  const entries = Object.entries(bag);
  const pinned: Array<[string, ClipCacheRow]> = [];
  const unpinned: Array<[string, ClipCacheRow]> = [];
  for (const row of entries) {
    if (isPinnedKey(row[0], row[1], pins)) pinned.push(row);
    else unpinned.push(row);
  }
  unpinned.sort((a, b) => (a[1]!.at || 0) - (b[1]!.at || 0));
  let count = entries.length;
  let bytes = entries.reduce((n, [, v]) => n + rowBytes(v), 0);
  const drop = new Set<string>();
  const capN = countCap();
  const capB = bytesCap();
  for (const [k, v] of unpinned) {
    if (count <= capN && bytes <= capB) break;
    drop.add(k);
    count -= 1;
    bytes -= rowBytes(v);
  }
  const slim: ClipBag = {};
  for (const [k, v] of entries) {
    if (drop.has(k)) continue;
    slim[k] = { ...v, pin: isPinnedKey(k, v, pins) || Boolean(v.pin) };
  }
  return slim;
}

function writeClipBag(bag: ClipBag) {
  try {
    storage()?.setItem(CLIP_KEY, JSON.stringify(evictClipBag(bag)));
  } catch {
    /* */
  }
}

function readFailBag(): Record<string, ClipFailRow> {
  try {
    const raw = storage()?.getItem(FAIL_KEY);
    if (!raw) return {};
    const bag = JSON.parse(raw) as Record<string, ClipFailRow>;
    if (!bag || typeof bag !== "object") return {};
    const out: Record<string, ClipFailRow> = {};
    for (const [k, v] of Object.entries(bag)) {
      if (!k || !v) continue;
      const reasons = Array.isArray(v.reasons) ? v.reasons.map((r) => String(r || "")).filter(Boolean) : [];
      out[k] = { key: k, reasons, at: Number(v.at) || 0 };
    }
    return out;
  } catch {
    return {};
  }
}

function writeFailBag(bag: Record<string, ClipFailRow>) {
  try {
    const keys = Object.keys(bag)
      .sort((a, b) => (bag[b]!.at || 0) - (bag[a]!.at || 0))
      .slice(0, FAIL_REASON_CAP);
    const slim: Record<string, ClipFailRow> = {};
    for (const k of keys) slim[k] = bag[k]!;
    storage()?.setItem(FAIL_KEY, JSON.stringify(slim));
  } catch {
    /* */
  }
}

/** Optional FAIL reason cache — never playable. */
export function clipCachePutFail(key: string, reasons: string[]): ClipFailRow | null {
  const id = clipCacheKey(key);
  if (!id) return null;
  const list = (reasons || []).map((r) => String(r || "").trim()).filter(Boolean).slice(0, 12);
  const row: ClipFailRow = { key: id, reasons: list, at: Date.now() };
  const bag = readFailBag();
  bag[id] = row;
  writeFailBag(bag);
  return row;
}

export function clipCacheFailReasons(key: string): string[] {
  const id = clipCacheKey(key);
  if (!id) return [];
  return readFailBag()[id]?.reasons?.slice() || [];
}

export function clipCacheGet(key: ClipCacheKey): string {
  const id = clipCacheKey(key);
  if (!id) return "";
  const row = readClipBag()[id];
  if (!row || (row.smoke && row.smoke !== "PASS")) return "";
  return durableClip(row.url);
}

export function clipCacheGetPass(key: ClipCacheKey): ClipCachePass | null {
  const id = clipCacheKey(key);
  if (!id) return null;
  const row = readClipBag()[id];
  const url = durableClip(row?.url);
  if (!row || !url || (row.smoke && row.smoke !== "PASS")) return null;
  return {
    key: id,
    url,
    stillStart: String(row.stillStart || ""),
    stillEnd: String(row.stillEnd || ""),
    cues: slimCues(row.cues),
    smoke: "PASS",
    railsVersion: (row.railsVersion as typeof RAILS_VERSION) || RAILS_VERSION,
    bytes: rowBytes(row),
    createdAt: Number(row.createdAt) || Number(row.at) || 0,
    kind: row.kind === "enter" ? "enter" : "plate",
  };
}

function touchPin(key: string, pin: boolean) {
  const pins = readPinSet();
  if (pin) pins.add(key);
  else pins.delete(key);
  writePinSet(pins);
}

export function clipCachePin(keys: string | string[]): string[] {
  const list = (Array.isArray(keys) ? keys : [keys]).map((k) => String(k || "")).filter(Boolean);
  if (!list.length) return [...readPinSet()];
  const pins = readPinSet();
  const bag = readClipBag();
  for (const k of list) {
    pins.add(k);
    if (bag[k]) bag[k] = { ...bag[k]!, pin: true, at: bag[k]!.at };
  }
  writePinSet(pins);
  writeClipBag(bag);
  return [...pins];
}

export function clipCacheUnpin(keys: string | string[]): string[] {
  const list = (Array.isArray(keys) ? keys : [keys]).map((k) => String(k || "")).filter(Boolean);
  const pins = readPinSet();
  const bag = readClipBag();
  for (const k of list) {
    pins.delete(k);
    if (bag[k]) bag[k] = { ...bag[k]!, pin: false };
  }
  writePinSet(pins);
  writeClipBag(bag);
  return [...pins];
}

export function clipCachePinned(): string[] {
  return [...readPinSet()];
}

export function clipCacheIsPinned(key: string): boolean {
  return isPinnedKey(String(key || ""), readClipBag()[key]);
}

/** Optional Smoke stamp. FAIL never enters the playable cook cache. */
export function clipCachePut(
  key: ClipCacheKey,
  url: string,
  kind: ClipCacheKind,
  smoke?: ClipCacheSmoke,
  meta?: ClipCachePutMeta,
): string {
  const id = clipCacheKey(key);
  if (smoke && smoke.smoke !== "PASS") {
    clipCachePutFail(id, smoke.reasons || [String(smoke.smoke || "FAIL")]);
    return "";
  }
  const clip = durableClip(url);
  if (!id || !clip) return "";
  const attach = smoke && "attach" in smoke ? smoke.attach : undefined;
  const cues = slimCues(meta?.cues || attach?.cues);
  const stillStart = String(meta?.stillStart || attach?.stillStart || "").trim();
  const stillEnd = String(meta?.stillEnd || attach?.stillEnd || "").trim();
  const now = Date.now(); // LRU / createdAt stamp only — not picture-time / peak
  const pin = Boolean(meta?.pin) || readPinSet().has(id);
  const bag = readClipBag();
  bag[id] = {
    key: id,
    url: clip,
    kind,
    at: now,
    stillStart: stillStart || undefined,
    stillEnd: stillEnd || undefined,
    cues: cues.length ? cues : undefined,
    smoke: "PASS",
    railsVersion: attach?.railsVersion || RAILS_VERSION,
    bytes: Number(meta?.bytes) > 0 ? Number(meta?.bytes) : Math.max(1, clip.length),
    createdAt: Number(meta?.createdAt) || bag[id]?.createdAt || now,
    pin,
  };
  if (pin) touchPin(id, true);
  writeClipBag(bag);
  return clip;
}

/** Reuse a cooked clip keyed by `s_i` / `s_enter` / rich key before any Imagine recook. */
export function reuseClipBeforeRecook(key: ClipCacheKey): string {
  return clipCacheGet(key);
}

function collectSessionUrls(session?: KeepPinSession | null, hung: HungPinArt[] = []): string[] {
  const urls: string[] = [];
  const push = (u?: string | null) => {
    const clip = durableClip(u) || String(u || "").trim();
    if (clip && (clip.startsWith("/") || clip.startsWith("http") || clip.startsWith("data:image/"))) urls.push(clip);
  };
  for (const b of session?.bank || []) {
    push(b?.url);
    push(b?.start);
    push(b?.end);
  }
  push(session?.start);
  push(session?.plate);
  for (const h of session?.halls || []) {
    if (!h) continue;
    push(h.still);
    push(h.start);
    push(h.plate);
    for (const b of h.bank || []) {
      push(b?.url);
      push(b?.start);
      push(b?.end);
    }
    push(h.rift?.m1?.still);
    push(h.rift?.m2?.still);
    for (const u of h.rift?.m1?.playlist || []) push(u);
    for (const u of h.rift?.m2?.playlist || []) push(u);
  }
  push(session?.rift?.m1?.still);
  push(session?.rift?.m2?.still);
  for (const u of session?.rift?.m1?.playlist || []) push(u);
  for (const u of session?.rift?.m2?.playlist || []) push(u);
  for (const a of hung) {
    push(a.still);
    for (const u of a.playlist || []) push(u);
  }
  return [...new Set(urls)];
}

function collectSessionEdgeKeys(session?: KeepPinSession | null): string[] {
  const keys: string[] = [];
  const push = (k?: string | null) => {
    const id = String(k || "").trim();
    if (id) keys.push(id);
  };
  for (const b of session?.bank || []) push(b?.key);
  for (const h of session?.halls || []) {
    for (const b of h?.bank || []) push(b?.key);
  }
  for (const k of Object.keys(session?.clips || {})) push(k);
  return [...new Set(keys)];
}

/** Pin cache rows whose url / still matches hung artifacts or Hall′ spawn stills. */
export function pinClipUrls(urls: string[]): string[] {
  const want = new Set(urls.map((u) => String(u || "").trim()).filter(Boolean));
  if (!want.size) return clipCachePinned();
  const bag = readClipBag();
  const hit: string[] = [];
  for (const [k, v] of Object.entries(bag)) {
    if (want.has(v.url) || (v.stillStart && want.has(v.stillStart)) || (v.stillEnd && want.has(v.stillEnd))) {
      hit.push(k);
    }
  }
  return clipCachePin(hit);
}

/**
 * Pin Keep graph edges in the current citadel + hung artifacts + Hall′ spawn stills.
 * Those keys are never LRU-evicted.
 */
export function pinKeepFromSession(session?: KeepPinSession | null, hung: HungPinArt[] = []): string[] {
  const edgeKeys = collectSessionEdgeKeys(session);
  const urls = collectSessionUrls(session, hung);
  clipCachePin(edgeKeys);
  pinClipUrls(urls);
  return clipCachePinned();
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

/** Enter cache key — rich hash when biome/role/slots/cues are present, else `s_enter`. */
export function enterCacheKey(opts: EnterLookup): string {
  if (hasRichParts(opts)) return richEnterKey(opts);
  return enterSeed(String(opts.s || ""), Number(opts.i) || 0, opts.from, opts.to, opts.door);
}

function firstCached(keys: string[]): { key: string; url: string } | null {
  for (const key of keys) {
    if (!key) continue;
    const url = reuseClipBeforeRecook(key);
    if (url) return { key, url };
  }
  return null;
}

/** Cache hit by rich key, chunk pair H(s, fromId, toId, act), else `s_enter`, else stock. Never starts Imagine. */
export function lookupEnterClip(opts: EnterLookup): EnterClipHit {
  const rich = hasRichParts(opts) ? richEnterKey(opts) : "";
  if (opts.fromId && opts.toId) {
    const bkey = bridgeSeed(String(opts.s || ""), opts.fromId, opts.toId, opts.act || "enter");
    const hit = firstCached([rich, bkey]);
    if (hit) return { key: hit.key, url: hit.url, source: "cache" };
    const pair = stockBridge(opts.fromId, opts.toId);
    if (pair) return { key: rich || bkey, url: pair, source: "stock" };
  }
  const key = enterCacheKey(opts);
  const hit = firstCached([rich, key]);
  if (hit) return { key: hit.key, url: hit.url, source: "cache" };
  const stock = stockBridge(opts.from, opts.to, opts.door);
  if (stock) return { key: rich || key, url: stock, source: "stock" };
  return { key: rich || key, url: "", source: "" };
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

/** Graph commit Hall′ only after a playable enter clip exists (PASS). Smoke FAIL holds. */
export function commitHallPrime(clip?: string | null, smoke?: { smoke?: string } | null): HallCommit {
  if (smoke && smoke.smoke !== "PASS") return "hold";
  return durableClip(clip) ? "pass" : "hold";
}

/** Put a cooked enter URL under `s_enter` — confirm / Forge / ticket only. Smoke FAIL drops. */
export function replaceStockEnter(
  key: string,
  cookedUrl: string,
  ticket: PaidEnterTicket,
  smoke?: { smoke?: string } | null,
): string {
  if (smoke && smoke.smoke !== "PASS") return "";
  if (!mayPaidEnterCook(ticket) || !mayImagine("enter-confirm")) return "";
  return clipCachePut(key, cookedUrl, "enter", smoke);
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

/* ── Picture-time clock: film strip, never wall clock ── */

/** 8s quiet / calm (decree 505). Lean starts after this. */
export const PICTURE_CALM_MS = 8000;
/** ~45s the world answers — peak window opens. */
export const PICTURE_PEAK_MS = 45000;
/** 45–90s cosmos (decree 504). Peak window closes. */
export const PICTURE_PEAK_END_MS = 90000;
/** ~60s bone for phase 0–1. */
export const PICTURE_BONE_MS = 60000;
/** Peak / relic need high momentum — rail-3 relic τ. */
export const PEAK_MOMENTUM_TAU = 0.7;

export type PlayedPlate = number | { durationMs?: number | null };
export type PicturePhase = "calm" | "lean" | "peak" | "recede";

function plateMs(plate: PlayedPlate | null | undefined): number {
  if (plate == null) return 0;
  const raw = typeof plate === "number" ? plate : Number(plate.durationMs);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw;
}

/**
 * Picture-time = sum of played plate durations.
 * Pause the film (no new plate durations) → this number does not move.
 * Never Date.now / setTimeout — those are wall clock, not the strip.
 */
export function pictureTimeMs(playedPlates: ReadonlyArray<PlayedPlate | null | undefined> = []): number {
  let t = 0;
  for (const plate of playedPlates) t += plateMs(plate);
  return t;
}

/** phase score = (picture-time / bone) × momentum m. Wall clock is ignored. */
export function picturePhase01(tMs: number, momentum = 0): number {
  const t = Math.max(0, Number(tMs) || 0);
  const m = Math.max(0, Math.min(1, Number(momentum) || 0));
  return Math.max(0, Math.min(1, (t / PICTURE_BONE_MS) * m));
}

/**
 * Named phase from picture-time × m.
 * Peak only if the 45–90s window AND m ≥ τ. Quiet 0–8s is never peak.
 */
export function picturePhase(tMs: number, momentum = 0): PicturePhase {
  const t = Math.max(0, Number(tMs) || 0);
  const m = Number(momentum) || 0;
  if (t >= PICTURE_PEAK_END_MS) return "recede";
  if (mayPeak(t, m)) return "peak";
  if (t >= PICTURE_CALM_MS) return "lean";
  return "calm";
}

/** Peak only if phase window AND m high. No Date.now. */
export function mayPeak(tMs: number, momentum = 0): boolean {
  const t = Math.max(0, Number(tMs) || 0);
  const m = Number(momentum) || 0;
  return t >= PICTURE_PEAK_MS && t < PICTURE_PEAK_END_MS && m >= PEAK_MOMENTUM_TAU;
}

/** Relic slot follows peak: window + high m. No wall-clock spawner. */
export function mayRelic(tMs: number, momentum = 0): boolean {
  return mayPeak(tMs, momentum);
}
