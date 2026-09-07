import type { HungArtifact, HungRoom } from "./artifacts.ts";
import { playableClipSrc, stockBiomeLoop } from "./play-clip.ts";
import type { RiftGate } from "./rune-session.ts";
import { doorAtPoint, HALL_LOOP, isHallFilm, isLivingHallLoop } from "./stock-room.ts";

export type DoorLetter = "A" | "B";
export type DoorId = "m1" | "m2";
export type BiomeName =
  | "asteroid"
  | "forest"
  | "canyon"
  | "city"
  | "open"
  | "ocean"
  | "dune"
  | "ruin"
  | "ember"
  | "peak"
  | "rome"
  | "greece"
  | "persia"
  | "egypt"
  | "babylon";

const BIOME_IDS: BiomeName[] = [
  "asteroid",
  "forest",
  "canyon",
  "city",
  "ocean",
  "dune",
  "ruin",
  "ember",
  "peak",
  "rome",
  "greece",
  "persia",
  "egypt",
  "babylon",
  "open",
];

export type DoorEnter =
  | {
      kind: "biome";
      door: DoorLetter;
      hall: number;
      citadel?: string;
      art: string;
      biome: BiomeName;
      name: string;
      still: string;
      trans: string;
      playlist: string[];
      clips: string[];
    }
  | { kind: "hall"; door: DoorLetter; hall: number };

export function doorIdOf(letter: DoorLetter): DoorId {
  return letter === "B" ? "m2" : "m1";
}

export function doorLetterOf(id: DoorId | "a" | "b" | DoorLetter): DoorLetter {
  return id === "m2" || id === "B" || id === "b" ? "B" : "A";
}

/** Hall trans in a sprint — door tap enters, it is not a gesture miss. */
export function sprintHallDoor(url: string | null | undefined, nx: number, ny: number): DoorLetter | null {
  if (!isHallFilm(url)) return null;
  const hit = doorAtPoint(nx, ny);
  if (hit === "m1") return "A";
  if (hit === "m2") return "B";
  return null;
}

/** True while a sprint plate is the locked hall — QTE must not score MISS. */
export function hallPlateAt(
  playlist: Array<string | null | undefined> = [],
  i = 0,
  liveUrl?: string | null,
): boolean {
  return Boolean(
    isHallFilm(playlist[i]) ||
      isHallFilm(liveUrl) ||
      sprintHallDoor(playlist[i], 0.22, 0.42) ||
      sprintHallDoor(liveUrl, 0.22, 0.42),
  );
}

export function biomeStill(id: BiomeName) {
  return `/films/cook-${id}.jpg`;
}

export function biomeLoop(id: BiomeName) {
  return `/films/forge-${id}.mp4`;
}

export function stockBiomePlaylist(id: BiomeName): string[] {
  if (id === "forest") {
    return [
      "/films/forge-forest.mp4",
      "/films/forge-forest-moss.mp4",
      "/films/forge-forest-crystal.mp4",
      "/films/forge-forest-dusk.mp4",
    ];
  }
  const loop = biomeLoop(id);
  return [loop, loop, loop, loop];
}

function asBiome(id?: string | null): BiomeName | "" {
  if (!id) return "";
  return BIOME_IDS.includes(id as BiomeName) ? (id as BiomeName) : "";
}

export function inferBiome(a: Pick<HungArtifact, "name" | "still" | "playlist" | "prompt" | "room">): BiomeName {
  const tagged = asBiome(a.room && "biome" in a.room ? String(a.room.biome || "") : "");
  if (tagged) return tagged;
  const blob = [a.still, ...(a.playlist || []), a.name, a.prompt].join(" ").toLowerCase();
  for (const id of BIOME_IDS) {
    if (id === "open") continue;
    if (blob.includes(`/cook-${id}`) || blob.includes(`/forge-${id}`) || blob.includes(id)) return id;
  }
  return "open";
}

