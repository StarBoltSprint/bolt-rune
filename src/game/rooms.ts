import type { HallSlice, RuneSession, RuneSessionMeta } from "./rune-session.ts";

export type CitadelPack = {
  root: RuneSessionMeta;
  rooms: RuneSessionMeta[];
  title: string;
  updated: number;
};

export function hallN(v?: string | number | null) {
  if (typeof v === "number" && v >= 1 && v <= 8) return Math.round(v);
  if (typeof v === "string" && /^\d$/.test(v)) {
    const n = Number(v);
    if (n >= 1 && n <= 8) return n;
  }
  return 0;
}

export function liveSlice(s: Pick<RuneSession, "hall" | "start" | "plate" | "thumb" | "here" | "cameFrom" | "bank" | "refs" | "pins" | "forged" | "walkSecs" | "rift" | "via" | "next">, n?: number): HallSlice {
  const dest = (d?: string | number) => hallN(d) || undefined;
  return {
    n: Math.max(1, Math.min(8, n || s.hall || 1)),
    still: s.start || s.plate || s.thumb || "",
    start: s.start,
    plate: s.plate,
    here: s.here,
    cameFrom: s.cameFrom,
    bank: Array.isArray(s.bank) ? s.bank.filter((b) => b?.key && b.url) : [],
    refs: Array.isArray(s.refs) ? s.refs.filter((r) => r?.src) : [],
    pins: Array.isArray(s.pins) ? s.pins : [],
    forged: s.forged,
    walkSecs: s.walkSecs,
    rift: s.rift,
    via: s.via,
    next: {
      ...(dest(s.next?.m1) ? { m1: dest(s.next?.m1) } : {}),
      ...(dest(s.next?.m2) ? { m2: dest(s.next?.m2) } : {}),
    },
  };
}

export function seedHalls(s: RuneSession, kids: RuneSession[] = []): HallSlice[] {
  if (s.halls?.length) {
    return s.halls
      .map((h, i) => ({ ...h, n: Math.max(1, Math.min(8, h.n || i + 1)) }))
      .sort((a, b) => a.n - b.n)
      .slice(0, 8);
  }
  const head = liveSlice(s, 1);
  const rest = kids
    .slice()
    .sort((a, b) => (a.hall || 0) - (b.hall || 0) || (a.updated || 0) - (b.updated || 0))
    .map((k, i) => liveSlice(k, i + 2));
  return [head, ...rest].slice(0, 8);
}

export function putSlice(list: HallSlice[], slice: HallSlice): HallSlice[] {
  const n = Math.max(1, Math.min(8, slice.n || 1));
  const next = list.slice(0, 8);
  while (next.length < n) next.push({ n: next.length + 1, still: "", bank: [], refs: [], pins: [] });
  next[n - 1] = { ...slice, n };
  return next.slice(0, 8);
}

export function rootOf(id: string, rows: RuneSessionMeta[] = []): string {
  const byId = new Map(rows.map((s) => [s.id, s]));
  let cur = id;
  const seen = new Set<string>();
  while (true) {
    const s = byId.get(cur);
    if (!s?.from || !byId.has(s.from) || s.from === cur || seen.has(cur)) return cur;
    seen.add(cur);
    cur = s.from;
  }
}

function kidsOf(rows: RuneSessionMeta[]) {
  const byId = new Map(rows.map((s) => [s.id, s]));
  const kids = new Map<string, RuneSessionMeta[]>();
  const nested = new Set<string>();
  for (const s of rows) {
    if (!s.from || s.from === s.id || !byId.has(s.from)) continue;
    nested.add(s.id);
    kids.set(s.from, [...(kids.get(s.from) || []), s]);
  }
  return { byId, kids, nested };
}

function walkRooms(id: string, kids: Map<string, RuneSessionMeta[]>, byId: Map<string, RuneSessionMeta>, seen: Set<string>): RuneSessionMeta[] {
  if (seen.has(id)) return [];
  const node = byId.get(id);
  if (!node) return [];
  seen.add(id);
  const out = [node];
  const ch = (kids.get(id) || []).sort((a, b) => (a.hall || 1) - (b.hall || 1) || (a.updated || 0) - (b.updated || 0));
  for (const c of ch) out.push(...walkRooms(c.id, kids, byId, seen));
  return out;
}

function asHalls(root: RuneSessionMeta, count: number): RuneSessionMeta[] {
  const n = Math.max(1, Math.min(8, count));
  return Array.from({ length: n }, (_, i) => ({
    ...root,
    hall: i + 1,
    name: i === 0 ? root.name : `Room ${i + 1}`,
  }));
}

/** Every hall in the citadel — halls[] first, leftover child sessions only as a fallback. */
export function packCitadels(list: RuneSessionMeta[] = []): CitadelPack[] {
  const { byId, kids, nested } = kidsOf(list);
  const roots = list.filter((s) => !nested.has(s.id));
  const shown = roots.length ? roots : list;
  return shown
    .map((root) => {
      const tree = walkRooms(root.id, kids, byId, new Set());
      const packed = Math.max(1, root.rooms || 1, tree.length);
      const rooms = packed > 1 || tree.length <= 1 ? asHalls(root, packed) : tree;
      const updated = Math.max(root.updated || 0, ...tree.map((r) => r.updated || 0));
      return {
        root,
        rooms,
        updated,
        title: (root.title || root.name || "").trim() || "Citadel",
      };
    })
    .sort((a, b) => b.updated - a.updated);
}

export type HangRoomPick = {
  hall: number;
  name: string;
  still: string;
  living: boolean;
};

export type LastPlayHint = { id?: string; hall?: number; rooms?: number } | null;

