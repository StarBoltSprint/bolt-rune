import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FILM_BY_ID } from "./films.ts";
import {
  assembleHall,
  BIOME_NEIGHBORS,
  BRIDGE_SECS,
  bridgeCacheKey,
  catalogChunks,
  chunkFromHung,
  chunkPickKey,
  cookBridgeOnConfirm,
  creditFirstStitch,
  creditRemixHang,
  creditReplay,
  creditWalkHung,
  hangChunkOnDoor,
  library,
  lintChunk,
  lookupBridge,
  mayHopBiome,
  needsBridge,
  pickChunk,
  placeOnDoor,
  posesMatch,
  prefetchStockWalk,
  putBridgeCache,
  stitchEnter,
  vaultClear,
  vaultGet,
  walkSecsForPhase,
  type HungLike,
} from "./pcg-chunk.ts";
import { RAILS } from "./pcg-prompt.ts";
import { clearStockBridges, mayImagine, pcgHash, registerStockBridge } from "./pcg-rail.ts";
import { isLegalPins } from "./pcg-grammar.ts";

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

function hungForest(id = "art-forest-1"): HungLike {
  return {
    id,
    name: "Forest",
    still: "/films/cook-forest.jpg",
    playlist: ["/films/forge-forest.mp4"],
    prompt: RAILS,
    room: { door: "A", biome: "forest", hall: 1, still: "/films/cook-forest.jpg" },
  };
}

describe("PCG chunk library — catalog + seeded pick", () => {
  beforeEach(() => {
    vaultClear();
    mockStorage();
    clearStockBridges();
  });

  it("starter catalog is biome plates with rails; asteroid HOLD still", () => {
    const catalog = catalogChunks();
    assert.ok(catalog.length >= 10);
    const asteroid = catalog.find((c) => c.biome === "asteroid");
    assert.ok(asteroid);
    assert.equal(asteroid!.still, "/films/cook-asteroid.jpg");
    assert.equal(asteroid!.tags.identity, asteroid!.still);
    assert.equal(asteroid!.tags.pose, "lock-off");
    assert.equal(asteroid!.walkSecs, 6);
    assert.ok(asteroid!.laws.join(" ").includes("LOCKED-OFF CAMERA"));
    assert.equal(lintChunk(asteroid!).ok, true);
    const peak = catalog.find((c) => c.biome === "peak");
    assert.equal(peak?.tags.energy, "peak");
    assert.equal(peak?.walkSecs, 15);
    assert.equal(walkSecsForPhase("quiet"), 6);
    assert.equal(walkSecsForPhase("lean"), 10);
    assert.equal(walkSecsForPhase("peak"), 15);
  });

  it("library.pick(hash(s, room, door), filter) is seed-stable", () => {
    const s = "schunkpick01";
    const keyA = chunkPickKey(s, 1, "A");
    assert.equal(keyA, pcgHash([s, 1, "A"]));
    const a = library.pick(keyA, { biome: "forest" });
    const b = pickChunk(keyA, { biome: "forest" });
    const c = library.pick(chunkPickKey(s, 1, "A"), { biome: "forest" });
    assert.ok(a);
    assert.deepEqual(a, b);
    assert.deepEqual(a, c);
    assert.equal(a!.biome, "forest");
    const other = library.pick(chunkPickKey("schunkpick99", 1, "A"), { biome: "ember" });
    assert.equal(other?.biome, "ember");
    assert.notEqual(library.pick(chunkPickKey(s, 2, "A"), { biome: "forest" })?.id, library.pick(chunkPickKey(s, 3, "B"), { energy: "peak" })?.id);
  });

  it("same hall A+B share biome; next hall is neighbor only; peak phase may pick peak", () => {
    const s = "schunkadj01";
    const hall = assembleHall({ s, room: 1, biome: "forest", phase: "quiet" });
    assert.equal(hall.doors.A.biome, hall.doors.B.biome);
    assert.equal(hall.doors.A.biome, "forest");
    assert.equal(hall.illegal.includes("same-hall-biome-mismatch"), false);
    assert.ok(isNeighborBiomeSafe("forest", "canyon"));
    assert.equal(mayHopBiome("forest", "canyon", false), false);
    assert.equal(mayHopBiome("forest", "canyon", true), true);
    assert.equal(mayHopBiome("forest", "egypt", true), false);
    const quiet = library.filter({ phase: "quiet" });
    assert.ok(quiet.every((c) => c.tags.energy !== "peak"));
    const peaked = library.filter({ phase: "peak", energy: "peak" });
    assert.ok(peaked.some((c) => c.biome === "peak"));
    const next = assembleHall({ s, room: 2, neighborOf: "forest", phase: "quiet" });
    assert.ok(BIOME_NEIGHBORS.forest.includes(next.doors.A.biome) || next.doors.A.biome === "forest");
  });
});

