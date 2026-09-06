import type { RuneNode, WalkSecs } from "@/game/rune";
import { dropCitadel, getCitadel, listCitadels, putCitadel } from "@/lib/citadel-cloud";

const DB = "bolt-rune-sessions";
const TABLE = "sessions";
const INDEX = "bolt-rune-index-v1";
const CATALOG = "bolt-rune-catalog-v1";
const STORE = "bolt-rune-store-v1";
const MEM = "bolt-rune-mem-v1";
const COOKIE = "bolt-rooms-v1";
const BACKUP = "bolt-rune-backup-v1";
const VER = 1;

let ram: RuneSession[] = [];
let persistAsked = false;

export type RunePhase = "look" | "gate" | "refs" | "forge" | "time" | "play" | "mark";

export type CitadelStart =
  | { kind: "path"; first: "m1" | "m2"; drive: "pilot" | "engine"; rooms?: number; hall?: number; stills?: boolean; art?: string }
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

function metaOf(s: Partial<RuneSession> & RuneSessionMeta): RuneSessionMeta {
  const walks = Array.isArray(s.bank) ? s.bank.filter((b) => b?.url).length : s.walks || 0;
  return {
    id: s.id,
    name: s.name || "Room",
    updated: s.updated || Date.now(),
    phase: s.phase || "play",
    want: s.want || 2,
    walks,
    thumb: keepUrl(s.thumb) || keepUrl(s.plate) || "/refs/hall-doors.jpg",
    rooms: Array.isArray(s.halls) && s.halls.length ? s.halls.length : s.rooms,
    hall: s.hall,
    from: s.from,
    via: s.via,
    title: s.title,
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

function writeCookie(list: RuneSessionMeta[]) {
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
      rooms: s.rooms,
      hall: s.hall,
      from: s.from,
      title: s.title,
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
    rooms: s.rooms,
    hall: s.hall,
    from: s.from,
    via: s.via,
    title: s.title,
  }));
}

function pullSessions(raw: unknown): RuneSession[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((s) => s && typeof s === "object" && s.id) as RuneSession[];
  if (typeof raw === "object") {
    const o = raw as { rooms?: unknown; id?: string };
    if (Array.isArray(o.rooms)) return pullSessions(o.rooms);
    if (o.id) return [raw as RuneSession];
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

function writeCatalog(list: RuneSessionMeta[]) {
  const tiny = list.slice(0, 48).map((s) => ({
    id: s.id,
    name: s.name || "Room",
    updated: s.updated || Date.now(),
    phase: s.phase || "play",
    want: s.want || 2,
    walks: s.walks || 0,
    thumb: keepUrl(s.thumb) || "/refs/hall-doors.jpg",
    rooms: s.rooms,
    hall: s.hall,
    from: s.from,
    via: s.via,
    title: s.title,
  }));
  if (!tiny.length) return;
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
        });
      }
    };
    for (const s of readCatalog()) put(s);
    for (const s of readMem()) put(s);
    for (const s of readStore()) put(s);
    const last = lastPlay();
    if (last?.id && !byId.has(last.id)) {
      put({
        id: last.id,
        name: last.title || "Citadel",
        title: last.title,
        updated: Date.now(),
        phase: "play",
        want: 2,
        walks: 0,
        thumb: "/refs/hall-doors.jpg",
      });
    }
    return [...byId.values()].sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 48);
  } catch {
    return [];
  }
}

const LAST = "bolt-last-play";

export function lastPlay(): { id: string; title?: string; hall?: number } | null {
  try {
    const raw =
      (typeof localStorage !== "undefined" ? localStorage.getItem(LAST) : null) ||
      (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(LAST) : null);
    if (!raw) return null;
    const v = JSON.parse(raw) as { id?: string; title?: string; hall?: number };
    return v?.id ? { id: v.id, title: v.title, hall: v.hall } : null;
  } catch {
    return null;
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

export function stampPlay(id: string, title?: string, hall?: number) {
  if (!id) return;
  const raw = JSON.stringify({ id, title: title || "Citadel", hall: hall && hall >= 1 ? hall : undefined });
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
    .filter((h) => h.still || h.bank.length || h.refs.length);
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
    rooms: packed.rooms || kept.rooms,
    hall: packed.hall || kept.hall,
    title: packed.title || kept.title,
    halls: (packed.halls?.length || 0) >= (kept.halls?.length || 0) ? packed.halls : kept.halls,
    updated: Math.max(packed.updated || 0, kept.updated || 0, Date.now()),
  };
  const meta = metaOf(merged);
  writeMem([merged, ...readMem().filter((s) => s.id !== session.id)]);
  const index = listSessions().filter((s) => s.id !== session.id);
  index.unshift(meta);
  writeCatalog(index);
  writeStore([merged, ...readStore().filter((s) => s.id !== session.id)]);
  stampPlay(session.id, session.title || session.name, merged.hall);
  return meta;
}

export async function saveSession(session: RuneSession): Promise<void> {
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
}

export async function loadSession(id: string): Promise<RuneSession | null> {
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
  const best = found.length ? found.reduce((a, b) => pickSession(a, b)) : undefined;
  if (!best?.id) return null;
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
    if (!s?.id) continue;
    const prev = byId.get(s.id);
    if (!prev) {
      byId.set(s.id, s);
      continue;
    }
    const newer = (s.updated || 0) >= (prev.updated || 0) ? s : prev;
    const older = newer === s ? prev : s;
    byId.set(s.id, {
      ...older,
      ...newer,
      from: newer.from || older.from,
      via: newer.via || older.via,
      title: newer.title || older.title,
    });
  }
  const rows = relinkMetas([...byId.values()].sort((a, b) => (b.updated || 0) - (a.updated || 0)));
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
  const before = listSessions();
  onList?.(before);
  const wait = <T,>(p: Promise<T>, ms: number, fallback: T) =>
    Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
  try {
    const idb = await wait(scanIdbMeta(), 1200, [] as RuneSessionMeta[]);
    if (idb.length) onList?.(mergeMeta(idb));
  } catch {
    /* */
  }
  try {
    const dumped = scanStorageSessions().map((s) => metaOf(s));
    if (dumped.length) onList?.(mergeMeta(dumped));
  } catch {
    /* */
  }
  try {
    const cloud = await wait(listCitadels(), 2500, [] as RuneSessionMeta[]);
    if (cloud.length) onList?.(mergeMeta(cloud));
  } catch {
    /* */
  }
  const last = lastPlay();
  if (last?.id && !listSessions().some((s) => s.id === last.id)) {
    onList?.(
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
  const left = listSessions().filter((s) => s.id !== id);
  if (left.length) writeCatalog(left);
  else {
    try {
      localStorage.removeItem(CATALOG);
      localStorage.removeItem(INDEX);
      localStorage.removeItem(BACKUP);
      sessionStorage.removeItem(CATALOG);
    } catch {
      /* */
    }
  }
  writeStore(readStore().filter((s) => s.id !== id));
  writeMem(readMem().filter((s) => s.id !== id));
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TABLE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(TABLE).delete(id);
    });
    db.close();
  } catch {
    /* */
  }
  try {
    await dropCitadel({ data: { id } });
  } catch {
    /* */
  }
}
