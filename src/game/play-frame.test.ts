import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BOLT_BODY, BOLT_FACE, TOUR_PLATE } from "./rune.ts";
import { HALL_LOOP, HALL_STILL } from "./stock-room.ts";
import { clipWarmSrc, playableClipSrc, sameClipSrc, warmClip, warmedClip } from "./play-clip.ts";
import {
  arrivalBreathUrl,
  arrivalEndStill,
  breathSeamSameClip,
  breathTapWalksNow,
  cookHasWalks,
  doorArrivalNeedsCook,
  filmTrayStillKeep,
  hallStillOf,
  holdBreathUrl,
  isBoltSilhouette,
  isHallPlayStill,
  isNodeArrivalBreath,
  isNodeIdleKey,
  isStockHallClip,
  keepHeldBreath,
  livingPlayFrame,
  mergeBankClips,
  packIdentityStill,
  pictureNeverStops,
  playNodeId,
  preferHalls,
  sealedWalkPlayable,
  playCoverStill,
  playStillOrHall,
  seedMayBankIdle,
  doorBreathPlayable,
  walkClipHoldsSeed,
  walkClips,
  walkLastFrameSeed,
} from "./play-frame.ts";

const HALL = TOUR_PLATE;
const WALK = "https://imgen.example/hall-walk.mp4";
const BREATH = "https://imgen.example/hall-breath.mp4";
const COOKED_HALL = "https://imgen.example/hall-still.jpg";
const PLAY_WALK = playableClipSrc(WALK);
const PLAY_BREATH = playableClipSrc(BREATH);

