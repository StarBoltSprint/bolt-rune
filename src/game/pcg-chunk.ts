/**
 * PCG chunk library + bridge stitch law.
 * A chunk is a finished film you trust. PCG does not invent that film —
 * it PLACES it on a door and, if needed, pays for a short BRIDGE so two
 * trusted films can touch. Roguelike: author rooms offline, stitch at runtime.
 * Room = plate (still + loop + laws), not a mesh.
 * Asteroid HOLD. No Pack seats expansion. Reuses pcg-rail cache/ticket,
 * pcg-grammar pins, pcg-prompt rails.
 */

import type { HungArtifact } from "./artifacts.ts";
import { inferBiome, type DoorLetter } from "./enter-graph.ts";
import { pinsForCitadel, rewriteOnEnter } from "./pcg-grammar.ts";
import {
  assemblePrompt,
  asGrammarBiome,
  BIOME_CATALOG,
  isGrammarBiome,
  lintPrompt,
  RAILS,
  slotsFromEngine,
  type GrammarBiomeId,
  type LintResult,
} from "./pcg-prompt.ts";
import {
  clipCachePut,
  lookupEnterClip,
  mayImagine,
  mayPaidEnterCook,
  pcgHash,
  replaceStockEnter,
  reuseClipBeforeRecook,
  stockBridge,
  type EnterClipHit,
  type HallCommit,
  type PaidEnterTicket,
} from "./pcg-rail.ts";
import { compileCitadel, type RuneGraph, type RuneNode, type WalkSecs } from "./rune.ts";

export type ChunkWalkSecs = 6 | 10 | 15;
export type DoorHand = "A" | "B" | "either";
export type ChunkPose = "lock-off" | "door-a" | "door-b" | "enter";
export type ChunkEnergy = "quiet" | "lean" | "peak";
export type BridgeAct = "enter" | "walk-across";
export type ChunkIllegal =
  | "biome-hop-without-enter"
  | "stitch-without-bridge"
  | "same-hall-biome-mismatch"
  | "missing-rails";

export const BRIDGE_SECS = { min: 6, max: 8 } as const;
export const CHUNK_LAWS = [RAILS] as const;

export type ChunkActs = {
  breath: string;
  walkA?: string;
  walkB?: string;
};

export type ChunkPins = { A: string; B: string };

export type ChunkTags = {
  biome: GrammarBiomeId;
  handed: DoorHand;
  pose: ChunkPose;
  energy: ChunkEnergy;
  /** Bolt lock-off still — identity, never sampled. */
  identity: string;
};

export type Chunk = {
  id: string;
  biome: GrammarBiomeId;
  still: string;
  loop?: string;
  acts: ChunkActs;
  walkSecs: ChunkWalkSecs;
  pins: ChunkPins;
  laws: string[];
  tags: ChunkTags;
  hung?: boolean;
};

export type HungLike = Pick<HungArtifact, "id" | "name" | "still" | "playlist" | "prompt" | "room">;

export type ChunkFilter = {
  biome?: GrammarBiomeId;
  neighborOf?: GrammarBiomeId;
  handed?: DoorHand;
  energy?: ChunkEnergy;
  phase?: ChunkEnergy;
};

export type WalkEdge = {
  from: string;
  to: string;
  fromChunk: Chunk;
  toChunk: Chunk;
  kind: "stock-walk" | "bridge" | "breath";
  needsBridge: boolean;
  clip: string;
};

export type StitchResult = {
  act: "enter" | "idle" | "breath";
  play: "bridge" | "breath";
  commit: HallCommit;
  rewrite: "rewrite" | "hold";
  imagine: false;
  tickets: 0 | 1;
  biome: GrammarBiomeId;
  reason?: ChunkIllegal | "dead-end";
};

export type Credit = { tickets: 0 | 1; imagine: false };

export type AssembleOpts = {
  s: string;
  room: number;
  biome?: GrammarBiomeId;
  neighborOf?: GrammarBiomeId;
  phase?: ChunkEnergy;
  hungA?: HungLike | Chunk | null;
  hungB?: HungLike | Chunk | null;
  walkSecs?: WalkSecs;
  momentum?: number;
  existingPins?: RuneNode[];
};