/** Room-side mock trans when Imagine is dark. Living-hall loop seeds the door crossing. */
export function stockTransUrl(_door: DoorLetter | DoorId = "A", _biome?: BiomeName): string {
  return HALL_LOOP;
}

function keepClip(u?: string) {
  if (!u) return "";
  if (/\.mp4(\?|$)/i.test(u) || u.includes("xai-vidgen") || u.startsWith("/api/clip") || u.includes("/films/clips/") || u.includes("/films/") || u.includes("/ui/")) {
    if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)) return "";
    return u;
  }
  return "";
}

function uniq(urls: string[]) {
  const out: string[] = [];
  for (const raw of urls) {
    const u = keepClip(raw);
    if (!u || out.includes(u)) continue;
    out.push(u);
  }
  return out;
}

export function bindHungRoom(
  a: HungArtifact,
  door: DoorLetter,
  opts: { hall: number; citadel?: string; still?: string; trans?: string; biome?: BiomeName },
): HungRoom {
  const biome = opts.biome || inferBiome(a);
  return {
    door,
    still: opts.still || a.still || biomeStill(biome),
    trans: opts.trans || a.room?.trans || stockTransUrl(door, biome),
    citadel: opts.citadel,
    hall: opts.hall,
    biome,
  };
}

/** Pure hang — caller persists with hangOnRoom if needed. */
export function hangArtifactOnDoor(
  id: string,
  door: DoorLetter,
  opts: { hall: number; citadel?: string; still?: string; trans?: string; biome?: BiomeName },
  from: HungArtifact[],
): HungArtifact[] {
  const a = from.find((x) => x.id === id);
  if (!a) return from;
  const room = bindHungRoom(a, door, opts);
  return from.map((x) => (x.id === id ? { ...x, room, hungAt: Date.now() } : x));
}

export function gateFromHung(a: HungArtifact): RiftGate {
  const biome = inferBiome(a);
  const urls = uniq([...(a.playlist || []), ...stockBiomePlaylist(biome)]);
  const still = a.still || biomeStill(biome) || urls[0] || "";
  return {
    biome,
    name: a.name || biome,
    still,
    loop: urls[0] || biomeLoop(biome) || still,
    playlist: urls.length ? urls : stockBiomePlaylist(biome),
    trans: a.room?.trans || stockTransUrl(a.room?.door || "A", biome),
    art: a.id,
  };
}

function hallMatches(room: HungRoom, hall: number) {
  if (room.hall && room.hall !== hall) return false;
  if (!room.hall && hall !== 1) return false;
  return true;
}

function citadelMatches(_room: HungRoom, _citadel: string) {
  /* Hall number is the bind. Citadel id is a hint — a new living-hall
     session must still walk a hang on that room's door. */
  return true;
}

/** Latest hang on a door wins. Hall number is the bind; citadel is a hint. */
export function hydrateRift(
  citadel: string,
  hall: number,
  rift: { m1?: RiftGate; m2?: RiftGate },
  arts: HungArtifact[],
): { m1?: RiftGate; m2?: RiftGate } {
  const next = { ...rift };
  const ordered = [...arts].sort((p, q) => (q.hungAt || 0) - (p.hungAt || 0));
  for (const a of ordered) {
    const room = a.room;
    if (!room?.door) continue;
    if (!hallMatches(room, hall)) continue;
    if (!citadelMatches(room, citadel)) continue;
    const door: DoorId = doorIdOf(room.door);
    if (next[door]?.art === a.id) {
      next[door] = { ...next[door], ...gateFromHung(a), trans: next[door]?.trans || room.trans };
      continue;
    }
    if (next[door]) {
      const prev = arts.find((x) => x.id === next[door]?.art);
      if (prev?.room && hallMatches(prev.room, hall)) continue;
      /* Stale last-hung / other-hall gate — Hang Room N on this hall wins. */
    }
    next[door] = gateFromHung(a);
  }
  return next;
}