describe("play frame after cook", () => {
  it("playableClipSrc proxies Imagine mp4s and keeps same-origin stock", () => {
    assert.equal(playableClipSrc("/films/forge-asteroid.mp4"), "/films/forge-asteroid.mp4");
    assert.equal(playableClipSrc("/ui/citadel.mp4?v=aaa"), "/ui/citadel.mp4?v=aaa");
    assert.equal(playableClipSrc(BOLT_BODY), "");
    const proxied = playableClipSrc("https://imgen.x.ai/vid/walk.mp4?tok=1");
    assert.match(proxied, /^\/api\/clip\?u=/);
    assert.doesNotMatch(proxied, /^https:\/\/imgen/);
    assert.equal(clipWarmSrc(WALK), PLAY_WALK);
    assert.equal(sameClipSrc(WALK, PLAY_WALK), true);
    assert.equal(sameClipSrc(WALK, BREATH), false);
    assert.equal(warmClip(""), null);
    assert.equal(warmedClip(WALK), null);
  });

  it("warmClip keeps one hidden preload=auto video and HTTP-caches /api/clip", async () => {
    const made: Array<{ preload: string; src: string; loadCalls: number; getAttribute: (k: string) => string | null }> = [];
    const fetches: Array<{ url: string; cache?: RequestCache }> = [];
    const fakeDoc = {
      createElement(tag: string) {
        if (tag !== "video") return { tagName: tag };
        const attrs: Record<string, string> = {};
        const el = {
          muted: false,
          defaultMuted: false,
          playsInline: false,
          preload: "",
          src: "",
          currentSrc: "",
          readyState: 0,
          style: { cssText: "" },
          loadCalls: 0,
          setAttribute(k: string, v: string) {
            attrs[k] = v;
          },
          getAttribute(k: string) {
            return k === "src" ? el.src || null : attrs[k] ?? null;
          },
          load() {
            el.loadCalls += 1;
            el.readyState = 2;
          },
        };
        made.push(el);
        return el;
      },
      body: { appendChild() {} },
      documentElement: {},
    };
    const prevDoc = globalThis.document;
    const prevFetch = globalThis.fetch;
    Object.defineProperty(globalThis, "document", { value: fakeDoc, configurable: true, writable: true });
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetches.push({ url: String(input), cache: init?.cache });
      return new Response(null, { status: 200 });
    }) as typeof fetch;
    try {
      const src = playableClipSrc("https://imgen.x.ai/vid/bolt-stride.mp4?sig=1");
      const a = warmClip(src);
      const b = warmClip(src);
      assert.equal(made.length, 1, "one persistent hidden video");
      assert.equal(a, b);
      assert.equal(a?.preload, "auto");
      assert.equal(a?.getAttribute("data-warm-clip"), "1");
      assert.equal(a?.src, src);
      assert.equal((a as { loadCalls?: number } | null)?.loadCalls, 1);
    assert.equal(warmedClip(src), a);
    assert.equal(warmedClip("/ui/other.mp4"), null);
    assert.ok(fetches.some((f) => f.url === src && f.cache === "force-cache"));
    const clip = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "./play-clip.ts"), "utf8");
    assert.match(clip, /HTTP cache only/);
    assert.match(clip, /must not skip that load/);
    } finally {
      Object.defineProperty(globalThis, "document", { value: prevDoc, configurable: true, writable: true });
      globalThis.fetch = prevFetch;
    }
  });

  it("treats sealed identity refs as Bolt silhouettes, not hall plates", () => {
    assert.equal(isBoltSilhouette(BOLT_BODY), true);
    assert.equal(isBoltSilhouette(BOLT_FACE), true);
    assert.equal(isBoltSilhouette("/refs/bolt.jpg"), true);
    assert.equal(isBoltSilhouette("/refs/bolt-white.jpg?v=1"), true);
    assert.equal(isBoltSilhouette(HALL), false);
    assert.equal(isBoltSilhouette(COOKED_HALL), false);
    assert.equal(isBoltSilhouette(WALK), false);
    assert.equal(isHallPlayStill(HALL), true);
    assert.equal(isHallPlayStill(HALL_STILL), true);
    assert.equal(isHallPlayStill(BOLT_BODY), false);
    assert.equal(isHallPlayStill(BOLT_FACE), false);
    assert.equal(isHallPlayStill("/refs/hall-doors.jpg"), false);
    assert.equal(isHallPlayStill("data:image/jpeg;base64,xxxx"), false);
  });

  it("packIdentityStill never packs place-bolt / seed onto the isolated Bolt still", () => {
    assert.equal(BOLT_BODY, "/refs/bolt-body.jpg");
    assert.equal(packIdentityStill("bolt"), BOLT_BODY);
    assert.equal(packIdentityStill("bolt-body"), BOLT_BODY);
    assert.equal(packIdentityStill("bolt-face"), BOLT_BODY);
    assert.equal(packIdentityStill("face"), BOLT_BODY);
    assert.notEqual(packIdentityStill("bolt-face"), BOLT_FACE);
    assert.notEqual(packIdentityStill("face"), BOLT_FACE);
    assert.equal(packIdentityStill("hall"), TOUR_PLATE);
    assert.equal(packIdentityStill("doors"), TOUR_PLATE);
    assert.equal(packIdentityStill("place-bolt"), null);
    assert.equal(packIdentityStill("place bolt"), null);
    assert.equal(packIdentityStill("bolt in"), null);
    assert.equal(packIdentityStill("pose-spawn"), null);
    assert.equal(packIdentityStill("seed"), null);
  });

  it("mocked cook with walk urls plays hall/walk, not the Bolt silhouette", () => {
    const bank = {
      "idle-spawn": { url: BREATH, end: HALL },
      "spawn→m1": { url: WALK, end: HALL },
      "spawn←start→m1": { url: WALK, end: HALL },
    };
    const frame = livingPlayFrame({
      bank,
      hall: HALL,
      seed: BOLT_BODY,
      room: BOLT_BODY,
      plate: BOLT_BODY,
      placed: BOLT_BODY,
    });
    assert.equal(frame.phase, "play");
    assert.equal(frame.playFrame, "breath");
    assert.equal(frame.url, PLAY_BREATH);
    assert.equal(frame.still, HALL);
    assert.match(frame.url, /^\/api\/clip\?u=/);
    assert.ok(!isBoltSilhouette(frame.still));
    assert.ok(!isBoltSilhouette(frame.url));
    assert.equal(cookHasWalks(bank), true);
  });

  it("walk urls without breath still play the hall walk, never seed/bolt plate", () => {
    const frame = livingPlayFrame({
      bank: { "spawn→m1": { url: WALK, end: COOKED_HALL } },
      hall: HALL,
      seed: BOLT_BODY,
      room: BOLT_BODY,
    });
    assert.equal(frame.phase, "play");
    assert.equal(frame.playFrame, "walk");
    assert.equal(frame.url, PLAY_WALK);
    assert.equal(frame.still, COOKED_HALL);
    assert.notEqual(frame.still, BOLT_BODY);
  });

  it("stock hall loop + walks count as a living play frame", () => {
    const frame = livingPlayFrame({
      bank: {
        "idle-spawn": { url: HALL_LOOP, end: HALL_STILL },
        "spawn→m1": { url: HALL_LOOP, end: HALL_STILL },
      },
      seed: BOLT_BODY,
      hall: HALL_STILL,
    });
    assert.equal(frame.phase, "play");
    assert.ok(frame.playFrame === "breath" || frame.playFrame === "walk");
    assert.equal(isHallPlayStill(frame.still), true);
  });

  it("cook with only sealed refs / seed does not mark play done", () => {
    const frame = livingPlayFrame({
      bank: {},
      hall: HALL,
      seed: BOLT_BODY,
      room: BOLT_BODY,
      placed: BOLT_BODY,
    });
    assert.equal(frame.phase, "forge");
    assert.equal(frame.playFrame, "fail");
    assert.equal(frame.url, "");
    assert.equal(frame.still, HALL);
    assert.match(frame.frost, /walks failed/i);
    assert.equal(cookHasWalks({}), false);
    assert.equal(cookHasWalks({ seed: { url: BOLT_BODY, end: BOLT_BODY } }), false);
    assert.equal(walkClips({ "enter→spawn": { url: WALK, end: HALL } }).length, 0);
  });

  it("bolt-tainted idle / walk clips are ignored so hall still wins", () => {
    const frame = livingPlayFrame({
      bank: {
        "idle-spawn": { url: BREATH, end: BOLT_BODY },
        "spawn→m1": { url: BOLT_BODY, end: BOLT_BODY },
      },
      hall: HALL,
      seed: BOLT_BODY,
    });
    assert.equal(frame.playFrame, "fail");
    assert.equal(frame.still, HALL);
  });

  it("hallStillOf / playStillOrHall skip seed and bolt for the cover", () => {
    assert.equal(hallStillOf({ seed: BOLT_BODY, room: BOLT_BODY, hall: HALL }), HALL);
    assert.equal(hallStillOf({ plate: BOLT_BODY, seed: BOLT_BODY }), HALL_STILL);
    assert.equal(playStillOrHall(BOLT_BODY, HALL), HALL);
    assert.equal(playStillOrHall(COOKED_HALL, HALL), COOKED_HALL);
    assert.equal(playStillOrHall("", HALL), HALL);
    assert.equal(playCoverStill({ seed: BOLT_BODY, room: BOLT_BODY, plate: BOLT_BODY, hall: HALL }), HALL);
    assert.equal(playCoverStill({ plate: "data:image/jpeg;base64,boltlook", seed: BOLT_BODY }), HALL_STILL);
    assert.notEqual(playCoverStill({ plate: BOLT_BODY }), BOLT_BODY);
    assert.equal(seedMayBankIdle(BOLT_BODY), false);
    assert.equal(seedMayBankIdle(HALL), true);
    assert.equal(seedMayBankIdle(COOKED_HALL), true);
  });

  it("engine finish uses livingPlayFrame and never plates play with packStill(place-bolt)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    assert.match(src, /livingPlayFrame\(/);
    assert.match(src, /packIdentityStill\(/);
    assert.match(src, /data-play-frame=/);
    assert.match(src, /data-play-still=/);
    assert.match(src, /data-play-walks=/);
    assert.match(src, /frame\.frost/);
    assert.match(src, /playFrame === "fail"/);
    const packAt = src.indexOf("function packStill");
    assert.ok(packAt >= 0, "packStill missing");
    const pack = src.slice(packAt, packAt + 280);
    assert.match(pack, /packIdentityStill/);
    assert.doesNotMatch(pack, /n\.includes\("bolt"\) && !n\.includes\("pose"\)/);
    const finishAt = src.indexOf("if (!liveForge.current) return;\n    liveForge.current = false;");
    assert.ok(finishAt >= 0, "cookWalks finish missing");
    const finish = src.slice(finishAt, finishAt + 2200);
    assert.match(finish, /livingNow\(\)/);
    assert.match(finish, /playFrame === "fail"/);
    assert.match(finish, /lockHall\(frame\.still\)/);
    assert.match(finish, /setPhase\("play"\)/);
    assert.doesNotMatch(finish, /const room = refsMap\.current\.get\("room"\)/);
    assert.match(src, /playCoverStill\(/);
    assert.match(src, /playableClipSrc\(/);
    assert.match(src, /theaterMayPlay|livingNow\(\)/);
  });
});

