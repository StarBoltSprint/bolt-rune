import type { RuneNode, WalkSecs } from "@/game/rune";
import { dropCitadelAll, dropCitadelHall, hallN, livingLoadPacks, loadHangHallCount, packCitadels, type LoadRoomDrop } from "@/game/rooms.ts";
import { unbindDroppedHalls } from "@/game/artifacts.ts";
import { dropHangPending, writeHangFloor } from "@/game/hang-ask.ts";
import { dropCitadel, dropGuestCitadel, getCitadel, getGuestCitadel, listCitadels, listGuestCitadels, putCitadel, putGuestCitadel } from "@/lib/citadel-cloud";

const DB = "bolt-rune-sessions";
const TABLE = "sessions";
const INDEX = "bolt-rune-index-v1";
const CATALOG = "bolt-rune-catalog-v1";
const STORE = "bolt-rune-store-v1";
const MEM = "bolt-rune-mem-v1";
const COOKIE = "bolt-rooms-v1";
const BACKUP = "bolt-rune-backup-v1";
const GUEST = "bolt-guest-v1";
const VER = 1;

let ram: RuneSession[] = [];
let persistAsked = false;

function guestId() {
  if (typeof window === "undefined") return "";
  const fromCookie = () => {
    try {
      const hit = document.cookie.split("; ").find((c) => c.startsWith(`${GUEST}=`));
      if (hit) return decodeURIComponent(hit.slice(GUEST.length + 1)).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
    } catch {
      /* */
    }
    return "";
  };
  let id = "";
  try {
    id = (localStorage.getItem(GUEST) || sessionStorage.getItem(GUEST) || fromCookie() || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  } catch {
    id = fromCookie();
  }
  if (!id) id = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  try {
    localStorage.setItem(GUEST, id);
    sessionStorage.setItem(GUEST, id);
  } catch {
    /* */
  }
  try {
    document.cookie = `${GUEST}=${encodeURIComponent(id)}; max-age=31536000; path=/; SameSite=Lax`;
  } catch {
    /* */
  }
  return id;
}

export type RunePhase = "look" | "gate" | "refs" | "forge" | "time" | "play" | "mark";

export type CitadelStart =
  | { kind: "path"; first: "m1" | "m2"; drive: "pilot" | "engine"; rooms?: number; hall?: number; stills?: boolean; art?: string; forge?: "bot" }
  | { kind: "session"; id: string; do?: "play" | "more" | "room" | "reset"; art?: string; hall?: number; drive?: "pilot" | "engine" };

export type RiftGate = {
  biome: string;
  name: string;
  still: string;
  loop: string;
  playlist?: string[];
  trans?: string;
  art?: string;
};

export type HallSlice = {
  n: number;
  still: string;
  start?: string;
  plate?: string;
  here?: string;
  cameFrom?: string;
  bank: { key: string; url: string; end: string }[];
  refs: { id: string; name: string; src: string }[];
  pins: RuneNode[];
  forged?: number;
  walkSecs?: WalkSecs;
  rift?: { m1?: RiftGate; m2?: RiftGate };
  via?: string;
  next?: { m1?: number; m2?: number };
};

export type RuneSessionMeta = {
  id: string;
  name: string;
  updated: number;
  phase: RunePhase;
  want: number;
  walks: number;
  thumb: string;
  rooms?: number;
  hall?: number;
  from?: string;
  via?: string;
  title?: string;
  /** Hall numbers that exist — empty slices still count. Catalog carries n/still only. */
  hallHints?: Array<{ n?: number; hall?: number; still?: string }>;
};

export type RuneSession = RuneSessionMeta & {
  walkSecs: WalkSecs;
  pins: RuneNode[];
  plate: string;
  start?: string;
  here: string;
  cameFrom: string;
  forged: number;
  refs: { id: string; name: string; src: string }[];
  bank: { key: string; url: string; end: string }[];
  wish?: string;
  from?: string;
  via?: string;
  next?: { m1?: string; m2?: string };
  rift?: { m1?: RiftGate; m2?: RiftGate };
  halls?: HallSlice[];
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TABLE)) db.createObjectStore(TABLE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function newSessionId() {
  return `citadel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function sessionName(want: number, phase: RunePhase) {
  const when = new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return `${want} door · ${phase} · ${when}`;
}

function keepUrl(u?: string) {
  if (!u) return "";
  if (u.startsWith("http") || u.startsWith("/")) return u;
  return "";
}

function keepRift(rift?: { m1?: RiftGate; m2?: RiftGate }): { m1?: RiftGate; m2?: RiftGate } | undefined {
  if (!rift) return undefined;
  const one = (g?: RiftGate): RiftGate | undefined => {
    if (!g) return undefined;
    const still = keepUrl(g.still) || keepStill(g.still);
    const playlist = (g.playlist || []).map(keepUrl).filter((u): u is string => Boolean(u)).slice(0, 24);
    const loop = keepUrl(g.loop) || playlist[0] || "";
    if (!still || !loop) return undefined;
    const trans = keepUrl(g.trans);
    const art = String(g.art || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
    return {
      biome: String(g.biome || "").slice(0, 24),
      name: String(g.name || "Rift").slice(0, 42),
      still,
      loop,
      playlist: playlist.length ? playlist : undefined,
      trans: trans || undefined,
      art: art || undefined,
    };
  };
  const m1 = one(rift.m1);
  const m2 = one(rift.m2);
  if (!m1 && !m2) return undefined;
  return { ...(m1 ? { m1 } : {}), ...(m2 ? { m2 } : {}) };
}

function keepStill(u?: string) {
  if (!u) return "";
  if (u.startsWith("http") || u.startsWith("/")) return u;
  if (u.startsWith("data:image/") && u.length < 480000) return u;
  return "";
}

function hallHintsOf(s?: { halls?: Array<{ n?: number; hall?: number; still?: string; plate?: string }> | null; hallHints?: RuneSessionMeta["hallHints"] }): RuneSessionMeta["hallHints"] {
  const raw = s?.halls?.length ? s.halls : s?.hallHints;
  if (!Array.isArray(raw) || !raw.length) return undefined;
  return raw.slice(0, 8).map((h, i) => {
    const still = "still" in h ? h.still : "";
    const plate = "plate" in h ? (h as { plate?: string }).plate : "";
    return {
      n: Math.max(1, Math.min(8, Number(h.n) || Number(h.hall) || i + 1)),
      still: keepUrl(still) || keepUrl(plate) || "",
    };
  });
}

function keepHallMeta(a?: RuneSessionMeta["hallHints"], b?: RuneSessionMeta["hallHints"]): RuneSessionMeta["hallHints"] {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  if (!left.length && !right.length) return undefined;
  return left.length >= right.length ? left : right;
}

function roomCap(s?: { rooms?: number; hall?: number; halls?: Array<{ n?: number; hall?: number }>; hallHints?: RuneSessionMeta["hallHints"] }): number | undefined {
  if (!s) return undefined;
  const halls = s.halls?.length ? s.halls : s.hallHints || [];
  const ns = halls.map((h, i) => Math.max(0, Number(h.n) || Number(h.hall) || i + 1));
  return keepRooms(s.rooms, Math.max(s.hall || 0, halls.length, ...ns));
}

function metaOf(s: Partial<RuneSession> & RuneSessionMeta): RuneSessionMeta {
  const walks = Array.isArray(s.bank) ? s.bank.filter((b) => b?.url).length : s.walks || 0;
  const halls = hallHintsOf(s);
  return {
    id: s.id,
    name: s.name || "Room",
    updated: s.updated || Date.now(),
    phase: s.phase || "play",
    want: s.want || 2,
    walks,
    thumb: keepUrl(s.thumb) || keepUrl(s.plate) || "/refs/hall-doors.jpg",
    rooms: roomCap({ rooms: s.rooms, hall: s.hall, halls }),
    hall: s.hall,
    from: s.from,
    via: s.via,
    title: s.title,
    hallHints: halls,
  };
}

function readJson(space: Storage | undefined, key: string): unknown {
  try {
    if (!space) return null;
    const raw = space.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(space: Storage | undefined, key: string, value: unknown) {
  try {
    if (!space) return;
    space.setItem(key, JSON.stringify(value));
  } catch {
    try {
      if (!space) return;
      space.setItem(key, JSON.stringify(Array.isArray(value) ? value.slice(0, 2) : value));
    } catch {
      /* */
    }
  }
}

function readCookie(): RuneSessionMeta[] {
  try {
    if (typeof document === "undefined") return [];
    const hit = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`));
    if (!hit) return [];
    const rows = JSON.parse(decodeURIComponent(hit.slice(COOKIE.length + 1))) as RuneSessionMeta[];
    return Array.isArray(rows) ? rows.filter((s) => s?.id) : [];
  } catch {
    return [];
  }
}

