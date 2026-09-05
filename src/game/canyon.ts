import type { Beat, BeatKind, Lane } from "./films";

export type CanyonMeta = {
  side: number;
  lift: number;
  roll: number;
};

export type CanyonBeat = Beat & { canyon: CanyonMeta };

const VP = { x: 0.5, y: 0.36 };
export const CANYON_APPROACH = 2.35;

function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function density(u: number) {
  if (u < 0.1) return 0.42;
  if (u < 0.32) return 0.9;
  if (u < 0.4) return 0.32;
  if (u < 0.72) return 1.18;
  if (u < 0.82) return 0.38;
  return 1.28;
}

function pickKind(u: number, rand: () => number): BeatKind {
  const r = rand();
  if (u < 0.1) return r < 0.55 ? "tap" : "swipe";
  if (u < 0.32) return r < 0.4 ? "tap" : r < 0.75 ? "swipe" : r < 0.9 ? "hold" : "relic";
  if (u < 0.4) return r < 0.5 ? "hold" : "relic";
  if (u < 0.72) return r < 0.28 ? "tap" : r < 0.55 ? "swipe" : r < 0.72 ? "mash" : r < 0.88 ? "hold" : "relic";
  if (u < 0.82) return r < 0.45 ? "hold" : r < 0.75 ? "relic" : "tap";
  return r < 0.3 ? "mash" : r < 0.55 ? "swipe" : r < 0.78 ? "tap" : "relic";
}

function labelOf(kind: BeatKind, u: number): string {
  if (kind === "swipe") return "DODGE";
  if (kind === "hold") return u > 0.8 ? "HOLD" : "BREATHE";
  if (kind === "mash") return u > 0.85 ? "BREAK" : "MASH";
  if (kind === "relic") return u > 0.85 ? "SIGHT" : "SHARD";
  return u > 0.9 ? "FIRE" : "TAP";
}

function laneOf(kind: BeatKind, rand: () => number): Lane {
  if (kind === "swipe") return rand() < 0.5 ? "l" : "r";
  if (kind === "tap") {
    const r = rand();
    return r < 0.33 ? "l" : r < 0.66 ? "r" : "c";
  }
  return "c";
}

/** ~50 seeded hazards for a continuous plunge. */
export function buildCanyonChart(duration: number, seed: number): CanyonBeat[] {
  const rand = mulberry32(seed || 1);
  const dur = Math.max(duration || 60, 20);
  const beats: CanyonBeat[] = [];
  let t = 1.9;
  let n = 0;
  while (t < dur - 1.35 && n < 56) {
    const u = t / dur;
    const kind = pickKind(u, rand);
    const lane = laneOf(kind, rand);
    const gap = (0.62 + rand() * 0.55) / Math.max(0.45, density(u));
    const side =
      kind === "swipe" ? (lane === "l" ? -1 : 1) : lane === "l" ? -0.72 : lane === "r" ? 0.72 : (rand() - 0.5) * 0.35;
    const lift = 0.22 + rand() * 0.58;
    const win =
      kind === "mash" ? 1.35 : kind === "hold" ? 1.45 : kind === "relic" ? 1.2 : kind === "swipe" ? 0.92 : 0.72;
    beats.push({
      id: `c${n}`,
      at: t,
      win,
      kind,
      lane,
      need: kind === "mash" ? (u > 0.8 ? 6 : 4) : 1,
      holdMs: kind === "hold" ? 620 : 0,
      label: labelOf(kind, u),
      canyon: { side, lift, roll: (rand() - 0.5) * 22 },
    });
    n += 1;
    t += gap;
  }
  if (beats.length && beats[beats.length - 1]!.kind !== "tap") {
    const lastAt = Math.min(dur - 0.7, (beats[beats.length - 1]!.at ?? dur) + 1.1);
    beats.push({
      id: "cfin",
      at: lastAt,
      win: 0.8,
      kind: "tap",
      lane: "c",
      need: 1,
      holdMs: 0,
      label: "FIRE",
      canyon: { side: 0, lift: 0.48, roll: 0 },
    });
  }
  return beats;
}

export function projectHazard(meta: CanyonMeta, p: number) {
  const k = Math.max(0, Math.min(1, p));
  const grow = k ** 1.45;
  const x = VP.x + meta.side * (0.06 + 0.4 * grow);
  const y = VP.y + 0.04 + (meta.lift - 0.5) * 0.12 + 0.46 * grow;
  const scale = 0.14 + grow * 1.12;
  const opacity = 0.28 + k * 0.72;
  return { x, y, scale, opacity, roll: meta.roll * (1 - grow * 0.35) };
}
