/** Locked whole-hall still — camera authority. Never a follow-cam crop. */
export const HALL_STILL = "/films/citadel-tour.jpg?v=sharp";
/** Living film inside that same locked frame (Bolt breathes; camera does not move). */
export const HALL_LOOP = "/ui/citadel.mp4?v=aaa";

export type DoorHit = { x: number; y: number; w: number; h: number };

/**
 * Picture-space portal boxes for the locked hall still / loop.
 * Measured on citadel-tour (teal ~0.13–0.41 × 0.30–0.62, gold ~0.60–0.83 × 0.30–0.62)
 * and padded so a finger on the octagon never falls through to spawn.
 */
export function stockDoorHits(): { m1: DoorHit; m2: DoorHit } {
  return {
    m1: { x: 0.02, y: 0.16, w: 0.46, h: 0.56 },
    m2: { x: 0.52, y: 0.16, w: 0.46, h: 0.56 },
  };
}

export function inDoorHit(b: DoorHit, nx: number, ny: number) {
  return nx >= b.x && nx <= b.x + b.w && ny >= b.y && ny <= b.y + b.h;
}

/**
 * Hit-test a picture-space point against Door A / Door B (and spawn only
 * when the tap is clearly on Bolt, not a portal).
 */
export function doorAtPoint(
  nx: number,
  ny: number,
  hits?: { m1: DoorHit; m2: DoorHit } | null,
  spawn = { x: 0.5, y: 0.78 },
): "m1" | "m2" | "spawn" | null {
  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
  const stock = stockDoorHits();
  const a = inDoorHit(stock.m1, nx, ny) || (hits ? inDoorHit(hits.m1, nx, ny) : false);
  const b = inDoorHit(stock.m2, nx, ny) || (hits ? inDoorHit(hits.m2, nx, ny) : false);
  if (a && b) return nx < 0.5 ? "m1" : "m2";
  if (a) return "m1";
  if (b) return "m2";
  if (ny >= 0.14 && ny <= 0.78) {
    if (nx < 0.5) return "m1";
    if (nx > 0.5) return "m2";
  }
  if (Math.hypot(nx - spawn.x, ny - spawn.y) < 0.12) return "spawn";
  return null;
}

export function isHallFilm(u?: string | null) {
  if (!u) return false;
  const s = u.toLowerCase();
  return s.includes("/ui/citadel.mp4") || s.includes("/films/citadel-tour") || s.includes("/films/citadel.jpg");
}

function otherDoor(first: "m1" | "m2"): "m1" | "m2" {
  return first === "m1" ? "m2" : "m1";
}

function pathWalks(first: "m1" | "m2"): { from: string; to: string; via: string }[] {
  const a = first;
  const b = otherDoor(first);
  return [
    { from: "spawn", to: a, via: "start" },
    { from: a, to: b, via: "spawn" },
    { from: b, to: a, via: a },
  ];
}

/**
 * Breath + door walks so New citadel is playable before Imagine cooks.
 * Every clip keeps the same hall still as the end frame — camera stays locked
 * on the whole hall. Bolt moves inside that frame; the lens does not follow.
 */
export function stockRoomBank(first: "m1" | "m2"): { key: string; url: string; end: string }[] {
  const still = HALL_STILL;
  const loop = HALL_LOOP;
  const walks = [...pathWalks(first), { from: "spawn", to: otherDoor(first), via: "start" }];
  const bank: { key: string; url: string; end: string }[] = [
    { key: "idle-spawn", url: loop, end: still },
    { key: "idle-m1", url: loop, end: still },
    { key: "idle-m2", url: loop, end: still },
  ];
  const seen = new Set<string>();
  for (const w of walks) {
    const simple = `${w.from}→${w.to}`;
    const via = `${w.from}←${w.via}→${w.to}`;
    if (!seen.has(simple)) {
      seen.add(simple);
      bank.push({ key: simple, url: loop, end: still });
    }
    if (!seen.has(via)) {
      seen.add(via);
      bank.push({ key: via, url: loop, end: still });
    }
  }
  return bank;
}
