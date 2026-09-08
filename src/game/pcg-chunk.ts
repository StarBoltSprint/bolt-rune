/**
 * PCG chunk library + bridge stitch.
 * A chunk is a trusted prefab film. PCG places it on door A/B; does not invent pixels inside.
 * Imagine only for a short bridge when two chunks must touch and poses mismatch.
 * Asteroid HOLD. No Pack seats. Reuses pcg-rail, pcg-grammar, pcg-prompt.
 */

import type { HungArtifact, HungRoom } from "./artifacts.ts";
import { inferBiome } from "./enter-graph.ts";
import { hallDoorPins, type GrammarPin } from "./pcg-grammar.ts";
import {
  assembleCookPlate,
  asGrammarBiome,
  biomeEntry,
  BIOME_IDS,
  isGrammarBiome,
  lintPrompt,
  RAILS,
  slotsFromEngine,
  assemblePrompt,
  type GrammarBiomeId,
  type LintResult,
} from "./pcg-prompt.ts";
import {
  bridgeSeed,
  commitHallPrime,
  lookupEnterClip,
  mayImagine,
  mayPaidEnterCook,
  pcgHash,
  registerStockBridge,
  replaceStockEnter,
  reuseClipBeforeRecook,
  type EnterClipHit,
  type EnterSource,
  type HallCommit,
  type PaidEnterTicket,
} from "./pcg-rail.ts";
import { lintEnterClip } from "./smoke-gate.ts";
import type { WalkSecs } from "./rune.ts";

export { bridgeSeed };

export const BRIDGE_SECS = { min: 6, max: 8 } as const;

export type ChunkAct = "breath" | "walkA" | "walkB";
export type DoorHanded = "A" | "B" | "either";
export type DoorLetter = "A" | "B";
export type ChunkPose = "still" | "walk-a" | "walk-b" | "enter" | "breath";
export type ChunkEnergy = "calm" | "mid" | "peak";
export type ChunkIdentity = "bolt";
export type BridgeAct = "enter" | "walk-across";
export type ChunkSource = "catalog" | "hang";
export type CreditKind = "stock-walk" | "remix-hang" | "first-stitch" | "replay-cache";
export type ChunkIllegal = "hall-biome-mismatch" | "biome-hop-in-hall" | "missing-chunk";
export type ChunkLintIssue =
  | LintResult extends { issue: infer I }
    ? I
    : never
  | "walkSecs"
  | "acts"
  | "pins"
  | "biome"
  | "laws"
  | "identity"
  | "handed";

export type ChunkTags = {
  biome: GrammarBiomeId;
  handed: DoorHanded;
  pose: ChunkPose;
  energy: ChunkEnergy;
  identity: ChunkIdentity;
};

export type Chunk = {
  id: string;
  biome: GrammarBiomeId;
  still: string;
  loop?: string;
  acts: readonly ChunkAct[];
  walkSecs: WalkSecs;
  pins: { a: GrammarPin; b: GrammarPin };
  laws: typeof RAILS;
  tags: ChunkTags;
  hung?: boolean;
  source: ChunkSource;
};

export type ChunkFilter = {
  biome?: GrammarBiomeId;
  handed?: DoorHanded;
  pose?: ChunkPose;
  energy?: ChunkEnergy;
  identity?: ChunkIdentity;
};

/** Minimal hang shape — compatible with HungArtifact. */
export type HungForge = {
  id: string;
  still?: string;
  playlist?: string[];
  name?: string;
  prompt?: string;
  hungAt?: number;
  room?: {
    door?: DoorLetter | string;
    hall?: number;
    biome?: string;
    still?: string;
  } | null;
};

export type HallChunks = {
  a: Chunk;
  b: Chunk;
  biome: GrammarBiomeId;
  walkSecs: WalkSecs;
  enterDest: { A?: Chunk; B?: Chunk };
  illegal: ChunkIllegal[];
};

export type ChunkEnterPath = {
  act: "enter" | "walk-across" | "breath";
  url: string;
  source: EnterSource;
  imagine: false;
  commit: HallCommit;
  needed: boolean;
  credit: CreditKind | "";
  tickets: 0 | 1;
  key: string;
  fromId: string;
  toId: string;
};

const CHUNK_ACTS: readonly ChunkAct[] = ["breath", "walkA", "walkB"];
const LOOP_ALIAS: Partial<Record<GrammarBiomeId, string>> = {
  dusk: "forest",
  moss: "forest",
  void: "asteroid",
  "ember-stone": "ember",
};

