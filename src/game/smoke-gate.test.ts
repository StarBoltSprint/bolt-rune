import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hangArtifactOnDoor } from "./enter-graph.ts";
import { assemblePrompt, type PromptSlots } from "./pcg-prompt.ts";
import { clipCachePut, commitHallPrime } from "./pcg-rail.ts";
import {
  BLACK_HOLE_LOCK,
  RAILS_VERSION,
  SMIR_DOOR_ARCH_LOCK,
  SMIR_GRADE_LOCK,
  SMIR_LIGHT_LOCK,
  SMIR_LOCKOFF_LOCK,
  SMIR_RIG_LOCK,
  SMIR_TAILLE_LOCK,
  SPAWN_CAMERA_LAW,
  STILL_PAIR_FIELDS,
  STILL_PAIR_LAW,
  acceptPlayLibrary,
  mayFlipProfileToBack,
  clearSmokeFail,
  clearSmokePass,
  clipCachePutIfPass,
  hangOnDoorIfPass,
  hopSmokeBot,
  lintSmoke,
  lintStillPair,
  mayHang,
  parseSmokeBot,
  passSmoke,
  runSmokeGate,
  shouldSmoke,
  smokeFailForward,
  smokeForgeFrost,
  stillEndIfPass,
  type SmokeSubject,
} from "./smoke-gate.ts";
import { type Cue } from "./pcg-play.ts";

const here = dirname(fileURLToPath(import.meta.url));

function goodSlots(over: Partial<PromptSlots> = {}): PromptSlots {
  return {
    biome: "asteroid",
    act: "walk-A",
    fork: "L",
    trail: "thin",
    floor: "empty",
    leftover: "none",
    fromTo: null,
    still: "/films/cook-asteroid.jpg",
    destStill: null,
    seed: "sasteroidwalk000",
    ...over,
  };
}

function goodCues(): Cue[] {
  return [{ side: "A", on: 2, off: 2.5, kind: "walk" }];
}

function goodWalk(over: Partial<SmokeSubject> = {}): SmokeSubject {
  const slots = goodSlots();
  const cooked = assemblePrompt(slots);
  return {
    kind: "walk",
    when: "cook",
    clip: "/films/forge-asteroid.mp4",
    still: "/films/cook-asteroid.jpg",
    stillEnd: "/films/cook-asteroid.jpg",
    duration: 10,
    width: 1080,
    height: 1920,
    cues: goodCues(),
    prompt: cooked.prompt,
    slots,
    doors: { a: true, b: true },
    ...over,
  };
}