export type HallAssembly = {
  pins: RuneNode[];
  doors: { A: Chunk; B: Chunk };
  walkSecs: ChunkWalkSecs;
  graph: RuneGraph;
  edges: WalkEdge[];
  illegal: ChunkIllegal[];
};

/** Same biome is stay. Hop only to a listed neighbor, and only on enter. */
export const BIOME_NEIGHBORS: Record<GrammarBiomeId, readonly GrammarBiomeId[]> = {
  asteroid: ["void", "open", "peak"],
  void: ["asteroid", "open"],
  open: ["asteroid", "void", "forest", "city"],
  forest: ["dusk", "moss", "canyon", "open"],
  dusk: ["forest", "moss"],
  moss: ["forest", "dusk"],
  canyon: ["forest", "ruin", "peak"],
  city: ["open", "ocean", "ruin"],
  ocean: ["city", "dune"],
  dune: ["ocean", "ember", "egypt"],
  ruin: ["canyon", "city", "ember", "peak"],
  ember: ["ember-stone", "dune", "ruin"],
  "ember-stone": ["ember"],
  peak: ["asteroid", "canyon", "ruin"],
  rome: ["greece", "ember"],
  greece: ["rome", "egypt"],
  persia: ["egypt", "babylon", "dune"],
  egypt: ["persia", "greece", "babylon", "dune"],
  babylon: ["persia", "egypt"],
};

const STARTER_ENERGY: Partial<Record<GrammarBiomeId, ChunkEnergy>> = {
  asteroid: "quiet",
  void: "quiet",
  open: "quiet",
  forest: "quiet",
  dusk: "quiet",
  moss: "quiet",
  canyon: "lean",
  city: "lean",
  ocean: "lean",
  dune: "lean",
  ruin: "lean",
  ember: "lean",
  "ember-stone": "lean",
  peak: "peak",
  rome: "lean",
  greece: "lean",
  persia: "lean",
  egypt: "lean",
  babylon: "lean",
};

const shelf = new Map<string, Chunk>();

function isChunk(v: unknown): v is Chunk {
  return Boolean(v && typeof v === "object" && "acts" in v && "laws" in v && "tags" in v && "walkSecs" in v && "still" in v);
}

function firstClip(urls?: string[]): string {
  for (const raw of urls || []) {
    const u = String(raw || "").trim();
    if (!u) continue;
    if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u) && !u.includes(".mp4")) continue;
    if (/\.mp4(\?|$)/i.test(u) || u.includes("/films/") || u.includes("/ui/") || u.includes("/api/clip")) return u;
  }
  return "";
}

export function walkSecsForPhase(phase?: ChunkEnergy | string | null): ChunkWalkSecs {
  const p = String(phase || "").toLowerCase();
  if (p === "quiet") return 6;
  if (p === "peak") return 15;
  return 10;
}

export function isNeighborBiome(from?: string | null, to?: string | null): boolean {
  const a = asGrammarBiome(from);
  const b = asGrammarBiome(to);
  if (a === b) return true;
  return BIOME_NEIGHBORS[a].includes(b);
}

export function mayHopBiome(from?: string | null, to?: string | null, entered = false): boolean {
  const a = asGrammarBiome(from);
  const b = asGrammarBiome(to);
  if (a === b) return true;
  return Boolean(entered) && isNeighborBiome(a, b);
}

export function posesMatch(a: Chunk, b: Chunk): boolean {
  return a.tags.pose === b.tags.pose && a.tags.identity === b.tags.identity;
}

/** Pose mismatch or two different trusted films — PCG may not invent the join. */
export function needsBridge(from: Chunk, to: Chunk): boolean {
  if (from.id === to.id) return false;
  return true;
}

export function chunkPickKey(s: string, room: number, door: DoorLetter): string {
  return pcgHash([s, Math.round(Number(room) || 0), door]);
}