const extras = new Map<string, Chunk>();
const shelfPins = hallDoorPins("sshelf", 0);

function catalogLoop(id: GrammarBiomeId): string {
  const key = LOOP_ALIAS[id] || id;
  return `/films/forge-${key}.mp4`;
}

function asDoor(v?: string | null): DoorLetter {
  const d = String(v || "").trim().toUpperCase();
  return d === "B" || d === "M2" ? "B" : "A";
}

export function walkSecsForPhase(phase = 0): WalkSecs {
  const p = Number(phase) || 0;
  if (p >= 0.7) return 15;
  if (p >= 0.35) return 10;
  return 6;
}

export function energyOf(secs: WalkSecs): ChunkEnergy {
  return secs === 6 ? "calm" : secs === 15 ? "peak" : "mid";
}

export function creditTickets(kind: CreditKind): 0 | 1 {
  return kind === "first-stitch" ? 1 : 0;
}

export function pickKey(s: string, room: number, door: DoorLetter): string {
  return pcgHash([s, Math.round(Number(room) || 0), door]);
}

function makeShelfChunk(biome: GrammarBiomeId): Chunk {
  const entry = biomeEntry(biome);
  const a = shelfPins[0]!;
  const b = shelfPins[1]!;
  return {
    id: `chunk-${biome}`,
    biome,
    still: entry.still,
    loop: catalogLoop(biome),
    acts: CHUNK_ACTS,
    walkSecs: 10,
    pins: { a, b },
    laws: RAILS,
    tags: {
      biome,
      handed: "either",
      pose: "still",
      energy: "mid",
      identity: "bolt",
    },
    source: "catalog",
  };
}

const SHELF: Chunk[] = BIOME_IDS.map(makeShelfChunk);

export function starterShelf(): Chunk[] {
  return SHELF.map((c) => ({ ...c, tags: { ...c.tags }, pins: { a: { ...c.pins.a }, b: { ...c.pins.b } }, acts: [...c.acts] }));
}

function handedOk(chunk: Chunk, want?: DoorHanded): boolean {
  if (!want || want === "either") return true;
  return chunk.tags.handed === "either" || chunk.tags.handed === want;
}

export function matchesFilter(chunk: Chunk, filter?: ChunkFilter): boolean {
  if (!filter) return true;
  if (filter.biome && chunk.biome !== filter.biome) return false;
  if (!handedOk(chunk, filter.handed)) return false;
  if (filter.pose && chunk.tags.pose !== filter.pose) return false;
  if (filter.energy && chunk.tags.energy !== filter.energy) return false;
  if (filter.identity && chunk.tags.identity !== filter.identity) return false;
  return true;
}

