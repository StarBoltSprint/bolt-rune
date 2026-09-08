import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DISSOLVE_MAX_MS,
  HOLD_FIRST_MS,
  REDUCED_MOTION_MS,
  clipMissing,
  createDomTransitionPlayer,
  dissolveDuration,
  dissolveFixesEncode,
  planTransition,
  playTransition,
  resetPlateTime,
  runTransition,
  smokeFailed,
  stillsMatch,
  transitionLoops,
  type TransitionIO,
  type TransitionPlan,
} from "./transition.ts";

const here = dirname(fileURLToPath(import.meta.url));

const breathSpawn = {
  clip: "/films/breath-spawn.mp4",
  stillStart: "still-spawn-0",
  stillEnd: "still-spawn-0",
  pose: "spawn" as const,
  biome: "hall-1",
  act: "breath" as const,
};

const walkA = {
  clip: "/films/walk-spawn-a.mp4",
  stillStart: "still-spawn-0",
  stillEnd: "still-walk-a-end",
  pose: "spawn" as const,
  biome: "hall-1",
  act: "walk" as const,
};

const breathA = {
  clip: "/films/breath-a.mp4",
  stillStart: "still-walk-a-end",
  stillEnd: "still-walk-a-end",
  pose: "atA" as const,
  biome: "hall-1",
  act: "breath" as const,
};

const breathABadJoin = {
  ...breathA,
  stillStart: "still-breath-a-0",
};

function ioLog() {
  const calls: string[] = [];
  const io: TransitionIO = {
    fade: (from, to, ms) => {
      calls.push(`fade:${from}->${to}:${ms}`);
    },
    swapUrl: (url, loop) => {
      calls.push(`swap:${url}:${loop}`);
    },
    resetPlateTime: () => {
      calls.push("resetPlateTime");
    },
    play: () => {
      calls.push("play");
    },
  };
  return { calls, io };
}

function stubVideo(src = "") {
  const listeners = new Map<string, Array<() => void>>();
  const style: Record<string, string> = { opacity: "1", pointerEvents: "auto", willChange: "" };
  const el = {
    tagName: "VIDEO",
    src,
    currentSrc: src,
    readyState: 4,
    muted: true,
    playsInline: true,
    loop: false,
    style,
    getAttribute(name: string) {
      return name === "src" ? el.src : null;
    },
    setAttribute(name: string, value: string) {
      if (name === "src") el.src = value;
    },
    addEventListener(type: string, fn: () => void) {
      listeners.set(type, [...(listeners.get(type) || []), fn]);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.set(type, (listeners.get(type) || []).filter((x) => x !== fn));
    },
    animate() {
      return {
        finished: Promise.resolve(),
        cancel() {},
        addEventListener() {},
      };
    },
    play() {
      return Promise.resolve();
    },
    pause() {},
  };
  return el as unknown as HTMLVideoElement;
}

