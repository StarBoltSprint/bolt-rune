import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FILM_BY_ID } from "./films.ts";
import { beginPlayClock, cookWaitPlayClock, gradeTap, pausePlayClock } from "./pcg-play.ts";
import { failSmoke, passSmoke, type SmokeSubject } from "./smoke-gate.ts";
import {
  AUDIO_PLACEHOLDER,
  ENGINE_VOICES,
  applyPlatePolicy,
  applySmokeAudioGate,
  clickTrackMayTick,
  clockFromPlay,
  fireGradeAudio,
  howlOnce,
  mutePictureAudio,
  pictureAudioSnapshot,
  prefetchStockAudio,
  resetPictureAudio,
  setTrailCA,
  syncPictureAudio,
  toggleMutePictureAudio,
} from "./pcg-audio.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("PCG audio — picture-time buses", () => {
  beforeEach(() => resetPictureAudio());

  it("pause freezes both buses; waitingOnCook holds; click track does not tick", () => {
    syncPictureAudio({ playhead: 2.1, paused: false, waitingOnCook: false });
    assert.equal(pictureAudioSnapshot().bedsFrozen, false);
    assert.equal(fireGradeAudio("hit")?.shot, "hit");
    assert.equal(clickTrackMayTick(), true);

    const paused = syncPictureAudio({ playhead: 2.1, paused: true, waitingOnCook: false });
    assert.equal(paused.held, true);
    assert.equal(paused.bedsFrozen, true);
    assert.equal(paused.playhead, 2.1);
    assert.equal(fireGradeAudio("miss"), null);
    assert.equal(clickTrackMayTick(), false);

    const cook = syncPictureAudio({ playhead: 2.1, paused: false, waitingOnCook: true });
    assert.equal(cook.held, true);
    assert.equal(cook.bedsFrozen, true);
    assert.equal(fireGradeAudio("late"), null);
    assert.equal(clickTrackMayTick(), false);

    const clock = cookWaitPlayClock(pausePlayClock(beginPlayClock()), false);
    const fromPlay = clockFromPlay(clock, 7);
    assert.equal(fromPlay.paused, true);
    assert.equal(fromPlay.playhead, 7);
  });

  it("early is silent; idle is bed only; peak has no second drop", () => {
    syncPictureAudio({ playhead: 0.4, paused: false, waitingOnCook: false });
    assert.equal(gradeTap(0.4, { side: "A", on: 2, off: 2.5, kind: "walk" }), "early");
    assert.equal(fireGradeAudio("early"), null);
    assert.equal(pictureAudioSnapshot().lastEngine, null);
    assert.equal(pictureAudioSnapshot().engineEvents.length, 0);
    assert.equal(ENGINE_VOICES.early.kind, "silence");
    assert.equal(ENGINE_VOICES.early.gain, 0);

    assert.equal(fireGradeAudio("idle"), null);
    assert.equal(ENGINE_VOICES.idle.kind, "bed-only");
    assert.equal(fireGradeAudio("peak"), null);
    assert.equal(ENGINE_VOICES.peak.kind, "none");
    assert.equal(pictureAudioSnapshot().engineEvents.length, 0);
  });

  it("grade fires the engine bus from GRADE, not a DAW grid", () => {
    syncPictureAudio({ playhead: 2.1, paused: false, waitingOnCook: false });
    const hit = fireGradeAudio("hit", 2.1);
    assert.equal(hit?.bus, "engine");
    assert.equal(hit?.shot, "hit");
    assert.equal(hit?.playhead, 2.1);
    assert.equal(hit?.audible, true);
    assert.equal(ENGINE_VOICES.hit.kind, "crystal-tick");
    assert.equal(ENGINE_VOICES.hit.pan, 0);

    const late = fireGradeAudio("late", 2.6);
    assert.equal(late?.shot, "late");
    assert.equal(late?.bus, "engine");
    assert.ok(ENGINE_VOICES.late.gain < ENGINE_VOICES.hit.gain);
    assert.equal(ENGINE_VOICES.late.dull, true);
    assert.equal(ENGINE_VOICES.late.pan, 0);

    const miss = fireGradeAudio("miss", 3.1);
    assert.equal(miss?.shot, "miss");
    assert.equal(ENGINE_VOICES.miss.kind, "drain-wind");
    assert.equal(ENGINE_VOICES.miss.buzzer, false);
    assert.equal(ENGINE_VOICES.miss.voice, false);
    assert.equal(ENGINE_VOICES.miss.pan, 0);

    const snap = pictureAudioSnapshot();
    assert.deepEqual(
      snap.engineEvents.map((e) => e.shot),
      ["hit", "late", "miss"],
    );
    assert.equal(snap.placeholder, AUDIO_PLACEHOLDER);
    assert.equal(snap.placeholder, "oscillator");
  });

  it("mute M / system mutes both buses; picture-time still grades", () => {
    syncPictureAudio({ playhead: 2.1, paused: false, waitingOnCook: false });
    mutePictureAudio(true);
    const snap = pictureAudioSnapshot();
    assert.equal(snap.muted.plate, true);
    assert.equal(snap.muted.engine, true);
    assert.equal(snap.held, false);
    assert.equal(fireGradeAudio("hit"), null);
    assert.equal(clickTrackMayTick(), false);

    assert.equal(toggleMutePictureAudio(), false);
    assert.equal(fireGradeAudio("hit")?.shot, "hit");
    assert.equal(pictureAudioSnapshot().muted.plate, false);
    assert.equal(pictureAudioSnapshot().muted.engine, false);
  });

  it("Howl sounds once; Pause freezes beds; trail CA decays over 1 plate", () => {
    syncPictureAudio({ playhead: 4, paused: false, waitingOnCook: false });
    assert.equal(howlOnce()?.shot, "howl");
    assert.equal(howlOnce(), null);
    assert.equal(pictureAudioSnapshot().howlCount, 1);

    setTrailCA("none");
    assert.equal(pictureAudioSnapshot().trailVoice, "thin-bed");
    setTrailCA("thin");
    assert.equal(pictureAudioSnapshot().trailVoice, "light-crackle");
    setTrailCA("full");
    assert.equal(pictureAudioSnapshot().trailVoice, "storm");
    setTrailCA("none");
    assert.equal(pictureAudioSnapshot().trailVoice, "decay-filter");
    assert.equal(pictureAudioSnapshot().decayFilter, 1);
    setTrailCA("none");
    assert.equal(pictureAudioSnapshot().decayFilter, 0);
    assert.equal(pictureAudioSnapshot().trailVoice, "thin-bed");

    setTrailCA("full", "peak");
    setTrailCA("thin", "decay");
    assert.equal(pictureAudioSnapshot().trailVoice, "decay-filter");
  });

  it("plate policy mutes weather on downbeat mismatch / speech / countdown / TAP voice", () => {
    syncPictureAudio({ playhead: 2, paused: false, waitingOnCook: false });
    assert.equal(applyPlatePolicy({ downbeatMismatch: true }), "mismatch-downbeat");
    assert.equal(pictureAudioSnapshot().plateOpen, false);
    resetPictureAudio();
    syncPictureAudio({ playhead: 2, paused: false, waitingOnCook: false });
    assert.equal(applyPlatePolicy({ speech: true }), "speech");
    assert.equal(applyPlatePolicy({ countdown: true }), "countdown");
    assert.equal(applyPlatePolicy({ tapVoice: true }), "tap-voice");
    assert.equal(applyPlatePolicy({}), "open");
  });

  it("prefetch stock decodes audio; never a second Imagine cook; Smoke FAIL mutes", () => {
    const stock = prefetchStockAudio("/ui/forge.mp4");
    assert.equal(stock.decode, true);
    assert.equal(stock.cook, false);
    const imagine = prefetchStockAudio("https://imgen.x.ai/clip.mp4");
    assert.equal(imagine.decode, false);
    assert.equal(imagine.cook, false);
    assert.equal(pictureAudioSnapshot().cook, false);
    assert.deepEqual(pictureAudioSnapshot().prefetch, ["/ui/forge.mp4"]);

    const subject: SmokeSubject = {
      kind: "walk",
      when: "cook",
      clip: "/films/forge-asteroid.mp4",
      still: "/films/cook-asteroid.jpg",
      stillEnd: "/films/cook-asteroid.jpg",
    };
    assert.equal(applySmokeAudioGate(passSmoke(subject)), false);
    assert.equal(applySmokeAudioGate(failSmoke(["cue-window"])), true);
    assert.equal(pictureAudioSnapshot().muted.plate, true);
    assert.equal(pictureAudioSnapshot().muted.engine, true);
  });
});

