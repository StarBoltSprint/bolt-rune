/** Locked whole-hall still — camera authority. Never a follow-cam crop. */
export const HALL_STILL = "/films/citadel-tour.jpg?v=sharp";
/** Living film inside that same locked frame (Bolt breathes; camera does not move). */
export const HALL_LOOP = "/ui/citadel.mp4?v=aaa";

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
