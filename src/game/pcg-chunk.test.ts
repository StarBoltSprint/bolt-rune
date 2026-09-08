import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FILM_BY_ID } from "./films.ts";
import { BIOME_CATALOG, BIOME_IDS, RAILS } from "./pcg-prompt.ts";
import {
  beginRunSeed,
  bridgeSeed,
  clearStockBridges,
  clipCacheGet,
  clipCachePut,
  enterSeed,
  lookupEnterClip,
  mayImagine,
  mayPaidEnterCook,
  pcgHash,
  replaceStockEnter,
} from "./pcg-rail.ts";
import {
  assembleBridgePrompt,
  BRIDGE_SECS,
  bridgeNeeded,
  chunkFromHung,
  clearExtraChunks,
  cookChunkBridge,
  creditTickets,
  hungOnDoor,
  library,
  lintChunk,
  lintShelf,
  lookupBridgeClip,
  pick,
  pickKey,
  placeHallChunks,
  posesMatch,
  registerChunk,
  registerStockPair,
  resolveChunkEnter,
  starterShelf,
  walkSecsForPhase,
  type Chunk,
  type HungForge,
} from "./pcg-chunk.ts";

const here = dirname(fileURLToPath(import.meta.url));

function mockStorage() {
  const mem = new Map<string, string>();
  const store = {
    getItem(k: string) {
      return mem.has(k) ? mem.get(k)! : null;
    },
    setItem(k: string, v: string) {
      mem.set(k, String(v));
    },
    removeItem(k: string) {
      mem.delete(k);
    },
    clear() {
      mem.clear();
    },
  };
  Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true });
  return store;
}

function hungArt(over: Partial<HungForge> & { id: string }): HungForge {
  return {
    name: over.name || "forge",
    still: over.still || "/films/cook-forest.jpg",
    playlist: over.playlist || ["/films/forge-forest.mp4"],
    prompt: over.prompt || RAILS,
    hungAt: over.hungAt ?? 10,
    room: over.room ?? { door: "A", hall: 1, biome: "forest" },
    ...over,
  };
}

function mismatchChunk(over: Partial<Chunk> = {}): Chunk {
  const [base] = starterShelf().filter((c) => c.biome === "canyon");
  assert.ok(base);
  return {
    ...base,
    id: over.id || "chunk-canyon-enter-pose",
    tags: { ...base.tags, pose: "enter", energy: "peak", ...(over.tags || {}) },
    ...over,
    tags: { ...base.tags, pose: over.tags?.pose || "enter", energy: over.tags?.energy || "peak", identity: "bolt" },
  };
}

describe("PCG chunk library — shelf + seeded pick", () => {
  beforeEach(() => {
    clearExtraChunks();
    clearStockBridges();
    mockStorage();
  });

  it("catalog biomes are the starter shelf — trusted prefab, rails, acts, pins A/B", () => {
    const shelf = starterShelf();
    assert.deepEqual(
      shelf.map((c) => c.biome).sort(),
      [...BIOME_IDS].slice().sort(),
    );
    assert.equal(shelf.length, BIOME_IDS.length);
    for (const c of shelf) {
      assert.equal(c.id, `chunk-${c.biome}`);
      assert.equal(c.still, BIOME_CATALOG[c.biome].still);
      assert.ok(c.loop);
      assert.deepEqual([...c.acts], ["breath", "walkA", "walkB"]);
      assert.equal(c.walkSecs === 6 || c.walkSecs === 10 || c.walkSecs === 15, true);
      assert.equal(c.pins.a.kind, "door-a");
      assert.equal(c.pins.b.kind, "door-b");
      assert.equal(c.laws, RAILS);
      assert.equal(c.tags.identity, "bolt");
      assert.equal(c.tags.handed, "either");
      assert.equal(c.source, "catalog");
      assert.equal(c.hung, undefined);
    }
    assert.equal(lintShelf().ok, true);
    assert.equal(lintChunk(shelf.find((c) => c.biome === "asteroid")!).ok, true);
  });

  it("library.pick(hash(s, room, door), filter) is seeded and stable", () => {
    const s = "schunkpick01";
    const keyA = pickKey(s, 1, "A");
    const keyB = pickKey(s, 1, "B");
    assert.equal(keyA, pcgHash([s, 1, "A"]));
    assert.notEqual(keyA, keyB);
    const a = library.pick(keyA, { biome: "forest", handed: "A" });
    const again = pick(keyA, { biome: "forest", handed: "A" });
    assert.ok(a);
    assert.equal(a.biome, "forest");
    assert.deepEqual(again, a);
    assert.notEqual(pick(keyA, { biome: "forest" })?.id, pick(keyA, { biome: "canyon" })?.id);
    const other = pick(pickKey("schunkpick99", 1, "A"), { handed: "A" });
    assert.ok(other);
    assert.equal(pick(pickKey(s, 2, "A"), { biome: "forest" })?.biome, "forest");
  });

  it("walkSecs by phase — 6 / 10 / 15", () => {
    assert.equal(walkSecsForPhase(0), 6);
    assert.equal(walkSecsForPhase(0.2), 6);
    assert.equal(walkSecsForPhase(0.35), 10);
    assert.equal(walkSecsForPhase(0.5), 10);
    assert.equal(walkSecsForPhase(0.7), 15);
    assert.equal(walkSecsForPhase(1), 15);
  });
});

