import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FILM_BY_ID } from "./films.ts";
import { mayEnterArm, playMayPeak, beginPlayClock, gradeTap } from "./pcg-play.ts";
import { playCoyoteS, defaultPlayA11y, flashCap, PLAY_A11Y_LABEL } from "./pcg-a11y.ts";
import {
  CENTER_HI,
  CENTER_LO,
  EDGE_GUTTER_PX,
  FRAME_ASPECT,
  centerTapIntent,
  chromePauseOnly,
  contactInLayout,
  inResonanceBar,
  isDoubleTap,
  isLocomotionKey,
  keyPlayAct,
  laneOfSide,
  mapPlayContact,
  mayDoubleTapEnter,
  resolvePlayPointer,
  swipeSideOf,
  videoLayoutRect,
  zoneOfX,
} from "./pcg-input.ts";
import { fireGradeHaptic, hapticForGrade, hapticForSide, hapticPattern, mayHaptic } from "./pcg-haptics.ts";

const here = dirname(fileURLToPath(import.meta.url));
const walkA = { side: "A" as const, on: 2, off: 2.5, kind: "walk" as const };

describe("PCG input — video layout hit math", () => {
  it("contains 9:16 and pillarboxes landscape so A/B are picture-left/right", () => {
    const portrait = videoLayoutRect(390, 844);
    assert.ok(Math.abs(portrait.w / portrait.h - FRAME_ASPECT) < 1e-6);
    assert.equal(portrait.x, 0);
    assert.ok(portrait.y > 0);

    const land = videoLayoutRect(844, 390);
    assert.ok(Math.abs(land.w / land.h - FRAME_ASPECT) < 1e-6);
    assert.ok(land.x > 0);
    assert.equal(land.y, 0);

    const origin = { left: 0, top: 0 };
    const leftPic = contactInLayout(land.x + land.w * 0.1, land.y + 10, origin, land);
    const rightPic = contactInLayout(land.x + land.w * 0.9, land.y + 10, origin, land);
    const leftDevice = contactInLayout(8, 10, origin, land);
    assert.equal(leftPic.inside, true);
    assert.equal(zoneOfX(leftPic.nx), "A");
    assert.equal(zoneOfX(rightPic.nx), "B");
    assert.equal(leftDevice.inside, false);
  });

  it("default bands are ~40/20/40; widen is 50/50; Resonance is dead", () => {
    assert.equal(CENTER_LO, 0.4);
    assert.equal(CENTER_HI, 0.6);
    assert.equal(zoneOfX(0.2), "A");
    assert.equal(zoneOfX(0.5), "center");
    assert.equal(zoneOfX(0.8), "B");
    assert.equal(zoneOfX(0.45, true), "A");
    assert.equal(zoneOfX(0.55, true), "B");
    assert.equal(inResonanceBar(0.5, 0.99), true);
    assert.equal(inResonanceBar(0.5, 0.5), false);
    const layout = videoLayoutRect(390, 844);
    const res = mapPlayContact({
      clientX: 195,
      clientY: layout.y + layout.h * 0.99,
      viewport: { left: 0, top: 0, w: 390, h: 844 },
      layout,
    });
    assert.equal(res.zone, "resonance");
  });

  it("device gutters ignore (no miss); outside picture is Pause", () => {
    const layout = videoLayoutRect(844, 390);
    const gutter = mapPlayContact({
      clientX: EDGE_GUTTER_PX - 2,
      clientY: 200,
      viewport: { left: 0, top: 0, w: 844, h: 390 },
      layout,
    });
    assert.equal(gutter.zone, "gutter");
    const outside = mapPlayContact({
      clientX: 40,
      clientY: 200,
      viewport: { left: 0, top: 0, w: 844, h: 390 },
      layout,
    });
    assert.equal(outside.zone, "outside");
    assert.equal(resolvePlayPointer({ zone: "outside" }).act, "pause");
    assert.equal(resolvePlayPointer({ zone: "gutter" }).act, "ignore");
    assert.equal(resolvePlayPointer({ zone: "resonance" }).act, "ignore");
  });

  it("short center tap ignores; long-press / Howl key is breath; swipe = that side", () => {
    assert.equal(centerTapIntent("short", "hold"), "ignore");
    assert.equal(centerTapIntent("long", "hold"), "howl");
    assert.equal(centerTapIntent("short", "tap"), "howl");
    assert.equal(resolvePlayPointer({ zone: "center", center: "short" }).act, "ignore");
    assert.equal(resolvePlayPointer({ zone: "center", center: "long" }).act, "howl");
    assert.equal(swipeSideOf(-40), "A");
    assert.equal(swipeSideOf(40), "B");
    assert.equal(swipeSideOf(8), null);
    assert.equal(resolvePlayPointer({ zone: "center", swipe: "A" }).act, "grade");
  });

  it("double-tap enter only if armed; one grade otherwise", () => {
    assert.equal(mayDoubleTapEnter(false, true), false);
    assert.equal(mayDoubleTapEnter(true, true), true);
    assert.equal(mayEnterArm({ A: false, B: false }, "A"), false);
    const prev = { side: "A" as const, playhead: 8.1 };
    assert.equal(isDoubleTap(prev, { side: "A", playhead: 8.3 }), true);
    assert.equal(isDoubleTap(prev, { side: "B", playhead: 8.3 }), false);
    const blocked = resolvePlayPointer({ zone: "A", side: "A", prev, playhead: 8.3, armed: false });
    assert.equal(blocked.act, "grade");
    const enter = resolvePlayPointer({ zone: "A", side: "A", prev, playhead: 8.3, armed: true });
    assert.equal(enter.act, "enter");
  });

  it("keyboard is sides / Howl / Recall / Pause / mute — not WASD locomotion", () => {
    assert.deepEqual(keyPlayAct("ArrowLeft"), { kind: "side", side: "A" });
    assert.deepEqual(keyPlayAct("KeyA"), { kind: "side", side: "A" });
    assert.deepEqual(keyPlayAct("ArrowRight"), { kind: "side", side: "B" });
    assert.deepEqual(keyPlayAct("KeyD"), { kind: "side", side: "B" });
    assert.deepEqual(keyPlayAct("KeyH"), { kind: "howl" });
    assert.deepEqual(keyPlayAct("KeyR"), { kind: "recall" });
    assert.deepEqual(keyPlayAct("Escape"), { kind: "pause" });
    assert.deepEqual(keyPlayAct("KeyM"), { kind: "mute" });
    assert.equal(keyPlayAct("KeyW"), null);
    assert.equal(keyPlayAct("KeyS"), null);
    assert.equal(keyPlayAct("ArrowUp"), null);
    assert.equal(keyPlayAct("AudioVolumeUp"), null);
    assert.equal(isLocomotionKey("KeyW"), true);
    assert.equal(isLocomotionKey("KeyA"), false);
    assert.equal(laneOfSide("A"), "l");
    assert.equal(chromePauseOnly(null), false);
  });
});

