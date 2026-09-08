import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FILM_BY_ID } from "./films.ts";
import {
  beginRunSeed,
  clearStockBridges,
  clipCacheGet,
  clipCachePut,
  clipCacheSnapshot,
  commitHallPrime,
  doorGlowState,
  enterCacheKey,
  enterSeed,
  hydrateClipCache,
  isEnterReady,
  isRunSeed,
  isWalkReady,
  lookupEnterClip,
  mayImagine,
  mayPaidEnterCook,
  mergeClipCache,
  newRunSeed,
  packClipCache,
  pcgHash,
  plateSeed,
  readRunSeed,
  registerStockBridge,
  replaceStockEnter,
  resolveEnterHotPath,
  reuseClipBeforeRecook,
  stockBridge,
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

describe("PCG rail 2 — door glow + enter-ready gating", () => {
  beforeEach(() => {
    mockStorage();
    clearStockBridges();
  });

  it("walk-ready vs enter-ready (second pulse only when s_enter or stock exists)", () => {
    const s = "sglowready01";
    const look = { s, i: 1, from: "m1", to: "spawn", door: "A" };
    assert.equal(isWalkReady("spawn", "m1"), true);
    assert.equal(isWalkReady("spawn", "m2"), true);
    assert.equal(isWalkReady("m1", "m1"), false);
    assert.equal(isWalkReady("m1", "m2"), true);
    assert.equal(isEnterReady(look), false);
    assert.equal(doorGlowState({ here: "spawn", door: "m1" }), "walk-ready");
    assert.equal(doorGlowState({ here: "m1", door: "m1" }), "idle");
    assert.equal(doorGlowState({ here: "m1", door: "m2" }), "walk-ready");
    assert.equal(doorGlowState({ here: "m1", door: "m1", hung: true }), "enter-ready");
    clipCachePut(enterSeed(s, 1, "m1", "spawn", "A"), "/films/enter-cached.mp4", "enter");
    assert.equal(isEnterReady(look), true);
    assert.equal(doorGlowState({ here: "m1", door: "m1", enterReady: true }), "enter-ready");
    assert.equal(doorGlowState({ here: "spawn", door: "m1", enterReady: true }), "walk-ready");
    clearStockBridges();
    mockStorage();
    registerStockBridge("m2", "spawn", "/ui/citadel.mp4", "B");
    assert.equal(stockBridge("m2", "spawn", "B"), "/ui/citadel.mp4");
    assert.equal(isEnterReady({ s, i: 1, from: "m2", to: "spawn", door: "B" }), true);
    assert.equal(doorGlowState({ here: "m2", door: "m2", enterReady: true }), "enter-ready");
  });

  it("s_enter = H(s,i,enter,from,to,door) is the enter cache key", () => {
    const s = "senterkeyrail2";
    const key = enterCacheKey({ s, i: 3, from: "m1", to: "spawn", door: "A" });
    assert.equal(key, enterSeed(s, 3, "m1", "spawn", "A"));
    assert.equal(key, pcgHash([s, 3, "enter", "m1", "spawn", "A"]));
    clipCachePut(key, "https://imgen.x.ai/vid/s-enter.mp4", "enter");
    const hit = lookupEnterClip({ s, i: 3, from: "m1", to: "spawn", door: "A" });
    assert.equal(hit.source, "cache");
    assert.equal(hit.url, "https://imgen.x.ai/vid/s-enter.mp4");
    assert.equal(hit.key, key);
    assert.equal(lookupEnterClip({ s, i: 3, from: "m1", to: "spawn", door: "B" }).source, "");
  });
});

describe("PCG rail 2 — double-tap never Imagines when unwired / uncached", () => {
  beforeEach(() => {
    mockStorage();
    clearStockBridges();
  });

  it("uncached + no stock → idle, imagine false, Hall′ HOLD", () => {
    const hot = resolveEnterHotPath({ s: "snotready", i: 0, from: "m1", to: "spawn", door: "A" });
    assert.equal(hot.act, "idle");
    assert.equal(hot.url, "");
    assert.equal(hot.imagine, false);
    assert.equal(hot.commit, "hold");
    assert.equal(mayImagine("enter-hot"), false);
    assert.equal(mayImagine("walk-toward-door"), false);
    assert.equal(mayImagine("speculate"), false);
  });

  it("cache hit or stock plays enter — still never Imagine; Hall′ PASS only with clip", () => {
    const s = "scachedenter2";
    const key = enterSeed(s, 2, "m1", "spawn", "A");
    clipCachePut(key, "/films/enter-a.mp4", "enter");
    const cached = resolveEnterHotPath({ s, i: 2, from: "m1", to: "spawn", door: "A" });
    assert.equal(cached.act, "enter");
    assert.equal(cached.source, "cache");
    assert.equal(cached.url, "/films/enter-a.mp4");
    assert.equal(cached.imagine, false);
    assert.equal(cached.commit, "pass");
    registerStockBridge("m2", "spawn", "/ui/citadel.mp4", "B");
    const stock = resolveEnterHotPath({ s, i: 2, from: "m2", to: "spawn", door: "B" });
    assert.equal(stock.act, "enter");
    assert.equal(stock.source, "stock");
    assert.equal(stock.imagine, false);
    assert.equal(commitHallPrime(""), "hold");
    assert.equal(commitHallPrime("blob:http://localhost/x"), "hold");
    assert.equal(commitHallPrime("/ui/citadel.mp4"), "pass");
  });

  it("paid enter cook is confirm / Forge / ticket only — never approach speculation", () => {
    assert.equal(mayPaidEnterCook("confirm"), true);
    assert.equal(mayPaidEnterCook("forge"), true);
    assert.equal(mayPaidEnterCook("ticket"), true);
    assert.equal(mayImagine("enter-confirm"), true);
    assert.equal(mayImagine("enter"), true);
    assert.equal(mayImagine("enter-hot"), false);
    const key = enterSeed("sconfirm1", 0, "m1", "spawn", "A");
    assert.equal(replaceStockEnter(key, "/films/enter-paid.mp4", "confirm"), "/films/enter-paid.mp4");
    assert.equal(clipCacheGet(key), "/films/enter-paid.mp4");
  });

  it("engine double-tap / goEnter never calls Imagine on the hot path", () => {
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const goTo = engine.slice(engine.indexOf("function goTo"), engine.indexOf("function drainQueue"));
    const playWalk = engine.slice(engine.indexOf("async function playWalk"), engine.indexOf("async function saveFilms"));
    const goEnter = engine.slice(engine.indexOf("async function goEnter"), engine.indexOf("function enterNext"));
    assert.match(engine, /resolveEnterHotPath\(/);
    assert.match(engine, /lookupEnterClip\(/);
    assert.match(engine, /enterSeed\(/);
    assert.match(engine, /mayImagine\("enter-hot"\)/);
    assert.match(engine, /commitHallPrime\(/);
    assert.match(engine, /mayPaidEnterCook\("confirm"\)/);
    assert.match(goTo, /resolveEnterHotPath\(/);
    assert.match(goTo, /hot\.act === "enter"/);
    assert.doesNotMatch(goTo, /cookFilm\(|startRuneFilm\(|forgeWalkNow\(/);
    assert.match(playWalk, /resolveEnterHotPath\(/);
    const playHead = playWalk.slice(0, playWalk.indexOf("walkingTo.current = id"));
    assert.doesNotMatch(playHead, /cookFilm\(|startRuneFilm\(/);
    assert.match(goEnter, /mayImagine\("enter-hot"\)/);
    assert.match(goEnter, /lookupEnterClip\(/);
    assert.match(goEnter, /commitHallPrime\(/);
    assert.doesNotMatch(goEnter, /cookFilm\(|startRuneFilm\(|forgeWalkNow\(/);
    assert.match(engine, /data-glow=/);
    assert.match(engine, /door-glow-enter-/);
    const rail = readFileSync(join(here, "./pcg-rail.ts"), "utf8");
    assert.match(rail, /Stock enter-bridge library hook/);
    assert.match(rail, /refuse enter, never spin/);
    assert.match(rail, /Asteroid HOLD/);
    assert.doesNotMatch(rail, /prepareHoldBeats/);
    const asteroid = FILM_BY_ID.asteroid.beats.map((beat) => beat.at);
    assert.deepEqual(asteroid, [7.0, 12.3, 16.3, 21.6, 25.6, 30.9, 34.9, 40.2, 44.2, 49.5, 53.5]);
    const seats = readFileSync(join(here, "../components/door-chat-line.tsx"), "utf8");
    assert.doesNotMatch(seats, /registerStockBridge|enter-ready|pcg-rail/);
  });
});