describe("PCG chunk library — Hang wins + same-hall biome", () => {
  beforeEach(() => {
    clearExtraChunks();
    clearStockBridges();
    mockStorage();
  });

  it("hung forge artifact wins over seeded pick on that door", () => {
    const s = "shungwin01";
    const hung = hungArt({
      id: "art-forest-a",
      still: "/films/cook-forest.jpg",
      room: { door: "A", hall: 1, biome: "forest" },
    });
    const seeded = placeHallChunks({ s, room: 1, phase: 0.4 });
    const placed = placeHallChunks({ s, room: 1, phase: 0.4, hungA: hung });
    assert.equal(placed.a.hung, true);
    assert.equal(placed.a.id, "hung-art-forest-a");
    assert.equal(placed.a.source, "hang");
    assert.notEqual(placed.a.id, seeded.a.id);
    assert.equal(placed.a.biome, placed.b.biome);
    assert.equal(placed.biome, "forest");
    assert.equal(placed.b.hung, undefined);
    assert.equal(placed.b.source, "catalog");
    assert.equal(placed.illegal.length, 0);
    assert.equal(chunkFromHung(hung, "A").id, "hung-art-forest-a");
    assert.equal(hungOnDoor([hung], "A", 1)?.id, "art-forest-a");
    assert.equal(hungOnDoor([hung], "A", 2), undefined);
  });

  it("same hall A+B same biome; other-biome hang is enter dest, not a hall hop", () => {
    const s = "shallbiome01";
    const hungA = hungArt({
      id: "art-a",
      still: "/films/cook-forest.jpg",
      room: { door: "A", hall: 1, biome: "forest" },
    });
    const hungB = hungArt({
      id: "art-b",
      still: "/films/cook-canyon.jpg",
      playlist: ["/films/forge-canyon.mp4"],
      room: { door: "B", hall: 1, biome: "canyon" },
    });
    const placed = placeHallChunks({ s, room: 1, phase: 0.4, hungA, hungB });
    assert.equal(placed.a.biome, placed.b.biome);
    assert.equal(placed.biome, "forest");
    assert.equal(placed.a.hung, true);
    assert.equal(placed.b.hung, undefined);
    assert.equal(placed.enterDest.B?.biome, "canyon");
    assert.equal(placed.enterDest.B?.hung, true);
    assert.equal(placed.illegal.length, 0);
    const hop = resolveChunkEnter({
      s,
      room: 1,
      door: "B",
      phase: 0.4,
      hungArts: [hungA, hungB],
    });
    assert.equal(hop.needed, true);
    assert.equal(hop.fromId, placed.b.id);
    assert.equal(hop.toId, placed.enterDest.B?.id);
  });
});

describe("PCG chunk library — lint + credits", () => {
  it("prompt rails linter passes shelf and fails morph / missing rails", () => {
    const forest = starterShelf().find((c) => c.biome === "forest")!;
    assert.equal(lintChunk(forest).ok, true);
    const morph = { ...forest, id: "bad-morph" };
    const assembled = assembleBridgePrompt(forest, forest, "enter", "s1");
    assert.equal(assembled.lint.ok, true);
    assert.ok(assembled.prompt.startsWith(RAILS));
    const broken = { ...forest, laws: "no rails" as typeof RAILS, tags: { ...forest.tags, identity: "bolt" } };
    assert.equal(lintChunk(broken).ok, false);
    assert.equal(registerChunk({ ...forest, id: "no-acts", acts: [] }), "");
    const custom = mismatchChunk({ id: "chunk-pose-peak" });
    assert.equal(lintChunk(custom).ok, true);
    assert.ok(registerChunk(custom));
    clearExtraChunks();
  });

  it("credits: stock walk 0, remix hang 0, first stitch 1, replay cache 0", () => {
    assert.equal(creditTickets("stock-walk"), 0);
    assert.equal(creditTickets("remix-hang"), 0);
    assert.equal(creditTickets("first-stitch"), 1);
    assert.equal(creditTickets("replay-cache"), 0);
  });
});

