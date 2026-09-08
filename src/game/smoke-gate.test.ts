import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hangArtifactOnDoor } from "./enter-graph.ts";
import { assemblePrompt, type PromptSlots } from "./pcg-prompt.ts";
import { clipCachePut, commitHallPrime } from "./pcg-rail.ts";
import {
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
  });
});
