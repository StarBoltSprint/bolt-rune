/**
 * PCG rail 3 — graph grammar (pins).
 * Citadel is a graph, not a map. PCG chooses pins; compileCitadel realizes walks.
 * Pins only — not a tile collapse. Asteroid HOLD. No unpaid Imagine. No Pack seats expansion.
 *
 * Productions:
 *   Hall → Door A + Door B (never one gate)
 *   Room —enter→ Hall′ (biome tag may change only on enter, and only after a clip)
 *   Dead-end → breath/idle only, no rewrite
 *   Legendary: Hall → Hall + Relic pin only if momentum ≥ τ (extra pin, not a third front door)
 */

import { commitHallPrime, mayImagine, mayRelic, pcgHash, PEAK_MOMENTUM_TAU, type HallCommit } from "./pcg-rail.ts";
import { compileCitadel, type RuneGraph, type RuneNode, type WalkSecs } from "./rune.ts";

export const RELIC_MOMENTUM_TAU = PEAK_MOMENTUM_TAU;

export type PinKind = "door-a" | "door-b" | "relic";
export type GrammarRewrite = "rewrite" | "hold";
export type GrammarAct = "enter" | "idle";
export type GrammarIllegal = "one-gate" | "biome-without-enter" | "relic-without-momentum" | "morph-nodes";

export type GrammarPin = RuneNode & {
  kind: PinKind;
  morph: false;
};

export type EnterRewrite = {
  act: GrammarAct;
  rewrite: GrammarRewrite;
  commit: HallCommit;
  biome: string;
  imagine: false;
};

export type GrowPinsOpts = {
  s: string;
  i?: number;
  momentum?: number;
  /** Picture-time (sum of played plate durations). When set, relic also needs the peak window. */
  pictureTimeMs?: number;
  existing?: RuneNode[];
  /** Manual Hang / Load pins already on the graph — never move or drop them. */
  hung?: boolean;
};

