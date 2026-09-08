import type { Film, Grade } from "./films";
import { hungPlayChrome } from "./enter-graph.ts";
import { biomeSprintFilm, cookFilm, quietBiomeFilm } from "./cook";
import { isHallFilm, isLivingHallLoop } from "./stock-room";
import { unbindDroppedHalls as applyUnbind } from "./rooms.ts";
import { lintSmoke, subjectFromFilm } from "./smoke-gate.ts";
import type { StillPairPixels } from "./still-pair-match.ts";

function lintHangFilm(film: Film, stillPair?: StillPairPixels) {
  return lintSmoke(subjectFromFilm(film, "walk", "hang", stillPair));
}

const KEY = "bolt-artifacts-v1";
const MEM = "bolt-artifacts-mem-v1";
const COOKIE = "bolt-arts-v1";
const MAX_HUNG = 24;
const MAX_CLIPS = 24;

export type HungRoom = {
  door: "A" | "B";
  still: string;
  trans?: string;
  citadel?: string;
  hall?: number;
  biome?: string;
};

export type HungArtifact = {
  id: string;
  runId?: string;
  name: string;
  still: string;
  playlist: string[];
  prompt: string;
  hungAt: number;
  grade: Grade | null;
  room?: HungRoom | null;
};

let RAM: HungArtifact[] = [];

function keepArt(u?: string) {
  if (!u) return "";
  if (u.startsWith("http") || u.startsWith("/films/") || u.startsWith("/refs/") || u.startsWith("/ui/") || u.startsWith("/api/clip")) return u;
  if (u.startsWith("data:image/") && u.length < 900000) return u;
  return "";
}

function isCitadelStill(u?: string) {
  return Boolean(u && /citadel-tour|\/ui\/citadel/i.test(u));
}

export function artifactId(film: Film) {
  const src = film.playlist?.[0] || film.local || film.still || film.name;
  const tail = String(src).replace(/[^a-zA-Z0-9]/g, "").slice(-12);
  return `art-${Date.now().toString(36)}-${tail || "rift"}`;
}

export function mergeHall(hall: HungArtifact[], local: HungArtifact[]): HungArtifact[] {
  const byId = new Map<string, HungArtifact>();
  for (const a of [...hall, ...local]) {
    if (!a?.id) continue;
    const prev = byId.get(a.id);
    if (!prev) {
      byId.set(a.id, a);
      continue;
    }
    const aN = uniqueClips(a.playlist || []).length;
    const pN = uniqueClips(prev.playlist || []).length;
    const newer = (a.hungAt || 0) >= (prev.hungAt || 0);
    const keep = aN > pN || (aN === pN && newer) ? a : prev;
    const room = newer ? (a.room !== undefined ? a.room : prev.room) : prev.room !== undefined ? prev.room : a.room;
    const hallRaw = [room?.hall, a.room?.hall, prev.room?.hall]
      .map((n) => Number(n))
      .find((n) => Number.isFinite(n) && n >= 1 && n <= 8);
    const hall = hallRaw != null ? Math.round(hallRaw) : undefined;
    byId.set(a.id, {
      ...keep,
      playlist: uniqueClips([...(prev.playlist || []), ...(a.playlist || [])]),
      still: keep.still || prev.still || a.still,
      grade: a.grade || prev.grade,
      room: room == null ? room : hall ? { ...room, hall } : room,
    });
  }
  return [...byId.values()].sort((a, b) => (b.hungAt || 0) - (a.hungAt || 0)).slice(0, 24);
}

export const ROOM_ONE_STILL = "/films/citadel-tour.jpg";