export type RoomCountHint = {
  rooms?: number;
  hall?: number;
  halls?: Array<{ n?: number; hall?: number } | number>;
  lastRooms?: number;
  lastHall?: number;
  hungHalls?: Array<number | undefined | null>;
};

/** Union every hall the citadel actually has — never shrink to 1 when more exist. */
export function citadelRoomCount(hint: RoomCountHint = {}): number {
  const hallNs = (hint.halls || []).map((h, i) =>
    typeof h === "number" ? hallN(h) : hallN(h.n) || hallN(h.hall) || (h.n == null && h.hall == null ? i + 1 : 0),
  );
  const n = Math.max(
    hint.rooms || 0,
    hint.hall || 0,
    hint.lastRooms || 0,
    hint.lastHall || 0,
    ...hallNs,
    ...(hint.hungHalls || []).map((h) => hallN(h) || 0),
  );
  return Math.max(1, Math.min(8, n || 1));
}

/** Hang A/B and Grok Bot Hang always confirm a room before binding a door. */
export function hangOpensSheet(kind: "A" | "B" | "bot", roomCount: number): boolean {
  void kind;
  return roomCount >= 1;
}

/** The citadel and hall Hang A/B should bind — last Play, not whoever is first in the catalog. */
export function bindCitadel(
  rows: RuneSessionMeta[] = [],
  last: LastPlayHint = null,
): { citadel: string; hall: number; title: string } {
  if (!rows.length) return { citadel: "", hall: 1, title: "" };
  const hit = rows.find((s) => s.id === last?.id) || rows[0];
  const packs = packCitadels(rows);
  const pack = packs.find((p) => p.root.id === hit.id || p.rooms.some((r) => r.id === hit.id)) || packs[0];
  const hall = hallN(last?.hall) || Math.max(1, Math.min(8, pack?.root.hall || hit.hall || 1));
  return {
    citadel: pack?.root.id || rootOf(hit.id, rows),
    hall,
    title: pack?.title || hit.title || hit.name || "",
  };
}

function roomStill(
  hall: number,
  meta?: Pick<RuneSessionMeta, "thumb" | "name">,
  arts?: Array<{ room?: { hall?: number; still?: string } | null; still?: string }>,
) {
  const art = (arts || []).find((a) => hallN(a.room?.hall) === hall);
  return art?.room?.still || art?.still || meta?.thumb || "";
}

/** Halls that exist in the living citadel — picker source for Hang A/B. */
export function listHangRooms(
  rows: RuneSessionMeta[] = [],
  last: LastPlayHint = null,
  arts?: Array<{ room?: { hall?: number; still?: string } | null; still?: string }>,
  extra?: HangRoomPick[],
): HangRoomPick[] {
  const cit = bindCitadel(rows, last);
  const packs = packCitadels(rows);
  const pack = packs.find((p) => p.root.id === cit.citadel) || packs[0];
  const raw: Array<Pick<RuneSessionMeta, "hall" | "name" | "thumb">> = pack?.rooms?.length
    ? pack.rooms
    : [{ hall: 1, name: pack?.title || "Room 1", thumb: pack?.root.thumb || "" }];
  const living = cit.hall || 1;
  const seen = new Set<number>();
  const rooms: HangRoomPick[] = [];
  const put = (hall: number, name: string, still: string) => {
    if (hall < 1 || hall > 8 || seen.has(hall)) return;
    seen.add(hall);
    rooms.push({ hall, name: name || `Room ${hall}`, still, living: hall === living });
  };
  raw.forEach((r, i) => {
    const hall = hallN(r.hall) || i + 1;
    put(hall, r.name && r.name !== pack?.root.name ? r.name : `Room ${hall}`, roomStill(hall, r, arts));
  });
  for (const e of extra || []) put(e.hall, e.name, e.still || roomStill(e.hall, undefined, arts));
  for (const a of arts || []) {
    const hall = hallN(a.room?.hall);
    if (hall) put(hall, `Room ${hall}`, a.room?.still || a.still || "");
  }
  const lastRooms = Math.max(1, Math.min(8, last?.rooms || 0));
  if (last?.rooms) {
    for (let i = 1; i <= lastRooms; i++) put(i, `Room ${i}`, roomStill(i, undefined, arts));
  }
  const lastN = hallN(last?.hall);
  if (lastN) put(lastN, `Room ${lastN}`, roomStill(lastN, undefined, arts));
  const cap = citadelRoomCount({
    rooms: pack?.root.rooms || pack?.rooms?.length,
    hall: cit.hall,
    halls: [...raw, ...(extra || [])],
    lastRooms: last?.rooms,
    lastHall: last?.hall,
    hungHalls: (arts || []).map((a) => a.room?.hall),
  });
  for (let i = 1; i <= cap; i++) put(i, `Room ${i}`, roomStill(i, undefined, arts));
  if (!rooms.length) rooms.push({ hall: 1, name: "Room 1", still: "", living: true });
  return rooms.sort((a, b) => a.hall - b.hall);
}

export function defaultHangRoom(rooms: HangRoomPick[]): number {
  return rooms.find((r) => r.living)?.hall || rooms[0]?.hall || 1;
}

/**
 * Bot: one room → that hall. Many rooms → explicit `data-hang-room` / hall number,
 * else the living hall (or hall 1).
 */
export function resolveHangRoom(rooms: HangRoomPick[], want?: number | string | null): number {
  const list = rooms.length ? rooms : [{ hall: 1, name: "Room 1", still: "", living: true }];
  if (list.length === 1) return list[0]!.hall;
  const n = hallN(typeof want === "number" ? want : want == null || want === "" ? 0 : want);
  if (n && list.some((r) => r.hall === n)) return n;
  return defaultHangRoom(list);
}
