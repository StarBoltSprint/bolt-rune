import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FILM_BY_ID } from "./films.ts";
import {
  beginRunSeed,
  clipCacheGet,
  clipCachePut,
  clipCacheSnapshot,
  confirmForgeTicket,
  dropForgeTicket,
  enterReadyGlow,
  enterSeed,
  hydrateClipCache,
  isRunSeed,
  mayCommitEnterGraph,
  mayImagine,
  mayPaidImagine,
  mergeClipCache,
  newRunSeed,
  packClipCache,
  pcgHash,
  peekForgeTicket,
  plateSeed,
  playEnterHot,
  readRunSeed,
  reuseClipBeforeRecook,
  STOCK_ENTER_BRIDGE,
  stockEnterBridge,
  takeForgeTicket,
} from "./pcg-rail.ts";

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

describe("PCG rail 1 — run / plate / enter seeds", () => {
  beforeEach(() => {
    mockStorage();
    dropForgeTicket();
  });

  it("H is a stable 16-char hex for the same parts", () => {
    const a = pcgHash(["s1abc", 2, "intro", "forest"]);
    const b = pcgHash(["s1abc", 2, "intro", "forest"]);
    const c = pcgHash(["S1ABC", "2", " Intro ", "FOREST"]);
    assert.equal(a, b);
    assert.equal(a, c);
    assert.match(a, /^[0-9a-f]{16}$/);
    assert.notEqual(pcgHash(["s1abc", 3, "intro", "forest"]), a);
    assert.notEqual(pcgHash(["s1abc", 2, "chain", "forest"]), a);
    assert.notEqual(pcgHash(["s1abc", 2, "intro", "canyon"]), a);
  });

  it("s_i = H(s, i, act, biome) and s_enter = H(s, i, enter, from, to, door)", () => {
    const s = "sabc1234def";
    const plate = plateSeed(s, 0, "intro", "forest");
    const enter = enterSeed(s, 2, "m1", "spawn", "A");
    assert.equal(plate, pcgHash([s, 0, "intro", "forest"]));
    assert.equal(enter, pcgHash([s, 2, "enter", "m1", "spawn", "A"]));
    assert.notEqual(plate, enter);
    assert.notEqual(enterSeed(s, 2, "m1", "spawn", "B"), enter);
    assert.notEqual(enterSeed(s, 3, "m1", "spawn", "A"), enter);
  });

  it("New citadel / Play mint a run seed s and Keep persist reuses it", () => {
    const first = beginRunSeed("citadel-one");
    assert.equal(isRunSeed(first), true);
    assert.equal(beginRunSeed("citadel-one", first), first);
    assert.equal(readRunSeed("citadel-one"), first);
    const kept = beginRunSeed("citadel-one");
    assert.equal(kept, first);
    const other = beginRunSeed("citadel-two", "skept999zzz");
    assert.equal(other, "skept999zzz");
    assert.notEqual(other, first);
  });

  it("newRunSeed is unique enough for consecutive New citadel taps", () => {
    const a = newRunSeed();
    const b = newRunSeed();
    assert.equal(isRunSeed(a), true);
    assert.equal(isRunSeed(b), true);
    assert.notEqual(a, b);
  });
});

describe("PCG rail 1 — clip cache reuse before recook", () => {
  beforeEach(() => {
    mockStorage();
    dropForgeTicket();
  });

  it("keyed by s_i / s_enter — reuse hits, missing keys recook", () => {
    const s = "sclipcache01";
    const si = plateSeed(s, 0, "intro", "forest");
    const se = enterSeed(s, 1, "spawn", "m1", "A");
    assert.equal(reuseClipBeforeRecook(si), "");
    clipCachePut(si, "/films/forge-forest.mp4", "plate");
    clipCachePut(se, "https://imgen.x.ai/vid/enter.mp4", "enter");
    assert.equal(reuseClipBeforeRecook(si), "/films/forge-forest.mp4");
    assert.equal(clipCacheGet(se), "https://imgen.x.ai/vid/enter.mp4");
    assert.equal(reuseClipBeforeRecook(plateSeed(s, 1, "intro", "forest")), "");
    const snap = clipCacheSnapshot();
    assert.equal(snap[si], "/films/forge-forest.mp4");
    hydrateClipCache({ abc: "/ui/forge.mp4" });
    assert.equal(clipCacheGet("abc"), "/ui/forge.mp4");
    assert.deepEqual(packClipCache({ extra: "/films/forge-canyon.mp4" })?.extra, "/films/forge-canyon.mp4");
    assert.equal(mergeClipCache({ a: "/ui/a.mp4" }, { b: "/ui/b.mp4" })?.a, "/ui/a.mp4");
  });

  it("blob / data URLs never land in the Keep cache", () => {
    const key = plateSeed("skeep1", 0, "intro", "asteroid");
    assert.equal(clipCachePut(key, "blob:http://localhost/x", "plate"), "");
    assert.equal(clipCachePut(key, "data:video/mp4;base64,aaa", "plate"), "");
    assert.equal(reuseClipBeforeRecook(key), "");
  });
});