function catalogChunk(id: GrammarBiomeId): Chunk {
  const entry = BIOME_CATALOG[id];
  const energy = STARTER_ENERGY[id] || "quiet";
  const loop = `/films/forge-${id}.mp4`;
  return {
    id: `chunk-${id}`,
    biome: id,
    still: entry.still,
    loop,
    acts: { breath: entry.still, walkA: loop, walkB: loop },
    walkSecs: walkSecsForPhase(energy),
    pins: { A: "m1", B: "m2" },
    laws: [...CHUNK_LAWS],
    tags: {
      biome: id,
      handed: "either",
      pose: "lock-off",
      energy,
      identity: entry.still,
    },
  };
}

/** Catalog biomes = starter set. Vault / hung sit on top. */
export function catalogChunks(): Chunk[] {
  return (Object.keys(BIOME_CATALOG) as GrammarBiomeId[]).map(catalogChunk);
}

export function vaultPut(chunk: Chunk): Chunk {
  const next = { ...chunk, tags: { ...chunk.tags }, acts: { ...chunk.acts }, pins: { ...chunk.pins }, laws: [...chunk.laws] };
  shelf.set(next.id, next);
  return next;
}

export function vaultGet(id: string): Chunk | undefined {
  return shelf.get(id);
}

export function vaultList(): Chunk[] {
  return [...shelf.values()];
}

export function vaultClear() {
  shelf.clear();
}

export function libraryAll(): Chunk[] {
  const byId = new Map<string, Chunk>();
  for (const c of catalogChunks()) byId.set(c.id, c);
  for (const c of vaultList()) byId.set(c.id, c);
  return [...byId.values()];
}

export function filterChunks(list: Chunk[], filter: ChunkFilter = {}): Chunk[] {
  return list.filter((c) => {
    if (filter.biome && c.biome !== filter.biome) return false;
    if (filter.neighborOf && !isNeighborBiome(filter.neighborOf, c.biome)) return false;
    if (filter.handed && filter.handed !== "either" && c.tags.handed !== "either" && c.tags.handed !== filter.handed) {
      return false;
    }
    if (filter.energy && c.tags.energy !== filter.energy) return false;
    if (filter.phase && filter.phase !== "peak" && c.tags.energy === "peak") return false;
    return true;
  });
}

/**
 * Seeded pick: library.pick(hash(s, room, door), filter).
 * Same key + filter → same chunk. Empty filter pool → null (never invent).
 */
export function pickChunk(key: string, filter: ChunkFilter = {}): Chunk | null {
  const pool = filterChunks(libraryAll(), filter);
  if (!pool.length) return null;
  const n = parseInt(pcgHash([key, "chunk-pick"]).slice(0, 8), 16);
  return pool[n % pool.length] || null;
}

export const library = {
  pick(key: string, filter: ChunkFilter = {}): Chunk | null {
    return pickChunk(key, filter);
  },
  put: vaultPut,
  get: vaultGet,
  all: libraryAll,
  filter: (filter: ChunkFilter) => filterChunks(libraryAll(), filter),
};

export function chunkFromHung(a: HungLike, door?: DoorLetter): Chunk {
  const letter = door || (a.room?.door === "B" ? "B" : a.room?.door === "A" ? "A" : "A");
  const biome = asGrammarBiome(a.room && "biome" in a.room ? a.room.biome : inferBiome(a));
  const still = String(a.still || a.room?.still || BIOME_CATALOG[biome].still);
  const loop = firstClip(a.playlist) || undefined;
  const prompt = String(a.prompt || "");
  const laws = /LOCKED-OFF CAMERA/i.test(prompt) ? [prompt] : [...CHUNK_LAWS];
  return {
    id: String(a.id || `hung-${biome}`),
    biome,
    still,
    loop,
    acts: {
      breath: loop || still,
      walkA: loop,
      walkB: loop,
    },
    walkSecs: 10,
    pins: { A: "m1", B: "m2" },
    laws,
    tags: {
      biome,
      handed: letter,
      pose: letter === "B" ? "door-b" : "door-a",
      energy: "quiet",
      identity: still,
    },
    hung: true,
  };
}