describe("PCG audio — engine hook + Asteroid HOLD", () => {
  it("module, FilmStage hooks, README, placeholder; seats and asteroid untouched", () => {
    const audio = readFileSync(join(here, "./pcg-audio.ts"), "utf8");
    const impl = readFileSync(join(here, "./audio.ts"), "utf8");
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    const clip = readFileSync(join(here, "./play-clip.ts"), "utf8");
    const seats = readFileSync(join(here, "../components/door-chat-line.tsx"), "utf8");
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    const play = readFileSync(join(here, "./pcg-play.ts"), "utf8");

    assert.match(audio, /Picture stays the clock/);
    assert.match(audio, /export function fireGradeAudio/);
    assert.match(audio, /export function syncPictureAudio/);
    assert.match(audio, /export function howlOnce/);
    assert.match(audio, /export function mutePictureAudio/);
    assert.match(audio, /placeholder Web Audio oscillators/);
    assert.match(audio, /import type \{ SmokeResult \}/);
    assert.match(audio, /Asteroid HOLD/);
    assert.match(audio, /No Pack seats/);
    assert.doesNotMatch(audio, /Date\.now\s*\(|setTimeout\s*\(/);
    assert.doesNotMatch(audio, /navmesh|voxel|StereoPanner|createStereoPanner/i);

    assert.match(impl, /fireGradeAudio|syncPictureAudio/);
    assert.match(impl, /plateGain|engineGain|plateBus|engineBus/);
    assert.match(stage, /syncPictureAudio/);
    assert.match(stage, /fireGradeAudio/);
    assert.match(stage, /howlOnce/);
    assert.match(stage, /toggleMutePictureAudio|mutePictureAudio/);
    assert.match(stage, /prefetchStockAudio/);
    assert.match(clip, /prefetchStockAudio/);

    assert.doesNotMatch(seats, /pcg-audio|fireGradeAudio|playPaused/);
    assert.match(readme, /audio bus|picture-time audio|Plate\/Imagine/i);
    assert.match(readme, /oscillator|placeholder/i);
    assert.match(play, /export function gradeTap/);

    const asteroid = FILM_BY_ID.asteroid.beats.map((beat) => beat.at);
    assert.deepEqual(asteroid, [7.0, 12.3, 16.3, 21.6, 25.6, 30.9, 34.9, 40.2, 44.2, 49.5, 53.5]);
  });
});
