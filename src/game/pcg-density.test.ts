import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FILM_BY_ID } from "./films.ts";
import { BIOME_CATALOG, assembleCookPlate, assemblePrompt, slotsFromEngine } from "./pcg-prompt.ts";
import { beginOnline, collapseStrip } from "./pcg-wfc.ts";
import {
  DENSITY_MISS_LAMBDA,
  awakenLevel,
  awakenMomentum,
  cookDensity,
  densityNoise,
  densityRank,
  fillCookSlots,
  preferLegal,
  slotsFromDensity,
  smoothstep,
  worldLineFor,
} from "./pcg-density.ts";

const here = dirname(fileURLToPath(import.meta.url));

const SEED = "sdensity01abcd";
const PEAK_T = 50_000;
const QUIET_T = 4_000;

describe("EDPCG density / awakening — helper", () => {
  it("high m is denser than low m; miss thins; same seed ignores Date.now", () => {
    const highD = cookDensity({ m: 0.95, runSeed: SEED, pictureTimeMs: PEAK_T });
    const lowD = cookDensity({ m: 0.15, runSeed: SEED, pictureTimeMs: PEAK_T });
    assert.ok(highD > lowD);
    assert.ok(smoothstep(0.95) > smoothstep(0.15));
    const high = slotsFromDensity(highD);
    const low = slotsFromDensity(lowD);
    assert.ok(densityRank(high) > densityRank(low), `${JSON.stringify(high)} vs ${JSON.stringify(low)}`);
    assert.ok(high.trail === "full" || high.trail === "thin");
    assert.equal(low.trail, "none");

    const hit = fillCookSlots({ m: 0.95, runSeed: SEED, pictureTimeMs: PEAK_T });
    const miss = fillCookSlots({ m: 0.95, runSeed: SEED, pictureTimeMs: PEAK_T, miss: true });
    assert.ok(miss.density < hit.density);
    assert.ok(densityRank({ trail: miss.trail, fork: miss.fork, floor: miss.floor }) <= densityRank({
      trail: hit.trail,
      fork: hit.fork,
      floor: hit.floor,
    }));
    assert.ok(slotThinner(miss.trail, hit.trail) || miss.trail === "none" || miss.trail === hit.trail);
    assert.equal(awakenMomentum(0.95, true), 0.95 * DENSITY_MISS_LAMBDA);
    assert.equal(awakenLevel(PEAK_T, 0.95), "peak");
    assert.equal(awakenLevel(PEAK_T, 0.95, true), "quiet");

    const realNow = Date.now;
    try {
      Date.now = () => 1;
      const a = cookDensity({ m: 0.8, runSeed: SEED, pictureTimeMs: PEAK_T });
      Date.now = () => 9_999_999_999_000;
      const b = cookDensity({ m: 0.8, runSeed: SEED, pictureTimeMs: PEAK_T });
      assert.equal(a, b);
      assert.equal(densityNoise(SEED, PEAK_T), densityNoise(SEED, PEAK_T));
    } finally {
      Date.now = realNow;
    }
  });

  it("preferLegal stays inside the role domain", () => {
    assert.equal(preferLegal(["none", "thin"], "full"), "thin");
    assert.equal(preferLegal(["empty"], "crystals-ahead"), "empty");
    assert.equal(preferLegal(["L", "R"], "L+R"), "L");
    assert.equal(preferLegal(["thin", "full"], "none"), "thin");
  });
});