export function packRoom(room?: HungRoom | null): HungRoom | null | undefined {
  if (room === null) return null;
  if (!room?.door) return undefined;
  const hall = Number(room.hall);
  const citadel = String(room.citadel || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  const biome = String(room.biome || "").replace(/[^a-z]/g, "").slice(0, 16);
  return {
    door: room.door === "B" ? "B" : "A",
    still: keepArt(room.still) || ROOM_ONE_STILL,
    trans: keepArt(room.trans) || undefined,
    citadel: citadel || undefined,
    hall: hall >= 1 && hall <= 8 ? Math.round(hall) : undefined,
    biome: biome || undefined,
  };
}

export function filmOf(a: HungArtifact, all?: HungArtifact[]): Film {
  const other = (all || []).find((x) => x.id === a.id);
  const room = a.room || other?.room;
  const raw = uniqueClips([room?.trans, ...(a.playlist || []), ...(other?.playlist || [])].filter(Boolean) as string[]);
  const clips = raw.filter((u) => u && !isLivingHallLoop(u) && !isHallFilm(u));
  const stillRaw = a.still || other?.still || "";
  const still = stillRaw && !isHallFilm(stillRaw) && !isLivingHallLoop(stillRaw) ? stillRaw : "";
  const name = a.name || other?.name || "Artifact";
  const prompt = a.prompt || other?.prompt;
  if (room?.door) {
    const hall = Number(room.hall);
    if (hall >= 1 && hall <= 8) {
      const chrome = hungPlayChrome(hall, room.door);
      return quietBiomeFilm({
        ...biomeSprintFilm(chrome.name, still || clips[0] || "", clips, prompt || name),
        name: chrome.name,
        keeper: chrome.keeper,
        line: name !== chrome.name ? name : chrome.name,
      });
    }
  }
  return cookFilm(name, still, clips.length ? clips : raw, prompt);
}

const CLIP_MAP: Record<string, string> = {
  c60f36c5: "/films/clips/c60f36c544689aa897f97b852a5b3076.mp4",
  fb87677a: "/films/clips/fb87677ab8809fd09e5bdfdd0446795b.mp4",
  aa7bf2f3: "/films/clips/aa7bf2f32f4f9dca8d24a6d310e52676.mp4",
  e7959c9d: "/films/clips/e7959c9da1b29d539b6d0137510e00e0.mp4",
  "84fb9bcb": "/films/clips/84fb9bcb7b4d99e7a59e60c258f91186.mp4",
  "6d8a1dd7": "/films/clips/6d8a1dd78bd690b09b9520357c7ecf52.mp4",
};

export function localizeClip(u: string) {
  if (!u || u.startsWith("http://") || u.startsWith("https://")) return u;
  for (const [k, v] of Object.entries(CLIP_MAP)) if (u.includes(k)) return v;
  return u;
}

export function isClip(u?: string) {
  if (!u) return false;
  if (u.startsWith("data:image") || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)) return false;
  return /\.mp4(\?|$)/i.test(u) || u.includes("xai-vidgen") || u.startsWith("/api/clip") || u.includes("/films/clips/") || u.includes("/films/") || u.includes("/ui/");
}

export function uniqueClips(urls: string[]) {
  const out: string[] = [];
  for (const raw of urls) {
    const u = localizeClip(raw);
    if (!isClip(u) || out.includes(u)) continue;
    if (u.includes("xai-video-020f6a61")) continue;
    out.push(u);
  }
  return out;
}

export function baseName(name: string) {
  return (name || "Artifact").replace(/\s+[IVX]+$/i, "").replace(/\s+\d+$/, "").trim() || "Artifact";
}

export function runKey(a: HungArtifact) {
  return a.runId || a.id;
}

export function chainOf(a: HungArtifact, all: HungArtifact[] = readArtifacts()): string[] {
  const key = runKey(a);
  const family = all.filter((x) => runKey(x) === key).sort((p, q) => (p.hungAt || 0) - (q.hungAt || 0));
  const clips: string[] = [];
  for (const x of family.length ? family : [a]) {
    for (const u of uniqueClips(x.playlist || [])) {
      if (!clips.includes(u)) clips.push(u);
    }
  }
  return clips;
}

export function nextName(name: string, list: HungArtifact[]) {
  const base = (name || "Artifact").replace(/\s+[IVX]+$/i, "").replace(/\s+\d+$/, "").trim() || "Artifact";
  const n = list.filter((a) => (a.name || "").replace(/\s+[IVX]+$/i, "").replace(/\s+\d+$/, "").trim() === base).length + 1;
  const roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][n] || String(n);
  return n <= 1 ? base : `${base} ${roman}`;
}

export function lastClip(a: HungArtifact) {
  const clips = uniqueClips(a.playlist || []);
  return clips[clips.length - 1] || "";
}

export type VaultFamily = {
  name: string;
  id: string;
  still: string;
  stills: string[];
  playlist: string[];
  stamps: { url: string; still: string; at: number }[];
  members: HungArtifact[];
  hungAt: number;
  room?: HungRoom | null;
};

function stampClips(members: HungArtifact[], playlist: string[]) {
  const ordered = [...members].sort((a, b) => (a.hungAt || 0) - (b.hungAt || 0));
  const at = new Map<string, number>();
  const pic = new Map<string, string>();
  for (const m of ordered) {
    const clips = uniqueClips(m.playlist || []);
    for (const u of clips) {
      if (!at.has(u)) at.set(u, m.hungAt || 0);
    }
    if (m.still && !/cook-asteroid/i.test(m.still)) {
      const last = clips[clips.length - 1];
      if (last) pic.set(last, m.still);
      if (clips[0] && !pic.has(clips[0])) pic.set(clips[0], m.still);
    }
  }
  return playlist.map((url, i) => ({
    url,
    still: pic.get(url) || ordered[Math.min(i, Math.max(0, ordered.length - 1))]?.still || "",
    at: at.get(url) || ordered[0]?.hungAt || 0,
  }));
}

