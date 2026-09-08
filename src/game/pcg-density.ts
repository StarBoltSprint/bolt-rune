/**
 * EDPCG density / world awakening — cook slots, not terrain.
 * density = smoothstep(m) * noise(runSeed, pictureTime)
 * Success chains wake the picture. Miss → λm, thinner trail.
 * Same biome tag; enter still required for Hall′ biome hop.
 * EDPCG reads play sensors (m, picture-time, last grade, mode) and writes ONLY the
 * next plate's allowed set + slots. Idle ticks do not recook breath or steal camera.
 * Asteroid HOLD. No Pack seats. No XYZ. No Date.now.
 */

import { mayPeak, pcgHash, picturePhase, type PicturePhase } from "./pcg-rail.ts";
import type { FloorSlot, ForkSlot, GrammarBiomeId, TrailSlot } from "./pcg-prompt.ts";

/** EDPCG coupling — ship text. Tests lock these lines. */
export const EDPCG_LAW = [
  "EDPCG is not a separate director. It reads same sensors as play (m, picture-time, last grade, mode) and writes ONLY into the next plate's allowed set + slots.",
  "Never steals camera or skips a miss.",
  "phase = f(picture-time): quiet|lean|peak-window|after",
  "allowed = tiles(phase) ∩ tiles(m) ∩ tiles(lastGrade)",
  "Quiet 0–8s: still no peak even if high m. Peak-window ≥45s: peak may enter domain only if m high. After miss: decay forced first.",
  "Idle decay during breath can drop peak out of domain even at t=50s — generator does not owe lightning.",
  "onEnded walk/breath → next role + slot enums (do NOT recook plate that just played)",
  "start of next walk → prompt slots from m (do NOT change pose graph)",
  "miss → ban peak 1–2 cells (do NOT skip decay plate)",
  "Idle tick → nothing until next walk (do NOT swap breath every 0.05 m).",
  "enter PASS → reset phase + m low (do NOT carry peak into Hall′).",
  "Breath loops reuse SAME stock clip. EDPCG stamps upcoming walk only.",
  "On tap walk: domain=wfc.reweight(phase,m,lastGrade); role=observe; slots=ca.step; play stock.",
  "Decoupled on purpose: doors A/B, Keep graph (only enter PASS), rails/dog, credits (peak slots on existing walk file — no Imagine to chase curve).",
  "If EDPCG needs a new node to feel good, design failed — density on current hall is the actuator.",
] as const;

/** Cook-slot miss thin. Play-loop grade miss uses `MISS_LAMBDA` 0.70 in `pcg-play`. */
export const DENSITY_MISS_LAMBDA = 0.32;
export const DENSITY_IDLE_LAMBDA = 0.62;

export type AwakenLevel = "quiet" | "awake" | "peak";

export type DensitySlots = {
  trail: TrailSlot;
  fork: ForkSlot;
  floor: FloorSlot;
};

export type DensityCook = DensitySlots & {
  density: number;
  awaken: AwakenLevel;
  phase: PicturePhase;
};

