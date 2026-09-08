/**
 * PCG role-WFC — 1D time-strip of plate-roles (not a 2D map).
 * Neighbors are TIME, not floor tiles. Each cell is one plate in the ~60s bone.
 * Collapsed roles unlock prompt slots only — never free-text Imagine.
 * Asteroid HOLD. No Pack seats.
 */

import { pcgHash } from "./pcg-rail.ts";
import { RELIC_MOMENTUM_TAU } from "./pcg-grammar.ts";
import type { ActSlot, FloorSlot, ForkSlot, TrailSlot } from "./pcg-prompt.ts";

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
export const WFC_MOMENTUM_TAU = RELIC_MOMENTUM_TAU;
export const RELIC_NOISE_TAU = 0.8;

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

/** Lowest-entropy uncollapsed cell. Ties → leftmost (deterministic). */
export function pickObserveCell(domains: readonly unknown[][], collapsed: readonly unknown[]): number {
  let best = -1;
  let bestH = Number.POSITIVE_INFINITY;
  for (let i = 0; i < domains.length; i++) {
    if (collapsed[i] != null) continue;
    const h = entropy(domains[i]!, collapsed[i]);
    if (h < bestH) {
      bestH = h;
      best = i;
    }
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
export function observe(wave: RoleWave, s: string): { wave: RoleWave; cell: number; role: PlateRole | null } {
  const i = pickObserveCell(wave.domains, wave.collapsed);
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

function observeTrail(wave: TrailWave, s: string): { wave: TrailWave; cell: number; trail: TrailSlot | null } {
  const i = pickObserveCell(wave.domains, wave.collapsed);
  if (i < 0) return { wave, cell: -1, trail: null };
  const domain = wave.domains[i]!;
  const u = hash01(s, i, wave.observeN);
  const trail = domain[Math.min(domain.length - 1, Math.floor(u * domain.length))]!;
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

function collapseTrails(roles: PlateRole[], s: string, observeN: number): { trails: TrailSlot[]; observeN: number; stock: boolean } {
  let wave = initTrailWave(roles, observeN);
  const boot = propagateTrail(wave, 0);
  if (boot.contradiction) return { trails: forceTrailThin(wave), observeN: wave.observeN, stock: true };
  wave = boot.wave;
  let steps = 0;
  while (wave.collapsed.some((c) => c == null)) {
    if (steps++ > MAX_STEPS) return { trails: forceTrailThin(wave), observeN: wave.observeN, stock: true };
    const shot = observeTrail(wave, s);
    if (shot.cell < 0 || !shot.trail) return { trails: forceTrailThin(shot.wave), observeN: shot.wave.observeN, stock: true };
    const prop = propagateTrail(shot.wave, shot.cell);
    if (prop.contradiction) return { trails: forceTrailThin(shot.wave), observeN: shot.wave.observeN, stock: true };
    wave = prop.wave;
  }
  return { trails: wave.collapsed as TrailSlot[], observeN: wave.observeN, stock: false };
}

function sampleFloor(role: PlateRole, s: string, i: number, observe: number): FloorSlot {
  const opts = roleFloors(role);
  if (opts.length === 1) return opts[0]!;
  const u = hash01(s, i, observe);
  return opts[Math.min(opts.length - 1, Math.floor(u * opts.length))]!;
}

function sampleFork(role: PlateRole, s: string, i: number, observe: number): ForkSlot {
  const opts = roleForks(role);
  if (opts.length === 1) return opts[0]!;
  const u = hash01(s, i, observe);
  return opts[Math.min(opts.length - 1, Math.floor(u * opts.length))]!;
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
  const trails = collapseTrails(list, s, roles.wave.observeN);
  let observeN = trails.observeN;
  const cells: WfcCell[] = list.map((role, i) => {
    const fork = sampleFork(role, s, i, observeN);
    observeN += 1;
    const floor = sampleFloor(role, s, i, observeN);
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
