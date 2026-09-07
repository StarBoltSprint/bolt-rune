import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BOLT_BODY, BOLT_FACE, TOUR_PLATE } from "./rune.ts";
import { HALL_LOOP, HALL_STILL } from "./stock-room.ts";
import { playableClipSrc } from "./play-clip.ts";
import {
  cookHasWalks,
  hallStillOf,
  isBoltSilhouette,
  isHallPlayStill,
  livingPlayFrame,
  packIdentityStill,
  playCoverStill,
  playStillOrHall,
  seedMayBankIdle,
  walkClips,
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
