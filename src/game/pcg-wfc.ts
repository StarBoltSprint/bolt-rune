/**
 * PCG role-WFC — 1D time-strip of plate-roles (not a 2D map, not STWFC T×Y×X).
 * Neighbors are TIME, not floor tiles. Each cell is one plate in the ~60s bone.
 * Collapsed roles unlock prompt slots only — never free-text Imagine.
 * Online + tap-as-observe: miss/idle can kill a peak already in the future domain.
 * Picture-time is Σ plate durations — never Date.now.
 * Asteroid HOLD. No Pack seats.
 */

import { pcgHash } from "./pcg-rail.ts";
import { RELIC_MOMENTUM_TAU } from "./pcg-grammar.ts";
import type { ActSlot, FloorSlot, ForkSlot, TrailSlot } from "./pcg-prompt.ts";
import { fillCookSlots } from "./pcg-density.ts";

export const PLATE_ROLES = [
  "calm",
  "lean-L",
  "lean-R",
  "fork",
  "peak",
  "decay",
  "breath",
  "enter",
] as const;

export type PlateRole = (typeof PLATE_ROLES)[number];

export const BONE_N_MIN = 5;
export const BONE_N_MAX = 8;
export const BONE_N_DEFAULT = 6;
export const BONE_SECS = 60;
export const PLATE_SECS_DEFAULT = 10;
export const QUIET_SECS = 8;
export const PEAK_SECS = 45;
/** 45–90s cosmos — peak window closes. Picture-time, never Date.now. */
export const PEAK_END_SECS = 90;
export const WFC_MOMENTUM_TAU = RELIC_MOMENTUM_TAU;
export const RELIC_NOISE_TAU = 0.8;

/** Played-plate tap. Online observe — miss/idle can kill a future peak. */
export type TapObserve = "hit" | "late" | "miss" | "idle";

/** Picture-time input: plate duration ms, or a plate with durationMs. Never wall clock. */
export type PlayedPlate = number | { durationMs?: number | null };

const MAX_BACKTRACK = 48;
const MAX_STEPS = 160;

/** Time adjacency — next cell, not a floor neighbor. */
export const ROLE_NEXT: Record<PlateRole, readonly PlateRole[]> = {
  calm: ["calm", "lean-L", "lean-R", "breath"],
  "lean-L": ["lean-L", "lean-R", "fork", "peak", "decay"],
  "lean-R": ["lean-L", "lean-R", "fork", "peak", "decay"],
  fork: ["lean-L", "lean-R", "peak", "decay"],
  peak: ["decay", "lean-L", "lean-R", "breath"],
  decay: ["decay", "lean-L", "lean-R", "breath"],
  breath: ["calm", "lean-L", "lean-R", "enter"],
  enter: ["calm", "breath"],
};

export type CollapseOpts = {
  s: string;
  n?: number;
  plateSecs?: number;
  momentum?: number;
  miss?: boolean;
  idle?: boolean;
  /** Committed door cell. Enter is illegal on the default strip. */
  doorCell?: number | null;
};

export type WfcCell = {
  i: number;
  t: number;
  role: PlateRole;
  fork: ForkSlot;
  trail: TrailSlot;
  floor: FloorSlot;
  relic: boolean;
  stock: boolean;
};

export type WfcStrip = {
  s: string;
  n: number;
  plateSecs: number;
  cells: WfcCell[];
  stock: boolean;
  observes: number;
};

export type RoleWave = {
  n: number;
  plateSecs: number;
  momentum: number;
  miss: boolean;
  idle: boolean;
  doorCell: number | null;
  domains: PlateRole[][];
  collapsed: Array<PlateRole | null>;
  observeN: number;
};

export type TrailWave = {
  n: number;
  roles: PlateRole[];
  domains: TrailSlot[][];
  collapsed: Array<TrailSlot | null>;
  observeN: number;
};

