import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SMIR_STILL_PAIR_MATCH,
  STILL_PAIR_CLIP,
  edgeKindOf,
  matchPose,
  type PixelBuf,
} from "./still-pair-match.ts";

const here = dirname(fileURLToPath(import.meta.url));

type Plot = (x: number, y: number, r: number, g: number, b: number) => void;

function makeStill(w: number, h: number, paint: (set: Plot, w: number, h: number) => void): PixelBuf {
  const data = new Uint8ClampedArray(w * h * 4);
  const set: Plot = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  };
  paint(set, w, h);
  return { width: w, height: h, data };
}

function fillRect(set: Plot, x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number) {
  const xa = Math.floor(Math.min(x0, x1));
  const xb = Math.ceil(Math.max(x0, x1));
  const ya = Math.floor(Math.min(y0, y1));
  const yb = Math.ceil(Math.max(y0, y1));
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) set(x, y, r, g, b);
  }
}

type HallOpts = {
  dogX?: number;
  dogH?: number;
  dogW?: number;
  profile?: boolean;
  hall?: "same" | "enter";
  wash?: "none" | "teal" | "gold";
  black?: boolean;
};

function hallStill(opts: HallOpts = {}): PixelBuf {
  const W = 90;
  const H = 160;
  if (opts.black) {
    return makeStill(W, H, (set, w, h) => {
      fillRect(set, 0, 0, w, h, 0, 0, 0);
    });
  }
  return makeStill(W, H, (set, w, h) => {
    const enter = opts.hall === "enter";
    if (enter) fillRect(set, 0, 0, w, h, 12, 48, 40);
    else fillRect(set, 0, 0, w, h, 30, 26, 34);
    const doorY0 = Math.floor(h * 0.16);
    const doorY1 = Math.floor(h * 0.46);
    if (enter) {
      fillRect(set, 4, doorY0 + 6, 18, doorY1 - 4, 10, 90, 80);
      fillRect(set, w - 22, doorY0 + 10, w - 2, doorY1, 90, 40, 20);
      fillRect(set, 0, 0, w, Math.floor(h * 0.22), 8, 70, 62);
    } else {
      fillRect(set, 8, doorY0, 26, doorY1, 18, 158, 168);
      fillRect(set, w - 26, doorY0, w - 8, doorY1, 198, 148, 38);
    }
    fillRect(set, Math.floor(w * 0.36), Math.floor(h * 0.7), Math.floor(w * 0.64), Math.floor(h * 0.76), 70, 130, 118);

    const cx = w * (opts.dogX ?? 0.5);
    if (opts.profile) {
      const dw = w * 0.46;
      const dh = h * 0.11;
      const x0 = cx - dw / 2;
      const y0 = h * 0.8 - dh / 2;
      fillRect(set, x0, y0, x0 + dw, y0 + dh, 236, 236, 240);
    } else {
      const dw = w * (opts.dogW ?? 0.2);
      const dh = h * (opts.dogH ?? 0.26);
      const x0 = cx - dw / 2;
      const y0 = h * 0.92 - dh;
      fillRect(set, x0, y0, x0 + dw, y0 + dh, 238, 238, 242);
      if (opts.wash === "teal") {
        fillRect(set, x0 + dw * 0.2, y0, x0 + dw * 0.8, y0 + dh * 0.3, 20, 170, 180);
      }
      if (opts.wash === "gold") {
        fillRect(set, x0 + dw * 0.2, y0, x0 + dw * 0.8, y0 + dh * 0.3, 210, 160, 40);
      }
    }
  });
}