function seed01(s: string, ...parts: Array<string | number>): number {
  return parseInt(pcgHash([s, ...parts]).slice(0, 8), 16) / 0xffffffff;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function isDoorPin(pin?: Pick<RuneNode, "id"> | null): boolean {
  const id = String(pin?.id || "");
  return id === "m1" || id === "m2";
}

export function isRelicPin(pin?: Pick<RuneNode, "id" | "name"> | null): boolean {
  const id = String(pin?.id || "").toLowerCase();
  const name = String(pin?.name || "").toLowerCase();
  return id === "relic" || name === "relic";
}

export function isDeadEndPin(id?: string | null): boolean {
  const n = String(id || "").toLowerCase();
  return n === "relic" || n === "spawn";
}

export function isFrontDoorPin(pin: Pick<RuneNode, "id" | "x">): boolean {
  if (isRelicPin(pin)) return false;
  if (pin.id === "m1" || pin.id === "m2") return true;
  return pin.x < 0.34 || pin.x > 0.66;
}

function asPin(p: RuneNode, kind: PinKind): GrammarPin {
  return { id: p.id, name: p.name, x: p.x, y: p.y, kind, morph: false };
}

/** Hall → Door A + Door B. Positions stay the living-hall door pins. Seed is the run key. */
export function hallDoorPins(s: string, i = 0): GrammarPin[] {
  void seed01(s, i, "hall-doors");
  return [
    { id: "m1", name: "teal door", x: 0.22, y: 0.48, kind: "door-a", morph: false },
    { id: "m2", name: "gold door", x: 0.78, y: 0.48, kind: "door-b", morph: false },
  ];
}

/**
 * Legendary relic — extra pin, not a third front door.
 * Empty when momentum is below τ.
 * Optional picture-time: relic also needs the peak window (no Date.now spawner).
 */
export function legendaryRelicPin(s: string, i: number, momentum: number, pictureMs?: number): GrammarPin | null {
  if (!(Number(momentum) >= RELIC_MOMENTUM_TAU)) return null;
  if (pictureMs != null && !mayRelic(pictureMs, momentum)) return null;
  const dx = (seed01(s, i, "relic-x") - 0.5) * 0.12;
  const dy = (seed01(s, i, "relic-y") - 0.5) * 0.08;
  return {
    id: "relic",
    name: "relic",
    x: clamp01(0.5 + dx),
    y: clamp01(0.36 + dy),
    kind: "relic",
    morph: false,
  };
}

/** Pin growth driven by run seed `s` + momentum. Always two doors. Relic only if m ≥ τ. */
export function growPins(s: string, momentum = 0, i = 0, pictureMs?: number): GrammarPin[] {
  const doors = hallDoorPins(s, i);
  const relic = legendaryRelicPin(s, i, momentum, pictureMs);
  return relic ? [...doors, relic] : doors;
}

function sanitizePins(pins?: RuneNode[] | null): RuneNode[] {
  const out: RuneNode[] = [];
  const seen = new Set<string>();
  for (const raw of pins || []) {
    if (!raw?.id || raw.id === "spawn" || seen.has(raw.id)) continue;
    if ((raw as { morph?: boolean }).morph) continue;
    seen.add(raw.id);
    out.push({ id: raw.id, name: raw.name, x: raw.x, y: raw.y });
  }
  return out;
}

function hasBothDoors(pins: RuneNode[]): boolean {
  return pins.some((p) => p.id === "m1") && pins.some((p) => p.id === "m2");
}

/**
 * Auto / seed-driven pins for Hang/Load.
 * Manual Hang and saved Load door pins win — grammar never moves or drops A/B.
 * Relic may join as an extra pin when momentum ≥ τ. Never a third front door.
 */
export function pinsForCitadel(opts: GrowPinsOpts): RuneNode[] {
  const existing = sanitizePins(opts.existing);
  const grown = growPins(String(opts.s || ""), Number(opts.momentum) || 0, Number(opts.i) || 0, opts.pictureTimeMs);
  const relic = grown.find(isRelicPin) || null;
  const keptRelic = existing.find(isRelicPin);

  if (hasBothDoors(existing)) {
    const body = existing.filter((p) => !isRelicPin(p));
    if (keptRelic) return [...body, keptRelic];
    if (relic) return [...body, relic];
    return existing;
  }

  const doors = grown.filter(isDoorPin);
  const extras = existing.filter((p) => !isDoorPin(p) && !isRelicPin(p));
  const extraRelic = keptRelic || relic;
  if (opts.hung) {
    const missing = doors.filter((g) => !existing.some((p) => p.id === g.id));
    return [...existing.filter((p) => !isRelicPin(p)), ...missing, ...(extraRelic ? [extraRelic] : [])].filter((p) => p.id !== "m3");
  }
  return [...doors, ...extras, ...(extraRelic ? [extraRelic] : [])];
}

/** Dead-end → breath/idle only. No Hall′ rewrite. */
export function deadEndHold(biome = ""): EnterRewrite {
  return { act: "idle", rewrite: "hold", commit: "hold", biome, imagine: false };
}

/**
 * Room —enter→ Hall′.
 * Clip (rail 2) must exist before the graph commits. Biome may change only on that enter.
 * Dead-end and unpaid Imagine never rewrite.
 */
export function rewriteOnEnter(opts: {
  clip?: string | null;
  entered?: boolean;
  deadEnd?: boolean;
  fromBiome?: string;
  toBiome?: string;
  smoke?: { smoke?: string } | null;
}): EnterRewrite {
  const from = String(opts.fromBiome || "");
  if (opts.deadEnd) return deadEndHold(from);
  if (!opts.entered) return { act: "idle", rewrite: "hold", commit: "hold", biome: from, imagine: false };
  if (mayImagine("enter-hot") || mayImagine("walk-toward-door") || mayImagine("speculate")) {
    return { act: "idle", rewrite: "hold", commit: "hold", biome: from, imagine: false };
  }
  if (opts.smoke && opts.smoke.smoke !== "PASS") {
    return { act: "idle", rewrite: "hold", commit: "hold", biome: from, imagine: false };
  }
  const commit = commitHallPrime(opts.clip, opts.smoke);
  if (commit !== "pass") {
    return { act: "idle", rewrite: "hold", commit: "hold", biome: from, imagine: false };
  }
  return {
    act: "enter",
    rewrite: "rewrite",
    commit: "pass",
    biome: String(opts.toBiome || from),
    imagine: false,
  };
}

export function illegalReasons(
  pins: RuneNode[],
  opts?: { momentum?: number; biomeChanged?: boolean; entered?: boolean },
): GrammarIllegal[] {
  const reasons: GrammarIllegal[] = [];
  const doors = pins.filter(isFrontDoorPin);
  if (doors.length === 1) reasons.push("one-gate");
  if (pins.some((p) => (p as { morph?: boolean }).morph)) reasons.push("morph-nodes");
  if (pins.some(isRelicPin) && !(Number(opts?.momentum) >= RELIC_MOMENTUM_TAU)) {
    reasons.push("relic-without-momentum");
  }
  if (opts?.biomeChanged && !opts.entered) reasons.push("biome-without-enter");
  return reasons;
}

export function isLegalPins(
  pins: RuneNode[],
  opts?: { momentum?: number; biomeChanged?: boolean; entered?: boolean },
): boolean {
  return illegalReasons(pins, opts).length === 0;
}

/** PCG chooses pins; compileCitadel still realizes the walks. */
export function realizeCitadel(plate: string, pins: RuneNode[], walkSecs: WalkSecs = 10): RuneGraph {
  const graph = compileCitadel(plate, pins, walkSecs);
  return {
    ...graph,
    idles: graph.idles.map((c) => ({ ...c, morph: false as const })),
    walks: graph.walks.map((c) => ({ ...c, morph: false as const })),
  };
}