export function listChunks(filter?: ChunkFilter): Chunk[] {
  const all = [...extras.values(), ...SHELF];
  const seen = new Set<string>();
  const out: Chunk[] = [];
  for (const c of all) {
    if (!c?.id || seen.has(c.id) || !matchesFilter(c, filter)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

/** Seeded pick: `library.pick(hash(s, room, door), filter)`. PCG does not invent pixels inside. */
export function pick(key: string, filter?: ChunkFilter): Chunk | null {
  const pool = listChunks(filter);
  if (!pool.length) return null;
  const hex = String(key || "").replace(/[^0-9a-f]/gi, "").slice(0, 8) || "0";
  const i = parseInt(hex, 16) % pool.length;
  const hit = pool[i]!;
  return { ...hit, tags: { ...hit.tags }, pins: { a: { ...hit.pins.a }, b: { ...hit.pins.b } }, acts: [...hit.acts] };
}

export function registerChunk(chunk: Chunk): Chunk | "" {
  const lint = lintChunk(chunk);
  if (!lint.ok) return "";
  const copy: Chunk = {
    ...chunk,
    tags: { ...chunk.tags, identity: "bolt" },
    laws: RAILS,
    source: chunk.source || "catalog",
    acts: chunk.acts?.length ? [...chunk.acts] : [...CHUNK_ACTS],
  };
  extras.set(copy.id, copy);
  return copy;
}

export function clearExtraChunks() {
  extras.clear();
}

export const library = {
  pick,
  register: registerChunk,
  list: listChunks,
  shelf: starterShelf,
  clear: clearExtraChunks,
};

function asHungArt(h: HungForge): Pick<HungArtifact, "name" | "still" | "playlist" | "prompt" | "room"> {
  return {
    name: h.name || "",
    still: h.still || h.room?.still || "",
    playlist: h.playlist || [],
    prompt: h.prompt || "",
    room: (h.room as HungRoom | null) || null,
  };
}

/** Latest hang on this door for this hall. Hall-less leftover is Room 1 only. */
export function hungOnDoor(arts: HungForge[] = [], door: DoorLetter, hall = 1): HungForge | undefined {
  const n = Math.max(1, Math.min(8, Math.round(Number(hall) || 1)));
  return [...arts]
    .filter((a) => {
      if (asDoor(a.room?.door) !== door) return false;
      const bound = Number(a.room?.hall);
      if (Number.isFinite(bound) && bound >= 1 && bound <= 8) return bound === n;
      return n === 1;
    })
    .sort((p, q) => (q.hungAt || 0) - (p.hungAt || 0))[0];
}

/** Hung forge artifact → trusted chunk. Remix hang, never a seeded pick. */
export function chunkFromHung(art: HungForge, door: DoorLetter, walkSecs: WalkSecs = 10): Chunk {
  const biome = asGrammarBiome(art.room?.biome || inferBiome(asHungArt(art)));
  const still = art.still || art.room?.still || biomeEntry(biome).still;
  const loop = (art.playlist || []).find((u) => /\.mp4(\?|$)/i.test(u));
  return {
    id: `hung-${art.id}`,
    biome,
    still,
    loop,
    acts: CHUNK_ACTS,
    walkSecs,
    pins: { a: hallDoorPins("shung", 0)[0]!, b: hallDoorPins("shung", 0)[1]! },
    laws: RAILS,
    tags: {
      biome,
      handed: door,
      pose: "still",
      energy: energyOf(walkSecs),
      identity: "bolt",
    },
    hung: true,
    source: "hang",
  };
}

function stampPlace(chunk: Chunk, door: DoorLetter, s: string, room: number, walkSecs: WalkSecs): Chunk {
  const pins = hallDoorPins(s, room);
  return {
    ...chunk,
    walkSecs,
    pins: { a: pins[0]!, b: pins[1]! },
    laws: RAILS,
    tags: {
      ...chunk.tags,
      biome: chunk.biome,
      handed: door,
      energy: energyOf(walkSecs),
      identity: "bolt",
    },
  };
}

function pickSameBiome(s: string, room: number, door: DoorLetter, biome: GrammarBiomeId, filter?: ChunkFilter): Chunk {
  const hit =
    pick(pickKey(s, room, door), { ...filter, biome, handed: door }) ||
    pick(pickKey(s, room, door), { ...filter, biome }) ||
    pick(pickKey(s, room, door), { biome });
  if (hit) return hit;
  return makeShelfChunk(biome);
}

/**
 * Hall A+B same biome. Hung forge wins that door when its biome matches the hall.
 * Other-biome hang is an enter dest (biome hop only on enter), not a hall film.
 * walkSecs from phase. Seeded pick is hash(s, room, door).
 */
export function placeHallChunks(opts: {
  s: string;
  room: number;
  phase?: number;
  hungA?: HungForge | null;
  hungB?: HungForge | null;
  hungArts?: HungForge[];
  filter?: ChunkFilter;
}): HallChunks {
  const room = Math.max(1, Math.min(8, Math.round(Number(opts.room) || 1)));
  const walkSecs = walkSecsForPhase(opts.phase);
  const hungA = opts.hungA ?? hungOnDoor(opts.hungArts, "A", room);
  const hungB = opts.hungB ?? hungOnDoor(opts.hungArts, "B", room);
  const seedA = pick(pickKey(opts.s, room, "A"), { ...opts.filter, handed: "A" }) || pick(pickKey(opts.s, room, "A"), opts.filter);
  const hallBiome = asGrammarBiome(
    (hungA ? chunkFromHung(hungA, "A").biome : "") ||
      (hungB ? chunkFromHung(hungB, "B").biome : "") ||
      seedA?.biome,
  );
  const aHung = hungA ? chunkFromHung(hungA, "A", walkSecs) : null;
  const bHung = hungB ? chunkFromHung(hungB, "B", walkSecs) : null;
  const enterDest: HallChunks["enterDest"] = {};
  if (aHung && aHung.biome !== hallBiome) enterDest.A = aHung;
  if (bHung && bHung.biome !== hallBiome) enterDest.B = bHung;
  const a = stampPlace(
    aHung && aHung.biome === hallBiome ? aHung : pickSameBiome(opts.s, room, "A", hallBiome, opts.filter),
    "A",
    opts.s,
    room,
    walkSecs,
  );
  const b = stampPlace(
    bHung && bHung.biome === hallBiome ? bHung : pickSameBiome(opts.s, room, "B", hallBiome, opts.filter),
    "B",
    opts.s,
    room,
    walkSecs,
  );
  const illegal: ChunkIllegal[] = [];
  if (a.biome !== b.biome) illegal.push("hall-biome-mismatch", "biome-hop-in-hall");
  if (!a.id || !b.id) illegal.push("missing-chunk");
  return { a, b, biome: hallBiome, walkSecs, enterDest, illegal };
}

export function posesMatch(from: Chunk, to: Chunk): boolean {
  return (
    from.tags.pose === to.tags.pose &&
    from.tags.energy === to.tags.energy &&
    from.tags.identity === to.tags.identity
  );
}

/** Imagine only when two chunks must touch and poses (or enter biome) mismatch. */
export function bridgeNeeded(from: Chunk, to: Chunk, act: BridgeAct): boolean {
  if (!from?.id || !to?.id) return false;
  if (from.id === to.id && posesMatch(from, to) && from.biome === to.biome) return false;
  if (act === "enter") {
    return from.biome !== to.biome || !posesMatch(from, to) || from.still !== to.still;
  }
  return !posesMatch(from, to);
}

export type ChunkLint = { ok: true } | { ok: false; issue: string; detail?: string };

/** Structural + prompt-rails linter. Catalog shelf must pass. */
export function lintChunk(chunk: Chunk): ChunkLint {
  if (!isGrammarBiome(chunk.biome)) return { ok: false, issue: "biome" };
  if (chunk.walkSecs !== 6 && chunk.walkSecs !== 10 && chunk.walkSecs !== 15) {
    return { ok: false, issue: "walkSecs" };
  }
  const acts = new Set(chunk.acts || []);
  if (!acts.has("breath") || (!acts.has("walkA") && !acts.has("walkB"))) {
    return { ok: false, issue: "acts" };
  }
  if (!chunk.pins?.a?.id || !chunk.pins?.b?.id) return { ok: false, issue: "pins" };
  if (chunk.laws !== RAILS) return { ok: false, issue: "laws" };
  if (chunk.tags?.identity !== "bolt") return { ok: false, issue: "identity" };
  const slots = slotsFromEngine({
    biome: chunk.biome,
    act: "walk-A",
    still: chunk.still,
    seed: chunk.id,
  });
  const assembled = assemblePrompt(slots);
  return lintPrompt(assembled.prompt, slots);
}

export function lintShelf(): ChunkLint {
  for (const c of SHELF) {
    const lint = lintChunk(c);
    if (!lint.ok) return lint;
  }
  return { ok: true };
}

/** Last frame A → still B, rails locked, 6–8s stitch. */
export function assembleBridgePrompt(from: Chunk, to: Chunk, act: BridgeAct, seed: string) {
  void act;
  return assembleCookPlate({
    biome: to.biome,
    tap: "enter",
    from: from.id,
    to: to.id,
    still: from.still,
    destStill: to.still,
    leftover: true,
    seed,
    momentum: 0.4,
  });
}

export function lookupBridgeClip(opts: {
  s: string;
  fromId: string;
  toId: string;
  act?: BridgeAct;
}): EnterClipHit {
  return lookupEnterClip({
    s: opts.s,
    i: 0,
    from: opts.fromId,
    to: opts.toId,
    door: "",
    fromId: opts.fromId,
    toId: opts.toId,
    act: opts.act || "enter",
  });
}

/** Named stock pair — rail 2 library hook. Play stock or refuse, never spin. */
export function registerStockPair(fromId: string, toId: string, url: string): string {
  return registerStockBridge(fromId, toId, url);
}

/**
 * First stitch cooks on confirm / Forge / ticket only.
 * Cache hit is a replay (0 tickets). Lint fail → no Imagine.
 */
export function cookChunkBridge(opts: {
  s: string;
  from: Chunk;
  to: Chunk;
  act?: BridgeAct;
  ticket: PaidEnterTicket;
  url: string;
}): { url: string; key: string; tickets: 0 | 1; imagine: boolean; credit: CreditKind | "" } {
  const act = opts.act || "enter";
  const key = bridgeSeed(opts.s, opts.from.id, opts.to.id, act);
  const existing = key ? reuseClipBeforeRecook(key) : "";
  if (existing) {
    return { url: existing, key, tickets: 0, imagine: false, credit: "replay-cache" };
  }
  if (!mayPaidEnterCook(opts.ticket) || !mayImagine("enter-confirm")) {
    return { url: "", key, tickets: 0, imagine: false, credit: "" };
  }
  const cooked = assembleBridgePrompt(opts.from, opts.to, act, key);
  if (!cooked.lint.ok) return { url: "", key, tickets: 0, imagine: false, credit: "" };
  const smoke = lintEnterClip(opts.url, opts.to.still, cooked.prompt, BRIDGE_SECS.min);
  if (smoke.smoke !== "PASS") return { url: "", key, tickets: 0, imagine: false, credit: "" };
  const stored = replaceStockEnter(key, opts.url, opts.ticket, smoke);
  if (stored) registerStockBridge(opts.from.id, opts.to.id, stored);
  return {
    url: stored,
    key,
    tickets: stored ? 1 : 0,
    imagine: Boolean(stored),
    credit: stored ? "first-stitch" : "",
  };
}

function doorChunk(placed: HallChunks, door: DoorLetter): Chunk {
  return door === "B" ? placed.b : placed.a;
}

/**
 * Enter / walk-across between chunks.
 * No bridge needed → breath on door.
 * Needed without cache or named stock pair → enter illegal, breath, never Imagine.
 * Hung dest is remix hang (0). Replay cache / stock walk are 0. Cook is confirm only.
 */
export function resolveChunkEnter(opts: {
  s: string;
  room: number;
  door: DoorLetter | "m1" | "m2" | "a" | "b";
  destRoom?: number;
  phase?: number;
  hungArts?: HungForge[];
  hung?: boolean;
  act?: BridgeAct;
}): ChunkEnterPath {
  const door = asDoor(opts.door);
  const act: BridgeAct = opts.act || "enter";
  const placed = placeHallChunks({
    s: opts.s,
    room: opts.room,
    phase: opts.phase,
    hungArts: opts.hungArts,
  });
  const from = doorChunk(placed, door);
  let to = placed.enterDest[door] || from;
  if (opts.destRoom && opts.destRoom !== opts.room) {
    const dest = placeHallChunks({
      s: opts.s,
      room: opts.destRoom,
      phase: opts.phase,
      hungArts: opts.hungArts,
    });
    to = placed.enterDest[door] || doorChunk(dest, door);
  }
  const key = bridgeSeed(opts.s, from.id, to.id, act);
  const railLook = {
    s: opts.s,
    i: opts.room,
    from: door === "B" ? "m2" : "m1",
    to: "spawn",
    door,
  };
  if (opts.hung) {
    return {
      act: "enter",
      url: "",
      source: "",
      imagine: false,
      commit: "hold",
      needed: false,
      credit: "remix-hang",
      tickets: 0,
      key,
      fromId: from.id,
      toId: to.id,
    };
  }
  const needed = bridgeNeeded(from, to, act);
  if (mayImagine("enter-hot") || mayImagine("walk-toward-door") || mayImagine("speculate")) {
    return {
      act: "breath",
      url: "",
      source: "",
      imagine: false,
      commit: "hold",
      needed,
      credit: "",
      tickets: 0,
      key,
      fromId: from.id,
      toId: to.id,
    };
  }
  if (!needed) {
    const rail = lookupEnterClip(railLook);
    if (rail.url) {
      return {
        act: "enter",
        url: rail.url,
        source: rail.source,
        imagine: false,
        commit: commitHallPrime(rail.url),
        needed: false,
        credit: rail.source === "cache" ? "replay-cache" : "stock-walk",
        tickets: 0,
        key: rail.key,
        fromId: from.id,
        toId: to.id,
      };
    }
    return {
      act: "breath",
      url: "",
      source: "",
      imagine: false,
      commit: "hold",
      needed: false,
      credit: "",
      tickets: 0,
      key,
      fromId: from.id,
      toId: to.id,
    };
  }
  const hit = lookupEnterClip({
    ...railLook,
    fromId: from.id,
    toId: to.id,
    act,
  });
  if (!hit.url) {
    return {
      act: "breath",
      url: "",
      source: "",
      imagine: false,
      commit: "hold",
      needed: true,
      credit: "",
      tickets: 0,
      key,
      fromId: from.id,
      toId: to.id,
    };
  }
  return {
    act,
    url: hit.url,
    source: hit.source,
    imagine: false,
    commit: commitHallPrime(hit.url),
    needed: true,
    credit: hit.source === "cache" ? "replay-cache" : "stock-walk",
    tickets: 0,
    key: hit.key,
    fromId: from.id,
    toId: to.id,
  };
}