describe("PCG haptics — same cue sheet", () => {
  it("grades map to patterns; A and B share intensity; cue-on default off", () => {
    assert.equal(hapticForGrade("hit"), "hit");
    assert.equal(hapticForGrade("late"), "late");
    assert.equal(hapticForGrade("miss"), "miss");
    assert.equal(hapticForGrade("early"), null);
    assert.deepEqual(hapticForSide("A", "hit"), hapticForSide("B", "hit"));
    assert.equal(hapticPattern("cue-on"), null);
    assert.ok(hapticPattern("cue-on", { cueOn: true }));
    assert.equal(hapticPattern("pause"), null);
    assert.equal(hapticPattern("ticket"), null);
    assert.equal(mayHaptic({ muted: true }), false);
    assert.equal(mayHaptic({ reduceMotion: true }), false);
    assert.equal(mayHaptic({ systemOff: true }), false);
    assert.equal(fireGradeHaptic("hit", { muted: true }), null);
    const ev = fireGradeHaptic("miss");
    assert.equal(ev?.shot, "miss");
    assert.ok((ev?.pattern.length || 0) >= 2);
  });
});

describe("PCG a11y — assist Late, no free peak", () => {
  it("larger coyote is still Late and does not grant peak", () => {
    const a11y = defaultPlayA11y();
    a11y.coyoteAssist = true;
    const coyote = playCoyoteS(a11y);
    assert.ok(coyote >= 0.35 && coyote <= 0.4);
    assert.equal(gradeTap(2.5 + 0.36, walkA, coyote), "late");
    assert.equal(gradeTap(2.2, walkA, coyote), "hit");
    const clock = beginPlayClock();
    clock.committedMs = 10_000;
    assert.equal(playMayPeak(clock, 0.2), false);
    assert.equal(flashCap({ ...a11y, reduceFlash: true }, 8), 1);
    assert.equal(PLAY_A11Y_LABEL.surface.includes("Left or right"), true);
    assert.equal(a11y.captions, false);
  });
});