describe("plate transition machine — plan", () => {
  it("stillEnd === stillStart is a cut (0s) and never fades", () => {
    const plan = planTransition(breathSpawn, walkA);
    assert.equal(plan.kind, "cut");
    assert.equal(plan.ms, 0);
    assert.equal(plan.fade, false);
    assert.equal(plan.spinner, false);
    assert.equal(plan.resetPlateTime, true);
    assert.equal(plan.play, true);
    assert.equal(plan.url, walkA.clip);
    assert.equal(plan.loop, false);
  });

  it("breath→breath same pose is a cut even when stills differ", () => {
    const to = { ...breathSpawn, stillStart: "still-spawn-other", stillEnd: "still-spawn-other", clip: "/films/breath-spawn-b.mp4" };
    const plan = planTransition(breathSpawn, to);
    assert.equal(plan.kind, "cut");
    assert.equal(plan.ms, 0);
    assert.equal(plan.fade, false);
    assert.equal(plan.loop, true);
  });

  it("same pose/biome, different stills dissolves in ≤ 280ms (not breath→breath)", () => {
    const from = { ...walkA, stillEnd: "still-walk-other" };
    const plan = planTransition(from, { ...walkA, stillStart: "still-walk-next", clip: "/films/walk-b.mp4", act: "walk" });
    assert.equal(plan.kind, "dissolve");
    assert.ok(plan.fade);
    assert.ok(plan.ms > 0 && plan.ms <= DISSOLVE_MAX_MS);
    assert.equal(plan.ms, 280);
    assert.equal(DISSOLVE_MAX_MS, 280);
    assert.equal(plan.spinner, false);
  });

  it("enter / first dissolve or hold 80ms; decay holds with no fade", () => {
    const enterCut = planTransition(breathA, { ...breathA, act: "enter", clip: "/films/enter-a.mp4", stillStart: breathA.stillEnd });
    assert.equal(enterCut.kind, "cut");
    assert.equal(enterCut.ms, 0);
    assert.equal(enterCut.fade, false);

    const enterHold = planTransition({ clip: "", stillEnd: "", pose: "atA", act: "breath" }, { clip: "/films/enter-a.mp4", pose: "atA", act: "enter" });
    assert.equal(enterHold.kind, "hold");
    assert.equal(enterHold.ms, HOLD_FIRST_MS);
    assert.equal(enterHold.fade, false);

    const decay = planTransition(breathSpawn, { clip: "", act: "decay", pose: "spawn" }, { decayUrl: "/films/decay.mp4" });
    assert.equal(decay.kind, "decay");
    assert.equal(decay.fade, false);
    assert.equal(decay.ms, HOLD_FIRST_MS);
    assert.equal(decay.loop, true);

    const first = planTransition({ clip: "", act: "breath" }, { clip: "/films/breath-spawn.mp4", stillStart: "s0", pose: "spawn", act: "breath" }, { first: true });
    assert.ok(first.kind === "hold" || first.kind === "dissolve");
    assert.ok(first.ms === HOLD_FIRST_MS || first.ms === DISSOLVE_MAX_MS);
    assert.equal(first.loop, true);
  });

  it("prefers-reduced-motion clamps dissolve to 80ms", () => {
    const from = { ...walkA, stillEnd: "still-walk-other" };
    const to = { ...walkA, stillStart: "still-walk-next", clip: "/films/walk-b.mp4", act: "walk" as const };
    const plan = planTransition(from, to, { reducedMotion: true });
    assert.equal(plan.kind, "dissolve");
    assert.equal(plan.ms, REDUCED_MOTION_MS);
    assert.equal(plan.ms, 80);
    assert.equal(dissolveDuration(280, true), 80);
    assert.equal(dissolveDuration(280, false), 280);
  });

  it("missing clip or Smoke FAIL is decay hold, no spinner, no fade", () => {
    const missing = planTransition(breathSpawn, { ...walkA, clip: "" }, { decayUrl: "/films/decay.mp4" });
    assert.equal(missing.kind, "decay");
    assert.equal(missing.decay, true);
    assert.equal(missing.fade, false);
    assert.equal(missing.spinner, false);
    assert.equal(missing.url, "/films/decay.mp4");
    assert.equal(missing.loop, true);

    const fail = planTransition(breathSpawn, walkA, { smoke: { smoke: "FAIL" }, decayUrl: "/films/decay.mp4" });
    assert.equal(fail.kind, "decay");
    assert.equal(fail.fade, false);
    assert.equal(fail.spinner, false);
    assert.equal(smokeFailed({ smoke: "FAIL" }), true);
    assert.equal(clipMissing({ clip: "" }), true);
  });

  it("join pop is encode-mismatch — dissolve cannot fix a bad encode", () => {
    assert.equal(dissolveFixesEncode(), false);
    const good = planTransition({ ...walkA, act: "walk" }, breathA);
    assert.equal(good.joinWarn, null);
    const bad = planTransition({ ...walkA, act: "walk" }, breathABadJoin);
    assert.equal(bad.joinWarn, "encode-mismatch");
    assert.equal(dissolveFixesEncode(), false);
    assert.notEqual(walkA.stillEnd, breathABadJoin.stillStart);
  });

  it("breath destination always loops; walk does not", () => {
    assert.equal(transitionLoops(planTransition(walkA, breathA)), true);
    assert.equal(planTransition(breathSpawn, walkA).loop, false);
    assert.equal(stillsMatch("a", "a"), true);
    assert.equal(stillsMatch("a", "b"), false);
  });
});

describe("plate transition machine — run", () => {
  it("cut IO path skips fade, swaps url, resets plateTime, plays", async () => {
    const { calls, io } = ioLog();
    const plan = planTransition(breathSpawn, walkA);
    assert.equal(plan.fade, false);
    const out = await runTransition(plan, io);
    assert.deepEqual(calls, [`swap:${walkA.clip}:false`, "resetPlateTime", "play"]);
    assert.equal(out.resetPlateTime, true);
    assert.equal(resetPlateTime({ plateTimeMs: 900 }).plateTimeMs, 0);
  });

  it("dissolve IO path fades once (not an 8-step loop)", async () => {
    const { calls, io } = ioLog();
    const from = { ...walkA, stillEnd: "last-frame" };
    const to = { ...walkA, stillStart: "first-frame", clip: "/films/walk-b.mp4", act: "walk" as const };
    const plan = planTransition(from, to);
    assert.equal(plan.kind, "dissolve");
    await runTransition(plan, io);
    assert.equal(calls[0], "fade:last-frame->first-frame:280");
    assert.equal(calls.filter((c) => c.startsWith("fade:")).length, 1);
    assert.ok(calls.includes("resetPlateTime"));
    assert.ok(calls.includes("play"));
  });

  it("decay with no url resets plateTime and never swaps, spins, or fades", async () => {
    const { calls, io } = ioLog();
    const plan = planTransition(breathSpawn, { clip: "", act: "walk", pose: "spawn" });
    assert.equal(plan.kind, "decay");
    assert.equal(plan.fade, false);
    assert.equal(plan.spinner, false);
    await runTransition(plan, io);
    assert.deepEqual(calls, ["resetPlateTime"]);
  });

  it("playTransition is plan then run", async () => {
    const { calls, io } = ioLog();
    await playTransition(breathSpawn, walkA, io);
    assert.ok(calls.includes("resetPlateTime"));
    assert.ok(calls.includes("play"));
  });

  it("createDomTransitionPlayer prepares B before commit; AbortSignal cancels fade", async () => {
    const outgoing = stubVideo("/films/a.mp4");
    const incoming = stubVideo("");
    const player = createDomTransitionPlayer({ outgoing, incoming });
    const plan = planTransition(
      { ...walkA, stillEnd: "last-frame" },
      { ...walkA, stillStart: "first-frame", clip: "/films/walk-b.mp4", act: "walk" },
    );
    assert.equal(plan.fade, true);
    await runTransition(player, plan, "/films/walk-b.mp4");
    assert.equal(incoming.src, "/films/walk-b.mp4");
    assert.equal(outgoing.style.opacity, "0");
    assert.equal(incoming.style.opacity, "1");
    assert.match(outgoing.style.willChange, /opacity/);

    const ctl = new AbortController();
    ctl.abort();
    const again = createDomTransitionPlayer({ outgoing: stubVideo("/a"), incoming: stubVideo("") });
    await runTransition(again, plan, "/films/walk-b.mp4", { signal: ctl.signal });
    const prior = again.signal;
    again.abort();
    assert.equal(prior.aborted, true);
  });
});