describe("Smoke ship-gate — local lint", () => {
  beforeEach(() => {
    clearSmokePass();
    clearSmokeFail();
  });

  it("cue window FAIL when off-on < 0.35s", () => {
    const got = lintSmoke(
      goodWalk({
        cues: [{ side: "A", on: 2, off: 2.2, kind: "walk" }],
      }),
    );
    assert.equal(got.smoke, "FAIL");
    assert.ok(got.reasons.includes("cue-window"));
    assert.equal(mayHang(got), false);
  });

  it("cue window FAIL when on >= off", () => {
    const got = lintSmoke(
      goodWalk({
        cues: [{ side: "A", on: 4, off: 4, kind: "walk" }],
      }),
    );
    assert.equal(got.smoke, "FAIL");
    assert.ok(got.reasons.includes("cue-window"));
  });

  it("walk tagged truck / orbit / follow-through-door is Smoke FAIL", () => {
    const cooked = assemblePrompt(goodSlots());
    const got = lintSmoke(goodWalk({ prompt: `${cooked.prompt} truck orbit follow-through-door` }));
    assert.equal(got.smoke, "FAIL");
    assert.ok(got.reasons.includes("camera-prompt"));
  });

  it("prompt banned stem FAIL", () => {
    const cooked = assemblePrompt(goodSlots({ flavor: "chrome wolf" }));
    const got = lintSmoke(goodWalk({ prompt: cooked.prompt, slots: goodSlots({ flavor: "chrome wolf" }) }));
    assert.equal(got.smoke, "FAIL");
    assert.ok(got.reasons.some((r) => r.startsWith("prompt-") || r === "prompt-banned-stem"));
  });

  it("PASS attaches railsVersion bolt-1", () => {
    const got = lintSmoke(goodWalk());
    assert.equal(got.smoke, "PASS");
    if (got.smoke !== "PASS") throw new Error("expected PASS");
    assert.equal(got.attach.railsVersion, RAILS_VERSION);
    assert.equal(got.attach.railsVersion, "bolt-1");
    assert.equal(got.attach.smoke, "PASS");
    assert.equal(got.attach.clip, "/films/forge-asteroid.mp4");
    assert.equal(got.attach.stillEnd, "/films/cook-asteroid.jpg");
    assert.ok(got.attach.cues.length >= 1);
  });

  it("16:9 cinematic FAIL; zero-byte FAIL; Hang blocked on FAIL", () => {
    const wide = lintSmoke(goodWalk({ width: 1920, height: 1080 }));
    assert.equal(wide.smoke, "FAIL");
    assert.ok(wide.reasons.includes("aspect-16:9"));
    const empty = lintSmoke(goodWalk({ bytes: 0 }));
    assert.equal(empty.smoke, "FAIL");
    assert.ok(empty.reasons.includes("zero-byte"));

    const from = [
      {
        id: "art-smoke",
        name: "Asteroid",
        still: "/films/cook-asteroid.jpg",
        playlist: ["/films/forge-asteroid.mp4"],
        prompt: "asteroid",
        hungAt: 1,
        grade: null,
      },
    ];
    const blocked = hangArtifactOnDoor("art-smoke", "A", { hall: 2, smoke: wide }, from);
    assert.equal(blocked, from);
    assert.equal(blocked[0]?.room, undefined);
    const via = hangOnDoorIfPass("art-smoke", "A", { hall: 2, smoke: wide }, from);
    assert.equal(via[0]?.room, undefined);
    const ok = hangOnDoorIfPass("art-smoke", "A", { hall: 2, smoke: passSmoke(goodWalk()) }, from);
    assert.equal(ok[0]?.room?.hall, 2);
    assert.equal(ok[0]?.room?.door, "A");
  });

  it("FAIL never caches, never hands stillEnd, decays like empty WFC", () => {
    const fail = lintSmoke(goodWalk({ cues: [{ side: "A", on: 1, off: 1.1, kind: "walk" }] }));
    assert.equal(clipCachePutIfPass("k-fail", "/films/forge-asteroid.mp4", "plate", fail), "");
    assert.equal(clipCachePut("k-fail2", "/films/forge-asteroid.mp4", "plate", fail), "");
    assert.equal(commitHallPrime("/films/forge-asteroid.mp4", fail), "hold");
    assert.equal(stillEndIfPass(fail, "/films/bad-end.jpg"), "");
    const fwd = smokeFailForward("asteroid");
    assert.equal(fwd.hang, false);
    assert.equal(fwd.cache, false);
    assert.equal(fwd.stillEnd, "");
    assert.equal(fwd.commit, "hold");
    assert.equal(fwd.decay, true);
    assert.ok(fwd.stock);
    assert.match(smokeForgeFrost(fail.reasons), /smoke FAIL/);
  });

  it("spawn/breath face-on or profile-as-primary is FAIL; lock-off behind only", () => {
    const face = lintSmoke(goodWalk({ kind: "breath", camera: "face-on" }));
    assert.equal(face.smoke, "FAIL");
    assert.ok(face.reasons.includes("spawn-face"));
    const profile = lintSmoke(goodWalk({ kind: "breath", posePrimary: "profile" }));
    assert.equal(profile.smoke, "FAIL");
    assert.ok(profile.reasons.includes("spawn-profile"));
    const mood = lintSmoke(
      goodWalk({
        kind: "breath",
        clip: "/ui/citadel.mp4?v=aaa",
        still: "/films/citadel-tour.jpg",
      }),
    );
    assert.equal(mood.smoke, "FAIL");
    assert.ok(mood.reasons.includes("spawn-profile"));
    const behind = lintSmoke(goodWalk({ kind: "breath", camera: "behind", posePrimary: "behind" }));
    assert.equal(behind.smoke, "PASS");
    for (const line of SPAWN_CAMERA_LAW) assert.match(line, /behind|FAIL|Vault/i);
  });

  it("burned SEATS/FILMS/ROOMS/REFS on play acts is chrome-burn FAIL", () => {
    for (const kind of ["breath", "walk", "enter"] as const) {
      const got = lintSmoke(goodWalk({ kind, burnedText: "SEATS FILMS ROOMS REFS" }));
      assert.equal(got.smoke, "FAIL");
      assert.ok(got.reasons.includes("chrome-burn"));
    }
    const decay = lintSmoke(goodWalk({ kind: "walk", act: "decay", labels: ["SEATS"] }));
    assert.equal(decay.smoke, "FAIL");
    assert.ok(decay.reasons.includes("chrome-burn"));
  });

  it("still-pair mismatch and authoring without fields FAIL; match PASS", () => {
    const mismatch = lintStillPair(
      [
        { id: "breath-spawn", act: "breath", poseStart: "spawn", stillStart: "still-spawn", stillEnd: "still-spawn" },
        { id: "walk-spawn-A", act: "walk", poseStart: "spawn", poseEnd: "atA", stillStart: "still-other", stillEnd: "still-a" },
        { id: "breath-A", act: "breath", poseStart: "atA", stillStart: "still-a", stillEnd: "still-a" },
      ],
      { authoring: true },
    );
    assert.ok(mismatch.includes("still-pair-spawn"));
    const dest = lintStillPair(
      [
        { id: "walk-spawn-A", act: "walk", poseStart: "spawn", poseEnd: "atA", stillStart: "still-spawn", stillEnd: "still-wrong" },
        { id: "breath-A", act: "breath", poseStart: "atA", stillStart: "still-a", stillEnd: "still-a" },
      ],
      { authoring: true },
    );
    assert.ok(dest.includes("still-pair-dest"));
    const missing = lintStillPair(
      [
        { id: "walk-spawn-A", act: "walk", poseStart: "spawn", poseEnd: "atA" },
        { id: "breath-spawn", act: "breath", poseStart: "spawn" },
      ],
      { authoring: true },
    );
    assert.ok(missing.includes("still-pair-required"));
    const ok = acceptPlayLibrary(
      [
        { id: "breath-spawn", act: "breath", poseStart: "spawn", stillStart: "still-spawn", stillEnd: "still-spawn" },
        { id: "walk-spawn-A", act: "walk", poseStart: "spawn", poseEnd: "atA", stillStart: "still-spawn", stillEnd: "still-a" },
        { id: "breath-A", act: "breath", poseStart: "atA", stillStart: "still-a", stillEnd: "still-a" },
      ],
      { authoring: true },
    );
    assert.equal(ok.smoke, "PASS");
    const gated = lintSmoke(
      goodWalk({
        pair: { walkEnd: "still-walk", breathDestStart: "still-other", walkSpawnStart: "a", breathSpawnStart: "b" },
      }),
    );
    assert.equal(gated.smoke, "FAIL");
    assert.ok(gated.reasons.includes("still-pair-dest") || gated.reasons.includes("still-pair-spawn"));
    assert.deepEqual([...STILL_PAIR_FIELDS], ["stillStart", "stillEnd"]);
    assert.match(STILL_PAIR_LAW.join(" "), /stillEnd\(walk\)|fail closed/i);
  });

  it("near-black mid-clip void frames FAIL", () => {
    const got = lintSmoke(goodWalk({ voidFrames: [{ t: 4, luma: 0.01 }] }));
    assert.equal(got.smoke, "FAIL");
    assert.ok(got.reasons.includes("void-frame"));
    const hole = lintSmoke(goodWalk({ blackHole: true }));
    assert.equal(hole.smoke, "FAIL");
    assert.ok(hole.reasons.includes("void-frame"));
    const edges = lintSmoke(goodWalk({ duration: 10, voidFrames: [{ t: 0, luma: 0 }, { t: 10, luma: 0 }] }));
    assert.equal(edges.smoke, "PASS");
  });

  it("black hole illegal — encode tail or engine dropped still FAIL", () => {
    const tail = lintSmoke(goodWalk({ blackTail: true }));
    assert.equal(tail.smoke, "FAIL");
    assert.ok(tail.reasons.includes("void-frame"));
    assert.ok(tail.reasons.includes("void-tail"));
    const luma = lintSmoke(goodWalk({ lumaTail: 0.01 }));
    assert.equal(luma.smoke, "FAIL");
    assert.ok(luma.reasons.includes("void-tail"));
    const hold = lintSmoke(goodWalk({ holdStill: false }));
    assert.equal(hold.smoke, "FAIL");
    assert.ok(hold.reasons.includes("void-hold"));
    const empty = lintSmoke(goodWalk({ emptySrc: true }));
    assert.equal(empty.smoke, "FAIL");
    assert.ok(empty.reasons.includes("void-src"));
    const held = lintSmoke(goodWalk({ holdStill: true, blackTail: false }));
    assert.equal(held.smoke, "PASS");
    for (const line of BLACK_HOLE_LOCK) {
      assert.match(line, /black hole|stillEnd|video\.src|decay stock|preload breath|full black/i);
    }
  });

  it("SmiR HARD LOCK taille/scale — spawn band, breath jump, walk hero, pair, lens", () => {
    const cooked = assemblePrompt(goodSlots());
    const behind = { camera: "behind" as const, posePrimary: "behind" as const };
    const tiny = lintSmoke(goodWalk({ ...behind, pose: "spawn", kind: "breath", taille: { bboxH: 0.1, spawnH: 0.1 } }));
    assert.equal(tiny.smoke, "FAIL");
    assert.ok(tiny.reasons.includes("taille-spawn"));
    const withers = lintSmoke(goodWalk({ ...behind, taille: { withersH: 0.08 } }));
    assert.equal(withers.smoke, "FAIL");
    assert.ok(withers.reasons.includes("taille-withers"));
    const breathJump = lintSmoke(goodWalk({ ...behind, kind: "breath", pose: "spawn", taille: { samples: [0.27, 0.42] } }));
    assert.equal(breathJump.smoke, "FAIL");
    assert.ok(breathJump.reasons.includes("taille-breath"));
    const hero = lintSmoke(goodWalk({ kind: "walk", taille: { spawnH: 0.27, doorH: 0.7 } }));
    assert.equal(hero.smoke, "FAIL");
    assert.ok(hero.reasons.includes("taille-walk"));
    const doorTiny = lintSmoke(goodWalk({ kind: "walk", taille: { doorH: 0.2 } }));
    assert.equal(doorTiny.smoke, "FAIL");
    assert.ok(doorTiny.reasons.includes("taille-walk"));
    const pairJump = lintSmoke(goodWalk({ pair: { tailleStillEnd: 0.27, tailleStillStart: 0.48 } }));
    assert.equal(pairJump.smoke, "FAIL");
    assert.ok(pairJump.reasons.includes("taille-pair"));
    const lens = lintSmoke(goodWalk({ taille: { lens: "35mm", lastLens: "85mm" } }));
    assert.equal(lens.smoke, "FAIL");
    assert.ok(lens.reasons.includes("taille-lens"));
    const cathedral = lintSmoke(goodWalk({ camera: "behind", posePrimary: "behind", taille: { band: "tiny-cathedral" } }));
    assert.equal(cathedral.smoke, "FAIL");
    assert.ok(cathedral.reasons.includes("taille-band"));
    const banned = lintSmoke(goodWalk({ prompt: `${cooked.prompt} tiny cathedral dolly zoom` }));
    assert.equal(banned.smoke, "FAIL");
    assert.ok(banned.reasons.includes("taille-ban"));
    const ok = lintSmoke(
      goodWalk({
        pose: "spawn",
        kind: "breath",
        camera: "behind",
        posePrimary: "behind",
        taille: {
          bboxH: 0.27,
          withersH: 0.25,
          spawnH: 0.27,
          doorH: 0.38,
          samples: [0.26, 0.27, 0.28],
          stillEndH: 0.27,
          stillStartH: 0.28,
          lens: "35mm",
          lastLens: "35mm",
          height: "1.4m",
          lastHeight: "1.4m",
          distance: "4m",
          lastDistance: "4m",
          band: "lower-third",
        },
      }),
    );
    assert.equal(ok.smoke, "PASS");
    for (const line of SMIR_TAILLE_LOCK) {
      assert.match(line, /taille|Breath|Walk|stillEnd|grow\/shrink/i);
    }
  });

  it("SmiR door architecture — slab / overlay / reach / path / hue FAIL", () => {
    const slab = lintSmoke(goodWalk({ doorArch: { slab: true, hole: false } }));
    assert.equal(slab.smoke, "FAIL");
    assert.ok(slab.reasons.includes("door-slab"));
    const overlay = lintSmoke(goodWalk({ doorArch: { overlayOnly: true } }));
    assert.equal(overlay.smoke, "FAIL");
    assert.ok(overlay.reasons.includes("door-overlay"));
    const reach = lintSmoke(goodWalk({ doorArch: { reach: false } }));
    assert.equal(reach.smoke, "FAIL");
    assert.ok(reach.reasons.includes("door-reach"));
    const path = lintSmoke(goodWalk({ doorArch: { pathH: 0.4, pathFork: false } }));
    assert.equal(path.smoke, "FAIL");
    assert.ok(path.reasons.includes("door-path"));
    const hue = lintSmoke(goodWalk({ doorArch: { hueL: "gold", hueR: "teal" } }));
    assert.equal(hue.smoke, "FAIL");
    assert.ok(hue.reasons.includes("door-hue"));
    const sill = lintSmoke(goodWalk({ kind: "walk", act: "walk", doorArch: { walkSill: "through" } }));
    assert.equal(sill.smoke, "FAIL");
    assert.ok(sill.reasons.includes("door-sill"));
    const ok = lintSmoke(
      goodWalk({
        doorArch: {
          hole: true,
          reveal: true,
          floorContact: true,
          pathFork: true,
          pathH: 0.1,
          foliageClear: true,
          hueL: "teal",
          hueR: "gold",
          massesOnFloor: true,
          pathPixels: true,
          reach: true,
          band: "upper-mid",
          walkSill: "short",
        },
      }),
    );
    assert.equal(ok.smoke, "PASS");
    for (const line of SMIR_DOOR_ARCH_LOCK) assert.match(line, /plate|hole|sill|FAIL|overlay|Spawn|path/i);
  });

  it("SmiR lighting + grade + lock-off heuristics FAIL", () => {
    assert.equal(mayFlipProfileToBack(), false);
    const face = lintSmoke(goodWalk({ light: { faceBrightest: true, eyeGlint: true } }));
    assert.equal(face.smoke, "FAIL");
    assert.ok(face.reasons.includes("light-face"));
    const paw = lintSmoke(goodWalk({ light: { pawStable: false } }));
    assert.equal(paw.smoke, "FAIL");
    assert.ok(paw.reasons.includes("light-paw"));
    const fork = lintSmoke(goodWalk({ light: { forkBrighter: false } }));
    assert.equal(fork.smoke, "FAIL");
    assert.ok(fork.reasons.includes("light-fork"));
    const beauty = lintSmoke(goodWalk({ prompt: `${assemblePrompt(goodSlots()).prompt} beauty dish` }));
    assert.equal(beauty.smoke, "FAIL");
    assert.ok(beauty.reasons.includes("light-beauty"));
    const muzzle = lintSmoke(goodWalk({ prompt: `${assemblePrompt(goodSlots()).prompt} muzzle key` }));
    assert.equal(muzzle.smoke, "FAIL");
    assert.ok(muzzle.reasons.includes("light-beauty"));
    const smash = lintSmoke(goodWalk({ light: { smash: true } }));
    assert.equal(smash.smoke, "FAIL");
    assert.ok(smash.reasons.includes("light-smash"));
    const fog = lintSmoke(goodWalk({ light: { fog: "thick" } }));
    assert.equal(fog.smoke, "FAIL");
    assert.ok(fog.reasons.includes("light-fog"));
    const missLight = lintSmoke(goodWalk({ light: { missStrobe: true } }));
    assert.equal(missLight.smoke, "FAIL");
    assert.ok(missLight.reasons.includes("light-miss"));
    const hue = lintSmoke(goodWalk({ light: { doorHuesMid: false } }));
    assert.equal(hue.smoke, "FAIL");
    assert.ok(hue.reasons.includes("light-hue"));
    const jump = lintSmoke(
      goodWalk({
        rig: {
          doorPairW: 0.42,
          pawsY: 0.78,
          withersY: 0.48,
          midPillarX: 0.5,
          sibling: { doorPairW: 0.55, pawsY: 0.78, withersY: 0.48, midPillarX: 0.5 },
        },
      }),
    );
    assert.equal(jump.smoke, "FAIL");
    assert.ok(jump.reasons.includes("rig-jump"));
    const withers = lintSmoke(goodWalk({ grade: { withersWhite: false, hueL: "teal", hueR: "gold" } }));
    assert.equal(withers.smoke, "FAIL");
    assert.ok(withers.reasons.includes("grade-withers"));
    const de = lintSmoke(goodWalk({ grade: { hueL: "teal", hueR: "gold", withersWhite: true, dE: 3 } }));
    assert.equal(de.smoke, "FAIL");
    assert.ok(de.reasons.includes("grade-de"));
    const hueL = lintSmoke(goodWalk({ grade: { hueL: "gold", hueR: "gold" } }));
    assert.equal(hueL.smoke, "FAIL");
    assert.ok(hueL.reasons.includes("grade-hue"));
    const hueR = lintSmoke(goodWalk({ grade: { hueL: "teal", hueR: "teal" } }));
    assert.equal(hueR.smoke, "FAIL");
    assert.ok(hueR.reasons.includes("grade-hue"));
    const lut = lintSmoke(goodWalk({ grade: { lut: true } }));
    assert.equal(lut.smoke, "FAIL");
    assert.ok(lut.reasons.includes("grade-lut"));
    const apricot = lintSmoke(goodWalk({ prompt: `${assemblePrompt(goodSlots()).prompt} apricot fur` }));
    assert.equal(apricot.smoke, "FAIL");
    assert.ok(apricot.reasons.includes("grade-lut"));
    const duotone = lintSmoke(goodWalk({ grade: { duotone: true } }));
    assert.equal(duotone.smoke, "FAIL");
    assert.ok(duotone.reasons.includes("grade-duotone"));
    const miss = lintSmoke(goodWalk({ grade: { missRed: true } }));
    assert.equal(miss.smoke, "FAIL");
    assert.ok(miss.reasons.includes("grade-miss"));
    const missMono = lintSmoke(goodWalk({ grade: { missMono: true } }));
    assert.equal(missMono.smoke, "FAIL");
    assert.ok(missMono.reasons.includes("grade-miss"));
    const drift = lintSmoke(goodWalk({ grade: { breathStable: false } }));
    assert.equal(drift.smoke, "FAIL");
    assert.ok(drift.reasons.includes("grade-drift"));
    const splice = lintSmoke(goodWalk({ splice: true, cameras: ["profile", "behind"] }));
    assert.equal(splice.smoke, "FAIL");
    assert.ok(splice.reasons.includes("camera-splice"));
    const flip = lintSmoke(goodWalk({ flipCrop: true }));
    assert.equal(flip.smoke, "FAIL");
    assert.ok(flip.reasons.includes("camera-flip"));
    const ok = lintSmoke(
      goodWalk({
        light: {
          faceBrightest: false,
          pawStable: true,
          forkBrighter: true,
          fog: "thin",
          doorHuesMid: true,
          smash: false,
        },
        grade: { hueL: "teal", hueR: "gold", withersWhite: true, dE: 20, breathStable: true },
        rig: {
          doorPairW: 0.42,
          pawsY: 0.78,
          withersY: 0.48,
          midPillarX: 0.5,
          sibling: { doorPairW: 0.43, pawsY: 0.79, withersY: 0.49, midPillarX: 0.51 },
        },
      }),
    );
    assert.equal(ok.smoke, "PASS");
    for (const line of SMIR_LIGHT_LOCK) assert.match(line, /light|face|fork|beauty|paw|teal|haze|chrome/i);
    for (const line of SMIR_GRADE_LOCK) assert.match(line, /teal|gold|duotone|ΔE|split|grade/i);
    for (const line of SMIR_LOCKOFF_LOCK) assert.match(line, /lock-off|splice|flip/i);
    for (const line of SMIR_RIG_LOCK) assert.match(line, /RIG SURVEY|door-pair|paws Y|withers Y|mid-pillar/i);
  });

  it("Howl / Pause / Keep replay skip; stock cached PASS skips", () => {
    assert.equal(shouldSmoke("howl"), false);
    assert.equal(shouldSmoke("pause"), false);
    assert.equal(shouldSmoke("keep"), false);
    assert.equal(shouldSmoke("stock", true), false);
    assert.equal(shouldSmoke("cook"), true);
    assert.equal(shouldSmoke("hang"), true);
    assert.equal(shouldSmoke("enter"), true);
    const skip = lintSmoke(goodWalk({ when: "howl" }));
    assert.equal(skip.smoke, "PASS");
  });
});

