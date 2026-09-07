import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BOLT_BODY, BOLT_FACE, TOUR_PLATE } from "./rune.ts";
import { HALL_LOOP, HALL_STILL } from "./stock-room.ts";
import { playableClipSrc } from "./play-clip.ts";
import {
  arrivalBreathUrl,
  arrivalEndStill,
  cookHasWalks,
  filmTrayStillKeep,
  hallStillOf,
  isBoltSilhouette,
  isHallPlayStill,
  isStockHallClip,
  livingPlayFrame,
  mergeBankClips,
  packIdentityStill,
  pictureNeverStops,
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
    assert.match(playWalk, /stockDoorWalk\(at, id\)/);
    assert.match(playWalk, /walkLastFrameSeed\(/);
    assert.match(playWalk, /walkClipHoldsSeed\(/);
    assert.match(playWalk, /doorBreathPlayable\(/);
    assert.match(playWalk, /enterDoorBreath\(/);
    assert.match(playWalk, /shotEnd\(idleNow/);
    assert.match(playWalk, /shotEnd\(clip\.url/);
    assert.match(playWalk, /pose-\$\{id\}/);
    assert.match(playWalk, /start: clip\.start \|\| seed/);
    assert.match(playWalk, /setPose\(null\)/);
    assert.doesNotMatch(playWalk, /setPose\(walkLastFrameSeed/);
    const enterBreath = src.slice(src.indexOf("async function enterDoorBreath"), src.indexOf("async function saveFilms"));
    assert.match(enterBreath, /cookIdleAt\(node, seed, walkUrl, via, true\)/);
    assert.match(enterBreath, /arrivalBreathUrl\(/);
    assert.match(enterBreath, /kickPlay\(url, true, true\)/);
    assert.match(enterBreath, /cueBreath\(hid, url\)/);
    const holdIdle = src.slice(src.indexOf("function holdIdle"), src.indexOf("async function playEnterThenIdle"));
    assert.match(holdIdle, /arrivalBreathUrl\(/);
    assert.match(holdIdle, /kickPlay\(breathUrl, true, true\)/);
    assert.match(holdIdle, /filmLoop\.current = true/);
    assert.doesNotMatch(holdIdle, /freezeVis\(/);
    assert.doesNotMatch(holdIdle, /stickCover\(arrival\)/);
    const forgeNow = src.slice(src.indexOf("async function forgeWalkNow"), src.indexOf("async function recookWalk"));
    assert.match(forgeNow, /walkLastFrameSeed\(/);
    assert.match(forgeNow, /start: fromStill/);
    assert.match(cookWalks, /start: fromStill/);
  });
});

describe("picture never stops — Play / Load / forge-complete", () => {
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

  it("Load hydrate keeps a thinner incoming bank from wiping cooked clips", () => {
    const keep = [
      { key: "spawn→m1", url: WALK, end: COOKED_HALL, start: COOKED_HALL },
      { key: "idle-m1", url: BREATH, end: COOKED_HALL },
    ];
    const merged = mergeBankClips(keep, []);
    assert.equal(merged.length, 2);
    assert.equal(merged.find((b) => b.key === "spawn→m1")?.start, COOKED_HALL);
    assert.equal(mergeBankClips([], keep).length, 2);
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
    assert.match(hub, /function playSession/);
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
    const finish = src.slice(src.indexOf("if (!liveForge.current) return;\n    liveForge.current = false;"));
    assert.match(finish, /holdIdle\(\)/);
    assert.match(src, /BOLT_BODY, lookHall\.current/);
  });
});