describe("EDPCG density — WFC + prompt plates", () => {
  it("slotsFromEngine: high m denser than low m; miss thins; biome tag holds", () => {
    const high = slotsFromEngine({
      biome: "forest",
      runSeed: SEED,
      seed: SEED,
      i: 0,
      momentum: 0.95,
      pictureTime: QUIET_T,
    });
    const low = slotsFromEngine({
      biome: "forest",
      runSeed: SEED,
      seed: SEED,
      i: 0,
      momentum: 0.12,
      pictureTime: QUIET_T,
    });
    assert.equal(high.biome, "forest");
    assert.equal(low.biome, "forest");
    assert.ok((high.density ?? 0) > (low.density ?? 0));
    assert.ok(
      densityRank({ trail: high.trail, fork: high.fork, floor: high.floor }) >=
        densityRank({ trail: low.trail, fork: low.fork, floor: low.floor }),
    );
    assert.ok(high.trail === "thin" || high.trail === "full" || high.trail === "none");
    assert.equal(low.trail, "none");

    const woke = slotsFromEngine({
      biome: "forest",
      runSeed: SEED,
      i: 4,
      momentum: 1,
      pictureTime: PEAK_T,
      taps: ["hit", "hit", "hit", "hit"],
      pictureTimes: [10_000, 20_000, 30_000, 40_000, PEAK_T],
    });
    const missed = slotsFromEngine({
      biome: "forest",
      runSeed: SEED,
      i: 4,
      momentum: 1,
      miss: true,
      pictureTime: PEAK_T,
      taps: ["hit", "hit", "hit", "miss"],
      pictureTimes: [10_000, 20_000, 30_000, 40_000, PEAK_T],
    });
    assert.equal(woke.biome, "forest");
    assert.equal(missed.biome, "forest");
    assert.equal(woke.awaken, "peak");
    assert.equal(missed.awaken, "quiet");
    assert.match(String(woke.worldLine), /crystal-rich/);
    assert.doesNotMatch(String(missed.worldLine), /crystal-rich/);
    assert.ok(slotThinner(missed.trail, woke.trail) || densityRank({
      trail: missed.trail,
      fork: missed.fork,
      floor: missed.floor,
    }) <= densityRank({ trail: woke.trail, fork: woke.fork, floor: woke.floor }));

    const prompt = assemblePrompt(woke);
    assert.match(prompt.prompt, /Biome: Forest/);
    assert.match(prompt.prompt, /crystal-rich/);
    const quietPrompt = assemblePrompt(low);
    assert.match(quietPrompt.prompt, /Biome: Forest/);
    assert.doesNotMatch(quietPrompt.prompt, /crystal-rich/);
  });

  it("WFC materialize uses density; miss bans peak and thins; asteroid HOLD", () => {
    const high = beginOnline({ s: SEED, n: 6, momentum: 1 });
    const low = beginOnline({ s: SEED, n: 6, momentum: 0.12 });
    const hiCell = high.cells[0]!;
    const loCell = low.cells[0]!;
    assert.ok(densityRank({ trail: hiCell.trail, fork: hiCell.fork, floor: hiCell.floor }) >=
      densityRank({ trail: loCell.trail, fork: loCell.fork, floor: loCell.floor }));

    const missStrip = collapseStrip({ s: SEED, n: 6, momentum: 1, miss: true });
    assert.ok(missStrip.cells.every((c) => c.role !== "peak"));
    assert.ok(missStrip.cells.every((c) => c.trail !== "full" || c.role === "peak"));

    const plate = assembleCookPlate({
      biome: "asteroid",
      runSeed: SEED,
      i: 0,
      momentum: 1,
      pictureTime: PEAK_T,
    });
    assert.equal(plate.slots.biome, "asteroid");
    assert.equal(plate.slots.worldLine, BIOME_CATALOG.asteroid.worldLine);
    assert.match(plate.prompt, /sci-fi asteroid field/);
    assert.doesNotMatch(plate.prompt, /crystal-rich groves/);
  });

  it("helper source, README, no Date.now / XYZ; seats untouched", () => {
    const density = readFileSync(join(here, "./pcg-density.ts"), "utf8");
    const prompt = readFileSync(join(here, "./pcg-prompt.ts"), "utf8");
    const wfc = readFileSync(join(here, "./pcg-wfc.ts"), "utf8");
    const play = readFileSync(join(here, "./pcg-play.ts"), "utf8");
    const seats = readFileSync(join(here, "../components/door-chat-line.tsx"), "utf8");
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    assert.match(density, /export function cookDensity/);
    assert.match(density, /export function fillCookSlots/);
    assert.match(density, /smoothstep\(m\) \* noise/);
    assert.match(density, /Asteroid HOLD/);
    assert.doesNotMatch(density, /Date\.now\s*\(|setTimeout\s*\(/);
    assert.doesNotMatch(density, /navmesh|voxel|heightmap|x,y,z/i);
    assert.match(prompt, /pcg-density/);
    assert.match(prompt, /worldLineFor/);
    assert.match(wfc, /fillCookSlots/);
    assert.match(play, /applyTapObserve/);
    assert.doesNotMatch(seats, /pcg-density|cookDensity|fillCookSlots/);
    assert.match(readme, /EDPCG density|world awakening/i);
    const asteroid = FILM_BY_ID.asteroid.beats.map((beat) => beat.at);
    assert.deepEqual(asteroid, [7.0, 12.3, 16.3, 21.6, 25.6, 30.9, 34.9, 40.2, 44.2, 49.5, 53.5]);
  });
});

function slotThinner(a: string, b: string): boolean {
  const rank = (s: string) => (s === "none" || s === "empty" ? 0 : s === "thin" || s === "L" || s === "R" ? 1 : 2);
  return rank(a) < rank(b);
}
