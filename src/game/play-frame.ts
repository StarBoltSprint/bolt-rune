import { playableClipSrc } from "./play-clip.ts";
import { BOLT_BODY, TOUR_PLATE } from "./rune.ts";
import { HALL_STILL, isHallFilm } from "./stock-room.ts";

export type PlayClip = { url: string; end?: string; start?: string };
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
 * Reuse a bank walk only when it was cooked FROM this last-frame seed (`clip.start`).
 * A prior A→B (mid-stride / other facing / other coat) must not play after breath at A.
 * Stock HALL_LOOP never holds a seed — next walk Imagines from the still.
 * Load hydrate may drop `start`: keep the cooked clip (do not re-Imagine).
 */
export function walkClipHoldsSeed(
  clip?: { url?: string | null; end?: string | null; start?: string | null } | null,
  seed?: string | null,
): boolean {
  if (!clip?.url) return false;
  if (isStockHallClip(clip)) return false;
  const next = walkLastFrameSeed(seed);
  if (!next) return true;
  const from = walkLastFrameSeed(clip.start);
  if (!from) return true;
  return from === next;
}

/** Sealed Imagine walk — Load Door A must play this, never re-Imagine. */
export function sealedWalkPlayable(
  clip?: { url?: string | null; end?: string | null; start?: string | null } | null,
): boolean {
  return Boolean(clip?.url) && !isStockHallClip(clip);
}

export function hallBankCount(halls?: { bank?: { url?: string | null }[] }[] | null): number {
  return (halls || []).reduce((n, h) => n + (h.bank || []).filter((b) => b?.url).length, 0);
}

/** Keep richer cooked hall banks. More empty halls must not wipe clips. */
export function preferHalls<T extends { bank?: { url?: string | null }[] }>(
  packed?: T[] | null,
  kept?: T[] | null,
): T[] | undefined {
  const pc = hallBankCount(packed);
  const kc = hallBankCount(kept);
  if (pc !== kc) return (pc > kc ? packed : kept) || undefined;
  const pl = packed?.length || 0;
  const kl = kept?.length || 0;
  if (pl !== kl) return (pl > kl ? packed : kept) || undefined;
  return packed || kept || undefined;
}

export type BankRow = { key: string; url: string; end?: string; start?: string };

/** Union two banks. Existing keys keep url/end/start; incoming only fills gaps or adds keys. */
export function mergeBankClips(keep: BankRow[] = [], incoming: BankRow[] = []): BankRow[] {
  const byKey = new Map<string, { key: string; url: string; end: string; start?: string }>();
  const take = (b?: BankRow | null, prefer = false) => {
    if (!b?.key || !b.url) return;
    const prev = byKey.get(b.key);
    if (!prev) {
      byKey.set(b.key, { key: b.key, url: b.url, end: b.end || "", start: b.start || undefined });
      return;
    }
    byKey.set(b.key, {
      key: b.key,
      url: prefer ? b.url || prev.url : prev.url || b.url,
      end: prefer ? b.end || prev.end || "" : prev.end || b.end || "",
      start: prefer ? b.start || prev.start : prev.start || b.start,
    });
  };
  for (const b of incoming) take(b, false);
  for (const b of keep) take(b, true);
  return [...byKey.values()];
}

function clipUrl(v?: PlayClip | BankRow | null): string {
  const url = (v?.url || "").trim();
  if (!url || isBoltSilhouette(url)) return "";
  return url;
}

/**
 * Living breath to loop at spawn / A / B after a walk (or on Load play).
 * Cooked idle-* for THIS node wins. Never returns the walk.
 * Never falls across nodes — idle-spawn is not m1/m2 arrival breath (snap-back).
 * Stock HALL_LOOP is last resort at spawn only — at a door it is the center-hall fail.
 */
export function arrivalBreathUrl(
  bank: PlayBank,
  node: string,
  via?: string,
  walkUrl?: string,
): string {
  const entries = bankEntries(bank);
  const walk = (walkUrl || "").trim();
  const ok = (v?: PlayClip | null) => {
    const url = clipUrl(v);
    if (!url || (walk && url === walk)) return "";
    return url;
  };
  const keyed = via ? entries.find(([k]) => k === `idle-${node}←${via}`)?.[1] : undefined;
  const direct = entries.find(([k]) => k === `idle-${node}`)?.[1];
  const any = entries.find(([k, v]) => k.startsWith(`idle-${node}`) && ok(v))?.[1];
  for (const hit of [keyed, direct, any]) {
    if (doorBreathPlayable(hit, walk)) return clipUrl(hit);
  }
  if (node === "spawn") {
    for (const hit of [keyed, direct, any]) {
      const url = ok(hit);
      if (url) return url;
    }
  }
  return "";
}

/**
 * Missing or stock/unplayable door idle — cookIdleAt from walk last-frame.
 * A url on idle-m1/m2 is not enough: stock HALL_LOOP must not skip the cook.
 */
export function doorArrivalNeedsCook(
  idle?: { url?: string | null; end?: string | null } | null,
  walkUrl?: string | null,
): boolean {
  return !doorBreathPlayable(idle, walkUrl);
}

/** True when the picture has a looping breath — the primary Play / Load / forge-complete acceptance. */
export function pictureNeverStops(
  bank: PlayBank,
  node: "spawn" | "m1" | "m2",
  via?: string,
  walkUrl?: string,
): boolean {
  return Boolean(arrivalBreathUrl(bank, node, via, walkUrl));
}

/** Hide Still A / Still B that are the same pixels as hall/seed. */
export function filmTrayStillKeep(
  id: "spawn" | "m1" | "m2",
  src?: string | null,
  hall?: string | null,
): boolean {
  const still = (src || "").trim();
  if (!still) return false;
  if (id === "spawn") return true;
  const plate = (hall || "").trim();
  return !plate || still !== plate;
}

/** Door A/B aliases; spawn and other marker ids stay as-is. */
export function playNodeId(id?: string | null): string {
  const s = String(id || "").trim();
  if (s === "A" || s === "m1") return "m1";
  if (s === "B" || s === "m2") return "m2";
  return s;
}

/**
 * Other-marker tap while ANY idle/breath is looping (idle-spawn, idle-m1, idle-m2, arrival).
 * Walk starts now — never queue until clip end, kickPlay loop boundary, or shotEnd(idle).
 * Same-node stay / hung 2nd-tap enter is not this. Mid-walk / cook stays queued.
 */
export function breathTapWalksNow(opts: {
  here?: string | null;
  door?: string | null;
  beat?: string | null;
  filmLoop?: boolean;
}): boolean {
  const door = playNodeId(opts.door);
  const here = playNodeId(opts.here);
  if (!door || door === here) return false;
  const beat = String(opts.beat || "");
  if (beat === "playvid" || beat === "walk" || beat === "cook") return false;
  return Boolean(opts.filmLoop) || beat === "idle" || beat === "shot" || !beat;
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