function asPlaced(raw?: HungLike | Chunk | null, door?: DoorLetter): Chunk | null {
  if (!raw) return null;
  if (isChunk(raw)) return raw.hung ? raw : { ...raw, hung: raw.hung };
  return chunkFromHung(raw, door);
}

/** Human hung artifact wins over library.pick. */
export function placeOnDoor(door: DoorLetter, hung?: HungLike | Chunk | null, pick?: Chunk | null): Chunk | null {
  const placed = asPlaced(hung, door);
  if (placed) return { ...placed, hung: true };
  return pick || null;
}

/** Vault = bookshelf. Hang A/B = put that book on the door. */
export function hangChunkOnDoor(door: DoorLetter, art: HungLike | Chunk): Chunk {
  const chunk = isChunk(art) ? { ...art, hung: true, tags: { ...art.tags, handed: door } } : chunkFromHung(art, door);
  return vaultPut({ ...chunk, hung: true });
}

export function lintChunk(chunk: Chunk): LintResult {
  if (!chunk?.id || !chunk.still) return { ok: false, issue: "slot-enum", detail: "still" };
  if (chunk.walkSecs !== 6 && chunk.walkSecs !== 10 && chunk.walkSecs !== 15) {
    return { ok: false, issue: "slot-enum", detail: "walkSecs" };
  }
  if (!isGrammarBiome(chunk.biome)) return { ok: false, issue: "slot-enum", detail: "biome" };
  const laws = (chunk.laws || []).join(" ");
  if (!/LOCKED-OFF CAMERA/i.test(laws) && !laws.includes("Crystal never chrome")) {
    return { ok: false, issue: "missing-rails" };
  }
  const lawLint = lintPrompt(/LOCKED-OFF CAMERA/i.test(laws) ? laws : `${RAILS} ${laws}`.trim());
  if (!lawLint.ok) return lawLint;
  const slots = slotsFromEngine({
    biome: chunk.biome,
    act: "breath",
    still: chunk.still,
    seed: chunk.id,
  });
  return lintPrompt(assemblePrompt(slots).prompt, slots);
}

/** Cache key = H(s, fromId, toId, act). Aligned with rail 2 enter lookup. */
export function bridgeCacheKey(s: string, fromId: string, toId: string, act: BridgeAct): string {
  return pcgHash([s, fromId, toId, act]);
}

export function lookupBridge(s: string, from: Chunk | string, to: Chunk | string, act: BridgeAct = "enter"): EnterClipHit {
  const fromId = typeof from === "string" ? from : from.id;
  const toId = typeof to === "string" ? to : to.id;
  const key = bridgeCacheKey(s, fromId, toId, act);
  const cached = key ? reuseClipBeforeRecook(key) : "";
  if (cached) return { key, url: cached, source: "cache" };
  const stock = stockBridge(fromId, toId, act) || stockBridge(fromId, toId);
  if (stock) return { key, url: stock, source: "stock" };
  const enter = lookupEnterClip({ s, i: 0, from: fromId, to: toId, door: act });
  if (enter.url) return enter;
  return { key, url: "", source: "" };
}

/** First stitch — 1 ticket on confirm / Forge / ticket. Replay is cache. */
export function cookBridgeOnConfirm(opts: {
  s: string;
  from: Chunk | string;
  to: Chunk | string;
  act?: BridgeAct;
  ticket: PaidEnterTicket;
  url: string;
}): string {
  if (!mayPaidEnterCook(opts.ticket) || !mayImagine("enter-confirm")) return "";
  const fromId = typeof opts.from === "string" ? opts.from : opts.from.id;
  const toId = typeof opts.to === "string" ? opts.to : opts.to.id;
  const act = opts.act || "enter";
  const key = bridgeCacheKey(opts.s, fromId, toId, act);
  return replaceStockEnter(key, opts.url, opts.ticket);
}

