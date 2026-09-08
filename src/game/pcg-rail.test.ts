import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FILM_BY_ID } from "./films.ts";
import {
  beginRunSeed,
  clearStockBridges,
  clipCacheFailReasons,
  clipCacheGet,
  clipCacheGetPass,
  clipCacheIsPinned,
  clipCachePin,
  clipCachePut,
  clipCacheSnapshot,
  clipCacheTestCaps,
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
  mayPeak,
  mayRelic,
  mergeClipCache,
  newRunSeed,
  packClipCache,
  pcgHash,
  PEAK_MOMENTUM_TAU,
  picturePhase,
  picturePhase01,
  pictureTimeMs,
  PICTURE_CALM_MS,
  PICTURE_PEAK_END_MS,
  PICTURE_PEAK_MS,
  pinKeepFromSession,
  plateSeed,
  RAILS_VERSION,
  readRunSeed,
  registerStockBridge,
  richClipKey,
  replaceStockEnter,
  resolveEnterHotPath,
  reuseClipBeforeRecook,
  stockBridge,
} from "./pcg-rail.ts";
import {
  deadEndHold,
  growPins,
  hallDoorPins,
  illegalReasons,
  isDeadEndPin,
  isFrontDoorPin,
  isLegalPins,
  isRelicPin,
  legendaryRelicPin,
  pinsForCitadel,
  realizeCitadel,
  RELIC_MOMENTUM_TAU,
  rewriteOnEnter,
} from "./pcg-grammar.ts";
import { compileCitadel } from "./rune.ts";

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

