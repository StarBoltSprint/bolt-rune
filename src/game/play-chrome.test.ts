import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { playSideHitRect, videoLayoutRect } from "./pcg-input.ts";
import {
  PLAY_CHROME_LABELS,
  PLAY_CHROME_LAW,
  playDoorAt,
  playHitRects,
  playPaintsChrome,
  playPaintsDoorBox,
  playPaintsLabel,
} from "./play-chrome.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("Play chrome — off the film", () => {
  it("play paints no SEATS/FILMS/ROOMS/REFS; Pause/forge may", () => {
    assert.deepEqual([...PLAY_CHROME_LABELS], ["SEATS", "FILMS", "ROOMS", "REFS"]);
    assert.equal(playPaintsChrome("play"), false);
    assert.equal(playPaintsChrome("run"), false);
    assert.equal(playPaintsDoorBox("play"), false);
    for (const label of PLAY_CHROME_LABELS) {
      assert.equal(playPaintsLabel(label, "play"), false);
      assert.equal(playPaintsLabel(label, "forge"), true);
      assert.equal(playPaintsLabel(label, "play", true), true);
    }
    assert.equal(playPaintsChrome("forge"), true);
    assert.equal(playPaintsChrome("play", true), true);
    for (const line of PLAY_CHROME_LAW) {
      assert.match(line, /chrome|SEATS|video-layout|behind|still-pair/i);
    }
  });

  it("play hits are video-layout A/B, not Imagine-baked rectangles", () => {
    assert.equal(playDoorAt(0.2, 0.4), "m1");
    assert.equal(playDoorAt(0.8, 0.4), "m2");
    assert.equal(playDoorAt(0.5, 0.4), null);
    const layout = videoLayoutRect(390, 844);
    const [a, b] = playHitRects(layout);
    assert.equal(a?.side, "A");
    assert.equal(b?.side, "B");
    assert.equal(a?.door, "m1");
    const left = playSideHitRect("A", layout);
    assert.ok(left.w < layout.w * 0.45);
    assert.equal(left.x, layout.x);
  });

  it("engine keeps chrome off play; DoorChatLine / films / rooms / refs are Pause-forge; hits stay logical", () => {
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const seats = readFileSync(join(here, "../components/door-chat-line.tsx"), "utf8");
    const vault = readFileSync(join(here, "../components/vault-hall.tsx"), "utf8");
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    const gate = readFileSync(join(here, "./smoke-gate.ts"), "utf8");
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    const docs = readFileSync(join(here, "../../docs/pcg-anti-3d.md"), "utf8");

    assert.match(engine, /playPaintsChrome\(phase\)/);
    assert.match(engine, /data-play-chrome="off"/);
    assert.match(engine, /data-play-hit="video-layout"/);
    assert.match(engine, /playHitRects|playDoorAt/);
    assert.match(engine, /mayPlaySpawnBreath/);
    assert.match(engine, /recallSmokePass/);
    assert.doesNotMatch(engine, /clipsUI\.length && \(phase === "forge" \|\| phase === "play"\)/);
    const playDoors = engine.slice(engine.indexOf('data-play-chrome="off"'), engine.indexOf("data-doors=\"forge\""));
    assert.doesNotMatch(playDoors, /door-glow-teal|door-glow-enter/);
    assert.match(playDoors, /background: "transparent"/);

    assert.match(seats, /chrome = true/);
    assert.match(seats, /if \(!chrome\) return null/);
    assert.match(vault, /chrome=\{seatChrome\}/);
    assert.match(vault, /onPaused=\{setSeatChrome\}/);
    assert.match(stage, /onPaused\?: \(paused: boolean\) => void/);

    assert.match(gate, /spawn-face/);
    assert.match(gate, /chrome-burn/);
    assert.match(gate, /still-pair/);
    assert.match(gate, /void-frame/);
    assert.match(gate, /lock-off BEHIND only/);
    assert.match(readme, /spawn = lock-off BEHIND still only/);
    assert.match(readme, /Play paints no text chrome/);
    assert.match(docs, /Play chrome/);
    assert.match(docs, /mood\/profile = Vault ref only|Mood and profile/);
    assert.doesNotMatch(engine, /navmesh|voxel/i);
  });
});
