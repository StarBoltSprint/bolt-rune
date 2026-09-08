import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hangArtifactOnDoor } from "./enter-graph.ts";
import { assemblePrompt, type PromptSlots } from "./pcg-prompt.ts";
import { clipCachePut, commitHallPrime } from "./pcg-rail.ts";
import {
  CONTINUITY_LOCK,
  PLAY_PLATE_LAW,
  SMIR_TAILLE_LOCK,
  RAILS_VERSION,
  clearSmokeFail,
  clearSmokePass,
  clipCachePutIfPass,
  hangOnDoorIfPass,
  hopSmokeBot,
  lintSmoke,
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

  it("face-on / profile / side spawn play plate is Smoke FAIL", () => {
    const face = lintSmoke(goodWalk({ kind: "breath", pose: "spawn", role: "play", camera: "face-on" }));
    assert.equal(face.smoke, "FAIL");
    assert.ok(face.reasons.includes("spawn-camera") || face.reasons.includes("camera-lock"));
    const profile = lintSmoke(goodWalk({ kind: "breath", pose: "spawn", role: "play", camera: "side-profile" }));
    assert.equal(profile.smoke, "FAIL");
    assert.ok(profile.reasons.includes("spawn-camera") || profile.reasons.includes("camera-lock"));
    const side = lintSmoke(goodWalk({ kind: "breath", pose: "spawn", role: "play", camera: "side" }));
    assert.equal(side.smoke, "FAIL");
    assert.ok(side.reasons.includes("spawn-camera") || side.reasons.includes("camera-lock"));
    const mood = lintSmoke(goodWalk({ kind: "breath", pose: "spawn", role: "vault-ref" }));
    assert.equal(mood.smoke, "FAIL");
    assert.ok(mood.reasons.includes("spawn-mood"));
  });

  it("burned SEATS / FILMS / ROOMS / REFS labels FAIL", () => {
    const labels = lintSmoke(goodWalk({ labels: "SEATS FILMS ROOMS REFS" }));
    assert.equal(labels.smoke, "FAIL");
    assert.ok(labels.reasons.includes("chrome-labels"));
    const prompt = lintSmoke(goodWalk({ prompt: `${assemblePrompt(goodSlots()).prompt} SEATS FILMS` }));
    assert.equal(prompt.smoke, "FAIL");
    assert.ok(prompt.reasons.includes("chrome-labels"));
  });

  it("still-pair mismatch FAIL when both sides of metadata are present", () => {
    const walkBreath = lintSmoke(
      goodWalk({
        pair: { walkStillEnd: "still-walk-end", breathStillStart: "still-breath-other" },
      }),
    );
    assert.equal(walkBreath.smoke, "FAIL");
    assert.ok(walkBreath.reasons.includes("still-pair"));
    const spawnPair = lintSmoke(
      goodWalk({
        pair: { walkSpawnStart: "spawn-walk-0", breathSpawnFrame0: "spawn-breath-1" },
      }),
    );
    assert.equal(spawnPair.smoke, "FAIL");
    assert.ok(spawnPair.reasons.includes("still-pair"));
    const atA = lintSmoke(
      goodWalk({
        pose: "atA",
        pair: { walkStillEnd: "walk-end-a", breathAtAFrame0: "breath-a-other" },
      }),
    );
    assert.equal(atA.smoke, "FAIL");
    assert.ok(atA.reasons.includes("still-pair"));
    const atB = lintSmoke(
      goodWalk({
        pose: "atB",
        slots: goodSlots({ act: "walk-B" }),
        pair: { walkStillEnd: "walk-end-b", breathAtBFrame0: "breath-b-other" },
      }),
    );
    assert.equal(atB.smoke, "FAIL");
    assert.ok(atB.reasons.includes("still-pair"));
    const aligned = lintSmoke(
      goodWalk({
        pair: {
          walkStillEnd: "still-a",
          breathStillStart: "still-a",
          breathAtAFrame0: "still-a",
          walkSpawnStart: "spawn-0",
          breathSpawnFrame0: "spawn-0",
        },
      }),
    );
    assert.equal(aligned.smoke, "PASS");
    const missing = lintSmoke(goodWalk({ pair: { walkStillEnd: "only-one-side" } }));
    assert.equal(missing.smoke, "PASS");
  });

  it("Bolt GROS full white from behind; morph / black / small FAIL", () => {
    const small = lintSmoke(goodWalk({ boltScale: "small" }));
    assert.equal(small.smoke, "FAIL");
    assert.ok(small.reasons.includes("bolt-scale"));
    const black = lintSmoke(goodWalk({ boltCoat: "black" }));
    assert.equal(black.smoke, "FAIL");
    assert.ok(black.reasons.includes("bolt-coat"));
    const morph = lintSmoke(goodWalk({ boltMorph: true }));
    assert.equal(morph.smoke, "FAIL");
    assert.ok(morph.reasons.includes("bolt-morph"));
    const face = lintSmoke(goodWalk({ boltBehind: false }));
    assert.equal(face.smoke, "FAIL");
    assert.ok(face.reasons.includes("bolt-view"));
    const gros = lintSmoke(goodWalk({ boltScale: "gros", boltCoat: "white", boltBehind: true, boltMorph: false }));
    assert.equal(gros.smoke, "PASS");
  });

  it("SmiR HARD LOCK taille/scale — spawn band, breath jump, walk hero, pair, lens", () => {
    const cooked = assemblePrompt(goodSlots());
    const tiny = lintSmoke(goodWalk({ pose: "spawn", kind: "breath", taille: { bboxH: 0.1, spawnH: 0.1 } }));
    assert.equal(tiny.smoke, "FAIL");
    assert.ok(tiny.reasons.includes("taille-spawn"));
    const withers = lintSmoke(goodWalk({ taille: { withersH: 0.08 } }));
    assert.equal(withers.smoke, "FAIL");
    assert.ok(withers.reasons.includes("taille-withers"));
    const breathJump = lintSmoke(
      goodWalk({ kind: "breath", pose: "spawn", taille: { samples: [0.27, 0.42] } }),
    );
    assert.equal(breathJump.smoke, "FAIL");
    assert.ok(breathJump.reasons.includes("taille-breath"));
    const hero = lintSmoke(goodWalk({ kind: "walk", taille: { spawnH: 0.27, doorH: 0.7 } }));
    assert.equal(hero.smoke, "FAIL");
    assert.ok(hero.reasons.includes("taille-walk"));
    const pairJump = lintSmoke(goodWalk({ pair: { tailleStillEnd: 0.27, tailleStillStart: 0.48 } }));
    assert.equal(pairJump.smoke, "FAIL");
    assert.ok(pairJump.reasons.includes("taille-pair"));
    const lens = lintSmoke(goodWalk({ taille: { lens: "35mm", lastLens: "85mm" } }));
    assert.equal(lens.smoke, "FAIL");
    assert.ok(lens.reasons.includes("taille-lens"));
    const cathedral = lintSmoke(goodWalk({ taille: { band: "tiny-cathedral" } }));
    assert.equal(cathedral.smoke, "FAIL");
    assert.ok(cathedral.reasons.includes("taille-band"));
    const banned = lintSmoke(goodWalk({ prompt: `${cooked.prompt} tiny cathedral dolly zoom` }));
    assert.equal(banned.smoke, "FAIL");
    assert.ok(banned.reasons.includes("taille-ban"));
    const ok = lintSmoke(
      goodWalk({
        pose: "spawn",
        kind: "breath",
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
  });

  it("finite hall / sealed biome — infinite corridor FAIL", () => {
    const hall = lintSmoke(goodWalk({ hallFinite: false }));
    assert.equal(hall.smoke, "FAIL");
    assert.ok(hall.reasons.includes("hall-infinite"));
    const corridor = lintSmoke(goodWalk({ corridor: "infinite" }));
    assert.equal(corridor.smoke, "FAIL");
    assert.ok(corridor.reasons.includes("hall-infinite"));
    const sealed = lintSmoke(goodWalk({ hallFinite: true, biomeSealed: true, corridor: "sealed" }));
    assert.equal(sealed.smoke, "PASS");
  });

  it("near-black void mid-clip FAIL", () => {
    const flagged = lintSmoke(goodWalk({ voidMid: true }));
    assert.equal(flagged.smoke, "FAIL");
    assert.ok(flagged.reasons.includes("void-mid"));
    const luma = lintSmoke(goodWalk({ lumaMid: 0.01 }));
    assert.equal(luma.smoke, "FAIL");
    assert.ok(luma.reasons.includes("void-mid"));
    const okLuma = lintSmoke(goodWalk({ lumaMid: 0.22 }));
    assert.equal(okLuma.smoke, "PASS");
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
    const docs = readFileSync(join(here, "../../docs/pcg-anti-3d.md"), "utf8");
    for (const line of [...PLAY_PLATE_LAW, ...CONTINUITY_LOCK, ...SMIR_TAILLE_LOCK]) {
      assert.match(readme, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(docs, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(gate, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });
});