export function creditWalkHung(): Credit {
  return { tickets: 0, imagine: false };
}

export function creditRemixHang(): Credit {
  return { tickets: 0, imagine: false };
}

export function creditReplay(): Credit {
  return { tickets: 0, imagine: false };
}

export function creditFirstStitch(s: string, from: Chunk, to: Chunk, act: BridgeAct, ticket?: PaidEnterTicket): Credit {
  if (from.hung && from.id === to.id) return creditWalkHung();
  if (lookupBridge(s, from, to, act).url) return creditReplay();
  if (ticket && mayPaidEnterCook(ticket)) return { tickets: 1, imagine: false };
  return { tickets: 0, imagine: false };
}

/** Prefetch = decode next stock walk, not surprise Imagine. */
export function prefetchStockWalk(chunk: Chunk, door: DoorLetter = "A"): { url: string; imagine: false } {
  const url = door === "B" ? chunk.acts.walkB || chunk.loop || "" : chunk.acts.walkA || chunk.loop || "";
  return { url, imagine: false };
}

function stockWalkOf(chunk: Chunk, toPin: string): string {
  if (toPin === "m2") return chunk.acts.walkB || chunk.loop || "";
  if (toPin === "m1") return chunk.acts.walkA || chunk.loop || "";
  return chunk.acts.breath || chunk.still;
}

export function walkEdgeFor(s: string, from: Chunk, to: Chunk, fromPin: string, toPin: string): WalkEdge {
  if (!needsBridge(from, to)) {
    return {
      from: fromPin,
      to: toPin,
      fromChunk: from,
      toChunk: to,
      kind: "stock-walk",
      needsBridge: false,
      clip: stockWalkOf(from, toPin),
    };
  }
  const hit = lookupBridge(s, from, to, "walk-across");
  if (hit.url) {
    return { from: fromPin, to: toPin, fromChunk: from, toChunk: to, kind: "bridge", needsBridge: true, clip: hit.url };
  }
  return {
    from: fromPin,
    to: toPin,
    fromChunk: from,
    toChunk: to,
    kind: "breath",
    needsBridge: true,
    clip: from.acts.breath || from.still,
  };
}

/**
 * Room —enter→ Hall′.
 * Illegal until a bridge clip exists (cache / ticket) or a named stock pair.
 * No bridge → play breath on the door. Never Imagine on the hot path.
 */
export function stitchEnter(opts: {
  s: string;
  from: Chunk;
  to: Chunk;
  act?: BridgeAct;
  entered?: boolean;
  clip?: string | null;
  deadEnd?: boolean;
}): StitchResult {
  const from = opts.from;
  const to = opts.to;
  const hop = from.biome !== to.biome;
  if (opts.deadEnd) {
    return { act: "idle", play: "breath", commit: "hold", rewrite: "hold", imagine: false, tickets: 0, biome: from.biome, reason: "dead-end" };
  }
  if (hop && !opts.entered) {
    return {
      act: "idle",
      play: "breath",
      commit: "hold",
      rewrite: "hold",
      imagine: false,
      tickets: 0,
      biome: from.biome,
      reason: "biome-hop-without-enter",
    };
  }
  if (hop && !isNeighborBiome(from.biome, to.biome) && !to.hung) {
    return {
      act: "idle",
      play: "breath",
      commit: "hold",
      rewrite: "hold",
      imagine: false,
      tickets: 0,
      biome: from.biome,
      reason: "biome-hop-without-enter",
    };
  }
  const act = opts.act || "enter";
  const hit = lookupBridge(opts.s, from, to, act);
  const clip = String(opts.clip || hit.url || "");
  const need = needsBridge(from, to) || hop || act === "enter";
  if (need && !clip) {
    return {
      act: "breath",
      play: "breath",
      commit: "hold",
      rewrite: "hold",
      imagine: false,
      tickets: 0,
      biome: from.biome,
      reason: "stitch-without-bridge",
    };
  }
  const rewrite = rewriteOnEnter({
    clip,
    entered: opts.entered,
    deadEnd: opts.deadEnd,
    fromBiome: from.biome,
    toBiome: to.biome,
  });
  return {
    act: rewrite.act,
    play: rewrite.commit === "pass" ? "bridge" : "breath",
    commit: rewrite.commit,
    rewrite: rewrite.rewrite,
    imagine: false,
    tickets: 0,
    biome: asGrammarBiome(rewrite.biome, from.biome),
  };
}