export function familiesOf(list: HungArtifact[]): VaultFamily[] {
  return [...list]
    .sort((p, q) => (q.hungAt || 0) - (p.hungAt || 0))
    .flatMap((a) => {
      const playlist = uniqueClips(a.playlist || []);
      if (!playlist.length && !a.still) return [];
      const stamps = stampClips([a], playlist);
      return [
        {
          name: a.name,
          id: a.id,
          still: stamps[0]?.still || a.still,
          stills: stamps.map((s) => s.still).filter(Boolean).slice(0, 6),
          playlist,
          stamps,
          members: [a],
          hungAt: a.hungAt || 0,
          room: a.room || null,
        },
      ];
    });
}

export function familyHead(f: VaultFamily): HungArtifact {
  const latest = f.members[f.members.length - 1] || f.members[0];
  return {
    ...latest,
    id: f.id,
    name: f.name,
    still: f.still,
    playlist: f.playlist,
    room: f.room || latest.room,
  };
}

export function hangOnRoom(id: string, room: HungRoom, from?: HungArtifact[]): HungArtifact[] {
  const src = from?.length ? from : RAM.length ? RAM : readArtifacts();
  if (!src.some((a) => a.id === id)) return src;
  const bound = packRoom(room);
  if (!bound) return src;
  const before = src.find((a) => a.id === id);
  const roomStill =
    bound.still && !isCitadelStill(bound.still)
      ? bound.still
      : before?.still && !isCitadelStill(before.still)
        ? before.still
        : bound.still;
  const wired = { ...bound, still: roomStill || bound.still };
  const next = write(src.map((a) => (a.id === id ? { ...a, room: wired, still: a.still || roomStill, hungAt: Date.now() } : a)));
  const after = next.find((a) => a.id === id);
  if (before?.still && after && !after.still) {
    const restored = next.map((a) => (a.id === id ? { ...a, still: before.still, room: a.room ? { ...a.room, still: a.room.still && !isCitadelStill(a.room.still) ? a.room.still : before.still } : a.room } : a));
    RAM = restored;
    return restored;
  }
  return next;
}

export function dropRoom(id: string, from?: HungArtifact[]): HungArtifact[] {
  const src = from?.length ? from : RAM.length ? RAM : readArtifacts();
  if (!src.some((a) => a.id === id)) return src;
  return write(src.map((a) => (a.id === id ? { ...a, room: null, hungAt: Date.now() } : a)));
}

/** Persist hang unbinds after a Load room drop. */
export function unbindDroppedHalls(
  arts: HungArtifact[] = [],
  citadel: string,
  hall: number | "all",
  remap: Array<[number, number]> = [],
): HungArtifact[] {
  const src = arts.length ? arts : RAM.length ? RAM : readArtifacts();
  if (!src.length) return src;
  const now = Date.now();
  const next = applyUnbind(src, citadel, hall, remap);
  return write(next.map((a, i) => (a.room === src[i]?.room ? a : { ...a, hungAt: now })));
}

export function setPlaylist(id: string, urls: string[], extra?: Partial<Pick<HungArtifact, "still" | "prompt" | "name">>, from?: HungArtifact[]): HungArtifact[] {
  const playlist = uniqueClips(urls);
  const src = from?.length ? from : RAM.length ? RAM : readArtifacts();
  if (!src.length) return src;
  if (!src.some((a) => a.id === id)) return src;
  return write(src.map((a) => (a.id === id ? { ...a, ...extra, playlist, hungAt: Date.now() } : a)));
}

export function dropClipAt(id: string, index: number, from?: HungArtifact[]): HungArtifact[] {
  const src = from?.length ? from : RAM.length ? RAM : readArtifacts();
  const head = src.find((a) => a.id === id);
  if (!head) return src;
  const chain = uniqueClips(head.playlist || []);
  if (index < 0 || index >= chain.length) return src;
  const clips = chain.filter((_, i) => i !== index);
  const next = clips.length
    ? src.map((a) => (a.id === id ? { ...a, playlist: clips } : a))
    : src.filter((a) => a.id !== id);
  return write(next);
}