describe("PCG rich clip key + PASS cache + LRU pin", () => {
  beforeEach(() => {
    mockStorage();
    clipCacheTestCaps(null);
  });

  it("same rich key hits — same parts reuse, different act misses", () => {
    const parts = {
      railsVersion: RAILS_VERSION,
      runSeed: "srichkey01aa",
      plateIndex: 2,
      act: "walk-A",
      biomeFrom: "forest",
      biomeTo: "forest",
      chunkFromId: "chunk-forest",
      chunkToId: "chunk-forest",
      role: "lean-L",
      slots: { trail: "thin", fork: "none" },
      cues: [{ side: "A", on: 2, off: 2.8, kind: "walk" }],
    };
    const a = richClipKey(parts);
    const b = richClipKey({ ...parts, slots: { fork: "none", trail: "thin" }, cues: [{ kind: "walk", side: "A", on: 2, off: 2.8 }] });
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{16}$/);
    assert.notEqual(richClipKey({ ...parts, act: "walk-B" }), a);
    assert.notEqual(richClipKey({ ...parts, plateIndex: 3 }), a);
    clipCachePut(parts, "/films/forge-forest.mp4", "plate", { smoke: "PASS" }, {
      stillStart: "/films/cook-forest.jpg",
      stillEnd: "/films/cook-forest.jpg",
      cues: parts.cues,
      bytes: 1200,
    });
    assert.equal(clipCacheGet(parts), "/films/forge-forest.mp4");
    assert.equal(clipCacheGet(a), "/films/forge-forest.mp4");
    assert.equal(reuseClipBeforeRecook(parts), "/films/forge-forest.mp4");
    const row = clipCacheGetPass(parts);
    assert.equal(row?.smoke, "PASS");
    assert.equal(row?.railsVersion, "bolt-1");
    assert.equal(row?.stillStart, "/films/cook-forest.jpg");
    assert.equal(row?.bytes, 1200);
    assert.equal(clipCacheGet({ ...parts, act: "walk-B" }), "");
  });

  it("FAIL is not a playable cache — optional reason cache only", () => {
    const key = richClipKey({ runSeed: "sfailcache01", act: "enter", biomeFrom: "forest", biomeTo: "canyon" });
    assert.equal(clipCachePut(key, "/films/forge-forest.mp4", "enter", { smoke: "FAIL", reasons: ["cue-window"] }), "");
    assert.equal(clipCacheGet(key), "");
    assert.equal(clipCacheGetPass(key), null);
    assert.deepEqual(clipCacheFailReasons(key), ["cue-window"]);
  });

  it("pinned Keep edge / hung / Hall′ still is never LRU-evicted", () => {
    clipCacheTestCaps({ count: 3 });
    clipCachePut("keep-edge", "/films/forge-asteroid.mp4", "enter", { smoke: "PASS" }, { bytes: 80 });
    clipCachePin("keep-edge");
    pinKeepFromSession(
      {
        bank: [{ key: "keep-edge", url: "/films/forge-asteroid.mp4" }],
        start: "/films/cook-asteroid.jpg",
        halls: [{ n: 2, still: "/films/cook-asteroid.jpg", start: "/films/cook-asteroid.jpg" } as never],
      },
      [{ id: "hung-1", still: "/films/cook-forest.jpg", playlist: ["/films/forge-forest.mp4"] }],
    );
    clipCachePut("hung-clip", "/films/forge-forest.mp4", "plate", { smoke: "PASS" }, {
      stillStart: "/films/cook-forest.jpg",
      pin: true,
    });
    clipCachePut("hall-prime", "/ui/citadel.mp4", "plate", { smoke: "PASS" }, {
      stillStart: "/films/cook-asteroid.jpg",
    });
    pinKeepFromSession({
      start: "/films/cook-asteroid.jpg",
      halls: [{ still: "/films/cook-asteroid.jpg" }],
    });
    assert.equal(clipCacheIsPinned("keep-edge"), true);
    for (let i = 0; i < 12; i++) {
      clipCachePut(`ephem-${i}`, `/ui/forge-${i}.mp4`.replace(`-${i}`, ""), "plate", { smoke: "PASS" }, { bytes: 40 });
    }
    assert.equal(clipCacheGet("keep-edge"), "/films/forge-asteroid.mp4");
    assert.equal(clipCacheGet("hung-clip"), "/films/forge-forest.mp4");
    assert.equal(clipCacheGet("hall-prime"), "/ui/citadel.mp4");
    clipCacheTestCaps(null);
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
    assert.match(session, /pinKeepFromSession\(/);
    assert.match(session, /scrubKeepSecrets\(/);
    assert.match(cloud, /seed: keepSeed\(session\.seed\)/);
    assert.match(cloud, /clips: packClipCache\(session\.clips\)/);
    assert.match(cloud, /pinKeepFromSession\(/);
    assert.match(cloud, /scrubKeepSecrets\(/);
    assert.match(cloud, /encodeKeepShare\(/);
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

describe("PCG rail 3 — graph grammar pins", () => {
  it("Hall → Door A + Door B — never one gate; same s is stable", () => {
    const s = "sgrammarhall01";
    const a = hallDoorPins(s, 1);
    const b = growPins(s, 0, 1);
    assert.equal(a.length, 2);
    assert.equal(b.length, 2);
    assert.deepEqual(a.map((p) => p.id), ["m1", "m2"]);
    assert.equal(a[0]?.kind, "door-a");
    assert.equal(a[1]?.kind, "door-b");
    assert.equal(a[0]?.morph, false);
    assert.equal(a[1]?.morph, false);
    assert.ok(a[0]!.x < 0.34 && a[1]!.x > 0.66);
    assert.deepEqual(growPins(s, 0, 1), b);
    assert.equal(isLegalPins(b, { momentum: 0 }), true);
    assert.deepEqual(illegalReasons([{ id: "m1", name: "teal door", x: 0.22, y: 0.48 }], { momentum: 0 }), ["one-gate"]);
  });

  it("legendary relic pin only when momentum ≥ τ — extra pin, not a third front door", () => {
    const s = "srelicgate01";
    assert.ok(RELIC_MOMENTUM_TAU > 0);
    assert.equal(legendaryRelicPin(s, 0, 0), null);
    assert.equal(legendaryRelicPin(s, 0, RELIC_MOMENTUM_TAU - 0.01), null);
    assert.equal(growPins(s, 0, 2).some(isRelicPin), false);
    assert.equal(growPins(s, 0.3, 2).some(isRelicPin), false);
    const low = growPins(s, RELIC_MOMENTUM_TAU - 0.2, 2);
    assert.equal(low.some(isRelicPin), false);
    assert.equal(low.length, 2);
    assert.ok(!illegalReasons(low, { momentum: 0 }).includes("relic-without-momentum"));
    const high = growPins(s, RELIC_MOMENTUM_TAU, 2);
    const over = growPins(s, 1.4, 2);
    assert.equal(high.some(isRelicPin), true);
    assert.equal(over.some(isRelicPin), true);
    assert.equal(high.length, 3);
    const relic = high.find(isRelicPin)!;
    assert.equal(relic.id, "relic");
    assert.equal(relic.kind, "relic");
    assert.equal(relic.morph, false);
    assert.equal(isFrontDoorPin(relic), false);
    assert.ok(relic.x > 0.38 && relic.x < 0.62);
    assert.equal(high.some((p) => p.id === "m3"), false);
    assert.equal(high.filter(isFrontDoorPin).length, 2);
    assert.deepEqual(illegalReasons(high, { momentum: 0 }), ["relic-without-momentum"]);
    assert.equal(isLegalPins(high, { momentum: RELIC_MOMENTUM_TAU }), true);
    assert.deepEqual(growPins(s, 1, 2), growPins(s, 1, 2));
    assert.notDeepEqual(growPins(s, 1, 2).find(isRelicPin), growPins("srelicgate99", 1, 2).find(isRelicPin));
  });

  it("Hang/Load pins win — grammar fills a missing door and never drops a hung A/B", () => {
    const hung = [
      { id: "m1", name: "hung A", x: 0.2, y: 0.5 },
      { id: "m2", name: "hung B", x: 0.8, y: 0.5 },
    ];
    const kept = pinsForCitadel({ s: "shungkeep01", i: 1, momentum: 1, existing: hung, hung: true });
    assert.equal(kept.find((p) => p.id === "m1")?.name, "hung A");
    assert.equal(kept.find((p) => p.id === "m2")?.name, "hung B");
    assert.equal(kept.find((p) => p.id === "m1")?.x, 0.2);
    assert.equal(kept.find((p) => p.id === "m2")?.x, 0.8);
    const relic = kept.find(isRelicPin);
    assert.ok(relic, "high momentum may add relic without moving hung doors");
    assert.equal(relic?.id, "relic");
    const one = pinsForCitadel({
      s: "sfilldoor01",
      i: 1,
      momentum: 0,
      existing: [{ id: "m1", name: "only A", x: 0.21, y: 0.47 }],
      hung: true,
    });
    assert.ok(one.some((p) => p.id === "m1"));
    assert.ok(one.some((p) => p.id === "m2"));
    assert.equal(one.filter(isFrontDoorPin).length, 2);
    const fresh = pinsForCitadel({ s: "sfreshhall01", i: 3, momentum: 0 });
    assert.deepEqual(fresh.map((p) => p.id), ["m1", "m2"]);
  });

  it("Room —enter→ Hall′ needs a clip; biome changes only on enter; dead-end does not rewrite", () => {
    const bare = rewriteOnEnter({ entered: true, fromBiome: "forest", toBiome: "canyon" });
    assert.equal(bare.act, "idle");
    assert.equal(bare.rewrite, "hold");
    assert.equal(bare.commit, "hold");
    assert.equal(bare.imagine, false);
    assert.equal(bare.biome, "forest");
    const noEnter = rewriteOnEnter({
      clip: "/films/enter-a.mp4",
      entered: false,
      fromBiome: "forest",
      toBiome: "canyon",
    });
    assert.equal(noEnter.biome, "forest");
    assert.equal(noEnter.rewrite, "hold");
    assert.deepEqual(illegalReasons(growPins("sbiome01", 0), { biomeChanged: true, entered: false }), ["biome-without-enter"]);
    assert.equal(isLegalPins(growPins("sbiome01", 0), { biomeChanged: true, entered: true }), true);
    const pass = rewriteOnEnter({
      clip: "/films/enter-a.mp4",
      entered: true,
      fromBiome: "forest",
      toBiome: "canyon",
    });
    assert.equal(pass.act, "enter");
    assert.equal(pass.rewrite, "rewrite");
    assert.equal(pass.commit, "pass");
    assert.equal(pass.biome, "canyon");
    assert.equal(pass.imagine, false);
    const dead = rewriteOnEnter({
      clip: "/films/enter-a.mp4",
      entered: true,
      deadEnd: true,
      fromBiome: "forest",
      toBiome: "canyon",
    });
    assert.deepEqual(dead, deadEndHold("forest"));
    assert.equal(dead.act, "idle");
    assert.equal(dead.rewrite, "hold");
    assert.equal(isDeadEndPin("relic"), true);
    assert.equal(isDeadEndPin("spawn"), true);
    assert.equal(isDeadEndPin("m1"), false);
    assert.equal(mayImagine("walk-toward-door"), false);
    assert.equal(mayImagine("speculate"), false);
  });

  it("compileCitadel still realizes walks — no morph nodes", () => {
    const s = "srealize01";
    const pins = growPins(s, 1, 0);
    const graph = realizeCitadel("/films/citadel-tour.jpg", pins, 10);
    const raw = compileCitadel("/films/citadel-tour.jpg", pins, 10);
    assert.equal(graph.walks.length, raw.walks.length);
    assert.ok(graph.nodes.some((n) => n.id === "spawn"));
    assert.ok(graph.nodes.some((n) => n.id === "m1"));
    assert.ok(graph.nodes.some((n) => n.id === "m2"));
    assert.ok(graph.nodes.some((n) => n.id === "relic"));
    assert.ok(graph.walks.every((w) => w.morph === false));
    assert.ok(graph.idles.every((c) => c.morph === false));
    assert.ok(graph.laws.includes("always two doors, never one gate"));
    assert.ok(graph.walks.some((w) => w.from === "m1" && w.to === "m2"));
    assert.equal(isLegalPins(pins, { momentum: 1 }), true);
    assert.ok(illegalReasons([{ id: "m1", name: "x", x: 0.2, y: 0.5, morph: true } as never], { momentum: 0 }).includes("morph-nodes"));
  });

  it("engine Hang/Load + enter still use grammar pins and rail-2 clip before Hall′", () => {
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const goEnter = engine.slice(engine.indexOf("async function goEnter"), engine.indexOf("function enterNext"));
    const applyHall = engine.slice(engine.indexOf("function applyHall"), engine.indexOf("async function switchHall"));
    const living = engine.slice(engine.indexOf("function enterLivingRoom"), engine.indexOf("begin.current"));
    assert.match(engine, /from "@\/game\/pcg-grammar"/);
    assert.match(engine, /pinsForCitadel\(/);
    assert.match(engine, /rewriteOnEnter\(/);
    assert.match(engine, /compileCitadel\(/);
    assert.match(goEnter, /commitHallPrime\(/);
    assert.match(goEnter, /rewriteOnEnter\(/);
    assert.match(goEnter, /lookupEnterClip\(/);
    assert.doesNotMatch(goEnter, /cookFilm\(|startRuneFilm\(|forgeWalkNow\(/);
    assert.match(applyHall, /pinsForCitadel\(/);
    assert.match(applyHall, /hung: incomingPins\.length >= 2/);
    assert.match(living, /pinsForCitadel\(/);
    assert.match(engine, /hung: \(s\.pins\?\.length \|\| 0\) >= 2/);
    assert.match(engine, /isDeadEndPin\(/);
    const rail = readFileSync(join(here, "./pcg-rail.ts"), "utf8");
    const grammar = readFileSync(join(here, "./pcg-grammar.ts"), "utf8");
    assert.match(rail, /pcg-grammar/);
    assert.match(grammar, /Asteroid HOLD/);
    assert.match(grammar, /compileCitadel/);
    assert.doesNotMatch(grammar, /prepareHoldBeats/);
    assert.doesNotMatch(grammar, /mayImagine\("plate"\)|cookFilm\(/);
    const asteroid = FILM_BY_ID.asteroid.beats.map((beat) => beat.at);
    assert.deepEqual(asteroid, [7.0, 12.3, 16.3, 21.6, 25.6, 30.9, 34.9, 40.2, 44.2, 49.5, 53.5]);
    const seats = readFileSync(join(here, "../components/door-chat-line.tsx"), "utf8");
    assert.doesNotMatch(seats, /pcg-grammar|growPins|relic pin/);
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    assert.match(readme, /PCG rail 3/);
    assert.match(readme, /graph, not a map/);
  });
});

describe("PCG picture-time — film strip, never wall clock", () => {
  it("pictureTimeMs sums played plate durations only", () => {
    assert.equal(pictureTimeMs([]), 0);
    assert.equal(pictureTimeMs([12000, 12000, 12000]), 36000);
    assert.equal(pictureTimeMs([{ durationMs: 10000 }, { durationMs: 15000 }]), 25000);
    assert.equal(pictureTimeMs([8000, null, { durationMs: 0 }, { durationMs: -3 }, undefined]), 8000);
    const paused = [12000, 12000];
    assert.equal(pictureTimeMs(paused), pictureTimeMs(paused));
    assert.ok(pictureTimeMs([...paused, 12000]) > pictureTimeMs(paused));
  });

  it("phase ignores wall clock — pause the film, world does not progress", () => {
    const plates = [12000, 12000, 12000];
    const realNow = Date.now;
    try {
      const t1 = pictureTimeMs(plates);
      const p1 = picturePhase(t1, 0.9);
      const s1 = picturePhase01(t1, 0.9);
      Date.now = () => 9_999_999_999_000;
      const t2 = pictureTimeMs(plates);
      const p2 = picturePhase(t2, 0.9);
      const s2 = picturePhase01(t2, 0.9);
      const peakLater = mayPeak(t2, 0.9);
      assert.equal(t1, 36000);
      assert.equal(t1, t2);
      assert.equal(p1, p2);
      assert.equal(s1, s2);
      assert.equal(p1, "lean");
      assert.equal(peakLater, false);
      assert.equal(mayPeak(t1, 0.9), mayPeak(t2, 0.9));
    } finally {
      Date.now = realNow;
    }
  });

  it("peak only if phase window AND m high — quiet never peaks", () => {
    assert.equal(PEAK_MOMENTUM_TAU, RELIC_MOMENTUM_TAU);
    assert.equal(picturePhase(0, 1), "calm");
    assert.equal(picturePhase(PICTURE_CALM_MS - 1, 1), "calm");
    assert.equal(mayPeak(PICTURE_CALM_MS, 1), false);
    assert.equal(mayPeak(4000, 1), false);
    assert.equal(mayRelic(4000, 1), false);
    assert.equal(picturePhase(20_000, 0.9), "lean");
    assert.equal(mayPeak(PICTURE_PEAK_MS, 0.2), false);
    assert.equal(mayPeak(PICTURE_PEAK_MS, PEAK_MOMENTUM_TAU), true);
    assert.equal(mayRelic(50_000, 1), true);
    assert.equal(picturePhase(50_000, 1), "peak");
    assert.equal(picturePhase(50_000, 0.2), "lean");
    assert.equal(picturePhase(PICTURE_PEAK_END_MS, 1), "recede");
    assert.equal(mayPeak(PICTURE_PEAK_END_MS, 1), false);
  });

  it("relic pin refuses quiet picture-time even when m is high", () => {
    const s = "spicturetime01";
    assert.ok(legendaryRelicPin(s, 0, 1));
    assert.equal(legendaryRelicPin(s, 0, 1, 4000), null);
    assert.equal(growPins(s, 1, 0, 4000).some(isRelicPin), false);
    assert.equal(growPins(s, 1, 0, 50_000).some(isRelicPin), true);
    const pinned = pinsForCitadel({ s, i: 0, momentum: 1, pictureTimeMs: 4000 });
    assert.equal(pinned.some(isRelicPin), false);
    const late = pinsForCitadel({ s, i: 0, momentum: 1, pictureTimeMs: 50_000 });
    assert.equal(late.some(isRelicPin), true);
  });

  it("helper source and README name the anti-3D laws; Asteroid HOLD; seats untouched", () => {
    const rail = readFileSync(join(here, "./pcg-rail.ts"), "utf8");
    const clock = rail.slice(rail.indexOf("/* ── Picture-time clock"));
    assert.match(clock, /export function pictureTimeMs/);
    assert.match(clock, /export function picturePhase/);
    assert.match(clock, /export function mayPeak/);
    assert.doesNotMatch(clock, /Date\.now\s*\(|setTimeout\s*\(/);
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    assert.match(readme, /strip of films, not a volume you stand in/);
    assert.match(readme, /Voxel WFC \/ marching cubes \/ navmesh/);
    assert.match(readme, /Unconstrained diffusion worlds/);
    assert.match(readme, /Wall-clock spawners/);
    assert.match(readme, /Perlin height \/ caves/);
    assert.match(readme, /Poisson disk props/);
    assert.match(readme, /LOD streaming cells/);
    assert.match(readme, /Physics \/ ragdoll \/ IK/);
    assert.match(readme, /Billboard HUD/);
    assert.match(readme, /Minimap \/ fog of war/);
    assert.match(readme, /Infinite terrain chunking/);
    assert.match(readme, /WFC on time cells/);
    assert.match(readme, /Slot grammar \+ last frame \+ dest still \+ linter/);
    assert.match(readme, /Picture-time = Σ played plate durations/);
    assert.match(readme, /Prefab chunks \/ Hang/);
    assert.match(readme, /put prop at `\(x,y,z\)`/);
    assert.match(readme, /change leg count/);
    assert.match(readme, /Pause the film/);
    assert.match(readme, /graph \+ clips/);
    assert.match(readme, /Camera is a sentence/);
    assert.match(readme, /docs\/pcg-anti-3d\.md/);
    assert.match(readme, /## PCG role-WFC/);
    assert.match(readme, /## PCG chunk library/);
    assert.match(readme, /## PCG anti-3D \/ film-strip laws/);
    assert.match(readme, /## PCG Keep share \/ rich clip cache/);
    assert.match(readme, /never auto-bill a visitor/);
    const doc = readFileSync(join(here, "../../docs/pcg-anti-3d.md"), "utf8");
    assert.match(doc, /strip of films, not a volume you stand in/);
    assert.match(doc, /pictureTimeMs/);
    assert.match(doc, /Asteroid HOLD/);
    const asteroid = FILM_BY_ID.asteroid.beats.map((beat) => beat.at);
    assert.deepEqual(asteroid, [7.0, 12.3, 16.3, 21.6, 25.6, 30.9, 34.9, 40.2, 44.2, 49.5, 53.5]);
    const seats = readFileSync(join(here, "../components/door-chat-line.tsx"), "utf8");
    assert.doesNotMatch(seats, /pictureTimeMs|pcg-anti-3d|mayPeak/);
    assert.doesNotMatch(rail, /prepareHoldBeats/);
  });
});