describe("A↔B last-frame seed chain", () => {
  const landed = "data:image/jpeg;base64,/9j/arrivalAtB";
  const stockIdle = { url: HALL_LOOP, end: HALL_STILL };
  const cookedBreath = { url: BREATH, end: COOKED_HALL };

  it("stock hall idle is a placeholder — grabRuneFrame landed stays the seed", () => {
    assert.equal(isStockHallClip(stockIdle), true);
    assert.equal(isStockHallClip({ url: WALK, end: COOKED_HALL }), false);
    assert.equal(arrivalEndStill(landed, stockIdle), landed);
    assert.equal(arrivalEndStill(landed, cookedBreath), COOKED_HALL);
    assert.equal(arrivalEndStill(landed, { url: BREATH, end: HALL_STILL }), landed);
    assert.notEqual(arrivalEndStill(landed, stockIdle), HALL_STILL);
  });

  it("next A↔B walk seeds from arrival last frame, never HALL_STILL / spawn loop", () => {
    assert.equal(walkLastFrameSeed(HALL_STILL, HALL_LOOP, landed), landed);
    assert.equal(walkLastFrameSeed(HALL_STILL, BOLT_BODY, COOKED_HALL), COOKED_HALL);
    assert.equal(walkLastFrameSeed(HALL_STILL, HALL_LOOP), "");
    assert.equal(walkClipHoldsSeed(stockIdle, landed), false);
    assert.equal(walkClipHoldsSeed({ url: WALK, end: landed }, landed), true);
    assert.equal(walkClipHoldsSeed({ url: WALK, end: landed, start: landed }, landed), true);
    assert.equal(walkClipHoldsSeed({ url: WALK, end: COOKED_HALL, start: COOKED_HALL }, landed), false);
    assert.equal(walkClipHoldsSeed({ url: WALK, end: landed, start: landed }, ""), true);
    assert.equal(walkClipHoldsSeed(stockIdle, ""), false);
  });

  it("stock idle-* is not a visible door breath — play must not stitch walk→HALL_LOOP", () => {
    assert.equal(doorBreathPlayable(stockIdle, HALL_LOOP), false);
    assert.equal(doorBreathPlayable(stockIdle, WALK), false);
    assert.equal(doorBreathPlayable({ url: WALK, end: landed }, WALK), false);
    assert.equal(doorBreathPlayable(cookedBreath, WALK), true);
    assert.equal(doorBreathPlayable({ url: BREATH, end: landed }, WALK), true);
    assert.equal(doorBreathPlayable(null, WALK), false);
  });

  it("engine keeps latest/pose/breathEnd on grabRuneFrame landed — stock idle cannot overwrite", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const cookWalks = src.slice(src.indexOf("async function cookWalks"), src.indexOf("function packStill"));
    assert.match(cookWalks, /walkLastFrameSeed\(/);
    assert.match(cookWalks, /arrivalEndStill\(/);
    assert.match(cookWalks, /isStockHallClip\(homeClip\)/);
    assert.match(cookWalks, /latest\.set\(clip\.to, landed\)/);
    assert.match(cookWalks, /const breathEnd = await cookIdleAt\(clip\.to, landed/);
    assert.match(cookWalks, /latest\.set\(clip\.to, breathEnd\)/);
    assert.doesNotMatch(cookWalks, /const hadHome = Boolean\(bank\.current\.get\(`idle-\$\{clip\.to\}`\)\?\.url\);/);
    const cookIdle = src.slice(src.indexOf("async function cookIdleAt"), src.indexOf("async function cookWalks"));
    assert.match(cookIdle, /Never extend a walk/);
    assert.match(cookIdle, /canExtend/);
    assert.match(cookIdle, /playArrival/);
    assert.match(cookIdle, /bank\.current\.set\(`idle-\$\{node\}`, \{ url, end: still \}\)/);
    assert.match(cookIdle, /bank\.current\.set\(`idle-\$\{node\}`, \{ url, end: frame \}\)/);
    assert.doesNotMatch(cookIdle, /if \(!bank\.current\.has\(`idle-\$\{node\}`\)\)/);
    const playWalk = src.slice(src.indexOf("async function playWalk"), src.indexOf("async function saveFilms"));
    assert.match(playWalk, /sealedWalkPlayable\(clip\)/);
    assert.match(playWalk, /stockDoorWalk\(at, id\)/);
    assert.match(playWalk, /walkLastFrameSeed\(/);
    assert.match(playWalk, /walkClipHoldsSeed\(/);
    assert.match(playWalk, /doorBreathPlayable\(/);
    assert.match(playWalk, /enterDoorBreath\(/);
    assert.doesNotMatch(playWalk, /shotEnd\(idleNow/);
    const walkKick = playWalk.slice(0, playWalk.indexOf("playFilm("));
    assert.doesNotMatch(walkKick, /^\s*await shotEnd\(/m);
    assert.match(playWalk, /Abort any looping breath now/);
    assert.match(playWalk, /Never await shotEnd\(idle\)/);
    assert.match(playWalk, /filmLoop\.current = false/);
    assert.match(playWalk, /loadGen\.current \+= 1/);
    assert.match(playWalk, /shotEnd\(clip\.url/);
    assert.match(playWalk, /pose-\$\{id\}/);
    assert.match(playWalk, /start: clip\.start \|\| seed/);
    assert.match(playWalk, /setPose\(null\)/);
    assert.doesNotMatch(playWalk, /setPose\(walkLastFrameSeed/);
    const enterBreath = src.slice(src.indexOf("async function enterDoorBreath"), src.indexOf("async function saveFilms"));
    assert.match(enterBreath, /cookIdleAt\(node, seed, walkUrl, via, true\)/);
    assert.match(enterBreath, /arrivalBreathUrl\(/);
    assert.match(enterBreath, /doorArrivalNeedsCook\(/);
    assert.match(enterBreath, /doorBreathPlayable\(idle, walkUrl\)/);
    assert.doesNotMatch(enterBreath, /if \(!idle\?\.url\)/);
    assert.doesNotMatch(enterBreath, /\|\| idle\?\.url \|\| ""/);
    assert.match(enterBreath, /kickPlay\(url, true, true\)/);
    assert.match(enterBreath, /cueBreath\(hid, url\)/);
    const holdIdle = src.slice(src.indexOf("function holdIdle"), src.indexOf("async function playEnterThenIdle"));
    assert.match(holdIdle, /arrivalBreathUrl\(/);
    assert.match(holdIdle, /kickPlay\(breathUrl, true, true\)/);
    assert.match(holdIdle, /filmLoop\.current = true/);
    assert.match(holdIdle, /atDoor \? ""/);
    assert.doesNotMatch(holdIdle, /atDoor \? "" :[\s\S]*\|\|\s*frame\.url \|\|\s*visSrc\(\) \|\|\s*""\s*\|\|/);
    assert.doesNotMatch(holdIdle, /freezeVis\(/);
    assert.doesNotMatch(holdIdle, /stickCover\(arrival\)/);
    const playFilm = src.slice(src.indexOf("function playFilm("), src.indexOf("async function cookFilm"));
    assert.doesNotMatch(playFilm, /freezeVis\(/);
    assert.match(playFilm, /addEventListener\("ended"/);
    const againLoop = src.slice(src.indexOf("function againLoop"), src.indexOf("function startAtSkip"));
    assert.doesNotMatch(againLoop, /freezeVis\(/);
    assert.match(againLoop, /Walk ended/);
    const forgeNow = src.slice(src.indexOf("async function forgeWalkNow"), src.indexOf("async function recookWalk"));
    assert.match(forgeNow, /walkLastFrameSeed\(/);
    assert.match(forgeNow, /start: fromStill/);
    assert.match(cookWalks, /start: fromStill/);
  });
});

describe("breath tap interrupts any idle — spawn↔A, spawn↔B, A↔B", () => {
  const idle = { beat: "idle" as const, filmLoop: true };
  const pairs: Array<{ here: string; door: string; label: string }> = [
    { here: "spawn", door: "m1", label: "spawn→A" },
    { here: "spawn", door: "A", label: "spawn→A alias" },
    { here: "spawn", door: "m2", label: "spawn→B" },
    { here: "spawn", door: "B", label: "spawn→B alias" },
    { here: "m1", door: "m2", label: "A→B" },
    { here: "A", door: "B", label: "A→B alias" },
    { here: "m2", door: "m1", label: "B→A" },
    { here: "B", door: "A", label: "B→A alias" },
    { here: "m1", door: "spawn", label: "A→spawn" },
    { here: "m2", door: "spawn", label: "B→spawn" },
  ];

  it("playNodeId maps Door A/B and keeps spawn / other markers", () => {
    assert.equal(playNodeId("A"), "m1");
    assert.equal(playNodeId("m1"), "m1");
    assert.equal(playNodeId("B"), "m2");
    assert.equal(playNodeId("m2"), "m2");
    assert.equal(playNodeId("spawn"), "spawn");
    assert.equal(playNodeId("m3"), "m3");
    assert.equal(playNodeId(""), "");
  });

  it("other-marker tap during any looping breath walks now", () => {
    for (const p of pairs) {
      assert.equal(breathTapWalksNow({ ...idle, here: p.here, door: p.door }), true, p.label);
      assert.equal(breathTapWalksNow({ here: p.here, door: p.door, beat: "idle", filmLoop: false }), true, `${p.label} idle no loop`);
      assert.equal(breathTapWalksNow({ here: p.here, door: p.door, beat: "shot", filmLoop: true }), true, `${p.label} shot`);
    }
    assert.equal(breathTapWalksNow({ here: "m3", door: "m1", beat: "idle", filmLoop: true }), true, "other marker→A");
    assert.equal(breathTapWalksNow({ here: "spawn", door: "m3", beat: "idle", filmLoop: true }), true, "spawn→other marker");
  });

  it("same-door 2nd tap does not steal hung enter / stay", () => {
    assert.equal(breathTapWalksNow({ ...idle, here: "m1", door: "m1" }), false);
    assert.equal(breathTapWalksNow({ ...idle, here: "A", door: "A" }), false);
    assert.equal(breathTapWalksNow({ ...idle, here: "m2", door: "B" }), false);
    assert.equal(breathTapWalksNow({ ...idle, here: "spawn", door: "spawn" }), false);
  });

  it("mid-walk / cook stays queued — do not cut a playing walk", () => {
    for (const p of pairs) {
      assert.equal(breathTapWalksNow({ here: p.here, door: p.door, beat: "playvid", filmLoop: false }), false, `${p.label} playvid`);
      assert.equal(breathTapWalksNow({ here: p.here, door: p.door, beat: "walk", filmLoop: false }), false, `${p.label} walk`);
      assert.equal(breathTapWalksNow({ here: p.here, door: p.door, beat: "cook", filmLoop: true }), false, `${p.label} cook`);
    }
  });

  it("engine goTo / playWalk abort kickPlay idle and never await shotEnd(idle)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const goTo = src.slice(src.indexOf("function goTo"), src.indexOf("function drainQueue"));
    const playWalk = src.slice(src.indexOf("async function playWalk"), src.indexOf("async function saveFilms"));
    const holdIdle = src.slice(src.indexOf("function holdIdle"), src.indexOf("async function playEnterThenIdle"));
    const enterBreath = src.slice(src.indexOf("async function enterDoorBreath"), src.indexOf("async function saveFilms"));
    assert.match(goTo, /breathTapWalksNow\(/);
    assert.match(goTo, /here: hereRef\.current/);
    assert.match(goTo, /door: id/);
    assert.match(goTo, /filmLoop: filmLoop\.current/);
    assert.match(goTo, /Abort idle-spawn \/ idle-m1 \/ idle-m2 \/ arrival breath/);
    assert.match(goTo, /hungDoorTap\(hereRef\.current, id\) === "enter"/);
    assert.match(goTo, /void playWalk\(id\)/);
    assert.match(playWalk, /Abort any looping breath now \(idle-spawn \/ idle-m1 \/ idle-m2 \/ arrival\)/);
    assert.match(playWalk, /Never await shotEnd\(idle\)/);
    assert.doesNotMatch(playWalk, /shotEnd\(idleNow/);
    const walkKick = playWalk.slice(0, playWalk.indexOf("playFilm("));
    assert.doesNotMatch(walkKick, /^\s*await shotEnd\(/m);
    assert.match(playWalk, /filmLoop\.current = false/);
    assert.match(playWalk, /loadGen\.current \+= 1/);
    assert.match(playWalk, /enterDoorBreath\(/);
    assert.match(holdIdle, /kickPlay\(breathUrl, true, true\)/);
    assert.match(enterBreath, /kickPlay\(url, true, true\)/);
    assert.doesNotMatch(holdIdle, /freezeVis\(/);
    assert.doesNotMatch(enterBreath, /freezeVis\(/);
  });
});

describe("hold arrival breath — no idle-spawn / m1 / m2 teleport", () => {
  const spawnB = "https://imgen.example/idle-spawn.mp4";
  const m1B = "https://imgen.example/idle-m1.mp4";
  const m2B = "https://imgen.example/idle-m2.mp4";
  const bank = {
    "idle-spawn": { url: spawnB, end: COOKED_HALL },
    "idle-m1": { url: m1B, end: COOKED_HALL },
    "idle-m1←spawn": { url: m1B, end: COOKED_HALL },
    "idle-m2": { url: m2B, end: COOKED_HALL },
    "spawn→m1": { url: WALK, end: COOKED_HALL },
  };

  it("isNodeIdleKey / isNodeArrivalBreath never cross markers", () => {
    assert.equal(isNodeIdleKey("idle-spawn", "spawn"), true);
    assert.equal(isNodeIdleKey("idle-m1←spawn", "m1"), true);
    assert.equal(isNodeIdleKey("idle-m1", "m2"), false);
    assert.equal(isNodeIdleKey("idle-spawn", "m1"), false);
    assert.equal(isNodeIdleKey("idle-m2", "spawn"), false);
    assert.equal(isNodeArrivalBreath(bank, "m1", m1B, WALK), true);
    assert.equal(isNodeArrivalBreath(bank, "m1", spawnB, WALK), false);
    assert.equal(isNodeArrivalBreath(bank, "m1", m2B, WALK), false);
    assert.equal(isNodeArrivalBreath(bank, "m1", WALK, WALK), false);
    assert.equal(isNodeArrivalBreath(bank, "spawn", spawnB, WALK), true);
    assert.equal(isNodeArrivalBreath(bank, "spawn", m1B, WALK), false);
    assert.equal(isNodeArrivalBreath(bank, "m2", HALL_LOOP, WALK), false);
  });

  it("keepHeldBreath locks this marker's clip; other-node / walk / mid-walk do not", () => {
    const hold = { bank, filmLoop: true, beat: "idle" as const, walkUrl: WALK };
    assert.equal(keepHeldBreath({ ...hold, here: "m1", showing: m1B }), true);
    assert.equal(keepHeldBreath({ ...hold, here: "A", showing: m1B }), true);
    assert.equal(keepHeldBreath({ ...hold, here: "m1", showing: spawnB }), false);
    assert.equal(keepHeldBreath({ ...hold, here: "m1", showing: m2B }), false);
    assert.equal(keepHeldBreath({ ...hold, here: "spawn", showing: spawnB }), true);
    assert.equal(keepHeldBreath({ ...hold, here: "spawn", showing: m1B }), false);
    assert.equal(keepHeldBreath({ ...hold, here: "m1", showing: m1B, beat: "playvid" }), false);
    assert.equal(keepHeldBreath({ ...hold, here: "m1", showing: m1B, filmLoop: false }), false);
    assert.equal(keepHeldBreath({ ...hold, here: "m1", showing: WALK }), false);
  });

  it("holdBreathUrl stays node-local and ignores livingPlayFrame spawn-first clips", () => {
    assert.equal(holdBreathUrl(bank, "m1", "spawn", WALK), m1B);
    assert.equal(holdBreathUrl(bank, "m2", "spawn", WALK), m2B);
    assert.equal(holdBreathUrl(bank, "spawn", "start", WALK), spawnB);
    assert.notEqual(holdBreathUrl(bank, "m1", "spawn", WALK), spawnB);
    assert.notEqual(holdBreathUrl({ "idle-spawn": bank["idle-spawn"] }, "m1", "spawn", WALK), spawnB);
    assert.equal(holdBreathUrl({ "idle-spawn": bank["idle-spawn"] }, "m1", "spawn", WALK), "");
    const stock = { url: HALL_LOOP, end: HALL_STILL };
    assert.equal(holdBreathUrl({ "idle-m1": stock, "idle-spawn": stock }, "m1", "spawn", WALK), "");
    assert.equal(holdBreathUrl({ "idle-spawn": stock }, "spawn", "start", ""), HALL_LOOP);
  });

  it("breathSeamSameClip rejects a prefetched walk or other idle", () => {
    assert.equal(breathSeamSameClip(m1B, m1B), true);
    assert.equal(breathSeamSameClip(m1B, playableClipSrc(m1B)), true);
    assert.equal(breathSeamSameClip(m1B, WALK), false);
    assert.equal(breathSeamSameClip(m1B, spawnB), false);
    assert.equal(breathSeamSameClip(m1B, ""), false);
  });

  it("engine holdIdle / kickPlay / seam / vis resume never re-pick another idle", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const holdIdle = src.slice(src.indexOf("function holdIdle"), src.indexOf("async function playEnterThenIdle"));
    const kickPlay = src.slice(src.indexOf("function kickPlay"), src.indexOf("function playStockWalk"));
    const stampLoop = src.slice(src.indexOf("function stampLoop"), src.indexOf("function wrapLoop"));
    const againLoop = src.slice(src.indexOf("function againLoop"), src.indexOf("function startAtSkip"));
    const prefetch = src.slice(src.indexOf("function prefetchFrom"), src.indexOf("function notePaint"));
    const enterBreath = src.slice(src.indexOf("async function enterDoorBreath"), src.indexOf("async function saveFilms"));
    assert.match(holdIdle, /keepHeldBreath\(/);
    assert.match(holdIdle, /holdBreathUrl\(/);
    assert.match(holdIdle, /arrivalBreathUrl\(/);
    assert.match(holdIdle, /resumeHeldBreath\(/);
    assert.match(holdIdle, /kickPlay\(breathUrl, true, true\)/);
    assert.match(holdIdle, /atDoor \? ""/);
    assert.doesNotMatch(holdIdle, /frame\.url/);
    assert.doesNotMatch(holdIdle, /freezeVis\(/);
    assert.match(kickPlay, /sameClipSrc\(visSrc\(\), url\)/);
    assert.match(kickPlay, /vis\.paused/);
    assert.doesNotMatch(kickPlay, /filmLoop\.current && vis && !vis\.paused/);
    assert.match(stampLoop, /breathSeamSameClip\(/);
    assert.match(againLoop, /breathSeamSameClip\(/);
    assert.match(againLoop, /Walk ended/);
    assert.doesNotMatch(againLoop, /freezeVis\(/);
    assert.match(prefetch, /if \(filmLoop\.current\) return;/);
    assert.match(src, /resumeHeldBreath\(/);
    assert.match(src, /visibilitychange/);
    assert.match(src, /never holdIdle at spawn/);
    assert.match(src, /addEventListener\("pause"/);
    assert.match(enterBreath, /holdBreathUrl\(/);
    assert.match(enterBreath, /stockSprite\.current = false/);
    assert.match(src, /if \(filmLoop\.current\) return;/);
  });
});

describe("picture never stops — Play / Load / forge-complete", () => {
  it("acceptance: walk ends → breath loops until tap; Load keep bank; LARGE snow-white", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const rails = readFileSync(join(here, "./rune.ts"), "utf8");
    const playWalk = src.slice(src.indexOf("async function playWalk"), src.indexOf("async function saveFilms"));
    assert.match(playWalk, /enterDoorBreath\(/);
    assert.match(playWalk, /if \(!shown\) holdIdle\(\)/);
    assert.match(src, /kickPlay\(url, true, true\)/);
    assert.match(src, /kickPlay\(breathUrl, true, true\)/);
    assert.match(src, /setStripOn\(true\)/);
    assert.match(src, /sealedWalkPlayable\(clip\)/);
    assert.match(rails, /SCALE: LARGE Bolt/);
    assert.match(rails, /FULL snow-white ONLY/);
    assert.match(rails, /\/refs\/bolt-body\.jpg/);
  });

  it("arrival breath loops at spawn, A, and B from cooked idle-*", () => {
    const bank = {
      "idle-spawn": { url: BREATH, end: COOKED_HALL },
      "idle-m1": { url: BREATH, end: COOKED_HALL },
      "idle-m2←spawn": { url: BREATH, end: COOKED_HALL },
      "spawn→m1": { url: WALK, end: COOKED_HALL, start: COOKED_HALL },
    };
    assert.equal(pictureNeverStops(bank, "spawn", "start", WALK), true);
    assert.equal(pictureNeverStops(bank, "m1", "spawn", WALK), true);
    assert.equal(pictureNeverStops(bank, "m2", "spawn", WALK), true);
    assert.ok(arrivalBreathUrl(bank, "m1", "spawn", WALK));
    assert.notEqual(arrivalBreathUrl(bank, "m1", "spawn", WALK), WALK);
  });

  it("idle-spawn + spawn→m1 must not return spawn breath for m1 arrival", () => {
    const bank = {
      "idle-spawn": { url: BREATH, end: COOKED_HALL },
      "spawn→m1": { url: WALK, end: COOKED_HALL, start: COOKED_HALL },
    };
    assert.equal(arrivalBreathUrl(bank, "m1", "spawn", WALK), "");
    assert.notEqual(arrivalBreathUrl(bank, "m1", "spawn", WALK), BREATH);
    assert.equal(pictureNeverStops(bank, "m1", "spawn", WALK), false);
    assert.equal(arrivalBreathUrl(bank, "m2", "m1", WALK), "");
    assert.equal(arrivalBreathUrl({ "idle-m1": { url: BREATH, end: COOKED_HALL } }, "m2", "m1", WALK), "");
    assert.equal(arrivalBreathUrl(bank, "spawn", "start", WALK), BREATH);
    assert.equal(doorArrivalNeedsCook(null, WALK), true);
    assert.equal(doorArrivalNeedsCook(undefined, WALK), true);
  });

  it("stock idle-m1/m2 is unplayable and must not block re-cook from landed", () => {
    const stockIdle = { url: HALL_LOOP, end: HALL_STILL };
    const cooked = { url: BREATH, end: COOKED_HALL };
    const stockBank = {
      "idle-spawn": stockIdle,
      "idle-m1": stockIdle,
      "idle-m2": stockIdle,
      "spawn→m1": { url: WALK, end: COOKED_HALL },
    };
    assert.equal(doorBreathPlayable(stockIdle, WALK), false);
    assert.equal(doorArrivalNeedsCook(stockIdle, WALK), true);
    assert.equal(doorArrivalNeedsCook(cooked, WALK), false);
    assert.equal(arrivalBreathUrl(stockBank, "m1", "spawn", WALK), "");
    assert.equal(arrivalBreathUrl(stockBank, "m2", "spawn", WALK), "");
    assert.notEqual(arrivalBreathUrl(stockBank, "m1", "spawn", WALK), HALL_LOOP);
    assert.notEqual(arrivalBreathUrl(stockBank, "m1", "spawn", WALK), BREATH);
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const enterBreath = src.slice(src.indexOf("async function enterDoorBreath"), src.indexOf("async function saveFilms"));
    assert.match(enterBreath, /doorArrivalNeedsCook\(idle, walkUrl\)/);
    assert.match(enterBreath, /cookIdleAt\(node, seed, walkUrl, via, true\)/);
    const cookIdle = src.slice(src.indexOf("async function cookIdleAt"), src.indexOf("async function cookWalks"));
    assert.match(cookIdle, /if \(have && doorBreathPlayable\(have, fromFilm\)\) return have\.end \|\| still;/);
  });

  it("Load hydrate keeps a thinner incoming bank from wiping cooked clips", () => {
    const keep = [
      { key: "spawn→m1", url: WALK, end: COOKED_HALL, start: COOKED_HALL },
      { key: "idle-m1", url: BREATH, end: COOKED_HALL },
    ];
    const merged = mergeBankClips(keep, []);
    assert.equal(merged.length, 2);
    assert.equal(merged.find((b) => b.key === "spawn→m1")?.start, COOKED_HALL);
    assert.equal(mergeBankClips([], keep).length, 2);
    const cooked = [{ n: 1, bank: keep }];
    const emptyMore = [
      { n: 1, bank: [] },
      { n: 2, bank: [] },
    ];
    assert.equal(preferHalls(emptyMore, cooked), cooked);
    assert.equal(sealedWalkPlayable({ url: WALK, end: COOKED_HALL }), true);
    assert.equal(sealedWalkPlayable({ url: HALL_LOOP, end: HALL_STILL }), false);
  });

  it("Films tray hides Still A / Still B when they equal hall/seed", () => {
    assert.equal(filmTrayStillKeep("spawn", COOKED_HALL, COOKED_HALL), true);
    assert.equal(filmTrayStillKeep("m1", COOKED_HALL, COOKED_HALL), false);
    assert.equal(filmTrayStillKeep("m2", COOKED_HALL, COOKED_HALL), false);
    assert.equal(filmTrayStillKeep("m1", BREATH, COOKED_HALL), true);
  });

  it("engine hydrates bank start, never wipes on Load, and shows trays on play", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const hub = readFileSync(join(here, "../components/citadel-hub.tsx"), "utf8");
    const playAt = hub.indexOf("function playSession");
    const playSession = hub.slice(playAt, hub.indexOf("return (", playAt));
    assert.match(playSession, /function playSession/);
    assert.doesNotMatch(playSession, /stills:\s*false/);
    assert.match(src, /mergeBankClips\(/);
    assert.match(src, /applyHall\(slice, false, "hydrate"\)/);
    assert.match(src, /start: b\.start/);
    assert.match(src, /setStripOn\(true\)/);
    assert.match(src, /clipsUI\.length && \(phase === "forge" \|\| phase === "play"\)/);
    assert.match(src, /phase === "forge" \|\| phase === "play" \? \(/);
    assert.match(src, /\{refs\.length > 0 \? \(/);
    assert.doesNotMatch(src, /refs\.length > 0 && phase !== "play"/);
    const open = src.slice(src.indexOf("async function openSession"), src.indexOf("function wipeSession"));
    assert.match(open, /holdIdle\(\)/);
    assert.match(open, /if \(bank\.current\.size\) rememberSlice\(snapHall\(\)\)/);
    assert.doesNotMatch(open, /rememberSlice\(snapHall\(\)\);\s*persist\(\{/);
    const persistFn = src.slice(src.indexOf("function persist("), src.indexOf("function goBack("));
    assert.match(persistFn, /explicitWipe/);
    assert.match(persistFn, /preferHalls\(snap\.halls, hallsHold\.current\)/);
    const remember = src.slice(src.indexOf("function rememberSlice"), src.indexOf("function applyHall"));
    assert.match(remember, /mergeBankClips\(slice\.bank, prev\?\.bank\)/);
    assert.match(remember, /prev\?\.bank\?\.length/);
    const finish = src.slice(src.indexOf("if (!liveForge.current) return;\n    liveForge.current = false;"));
    assert.match(finish, /holdIdle\(\)/);
    assert.match(src, /BOLT_BODY, lookHall\.current/);
  });
});