export function replaceAll(list: HungArtifact[]) {
  return write(slim(list.map((a) => ({ ...a, playlist: uniqueClips(a.playlist || []) }))));
}

function parseList(raw: string | null): HungArtifact[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as HungArtifact[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((a) => a?.id && (a.still || a.playlist?.length));
  } catch {
    return [];
  }
}

function readCookie(): HungArtifact[] {
  try {
    if (typeof document === "undefined") return [];
    const hit = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`));
    if (!hit) return [];
    return parseList(decodeURIComponent(hit.slice(COOKIE.length + 1)));
  } catch {
    return [];
  }
}

function writeCookie(list: HungArtifact[]) {
  try {
    if (typeof document === "undefined") return;
    const tiny = list.slice(0, 6).map((a) => ({
      id: a.id,
      name: a.name,
      still: keepArt(a.still),
      playlist: (a.playlist || []).map(keepArt).filter(Boolean).slice(0, 4),
      prompt: "",
      hungAt: a.hungAt,
      grade: null,
      room: a.room
        ? {
            door: a.room.door,
            hall: a.room.hall,
            citadel: a.room.citadel,
            biome: a.room.biome,
          }
        : undefined,
    }));
    document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(tiny))}; max-age=31536000; path=/; SameSite=Lax`;
  } catch {
    /* */
  }
}

export function readArtifacts(): HungArtifact[] {
  if (typeof window === "undefined") return RAM;
  try {
    const local = parseList(localStorage.getItem(KEY));
    const mem = parseList(sessionStorage.getItem(MEM));
    const cookie = readCookie();
    const merged = mergeHall(mergeHall(local, mem), mergeHall(cookie, RAM));
    RAM = merged.map((a) => ({ ...a, runId: a.runId || a.id }));
    return RAM;
  } catch {
    return RAM;
  }
}

function slim(list: HungArtifact[]): HungArtifact[] {
  return list.slice(0, MAX_HUNG).map((a) => ({
    ...a,
    still: keepArt(a.still) || (a.still.startsWith("http") ? a.still.slice(0, 500) : ""),
    playlist: (a.playlist || []).map(keepArt).filter(Boolean).slice(0, MAX_CLIPS),
    name: String(a.name || "Artifact").slice(0, 42),
    prompt: String(a.prompt || "").slice(0, 80),
    room: a.room === null ? null : packRoom(a.room),
  }));
}

function write(list: HungArtifact[]) {
  if (!list.length && RAM.length) return RAM;
  const packed = slim(list);
  RAM = packed;
  try {
    sessionStorage.setItem(MEM, JSON.stringify(packed));
  } catch {
    /* */
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(packed));
  } catch {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify(
          packed.map((a) => ({
            ...a,
            still: a.still.startsWith("data:") ? "" : a.still,
          })),
        ),
      );
    } catch {
      /* ram still holds */
    }
  }
  return packed;
}

export function hangArtifact(
  film: Film,
  forceNew = false,
  runId?: string,
  smoke?: { smoke?: string } | null,
  stillPair?: StillPairPixels,
): HungArtifact[] {
  try {
    const gate = smoke ?? lintHangFilm(film, stillPair);
    if (gate && gate.smoke !== "PASS") return readArtifacts();
    const list = readArtifacts();
    const incoming = uniqueClips(
      (film.playlist?.length ? film.playlist : [film.local]).map(keepArt).filter(Boolean),
    );
    const pic = keepArt(film.still);
    const found = forceNew
      ? undefined
      : (runId ? list.find((a) => a.runId === runId || a.id === runId) : undefined) ||
        list.find((a) => incoming[0] && uniqueClips(a.playlist || [])[0] === incoming[0]) ||
        list.find((a) => a.still && pic && a.still === pic);
    const playlist = uniqueClips([...(found?.playlist || []), ...incoming]);
    const still = pic || found?.still || "";
    if (!still && !playlist.length) return list;
    const id = found?.id || artifactId(film);
    const next: HungArtifact = {
      id,
      runId: runId || found?.runId || id,
      name: (film.name || found?.name || "Artifact").slice(0, 42),
      still: still || playlist[0] || "",
      playlist,
      prompt: film.line || found?.prompt || film.name || "",
      hungAt: Date.now(),
      grade: found?.grade ?? null,
      room: found?.room,
    };
    const rest = list.filter((a) => a.id !== next.id);
    return write([next, ...rest].slice(0, 24));
  } catch {
    return readArtifacts();
  }
}

export function gradeArtifact(id: string, grade: Grade): HungArtifact[] {
  const list = readArtifacts().map((a) => (a.id === id ? { ...a, grade } : a));
  return write(list);
}