/** Latest hang on this letter, preferring the living hall. 0 if none. */
export function hungHallForDoor(door: DoorLetter, hall: number, arts: HungArtifact[]): number {
  const ordered = [...arts].filter((a) => a.room?.door === door).sort((p, q) => (q.hungAt || 0) - (p.hungAt || 0));
  if (ordered.some((a) => a.room && hallMatches(a.room, hall))) return hall;
  const other = ordered.find((a) => {
    const n = a.room?.hall || 0;
    return n >= 1 && n <= 8;
  });
  return other?.room?.hall && other.room.hall >= 1 && other.room.hall <= 8 ? other.room.hall : 0;
}

export function latestHungHall(arts: HungArtifact[]): number {
  const ordered = [...arts].filter((a) => a.room?.hall).sort((p, q) => (q.hungAt || 0) - (p.hungAt || 0));
  const n = ordered[0]?.room?.hall || 0;
  return n >= 1 && n <= 8 ? n : 0;
}

/** Enter the hung biome even if the living overlay is still on another hall. */
export function resolveHungEnter(
  door: DoorLetter,
  hall: number,
  citadel: string,
  arts: HungArtifact[],
  rift?: { m1?: RiftGate; m2?: RiftGate },
): DoorEnter {
  const here = stayBiomePlay(resolveDoorEnter(door, hall, citadel, arts, rift));
  if (here.kind === "biome") return here;
  const want = hungHallForDoor(door, hall, arts);
  if (want && want !== hall) return stayBiomePlay(resolveDoorEnter(door, want, citadel, arts, {}));
  return here;
}

export function resolveDoorEnter(
  door: DoorLetter,
  hall: number,
  citadel: string,
  arts: HungArtifact[],
  rift?: { m1?: RiftGate; m2?: RiftGate },
): DoorEnter {
  const restored = hydrateRift(citadel, hall, rift || {}, arts);
  const gate = restored[doorIdOf(door)];
  if (!gate) return { kind: "hall", door, hall };
  const biome = asBiome(gate.biome) || inferBiome({ name: gate.name, still: gate.still, playlist: gate.playlist || [], prompt: gate.name });
  const trans = gate.trans && /\.mp4(\?|$)/i.test(gate.trans) ? gate.trans : stockTransUrl(door, biome);
  const playlist = uniq([...(gate.playlist || []), ...stockBiomePlaylist(biome), gate.loop]);
  const clips = uniq([trans, ...playlist]);
  const bound = (() => {
    const art = gate.art ? arts.find((a) => a.id === gate.art) : undefined;
    return hungHallN(art?.room?.hall);
  })();
  return {
    kind: "biome",
    door,
    hall: bound || hungHallN(hall) || hall,
    citadel: citadel || undefined,
    art: gate.art || "",
    biome,
    name: gate.name || biome,
    still: gate.still && !isHallFilm(gate.still) ? gate.still : biomeStill(biome),
    trans,
    playlist,
    clips,
  };
}

/** Leftover Door A/B pointer from living-hall enter typically lands inside this window. */
export const ENTER_LEFTOVER_MS = 1100;

/**
 * Hall-plate tap during biome enter.
 * Leftover enter tap and any door while we hold a hung biome stay on biome —
 * never QTE-MISS, never tank pace, never fracture back to the hall.
 */
export function hallDoorTap(
  now: number,
  mountedAt: number,
  hit: DoorLetter,
  hold?: DoorLetter | null,
): "stay" | "enter" {
  if (hold) return "stay";
  if (now - mountedAt < ENTER_LEFTOVER_MS) return "stay";
  void hit;
  return "enter";
}

/**
 * Leftover hall-door plate during hung enter — never QTE-MISS.
 * Hung biome sprint itself is a playable game: holdDoor alone is not quiet.
 */
export function biomeQteQuiet(holdDoor?: string | null, hallPlate = false): boolean {
  return Boolean(holdDoor && hallPlate);
}

/** Hung Door A stay is a sprint game unless the leftover hall plate is up. */
export function biomeHoldPlays(holdDoor?: string | null, hallPlate = false): boolean {
  return Boolean(holdDoor) && !biomeQteQuiet(holdDoor, hallPlate);
}