describe("PCG rail 1 — no Imagine on walk-toward-door speculation", () => {
  it("mayImagine allows plate / enter / forge only", () => {
    assert.equal(mayImagine("plate"), true);
    assert.equal(mayImagine("enter"), true);
    assert.equal(mayImagine("forge"), true);
    assert.equal(mayImagine("walk-toward-door"), false);
    assert.equal(mayImagine("speculate"), false);
    assert.equal(mayImagine("approach"), false);
    assert.equal(mayImagine("enter-hot"), false);
  });

  it("prefetch / quiet recook / approach walk never call Imagine", () => {
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const prefetch = engine.slice(engine.indexOf("function prefetchFrom"), engine.indexOf("function notePaint"));
    const quiet = engine.slice(engine.indexOf("async function cookRoomQuiet"), engine.indexOf("function enterLivingRoom"));
    const playWalk = engine.slice(engine.indexOf("async function playWalk"), engine.indexOf("async function saveFilms"));
    assert.match(engine, /from "@\/game\/pcg-rail"/);
    assert.match(prefetch, /mayImagine\("walk-toward-door"\)/);
    assert.doesNotMatch(prefetch, /cookFilm\(|startRuneFilm\(|forgeWalkNow\(/);
    assert.match(quiet, /mayImagine\("walk-toward-door"\)/);
    assert.match(playWalk, /mayImagine\("walk-toward-door"\)/);
  });
});

describe("PCG rail 1 — Keep persist + Asteroid HOLD", () => {
  it("session / cloud pack keep run seed s and clip cache", () => {
    const session = readFileSync(join(here, "./rune-session.ts"), "utf8");
    const cloud = readFileSync(join(here, "../lib/citadel-cloud.ts"), "utf8");
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const studio = readFileSync(join(here, "../components/cook-studio.tsx"), "utf8");
    assert.match(session, /seed\?: string/);
    assert.match(session, /clips\?: Record<string, string>/);
    assert.match(session, /packed\.seed \|\| kept\.seed/);
    assert.match(session, /mergeClipCache\(kept\.clips, packed\.clips\)/);
    assert.match(cloud, /seed: keepSeed\(session\.seed\)/);
    assert.match(cloud, /clips: packClipCache\(session\.clips\)/);
    assert.match(engine, /beginRunSeed\(/);
    assert.match(engine, /seed: seedHold\.current/);
    assert.match(engine, /reuseClipBeforeRecook\(/);
    assert.match(studio, /plateSeed\(/);
    assert.match(studio, /reuseClipBeforeRecook\(/);
  });

  it("Asteroid chart HOLD — rail 1 does not retouch asteroid beats", () => {
    const asteroid = FILM_BY_ID.asteroid.beats.map((beat) => beat.at);
    assert.deepEqual(asteroid, [7.0, 12.3, 16.3, 21.6, 25.6, 30.9, 34.9, 40.2, 44.2, 49.5, 53.5]);
    const films = readFileSync(join(here, "./films.ts"), "utf8");
    assert.doesNotMatch(films, /id: "asteroid"[\s\S]{0,400}prepareHoldBeats/);
    const rail = readFileSync(join(here, "./pcg-rail.ts"), "utf8");
    assert.match(rail, /Asteroid HOLD/);
    assert.doesNotMatch(rail, /prepareHoldBeats/);
  });
});

describe("PCG rail 2 — enter-ready glow (walk vs enter pulse)", () => {
  it("walk arm pulses walk; enter arm pulses enter; stay is dark", () => {
    assert.equal(enterReadyGlow("walk"), "walk");
    assert.equal(enterReadyGlow("enter"), "enter");
    assert.equal(enterReadyGlow("stay"), "");
    assert.equal(enterReadyGlow(null), "");
    assert.equal(enterReadyGlow(""), "");
  });

  it("living hall paints walk vs enter pulse on the door overlay", () => {
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const css = readFileSync(join(here, "../styles.css"), "utf8");
    assert.match(engine, /enterReadyGlow\(/);
    assert.match(engine, /hungDoorArm\(/);
    assert.match(engine, /data-pulse=\{pulse \|\| undefined\}/);
    assert.match(engine, /data-enter-ready=\{pulse === "enter" \? "1" : undefined\}/);
    assert.match(css, /@keyframes enter-ready-pulse/);
    assert.match(css, /@keyframes walk-door-pulse/);
    assert.match(css, /\.door-pulse-enter/);
    assert.match(css, /\.door-pulse-walk/);
  });
});

describe("PCG rail 2 — double-tap plays cache s_enter or stock bridge", () => {
  beforeEach(() => {
    mockStorage();
    dropForgeTicket();
  });

  it("hot path prefers cached s_enter, else stock bridge — never Imagine", () => {
    const s = "shotenter01";
    const key = enterSeed(s, 2, "m1", "spawn", "A");
    assert.equal(playEnterHot(key), STOCK_ENTER_BRIDGE);
    assert.equal(playEnterHot(key, "/films/forge-forest.mp4"), "/films/forge-forest.mp4");
    clipCachePut(key, "https://imgen.x.ai/vid/s-enter.mp4", "enter");
    assert.equal(playEnterHot(key, "/ui/citadel.mp4?v=aaa"), "https://imgen.x.ai/vid/s-enter.mp4");
    assert.equal(stockEnterBridge(""), STOCK_ENTER_BRIDGE);
    assert.equal(playEnterHot(key, "blob:http://localhost/x"), "https://imgen.x.ai/vid/s-enter.mp4");
  });

  it("goEnter / same-door double-tap never cooks Imagine on the hot path", () => {
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const goEnter = engine.slice(engine.indexOf("async function goEnter"), engine.indexOf("function enterNext"));
    const playWalk = engine.slice(engine.indexOf("async function playWalk"), engine.indexOf("async function saveFilms"));
    assert.match(engine, /playEnterHot\(/);
    assert.match(goEnter, /playEnterHot\(/);
    assert.match(goEnter, /enter-hot|NEVER Imagine|playEnterHot/);
    assert.doesNotMatch(goEnter, /cookFilm\(|startRuneFilm\(|forgeWalkNow\(/);
    assert.match(playWalk, /mayImagine\("walk-toward-door"\)/);
    assert.doesNotMatch(playWalk, /mayImagine\("enter"\)/);
  });
});

describe("PCG rail 2 — graph commit only when clip exists", () => {
  beforeEach(() => {
    mockStorage();
    dropForgeTicket();
  });

  it("empty / blob / data URLs cannot commit; cache and stock can", () => {
    assert.equal(mayCommitEnterGraph(""), false);
    assert.equal(mayCommitEnterGraph(null), false);
    assert.equal(mayCommitEnterGraph("blob:http://localhost/x"), false);
    assert.equal(mayCommitEnterGraph("data:video/mp4;base64,aaa"), false);
    assert.equal(mayCommitEnterGraph(STOCK_ENTER_BRIDGE), true);
    assert.equal(mayCommitEnterGraph("/films/forge-canyon.mp4"), true);
    const key = enterSeed("sgraph01", 1, "m2", "spawn", "B");
    clipCachePut(key, "https://imgen.x.ai/vid/enter-b.mp4", "enter");
    assert.equal(mayCommitEnterGraph(playEnterHot(key)), true);
  });

  it("engine commits enter→spawn only behind mayCommitEnterGraph", () => {
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const cookWalks = engine.slice(engine.indexOf("async function cookWalks"), engine.indexOf("function packStill"));
    const cookEnter = engine.slice(engine.indexOf("async function cookEnter"), engine.indexOf("async function cookRefs"));
    const goEnter = engine.slice(engine.indexOf("async function goEnter"), engine.indexOf("function enterNext"));
    assert.match(cookWalks, /mayCommitEnterGraph\(/);
    assert.match(cookEnter, /mayCommitEnterGraph\(/);
    assert.match(goEnter, /mayCommitEnterGraph\(/);
  });
});

describe("PCG rail 2 — paid forge / ticket only on explicit confirm", () => {
  beforeEach(() => {
    dropForgeTicket();
  });

  it("no ticket → no paid Imagine; confirm ticket matches the job only", () => {
    assert.equal(mayPaidImagine("plate"), false);
    assert.equal(mayPaidImagine("enter"), false);
    assert.equal(mayPaidImagine("forge"), false);
    const plate = confirmForgeTicket("plate");
    assert.equal(peekForgeTicket()?.job, "plate");
    assert.equal(mayPaidImagine("plate"), true);
    assert.equal(mayPaidImagine("plate", plate), true);
    assert.equal(mayPaidImagine("enter"), false);
    assert.equal(mayPaidImagine("forge", plate), false);
    assert.equal(takeForgeTicket("enter"), null);
    assert.equal(takeForgeTicket("plate")?.job, "plate");
    assert.equal(peekForgeTicket(), null);
    assert.equal(mayPaidImagine("plate"), false);
  });

  it("approach / speculate / enter-hot never spend even with a ticket", () => {
    confirmForgeTicket("enter");
    assert.equal(mayPaidImagine("approach"), false);
    assert.equal(mayPaidImagine("speculate"), false);
    assert.equal(mayPaidImagine("enter-hot"), false);
    assert.equal(mayPaidImagine("walk-toward-door"), false);
    assert.equal(mayPaidImagine("enter"), true);
  });

  it("explicit confirm is forge() / cook-studio double-tap — never approach", () => {
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const studio = readFileSync(join(here, "../components/cook-studio.tsx"), "utf8");
    const forge = engine.slice(engine.indexOf("function forge(secs"), engine.indexOf("function pickSecs"));
    const prefetch = engine.slice(engine.indexOf("function prefetchFrom"), engine.indexOf("function notePaint"));
    const quiet = engine.slice(engine.indexOf("async function cookRoomQuiet"), engine.indexOf("function enterLivingRoom"));
    const playWalk = engine.slice(engine.indexOf("async function playWalk"), engine.indexOf("async function saveFilms"));
    const cookWalks = engine.slice(engine.indexOf("async function cookWalks"), engine.indexOf("function packStill"));
    const cookEnter = engine.slice(engine.indexOf("async function cookEnter"), engine.indexOf("async function cookRefs"));
    assert.match(forge, /confirmForgeTicket\("enter"\)/);
    assert.match(forge, /confirmForgeTicket\("forge"\)/);
    assert.match(studio, /confirmForgeTicket\("plate"\)/);
    assert.match(studio, /mayPaidImagine\("plate"\)/);
    assert.doesNotMatch(prefetch, /confirmForgeTicket\(/);
    assert.doesNotMatch(quiet, /confirmForgeTicket\(/);
    assert.doesNotMatch(playWalk, /confirmForgeTicket\(/);
    assert.match(cookWalks, /mayPaidImagine\("enter"\)/);
    assert.match(cookEnter, /mayPaidImagine\("enter"\)/);
    assert.match(playWalk, /mayPaidImagine\("approach"\)|mayImagine\("walk-toward-door"\)/);
  });
});

describe("PCG rail 2 — Asteroid HOLD", () => {
  it("Asteroid chart HOLD — rail 2 does not retouch asteroid beats", () => {
    const asteroid = FILM_BY_ID.asteroid.beats.map((beat) => beat.at);
    assert.deepEqual(asteroid, [7.0, 12.3, 16.3, 21.6, 25.6, 30.9, 34.9, 40.2, 44.2, 49.5, 53.5]);
    const films = readFileSync(join(here, "./films.ts"), "utf8");
    assert.doesNotMatch(films, /id: "asteroid"[\s\S]{0,400}prepareHoldBeats/);
    const rail = readFileSync(join(here, "./pcg-rail.ts"), "utf8");
    assert.match(rail, /Asteroid HOLD/);
    assert.match(rail, /PCG rail 2/);
    assert.doesNotMatch(rail, /prepareHoldBeats/);
  });
});
