import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FILM_BY_ID } from "./films.ts";
import { picturePhase, pictureTimeMs, mayPeak } from "./pcg-rail.ts";
import { applyTapObserve, beginOnline } from "./pcg-wfc.ts";
import {
  COYOTE_MS,
  COYOTE_MS_MAX,
  COYOTE_MS_MIN,
  COYOTE_S,
  MIN_CUE_WINDOW_S,
  PRE_ON_HIT_S,
  activeCueIndex,
  advancePictureTime,
  afterPlayPlate,
  ALPHA_HIT,
  ALPHA_LATE,
  applyGradeMomentum,
  applyEnterPassMomentum,
  applyHowlMomentum,
  SCORE_LAW,
  RESONANCE_EASE_MS,
  applyRecallMomentum,
  applyPlayTap,
  clampIdleDt,
  idleDecay,
  idleDecayLambda,
  IDLE_DECAY_LAW,
  LAMBDA_IDLE_PER_SEC,
  LAMBDA_IDLE_QUIET,
  M_FLOOR,
  mayIdleDecay,
  mediaWrapDt,
  RECALL_DELTA,
  SPAWN_M,
  tickIdleDecay,
  trailStepOnCross,
  beginPlayClock,
  clearNodeStills,
  commitNodeStill,
  committedPictureTimeMs,
  cookWaitPlayClock,
  coyoteEnd,
  cueFromBeat,
  cuesFromBeats,
  decoderSkipNotMiss,
  endPlateClock,
  expireCue,
  glowContractIssues,
  glowReadable,
  gradeEnterArm,
  gradeTap,
  gradeTapSide,
  hidePlayClock,
  howlAct,
  IDLE_LAMBDA,
  makePlate,
  MISS_LAMBDA,
  mayAdvancePicture,
  mayAdvanceWfc,
  mayEnterArm,
  mayPrefetch,
  noteWalkHit,
  observeFromGrade,
  pauseFreeze,
  pausePlayClock,
  pictureTimeNow,
  plateTapFromGrades,
  playMayPeak,
  playPhase,
  recallStill,
  resonanceFill,
  resonanceTone,
  resumePlayClock,
  type Cue,
  type Plate,
} from "./pcg-play.ts";

const here = dirname(fileURLToPath(import.meta.url));

const walkA: Cue = { side: "A", on: 2, off: 2.5, kind: "walk" };
const walkB: Cue = { side: "B", on: 4, off: 4.5, kind: "walk" };
const breath: Cue = { side: "none", on: 6, off: 6.5, kind: "breath" };
const enterA: Cue = { side: "A", on: 8, off: 8.5, kind: "enter-arm" };

function plateOf(cues: Cue[], duration = 12): Plate {
  return makePlate({
    clip: "/films/asteroid.mp4",
    duration,
    cues,
    stillStart: "/films/asteroid.jpg",
    stillEnd: "/films/asteroid-end.jpg",
  });
}

