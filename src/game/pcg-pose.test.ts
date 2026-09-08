import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COYOTE_S, expireCue, glowReadable, makePlate } from "./pcg-play.ts";
import {
  RELIC_IS_DOOR_C,
  WALK_APPROACH_S,
  WALK_HIT_OFF_S,
  advancePosePicture,
  applyPoseIntent,
  BREATH_AFTER_WALK_LAW,
  actLoops,
  arrive,
  beginPose,
  continueKeepPose,
  isHallSpawn,
  SPAWN_LAW,
  SPAWN_QUIET_MS,
  spawnGlowRequired,
  breathClip,
  breathCueSheet,
  breathMissesIfIdle,
  cookWaitPose,
  bothDoorsGlow,
  DOOR_COUNT,
  DOOR_LAW,
  NESTED_CYCLES_LAW,
  KEEP_LAW,
  CLIP_LIBRARY_LAW,
  type CitadelKeep,
  PLAY_LEFTOVERS_LAW,
  resolvePlatePath,
  doorLitOf,
  enterClip,
  gradePoseTap,
  HOWL_HOLD_MS,
  HOWL_LAW,
  howlPose,
  centerHowlHit,
  landBreath,
  mayFreezePlate,
  missPose,
  nodeOfPose,
  onBreathLap,
  onEndedPose,
  pausePose,
  plateIsBreath,
  poseAtSide,
  poseBreathLoops,
  poseCues,
  poseFreeze,
  poseOfNode,
  poseOfSide,
  recallPose,
  resetForNewHall,
  resumePose,
  tapPose,
  walkClip,
  walkCueSheet,
  type PoseClipShelf,
  type PoseState,
} from "./pcg-pose.ts";

const here = dirname(fileURLToPath(import.meta.url));

const SHELF: PoseClipShelf = {
  "breath-spawn": "/films/breath-spawn.mp4",
  "breath-A": "/films/breath-a.mp4",
  "breath-B": "/films/breath-b.mp4",
  "walk-spawn-A": "/films/walk-spawn-a.mp4",
  "walk-spawn-B": "/films/walk-spawn-b.mp4",
  "walk-A-B": "/films/walk-a-b.mp4",
  "walk-B-A": "/films/walk-b-a.mp4",
  "enter-A": "/films/enter-a.mp4",
  "enter-B": "/films/enter-b.mp4",
  decay: "/films/decay.mp4",
};

function walking(from: PoseState["pose"] = "spawn", side: "A" | "B" = "A"): PoseState {
  return tapPose(landBreath(from), side, { shelf: SHELF }).state;
}