/** Live 1D strip. Future cells stay in superposition until tap-observe. */
export type OnlineStrip = {
  s: string;
  wave: RoleWave;
  cells: Array<WfcCell | null>;
  playedMs: number[];
  pictureTimeMs: number;
  stock: boolean;
  lastTap: TapObserve | null;
  lastI: number;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function boneN(n?: number, cellI = 0) {
  const want = Math.max(BONE_N_DEFAULT, Math.round(Number(cellI) || 0) + 1);
  return clamp(Math.round(Number(n) || want), BONE_N_MIN, BONE_N_MAX);
}

export function cellTime(i: number, plateSecs = PLATE_SECS_DEFAULT) {
  return Math.max(0, i) * plateSecs;
}

export function inQuietWindow(i: number, plateSecs = PLATE_SECS_DEFAULT) {
  return cellTime(i, plateSecs) < QUIET_SECS;
}

/** Peak only if this plate reaches t≥45s and momentum ≥ τ. */
export function peakWindowOk(i: number, plateSecs: number, momentum: number) {
  const end = cellTime(i, plateSecs) + plateSecs;
  return end > PEAK_SECS && Number(momentum) >= WFC_MOMENTUM_TAU;
}

function plateMs(plate: PlayedPlate | null | undefined): number {
  if (plate == null) return 0;
  const raw = typeof plate === "number" ? plate : Number(plate.durationMs);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw;
}

/**
 * Picture-time = sum of played plate durations.
 * Pause the film (no new plate) → this number does not move.
 * Never Date.now / setTimeout.
 */
export function pictureTimeFromPlates(played: ReadonlyArray<PlayedPlate | null | undefined> = []): number {
  let t = 0;
  for (const plate of played) t += plateMs(plate);
  return t;
}

/** Peak window on the picture clock: 45–90s and m ≥ τ. No wall clock. */
export function mayPeakNow(pictureTimeMs: number, momentum = 0): boolean {
  const t = Math.max(0, Number(pictureTimeMs) || 0);
  const m = Number(momentum) || 0;
  return t >= PEAK_SECS * 1000 && t < PEAK_END_SECS * 1000 && m >= WFC_MOMENTUM_TAU;
}

export function hash01(s: string, cell: number | string, observe: number | string): number {
  return parseInt(pcgHash([s, cell, observe]).slice(0, 8), 16) / 0xffffffff;
}

function pickWeighted<T>(items: Array<{ id: T; w: number }>, u: number): T {
  const live = items.filter((it) => it.w > 0);
  const bag = live.length ? live : items;
  const total = bag.reduce((sum, it) => sum + Math.max(0, it.w), 0);
  if (total <= 0) return bag[bag.length - 1]!.id;
  let acc = 0;
  const t = clamp(u, 0, 0.999999) * total;
  for (const it of bag) {
    acc += Math.max(0, it.w);
    if (t <= acc) return it.id;
  }
  return bag[bag.length - 1]!.id;
}

function cloneRoles(wave: RoleWave): RoleWave {
  return {
    ...wave,
    domains: wave.domains.map((d) => d.slice()),
    collapsed: wave.collapsed.slice(),
  };
}

function has(domain: readonly string[], v: string) {
  return domain.includes(v);
}

export function targetCurve(role: PlateRole, t: number, missOrIdle: boolean): number {
  if (role === "calm") return t < 12 ? 1.2 : t < 25 ? 0.45 : 0.12;
  if (role === "lean-L" || role === "lean-R") return t < 8 ? 0.18 : t < 40 ? 1 : 0.4;
  if (role === "fork") return t < 15 ? 0.08 : t < 45 ? 0.85 : 0.28;
  if (role === "peak") return t >= PEAK_SECS - PLATE_SECS_DEFAULT ? 1.35 : 0.02;
  if (role === "decay") return (t > 40 ? 0.7 : 0.16) * (missOrIdle ? 3.2 : 1);
  if (role === "breath") return t < 8 ? 0.1 : 0.38;
  return 0.12;
}

export function mmmFitness(role: PlateRole, m: number): number {
  const mom = clamp(Number(m) || 0, 0, 1);
  if (role === "peak") return 0.12 + mom;
  if (role === "fork") return 0.28 + 0.72 * mom;
  if (role === "lean-L" || role === "lean-R") return 0.4 + 0.6 * mom;
  if (role === "calm") return 1.05 - 0.7 * mom;
  if (role === "decay") return 0.32 + (1 - mom) * 0.7;
  if (role === "breath") return 0.45;
  return 0.22;
}

export function roleWeight(role: PlateRole, t: number, m: number, missOrIdle: boolean): number {
  return Math.max(0.001, targetCurve(role, t, missOrIdle) * mmmFitness(role, m));
}

export function roleTrails(role: PlateRole): TrailSlot[] {
  if (role === "peak") return ["full"];
  if (role === "lean-L" || role === "lean-R") return ["thin"];
  if (role === "fork") return ["thin", "full"];
  if (role === "decay") return ["none", "thin"];
  return ["none", "thin"];
}

export function roleForks(role: PlateRole): ForkSlot[] {
  if (role === "lean-L") return ["L"];
  if (role === "lean-R") return ["R"];
  if (role === "peak") return ["L+R"];
  if (role === "fork") return ["L", "R"];
  return ["none"];
}

export function roleFloors(role: PlateRole): FloorSlot[] {
  if (role === "peak") return ["crystals-ahead"];
  if (role === "lean-L" || role === "lean-R" || role === "fork") return ["empty", "crystals-ahead"];
  return ["empty"];
}

export function actFromRole(role: PlateRole): ActSlot {
  if (role === "enter") return "enter";
  if (role === "breath") return "breath";
  if (role === "decay") return "decay";
  if (role === "lean-R") return "walk-B";
  return "walk-A";
}

/** Trail adjacency (momentum chaining). none→full is illegal. full→none only via decay. */
export function trailAfter(prev: TrailSlot, nextRole: PlateRole): TrailSlot[] {
  if (prev === "none") return ["none", "thin"];
  if (prev === "thin") return ["none", "thin", "full"];
  if (nextRole === "decay") return ["thin", "full", "none"];
  return ["thin", "full"];
}

export function trailLegal(prev: TrailSlot, next: TrailSlot, nextRole: PlateRole): boolean {
  return trailAfter(prev, nextRole).includes(next);
}

function windowLegal(role: PlateRole, i: number, opts: Pick<RoleWave, "plateSecs" | "momentum" | "miss" | "idle" | "doorCell">) {
  if (role === "enter" && opts.doorCell !== i) return false;
  if (inQuietWindow(i, opts.plateSecs) && (role === "peak" || role === "enter")) return false;
  if (role === "peak" && (opts.miss || opts.idle || !peakWindowOk(i, opts.plateSecs, opts.momentum))) return false;
  return true;
}

function seedDomain(i: number, wave: Omit<RoleWave, "domains" | "collapsed" | "observeN">): PlateRole[] {
  const allowed = PLATE_ROLES.filter((role) => windowLegal(role, i, wave));
  if (inQuietWindow(i, wave.plateSecs) && !allowed.includes("calm")) allowed.unshift("calm");
  return allowed.length ? allowed : ["calm"];
}

export function initWave(opts: CollapseOpts): RoleWave {
  const plateSecs = Number(opts.plateSecs) > 0 ? Number(opts.plateSecs) : PLATE_SECS_DEFAULT;
  const n = boneN(opts.n);
  const door = Number.isFinite(Number(opts.doorCell)) ? Math.round(Number(opts.doorCell)) : null;
  const doorCell = door != null && door >= 0 && door < n ? door : null;
  const base = {
    n,
    plateSecs,
    momentum: clamp(Number(opts.momentum) || 0, 0, 1),
    miss: Boolean(opts.miss),
    idle: Boolean(opts.idle),
    doorCell,
  };
  const domains = Array.from({ length: n }, (_, i) => seedDomain(i, base));
  if (doorCell != null && has(domains[doorCell]!, "enter") && !inQuietWindow(doorCell, plateSecs)) {
    domains[doorCell] = ["enter"];
  }
  return { ...base, domains, collapsed: Array<PlateRole | null>(n).fill(null), observeN: 0 };
}

function entropy(domain: readonly unknown[], collapsed: unknown) {
  return collapsed != null ? Number.POSITIVE_INFINITY : domain.length;
}

/** Lowest-entropy uncollapsed cell. Ties → prefer, else leftmost (deterministic). */
export function pickObserveCell(
  domains: readonly unknown[][],
  collapsed: readonly unknown[],
  prefer?: number,
): number {
  let best = -1;
  let bestH = Number.POSITIVE_INFINITY;
  for (let i = 0; i < domains.length; i++) {
    if (collapsed[i] != null) continue;
    const h = entropy(domains[i]!, collapsed[i]);
    if (h < bestH) {
      bestH = h;
      best = i;
      continue;
    }
    if (h === bestH && prefer === i) best = i;
  }
  return best;
}

function prevRoles(role: PlateRole): PlateRole[] {
  return PLATE_ROLES.filter((r) => ROLE_NEXT[r].includes(role));
}

/**
 * Intersect neighbor domains with time adjacency.
 * Returns contradiction=true when a live cell's domain empties.
 */
export function propagate(wave: RoleWave, start = 0): { wave: RoleWave; contradiction: boolean } {
  const next = cloneRoles(wave);
  const q = [start];
  const seen = new Set<number>();
  while (q.length) {
    const i = q.shift()!;
    if (seen.has(i)) continue;
    seen.add(i);
    const here = next.collapsed[i] ? [next.collapsed[i]!] : next.domains[i]!;
    if (!here.length) return { wave: next, contradiction: true };

    if (i + 1 < next.n && next.collapsed[i + 1] == null) {
      const allow = new Set(here.flatMap((r) => ROLE_NEXT[r]));
      const clipped = next.domains[i + 1]!.filter((r) => allow.has(r));
      if (!clipped.length) return { wave: next, contradiction: true };
      if (clipped.length !== next.domains[i + 1]!.length) {
        next.domains[i + 1] = clipped;
        q.push(i + 1);
        seen.delete(i + 1);
      }
    }

    if (i > 0 && next.collapsed[i - 1] == null) {
      const allow = new Set(here.flatMap((r) => prevRoles(r)));
      const clipped = next.domains[i - 1]!.filter((r) => allow.has(r));
      if (!clipped.length) return { wave: next, contradiction: true };
      if (clipped.length !== next.domains[i - 1]!.length) {
        next.domains[i - 1] = clipped;
        q.push(i - 1);
        seen.delete(i - 1);
      }
    }

    if (here.length === 1 && next.collapsed[i] == null) {
      next.collapsed[i] = here[0]!;
      next.domains[i] = [here[0]!];
    }
  }
  return { wave: next, contradiction: false };
}

/** Observe lowest-entropy cell; sample by weight from hash(s, cell, observe). */
export function observe(
  wave: RoleWave,
  s: string,
  prefer?: number,
): { wave: RoleWave; cell: number; role: PlateRole | null } {
  const i = pickObserveCell(wave.domains, wave.collapsed, prefer);
  if (i < 0) return { wave, cell: -1, role: null };
  const domain = wave.domains[i]!;
  const t = cellTime(i, wave.plateSecs);
  const missOrIdle = wave.miss || wave.idle;
  const weights = domain.map((role) => ({ id: role, w: roleWeight(role, t, wave.momentum, missOrIdle) }));
  const u = hash01(s, i, wave.observeN);
  const role = pickWeighted(weights, u);
  const next = cloneRoles(wave);
  next.collapsed[i] = role;
  next.domains[i] = [role];
  next.observeN += 1;
  return { wave: next, cell: i, role };
}

export function forceDecay(wave: RoleWave): RoleWave {
  const next = cloneRoles(wave);
  for (let i = 0; i < next.n; i++) {
    if (next.collapsed[i] != null) continue;
    next.collapsed[i] = "decay";
    next.domains[i] = ["decay"];
  }
  return next;
}

function collapseRoles(opts: CollapseOpts): { wave: RoleWave; stock: boolean } {
  let wave = initWave(opts);
  const s = String(opts.s || "s0");
  const stack: RoleWave[] = [];
  let steps = 0;
  let backs = 0;

  const boot = propagate(wave, 0);
  if (boot.contradiction) return { wave: forceDecay(wave), stock: true };
  wave = boot.wave;

  while (wave.collapsed.some((c) => c == null)) {
    if (steps++ > MAX_STEPS || backs > MAX_BACKTRACK) return { wave: forceDecay(wave), stock: true };
    stack.push(cloneRoles(wave));
    const shot = observe(wave, s);
    if (shot.cell < 0 || !shot.role) return { wave: forceDecay(shot.wave), stock: true };
    const prop = propagate(shot.wave, shot.cell);
    if (!prop.contradiction) {
      wave = prop.wave;
      continue;
    }
    backs += 1;
    const prev = stack.pop();
    if (!prev) return { wave: forceDecay(shot.wave), stock: true };
    prev.domains[shot.cell] = prev.domains[shot.cell]!.filter((r) => r !== shot.role);
    prev.observeN = shot.wave.observeN;
    if (!prev.domains[shot.cell]!.length) {
      if (!stack.length) return { wave: forceDecay(prev), stock: true };
      wave = stack.pop()!;
      continue;
    }
    const retry = propagate(prev, shot.cell);
    wave = retry.contradiction ? forceDecay(prev) : retry.wave;
    if (retry.contradiction) return { wave, stock: true };
  }
  return { wave, stock: false };
}

function initTrailWave(roles: PlateRole[], observeN: number): TrailWave {
  return {
    n: roles.length,
    roles,
    domains: roles.map((role) => roleTrails(role)),
    collapsed: Array<TrailSlot | null>(roles.length).fill(null),
    observeN,
  };
}

function cloneTrail(wave: TrailWave): TrailWave {
  return {
    ...wave,
    domains: wave.domains.map((d) => d.slice()),
    collapsed: wave.collapsed.slice(),
  };
}

export function propagateTrail(wave: TrailWave, start = 0): { wave: TrailWave; contradiction: boolean } {
  const next = cloneTrail(wave);
  const q = [start];
  const seen = new Set<number>();
  while (q.length) {
    const i = q.shift()!;
    if (seen.has(i)) continue;
    seen.add(i);
    const here = next.collapsed[i] ? [next.collapsed[i]!] : next.domains[i]!;
    if (!here.length) return { wave: next, contradiction: true };

    if (i + 1 < next.n && next.collapsed[i + 1] == null) {
      const allow = new Set(here.flatMap((tr) => trailAfter(tr, next.roles[i + 1]!)));
      const clipped = next.domains[i + 1]!.filter((tr) => allow.has(tr));
      if (!clipped.length) return { wave: next, contradiction: true };
      if (clipped.length !== next.domains[i + 1]!.length) {
        next.domains[i + 1] = clipped;
        q.push(i + 1);
        seen.delete(i + 1);
      }
    }

    if (i > 0 && next.collapsed[i - 1] == null) {
      const clipped = next.domains[i - 1]!.filter((prev) => here.some((tr) => trailLegal(prev, tr, next.roles[i]!)));
      if (!clipped.length) return { wave: next, contradiction: true };
      if (clipped.length !== next.domains[i - 1]!.length) {
        next.domains[i - 1] = clipped;
        q.push(i - 1);
        seen.delete(i - 1);
      }
    }

    if (here.length === 1 && next.collapsed[i] == null) {
      next.collapsed[i] = here[0]!;
      next.domains[i] = [here[0]!];
    }
  }
  return { wave: next, contradiction: false };
}

function observeTrail(
  wave: TrailWave,
  s: string,
  cook: { momentum: number; miss: boolean; idle: boolean; plateSecs: number },
): { wave: TrailWave; cell: number; trail: TrailSlot | null } {
  const i = pickObserveCell(wave.domains, wave.collapsed);
  if (i < 0) return { wave, cell: -1, trail: null };
  const domain = wave.domains[i]!;
  const filled = fillCookSlots({
    m: cook.momentum,
    runSeed: s,
    pictureTimeMs: cellTime(i, cook.plateSecs) * 1000,
    miss: cook.miss,
    idle: cook.idle,
    legalTrail: domain,
  });
  const trail = filled.trail;
  const next = cloneTrail(wave);
  next.collapsed[i] = trail;
  next.domains[i] = [trail];
  next.observeN += 1;
  return { wave: next, cell: i, trail };
}

function forceTrailThin(wave: TrailWave): TrailSlot[] {
  const out: TrailSlot[] = [];
  for (let i = 0; i < wave.n; i++) {
    const role = wave.roles[i]!;
    const prev = out[i - 1] ?? "none";
    const want = wave.collapsed[i] || wave.domains[i]![0] || roleTrails(role)[0]!;
    const legal = trailAfter(prev, role).filter((tr) => roleTrails(role).includes(tr));
    out[i] = legal.includes(want) ? want : legal[0] || "none";
  }
  return out;
}

function collapseTrails(
  roles: PlateRole[],
  s: string,
  observeN: number,
  cook: { momentum: number; miss: boolean; idle: boolean; plateSecs: number },
): { trails: TrailSlot[]; observeN: number; stock: boolean } {
  let wave = initTrailWave(roles, observeN);
  const boot = propagateTrail(wave, 0);
  if (boot.contradiction) return { trails: forceTrailThin(wave), observeN: wave.observeN, stock: true };
  wave = boot.wave;
  let steps = 0;
  while (wave.collapsed.some((c) => c == null)) {
    if (steps++ > MAX_STEPS) return { trails: forceTrailThin(wave), observeN: wave.observeN, stock: true };
    const shot = observeTrail(wave, s, cook);
    if (shot.cell < 0 || !shot.trail) return { trails: forceTrailThin(shot.wave), observeN: shot.wave.observeN, stock: true };
    const prop = propagateTrail(shot.wave, shot.cell);
    if (prop.contradiction) return { trails: forceTrailThin(shot.wave), observeN: shot.wave.observeN, stock: true };
    wave = prop.wave;
  }
  return { trails: wave.collapsed as TrailSlot[], observeN: wave.observeN, stock: false };
}

function sampleFloor(role: PlateRole, s: string, i: number, plateSecs: number, cook: { momentum: number; miss: boolean; idle: boolean }): FloorSlot {
  const opts = roleFloors(role);
  if (opts.length === 1) return opts[0]!;
  return fillCookSlots({
    m: cook.momentum,
    runSeed: s,
    pictureTimeMs: cellTime(i, plateSecs) * 1000,
    miss: cook.miss,
    idle: cook.idle,
    legalFloor: opts,
  }).floor;
}

function sampleFork(role: PlateRole, s: string, i: number, plateSecs: number, cook: { momentum: number; miss: boolean; idle: boolean }): ForkSlot {
  const opts = roleForks(role);
  if (opts.length === 1) return opts[0]!;
  return fillCookSlots({
    m: cook.momentum,
    runSeed: s,
    pictureTimeMs: cellTime(i, plateSecs) * 1000,
    miss: cook.miss,
    idle: cook.idle,
    legalFork: opts,
  }).fork;
}

function relicSlot(role: PlateRole, s: string, i: number, momentum: number): boolean {
  if (role !== "peak") return false;
  if (!(Number(momentum) >= WFC_MOMENTUM_TAU)) return false;
  return hash01(s, i, "relic") >= RELIC_NOISE_TAU;
}

/** Collapse the bone strip. Contradiction → decay + stock, never a spinner. */
export function collapseStrip(opts: CollapseOpts): WfcStrip {
  const s = String(opts.s || "s0");
  const roles = collapseRoles(opts);
  const plateSecs = roles.wave.plateSecs;
  const n = roles.wave.n;
  const list = roles.wave.collapsed.map((r) => r || "decay");
  const cook = {
    momentum: roles.wave.momentum,
    miss: roles.wave.miss,
    idle: roles.wave.idle,
    plateSecs,
  };
  const trails = collapseTrails(list, s, roles.wave.observeN, cook);
  let observeN = trails.observeN;
  const cells: WfcCell[] = list.map((role, i) => {
    const fork = sampleFork(role, s, i, plateSecs, cook);
    observeN += 1;
    const floor = sampleFloor(role, s, i, plateSecs, cook);
    observeN += 1;
    return {
      i,
      t: cellTime(i, plateSecs),
      role,
      fork,
      trail: trails.trails[i] || "none",
      floor,
      relic: relicSlot(role, s, i, roles.wave.momentum),
      stock: Boolean(roles.stock && role === "decay"),
    };
  });
  return {
    s,
    n,
    plateSecs,
    cells,
    stock: roles.stock || trails.stock,
    observes: observeN,
  };
}

export function cellAt(strip: WfcStrip, i: number): WfcCell {
  const idx = clamp(Math.round(Number(i) || 0), 0, strip.n - 1);
  return strip.cells[idx]!;
}

export function slotsFromCell(cell: WfcCell): { fork: ForkSlot; trail: TrailSlot; floor: FloorSlot } {
  return { fork: cell.fork, trail: cell.trail, floor: cell.floor };
}

/** Collapse (or reuse) the bone and return the plate cell for cook index i. */
export function collapsePlateCell(
  opts: CollapseOpts & { i?: number },
): { strip: WfcStrip; cell: WfcCell } {
  const i = Math.max(0, Math.round(Number(opts.i) || 0));
  const strip = collapseStrip({ ...opts, n: boneN(opts.n, i) });
  return { strip, cell: cellAt(strip, i) };
}

/* ── Online time-WFC + tap-as-observe (EDPCG) ── */

function cloneOnline(strip: OnlineStrip): OnlineStrip {
  return {
    ...strip,
    wave: cloneRoles(strip.wave),
    cells: strip.cells.slice(),
    playedMs: strip.playedMs.slice(),
  };
}

function pickOpening(wave: RoleWave, s: string): PlateRole {
  const allow = wave.domains[0]!.filter((r) => r === "calm" || r === "breath");
  const domain = allow.length ? allow : ["calm"];
  const t = cellTime(0, wave.plateSecs);
  const weights = domain.map((role) => ({
    id: role,
    w: roleWeight(role, t, wave.momentum, wave.miss || wave.idle),
  }));
  return pickWeighted(weights, hash01(s, 0, wave.observeN));
}

function banRole(wave: RoleWave, i: number, role: PlateRole) {
  if (i < 0 || i >= wave.n) return;
  if (wave.collapsed[i] != null) return;
  wave.domains[i] = wave.domains[i]!.filter((r) => r !== role);
}

function rebanWindows(wave: RoleWave) {
  for (let i = 0; i < wave.n; i++) {
    if (wave.collapsed[i] != null) continue;
    const clipped = wave.domains[i]!.filter((role) => windowLegal(role, i, wave));
    wave.domains[i] = clipped.length ? clipped : wave.domains[i]!;
  }
}

function rescueLive(wave: RoleWave, i: number): { wave: RoleWave; stock: boolean } {
  const j = i + 1;
  if (j < 0 || j >= wave.n) return { wave, stock: false };
  if (wave.collapsed[j] != null) return { wave, stock: false };
  if (wave.domains[j]!.length) return { wave, stock: false };
  const prev = wave.collapsed[i];
  const nextOk = prev ? ROLE_NEXT[prev] : PLATE_ROLES;
  const decayOk = nextOk.includes("decay") && windowLegal("decay", j, wave);
  if (decayOk) {
    wave.collapsed[j] = "decay";
    wave.domains[j] = ["decay"];
    return { wave, stock: false };
  }
  wave.collapsed[j] = "breath";
  wave.domains[j] = ["breath"];
  return { wave, stock: true };
}

function sampleTrail(
  role: PlateRole,
  prev: TrailSlot | null,
  s: string,
  i: number,
  wave: RoleWave,
): TrailSlot {
  const opts = roleTrails(role);
  const legal = prev ? trailAfter(prev, role).filter((tr) => opts.includes(tr)) : opts;
  const bag = legal.length ? legal : opts;
  if (bag.length === 1) return bag[0]!;
  return fillCookSlots({
    m: wave.momentum,
    runSeed: s,
    pictureTimeMs: cellTime(i, wave.plateSecs) * 1000,
    miss: wave.miss,
    idle: wave.idle,
    legalTrail: bag,
  }).trail;
}

function materializeCell(wave: RoleWave, s: string, i: number, observeN: number, prev: WfcCell | null): WfcCell {
  const role = wave.collapsed[i] || wave.domains[i]![0] || "decay";
  const fork = sampleFork(role, s, i, wave.plateSecs, wave);
  const floor = sampleFloor(role, s, i, wave.plateSecs, wave);
  const trail = sampleTrail(role, prev?.trail ?? null, s, i, wave);
  return {
    i,
    t: cellTime(i, wave.plateSecs),
    role,
    fork,
    trail,
    floor,
    relic: relicSlot(role, s, i, wave.momentum),
    stock: role === "decay" && (wave.miss || wave.idle),
  };
}

function fillCollapsed(strip: OnlineStrip): OnlineStrip {
  const next = cloneOnline(strip);
  let observeN = next.wave.observeN;
  for (let i = 0; i < next.wave.n; i++) {
    if (next.wave.collapsed[i] == null) {
      next.cells[i] = null;
      continue;
    }
    if (next.cells[i]?.role === next.wave.collapsed[i]) continue;
    const prev = i > 0 ? next.cells[i - 1] : null;
    next.cells[i] = materializeCell(next.wave, next.s, i, observeN, prev);
    observeN += 3;
  }
  next.wave.observeN = observeN;
  return next;
}

/** Confirmed plate only — Imagine spend waits on collapse. Superposition never cooks. */
export function cookReadyCell(strip: OnlineStrip, i: number): WfcCell | null {
  const idx = Math.max(0, Math.round(Number(i) || 0));
  if (strip.wave.collapsed[idx] == null) return null;
  return strip.cells[idx] || null;
}

export function mayImagineCell(strip: OnlineStrip, i: number): boolean {
  return cookReadyCell(strip, i) != null && !cookReadyCell(strip, i)!.stock;
}

/**
 * Before Play: window bans, collapse cell 0 to calm|breath, propagate.
 * Partial cook: only cell 0 is confirmed. i+2… stay superposition.
 */
export function beginOnline(opts: CollapseOpts): OnlineStrip {
  const s = String(opts.s || "s0");
  let wave = initWave(opts);
  const opening = pickOpening(wave, s);
  wave.collapsed[0] = opening;
  wave.domains[0] = [opening];
  wave.observeN += 1;
  const boot = propagate(wave, 0);
  wave = boot.wave;
  let stock = false;
  if (boot.contradiction) {
    const fail = rescueLive(wave, -1);
    wave = fail.wave;
    stock = true;
    if (wave.collapsed[0] == null) {
      wave.collapsed[0] = "breath";
      wave.domains[0] = ["breath"];
    }
  }
  const cells = Array<WfcCell | null>(wave.n).fill(null);
  let strip: OnlineStrip = {
    s,
    wave,
    cells,
    playedMs: [],
    pictureTimeMs: 0,
    stock,
    lastTap: null,
    lastI: -1,
  };
  strip = fillCollapsed(strip);
  if (stock) strip.stock = true;
  return strip;
}

/**
 * After plate i: BAN future tiles the act forbids.
 * miss → peak off i+1 (and i+2); boost decay.
 * idle → peak + fork off i+1.
 * clean + m≥τ + picture-time in peak window → keep peak in domain.
 * Never Date.now. Mutates a clone of the live strip.
 */
export function applyTapObserve(
  strip: OnlineStrip,
  i: number,
  tap: TapObserve,
  m: number,
  pictureTime: number,
): OnlineStrip {
  const next = cloneOnline(strip);
  const cell = clamp(Math.round(Number(i) || 0), 0, next.wave.n - 1);
  const kind = tap;
  const mom = clamp(Number(m) || 0, 0, 1);
  const tMs = Math.max(0, Number(pictureTime) || 0);
  next.wave.momentum = mom;
  next.lastTap = kind;
  next.lastI = cell;
  next.pictureTimeMs = tMs;
  const before = pictureTimeFromPlates(next.playedMs.slice(0, cell));
  next.playedMs = next.playedMs.slice(0, cell);
  next.playedMs[cell] = Math.max(0, tMs - before) || next.wave.plateSecs * 1000;

  if (kind === "miss") {
    next.wave.miss = true;
    banRole(next.wave, cell + 1, "peak");
    banRole(next.wave, cell + 2, "peak");
  } else if (kind === "idle") {
    next.wave.idle = true;
    banRole(next.wave, cell + 1, "peak");
    banRole(next.wave, cell + 1, "fork");
  } else if (kind === "hit" && mayPeakNow(tMs, mom)) {
    /* keep peak in future domains — do not ban */
  } else if (kind === "late") {
    /* late is not clean: no peak grant, no miss/idle ban */
  }

  rebanWindows(next.wave);
  const rescued = rescueLive(next.wave, cell);
  next.wave = rescued.wave;
  if (rescued.stock) next.stock = true;
  return next;
}

/**
 * Observe lowest-entropy uncollapsed cell (prefer i+1 if tied), propagate, fill slots.
 * Live empty i+1 → decay; if decay banned → breath stock. Never pause the picture.
 * Offline New Citadel still uses collapseStrip (full backtrack from 0).
 */
export function advanceOnline(strip: OnlineStrip, i?: number): OnlineStrip {
  const next = cloneOnline(strip);
  const from = Number.isFinite(Number(i)) ? Math.round(Number(i)) : next.lastI;
  const prefer = from >= 0 ? from + 1 : 1;
  const rescued = rescueLive(next.wave, Math.max(0, from));
  next.wave = rescued.wave;
  if (rescued.stock) next.stock = true;

  if (next.wave.collapsed.some((c) => c == null)) {
    const shot = observe(next.wave, next.s, prefer);
    if (shot.cell >= 0 && shot.role) {
      const prop = propagate(shot.wave, shot.cell);
      if (prop.contradiction) {
        const fail = rescueLive(shot.wave, Math.max(0, from));
        next.wave = fail.wave;
        if (fail.stock) next.stock = true;
      } else {
        next.wave = prop.wave;
      }
    }
  }

  const empty = rescueLive(next.wave, Math.max(0, from));
  next.wave = empty.wave;
  if (empty.stock) next.stock = true;
  return fillCollapsed(next);
}

/** Tap then observe — play/cook convenience. */
export function afterPlate(
  strip: OnlineStrip,
  i: number,
  tap: TapObserve,
  m: number,
  pictureTime: number,
): OnlineStrip {
  return advanceOnline(applyTapObserve(strip, i, tap, m, pictureTime), i);
}

/** Replay seed + tap transcript. Same taps → same future domains. */
export function replayOnline(
  opts: CollapseOpts & {
    taps?: ReadonlyArray<TapObserve | null | undefined>;
    pictureTimes?: ReadonlyArray<number | null | undefined>;
  },
): OnlineStrip {
  let strip = beginOnline(opts);
  const taps = opts.taps || [];
  const plateMs = strip.wave.plateSecs * 1000;
  for (let k = 0; k < taps.length; k++) {
    const tap = taps[k];
    if (!tap) continue;
    const t = Number(opts.pictureTimes?.[k]);
    const pictureTime = Number.isFinite(t) && t > 0 ? t : (k + 1) * plateMs;
    strip = afterPlate(strip, k, tap, strip.wave.momentum, pictureTime);
  }
  return strip;
}