describe("plate transition machine — engine hook", () => {
  it("transition.ts is the player; goTo never assigns video.src or setTimeout-fades", () => {
    const pose = readFileSync(join(here, "./pcg-pose.ts"), "utf8");
    const law = readFileSync(join(here, "./transition.ts"), "utf8");
    const barrel = readFileSync(join(here, "./pcg-transition.ts"), "utf8");
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    const docs = readFileSync(join(here, "../../docs/pcg-anti-3d.md"), "utf8");

    assert.match(law, /createDomTransitionPlayer/);
    assert.match(law, /commitIncoming/);
    assert.match(law, /will-change:opacity|willChange = "opacity"/);
    assert.match(law, /AbortSignal/);
    assert.match(law, /prefers-reduced-motion|prefersReducedMotion/);
    assert.match(law, /DISSOLVE_MAX_MS = 280/);
    assert.doesNotMatch(law, /setTimeout\s*\(/);
    assert.doesNotMatch(law, /for\s*\(\s*let i = 0; i < 8/);
    assert.doesNotMatch(law, /Date\.now\s*\(/);
    assert.match(barrel, /createDomTransitionPlayer/);

    const goTo = engine.slice(engine.indexOf("function goTo"), engine.indexOf("function drainQueue"));
    assert.match(goTo, /planTransition\(/);
    assert.match(goTo, /runTransition\(/);
    assert.match(goTo, /createDomTransitionPlayer\(|runTransition\(\s*visFilm/);
    assert.match(goTo, /void playWalk\(id\)/);
    assert.match(goTo, /breathTapWalksNow\(/);
    assert.match(goTo, /prefetchArrivalBreath\(/);
    assert.doesNotMatch(goTo, /\.src\s*=/);
    assert.doesNotMatch(goTo, /video\.src/);

    const playWalk = engine.slice(engine.indexOf("async function playWalk"), engine.indexOf("async function enterDoorBreath"));
    assert.match(playWalk, /planTransition\(|runTransition\(/);
    assert.match(playWalk, /prefetchArrivalBreath\(/);
    assert.doesNotMatch(playWalk, /el\.src\s*=/);

    const holdIdle = engine.slice(engine.indexOf("function holdIdle"), engine.indexOf("async function playEnterThenIdle"));
    assert.match(holdIdle, /planTransition\(|runTransition\(/);
    assert.match(holdIdle, /kickPlay\(breathUrl, true, true\)/);
    assert.doesNotMatch(holdIdle, /spinner/);

    const enterBreath = engine.slice(engine.indexOf("async function enterDoorBreath"), engine.indexOf("async function saveFilms"));
    assert.match(enterBreath, /kickPlay\(url, true, true\)/);
    assert.match(enterBreath, /planTransition\(|runTransition\(/);

    const goNext = stage.slice(stage.indexOf("function goNextPlate"), stage.indexOf("function finish("));
    assert.match(goNext, /planTransition\(/);
    assert.match(goNext, /runTransition\(/);
    assert.match(goNext, /createDomTransitionPlayer\(/);
    assert.doesNotMatch(goNext, /window\.setTimeout\(resolve, ms\)/);
    assert.match(stage, /function armPlate/);
    assert.match(stage, /abortPlateFade|AbortSignal/);

    assert.match(pose, /plateTimeMs/);
    assert.match(readme, /planTransition|plate transition/i);
    assert.match(docs, /pcg-transition|transition\.ts/);

    const fake: TransitionPlan = planTransition(breathSpawn, walkA);
    assert.equal(fake.spinner, false);
    assert.equal(fake.fade, false);
  });
});
