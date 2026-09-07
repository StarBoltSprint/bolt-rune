import type { HungArtifact, HungRoom } from "./artifacts.ts";
import { stockBiomeLoop } from "./play-clip.ts";
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
    if (next[door]) continue;
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
    const n = art?.room?.hall;
    return typeof n === "number" && n >= 1 && n <= 8 ? n : 0;
  })();
  return {
    kind: "biome",
    door,
    hall: bound || hall,
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
 * never QTE-MISS or fracture back to the hall.
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

/** Hung biome stay — leftover / door taps must never score MISS. */
export function biomeQteQuiet(holdDoor?: string | null): boolean {
  return Boolean(holdDoor);
}

/** Living-hall / FilmStage overlay after Hang Room N — never stuck on Room 1. Door letter is never blank. */
export function hungPlayChrome(hall?: number | string | null, door?: string | null): { keeper: string; name: string } {
  const raw = typeof hall === "number" ? hall : Number(hall);
  const n = Number.isFinite(raw) ? Math.max(1, Math.min(8, Math.round(raw))) : 1;
  const letter = doorLetterOf(door || "A");
  return {
    keeper: `Room ${n} • Door ${letter}`,
    name: "Play Sprint",
  };
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

/**
 * Play / vault title: Room N • Door A is the headline.
 * Biome name (Asteroid) is never the big title once a room is hung.
 */
export function hungStageChrome(
  hall?: number | string | null,
  door?: string | null,
  film?: { name?: string; keeper?: string; line?: string } | null,
): { title: string; play: string; biome: string } {
  const raw = typeof hall === "number" ? hall : Number(hall);
  const n = Number.isFinite(raw) && raw >= 1 && raw <= 8 ? Math.round(raw) : 0;
  const fromKeeper = ROOM_DOOR.exec(String(film?.keeper || ""));
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

export function firstBiomePlate(playlist: Array<string | null | undefined> = []): number {
  const i = playlist.findIndex((u) => u && !isLivingHallLoop(u));
  return i < 0 ? 0 : i;
}

/** After the room→biome trans, keep looping biome plates — do not finish back to the hall. */
export function shouldHoldBiome(playlist: Array<string | null | undefined> = [], i = 0): boolean {
  if (!playlist.length) return false;
  const at = playlist[i];
  if (at && !isLivingHallLoop(at)) return true;
  return i >= playlist.length - 1 && playlist.some((u) => u && !isLivingHallLoop(u));
}

/**
 * Hung / stock rift handoff: cooked room→biome trans (if any) then biome loops.
 * Stock hall loop / citadel still are not a trans — playing them is the
 * "biome flashes then snaps back to the room" fail.
 */
export function stayBiomePlay(enter: DoorEnter): DoorEnter {
  if (enter.kind !== "biome") return enter;
  const still = enter.still && !isHallFilm(enter.still) ? enter.still : biomeStill(enter.biome);
  const rawTrans = enter.trans && /\.mp4(\?|$)/i.test(enter.trans) ? enter.trans : "";
  const trans = rawTrans && !isLivingHallLoop(rawTrans) ? rawTrans : "";
  const loops = uniq(
    [...(enter.playlist || []), ...stockBiomePlaylist(enter.biome)].filter((u) => u && !isLivingHallLoop(u)),
  );
  const fallback = stockBiomeLoop(enter.biome);
  if (!loops.length && fallback && !isLivingHallLoop(fallback)) loops.push(fallback);
  const clips = uniq([trans, ...loops].filter(Boolean));
  return {
    ...enter,
    still,
    trans,
    playlist: loops,
    clips,
  };
}