describe("PCG play-loop — gradeTap", () => {
  it("hit / late / miss / wrong-side / early / pre-on buffer", () => {
    assert.equal(gradeTap(2.1, walkA, COYOTE_S), "hit");
    assert.equal(gradeTap(2, walkA, COYOTE_S), "hit");
    assert.equal(gradeTap(2.5, walkA, COYOTE_S), "hit");
    assert.equal(gradeTap(2 - PRE_ON_HIT_S + 0.01, walkA, COYOTE_S), "hit");
    assert.equal(gradeTap(2 - PRE_ON_HIT_S - 0.05, walkA, COYOTE_S), "early");
    assert.equal(gradeTap(1.2, walkA, COYOTE_S), "early");
    assert.equal(gradeTap(2.5 + 0.2, walkA, COYOTE_S), "late");
    assert.equal(gradeTap(2.5 + COYOTE_S - 0.001, walkA, COYOTE_S), "late");
    assert.equal(gradeTap(2.5 + COYOTE_S + 0.05, walkA, COYOTE_S), "miss");
    assert.equal(gradeTapSide(2.1, walkA, "B", COYOTE_S), "miss");
    assert.equal(gradeTapSide(2.1, walkA, "A", COYOTE_S), "hit");
    assert.equal(gradeTapSide(6.2, breath, "A", COYOTE_S), "hit");
    assert.equal(observeFromGrade("early"), null);
    assert.equal(observeFromGrade("hit"), "hit");
    assert.equal(observeFromGrade("late"), "late");
    assert.equal(observeFromGrade("miss"), "miss");
    assert.equal(observeFromGrade("idle"), "idle");
  });

  it("coyote sits in 180–280ms and cuts at next cue on", () => {
    assert.ok(COYOTE_MS >= COYOTE_MS_MIN && COYOTE_MS <= COYOTE_MS_MAX);
    const nextOn = 2.6;
    assert.equal(coyoteEnd(walkA, 0.23, nextOn), 2.6);
    assert.equal(gradeTap(2.55, walkA, 0.23, nextOn), "late");
    assert.equal(gradeTap(2.61, walkA, 0.23, nextOn), "miss");
    assert.equal(gradeTap(2.5 + 0.17, walkA, 0.18), "late");
    assert.equal(gradeTap(2.5 + 0.27, walkA, 0.28), "late");
    assert.equal(gradeTap(2.5 + 0.36, walkA, 0.375), "late");
    assert.equal(gradeTap(2.2, walkA, 0.375), "hit");
  });

  it("enter-arm only after walk hit on that door", () => {
    let hits = { A: false, B: false };
    assert.equal(mayEnterArm(hits, "A"), false);
    assert.equal(gradeEnterArm(8.2, enterA, hits, COYOTE_S, null, "A"), "miss");
    hits = noteWalkHit(hits, walkA, "early");
    assert.equal(mayEnterArm(hits, "A"), false);
    hits = noteWalkHit(hits, walkA, "hit");
    assert.equal(mayEnterArm(hits, "A"), true);
    assert.equal(mayEnterArm(hits, "B"), false);
    assert.equal(gradeEnterArm(8.2, enterA, hits, COYOTE_S, null, "A"), "hit");
    hits = noteWalkHit(hits, walkB, "hit");
    assert.equal(mayEnterArm(hits, "B"), true);
  });

  it("decoder skip is not a miss", () => {
    assert.equal(decoderSkipNotMiss(1.8, 3.0, walkA), true);
    assert.equal(decoderSkipNotMiss(2.1, 2.2, walkA), false);
    assert.equal(expireCue(3.0, walkA, COYOTE_S, null, true), null);
    assert.equal(expireCue(3.0, walkA, COYOTE_S, null, false), "miss");
    assert.equal(expireCue(7.0, breath, COYOTE_S, null, false), "idle");
    assert.equal(expireCue(2.4, walkA, COYOTE_S), null);
  });

  it("momentum: SmiR alphas — hit asymptotic, late modest down, miss λ=0.70, idle λ=0.95, early ignore", () => {
    const base = 0.7;
    assert.equal(ALPHA_HIT, 0.12);
    assert.equal(ALPHA_LATE, -0.04);
    assert.equal(MISS_LAMBDA, 0.7);
    assert.equal(IDLE_LAMBDA, 0.95);
    assert.equal(applyGradeMomentum(base, "hit"), base + ALPHA_HIT * (1 - base));
    assert.equal(applyGradeMomentum(1, "hit"), 1);
    assert.ok(applyGradeMomentum(0.99, "hit") > 0.99);
    assert.ok(applyGradeMomentum(0.99, "hit") <= 1);
    assert.equal(applyGradeMomentum(base, "late"), base + ALPHA_LATE);
    assert.equal(applyGradeMomentum(base, "early"), base);
    assert.equal(applyGradeMomentum(0, "early"), 0);
    assert.equal(applyGradeMomentum(base, "miss"), base * MISS_LAMBDA);
    assert.equal(applyGradeMomentum(0, "miss"), 0);
    assert.ok(applyGradeMomentum(0.02, "miss") > 0);
    assert.equal(applyGradeMomentum(base, "idle"), base * IDLE_LAMBDA);
    assert.ok(applyGradeMomentum(base, "late") > applyGradeMomentum(base, "miss"));
    assert.ok(applyGradeMomentum(base, "idle") > applyGradeMomentum(base, "miss"));
    assert.equal(observeFromGrade("early"), null);
    assert.equal(plateTapFromGrades(["early", "hit"]), "hit");
    assert.equal(plateTapFromGrades(["hit", "miss"]), "miss");
    assert.equal(plateTapFromGrades(["late"]), "late");
    assert.equal(plateTapFromGrades(["early", "idle"]), "idle");
  });

  it("idleDecay is per media second with wrap, not per frame; Howl is not Recall", () => {
    const m = 0.8;
    assert.equal(LAMBDA_IDLE_PER_SEC, 0.95);
    assert.equal(idleDecay(m, 0), m);
    assert.equal(idleDecay(m, 1), m * 0.95);
    const frame = idleDecay(m, 1 / 60);
    assert.ok(frame > m * 0.95);
    assert.ok(frame < m);
    const manyFrames = idleDecay(m, 1 / 60 * 60);
    assert.ok(Math.abs(manyFrames - m * 0.95) < 1e-9);
    assert.ok(Math.abs(mediaWrapDt(5.9, 0.1, 6) - 0.2) < 1e-9);
    assert.ok(Math.abs(mediaWrapDt(1, 1.2, 6) - 0.2) < 1e-9);
    assert.equal(clampIdleDt(0.9), 0.25);
    assert.equal(mayIdleDecay("breath", false), true);
    assert.equal(mayIdleDecay("walk", false), false);
    assert.equal(mayIdleDecay("breath", true), false);
    assert.equal(idleDecayLambda({ pictureMs: 1000 }), LAMBDA_IDLE_QUIET);
    assert.equal(idleDecayLambda({}), LAMBDA_IDLE_PER_SEC);
    assert.equal(idleDecayLambda({ mode: "decay" }), 0.98);
    assert.equal(idleDecayLambda({ peak: true }), 0.93);
    assert.equal(idleDecay(0.01, 10), M_FLOOR);
    assert.equal(applyRecallMomentum(0.4), 0.4 + RECALL_DELTA);
    assert.equal(applyHowlMomentum(0.4), 0.4);
    assert.notEqual(applyHowlMomentum(0.4), applyGradeMomentum(0.4, "miss"));
    assert.equal(howlAct().cost, 0);
    assert.equal(howlAct().act, "breath");
    assert.ok(SPAWN_M >= 0.15 && SPAWN_M <= 0.25);
    assert.equal(applyEnterPassMomentum(0.9), SPAWN_M);
    assert.ok(applyEnterPassMomentum(0.9) < 0.3);
    assert.equal(IDLE_DECAY_LAW.length, 10);
    const walked = tickIdleDecay(0.8, { paused: false, mode: "walk", currentTime: 1.2, lastSample: 1 });
    assert.equal(walked.m, 0.8);
    assert.equal(walked.dt, 0);
    const froze = tickIdleDecay(0.8, { paused: true, mode: "breath", currentTime: 2, lastSample: 1 });
    assert.equal(froze.m, 0.8);
    const howl = tickIdleDecay(0.8, { paused: false, mode: "breath", currentTime: 2, lastSample: 1 });
    assert.equal(howl.m, idleDecay(0.8, 0.25));
    const recall = tickIdleDecay(0.8, { paused: false, mode: "breath", currentTime: 2, lastSample: 1, justRecalled: true });
    assert.equal(recall.m, 0.8);
    const wrap = tickIdleDecay(0.8, { paused: false, mode: "breath", currentTime: 0.1, lastSample: 5.9, duration: 6 });
    assert.ok(Math.abs(wrap.dt - 0.2) < 1e-9);
    assert.equal(trailStepOnCross(0.8, 0.6, "full").stepped, true);
    assert.equal(trailStepOnCross(0.8, 0.6, "full").trail, "thin");
    assert.equal(trailStepOnCross(0.4, 0.39, "thin").stepped, false);
    assert.equal(trailStepOnCross(0.4, 0.3, "thin").trail, "none");
    assert.equal(trailStepOnCross(0.72, 0.73, "thin").stepped, false);
    assert.equal(trailStepOnCross(0.74, 0.76, "thin").trail, "full");
    const decayTick = tickIdleDecay(0.8, { paused: false, mode: "decay", currentTime: 2, lastSample: 1 });
    assert.equal(decayTick.m, idleDecay(0.8, 0.25, 0.98));
    const quietTick = tickIdleDecay(0.8, { paused: false, mode: "breath", currentTime: 2, lastSample: 1, pictureMs: 1000 });
    assert.equal(quietTick.m, idleDecay(0.8, 0.25, LAMBDA_IDLE_QUIET));
    const peakTick = tickIdleDecay(0.9, { paused: false, mode: "breath", currentTime: 2, lastSample: 1, pictureMs: 50_000, peak: true });
    assert.equal(peakTick.m, idleDecay(0.9, 0.25, 0.93));
    assert.notEqual(peakTick.m, applyGradeMomentum(0.9, "miss"));
    const cookWait = tickIdleDecay(0.8, { paused: true, mode: "breath", currentTime: 2, lastSample: 1, pictureMs: 50_000, peak: true });
    assert.equal(cookWait.m, 0.8);
    const play = readFileSync(join(here, "./pcg-play.ts"), "utf8");
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    for (const line of IDLE_DECAY_LAW) {
      assert.match(play, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(readme, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(stage, /tickIdleDecay/);
    assert.match(stage, /justRecalled: recallSkipRef/);
    assert.match(stage, /pictureMs: pose.pictureMs/);
    assert.match(stage, /peak: playMayPeak/);
    assert.ok(RESONANCE_EASE_MS >= 150 && RESONANCE_EASE_MS <= 200);
    assert.doesNotMatch(play.slice(play.indexOf("export function tickIdleDecay"), play.indexOf("export const TRAIL_FULL_CROSS")), /mayImagine|startRuneFilm|applyTapObserve/);
    const css = readFileSync(join(here, "../styles.css"), "utf8");
    assert.match(css, /width 180ms ease-out/);
    assert.doesNotMatch(css.slice(css.indexOf(".resonance-fill"), css.indexOf("@keyframes resonance-drain")), /#f00|red\b|rgb\(\s*255/);
  });

  it("Resonance fill is smoothstep(m); tone is quiet / lean / peak", () => {
    assert.equal(resonanceFill(0), 0);
    assert.equal(resonanceFill(1), 1);
    assert.equal(resonanceFill(0.5), 0.5);
    assert.ok(resonanceFill(0.25) < 0.25);
    assert.ok(resonanceFill(0.75) > 0.75);
    assert.equal(resonanceTone(0.1, "calm", false), "quiet");
    assert.equal(resonanceTone(0.5, "lean", false), "lean");
    assert.equal(resonanceTone(0.8, "peak", true), "peak");
    assert.equal(resonanceTone(0.2, "calm", true), "peak");
  });
});

describe("PCG play-loop — picture-time clock", () => {
  it("pause / hidden / waitingOnCook freeze time; plate end adds actually-played", () => {
    let clock = beginPlayClock();
    clock = advancePictureTime(clock, 1200);
    assert.equal(pictureTimeNow(clock), 1200);
    assert.equal(mayAdvancePicture(clock), true);
    const paused = pausePlayClock(clock);
    assert.equal(mayAdvancePicture(paused), false);
    assert.equal(pictureTimeNow(advancePictureTime(paused, 8000)), 1200);
    const hidden = hidePlayClock(resumePlayClock(paused), true);
    assert.equal(pictureTimeNow(advancePictureTime(hidden, 4000)), 1200);
    const cook = cookWaitPlayClock(hidePlayClock(resumePlayClock(paused), false), true);
    assert.equal(pictureTimeNow(advancePictureTime(cook, 4000)), 1200);
    const live = cookWaitPlayClock(cook, false);
    const moved = advancePictureTime(live, 300);
    assert.equal(pictureTimeNow(moved), 1500);
    const ended = endPlateClock(moved);
    assert.equal(ended.committedMs, 1500);
    assert.equal(ended.platePlayedMs, 0);
    assert.equal(pictureTimeNow(ended), 1500);
    const freeze = pauseFreeze();
    assert.deepEqual(freeze, { pictureTime: true, ca: true, wfc: true, prefetch: true });
    assert.equal(mayAdvanceWfc(paused), false);
    assert.equal(mayPrefetch(paused), false);
  });

  it("phase reuses pictureTimeMs / mayPeak — wall clock is ignored", () => {
    let clock = beginPlayClock();
    clock = endPlateClock(advancePictureTime(clock, 12_000), 12_000);
    clock = endPlateClock(advancePictureTime(clock, 12_000), 12_000);
    clock = endPlateClock(advancePictureTime(clock, 12_000), 12_000);
    const t = pictureTimeNow(clock);
    assert.equal(t, 36_000);
    assert.equal(t, committedPictureTimeMs([12_000, 12_000, 12_000]));
    assert.equal(t, pictureTimeMs([12_000, 12_000, 12_000]));
    assert.equal(playPhase(clock, 0.9), picturePhase(t, 0.9));
    assert.equal(playMayPeak(clock, 0.9), mayPeak(t, 0.9));
    const realNow = Date.now;
    try {
      Date.now = () => 9_999_999_999_000;
      const paused = pausePlayClock(clock);
      assert.equal(pictureTimeNow(advancePictureTime(paused, 50_000)), 36_000);
      assert.equal(playPhase(paused, 0.9), playPhase(clock, 0.9));
    } finally {
      Date.now = realNow;
    }
  });
});

describe("PCG play-loop — Howl / Recall / glow / WFC", () => {
  beforeEach(() => clearNodeStills());

  it("Howl is breath at $0; Recall is last committed still, not Keep-enter undo", () => {
    const howl = howlAct();
    assert.equal(howl.act, "breath");
    assert.equal(howl.cost, 0);
    const plate = plateOf([walkA]);
    assert.equal(recallStill("node-1", plate), plate.stillEnd);
    commitNodeStill("node-1", "/stills/committed.jpg");
    commitNodeStill("node-1", "/stills/later.jpg");
    assert.equal(recallStill("node-1", plate), "/stills/later.jpg");
    assert.notEqual(recallStill("node-1", plate), plate.stillStart);
  });

  it("Smoke glow helper fails unreadable cue windows", () => {
    assert.equal(glowReadable(plateOf([walkA, walkB, breath], 12)), true);
    const badOn = glowContractIssues(plateOf([{ side: "A", on: 3, off: 3, kind: "walk" }], 10));
    assert.ok(badOn.some((x) => x.reason === "on>=off"));
    const past = glowContractIssues(plateOf([{ side: "A", on: 9, off: 11, kind: "walk" }], 10));
    assert.ok(past.some((x) => x.reason === "off>duration"));
    const thin = glowContractIssues(
      plateOf([{ side: "A", on: 1, off: 1 + MIN_CUE_WINDOW_S - 0.05, kind: "walk" }], 10),
    );
    assert.ok(thin.some((x) => x.reason === "window<0.35s"));
    assert.equal(glowReadable(plateOf([{ side: "A", on: 3, off: 2, kind: "walk" }], 10)), false);
  });

  it("grades feed applyTapObserve — miss bans peak; empty domain fail-forwards decay", () => {
    const strip = beginOnline({ s: "splayloop01", n: 6, momentum: 1 });
    const afterMiss = applyPlayTap(strip, 3, "miss", 1, 40_000);
    assert.ok(!afterMiss.wave.domains[4]!.includes("peak"));
    assert.ok(!afterMiss.wave.domains[5]!.includes("peak"));
    const viaObserve = applyTapObserve(strip, 3, "miss", 1, 40_000);
    assert.equal(afterMiss.wave.domains[4]!.includes("peak"), viaObserve.wave.domains[4]!.includes("peak"));
    const emptied = applyPlayTap(strip, 0, "hit", 0.4, 10_000);
    emptied.wave.domains[1] = [];
    emptied.wave.collapsed[1] = null;
    const rescued = afterPlayPlate(emptied, 0, "idle", 0.4, 10_000);
    assert.ok(rescued.wave.collapsed[1] === "decay" || rescued.wave.collapsed[1] === "breath");
    assert.ok(rescued.cells[1]);
  });

  it("active cue prefers the live window; beats map to A/B walk cues", () => {
    const cues = [walkA, walkB, breath];
    assert.equal(activeCueIndex(cues, 2.1, COYOTE_S, []), 0);
    assert.equal(activeCueIndex(cues, 4.2, COYOTE_S, [true, false, false]), 1);
    const fromBeat = cueFromBeat({ at: 7, win: 0.72, kind: "left", lane: "l" }, 15);
    assert.equal(fromBeat.side, "A");
    assert.equal(fromBeat.kind, "walk");
    assert.ok(fromBeat.off - fromBeat.on >= MIN_CUE_WINDOW_S);
    const sheet = cuesFromBeats(FILM_BY_ID.asteroid.beats, 60);
    assert.ok(sheet.length >= 1);
  });
});

describe("PCG play-loop — engine hook + Asteroid HOLD", () => {
  it("helper source and README name the play-loop; FilmStage grades cues; seats untouched", () => {
    const play = readFileSync(join(here, "./pcg-play.ts"), "utf8");
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    const css = readFileSync(join(here, "../styles.css"), "utf8");
    const seats = readFileSync(join(here, "../components/door-chat-line.tsx"), "utf8");
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    const wfc = readFileSync(join(here, "./pcg-wfc.ts"), "utf8");
    assert.match(play, /export function gradeTap/);
    assert.match(play, /export function mayAdvancePicture/);
    assert.match(play, /export function howlAct/);
    assert.match(play, /export function applyHowlMomentum/);
    assert.match(play, /export function recallStill/);
    assert.match(play, /export function pausePlayClock/);
    assert.match(play, /ALPHA_HIT = 0\.12/);
    assert.match(play, /ALPHA_LATE = -0\.04/);
    assert.match(play, /MISS_LAMBDA = 0\.70/);
    assert.match(play, /IDLE_LAMBDA = 0\.95/);
    assert.match(play, /export function applyEnterPassMomentum/);
    assert.match(play, /SCORE_LAW/);
    for (const line of SCORE_LAW) {
      assert.match(play, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(readme, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    assert.match(engine, /applyEnterPassMomentum/);
    assert.match(play, /export function idleDecay/);
    assert.match(play, /LAMBDA_IDLE_PER_SEC/);
    assert.match(play, /applyTapObserve/);
    assert.match(play, /Asteroid HOLD/);
    assert.doesNotMatch(play, /Date\.now\s*\(|setTimeout\s*\(/);
    assert.doesNotMatch(play, /navmesh|voxel/i);
    assert.match(stage, /gradeTap|gradeTapSide|gradeEnterArm/);
    assert.match(stage, /applyTapObserve|afterPlate|afterPlayPlate|applyPlayTap/);
    assert.match(stage, /pausePlayClock|playPaused/);
    assert.match(stage, /howlAct/);
    assert.match(stage, /recallStill/);
    assert.match(stage, /data-resonance="m"|data-m=/);
    assert.match(stage, /resonance-chrome/);
    assert.match(stage, /resonanceFill/);
    const resonance = stage.slice(stage.indexOf("function Resonance"), stage.indexOf("function CueFill"));
    assert.doesNotMatch(resonance, /COMBO|combo|score|pace|wifi|ticket|cook/i);
    assert.match(css, /resonance-drain/);
    assert.match(css, /data-paused/);
    assert.match(css, /left: 9%/);
    assert.doesNotMatch(seats, /pcg-play|gradeTap|playPaused/);
    assert.match(readme, /play-loop|cue sheet|cue-sheet/i);
    assert.match(readme, /α_hit|alpha_hit|ALPHA_HIT|0\.12/i);
    assert.match(readme, /Resonance/i);
    assert.match(wfc, /applyTapObserve/);
    const asteroid = FILM_BY_ID.asteroid.beats.map((beat) => beat.at);
    assert.deepEqual(asteroid, [7.0, 12.3, 16.3, 21.6, 25.6, 30.9, 34.9, 40.2, 44.2, 49.5, 53.5]);
  });
});
