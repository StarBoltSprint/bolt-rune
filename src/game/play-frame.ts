import { playableClipSrc } from "./play-clip.ts";
import { BOLT_BODY, TOUR_PLATE } from "./rune.ts";
import { HALL_STILL, isHallFilm } from "./stock-room.ts";

export type PlayClip = { url: string; end?: string };
export type PlayBank = Map<string, PlayClip> | Iterable<[string, PlayClip]> | Record<string, PlayClip>;
export type PlayFrameKind = "walk" | "breath" | "hall" | "fail";

export type LivingPlayFrame = {
  kind: "walk" | "breath" | "hall";
  /** Breath or walk mp4. Empty when play is a hall still (or cook must stay in forge). */
  url: string;
  /** Cover / plate — always a hall still, never the sealed Bolt silhouette. */
  still: string;
  phase: "play" | "forge";
  frost: string;
  playFrame: PlayFrameKind;
};

const BOLT_REF =
  /\/refs\/bolt(?:-white|-face|-body)?(?:\.jpg|\.jpeg|\.png|\.webp)?(?:\?|$)/i;

/** Isolated identity stills (white Bolt on black). Never a living hall plate. */
export function isBoltSilhouette(u?: string | null): boolean {
  if (!u) return false;
  return BOLT_REF.test(u);
}

/** Hall camera still that may cover play. Rejects sealed Bolt / non-hall refs / grab data URLs. */
export function isHallPlayStill(u?: string | null): boolean {
  if (!u || isBoltSilhouette(u)) return false;
  if (isHallFilm(u)) return true;
  const s = u.toLowerCase();
  if (s.includes("/refs/")) return false;
  if (s.includes("/ui/citadel.jpg") || s.includes("hall-doors")) return false;
  if (s.startsWith("data:")) return false;
  return s.startsWith("/films/") || s.startsWith("http") || s.startsWith("blob:");
}

/** stockRoomBank idle/walk — HALL_LOOP + HALL_STILL, not an arrival last-frame. */
export function isStockHallClip(clip?: { url?: string | null; end?: string | null } | null): boolean {
  if (!clip?.url) return false;
  return isHallFilm(clip.url) && (!clip.end || isHallFilm(clip.end));
}

/**
 * After grabRuneFrame / shotEnd, keep `landed`.
 * Stock idle-m1/m2 must not overwrite latest / pose / still with HALL_STILL.
 */
export function arrivalEndStill(
  landed?: string | null,
  home?: { url?: string | null; end?: string | null } | null,
): string {
  const end = (landed || "").trim();
  if (!end) return (home?.end || "").trim();
  if (!home?.url || isStockHallClip(home)) return end;
  if (isHallFilm(home.end) || isBoltSilhouette(home.end)) return end;
  return (home.end || end).trim();
}

/**
 * First real last-frame still that may seed Imagine / @ref for the next A↔B walk.
 * Stock hall stills and Bolt silhouettes are not seeds.
 */
export function walkLastFrameSeed(...candidates: (string | null | undefined)[]): string {
  for (const u of candidates) {
    const s = (u || "").trim();
    if (!s || isBoltSilhouette(s) || isHallFilm(s)) continue;
    if (s.startsWith("data:") || s.startsWith("blob:") || s.startsWith("http") || s.startsWith("/films/") || s.startsWith("/api/")) {
      return s;
    }
  }
  return "";
}

/**
 * Reuse a bank walk only when it already continues this last-frame seed.
 * Stock HALL_LOOP cannot start from an arrival still — next walk must Imagine from the seed.
 */
export function walkClipHoldsSeed(
  clip?: { url?: string | null; end?: string | null } | null,
  seed?: string | null,
): boolean {
  if (!clip?.url) return false;
  const next = walkLastFrameSeed(seed);
  if (!next) return true;
  if (isStockHallClip(clip)) return false;
  return true;
}

/**
 * Visible door breath — a looping idle clip, not the walk and not stock HALL_LOOP.
 * Stock idle-* is the same spawn loop as the walk; play must not treat it as breath.
 */
export function doorBreathPlayable(
  idle?: { url?: string | null; end?: string | null } | null,
  walkUrl?: string | null,
): boolean {
  const url = (idle?.url || "").trim();
  if (!url) return false;
  if (isBoltSilhouette(url) || isBoltSilhouette(idle?.end)) return false;
  if (isHallFilm(url) || isStockHallClip(idle)) return false;
  if (walkUrl && url === walkUrl) return false;
  return true;
}

/** Sealed pack identity labels only. Face labels pack to the rear body — never bolt-face.jpg. */
export function packIdentityStill(label: string): string | null {
  const n = label.toLowerCase().trim();
  if (n === "bolt" || n === "bolt-body" || n === "bolt-face" || n === "face") return BOLT_BODY;
  if (n.includes("place") || n.includes("pose") || n.includes("seed") || /\bin\b/.test(n)) return null;
  if (n.includes("hall") || n.includes("empty") || n.includes("room") || n.includes("doors")) return TOUR_PLATE;
  return null;
}