function clamp01(n: number) {
  const x = Number(n) || 0;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

function num(n: number | null | undefined) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

/** Hermite smoothstep of momentum. Cook curve, not terrain. */
export function smoothstep(m: number, lo = 0, hi = 1): number {
  const span = hi - lo;
  const x = clamp01((clamp01(m) - lo) / (span || 1));
  return x * x * (3 - 2 * x);
}

/**
 * Seeded noise on the picture-time clock.
 * Same (runSeed, t) → same u. Never Date.now.
 */
export function densityNoise(runSeed: string, pictureTimeMs: number): number {
  const t = Math.max(0, Math.round(num(pictureTimeMs)));
  const u = parseInt(pcgHash([String(runSeed || "s0"), "awaken", t]).slice(0, 8), 16) / 0xffffffff;
  /** Keep m in charge: noise modulates, it does not zero a high-m plate. */
  return 0.4 + 0.6 * u;
}

/** Miss → λm. Idle milder. Play-loop may already have decayed m; flag still thins cook slots. */
export function awakenMomentum(m: number, miss = false, idle = false): number {
  const cur = clamp01(m);
  if (miss) return clamp01(cur * DENSITY_MISS_LAMBDA);
  if (idle) return clamp01(cur * DENSITY_IDLE_LAMBDA);
  return cur;
}

/** density = smoothstep(m) * noise(runSeed, pictureTime). Cook slots, not terrain. */
export function cookDensity(opts: {
  m: number;
  runSeed: string;
  pictureTimeMs: number;
  miss?: boolean;
  idle?: boolean;
}): number {
  const m = awakenMomentum(opts.m, Boolean(opts.miss), Boolean(opts.idle));
  return clamp01(smoothstep(m) * densityNoise(opts.runSeed, opts.pictureTimeMs));
}

function slotRank(slot: string): number {
  if (slot === "none" || slot === "empty") return 0;
  if (slot === "thin" || slot === "L" || slot === "R") return 1;
  if (slot === "full" || slot === "L+R" || slot === "crystals-ahead") return 2;
  return 0;
}

/** Closest legal slot to `want` by density rank. Role/WFC domains stay the law. */
export function preferLegal<T extends string>(legal: readonly T[], want: T): T {
  if (!legal.length) return want;
  if (legal.includes(want)) return want;
  const target = slotRank(want);
  let best = legal[0]!;
  let bestD = Infinity;
  for (const opt of legal) {
    const d = Math.abs(slotRank(opt) - target);
    if (d < bestD) {
      bestD = d;
      best = opt;
    }
  }
  return best;
}

export function densityRank(slots: DensitySlots): number {
  return slotRank(slots.trail) + slotRank(slots.fork) + slotRank(slots.floor);
}

/** Trail / fork / floor from density. Enums only — never free LLM text. */
export function slotsFromDensity(density: number, sideU = 0.5): DensitySlots {
  const d = clamp01(density);
  const trail: TrailSlot = d < 0.28 ? "none" : d < 0.62 ? "thin" : "full";
  const fork: ForkSlot = d < 0.4 ? "none" : d < 0.72 ? (sideU >= 0.5 ? "R" : "L") : "L+R";
  const floor: FloorSlot = d >= 0.5 ? "crystals-ahead" : "empty";
  return { trail, fork, floor };
}

/**
 * Quiet / awake / peak from phase × m. Miss/idle stay quiet.
 * Peak worldLine only in the 45–90s window with high m — not a biome hop.
 */
export function awakenLevel(pictureTimeMs: number, m: number, miss = false, idle = false): AwakenLevel {
  if (miss || idle) return "quiet";
  const mom = clamp01(m);
  const t = Math.max(0, num(pictureTimeMs));
  if (mayPeak(t, mom)) return "peak";
  const phase = picturePhase(t, mom);
  if (phase === "lean" && mom >= 0.45) return "awake";
  return "quiet";
}

export function picturePhaseOf(pictureTimeMs: number, m: number): PicturePhase {
  return picturePhase(Math.max(0, num(pictureTimeMs)), clamp01(m));
}

/**
 * Catalog worldLine variants — pick by awaken level, not LLM.
 * Asteroid HOLD: always the authored asteroid line.
 */
const WORLD_LINE: Partial<Record<GrammarBiomeId, Partial<Record<AwakenLevel, string>>>> = {
  forest: {
    quiet: "a living crystal-ice forest, purple-blue trees, luminous path on the moss",
    awake: "a living crystal-ice forest, denser purple-blue trees, thin crystal trail on the moss",
    peak: "a living crystal-ice forest, crystal-rich groves, forked luminous path, floor crystals ahead",
  },
  dusk: {
    quiet: "a crystal-ice forest at dusk, purple-blue trees, last light, a luminous gold-cyan path on the moss",
    awake: "a crystal-ice forest at dusk, denser purple-blue trees, thin crystal trail, last light",
    peak: "a crystal-ice forest at dusk, crystal-rich groves, forked luminous path, floor crystals ahead",
  },
  moss: {
    quiet: "a living crystal-ice forest, thick moss, purple-blue trees, a luminous gold-cyan path",
    awake: "a living crystal-ice forest, thick moss, denser purple-blue trees, thin crystal trail",
    peak: "a living crystal-ice forest, thick moss, crystal-rich groves, floor crystals ahead",
  },
  canyon: {
    awake: "a vast living ice canyon, denser crystal shards growing from the walls, thin luminous trail",
    peak: "a vast living ice canyon, crystal-rich walls, forked luminous path, floor crystals ahead",
  },
  ember: {
    awake: "volcanic glass and ember cracks, denser magma light, thin luminous trail",
    peak: "volcanic glass and ember cracks, crystal-rich magma light, forked path, floor crystals ahead",
  },
};

const HOLD_BIOMES = new Set<GrammarBiomeId>(["asteroid"]);

export function worldLineFor(biome: string, awaken: AwakenLevel, fallback: string): string {
  const id = String(biome || "").trim().toLowerCase() as GrammarBiomeId;
  if (HOLD_BIOMES.has(id)) return fallback;
  return WORLD_LINE[id]?.[awaken] || fallback;
}

/** WFC / prompt hook: density pick, then intersect role-legal domains. */
export function fillCookSlots(opts: {
  m: number;
  runSeed: string;
  pictureTimeMs: number;
  miss?: boolean;
  idle?: boolean;
  legalTrail?: readonly TrailSlot[];
  legalFork?: readonly ForkSlot[];
  legalFloor?: readonly FloorSlot[];
}): DensityCook {
  const miss = Boolean(opts.miss);
  const idle = Boolean(opts.idle);
  const density = cookDensity(opts);
  const want = slotsFromDensity(density, densityNoise(opts.runSeed, opts.pictureTimeMs + 1));
  const trail = opts.legalTrail?.length ? preferLegal(opts.legalTrail, want.trail) : want.trail;
  const fork = opts.legalFork?.length ? preferLegal(opts.legalFork, want.fork) : want.fork;
  const floor = opts.legalFloor?.length ? preferLegal(opts.legalFloor, want.floor) : want.floor;
  const awaken = awakenLevel(opts.pictureTimeMs, opts.m, miss, idle);
  return {
    density,
    trail,
    fork,
    floor,
    awaken,
    phase: picturePhaseOf(opts.pictureTimeMs, awakenMomentum(opts.m, miss, idle)),
  };
}