function isNeighborBiomeSafe(from: string, to: string) {
  return BIOME_NEIGHBORS[from as keyof typeof BIOME_NEIGHBORS]?.includes(to as never) || from === to;
}

describe("PCG chunk — hung wins + lint", () => {
  beforeEach(() => {
    vaultClear();
    mockStorage();
    clearStockBridges();
  });

  it("hung forge artifact is a pack-authored chunk and wins over pick", () => {
    const art = hungForest();
    const chunk = chunkFromHung(art, "A");
    assert.equal(chunk.hung, true);
    assert.equal(chunk.biome, "forest");
    assert.equal(chunk.still, "/films/cook-forest.jpg");
    assert.equal(chunk.loop, "/films/forge-forest.mp4");
    assert.equal(chunk.tags.handed, "A");
    assert.equal(chunk.tags.pose, "door-a");
    assert.equal(lintChunk(chunk).ok, true);
    const picked = library.pick(chunkPickKey("shungwin01", 1, "A"), { biome: "asteroid" });
    assert.ok(picked);
    const placed = placeOnDoor("A", art, picked);
    assert.equal(placed?.id, art.id);
    assert.equal(placed?.hung, true);
    assert.equal(placed?.biome, "forest");
    const hall = assembleHall({
      s: "shungwin01",
      room: 1,
      biome: "asteroid",
      hungA: art,
    });
    assert.equal(hall.doors.A.id, art.id);
    assert.equal(hall.doors.A.hung, true);
    assert.equal(hall.doors.A.biome, "forest");
    assert.equal(hall.doors.B.biome, "forest");
    const hung = hangChunkOnDoor("B", hungForest("art-forest-b"));
    assert.equal(vaultGet(hung.id)?.hung, true);
    assert.equal(hung.tags.handed, "B");
  });

  it("still-only chunk (no loop) is still a prompt lock — Imagine only moves between stills", () => {
    const still: HungLike = {
      id: "art-still-1",
      name: "Moss still",
      still: "/films/cook-forest.jpg",
      playlist: [],
      prompt: RAILS,
      room: { door: "B", biome: "moss", hall: 2, still: "/films/cook-forest.jpg" },
    };
    const chunk = chunkFromHung(still, "B");
    assert.equal(chunk.loop, undefined);
    assert.equal(chunk.acts.walkA, undefined);
    assert.ok(chunk.acts.breath);
    assert.equal(lintChunk(chunk).ok, true);
  });
});