/**
 * Hung Door A/B stay native-loops the biome MP4.
 * Ending a plate must wrap — never finish, pause, or Film-fracture out of stay.
 */
export function holdDoorLoops(hold?: string | null): boolean {
  return Boolean(hold);
}

/**
 * Hung Door A/B living-hall tap.
 * First tap (not at that door) → walk. Breathing at the same hung door → enter.
 * Other door is always a walk. Never biome on the first approach tap.
 */
export function hungDoorTap(here?: string | null, door?: string | null): "walk" | "enter" | null {
  const id = door === "A" || door === "m1" ? "m1" : door === "B" || door === "m2" ? "m2" : "";
  if (!id) return null;
  return String(here || "") === id ? "enter" : "walk";
}

/** First tap on hung Door A/B while Bolt is not at that door — walk, never biome. */
export function hungEnterNeedsWalk(here?: string | null, door?: string | null): boolean {
  return hungDoorTap(here, door) === "walk";
}

export type HungDoorArm = "walk" | "enter" | "stay" | null;

/**
 * Living-hall door arm after Hang.
 * Walk any-to-any. Same hung door while breathing → enter biome.
 * Same unhung door → stay (never destHall / spawn snap).
 */
export function hungDoorArm(here?: string | null, door?: string | null, hung = false): HungDoorArm {
  const tap = hungDoorTap(here, door);
  if (!tap) return null;
  if (tap === "walk") return "walk";
  return hung ? "enter" : "stay";
}

/** Hang bound this hall — destHall must not teleport or play enter→spawn. */
export function hungHallLocksDoors(opts?: {
  riftA?: unknown;
  riftB?: unknown;
  hungA?: boolean;
  hungB?: boolean;
  hangRoom?: number | string | null;
}): boolean {
  if (!opts) return false;
  if (opts.riftA || opts.riftB || opts.hungA || opts.hungB) return true;
  return hungHallN(opts.hangRoom) > 0;
}

/** Clip is at the loop seam — restart the chart, do not MISS / finish / fracture. */
export function holdLoopSeam(
  ended: boolean,
  currentTime: number,
  duration: number,
  epsilon = 0.12,
): boolean {
  const slop = Math.max(0.02, epsilon);
  /* After a wrap seek, currentTime is ~0 — that is the new loop, not the seam. */
  if (Number.isFinite(currentTime) && currentTime >= 0 && currentTime <= slop) return false;
  if (ended) return true;
  if (!Number.isFinite(duration) || duration <= 1) return false;
  if (!Number.isFinite(currentTime)) return false;
  return currentTime >= duration - slop;
}

/** Hall N in 1–8, else 0. Living default 1 is a real hall — callers must not treat 0 as Room 1. */
export function hungHallN(v?: number | string | null): number {
  const raw = typeof v === "number" ? v : Number(v);
  return Number.isFinite(raw) && raw >= 1 && raw <= 8 ? Math.round(raw) : 0;
}

/**
 * Biome enter / FilmStage chrome hall.
 * Hang Room N / enter hall 2–8 win over last-hung art.room.hall (Room 3/8 leak).
 * Living default / hallHold 1 never overrides a Room 2+ hang or artefact bind.
 */
export function hungEnterBindHall(
  artHall?: number | string | null,
  enterHall?: number | string | null,
  hangRoom?: number | string | null,
): number {
  const art = hungHallN(artHall);
  const enter = hungHallN(enterHall);
  const hang = hungHallN(hangRoom);
  const now = [hang, enter].find((n) => n >= 2);
  if (now) return now;
  if (art >= 2) return art;
  return hang || enter || art || 0;
}

/** Living-hall / FilmStage overlay after Hang Room N — never stuck on Room 1. Door letter is never blank. */
export function hungPlayChrome(hall?: number | string | null, door?: string | null): { keeper: string; name: string } {
  const n = hungHallN(hall) || 1;
  const letter = doorLetterOf(door || "A");
  return {
    keeper: `Room ${n} • Door ${letter}`,
    name: "Play Sprint",
  };
}