describe("Citadel pose SM — walkClip + graph", () => {
  it("walkClip is null when already at that door; spawn and cross-hall return ids", () => {
    assert.equal(walkClip("spawn", "A"), "walk-spawn-A");
    assert.equal(walkClip("spawn", "B"), "walk-spawn-B");
    assert.equal(walkClip("atA", "B"), "walk-A-B");
    assert.equal(walkClip("atB", "A"), "walk-B-A");
    assert.equal(walkClip("atA", "A"), null);
    assert.equal(walkClip("atB", "B"), null);
  });

  it("same-door tap uses armed for enter, else stay breath", () => {
    const atA = landBreath("atA");
    const idle = tapPose(atA, "A", { shelf: SHELF });
    assert.equal(idle.act, "stay");
    assert.equal(idle.state.mode, "breath");
    assert.equal(idle.state.pose, "atA");
    const armed = tapPose({ ...atA, armed: { A: true, B: false } }, "A", { shelf: SHELF });
    assert.equal(armed.act, "enter");
    assert.equal(armed.state.mode, "enter");
    assert.equal(armed.state.clip, "enter-A");
    assert.equal(armed.state.pose, "atA");
  });

  it("ships the door law: two sides + arm state, never meshes or door C", () => {
    assert.equal(DOOR_COUNT, 2);
    assert.equal(RELIC_IS_DOOR_C, false);
    const spawnTap = tapPose(beginPose(), "A", { shelf: SHELF });
    assert.equal(spawnTap.act, "walk");
    assert.equal(spawnTap.state.clip, "walk-spawn-A");
    const noClip = tapPose(beginPose(), "A", { shelf: { decay: "/films/decay.mp4" } });
    assert.equal(noClip.act, "decay");
    assert.equal(noClip.state.pose, "spawn");
    const atA = landBreath("atA");
    assert.equal(tapPose(atA, "A", { shelf: SHELF }).act, "stay");
    const armed = { ...atA, armed: { A: true, B: false } as const };
    assert.equal(tapPose(armed, "A", { shelf: SHELF }).act, "enter");
    assert.equal(tapPose(armed, "B", { shelf: SHELF }).act, "walk");
    assert.equal(tapPose(armed, "B", { shelf: SHELF }).state.clip, "walk-A-B");
    const first = poseCues(armed, 6);
    assert.equal(first.filter((c) => c.kind === "enter-arm").length, 1);
    assert.equal(bothDoorsGlow(first), false);
    const lap = poseCues(onBreathLap(armed), 6);
    assert.equal(lap.every((c) => c.side === "none"), true);
    assert.equal(poseCues(walking("spawn", "A"), 6).filter((c) => c.kind === "walk").length, 1);
    assert.equal(bothDoorsGlow(walkCueSheet("A", 6)), false);
    assert.equal(bothDoorsGlow([
      { side: "A", on: 0, off: 2, kind: "walk" },
      { side: "B", on: 1, off: 3, kind: "walk" },
    ]), true);
    const fail = onEndedPose(tapPose(armed, "A", { shelf: SHELF }).state, { enterPass: false });
    assert.equal(fail.pose, "atA");
    assert.equal(fail.armed.A, false);
    assert.equal(doorLitOf(tapPose(beginPose(), "A", { shelf: SHELF }).state, "A"), "lit");
    assert.equal(doorLitOf(armed, "A"), "armed");
    assert.equal(doorLitOf(armed, "B"), "unlit");
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    const pose = readFileSync(join(here, "./pcg-pose.ts"), "utf8");
    for (const line of DOOR_LAW) {
      assert.match(readme, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(pose, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.doesNotMatch(pose, /"atC"|enter-C|walk-[A-Z]-C/);
  });

  it("always two doors; relic is not door C", () => {
    assert.equal(RELIC_IS_DOOR_C, false);
    assert.equal(enterClip("A"), "enter-A");
    assert.equal(enterClip("B"), "enter-B");
    assert.equal(poseOfSide("A"), "atA");
    assert.equal(poseOfNode("m1"), "atA");
    assert.equal(poseOfNode("A"), "atA");
    assert.equal(poseOfNode("m2"), "atB");
    assert.equal(nodeOfPose("atB"), "m2");
    assert.equal(poseAtSide("atA", "A"), true);
    assert.equal(poseAtSide("atA", "B"), false);
    const src = readFileSync(join(here, "./pcg-pose.ts"), "utf8");
    assert.doesNotMatch(src, /"atC"|enter-C|walk-[A-Z]-C/);
  });
});

describe("Citadel pose SM — pose advances onEnded only", () => {
  it("tap far side starts walk but does not arrive until ended", () => {
    const start = beginPose();
    assert.equal(start.pose, "spawn");
    assert.equal(start.mode, "breath");
    const tap = tapPose(start, "A", { shelf: SHELF });
    assert.equal(tap.act, "walk");
    assert.equal(tap.state.mode, "walk");
    assert.equal(tap.state.pose, "spawn");
    assert.equal(tap.state.walkFrom, "spawn");
    assert.equal(tap.state.walkSide, "A");
    assert.equal(tap.state.clip, "walk-spawn-A");
    assert.notEqual(tap.state.pose, "atA");
    const mid = tapPose(tap.state, "A", { shelf: SHELF, mediaT: 2 });
    assert.equal(mid.state.pose, "spawn");
    const landed = onEndedPose(tap.state);
    assert.equal(landed.pose, "atA");
    assert.equal(landed.mode, "breath");
    assert.equal(landed.clip, "breath-A");
    assert.equal(landed.loop, true);
    assert.equal(actLoops("breath"), true);
    assert.equal(arrive("spawn", "A"), "atA");
    assert.equal(arrive("atA", "B"), "atB");
  });

  it("uncached far-side walk fail-forwards stay breath — no spinner", () => {
    const start = beginPose();
    const miss = tapPose(start, "A", { shelf: { decay: "/films/decay.mp4" } });
    assert.equal(miss.act, "decay");
    assert.equal(miss.state.mode, "breath");
    assert.equal(miss.state.pose, "spawn");
    assert.equal(miss.state.loop, true);
    const empty = tapPose(start, "B", { shelf: {} });
    assert.equal(empty.act, "stay");
    assert.equal(empty.state.mode, "breath");
    assert.equal(empty.state.pose, "spawn");
  });
});

describe("Citadel pose SM — armed only on Hit", () => {
  it("Hit during the walk window arms that side; Early / Late do not", () => {
    const walk = walking("spawn", "A");
    const cues = walkCueSheet("A", 6);
    const early = gradePoseTap(walk, "A", 0.4, cues);
    assert.equal(early.hit, "early");
    assert.equal(early.state.armed.A, false);
    const late = gradePoseTap(walk, "A", WALK_HIT_OFF_S + 0.12, cues);
    assert.equal(late.hit, "late");
    assert.equal(late.state.armed.A, false);
    const hit = gradePoseTap(walk, "A", 2.0, cues);
    assert.equal(hit.hit, "hit");
    assert.equal(hit.state.armed.A, true);
    assert.equal(hit.state.armed.B, false);
    assert.equal(hit.state.pose, "spawn");
    const wrong = gradePoseTap(walk, "B", 2.0, cues);
    assert.equal(wrong.hit, "miss");
    assert.equal(wrong.state.armed.B, false);
  });
});

describe("Citadel pose SM — always-breath landing + loop lock", () => {
  it("spawn / Howl / miss / cook-wait / walk end / enter fail land looping breath", () => {
    const spawn = beginPose();
    assert.equal(spawn.mode, "breath");
    assert.equal(spawn.loop, true);
    assert.equal(poseBreathLoops(spawn), true);
    assert.equal(mayFreezePlate(spawn), false);
    assert.equal(plateIsBreath(spawn.clip), true);

    const howl = howlPose(walking());
    assert.equal(howl.mode, "breath");
    assert.equal(howl.pose, "spawn");
    assert.equal(howl.loop, true);
    assert.equal(mayFreezePlate(howl), false);

    const missed = missPose(walking());
    assert.equal(missed.mode, "breath");
    assert.equal(missed.loop, true);

    const cook = cookWaitPose(beginPose(), true);
    assert.equal(cook.mode, "breath");
    assert.equal(cook.waitingOnCook, true);
    assert.equal(cook.loop, true);

    const afterWalk = onEndedPose(walking("spawn", "B"));
    assert.equal(afterWalk.pose, "atB");
    assert.equal(afterWalk.mode, "breath");
    assert.equal(afterWalk.loop, true);
    assert.equal(mayFreezePlate(afterWalk), false);

    const enter = tapPose({ ...landBreath("atB"), armed: { A: false, B: true } }, "B", { shelf: SHELF });
    assert.equal(enter.act, "enter");
    const fail = onEndedPose(enter.state, { enterPass: false });
    assert.equal(fail.mode, "breath");
    assert.equal(fail.pose, "atB");
    assert.equal(fail.loop, true);

    const pass = onEndedPose(enter.state, { enterPass: true });
    assert.equal(pass.pose, "spawn");
    assert.equal(pass.mode, "breath");
    assert.equal(pass.committedHall, true);
    assert.equal(pass.loop, true);

    const seam = onEndedPose(landBreath("atA"));
    assert.equal(seam.mode, "breath");
    assert.equal(seam.pose, "atA");
    assert.equal(seam.loop, true);
    assert.equal(mayFreezePlate(seam), false);
  });

  it("breath cue sheet is side none for the whole plate — no miss if no tap", () => {
    const cues = breathCueSheet(6);
    assert.deepEqual(cues, [{ side: "none", on: 0, off: 6, kind: "breath" }]);
    assert.equal(breathMissesIfIdle(), false);
    assert.equal(expireCue(6.4, cues[0]!, COYOTE_S, null, false), "idle");
    assert.equal(glowReadable(makePlate({ clip: "breath-A", duration: 6, cues })), true);
  });

  it("walk-A sheet is 0–1.5 none, 1.5–2.8 A walk, rest none — one Hit, ends at-A", () => {
    const cues = walkCueSheet("A", 6);
    assert.equal(cues[0]?.side, "none");
    assert.equal(cues[0]?.on, 0);
    assert.equal(cues[0]?.off, WALK_APPROACH_S);
    assert.equal(cues[1]?.side, "A");
    assert.equal(cues[1]?.kind, "walk");
    assert.equal(cues[1]?.on, WALK_APPROACH_S);
    assert.equal(cues[1]?.off, WALK_HIT_OFF_S);
    assert.equal(cues[2]?.side, "none");
    assert.equal(cues[2]?.on, WALK_HIT_OFF_S);
    assert.equal(cues[2]?.off, 6);
    const walkHits = cues.filter((c) => c.kind === "walk");
    assert.equal(walkHits.length, 1);
    const landed = onEndedPose(walking("spawn", "A"));
    assert.equal(landed.pose, "atA");
    assert.equal(glowReadable(makePlate({ clip: "walk-spawn-A", duration: 6, cues })), true);
  });

  it("ticket without enter clip queues cook + decay and stays breath; no Imagine", () => {
    const atA = { ...landBreath("atA"), armed: { A: true, B: false } };
    const queued = tapPose(atA, "A", { shelf: { decay: "/films/decay.mp4" }, ticket: "ticket" });
    assert.equal(queued.act, "decay");
    assert.equal(queued.state.cookQueued, true);
    assert.equal(queued.state.mode, "breath");
    assert.equal(queued.state.loop, true);
    const dry = tapPose(atA, "A", { shelf: {}, ticket: false });
    assert.equal(dry.act, "stay");
    assert.equal(dry.state.mode, "breath");
    const src = readFileSync(join(here, "./pcg-pose.ts"), "utf8");
    assert.doesNotMatch(src, /mayImagine\s*\(|startRuneFilm\s*\(/);
  });

  it("Recall cancels uncommitted cook and returns spawn breath; committedHall stays", () => {
    const cooking = { ...landBreath("atA"), cookQueued: true, committedHall: true, armed: { A: true, B: false } };
    const recalled = recallPose(cooking);
    assert.equal(recalled.pose, "spawn");
    assert.equal(recalled.mode, "breath");
    assert.equal(recalled.cookQueued, false);
    assert.equal(recalled.committedHall, true);
    assert.equal(recalled.armed.A, false);
    assert.equal(recalled.loop, true);
    const fresh = recallPose({ ...landBreath("atB"), cookQueued: true });
    assert.equal(fresh.committedHall, false);
    assert.equal(fresh.pose, "spawn");
  });

  it("Pause freezes clock / prefetch; picture-time ignores wall clock and cook-wait", () => {
    let live = beginPose();
    assert.equal(live.plateTimeMs, 0);
    live = advancePosePicture(live, 400);
    assert.equal(live.pictureMs, 400);
    assert.equal(live.plateTimeMs, 400);
    assert.equal(landBreath(live.pose, live).plateTimeMs, 0);
    const paused = pausePose(live);
    assert.equal(paused.mode, "paused");
    assert.deepEqual(poseFreeze(paused), { pictureTime: true, ca: true, wfc: true, prefetch: true });
    assert.equal(advancePosePicture(paused, 9000).pictureMs, 400);
    assert.equal(poseBreathLoops(paused), true);
    assert.equal(mayFreezePlate(paused), false);
    const back = resumePose(paused);
    assert.equal(back.mode, "breath");
    assert.equal(back.loop, true);
    const waiting = cookWaitPose(live, true);
    assert.equal(advancePosePicture(waiting, 5000).pictureMs, 400);
    const reset = resetForNewHall(live);
    assert.equal(reset.committedHall, true);
    assert.equal(reset.pose, "spawn");
    const realNow = Date.now;
    try {
      Date.now = () => 9_999_999_999_000;
      assert.equal(advancePosePicture(paused, 50_000).pictureMs, 400);
    } finally {
      Date.now = realNow;
    }
  });
});

describe("Citadel pose SM — breath after walk + laps", () => {
  it("ships the six breath-after-walk loop rules in code + README", () => {
    assert.equal(BREATH_AFTER_WALK_LAW.length, 6);
    assert.match(BREATH_AFTER_WALK_LAW[0], /walk ended → pose arrive → play breath\(pose\) with loop=true/);
    assert.match(BREATH_AFTER_WALK_LAW[1], /onEnded while already breath → same breath\(pose\) again/);
    assert.match(BREATH_AFTER_WALK_LAW[2], /loop=true ONLY for breath\|decay/);
    assert.match(BREATH_AFTER_WALK_LAW[3], /NEVER play-once-then-freeze for breath/);
    assert.match(BREATH_AFTER_WALK_LAW[4], /must not recook \/ arm enter \/ raise m \/ advance WFC \/ wall-clock/);
    assert.match(BREATH_AFTER_WALK_LAW[5], /dual-buffer WAAPI transitions \+ stock\/cache-only preload \(max 4\)/);
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    const pose = readFileSync(join(here, "./pcg-pose.ts"), "utf8");
    const docs = readFileSync(join(here, "../../docs/pcg-anti-3d.md"), "utf8");
    for (const line of BREATH_AFTER_WALK_LAW) {
      assert.match(readme, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(pose, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(docs, /breath-A|ALWAYS loops|video\.loop/);
    assert.match(pose, /export function onBreathLap/);
    assert.match(pose, /export function actLoops/);
    assert.equal(actLoops("breath") && actLoops("decay") && !actLoops("walk") && !actLoops("enter"), true);
  });

  it("walk-spawn-A ended plays looping breath-A; breath ended replays same pose", () => {
    const walk = walking("spawn", "A");
    assert.equal(walk.clip, "walk-spawn-A");
    assert.equal(walk.loop, false);
    assert.equal(actLoops("walk"), false);
    assert.equal(actLoops("enter"), false);
    assert.equal(actLoops("breath"), true);
    assert.equal(actLoops("decay"), true);
    const atA = onEndedPose(walk);
    assert.equal(atA.pose, "atA");
    assert.equal(atA.mode, "breath");
    assert.equal(atA.clip, "breath-A");
    assert.equal(atA.loop, true);
    assert.equal(atA.breathLaps, 0);
    assert.equal(poseBreathLoops(atA), true);
    assert.equal(mayFreezePlate(atA), false);
    const lap = onEndedPose(atA);
    assert.equal(lap.pose, "atA");
    assert.equal(lap.clip, "breath-A");
    assert.equal(lap.loop, true);
    assert.equal(lap.breathLaps, 1);
    assert.equal(lap.armed.A, atA.armed.A);
    assert.equal(lap.cookQueued, false);
    const again = onBreathLap(lap);
    assert.equal(again.pose, "atA");
    assert.equal(again.clip, "breath-A");
    assert.equal(again.breathLaps, 2);
  });

  it("tap A during breath-A + armed enters; tap B walks A→B; Howl restarts same pose", () => {
    const atA = { ...landBreath("atA"), armed: { A: true, B: false } };
    const enter = tapPose(atA, "A", { shelf: SHELF });
    assert.equal(enter.act, "enter");
    assert.equal(enter.state.clip, "enter-A");
    assert.equal(enter.state.loop, false);
    const cross = tapPose(atA, "B", { shelf: SHELF });
    assert.equal(cross.act, "walk");
    assert.equal(cross.state.clip, "walk-A-B");
    assert.equal(cross.state.pose, "atA");
    assert.equal(cross.state.armed.A, false);
    assert.equal(cross.state.loop, false);
    const howl = howlPose(atA);
    assert.equal(howl.pose, "atA");
    assert.equal(howl.clip, "breath-A");
    assert.equal(howl.loop, true);
    assert.equal(howl.armed.A, false);
    const midWalk = howlPose(walking("spawn", "A"));
    assert.equal(midWalk.pose, "spawn");
    assert.equal(midWalk.clip, "breath-spawn");
    assert.equal(midWalk.armed.A, false);
    assert.notEqual(midWalk.pose, "atA");
    const paused = pausePose(atA);
    assert.equal(paused.mode, "paused");
    assert.equal(paused.armed.A, true);
    assert.equal(centerHowlHit(0.5, 0.45), true);
    assert.equal(centerHowlHit(0.18, 0.45), false);
    assert.equal(HOWL_HOLD_MS, 420);
    assert.equal(doorLitOf(atA, "A"), "armed");
    assert.equal(doorLitOf(landBreath("atA"), "A"), "unlit");
  });

  it("ships the Howl law in code + README", () => {
    assert.ok(HOWL_LAW.length >= 6);
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    const pose = readFileSync(join(here, "./pcg-pose.ts"), "utf8");
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    for (const line of HOWL_LAW) {
      assert.match(readme, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(pose, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(stage, /function fireHowl/);
    assert.match(stage, /centerHowlHit/);
    assert.match(stage, /HOWL_HOLD_MS/);
    assert.match(stage, /applyHowlMomentum/);
    assert.doesNotMatch(pose.slice(pose.indexOf("export function howlPose"), pose.indexOf("export function recallPose")), /applyRecallMomentum|MISS_LAMBDA/);
  });

  it("ships the spawn law: hall entry is breath-spawn, Continue never mid-cut walk", () => {
    const spawn = beginPose();
    assert.equal(isHallSpawn(spawn), true);
    assert.equal(spawn.pose, "spawn");
    assert.equal(spawn.clip, "breath-spawn");
    assert.equal(spawn.loop, true);
    assert.equal(spawn.pictureMs, 0);
    assert.equal(spawn.mode, "breath");
    assert.equal(spawnGlowRequired(0), false);
    assert.equal(spawnGlowRequired(SPAWN_QUIET_MS - 1), false);
    assert.equal(spawnGlowRequired(SPAWN_QUIET_MS), true);
    const tap = tapPose(spawn, "A", { shelf: SHELF });
    assert.equal(tap.act, "walk");
    assert.notEqual(tap.act, "enter");
    assert.equal(tap.state.pose, "spawn");
    const failEnter = onEndedPose(tapPose({ ...landBreath("atA"), armed: { A: true, B: false } }, "A", { shelf: SHELF }).state, { enterPass: false });
    assert.equal(failEnter.pose, "atA");
    assert.equal(failEnter.committedHall, false);
    const fresh = resetForNewHall(failEnter);
    assert.equal(isHallSpawn(fresh), true);
    assert.equal(fresh.pictureMs, 0);
    const kept = continueKeepPose("atA");
    assert.equal(kept.pose, "atA");
    assert.equal(kept.clip, "breath-A");
    assert.equal(kept.mode, "breath");
    const mid = continueKeepPose(walking("spawn", "A"));
    assert.equal(mid.pose, "spawn");
    assert.equal(mid.clip, "breath-spawn");
    assert.notEqual(mid.mode, "walk");
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    const pose = readFileSync(join(here, "./pcg-pose.ts"), "utf8");
    for (const line of SPAWN_LAW) {
      assert.match(readme, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(pose, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("Enter PASS resets bone picture-time to spawn breath", () => {
    const enter = tapPose({ ...landBreath("atA"), armed: { A: true, B: false }, pictureMs: 50_000 }, "A", { shelf: SHELF });
    const pass = onEndedPose({ ...enter.state, pictureMs: 50_000 }, { enterPass: true });
    assert.equal(pass.pose, "spawn");
    assert.equal(pass.clip, "breath-spawn");
    assert.equal(pass.pictureMs, 0);
    assert.equal(pass.loop, true);
  });
});

describe("Citadel pose SM — nested cycles", () => {
  it("one tap crosses one level; walk ended stays in-room breath; enter PASS resets bone", () => {
    const spawn = beginPose();
    const tap = tapPose(spawn, "A", { shelf: SHELF });
    assert.equal(tap.act, "walk");
    assert.notEqual(tap.act, "enter");
    assert.equal(tap.state.committedHall, false);
    const mid = tapPose(tap.state, "B", { shelf: SHELF });
    assert.equal(mid.act, "stay");
    assert.equal(mid.state.mode, "walk");
    assert.equal(mid.state.clip, "walk-spawn-A");
    const landed = onEndedPose(tap.state);
    assert.equal(landed.mode, "breath");
    assert.equal(landed.pose, "atA");
    assert.equal(landed.committedHall, false);
    const howl = howlPose(landed);
    assert.equal(howl.pose, "atA");
    assert.equal(howl.mode, "breath");
    const recalled = recallPose(landed);
    assert.equal(recalled.pose, "spawn");
    const paused = pausePose(landed);
    assert.equal(advancePosePicture(paused, 10_000).pictureMs, landed.pictureMs);
    const pass = onEndedPose({ ...tapPose({ ...landed, armed: { A: true, B: false } }, "A", { shelf: SHELF }).state, pictureMs: 50_000 }, { enterPass: true });
    assert.equal(pass.pose, "spawn");
    assert.equal(pass.pictureMs, 0);
    assert.equal(RELIC_IS_DOOR_C, false);
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    const pose = readFileSync(join(here, "./pcg-pose.ts"), "utf8");
    const docs = readFileSync(join(here, "../../docs/pcg-anti-3d.md"), "utf8");
    for (const line of NESTED_CYCLES_LAW) {
      assert.match(readme, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(pose, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(docs, /NESTED_CYCLES_LAW|Four nested clocks/);
  });
});

describe("Citadel pose SM — Keep / clip / play leftovers", () => {
  it("locks schema + resolve path; walk never blends; armed dies leaving a door", () => {
    assert.equal(resolvePlatePath({ url: "/films/a.mp4", smoke: "PASS" }), "play");
    assert.equal(resolvePlatePath({ url: "", smoke: "FAIL" }, true), "cook-decay");
    assert.equal(resolvePlatePath({ url: "", smoke: "FAIL" }), "decay");
    assert.equal(actLoops("breath"), true);
    assert.equal(actLoops("decay"), true);
    assert.equal(actLoops("walk"), false);
    assert.equal(actLoops("enter"), false);
    const atA = { ...landBreath("atA"), armed: { A: true, B: false } };
    const cross = tapPose(atA, "B", { shelf: SHELF });
    assert.equal(cross.act, "walk");
    assert.equal(cross.state.armed.A, false);
    assert.equal(cross.state.armed.B, false);
    const landed = onEndedPose(cross.state);
    assert.equal(landed.mode, "breath");
    assert.equal(landed.pose, "atB");
    assert.equal(landed.plateTimeMs, 0);
    const howl = howlPose({ ...atA, mode: "walk", walkFrom: "atA", walkSide: "A" });
    assert.equal(howl.armed.A, false);
    const recalled = recallPose(atA);
    assert.equal(recalled.armed.A, false);
    const decay = missPose(atA);
    assert.equal(decay.pose, "atA");
    const thin: PoseClipShelf = {
      "breath-spawn": SHELF["breath-spawn"],
      "breath-A": SHELF["breath-A"],
      "breath-B": SHELF["breath-B"],
      "walk-spawn-A": SHELF["walk-spawn-A"],
      "walk-spawn-B": SHELF["walk-spawn-B"],
      decay: SHELF.decay,
    };
    const noCross = tapPose(landBreath("atA"), "B", { shelf: thin });
    assert.notEqual(noCross.act, "walk");
    assert.equal(noCross.state.pose, "atA");
    assert.ok(noCross.act === "decay" || noCross.act === "stay");
    const viaRecall = tapPose(recallPose(noCross.state), "B", { shelf: thin });
    assert.equal(viaRecall.act, "walk");
    assert.equal(viaRecall.state.clip, "walk-spawn-B");
    assert.equal(viaRecall.state.pose, "spawn");
    const pass = onEndedPose({ ...atA, mode: "enter", side: "A" }, { enterPass: true });
    assert.equal(pass.pose, "spawn");
    assert.equal(pass.pictureMs, 0);
    const midWalk = walking("spawn", "A");
    const hit = gradePoseTap(midWalk, "A", 2.0, walkCueSheet("A", 6));
    assert.equal(hit.hit, "hit");
    const held = tapPose(hit.state, "A", { shelf: SHELF, mediaT: 2.2 });
    assert.equal(held.act, "stay");
    assert.equal(held.state.mode, "walk");
    assert.notEqual(held.act, "enter");
    assert.notEqual(held.act, "walk");
    const afterWalk = onEndedPose(hit.state);
    assert.equal(afterWalk.mode, "breath");
    assert.equal(afterWalk.pose, "atA");
    assert.equal(afterWalk.plateTimeMs, 0);
    assert.equal(afterWalk.committedHall, false);
    const noDecay = tapPose(landBreath("atA"), "B", { shelf: { "breath-A": "/films/breath-a.mp4" } });
    assert.notEqual(noDecay.act, "walk");
    assert.equal(noDecay.state.pose, "spawn");
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    const pose = readFileSync(join(here, "./pcg-pose.ts"), "utf8");
    const docs = readFileSync(join(here, "../../docs/pcg-anti-3d.md"), "utf8");
    for (const line of [...KEEP_LAW, ...CLIP_LIBRARY_LAW, ...PLAY_LEFTOVERS_LAW]) {
      assert.match(readme, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(pose, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(docs, /KEEP_LAW|CLIP_LIBRARY_LAW/);
    assert.match(pose, /export function resolvePlatePath/);
    assert.match(pose, /chunkA\?: string/);
    assert.match(pose, /stills\?: Partial<Record<CitadelPose/);
    const hall0: CitadelKeep = {
      seed: "skeep01",
      nodes: [{
        id: "h0",
        biome: "forest",
        chunkA: "chunk-a",
        chunkB: "chunk-b",
        poses: ["spawn", "atA", "atB"],
        clips: { "breath-spawn": "/films/breath-spawn.mp4", "breath-A": "/a", "breath-B": "/b", "walk-spawn-A": "/wa", "walk-spawn-B": "/wb", decay: "/d" },
        stills: { spawn: { stillStart: "cook-biome.jpg", stillEnd: "cook-biome.jpg" } },
      }],
      edges: [{ from: "h0", side: "A", to: "h1", clipKey: "enter-A" }],
    };
    assert.equal(hall0.nodes.length, 1);
    assert.equal(hall0.nodes[0]!.poses.length, 3);
    assert.equal(DOOR_COUNT, 2);
    assert.equal(hall0.edges[0]!.side, "A");
  });
});

describe("Citadel pose SM — engine hook + Asteroid HOLD", () => {
  it("helper has no Date.now; FilmStage / rune-engine consume A/B; breath never freeze-after-one-play", () => {
    const pose = readFileSync(join(here, "./pcg-pose.ts"), "utf8");
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    const docs = readFileSync(join(here, "../../docs/pcg-anti-3d.md"), "utf8");
    const seats = readFileSync(join(here, "../components/door-chat-line.tsx"), "utf8");
    assert.match(pose, /HARD LOCK/);
    assert.match(pose, /ALWAYS loops/);
    assert.match(pose, /Never play-once-then-freeze/);
    assert.match(pose, /export function walkClip/);
    assert.match(pose, /export function onEndedPose/);
    assert.match(pose, /export function gradePoseTap/);
    assert.match(pose, /Asteroid HOLD/);
    assert.doesNotMatch(pose, /Date\.now\s*\(|setTimeout\s*\(/);
    assert.doesNotMatch(pose, /navmesh|voxel|WASD|xyz/i);
    assert.match(stage, /applyPoseIntent|tapPose|onEndedPose/);
    assert.match(stage, /poseBreathLoops/);
    assert.match(engine, /applyPoseIntent|tapPose|onEndedPose/);
    assert.match(engine, /poseBreathLoops/);
    assert.match(engine, /mayFreezePlate/);
    assert.match(engine, /onBreathLap/);
    const armFilm = engine.slice(engine.indexOf("function armFilm"), engine.indexOf("function durableStill"));
    assert.match(armFilm, /el\.loop = Boolean\(_loop\)/);
    assert.doesNotMatch(armFilm, /el\.loop = false/);
    const againLoop = engine.slice(engine.indexOf("function againLoop"), engine.indexOf("function startAtSkip"));
    assert.match(againLoop, /onBreathLap/);
    assert.doesNotMatch(againLoop, /cookIdleAt|startRuneFilm/);
    const freezeVis = engine.slice(engine.indexOf("function freezeVis"), engine.indexOf("function stickCover"));
    assert.match(freezeVis, /poseBreathLoops|mayFreezePlate/);
    const holdIdle = engine.slice(engine.indexOf("function holdIdle"), engine.indexOf("async function playEnterThenIdle"));
    assert.doesNotMatch(holdIdle, /freezeVis\(/);
    assert.match(holdIdle, /kickPlay\(breathUrl, true, true\)/);
    assert.match(readme, /pose SM|pose state machine|ALWAYS loops/i);
    assert.match(docs, /pcg-pose/);
    assert.doesNotMatch(seats, /pcg-pose|applyPoseIntent/);
    const cues = poseCues(walking("spawn", "A"), 6);
    assert.equal(cues.filter((c) => c.kind === "walk").length, 1);
  });
});