function clearCookie() {
  try {
    if (typeof document === "undefined") return;
    document.cookie = `${COOKIE}=; max-age=0; path=/; SameSite=Lax`;
  } catch {
    /* */
  }
}

function writeCookie(list: RuneSessionMeta[]) {
  if (!list.length) {
    clearCookie();
    return;
  }
  try {
    if (typeof document === "undefined") return;
    const tiny = list.slice(0, 8).map((s) => ({
      id: s.id,
      name: s.name || "Room",
      updated: s.updated || Date.now(),
      phase: s.phase || "play",
      want: s.want || 2,
      walks: s.walks || 0,
      thumb: keepUrl(s.thumb) || "/refs/hall-doors.jpg",
      rooms: roomCap(s),
      hall: s.hall,
      from: s.from,
      title: s.title,
      hallHints: hallHintsOf(s),
    }));
    document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(tiny))}; max-age=31536000; path=/; SameSite=Lax`;
  } catch {
    /* */
  }
}

function askPersist() {
  if (persistAsked || typeof navigator === "undefined") return;
  persistAsked = true;
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* */
  }
}

function readMem(): RuneSession[] {
  const extra = readJson(typeof sessionStorage !== "undefined" ? sessionStorage : undefined, MEM);
  const rows = Array.isArray(extra) ? (extra as RuneSession[]) : [];
  const byId = new Map<string, RuneSession>();
  for (const s of rows) if (s?.id) byId.set(s.id, s);
  for (const s of ram) if (s?.id) byId.set(s.id, s);
  return [...byId.values()];
}

function writeMem(rows: RuneSession[]) {
  ram = rows.slice(0, 12);
  writeJson(typeof sessionStorage !== "undefined" ? sessionStorage : undefined, MEM, ram.map(lightOf));
}

function idsOf(list: RuneSessionMeta[]) {
  return list.slice(0, 24).map((s) => ({
    id: s.id,
    name: s.name || "Room",
    updated: s.updated || Date.now(),
    phase: s.phase || "play",
    want: s.want || 2,
    walks: s.walks || 0,
    thumb: keepUrl(s.thumb) || "/refs/hall-doors.jpg",
    rooms: roomCap(s),
    hall: s.hall,
    from: s.from,
    via: s.via,
    title: s.title,
    hallHints: hallHintsOf(s),
  }));
}

function keepRooms(a?: number, b?: number) {
  const n = Math.max(Number(a) > 0 ? Number(a) : 0, Number(b) > 0 ? Number(b) : 0);
  return n >= 1 ? Math.min(8, Math.round(n)) : a || b;
}

function isSessionRow(s: unknown): s is RuneSession {
  if (!s || typeof s !== "object") return false;
  const o = s as Record<string, unknown>;
  if (!o.id || typeof o.id !== "string") return false;
  // last-play is {id,title,hall,rooms}; artifacts are {id,still,playlist,room}
  if (Array.isArray(o.playlist) && o.still && !o.phase && !o.bank && !o.halls && !o.pins) return false;
  return Boolean(o.phase || o.halls || o.bank || o.pins);
}

function pullSessions(raw: unknown): RuneSession[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(isSessionRow);
  if (typeof raw === "object") {
    const o = raw as { rooms?: unknown; id?: string };
    if (Array.isArray(o.rooms)) return pullSessions(o.rooms);
    if (isSessionRow(raw)) return [raw];
  }
  return [];
}

function scanStorageSessions(): RuneSession[] {
  const out: RuneSession[] = [];
  const take = (space?: Storage) => {
    if (!space) return;
    try {
      for (let i = 0; i < space.length; i++) {
        const k = space.key(i);
        if (!k || !k.startsWith("bolt-")) continue;
        if (/^bolt-(artifacts|arts|last-play|live-play|guest)/.test(k)) continue;
        const v = readJson(space, k);
        out.push(...pullSessions(v));
      }
    } catch {
      /* */
    }
  };
  take(typeof localStorage !== "undefined" ? localStorage : undefined);
  take(typeof sessionStorage !== "undefined" ? sessionStorage : undefined);
  return out;
}

function readCatalog(): RuneSessionMeta[] {
  const bags = [
    readJson(typeof localStorage !== "undefined" ? localStorage : undefined, CATALOG),
    readJson(typeof localStorage !== "undefined" ? localStorage : undefined, INDEX),
    readJson(typeof localStorage !== "undefined" ? localStorage : undefined, BACKUP),
    readJson(typeof sessionStorage !== "undefined" ? sessionStorage : undefined, CATALOG),
    readCookie(),
  ];
  const byId = new Map<string, RuneSessionMeta>();
  const put = (s: RuneSessionMeta | RuneSession) => {
    if (!s?.id) return;
    const meta = "bank" in s || "pins" in s ? metaOf(s as RuneSession) : s;
    const prev = byId.get(s.id);
    if (!prev || (meta.updated || 0) >= (prev.updated || 0)) {
      byId.set(s.id, {
        ...prev,
        ...meta,
        from: meta.from || prev?.from,
        via: meta.via || prev?.via,
        title: meta.title || prev?.title,
        thumb: keepUrl(meta.thumb) || prev?.thumb || "/refs/hall-doors.jpg",
        rooms: keepRooms(prev?.rooms, roomCap(meta)),
        hall: meta.hall || prev?.hall,
        hallHints: keepHallMeta(prev?.hallHints, hallHintsOf(meta)),
      });
    }
  };
  for (const bag of bags) {
    if (!Array.isArray(bag)) continue;
    for (const s of bag as RuneSessionMeta[]) put(s);
  }
  for (const s of readStore()) put(s);
  for (const s of scanStorageSessions()) put(s);
  return [...byId.values()];
}

function clearCatalog() {
  try {
    localStorage.removeItem(CATALOG);
    localStorage.removeItem(INDEX);
    localStorage.removeItem(BACKUP);
  } catch {
    /* */
  }
  try {
    sessionStorage.removeItem(CATALOG);
  } catch {
    /* */
  }
  clearCookie();
}

function writeCatalog(list: RuneSessionMeta[]) {
  const tiny = list
    .filter((s) => s?.id && !loadCitadelGone(s.id))
    .slice(0, 48)
    .map((s) => {
      const cap = loadRoomCap(s.id) ?? roomCap(s);
      const hints = hallHintsOf(s);
      return {
        id: s.id,
        name: s.name || "Room",
        updated: s.updated || Date.now(),
        phase: s.phase || "play",
        want: s.want || 2,
        walks: s.walks || 0,
        thumb: keepUrl(s.thumb) || "/refs/hall-doors.jpg",
        rooms: cap,
        hall: s.hall,
        from: s.from,
        via: s.via,
        title: s.title,
        hallHints: cap != null ? clampHints(hints, cap) : hints,
      };
    });
  if (!tiny.length) {
    clearCatalog();
    return;
  }
  const raw = JSON.stringify(tiny);
  const slim = JSON.stringify(idsOf(tiny));
  try {
    localStorage.setItem(CATALOG, raw);
  } catch {
    try {
      localStorage.setItem(CATALOG, slim);
    } catch {
      /* */
    }
  }
  try {
    localStorage.setItem(INDEX, slim);
  } catch {
    /* */
  }
  try {
    localStorage.setItem(BACKUP, slim);
  } catch {
    /* */
  }
  try {
    sessionStorage.setItem(CATALOG, raw);
  } catch {
    /* */
  }
  writeCookie(tiny);
}

export function listSessions(): RuneSessionMeta[] {
  try {
    const byId = new Map<string, RuneSessionMeta>();
    const put = (s?: RuneSessionMeta | RuneSession | null) => {
      if (!s?.id) return;
      const meta = "bank" in (s as RuneSession) || "pins" in (s as RuneSession) ? metaOf(s as RuneSession) : (s as RuneSessionMeta);
      const prev = byId.get(s.id);
      if (!prev || (meta.updated || 0) >= (prev.updated || 0)) {
        byId.set(s.id, {
          ...prev,
          ...meta,
          from: meta.from || prev?.from,
          via: meta.via || prev?.via,
          title: meta.title || prev?.title,
          rooms: keepRooms(prev?.rooms, roomCap(meta)),
          hall: meta.hall || prev?.hall,
          hallHints: keepHallMeta(prev?.hallHints, hallHintsOf(meta)),
        });
      }
    };
    for (const s of readCatalog()) put(s);
    for (const s of readMem()) put(s);
    for (const s of readStore()) put(s);
    const last = lastPlay();
    if (last?.id && !loadCitadelGone(last.id)) {
      const cur = byId.get(last.id);
      const rooms = loadRoomCap(last.id);
      if (!cur) {
        put({
          id: last.id,
          name: last.title || "Citadel",
          title: last.title,
          updated: Date.now(),
          phase: "play",
          want: 2,
          walks: 0,
          thumb: "/refs/hall-doors.jpg",
          rooms: rooms ?? last.rooms,
          hall: last.hall,
        });
      } else {
        byId.set(last.id, {
          ...cur,
          rooms: rooms ?? keepRooms(cur.rooms, last.rooms),
          hall: cur.hall || last.hall,
          title: cur.title || last.title,
        });
      }
    }
    return [...byId.values()]
      .map((s) => clampDroppedMeta(s))
      .filter((s): s is RuneSessionMeta => Boolean(s))
      .sort((a, b) => (b.updated || 0) - (a.updated || 0))
      .slice(0, 48);
  } catch {
    return [];
  }
}

const LAST = "bolt-last-play";
const DROP = "bolt-load-drop-v1";
export const LOAD_DROP_EVENT = "bolt-load-drop";

type LoadDropMark = {
  id: string;
  rooms: number;
  at: number;
  gone?: boolean;
};

function readDrops(): LoadDropMark[] {
  try {
    const raw =
      (typeof localStorage !== "undefined" ? localStorage.getItem(DROP) : null) ||
      (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(DROP) : null);
    if (!raw) return [];
    const rows = JSON.parse(raw) as LoadDropMark[];
    return Array.isArray(rows) ? rows.filter((d) => d?.id) : [];
  } catch {
    return [];
  }
}

function writeDrops(rows: LoadDropMark[]) {
  const raw = JSON.stringify(rows.slice(0, 48));
  try {
    localStorage.setItem(DROP, raw);
  } catch {
    /* */
  }
  try {
    sessionStorage.setItem(DROP, raw);
  } catch {
    /* */
  }
}

function dropMarkOf(id?: string): LoadDropMark | undefined {
  if (!id) return undefined;
  return readDrops().find((d) => d.id === id);
}

function writeDropMark(mark: LoadDropMark) {
  writeDrops([mark, ...readDrops().filter((d) => d.id !== mark.id)]);
}

function clearDropMark(id: string) {
  writeDrops(readDrops().filter((d) => d.id !== id));
}

function clampHints(hints: RuneSessionMeta["hallHints"], rooms: number): RuneSessionMeta["hallHints"] {
  const n = Math.max(1, Math.min(8, rooms));
  const rows = (hints || [])
    .map((h, i) => ({ n: Math.max(1, Math.min(8, Number(h.n) || Number(h.hall) || i + 1)), still: h.still || "" }))
    .filter((h) => h.n <= n);
  if (rows.length) return rows.slice(0, n);
  return Array.from({ length: n }, (_, i) => ({ n: i + 1, still: "" }));
}

function clampDroppedMeta(s: RuneSessionMeta): RuneSessionMeta | null {
  const d = dropMarkOf(s.id) || (s.from ? dropMarkOf(s.from) : undefined);
  if (!d) return s;
  /* Tombstone wins. A later hydrate/save timestamp must not resurrect a drop?. */
  if (d.gone || d.rooms <= 0) return null;
  const cap = Math.max(1, Math.min(8, d.rooms));
  return {
    ...s,
    rooms: cap,
    hall: Math.min(s.hall || 1, cap),
    hallHints: clampHints(s.hallHints, cap),
  };
}

export function loadRoomCap(id?: string): number | undefined {
  const d = dropMarkOf(id);
  if (!d || d.gone) return d?.gone ? 0 : undefined;
  return d.rooms;
}

export function loadCitadelGone(id?: string): boolean {
  return Boolean(dropMarkOf(id)?.gone);
}

export function notifyLoadDrop() {
  try {
    if (typeof window !== "undefined") window.dispatchEvent(new Event(LOAD_DROP_EVENT));
  } catch {
    /* */
  }
}

/** Halls persisted on one citadel — Vault hang picker reads these, not only catalog rooms=1. */
export function listStoredHallHints(citadel?: string): { hall: number; still: string; name: string }[] {
  const want = String(citadel || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  const match = (s: { id?: string; from?: string }) => !want || s.id === want || s.from === want;
  const seen = new Set<number>();
  const out: { hall: number; still: string; name: string }[] = [];
  const put = (n: number, still: string, name: string) => {
    if (n < 1 || n > 8 || seen.has(n)) return;
    seen.add(n);
    out.push({ hall: n, still, name: name || `Room ${n}` });
  };
  const fill = (s: { rooms?: number; hall?: number; halls?: { n?: number; still?: string; plate?: string }[]; hallHints?: { n?: number; still?: string }[]; thumb?: string; plate?: string }) => {
    const slices = s.halls?.length ? s.halls : s.hallHints || [];
    if (slices.length) {
      for (const h of slices) put(Math.max(1, h.n || 1), h.still || s.thumb || "", `Room ${h.n || 1}`);
    }
    // rooms / halls[] are the saved set — current hall number must not invent Room 3–8.
    const dropCap = loadRoomCap(want) ?? loadRoomCap((s as { id?: string }).id);
    const cap = Math.min(dropCap ?? 8, Math.max(s.rooms || 0, slices.length));
    for (let i = 1; i <= cap && i <= 8; i++) {
      put(i, i === (s.hall || 1) ? s.thumb || s.plate || "" : "", `Room ${i}`);
    }
  };
  if (want && loadCitadelGone(want)) return [];
  for (const s of readMem()) if (match(s) && !loadCitadelGone(s.id)) fill(s);
  for (const s of readStore()) if (match(s) && !loadCitadelGone(s.id)) fill(s);
  for (const s of readCatalog()) if (match(s) && !loadCitadelGone(s.id)) fill(s);
  const last = lastPlay();
  if (last?.id && !loadCitadelGone(last.id) && (!want || last.id === want)) {
    const rooms = loadRoomCap(last.id) ?? last.rooms;
    if (rooms) fill({ rooms });
    else if (last.hall && (!loadRoomCap(last.id) || last.hall <= (loadRoomCap(last.id) || 8))) put(last.hall, "", `Room ${last.hall}`);
  }
  return out.sort((a, b) => a.hall - b.hall);
}

export function lastPlay(): { id: string; title?: string; hall?: number; rooms?: number } | null {
  try {
    const raw =
      (typeof localStorage !== "undefined" ? localStorage.getItem(LAST) : null) ||
      (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(LAST) : null);
    if (!raw) return null;
    const v = JSON.parse(raw) as { id?: string; title?: string; hall?: number; rooms?: number };
    if (!v?.id) return null;
    if (loadCitadelGone(v.id)) return null;
    const cap = loadRoomCap(v.id);
    const rooms = cap != null ? Math.min(cap, v.rooms || cap) : v.rooms;
    const hall = v.hall && cap != null ? Math.min(v.hall, cap) : v.hall;
    return { id: v.id, title: v.title, hall, rooms };
  } catch {
    return null;
  }
}

export function clearLastPlay() {
  try {
    localStorage.removeItem(LAST);
  } catch {
    /* */
  }
  try {
    sessionStorage.removeItem(LAST);
  } catch {
    /* */
  }
}

export function roomOneId() {
  const rows = listSessions();
  const last = lastPlay()?.id;
  const hit = rows.find((s) => s.id === last) || rows[0];
  if (!hit) return "";
  if (hit.from && rows.some((s) => s.id === hit.from)) return hit.from;
  return hit.id;
}

export function stampPlay(id: string, title?: string, hall?: number, rooms?: number) {
  if (!id) return;
  const raw = JSON.stringify({
    id,
    title: title || "Citadel",
    hall: hall && hall >= 1 ? hall : undefined,
    rooms: rooms && rooms >= 1 ? Math.min(8, Math.round(rooms)) : undefined,
  });
  try {
    localStorage.setItem(LAST, raw);
  } catch {
    /* */
  }
  try {
    sessionStorage.setItem(LAST, raw);
  } catch {
    /* */
  }
}

const LIVE = "bolt-live-play";

export function markLivePlay(id: string, here?: string, plate?: string) {
  if (!id) return;
  try {
    sessionStorage.setItem(LIVE, JSON.stringify({ id, here: here || "", plate: plate || "", t: Date.now() }));
  } catch {
    /* */
  }
}

export function peekLivePlay(id?: string): { id: string; here?: string; plate?: string; t: number } | null {
  try {
    const raw = sessionStorage.getItem(LIVE);
    if (!raw) return null;
    const v = JSON.parse(raw) as { id?: string; here?: string; plate?: string; t?: number };
    if (!v?.id) return null;
    if (id && v.id !== id) return null;
    if (typeof v.t === "number" && Date.now() - v.t > 40 * 60 * 1000) return null;
    return { id: v.id, here: v.here, plate: v.plate, t: v.t || 0 };
  } catch {
    return null;
  }
}

export function clearLivePlay() {
  try {
    sessionStorage.removeItem(LIVE);
  } catch {
    /* */
  }
}

function keepHalls(halls?: HallSlice[], stills = false): HallSlice[] | undefined {
  if (!Array.isArray(halls) || !halls.length) return undefined;
  const src = stills ? keepStill : keepUrl;
  return halls
    .slice(0, 8)
    .map((h, i) => ({
      n: Math.max(1, Math.min(8, Number(h.n) || i + 1)),
      still: src(h.still) || src(h.plate) || src(h.start) || "",
      start: src(h.start) || undefined,
      plate: src(h.plate) || undefined,
      here: h.here,
      cameFrom: h.cameFrom,
      bank: (h.bank || [])
        .map((b) => ({ key: b.key, url: keepUrl(b.url), end: stills ? keepStill(b.end) || keepUrl(b.end) : keepUrl(b.end) }))
        .filter((b) => b.key && b.url)
        .slice(0, 24),
      refs: (h.refs || [])
        .map((r) => ({ ...r, src: src(r.src) }))
        .filter((r) => r.src)
        .slice(0, 16),
      pins: Array.isArray(h.pins) ? h.pins.slice(0, 8) : [],
      forged: h.forged,
      walkSecs: h.walkSecs ? ((h.walkSecs === 6 ? 6 : 10) as WalkSecs) : undefined,
      rift: keepRift(h.rift),
      via: h.via,
      next: h.next,
    }))
    .filter((h) => h.n >= 1);
}

function lightOf(session: RuneSession): RuneSession {
  return {
    ...session,
    plate: keepUrl(session.plate) || "/refs/hall-doors.jpg",
    start: keepUrl(session.start),
    thumb: keepUrl(session.thumb) || keepUrl(session.plate) || "/refs/hall-doors.jpg",
    refs: (session.refs || [])
      .map((r) => ({ ...r, src: keepUrl(r.src) }))
      .filter((r) => r.src),
    bank: (session.bank || [])
      .map((b) => ({ key: b.key, url: keepUrl(b.url), end: keepUrl(b.end) }))
      .filter((b) => b.key && b.url),
    rift: keepRift(session.rift),
    halls: keepHalls(session.halls),
  };
}

function packOf(session: RuneSession): RuneSession {
  const plate = keepStill(session.plate) || keepUrl(session.plate) || "";
  return {
    ...session,
    plate: plate || "/refs/hall-doors.jpg",
    start: keepStill(session.start) || keepUrl(session.start),
    thumb: keepUrl(session.thumb) || (plate.startsWith("/") || plate.startsWith("http") ? plate : "") || "/refs/hall-doors.jpg",
    wish: String(session.wish || "").slice(0, 280),
    refs: (session.refs || [])
      .map((r) => ({ ...r, src: keepStill(r.src) || keepUrl(r.src) }))
      .filter((r) => r.src),
    bank: (session.bank || [])
      .map((b) => ({ key: b.key, url: keepUrl(b.url), end: keepStill(b.end) }))
      .filter((b) => b.key && b.url),
    rift: keepRift(session.rift),
    halls: keepHalls(session.halls, true),
  };
}

function writeStore(rows: RuneSession[]) {
  const packed = rows.slice(0, 8).map(lightOf);
  try {
    localStorage.setItem(STORE, JSON.stringify(packed));
  } catch {
    try {
      localStorage.setItem(
        STORE,
        JSON.stringify(packed.slice(0, 3).map((s) => ({ ...s, refs: [], bank: s.bank.slice(0, 6) }))),
      );
    } catch {
      /* */
    }
  }
}

function readStore(): RuneSession[] {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return [];
    const rows = JSON.parse(raw) as RuneSession[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function richness(s: RuneSession) {
  const clips = (s.bank || []).filter((b) => b?.url).length + (s.halls || []).reduce((n, h) => n + (h.bank || []).filter((b) => b?.url).length, 0);
  const refs = (s.refs || []).filter((r) => r?.src).length;
  return clips * 1000 + refs * 10 + (s.halls?.length || 0) * 100 + ((s.updated || 0) % 1000);
}

function pickSession(a: RuneSession, b: RuneSession): RuneSession {
  const ra = richness(a);
  const rb = richness(b);
  if (ra !== rb) return ra > rb ? a : b;
  return (a.updated || 0) >= (b.updated || 0) ? a : b;
}

function mergeRows(rows: RuneSession[]): RuneSession[] {
  const byId = new Map<string, RuneSession>();
  for (const s of [...readStore(), ...readMem(), ...rows]) {
    if (!s?.id) continue;
    const prev = byId.get(s.id);
    byId.set(s.id, prev ? pickSession(prev, s) : s);
  }
  return [...byId.values()].sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 12);
}

export function saveSessionSync(session: RuneSession): RuneSessionMeta {
  askPersist();
  if (loadCitadelGone(session.id) || loadCitadelGone(session.from)) {
    return metaOf(session);
  }
  const packed = lightOf(session);
  const prev = readStore().find((s) => s.id === session.id) || readMem().find((s) => s.id === session.id);
  const kept = prev ? pickSession(prev, packed) : packed;
  const merged: RuneSession = {
    ...kept,
    ...packed,
    bank: (kept.bank?.length || 0) >= (packed.bank?.length || 0) ? kept.bank : packed.bank,
    refs: (kept.refs?.length || 0) >= (packed.refs?.length || 0) ? kept.refs : packed.refs,
    plate: packed.plate || kept.plate,
    start: packed.start || kept.start,
    thumb: packed.thumb || kept.thumb,
    rift: packed.rift || kept.rift,
    next: packed.next || kept.next,
    from: packed.from || kept.from,
    via: packed.via || kept.via,
    rooms: roomCap({
      rooms: keepRooms(packed.rooms, kept.rooms),
      hall: packed.hall || kept.hall,
      halls: (packed.halls?.length || 0) >= (kept.halls?.length || 0) ? packed.halls : kept.halls,
    }),
    hall: packed.hall || kept.hall,
    title: packed.title || kept.title,
    halls: (packed.halls?.length || 0) >= (kept.halls?.length || 0) ? packed.halls : kept.halls,
    updated: Math.max(packed.updated || 0, kept.updated || 0, Date.now()),
  };
  merged.rooms = roomCap(merged);
  const clamped = clampDroppedMeta(metaOf(merged));
  if (!clamped) {
    /* citadel was dropped — do not resurrect via richer merge */
    return metaOf(merged);
  }
  merged.rooms = clamped.rooms;
  merged.hall = clamped.hall;
  if (merged.halls?.length) {
    merged.halls = merged.halls.filter((h) => h.n <= (clamped.rooms || 8)).slice(0, clamped.rooms || 8);
  }
  const meta = metaOf(clamped || merged);
  writeMem([merged, ...readMem().filter((s) => s.id !== session.id)]);
  const index = listSessions().filter((s) => s.id !== session.id);
  index.unshift(meta);
  writeCatalog(index);
  writeStore([merged, ...readStore().filter((s) => s.id !== session.id)]);
  stampPlay(session.id, session.title || session.name, merged.hall, merged.rooms || merged.halls?.length);
  return meta;
}

export async function saveSession(session: RuneSession): Promise<void> {
  if (loadCitadelGone(session.id) || loadCitadelGone(session.from)) return;
  const packed = packOf(session);
  saveSessionSync(session);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TABLE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(TABLE).put(packed);
    });
    db.close();
  } catch {
    /* */
  }
  try {
    await putCitadel({ data: { session: packed } });
  } catch {
    /* */
  }
  try {
    const guest = guestId();
    if (guest) await putGuestCitadel({ data: { guest, session: packed } });
  } catch {
    /* */
  }
}

export async function loadSession(id: string): Promise<RuneSession | null> {
  if (loadCitadelGone(id)) return null;
  const found: RuneSession[] = [];
  const ram = readMem().find((s) => s.id === id);
  if (ram?.id) found.push(ram);
  const stored = readStore().find((s) => s.id === id);
  if (stored?.id) found.push(stored);
  try {
    const db = await openDb();
    const row = await new Promise<RuneSession | undefined>((resolve, reject) => {
      const tx = db.transaction(TABLE, "readonly");
      const req = tx.objectStore(TABLE).get(id);
      req.onsuccess = () => resolve(req.result as RuneSession | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (row?.id) found.push(row);
  } catch {
    /* */
  }
  try {
    const cloud = await getCitadel({ data: { id } });
    if (cloud?.id) found.push(cloud);
  } catch {
    /* */
  }
  try {
    const guest = guestId();
    if (guest) {
      const cloud = await getGuestCitadel({ data: { guest, id } });
      if (cloud?.id) found.push(cloud);
    }
  } catch {
    /* */
  }
  const best = found.length ? found.reduce((a, b) => pickSession(a, b)) : undefined;
  if (!best?.id || loadCitadelGone(best.id)) return null;
  saveSessionSync(best);
  return best;
}

export async function renameSession(id: string, title: string) {
  const t = String(title || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40) || "Citadel";
  const s = await loadSession(id);
  if (!s) return t;
  await saveSession({ ...s, title: t, name: t });
  return t;
}

function relinkMetas(list: RuneSessionMeta[]): RuneSessionMeta[] {
  const byId = new Set(list.map((s) => s.id));
  return list.map((s) => {
    if (s.from && !byId.has(s.from)) return { ...s, from: undefined };
    return s;
  });
}

function mergeMeta(list: RuneSessionMeta[]) {
  const byId = new Map<string, RuneSessionMeta>();
  for (const s of [...listSessions(), ...list]) {
    if (!s?.id || loadCitadelGone(s.id) || loadCitadelGone(s.from)) continue;
    const prev = byId.get(s.id);
    if (!prev) {
      byId.set(s.id, s);
      continue;
    }
    const newer = (s.updated || 0) >= (prev.updated || 0) ? s : prev;
    const older = newer === s ? prev : s;
    const cap = loadRoomCap(newer.id);
    const rooms = cap != null ? Math.min(cap, keepRooms(roomCap(older), roomCap(newer)) || cap) : keepRooms(roomCap(older), roomCap(newer));
    const hints = keepHallMeta(older.hallHints, newer.hallHints);
    byId.set(s.id, {
      ...older,
      ...newer,
      from: newer.from || older.from,
      via: newer.via || older.via,
      title: newer.title || older.title,
      rooms,
      hall: newer.hall || older.hall,
      hallHints: cap != null ? clampHints(hints, cap) : hints,
    });
  }
  const rows = relinkMetas(
    [...byId.values()]
      .map((s) => clampDroppedMeta(s))
      .filter((s): s is RuneSessionMeta => Boolean(s))
      .sort((a, b) => (b.updated || 0) - (a.updated || 0)),
  );
  writeCatalog(rows);
  return listSessions();
}

async function scanIdbMeta(): Promise<RuneSessionMeta[]> {
  const db = await openDb();
  try {
    const out = await new Promise<RuneSessionMeta[]>((resolve, reject) => {
      const tx = db.transaction(TABLE, "readonly");
      const store = tx.objectStore(TABLE);
      const rows: RuneSessionMeta[] = [];
      if (typeof store.getAll === "function") {
        const req = store.getAll();
        req.onsuccess = () => {
          const all = (req.result || []) as RuneSession[];
          resolve(all.filter((s) => s?.id).map((s) => metaOf(s)));
        };
        req.onerror = () => reject(req.error);
        return;
      }
      const req = store.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) {
          resolve(rows);
          return;
        }
        const s = cur.value as RuneSession;
        if (s?.id) rows.push(metaOf(s));
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
    return out;
  } finally {
    db.close();
  }
}

export async function hydrateSessions(onList?: (rows: RuneSessionMeta[]) => void): Promise<RuneSessionMeta[]> {
  askPersist();
  let floor = loadHangHallCount(livingLoadPacks(listSessions()));
  const emit = (rows: RuneSessionMeta[]) => {
    if (!rows.length) return;
    const n = loadHangHallCount(livingLoadPacks(rows));
    if (n < floor) {
      // Cloud / lastPlay rooms=2 must not replace the full Load hall set.
      onList?.(listSessions());
      return;
    }
    floor = Math.max(floor, n);
    onList?.(rows);
  };
  try {
    const stored = readStore().map((s) => metaOf(s));
    if (stored.length) emit(mergeMeta(stored));
    else emit(listSessions());
  } catch {
    emit(listSessions());
  }
  const take = async (p: Promise<RuneSessionMeta[]>, ms: number, hold = false) => {
    let settled = false;
    const pending = p
      .then((rows) => {
        settled = true;
        return rows;
      })
      .catch(() => {
        settled = true;
        return [] as RuneSessionMeta[];
      });
    const raced = await Promise.race([
      pending,
      new Promise<RuneSessionMeta[]>((resolve) => setTimeout(() => resolve([]), ms)),
    ]);
    if (raced.length) emit(mergeMeta(raced));
    if (!settled) {
      if (hold) {
        const late = await Promise.race([
          pending,
          new Promise<RuneSessionMeta[]>((resolve) => setTimeout(() => resolve([]), 2000)),
        ]);
        if (late.length) emit(mergeMeta(late));
      }
      if (!settled) {
        void pending.then((rows) => {
          if (rows.length) emit(mergeMeta(rows));
        });
      }
    }
  };
  try {
    // Vault Hang awaits this — do not return on an IDB timeout as if the store were empty.
    await take(scanIdbMeta(), 4000, true);
  } catch {
    /* */
  }
  try {
    const dumped = scanStorageSessions().map((s) => metaOf(s));
    if (dumped.length) emit(mergeMeta(dumped));
  } catch {
    /* */
  }
  try {
    await take(listCitadels(), 2500);
  } catch {
    /* */
  }
  try {
    const guest = guestId();
    if (guest) await take(listGuestCitadels({ data: { guest } }), 2500);
  } catch {
    /* */
  }
  const last = lastPlay();
  if (last?.id && !loadCitadelGone(last.id) && !listSessions().some((s) => s.id === last.id)) {
    emit(
      mergeMeta([
        {
          id: last.id,
          name: last.title || "Citadel",
          title: last.title,
          updated: Date.now(),
          phase: "play",
          want: 2,
          walks: 0,
          thumb: "/refs/hall-doors.jpg",
          rooms: last.rooms,
          hall: last.hall,
        },
      ]),
    );
  }
  return listSessions();
}

export async function dumpRooms(): Promise<string> {
  const ids = listSessions().map((s) => s.id);
  const rooms: RuneSession[] = [];
  for (const id of ids) {
    const row = await loadSession(id);
    if (row?.id) rooms.push(packOf(row));
  }
  return JSON.stringify({ v: 1, rooms });
}

export async function dumpRoom(id: string): Promise<string> {
  const row = await loadSession(id);
  if (!row?.id) return JSON.stringify({ v: 1, rooms: [] });
  return JSON.stringify({ v: 1, rooms: [packOf(row)] });
}

export async function takeRooms(raw: string): Promise<RuneSessionMeta[]> {
  let rows: RuneSession[] = [];
  try {
    const data = JSON.parse(raw) as { rooms?: RuneSession[] } | RuneSession[];
    rows = Array.isArray(data) ? data : Array.isArray(data.rooms) ? data.rooms : [];
  } catch {
    return listSessions();
  }
  for (const s of rows) {
    if (!s?.id) continue;
    clearDropMark(String(s.id).slice(0, 48));
    try {
      await saveSession({
        ...s,
        id: String(s.id).slice(0, 48),
        updated: Number(s.updated) || Date.now(),
      });
    } catch {
      try {
        saveSessionSync({
          ...s,
          id: String(s.id).slice(0, 48),
          updated: Number(s.updated) || Date.now(),
        });
      } catch {
        /* */
      }
    }
  }
  const now = listSessions();
  if (now.length) return now;
  return hydrateSessions();
}

export async function dropSession(id: string): Promise<void> {
  const want = String(id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  if (!want) return;
  writeDropMark({ id: want, rooms: 0, at: Date.now(), gone: true });
  writeCatalog(listSessions().filter((s) => s.id !== want && s.from !== want));
  writeStore(readStore().filter((s) => s.id !== want && s.from !== want));
  writeMem(readMem().filter((s) => s.id !== want && s.from !== want));
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TABLE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(TABLE).delete(want);
    });
    db.close();
  } catch {
    /* */
  }
  try {
    await dropCitadel({ data: { id: want } });
  } catch {
    /* */
  }
  try {
    const guest = guestId();
    if (guest) await dropGuestCitadel({ data: { guest, id: want } });
  } catch {
    /* */
  }
}

function remapDest(v: string | number | undefined, hall: number): string | undefined {
  const n = hallN(v);
  if (!n) return v == null ? undefined : String(v);
  if (n === hall) return undefined;
  return n > hall ? String(n - 1) : String(n);
}

function dropHallFromSession(s: RuneSession, hall: number, remaining: number): RuneSession {
  const halls = (s.halls || [])
    .filter((h) => h.n !== hall)
    .map((h) => ({ ...h, n: h.n > hall ? h.n - 1 : h.n }));
  const hn = hallN(s.hall);
  const hallNow = hn === hall ? Math.min(hall, remaining) : hn > hall ? hn - 1 : hn;
  const m1 = remapDest(s.next?.m1, hall);
  const m2 = remapDest(s.next?.m2, hall);
  return {
    ...s,
    rooms: remaining,
    hall: hallNow || remaining,
    halls,
    hallHints: clampHints(
      (s.hallHints || halls).map((h, i) => ({ n: hallN(h.n) || i + 1, still: "still" in h ? h.still || "" : "" })),
      remaining,
    ),
    next: m1 || m2 ? { ...(m1 ? { m1 } : {}), ...(m2 ? { m2 } : {}) } : undefined,
    updated: Date.now(),
  };
}

async function replaceSessionFull(session: RuneSession): Promise<void> {
  if (loadCitadelGone(session.id)) return;
  const packed = packOf({ ...session, updated: Date.now() });
  const light = lightOf(packed);
  const meta = metaOf(light);
  writeMem([light, ...readMem().filter((s) => s.id !== session.id)]);
  writeStore([light, ...readStore().filter((s) => s.id !== session.id)]);
  writeCatalog([meta, ...listSessions().filter((s) => s.id !== session.id)]);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TABLE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(TABLE).put(packed);
    });
    db.close();
  } catch {
    /* */
  }
  try {
    await putCitadel({ data: { session: packed } });
  } catch {
    /* */
  }
  try {
    const guest = guestId();
    if (guest) await putGuestCitadel({ data: { guest, session: packed } });
  } catch {
    /* */
  }
}

function dropTargetId(citadel: string, rows: RuneSessionMeta[]): string {
  const want = String(citadel || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  const pack = packCitadels(rows).find((p) => p.root.id === want || p.rooms.some((r) => r.id === want));
  return pack?.root.id || want;
}

/** Erase every room of a Load citadel — catalog, IDB, cloud, Hang binds. */
export async function dropLoadCitadel(citadel: string): Promise<{ rows: RuneSessionMeta[]; drop: LoadRoomDrop }> {
  return dropLoadRoom(citadel, "all");
}

/** Purge a Load room or an entire citadel (`hall: "all"`). Hang re-reads listSessions(). */
export async function dropLoadRoom(citadel: string, hall?: number | string | null): Promise<{ rows: RuneSessionMeta[]; drop: LoadRoomDrop }> {
  const rows = listSessions();
  const rootId = dropTargetId(citadel, rows);
  const all = hall === "all" || hall === "*" || hall === "citadel" || !hallN(hall);
  const planned = all ? dropCitadelAll(rows, rootId) : dropCitadelHall(rows, rootId, hall);
  let { drop } = planned;
  if (!drop.citadel && rootId) drop = { ...drop, citadel: rootId };
  if (!drop.citadel) {
    return { rows, drop };
  }
  if (!drop.gone && !drop.remaining && !all && !hallN(hall)) {
    const forced = dropCitadelAll(rows, drop.citadel);
    drop = forced.drop;
    planned.rows = forced.rows;
  }

  writeDropMark({
    id: drop.citadel,
    rooms: drop.remaining,
    at: Date.now(),
    gone: drop.gone || drop.remaining <= 0 || undefined,
  });

  const root = drop.gone ? null : await loadSession(drop.citadel).catch(() => null);
  const kin: RuneSession[] = [];
  if (!drop.gone) {
    for (const s of planned.rows.filter((r) => r.id !== drop.citadel && r.from === drop.citadel)) {
      const full = await loadSession(s.id).catch(() => null);
      if (full?.id) kin.push(full);
    }
  }

  if (drop.gone) {
    const gone = rows.filter((s) => s.id === drop.citadel || s.from === drop.citadel || !planned.rows.some((n) => n.id === s.id));
    const ids = [...new Set([drop.citadel, ...gone.map((s) => s.id)])];
    for (const id of ids) await dropSession(id);
    const last = lastPlay();
    if (!last || last.id === drop.citadel) {
      const other = planned.rows[0];
      if (other) stampPlay(other.id, other.title || other.name, other.hall, other.rooms);
      else clearLastPlay();
    }
  } else {
    if (root?.id) await replaceSessionFull(dropHallFromSession(root, drop.hall, drop.remaining));
    else {
      const meta = planned.rows.find((r) => r.id === drop.citadel);
      if (meta) {
        const light = {
          ...meta,
          walkSecs: 6 as const,
          pins: [],
          plate: meta.thumb || "/refs/hall-doors.jpg",
          here: "spawn",
          cameFrom: "spawn",
          forged: 0,
          refs: [],
          bank: [],
          rooms: drop.remaining,
          hall: Math.min(meta.hall || 1, drop.remaining),
          halls: Array.from({ length: drop.remaining }, (_, i) => ({
            n: i + 1,
            still: meta.hallHints?.find((h) => (h.n || h.hall) === i + 1)?.still || (i === 0 ? meta.thumb || "" : ""),
            bank: [] as { key: string; url: string; end: string }[],
            refs: [] as { id: string; name: string; src: string }[],
            pins: [],
          })),
          updated: Date.now(),
        };
        await replaceSessionFull(light);
      }
    }
    for (const full of kin) await replaceSessionFull(dropHallFromSession(full, drop.hall, drop.remaining));
    for (const s of rows.filter((r) => !planned.rows.some((n) => n.id === r.id))) {
      await dropSession(s.id);
    }
    const last = lastPlay();
    if (!last || last.id === drop.citadel) {
      const title = packCitadels(rows).find((p) => p.root.id === drop.citadel)?.title || root?.title || root?.name;
      stampPlay(drop.citadel, title, Math.min(last?.hall || drop.hall, drop.remaining), drop.remaining);
    }
  }

  unbindDroppedHalls([], drop.citadel, drop.gone ? "all" : drop.hall, drop.remap);
  dropHangPending(drop.citadel, drop.gone ? "all" : drop.hall, drop.remap);
  writeHangFloor(Math.max(1, drop.remaining || loadHangHallCount(livingLoadPacks(listSessions())) || 1), "set");
  notifyLoadDrop();
  return { rows: listSessions(), drop };
}