/** After Hang Room N Door A — walk that living hall, not a floating FilmStage. */
export function walkHungHref(
  room?: { hall?: number | string | null; door?: string | null; citadel?: string } | null,
  rooms = 1,
): string {
  const raw = typeof room?.hall === "number" ? room.hall : Number(room?.hall);
  const hall = Number.isFinite(raw) && raw >= 1 && raw <= 8 ? Math.round(raw) : 0;
  if (!hall || !room?.door) return "";
  const first = room.door === "B" || room.door === "b" || room.door === "m2" ? "m2" : "m1";
  const cap = Math.max(hall, Math.min(8, Math.round(rooms) || hall));
  const cit = String(room.citadel || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  if (cit) return `/rune?session=${encodeURIComponent(cit)}&hall=${hall}&drive=engine`;
  return `/rune?first=${first}&drive=engine&rooms=${cap}&hall=${hall}&stills=0`;
}

/** After Hang room lock — walk that living hall so door A/B can hang. No door yet. */
export function walkHangHallHref(citadel?: string | null, hall?: number | string | null, rooms = 1): string {
  const raw = typeof hall === "number" ? hall : Number(hall);
  const n = Number.isFinite(raw) && raw >= 1 && raw <= 8 ? Math.round(raw) : 0;
  if (!n) return "";
  const cap = Math.max(n, Math.min(8, Math.round(rooms) || n));
  const cit = String(citadel || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  if (cit) return `/rune?session=${encodeURIComponent(cit)}&hall=${n}&drive=engine`;
  return `/rune?drive=engine&rooms=${cap}&hall=${n}&stills=0`;
}

/** Vault card / unhang line — Room N • Door A Play Sprint from the bound artefact. */
export function vaultHangCaption(room?: { hall?: number; door?: string | null } | null): string {
  if (!room?.door) return "not on a door";
  const raw = typeof room.hall === "number" ? room.hall : Number(room.hall);
  if (!Number.isFinite(raw) || raw < 1 || raw > 8) return "not on a door";
  const chrome = hungPlayChrome(raw, room.door);
  return `${chrome.keeper} ${chrome.name}`;
}

const ROOM_DOOR = /^Room ([1-8]) • Door ([AB])$/;

/** FilmStage hold from a hung film — Room N • Door A, never a floating biome. */
export function hungFilmHold(film?: { keeper?: string } | null): { hall?: number; door?: DoorLetter } {
  const fromKeeper = ROOM_DOOR.exec(String(film?.keeper || ""));
  if (!fromKeeper) return {};
  return { hall: Number(fromKeeper[1]), door: fromKeeper[2] as DoorLetter };
}

/** Vault / hang-strip thumb — never a blank or citadel-tour stand-in when the artefact has a biome still. */
export function hangThumbStill(
  a?: {
    still?: string;
    name?: string;
    prompt?: string;
    playlist?: string[];
    room?: { still?: string; biome?: string; hall?: number; door?: string } | null;
  } | null,
): string {
  const raw = [a?.still, a?.room?.still].find((u) => u && !/citadel-tour|\/ui\/citadel/i.test(u));
  if (raw) return raw;
  return biomeStill(
    inferBiome({
      name: a?.name || "",
      still: a?.still || "",
      playlist: a?.playlist || [],
      prompt: a?.prompt || "",
      room: a?.room as HungArtifact["room"],
    }),
  );
}

/**
 * Play / vault title: Room N • Door A is the headline.
 * Biome name (Asteroid) is never the big title once a room is hung.
 */
export function hungStageChrome(
  hall?: number | string | null,
  door?: string | null,
  film?: { name?: string; keeper?: string; line?: string } | null,
): { title: string; play: string; biome: string } {
  const fromKeeper = ROOM_DOOR.exec(String(film?.keeper || ""));
  const hold = hungHallN(hall);
  const keepN = fromKeeper ? Number(fromKeeper[1]) : 0;
  const n = (hold >= 2 ? hold : 0) || hungEnterBindHall(keepN, hall, 0) || hold || keepN;
  const chrome = n
    ? hungPlayChrome(n, door || fromKeeper?.[2] || "A")
    : fromKeeper
      ? hungPlayChrome(Number(fromKeeper[1]), fromKeeper[2])
      : null;
  if (!chrome) {
    return { title: film?.name || "", play: film?.keeper || "", biome: "" };
  }
  const biome = [film?.line, film?.name].find(
    (s) => s && s !== chrome.name && s !== chrome.keeper && s !== "Play Sprint",
  ) || "";
  return { title: chrome.keeper, play: chrome.name, biome };
}

function isShippedBiomeLoop(u?: string | null): boolean {
  return Boolean(u && u.includes("/ui/forge.mp4"));
}

export function firstBiomePlate(playlist: Array<string | null | undefined> = []): number {
  const i = playlist.findIndex((u) => u && (!isLivingHallLoop(u) || isShippedBiomeLoop(u)));
  return i < 0 ? 0 : i;
}

/** After the room→biome trans, keep looping biome plates — do not finish back to the hall. */
export function shouldHoldBiome(playlist: Array<string | null | undefined> = [], i = 0): boolean {
  if (!playlist.length) return false;
  const at = playlist[i];
  if (at && (!isLivingHallLoop(at) || isShippedBiomeLoop(at))) return true;
  return i >= playlist.length - 1 && playlist.some((u) => u && (!isLivingHallLoop(u) || isShippedBiomeLoop(u)));
}

const STOCK_FORGE_MP4 = /\/films\/forge-[a-z0-9-]+\.mp4$/i;

/** Placeholder sprint loops that are not shipped — playing them 404s into still thrash. */
export function isStockForgeClip(u?: string | null): boolean {
  if (!u) return false;
  const path = u.split("?")[0] || u;
  return STOCK_FORGE_MP4.test(path);
}

/**
 * Hung artefact MP4s for biome enter — proxied, continuous.
 * Cooked Imagine / clip URLs win. Never stills, hall loops, or four missing forge pads.
 */
export function hungBiomePlaylist(urls?: Array<string | null | undefined> | null, biome?: string | null): string[] {
  const cooked: string[] = [];
  for (const raw of urls || []) {
    if (!raw || isLivingHallLoop(raw) || isStockForgeClip(raw) || isHallFilm(raw)) continue;
    const u = playableClipSrc(raw);
    if (!u || isLivingHallLoop(u) || isStockForgeClip(u) || isHallFilm(u)) continue;
    if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u) && !u.includes(".mp4")) continue;
    if (!cooked.includes(u)) cooked.push(u);
  }
  if (cooked.length) return cooked;
  return [stockBiomeLoop(biome)];
}

/**
 * Hung / stock rift handoff: cooked room→biome trans (if any) then biome loops.
 * Stock hall loop / citadel still are not a trans — playing them is the
 * "biome flashes then snaps back to the room" fail.
 * Missing forge-*.mp4 pads become one shipped loop so FilmStage does not still-thrash.
 */
export function stayBiomePlay(enter: DoorEnter): DoorEnter {
  if (enter.kind !== "biome") return enter;
  const still = enter.still && !isHallFilm(enter.still) ? enter.still : biomeStill(enter.biome);
  const rawTrans = enter.trans && /\.mp4(\?|$)/i.test(enter.trans) ? enter.trans : "";
  const transPlay = rawTrans && !isLivingHallLoop(rawTrans) && !isStockForgeClip(rawTrans) ? playableClipSrc(rawTrans) : "";
  const trans = transPlay && !isLivingHallLoop(transPlay) ? transPlay : "";
  const loops = hungBiomePlaylist([trans, ...(enter.playlist || []), ...(enter.clips || [])], enter.biome);
  const clips = uniq([trans, ...loops].filter(Boolean));
  return {
    ...enter,
    still,
    trans,
    playlist: loops,
    clips,
  };
}