describe("PCG chunk library — bridge need + rail 2 ticket/cache", () => {
  beforeEach(() => {
    clearExtraChunks();
    clearStockBridges();
    mockStorage();
    beginRunSeed("citadel-chunk", "sbridge01abcdef");
  });

  it("poses match → no bridge → breath on door", () => {
    const s = "sbridge01abcdef";
    const placed = placeHallChunks({ s, room: 1, phase: 0.4 });
    assert.equal(posesMatch(placed.a, placed.b), true);
    assert.equal(bridgeNeeded(placed.a, placed.b, "walk-across"), false);
    const hot = resolveChunkEnter({ s, room: 1, door: "A", destRoom: 1, phase: 0.4 });
    assert.equal(hot.needed, false);
    assert.equal(hot.act, "breath");
    assert.equal(hot.imagine, false);
    assert.equal(hot.commit, "hold");
    assert.equal(hot.tickets, 0);
  });

  it("pose mismatch needs a 6–8s stitch; enter illegal without clip or named stock pair", () => {
    assert.equal(BRIDGE_SECS.min, 6);
    assert.equal(BRIDGE_SECS.max, 8);
    const s = "sbridge01abcdef";
    const hung = hungArt({
      id: "art-canyon",
      still: "/films/cook-canyon.jpg",
      playlist: ["/films/forge-canyon.mp4"],
      room: { door: "B", hall: 1, biome: "canyon" },
    });
    const forest = hungArt({
      id: "art-forest",
      still: "/films/cook-forest.jpg",
      room: { door: "A", hall: 1, biome: "forest" },
    });
    const placed = placeHallChunks({ s, room: 1, phase: 0.4, hungA: forest, hungB: hung });
    const from = placed.b;
    const to = placed.enterDest.B!;
    assert.equal(bridgeNeeded(from, to, "enter"), true);
    const bare = resolveChunkEnter({ s, room: 1, door: "B", phase: 0.4, hungArts: [forest, hung] });
    assert.equal(bare.needed, true);
    assert.equal(bare.act, "breath");
    assert.equal(bare.url, "");
    assert.equal(bare.imagine, false);
    assert.equal(mayImagine("enter-hot"), false);
  });

  it("cache key is H(s, fromId, toId, act); named stock pair and replay are 0 tickets", () => {
    const s = "sbridge01abcdef";
    const fromId = "chunk-forest";
    const toId = "chunk-canyon";
    const key = bridgeSeed(s, fromId, toId, "enter");
    assert.equal(key, pcgHash([s, fromId, toId, "enter"]));
    assert.notEqual(key, enterSeed(s, 1, "m1", "spawn", "A"));
    assert.notEqual(bridgeSeed(s, fromId, toId, "walk-across"), key);
    registerStockPair(fromId, toId, "/ui/citadel.mp4");
    const stock = lookupBridgeClip({ s, fromId, toId, act: "enter" });
    assert.equal(stock.source, "stock");
    assert.equal(stock.url, "/ui/citadel.mp4");
    assert.equal(stock.key, key);
    clipCachePut(key, "/films/enter-stitch.mp4", "enter");
    const cached = lookupEnterClip({
      s,
      i: 1,
      from: "m1",
      to: "spawn",
      door: "A",
      fromId,
      toId,
      act: "enter",
    });
    assert.equal(cached.source, "cache");
    assert.equal(cached.url, "/films/enter-stitch.mp4");
    const hung = hungArt({ id: "art-canyon", still: "/films/cook-canyon.jpg", room: { door: "B", hall: 1, biome: "canyon" } });
    const forest = hungArt({ id: "art-forest", still: "/films/cook-forest.jpg", room: { door: "A", hall: 1, biome: "forest" } });
    const placed = placeHallChunks({ s, room: 1, phase: 0.4, hungA: forest, hungB: hung });
    clipCachePut(bridgeSeed(s, placed.b.id, placed.enterDest.B!.id, "enter"), "/films/enter-stitch.mp4", "enter");
    const hot = resolveChunkEnter({ s, room: 1, door: "B", phase: 0.4, hungArts: [forest, hung] });
    assert.equal(hot.act, "enter");
    assert.equal(hot.source, "cache");
    assert.equal(hot.credit, "replay-cache");
    assert.equal(hot.tickets, 0);
    assert.equal(hot.imagine, false);
    assert.equal(hot.commit, "pass");
  });

  it("first stitch is 1 ticket on confirm only — never walk-toward-door", () => {
    const s = "sbridge01abcdef";
    const from = starterShelf().find((c) => c.biome === "forest")!;
    const to = starterShelf().find((c) => c.biome === "canyon")!;
    assert.equal(mayPaidEnterCook("confirm"), true);
    const refused = cookChunkBridge({ s, from, to, act: "enter", ticket: "nope" as "confirm", url: "/films/stitch.mp4" });
    assert.equal(refused.url, "");
    assert.equal(refused.tickets, 0);
    assert.equal(refused.imagine, false);
    const first = cookChunkBridge({ s, from, to, act: "enter", ticket: "confirm", url: "/films/stitch.mp4" });
    assert.equal(first.url, "/films/stitch.mp4");
    assert.equal(first.tickets, 1);
    assert.equal(first.credit, "first-stitch");
    assert.equal(first.key, bridgeSeed(s, from.id, to.id, "enter"));
    assert.equal(clipCacheGet(first.key), "/films/stitch.mp4");
    const replay = cookChunkBridge({ s, from, to, act: "enter", ticket: "confirm", url: "/films/other.mp4" });
    assert.equal(replay.url, "/films/stitch.mp4");
    assert.equal(replay.tickets, 0);
    assert.equal(replay.credit, "replay-cache");
    assert.equal(replay.imagine, false);
    assert.equal(replaceStockEnter(first.key, "/films/paid.mp4", "confirm"), "/films/paid.mp4");
  });

  it("hung dest is remix hang 0 — no stitch ticket", () => {
    const hot = resolveChunkEnter({
      s: "sbridge01abcdef",
      room: 1,
      door: "A",
      hung: true,
      hungArts: [hungArt({ id: "art-x", room: { door: "A", hall: 1, biome: "forest" } })],
    });
    assert.equal(hot.act, "enter");
    assert.equal(hot.credit, "remix-hang");
    assert.equal(hot.tickets, 0);
    assert.equal(hot.needed, false);
    assert.equal(hot.imagine, false);
  });
});

