import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FILM_BY_ID } from "./films.ts";
import { FORK_IDS, FLOOR_IDS, TRAIL_IDS, assembleCookPlate, slotsFromEngine } from "./pcg-prompt.ts";
import { pcgHash } from "./pcg-rail.ts";
import {
  PEAK_SECS,
  PLATE_ROLES,
  QUIET_SECS,
  WFC_MOMENTUM_TAU,
  actFromRole,
  cellTime,
  collapsePlateCell,
  collapseStrip,
  forceDecay,
  hash01,
  inQuietWindow,
  initWave,
  observe,
  peakWindowOk,
  propagate,
  trailLegal,
} from "./pcg-wfc.ts";

const here = dirname(fileURLToPath(import.meta.url));

const SEEDS = [
  "sreplay01abcd",
  "sreplay02efgh",
  "sforestwalka1",
  "smissidle0001",
  "speakwindow01",
  "sleanfork0001",
  "sdecaybone001",
  "squiethold001",
  "sactbone00001",
  "sactbone00002",
];

function manyStrips(over: Parameters<typeof collapseStrip>[0] = { s: "s0" }) {
  return SEEDS.map((s, n) => collapseStrip({ n: 6, momentum: 0.9, ...over, s: over.s && n === 0 ? over.s : s }));
}

describe("PCG role-WFC — observe / propagate / decay", () => {
  it("exposes observe, propagate, and contradiction → decay", () => {
    const wave = initWave({ s: "sobserve01", n: 6, momentum: 0.2 });
    const shot = observe(wave, "sobserve01");
    assert.ok(shot.cell >= 0);
    assert.ok(PLATE_ROLES.includes(shot.role!));
    assert.equal(shot.wave.collapsed[shot.cell], shot.role);
    const prop = propagate(shot.wave, shot.cell);
    assert.equal(prop.contradiction, false);
    const forced = forceDecay(initWave({ s: "sforce01", n: 6 }));
    assert.ok(forced.collapsed.every((role) => role === "decay"));
  });

  it("quiet window 0–8s cannot be peak|enter and must allow calm", () => {
    for (const strip of manyStrips({ s: "s0", momentum: 1 })) {
      for (const cell of strip.cells) {
        if (inQuietWindow(cell.i, strip.plateSecs)) {
          assert.ok(cell.t < QUIET_SECS);
          assert.notEqual(cell.role, "peak");
          assert.notEqual(cell.role, "enter");
        }
      }
      const zero = initWave({ s: strip.s, n: strip.n, momentum: 1 });
      assert.ok(zero.domains[0]!.includes("calm"));
      assert.ok(!zero.domains[0]!.includes("peak"));
      assert.ok(!zero.domains[0]!.includes("enter"));
    }
  });

  it("miss / idle bans peak before observe", () => {
    for (const strip of manyStrips({ s: "s0", momentum: 1, miss: true })) {
      assert.ok(strip.cells.every((cell) => cell.role !== "peak"));
    }
    for (const strip of manyStrips({ s: "s0", momentum: 1, idle: true })) {
      assert.ok(strip.cells.every((cell) => cell.role !== "peak"));
    }
    const banned = initWave({ s: "smiss01", n: 6, momentum: 1, miss: true });
    assert.ok(banned.domains.every((d) => !d.includes("peak")));
  });

  it("trail never jumps none → full (momentum chaining)", () => {
    for (const strip of manyStrips({ s: "s0", momentum: 1 })) {
      for (let i = 1; i < strip.cells.length; i++) {
        const prev = strip.cells[i - 1]!;
        const cell = strip.cells[i]!;
        assert.equal(trailLegal(prev.trail, cell.trail, cell.role), true, `${prev.trail}→${cell.trail} @${i} ${cell.role}`);
        assert.ok(!(prev.trail === "none" && cell.trail === "full"));
      }
    }
  });

  it("same seed + acts replays the strip", () => {
    const opts = { s: "sreplay01abcd", n: 6, momentum: 0.85, miss: false } as const;
    const a = collapseStrip(opts);
    const b = collapseStrip(opts);
    assert.deepEqual(
      a.cells.map((c) => [c.role, c.fork, c.trail, c.floor, c.relic, c.stock]),
      b.cells.map((c) => [c.role, c.fork, c.trail, c.floor, c.relic, c.stock]),
    );
    assert.equal(hash01("sreplay01abcd", 2, 0), hash01("sreplay01abcd", 2, 0));
    assert.equal(hash01("sreplay01abcd", 2, 0), parseInt(pcgHash(["sreplay01abcd", 2, 0]).slice(0, 8), 16) / 0xffffffff);
    const miss = collapseStrip({ ...opts, miss: true });
    assert.ok(miss.cells.every((c) => c.role !== "peak"));
  });

  it("peak only if t reaches 45s and m ≥ τ; relic only on peak + high noise", () => {
    const low = collapseStrip({ s: "speaklow01", n: 6, momentum: 0.2 });
    assert.ok(low.cells.every((c) => c.role !== "peak"));
    const high = collapseStrip({ s: "speakhi01xx", n: 6, momentum: 1 });
    for (const cell of high.cells) {
      if (cell.role === "peak") {
        assert.equal(peakWindowOk(cell.i, high.plateSecs, 1), true);
        assert.ok(cellTime(cell.i, high.plateSecs) + high.plateSecs > PEAK_SECS);
        assert.equal(cell.fork, "L+R");
        assert.equal(cell.trail, "full");
        assert.equal(cell.floor, "crystals-ahead");
      } else {
        assert.equal(cell.relic, false);
      }
    }
    assert.ok(!high.cells.some((c) => c.role === "peak" && c.i === 0));
  });

  it("default strip has no enter; adjacency never calm after peak or peak after decay", () => {
    for (const strip of manyStrips({ s: "s0", momentum: 0.95 })) {
      assert.ok(strip.cells.every((c) => c.role !== "enter"));
      for (let i = 1; i < strip.cells.length; i++) {
        const prev = strip.cells[i - 1]!.role;
        const role = strip.cells[i]!.role;
        if (prev === "peak") assert.notEqual(role, "calm");
        if (prev === "decay") assert.notEqual(role, "peak");
      }
    }
  });

  it("contradiction path is decay + stock, never a spinner", () => {
    const forced = forceDecay(initWave({ s: "scontra01", n: 5, momentum: 0 }));
    const strip = collapseStrip({ s: "scontra01", n: 5, momentum: 0, miss: true, idle: true });
    assert.equal(forced.collapsed.length, 5);
    assert.equal(strip.cells.length, 5);
    assert.ok(strip.cells.every((c) => PLATE_ROLES.includes(c.role)));
    assert.ok(FORK_IDS.includes(strip.cells[0]!.fork));
    assert.ok(TRAIL_IDS.includes(strip.cells[0]!.trail));
    assert.ok(FLOOR_IDS.includes(strip.cells[0]!.floor));
  });
});