describe("PCG input — engine hook + Asteroid HOLD", () => {
  it("FilmStage uses layout coords; Resonance dead; seats untouched", () => {
    const input = readFileSync(join(here, "./pcg-input.ts"), "utf8");
    const haptics = readFileSync(join(here, "./pcg-haptics.ts"), "utf8");
    const a11y = readFileSync(join(here, "./pcg-a11y.ts"), "utf8");
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    const seats = readFileSync(join(here, "../components/door-chat-line.tsx"), "utf8");
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    const css = readFileSync(join(here, "../styles.css"), "utf8");

    assert.match(input, /VIDEO LAYOUT/);
    assert.match(input, /object-fit contain/);
    assert.match(input, /No XYZ/);
    assert.match(input, /Asteroid HOLD/);
    assert.match(input, /export function videoLayoutRect/);
    assert.match(input, /export function mapPlayContact/);
    assert.match(input, /export function mayDoubleTapEnter/);
    assert.doesNotMatch(input, /Date\.now\s*\(/);
    assert.doesNotMatch(input, /navmesh|voxel/i);
    assert.doesNotMatch(input, /KeyW.*KeyA.*KeyS.*KeyD/);

    assert.match(haptics, /same cue sheet/);
    assert.match(haptics, /must NOT encode A vs B/);
    assert.match(haptics, /OFF by default/);
    assert.match(haptics, /queueMicrotask/);

    assert.match(a11y, /no sound, no haptics/);
    assert.match(a11y, /No auto-Hit/);

    assert.match(stage, /videoLayoutRect|mapPlayContact/);
    assert.match(stage, /fireGradeHaptic/);
    assert.match(stage, /data-play-frame="9:16"/);
    assert.match(stage, /playCoyoteS/);
    assert.match(stage, /mayDoubleTapEnter|resolvePlayPointer/);
    assert.match(stage, /aria-label=\{PLAY_A11Y_LABEL.surface\}|Play film\. Left or right/);
    assert.doesNotMatch(stage, /nearSpot\(nx, ny, cuePictureSpot/);
    assert.doesNotMatch(stage, /setLook\(/);
    assert.doesNotMatch(stage, /code === "KeyW"/);

    assert.match(css, /play-surface/);
    assert.match(css, /touch-action:\s*none/);
    assert.match(css, /pointer-events:\s*none/);

    assert.doesNotMatch(seats, /pcg-input|mapPlayContact|playPaused/);
    assert.match(readme, /video layout|9:16|Howl/i);
    assert.match(readme, /short dead-center tap/i);

    const asteroid = FILM_BY_ID.asteroid.beats.map((beat) => beat.at);
    assert.deepEqual(asteroid, [7.0, 12.3, 16.3, 21.6, 25.6, 30.9, 34.9, 40.2, 44.2, 49.5, 53.5]);
  });
});