describe("PCG chunk — bridge stitch law", () => {
  beforeEach(() => {
    vaultClear();
    mockStorage();
    clearStockBridges();
  });

  it("no biome hop without enter", () => {
    const forest = catalogChunks().find((c) => c.biome === "forest")!;
    const canyon = catalogChunks().find((c) => c.biome === "canyon")!;
    const bare = stitchEnter({ s: "shop01", from: forest, to: canyon, entered: false });
    assert.equal(bare.commit, "hold");
    assert.equal(bare.play, "breath");
    assert.equal(bare.imagine, false);
    assert.equal(bare.reason, "biome-hop-without-enter");
    assert.equal(bare.biome, "forest");
    const hop = assembleHall({ s: "shop01", room: 2, neighborOf: "forest" });
    assert.ok(hop.illegal.includes("biome-hop-without-enter") || hop.doors.A.biome === "forest");
  });

  it("no stitch without bridge — breath on the door, Hall′ HOLD", () => {
    const a = catalogChunks().find((c) => c.biome === "forest")!;
    const b = catalogChunks().find((c) => c.biome === "canyon")!;
    assert.equal(needsBridge(a, b), true);
    assert.equal(needsBridge(a, a), false);
    assert.equal(posesMatch(a, a), true);
    const miss = stitchEnter({ s: "sstitch01", from: a, to: b, entered: true });
    assert.equal(miss.play, "breath");
    assert.equal(miss.commit, "hold");
    assert.equal(miss.imagine, false);
    assert.equal(miss.reason, "stitch-without-bridge");
    assert.equal(mayImagine("enter-hot"), false);
    assert.equal(mayImagine("speculate"), false);
  });

  it("cache or named stock pair stitches; first cook is a confirm ticket; replay is free", () => {
    const a = catalogChunks().find((c) => c.biome === "forest")!;
    const b = catalogChunks().find((c) => c.biome === "canyon")!;
    const s = "sbridge01";
    assert.equal(BRIDGE_SECS.min, 6);
    assert.equal(BRIDGE_SECS.max, 8);
    assert.equal(creditWalkHung().tickets, 0);
    assert.equal(creditRemixHang().tickets, 0);
    assert.equal(creditFirstStitch(s, a, b, "enter").tickets, 0);
    assert.equal(creditFirstStitch(s, a, b, "enter", "confirm").tickets, 1);
    assert.equal(cookBridgeOnConfirm({ s, from: a, to: b, ticket: "confirm", url: "/films/enter-a.mp4" }), "/films/enter-a.mp4");
    const key = bridgeCacheKey(s, a.id, b.id, "enter");
    assert.equal(key, pcgHash([s, a.id, b.id, "enter"]));
    const hit = lookupBridge(s, a, b, "enter");
    assert.equal(hit.source, "cache");
    assert.equal(hit.url, "/films/enter-a.mp4");
    const pass = stitchEnter({ s, from: a, to: b, entered: true });
    assert.equal(pass.commit, "pass");
    assert.equal(pass.play, "bridge");
    assert.equal(pass.act, "enter");
    assert.equal(pass.imagine, false);
    assert.equal(pass.biome, "canyon");
    assert.equal(creditReplay().tickets, 0);
    assert.equal(creditFirstStitch(s, a, b, "enter", "confirm").tickets, 0);
    mockStorage();
    registerStockBridge(a.id, b.id, "/ui/citadel.mp4", "enter");
    const stock = stitchEnter({ s: "sstock01", from: a, to: b, entered: true });
    assert.equal(stock.commit, "pass");
    assert.equal(stock.play, "bridge");
    assert.equal(prefetchStockWalk(a, "A").imagine, false);
    assert.ok(prefetchStockWalk(a, "A").url);
  });

  it("same-chunk walk uses stock; A↔B of two films needs a bridge", () => {
    const s = "sedge01";
    const hall = assembleHall({ s, room: 1, biome: "asteroid" });
    const same = hall.edges.find((e) => e.from === "spawn" && e.to === "m1");
    assert.equal(same?.kind, "stock-walk");
    assert.equal(same?.needsBridge, false);
    const hungA = chunkFromHung(hungForest("art-a"), "A");
    const hungB = chunkFromHung({ ...hungForest("art-b"), room: { door: "B", biome: "forest", hall: 1, still: "/films/cook-forest.jpg" } }, "B");
    hungB.tags.pose = "door-b";
    const mixed = assembleHall({ s, room: 1, hungA, hungB });
    const cross = mixed.edges.find((e) => e.from === "m1" && e.to === "m2");
    assert.equal(cross?.needsBridge, true);
    assert.equal(cross?.kind, "breath");
    putBridgeCache(s, hungA.id, hungB.id, "walk-across", "/films/enter-a.mp4");
    const wired = assembleHall({ s, room: 1, hungA, hungB });
    const after = wired.edges.find((e) => e.from === "m1" && e.to === "m2");
    assert.equal(after?.kind, "bridge");
    assert.equal(after?.clip, "/films/enter-a.mp4");
  });

  it("assembly uses grammar pins + compileCitadel; hung pins win", () => {
    const hungPins = [
      { id: "m1", name: "hung A", x: 0.2, y: 0.5 },
      { id: "m2", name: "hung B", x: 0.8, y: 0.5 },
    ];
    const hall = assembleHall({
      s: "sasm01",
      room: 1,
      biome: "forest",
      existingPins: hungPins,
      hungA: hungForest(),
      momentum: 0,
    });
    assert.equal(hall.pins.find((p) => p.id === "m1")?.name, "hung A");
    assert.equal(hall.pins.find((p) => p.id === "m2")?.name, "hung B");
    assert.ok(hall.graph.nodes.some((n) => n.id === "spawn"));
    assert.ok(hall.graph.walks.some((w) => w.from === "m1" && w.to === "m2"));
    assert.equal(isLegalPins(hall.pins, { momentum: 0 }), true);
    assert.equal(hall.walkSecs, 6);
  });
});