describe("PCG role-WFC — cook / bone hook + Asteroid HOLD", () => {
  it("collapsed roles fill assemblePrompt slots (enums only)", () => {
    const { cell } = collapsePlateCell({ s: "scookcell01", i: 0, momentum: 0.3 });
    assert.equal(cell.i, 0);
    assert.notEqual(cell.role, "peak");
    const plate = assembleCookPlate({ biome: "forest", cookAct: 0, runSeed: "scookcell01", i: 0, momentum: 0.3 });
    assert.equal(plate.lint.ok, true);
    assert.ok(FORK_IDS.includes(plate.slots.fork));
    assert.ok(TRAIL_IDS.includes(plate.slots.trail));
    assert.ok(FLOOR_IDS.includes(plate.slots.floor));
    assert.equal(plate.slots.fork, cell.fork);
    assert.equal(plate.slots.trail, cell.trail);
    assert.equal(plate.slots.floor, cell.floor);
    assert.equal(plate.wfc?.role, cell.role);
    assert.equal(actFromRole("decay"), "decay");
    const miss = assembleCookPlate({
      biome: "asteroid",
      cookAct: 4,
      runSeed: "scookmiss01",
      i: 4,
      momentum: 1,
      miss: true,
    });
    assert.notEqual(miss.wfc?.role, "peak");
    const enter = slotsFromEngine({
      biome: "forest",
      tap: "enter",
      from: "m1",
      to: "spawn",
      leftover: true,
      seed: "senterwfc1",
      i: 3,
    });
    assert.equal(enter.act, "enter");
    assert.ok(FORK_IDS.includes(enter.fork));
  });

  it("cook path wires strip collapse; seats untouched; asteroid HOLD", () => {
    const prompt = readFileSync(join(here, "./pcg-prompt.ts"), "utf8");
    const wfc = readFileSync(join(here, "./pcg-wfc.ts"), "utf8");
    const cook = readFileSync(join(here, "./cook.ts"), "utf8");
    const lib = readFileSync(join(here, "../lib/cook.ts"), "utf8");
    const studio = readFileSync(join(here, "../components/cook-studio.tsx"), "utf8");
    const seats = readFileSync(join(here, "../components/door-chat-line.tsx"), "utf8");
    assert.match(prompt, /collapsePlateCell/);
    assert.match(wfc, /observe\(/);
    assert.match(wfc, /propagate\(/);
    assert.match(wfc, /forceDecay/);
    assert.match(wfc, /pcgHash/);
    assert.match(wfc, /Asteroid HOLD/);
    assert.doesNotMatch(wfc, /chat\.completions|startCookPlate|citadelPrompt/);
    assert.match(cook, /assembleCookPlate/);
    assert.match(lib, /cooked\.wfc\?\.stock/);
    assert.match(lib, /runSeed: data\.runSeed/);
    assert.match(studio, /runSeed: run/);
    assert.doesNotMatch(seats, /pcg-wfc|collapseStrip|collapsePlateCell/);
    const asteroid = FILM_BY_ID.asteroid.beats.map((beat) => beat.at);
    assert.deepEqual(asteroid, [7.0, 12.3, 16.3, 21.6, 25.6, 30.9, 34.9, 40.2, 44.2, 49.5, 53.5]);
  });
});