export function illegalChunkReasons(assembly: Pick<HallAssembly, "doors">, opts?: { entered?: boolean; fromBiome?: string }): ChunkIllegal[] {
  const reasons: ChunkIllegal[] = [];
  if (assembly.doors.A.biome !== assembly.doors.B.biome && !assembly.doors.A.hung && !assembly.doors.B.hung) {
    reasons.push("same-hall-biome-mismatch");
  }
  const from = opts?.fromBiome;
  if (from && assembly.doors.A.biome !== from && !opts?.entered) reasons.push("biome-hop-without-enter");
  if (!assembly.doors.A.laws.join(" ").includes("LOCKED-OFF") && lintChunk(assembly.doors.A).ok === false) {
    reasons.push("missing-rails");
  }
  return reasons;
}

/**
 * Pins from grammar; each door is hung-or-pick; compileCitadel realizes walks.
 * Walk edges: stock walk if same chunk, else a bridge (or breath until cooked).
 */
export function assembleHall(opts: AssembleOpts): HallAssembly {
  const room = Math.max(1, Math.round(Number(opts.room) || 1));
  const phase = opts.phase || "quiet";
  const walkSecs = (opts.walkSecs === 6 || opts.walkSecs === 10 || opts.walkSecs === 15
    ? opts.walkSecs
    : walkSecsForPhase(phase)) as ChunkWalkSecs;
  const hungA = asPlaced(opts.hungA, "A");
  const hungB = asPlaced(opts.hungB, "B");
  const biome = hungA?.biome || hungB?.biome || (opts.biome ? asGrammarBiome(opts.biome) : undefined);
  const filterA: ChunkFilter = {
    biome,
    neighborOf: opts.neighborOf,
    handed: "A",
    phase,
  };
  const pickA = hungA || pickChunk(chunkPickKey(opts.s, room, "A"), filterA);
  const filterB: ChunkFilter = {
    biome: pickA?.biome || biome,
    neighborOf: opts.neighborOf,
    handed: "B",
    phase,
  };
  const pickB = hungB || pickChunk(chunkPickKey(opts.s, room, "B"), filterB) || pickA;
  const fallback = catalogChunk(asGrammarBiome(biome || opts.neighborOf || "asteroid"));
  const doorA = placeOnDoor("A", hungA, pickA) || fallback;
  const doorB = placeOnDoor("B", hungB, pickB) || doorA;
  const pins = pinsForCitadel({
    s: opts.s,
    i: room,
    momentum: Number(opts.momentum) || 0,
    existing: opts.existingPins,
    hung: Boolean(hungA || hungB || (opts.existingPins?.length || 0) >= 2),
  });
  const graph = compileCitadel(doorA.still, pins, walkSecs);
  const edges = [
    walkEdgeFor(opts.s, doorA, doorA, "spawn", "m1"),
    walkEdgeFor(opts.s, doorB, doorB, "spawn", "m2"),
    walkEdgeFor(opts.s, doorA, doorB, "m1", "m2"),
    walkEdgeFor(opts.s, doorB, doorA, "m2", "m1"),
  ];
  const doors = { A: doorA, B: doorB };
  return {
    pins,
    doors,
    walkSecs,
    graph,
    edges,
    illegal: illegalChunkReasons({ doors }, { fromBiome: opts.neighborOf, entered: false }),
  };
}

/** Test helper — put a cooked bridge without going through Imagine. */
export function putBridgeCache(s: string, fromId: string, toId: string, act: BridgeAct, url: string): string {
  return clipCachePut(bridgeCacheKey(s, fromId, toId, act), url, "enter");
}