describe("PCG chunk — engine Hang/Load + Asteroid HOLD", () => {
  it("Hang/Load treats hung artifacts as chunks; seats and asteroid untouched", () => {
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const goEnter = engine.slice(engine.indexOf("async function goEnter"), engine.indexOf("function enterNext"));
    const applyHall = engine.slice(engine.indexOf("function applyHall"), engine.indexOf("async function switchHall"));
    const attach = engine.slice(engine.indexOf("function attachRift"), engine.indexOf("function dropRift"));
    const load = engine.slice(engine.indexOf("async function openSession"), engine.indexOf("function enterLivingRoom"));
    assert.match(engine, /from "@\/game\/pcg-chunk"/);
    assert.match(engine, /assembleHall\(/);
    assert.match(engine, /hangChunkOnDoor\(/);
    assert.match(engine, /stitchEnter\(/);
    assert.match(applyHall, /assembleHall\(/);
    assert.match(attach, /hangChunkOnDoor\(/);
    assert.match(goEnter, /stitchEnter\(/);
    assert.match(goEnter, /rewriteOnEnter\(/);
    assert.match(goEnter, /commitHallPrime\(/);
    assert.doesNotMatch(goEnter, /cookFilm\(|startRuneFilm\(|forgeWalkNow\(/);
    assert.match(load, /assembleHall\(/);
    const rail = readFileSync(join(here, "./pcg-rail.ts"), "utf8");
    const grammar = readFileSync(join(here, "./pcg-grammar.ts"), "utf8");
    const prompt = readFileSync(join(here, "./pcg-prompt.ts"), "utf8");
    assert.match(rail, /pcg-chunk|chunk library/);
    assert.match(grammar, /compileCitadel/);
    assert.match(prompt, /LOCK/);
    assert.match(rail, /Asteroid HOLD/);
    const asteroid = FILM_BY_ID.asteroid.beats.map((beat) => beat.at);
    assert.deepEqual(asteroid, [7.0, 12.3, 16.3, 21.6, 25.6, 30.9, 34.9, 40.2, 44.2, 49.5, 53.5]);
    const seats = readFileSync(join(here, "../components/door-chat-line.tsx"), "utf8");
    assert.doesNotMatch(seats, /pcg-chunk|hangChunkOnDoor|stitchEnter/);
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    assert.match(readme, /chunk library|bridge stitch/i);
    assert.match(readme, /Asteroid HOLD/);
  });
});