describe("PCG chunk library — engine hook + Asteroid HOLD", () => {
  it("engine places hall chunks and resolves stitch through rail 2; seats untouched", () => {
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const applyHall = engine.slice(engine.indexOf("function applyHall"), engine.indexOf("function rememberSlice") > engine.indexOf("function applyHall") ? engine.indexOf("async function switchHall") : engine.indexOf("async function switchHall"));
    const goEnter = engine.slice(engine.indexOf("async function goEnter"), engine.indexOf("function enterNext"));
    assert.match(engine, /from "@\/game\/pcg-chunk"/);
    assert.match(engine, /placeHallChunks\(/);
    assert.match(engine, /resolveChunkEnter\(/);
    assert.match(engine, /chunkEnterNow\(/);
    assert.match(applyHall, /placeHallChunks\(/);
    assert.match(applyHall, /placed\.walkSecs/);
    assert.match(goEnter, /fromId: stitch\.fromId/);
    assert.match(goEnter, /toId: stitch\.toId/);
    assert.match(engine, /hot\.act === "enter"/);
    const rail = readFileSync(join(here, "./pcg-rail.ts"), "utf8");
    const grammar = readFileSync(join(here, "./pcg-grammar.ts"), "utf8");
    const prompt = readFileSync(join(here, "./pcg-prompt.ts"), "utf8");
    const chunk = readFileSync(join(here, "./pcg-chunk.ts"), "utf8");
    assert.match(rail, /bridgeSeed/);
    assert.match(rail, /fromId/);
    assert.match(chunk, /from "\.\/pcg-rail/);
    assert.match(chunk, /from "\.\/pcg-grammar/);
    assert.match(chunk, /from "\.\/pcg-prompt/);
    assert.match(grammar, /hallDoorPins/);
    assert.match(prompt, /lintPrompt/);
    assert.match(chunk, /Asteroid HOLD/);
    assert.doesNotMatch(chunk, /prepareHoldBeats/);
    const asteroid = FILM_BY_ID.asteroid.beats.map((beat) => beat.at);
    assert.deepEqual(asteroid, [7.0, 12.3, 16.3, 21.6, 25.6, 30.9, 34.9, 40.2, 44.2, 49.5, 53.5]);
    const seats = readFileSync(join(here, "../components/door-chat-line.tsx"), "utf8");
    assert.doesNotMatch(seats, /pcg-chunk|placeHallChunks|resolveChunkEnter/);
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    assert.match(readme, /PCG chunk library/);
    assert.match(readme, /trusted prefab/);
  });
});