describe("SmiR still-pair matcher — cheap rig + back-silhouette", () => {
  it("matching back stills PASS; law cites silhouette not skeletal dog", () => {
    const a = hallStill();
    const b = hallStill();
    const got = matchPose(a, b, "breath");
    assert.equal(got.ok, true, got.why.join(","));
    assert.equal(got.why.length, 0);
    assert.ok(got.measures?.backA);
    assert.ok(got.measures?.backB);
    assert.ok((got.measures?.hallSsim || 0) > 0.85);
    for (const line of SMIR_STILL_PAIR_MATCH) {
      assert.match(line, /rig \+ back-silhouette|not skeletal dog/i);
    }
    assert.equal(STILL_PAIR_CLIP, false);
    assert.equal(edgeKindOf("enter"), "enter");
    assert.equal(edgeKindOf("breath", "walk"), "walk-breath");
    assert.equal(edgeKindOf("walk"), "walk-breath");
  });

  it("profile vs back FAIL yaw / not-back", () => {
    const back = hallStill();
    const profile = hallStill({ profile: true });
    const got = matchPose(back, profile, "breath");
    assert.equal(got.ok, false);
    assert.ok(got.why.includes("spawn-profile") || got.why.includes("not-back"), got.why.join(","));
    assert.equal(got.measures?.backA, true);
    assert.equal(got.measures?.backB, false);
  });

  it("black / empty FAIL void + no-dog", () => {
    const back = hallStill();
    const black = hallStill({ black: true });
    const dark = matchPose(back, black, "breath");
    assert.equal(dark.ok, false);
    assert.ok(dark.why.includes("void-frame") || dark.why.includes("no-dog"), dark.why.join(","));
    const empty = matchPose(back, { width: 0, height: 0, data: new Uint8ClampedArray(0) }, "decay");
    assert.equal(empty.ok, false);
    assert.ok(empty.why.includes("void-frame"));
    assert.ok(empty.why.includes("no-dog"));
  });

  it("walk dest allows place drift; breath loop stays tight", () => {
    const spawn = hallStill({ dogX: 0.5, dogH: 0.26 });
    const dest = hallStill({ dogX: 0.36, dogH: 0.34 });
    const walk = matchPose(spawn, dest, "walk-breath");
    assert.equal(walk.ok, true, walk.why.join(","));
    assert.ok((walk.measures?.dPlace || 0) > 0.08);
    const breath = matchPose(spawn, dest, "breath");
    assert.equal(breath.ok, false);
    assert.ok(breath.why.includes("still-pair-dest") || breath.why.includes("taille-pair"), breath.why.join(","));
    const loop = matchPose(spawn, hallStill({ dogX: 0.5, dogH: 0.26 }), "breath");
    assert.equal(loop.ok, true, loop.why.join(","));
  });

  it("enter allows low hall SSIM; yaw still back", () => {
    const hereHall = hallStill();
    const nextHall = hallStill({ hall: "enter" });
    const enter = matchPose(hereHall, nextHall, "enter");
    assert.equal(enter.ok, true, enter.why.join(","));
    assert.ok((enter.measures?.hallSsim || 1) < 0.7);
    const breath = matchPose(hereHall, nextHall, "breath");
    assert.equal(breath.ok, false);
    assert.ok(breath.why.includes("hall-drift") || breath.why.includes("rig-jump"), breath.why.join(","));
    const profileEnter = matchPose(hereHall, hallStill({ hall: "enter", profile: true }), "enter");
    assert.equal(profileEnter.ok, false);
    assert.ok(profileEnter.why.includes("spawn-profile") || profileEnter.why.includes("not-back"));
  });

  it("does not live on the play thread; docs cite the one-liner", () => {
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const match = readFileSync(join(here, "./still-pair-match.ts"), "utf8");
    const gate = readFileSync(join(here, "./smoke-gate.ts"), "utf8");
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    const docs = readFileSync(join(here, "../../docs/pcg-anti-3d.md"), "utf8");
    const studio = readFileSync(join(here, "../components/cook-studio.tsx"), "utf8");
    const arts = readFileSync(join(here, "./artifacts.ts"), "utf8");
    assert.doesNotMatch(engine, /matchPose|still-pair-match/);
    assert.match(match, /match rig \+ back-silhouette, not skeletal dog/);
    assert.doesNotMatch(match, /function opticalFlow|computeSMPL|autoFlipProfile|flipProfileToBack/);
    assert.match(gate, /matchPose|lintStillPairPixels|stillPair/);
    assert.match(studio, /stillPair/);
    assert.match(arts, /stillPair/);
    assert.match(readme, /match rig \+ back-silhouette, not skeletal dog/);
    assert.match(docs, /still-pair-match|back-silhouette/);
  });
});