describe("Smoke ship-gate — optional bot", () => {
  it("timeout FAIL", async () => {
    const hung: typeof fetch = (_url, init) =>
      new Promise((_, reject) => {
        const signal = init?.signal;
        const boom = () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        };
        if (signal?.aborted) {
          boom();
          return;
        }
        signal?.addEventListener("abort", boom);
      });
    const bot = await hopSmokeBot(
      { seat: "smoke", source: "lint", text: "walk" },
      {
        wakeUrl: "https://smoke.example/wake",
        timeoutMs: 40,
        fetch: hung,
      },
    );
    assert.equal(bot.smoke, "FAIL");
    assert.ok(bot.reasons.includes("timeout"));
  });

  it("unparseable bot FAIL; local lint still runs first", async () => {
    const bad = parseSmokeBot("ok sure");
    assert.equal(bad, null);
    const gate = await runSmokeGate(goodWalk({ cues: [{ side: "A", on: 3, off: 3.1, kind: "walk" }] }), {
      wakeUrl: "https://smoke.example/wake",
      timeoutMs: 40,
      fetch: () => {
        throw new Error("bot should not hop after local FAIL");
      },
    });
    assert.equal(gate.smoke, "FAIL");
    assert.ok(gate.reasons.includes("cue-window"));
    assert.ok(!gate.reasons.includes("timeout"));
  });

  it("parses {pass, reasons[]} and hops PASS after local lint", async () => {
    assert.deepEqual(parseSmokeBot({ pass: true, reasons: [] }), { pass: true, reasons: [] });
    assert.deepEqual(parseSmokeBot({ pass: false, reasons: ["glow"] }), { pass: false, reasons: ["glow"] });
    const gate = await runSmokeGate(goodWalk(), {
      wakeUrl: "https://smoke.example/wake",
      timeoutMs: 200,
      fetch: async () =>
        new Response(JSON.stringify({ pass: true, reasons: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    assert.equal(gate.smoke, "PASS");
    if (gate.smoke === "PASS") assert.equal(gate.attach.railsVersion, "bolt-1");
  });
});

describe("Smoke ship-gate — engine hook + Door seat untouched", () => {
  it("README names the gate; Door hop stays talk-only", () => {
    const gate = readFileSync(join(here, "./smoke-gate.ts"), "utf8");
    const door = readFileSync(join(here, "./door-chat.ts"), "utf8");
    const seats = readFileSync(join(here, "../components/door-chat-line.tsx"), "utf8");
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    const studio = readFileSync(join(here, "../components/cook-studio.tsx"), "utf8");
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    assert.match(gate, /export function lintSmoke/);
    assert.match(gate, /export async function runSmokeGate/);
    assert.match(gate, /export function lintStillPair/);
    assert.match(gate, /export function acceptPlayLibrary/);
    assert.match(gate, /RAILS_VERSION = "bolt-1"/);
    assert.match(gate, /Asteroid HOLD/);
    assert.match(gate, /Door seat stays talk-only/);
    assert.match(gate, /timeout/);
    assert.match(gate, /unparseable-bot/);
    assert.doesNotMatch(gate, /navmesh|voxel/i);
    assert.match(door, /role: "say"/);
    assert.match(door, /id: "door"/);
    assert.doesNotMatch(door, /lintSmoke|runSmokeGate|clipCachePutIfPass/);
    assert.doesNotMatch(seats, /lintSmoke|runSmokeGate/);
    assert.match(readme, /Smoke ship-gate/);
    assert.match(studio, /lintSmoke|gateCookClip/);
    assert.match(engine, /lintEnterClip/);
    assert.match(engine, /smokeForgeFrost/);
    assert.match(engine, /holdEndedPicture/);
    assert.match(engine, /Walk ended — IMMEDIATELY show stillEnd/);
    assert.doesNotMatch(engine, /e\.currentTarget\.removeAttribute\("src"\)/);
    const law = readFileSync(join(here, "./transition.ts"), "utf8");
    assert.match(law, /mayClearVideoSrc/);
    assert.match(law, /assignLiveSrc/);
    assert.match(law, /holdEnded/);
    assert.doesNotMatch(law, /el\.src = ""/);
    assert.equal(mayFlipProfileToBack(), false);
    assert.doesNotMatch(engine, /scaleX\(\s*-1|rotateY\(\s*180|flipProfileToBack/);
    for (const line of [
      ...SMIR_TAILLE_LOCK,
      ...BLACK_HOLE_LOCK,
      ...SMIR_DOOR_ARCH_LOCK,
      ...SMIR_LIGHT_LOCK,
      ...SMIR_GRADE_LOCK,
      ...SMIR_LOCKOFF_LOCK,
      ...SMIR_RIG_LOCK,
    ]) {
      assert.match(readme, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });
});