function bankEntries(bank: PlayBank): [string, PlayClip][] {
  if (bank instanceof Map) return [...bank.entries()];
  if (bank && typeof bank === "object" && Symbol.iterator in bank) return [...(bank as Iterable<[string, PlayClip]>)];
  if (bank && typeof bank === "object") return Object.entries(bank);
  return [];
}

function clipPlayable(clip?: PlayClip | null): clip is PlayClip {
  if (!clip?.url) return false;
  if (isBoltSilhouette(clip.url) || isBoltSilhouette(clip.end)) return false;
  return Boolean(playableClipSrc(clip.url));
}

function isWalkKey(k: string) {
  if (k.startsWith("idle-") || k.startsWith("still-") || k.startsWith("enter")) return false;
  if (k.includes("#") || k.includes("←")) return false;
  return k.includes("→");
}

export function walkClips(bank: PlayBank): PlayClip[] {
  const out: PlayClip[] = [];
  const seen = new Set<string>();
  for (const [k, v] of bankEntries(bank)) {
    const url = playableClipSrc(v.url);
    if (!isWalkKey(k) || !clipPlayable(v) || !url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, end: v.end });
  }
  return out;
}

export function breathClips(bank: PlayBank): PlayClip[] {
  const out: PlayClip[] = [];
  const seen = new Set<string>();
  const take = (k: string, v: PlayClip) => {
    const url = playableClipSrc(v.url);
    if (!clipPlayable(v) || !url || seen.has(url)) return;
    if (!(k === "idle-spawn" || k.startsWith("idle-spawn←") || /^idle-spawn#/.test(k))) return;
    seen.add(url);
    out.push({ url, end: v.end });
  };
  for (const [k, v] of bankEntries(bank)) take(k, v);
  if (out.length) return out;
  for (const [k, v] of bankEntries(bank)) {
    const url = playableClipSrc(v.url);
    if (!k.startsWith("idle-") || k.includes("#") || !clipPlayable(v) || !url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, end: v.end });
  }
  return out;
}

export function cookHasWalks(bank: PlayBank): boolean {
  return walkClips(bank).length > 0;
}

export function hallStillOf(input: {
  hall?: string | null;
  empty?: string | null;
  start?: string | null;
  plate?: string | null;
  placed?: string | null;
  seed?: string | null;
  room?: string | null;
}): string {
  for (const u of [input.hall, input.empty, input.start, input.plate, input.placed, input.seed, input.room]) {
    if (isHallPlayStill(u)) return u as string;
  }
  return HALL_STILL;
}

/** Prefer a hall still over a sealed Bolt / seed silhouette. */
export function playStillOrHall(candidate: string | null | undefined, hall: string): string {
  if (isHallPlayStill(candidate)) return candidate as string;
  if (isHallPlayStill(hall)) return hall;
  return HALL_STILL;
}

/** Cover shown on play — locked hall still. Never sealed Bolt, never a grab data URL. */
export function playCoverStill(input: {
  hall?: string | null;
  empty?: string | null;
  start?: string | null;
  plate?: string | null;
  placed?: string | null;
  seed?: string | null;
  room?: string | null;
}): string {
  const still = hallStillOf(input);
  if (isBoltSilhouette(still) || !still) return HALL_STILL;
  return still;
}

export function seedMayBankIdle(startStill?: string | null): boolean {
  return isHallPlayStill(startStill);
}

/**
 * After a mocked or live cook, pick the living play frame.
 * Walk/breath urls win. Sealed BOLT / seed silhouettes never become the plate.
 * No walk urls → stay in forge (do not mark cook done with only refs).
 */
export function livingPlayFrame(input: {
  bank: PlayBank;
  hall?: string | null;
  empty?: string | null;
  start?: string | null;
  plate?: string | null;
  placed?: string | null;
  seed?: string | null;
  room?: string | null;
}): LivingPlayFrame {
  const still = playCoverStill(input);
  const walks = walkClips(input.bank);
  if (!walks.length) {
    return {
      kind: "hall",
      url: "",
      still,
      phase: "forge",
      frost: "walks failed · tap retry",
      playFrame: "fail",
    };
  }
  const breath = breathClips(input.bank)[0];
  if (breath) {
    return {
      kind: "breath",
      url: breath.url,
      still: isHallPlayStill(breath.end) ? (breath.end as string) : still,
      phase: "play",
      frost: "",
      playFrame: "breath",
    };
  }
  return {
    kind: "walk",
    url: walks[0]!.url,
    still: isHallPlayStill(walks[0]!.end) ? (walks[0]!.end as string) : still,
    phase: "play",
    frost: "",
    playFrame: "walk",
  };
}
