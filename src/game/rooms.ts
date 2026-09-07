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
      const packed = citadelRoomCount({
        rooms: Math.max(root.rooms || 0, ...tree.map((r) => Number(r.rooms) || 0)),
        hall: root.hall,
        halls: root.hallHints?.length ? root.hallHints : tree.map((r) => r.hall || 0),
        hungHalls: tree.map((r) => r.hall),
      });
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
  /** Load card this pick belongs to — Hang binds here, not lastPlay’s biome artefact. */
  citadel?: string;
  /** Real hall on that citadel when display hall was remapped (several 1-room saves). */
  bindHall?: number;
};

export type LastPlayHint = { id?: string; hall?: number; rooms?: number } | null;

/** Shipped-bundle marker — Hang picks Load’s saved citadel halls, not biome artefacts. */
export const HANG_LOAD_HALLS = "hang-load-halls";

/** Cook / artefact titles that must not appear as Hang citadel rooms. */
const BIOME_ARTEFACT_NAMES = [
  "asteroid",
  "forest",
  "canyon",
  "city",
  "seed",
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
  "luxuriant forest",
];

function titleLooksLikeBiome(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (!t) return false;
  if (t.includes("luxuriant")) return true;
  return BIOME_ARTEFACT_NAMES.some(
    (n) => t === n || t.endsWith(` ${n}`) || t.startsWith(`${n} `) || t.includes(` ${n} `),
  );
}

/** Biome cook / hung artefact — Load may list it; Hang must not treat it as a citadel hall. */
export function isBiomeArtefactMeta(
  m?: Pick<RuneSessionMeta, "id" | "title" | "name" | "rooms" | "hallHints"> | null,
): boolean {
  if (!m) return false;
  const id = String(m.id || "");
  if (id.startsWith("art-")) return true;
  if ((m.hallHints?.length || 0) > 1) return false;
  if (Number(m.rooms || 0) > 1) return false;
  return titleLooksLikeBiome(`${m.title || ""} ${m.name || ""}`);
}

export function livingHangRows(rows: RuneSessionMeta[] = []): RuneSessionMeta[] {
  return rows.filter((s) => !isBiomeArtefactMeta(s));
}

function hangLastHint(rows: RuneSessionMeta[], last: LastPlayHint): LastPlayHint {
  if (!last) return null;
  if (last.id?.startsWith("art-")) return null;
  const hit = last.id ? rows.find((s) => s.id === last.id) : undefined;
  if (hit && isBiomeArtefactMeta(hit)) return null;
  return last;
}

export type RoomCountHint = {
  rooms?: number;
  hall?: number;
  halls?: Array<{ n?: number; hall?: number } | number>;
  lastRooms?: number;
  lastHall?: number;
  hungHalls?: Array<number | string | undefined | null>;
  next?: { m1?: number | string; m2?: number | string };
};

/** Union every hall the citadel actually has — never shrink to 1 when more exist. */
export function citadelRoomCount(hint: RoomCountHint = {}): number {
  const list = hint.halls || [];
  const hallNs = list.map((h, i) =>
    typeof h === "number" ? hallN(h) : hallN(h.n) || hallN(h.hall) || (h.n == null && h.hall == null ? i + 1 : 0),
  );
  const n = Math.max(
    hint.rooms || 0,
    hint.hall || 0,
    hint.lastRooms || 0,
    hint.lastHall || 0,
    list.length,
    ...hallNs,
    ...(hint.hungHalls || []).map((h) => hallN(h) || 0),
    hallN(hint.next?.m1),
    hallN(hint.next?.m2),
  );
  return Math.max(1, Math.min(8, n || 1));
}

function livingCitadelRows(rows: RuneSessionMeta[], citadel: string): RuneSessionMeta[] {
  if (!citadel) return rows;
  return rows.filter((s) => s.id === citadel || s.from === citadel || rootOf(s.id, rows) === citadel);
}

function richestHangPack(packs: CitadelPack[]): CitadelPack | undefined {
  return [...packs].sort((a, b) => b.rooms.length - a.rooms.length || b.updated - a.updated)[0];
}

/** Load cards Hang may pick — biome artefacts stripped. Same packer as the Load sheet. */
export function livingLoadPacks(rows: RuneSessionMeta[] = []): CitadelPack[] {
  return packCitadels(livingHangRows(rows));
}

/** How many Hang picks Load’s living cards imply — never lastPlay.hall alone. */
export function loadHangHallCount(packs: CitadelPack[]): number {
  if (!packs.length) return 0;
  const multi = packs.filter((p) => p.rooms.length > 1);
  if (!multi.length) return Math.min(8, packs.length);
  const richest = richestHangPack(multi);
  if (!richest) return Math.min(8, packs.length);
  const others = packs.filter((p) => p.root.id !== richest.root.id);
  return Math.min(8, richest.rooms.length + others.reduce((n, p) => n + Math.max(1, p.rooms.length), 0));
}

/**
 * Hang list is monotonic for a Vault visit: a later 2-room hydrate/lastPlay
 * pass must not replace an already-shown full Load hall set of the same citadel.
 */
function exclusiveCitadel(rooms: HangRoomPick[]): string {
  const ids = [...new Set(rooms.map((r) => r.citadel).filter(Boolean))];
  return ids.length === 1 ? ids[0]! : "";
}

export type LoadRoomDrop = {
  citadel: string;
  hall: number;
  gone: boolean;
  remaining: number;
  remap: Array<[number, number]>;
};

function packHalls(pack?: CitadelPack): number[] {
  if (!pack) return [];
  return pack.rooms.map((r, i) => hallN(r.hall) || i + 1).filter((n) => n >= 1 && n <= 8);
}

/** Clear or remap hang bindings when a Load room is dropped. Never leaves a ghost Room N. */
export function unbindDroppedHalls<T extends { room?: { citadel?: string; hall?: number } | null }>(
  arts: T[] = [],
  citadel: string,
  hall: number | "all",
  remap: Array<[number, number]> = [],
): T[] {
  if (!arts.length) return arts;
  const want = String(citadel || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
  const map = new Map(remap.filter(([from, to]) => from >= 1 && from <= 8 && to >= 1 && to <= 8));
  return arts.map((a) => {
    const room = a.room;
    if (!room) return a;
    if (room.citadel && want && room.citadel !== want) return a;
    if (hall === "all") return { ...a, room: null };
    const n = Number(room.hall);
    if (n === hall) return { ...a, room: null };
    const moved = n >= 1 && n <= 8 ? map.get(n) : undefined;
    if (moved && moved !== n) return { ...a, room: { ...room, hall: moved } };
    return a;
  });
}

function citadelId(v?: string | null): string {
  return String(v || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
}

function loadPacks(rows: RuneSessionMeta[] = []): CitadelPack[] {
  /* Load drop must see every Load card — not only Hang’s living (non-biome) set. */
  return packCitadels(rows);
}

function purgeCitadelRows(rows: RuneSessionMeta[], id: string): RuneSessionMeta[] {
  if (!id) return rows;
  return rows.filter((s) => s.id !== id && s.from !== id && rootOf(s.id, rows) !== id);
}

/** Erase every hall of a Load citadel. Hang picker loses the card; hung doors unbind. */
export function dropCitadelAll(
  rows: RuneSessionMeta[] = [],
  citadel?: string | null,
): { rows: RuneSessionMeta[]; drop: LoadRoomDrop } {
  const id = citadelId(citadel);
  const empty = { citadel: id, hall: 0, gone: false, remaining: 0, remap: [] as Array<[number, number]> };
  if (!id) return { rows, drop: empty };
  const pack = packForId(loadPacks(rows), id);
  const goneId = pack?.root.id || id;
  return {
    rows: purgeCitadelRows(rows, goneId),
    drop: { citadel: goneId, hall: 0, gone: true, remaining: 0, remap: [] },
  };
}

/** Drop hall N from a Load citadel. Compacts remaining halls 1..k. Last room removes the citadel. */
export function dropCitadelHall(
  rows: RuneSessionMeta[] = [],
  citadel?: string | null,
  hall?: number | string | null,
): { rows: RuneSessionMeta[]; drop: LoadRoomDrop } {
  const id = citadelId(citadel);
  const all = hall === "all" || hall === "*" || hall === "citadel";
  if (all || !hallN(hall)) return dropCitadelAll(rows, id);
  const n = hallN(hall);
  const empty = { citadel: id, hall: n, gone: false, remaining: 0, remap: [] as Array<[number, number]> };
  if (!id || !n) return { rows, drop: empty };
  const pack = packForId(loadPacks(rows), id);
  if (!pack) {
    /* Unknown / catalog-only id — still purge so drop? cannot no-op. */
    return dropCitadelAll(rows, id);
  }
  const halls = packHalls(pack);
  const count = Math.max(1, Math.min(8, pack.rooms.length || halls.length || 1));
  const hit = halls.includes(n) || n <= count;
  if (!hit) return { rows, drop: { ...empty, citadel: pack.root.id, remaining: count } };
  if (count <= 1) {
    const goneId = pack.root.id;
    return { rows: purgeCitadelRows(rows, goneId), drop: { citadel: goneId, hall: n, gone: true, remaining: 0, remap: [] } };
  }
  const remaining = count - 1;
  const remap: Array<[number, number]> = [];
  for (let h = n + 1; h <= 8; h++) {
    if (halls.includes(h) || h <= count) remap.push([h, h - 1]);
  }
  const next = rows
    .map((s) => {
      const kin = s.id === pack.root.id || s.from === pack.root.id || rootOf(s.id, rows) === pack.root.id;
      if (!kin) return s;
      const hn = hallN(s.hall);
      if (s.id !== pack.root.id && hn === n) return null;
      const hallNext = hn === n ? Math.min(n, remaining) : hn > n ? hn - 1 : hn || undefined;
      const hints = (s.hallHints || [])
        .map((h, i) => ({ n: hallN(h.n) || hallN(h.hall) || i + 1, still: h.still || "" }))
        .filter((h) => h.n && h.n !== n)
        .map((h) => ({ n: h.n > n ? h.n - 1 : h.n, still: h.still }));
      const hallHints = hints.length
        ? hints
        : Array.from({ length: remaining }, (_, i) => ({ n: i + 1, still: i === 0 ? s.thumb || "" : "" }));
      return {
        ...s,
        rooms: remaining,
        hall: hallNext || Math.min(s.hall || 1, remaining),
        hallHints,
      };
    })
    .filter((s): s is RuneSessionMeta => Boolean(s));
  return { rows: next, drop: { citadel: pack.root.id, hall: n, gone: false, remaining, remap } };
}

export function holdHangRooms(prev: HangRoomPick[] = [], next: HangRoomPick[] = [], release = false): HangRoomPick[] {
  const older = prev.filter((r) => hallN(r.hall));
  const newer = next.filter((r) => hallN(r.hall));
  /* Authoritative Load re-read after a drop — do not keep orphan halls. */
  if (release) return newer.length ? newer : next;
  if (!older.length) return newer.length ? newer : next;
  if (!newer.length) return older;
  const nextCit = exclusiveCitadel(newer);
  const scopedOlder = nextCit ? older.filter((r) => r.citadel === nextCit) : older;
  if (!scopedOlder.length) return newer;
  if (newer.length > scopedOlder.length) return newer;
  const byHall = new Map<number, HangRoomPick>();
  for (const r of scopedOlder) byHall.set(r.hall, r);
  for (const r of newer) {
    const cur = byHall.get(r.hall);
    byHall.set(r.hall, {
      hall: r.hall,
      name: r.name || cur?.name || `Room ${r.hall}`,
      still: r.still || cur?.still || "",
      /* Newer living wins — OR-merge left Room 1 · HERE after Hang Room 4. */
      living: Boolean(r.living),
      citadel: r.citadel || cur?.citadel,
      bindHall: r.bindHall ?? cur?.bindHall,
    });
  }
  return [...byHall.values()].sort((a, b) => a.hall - b.hall);
}

/** Hang A/B and Grok Bot Hang always confirm a room before binding a door. */
export function hangOpensSheet(kind: "A" | "B" | "bot", roomCount: number): boolean {
  void kind;
  return roomCount >= 1;
}

export type HangCitadelPick = {
  id: string;
  title: string;
  rooms: number;
  thumb: string;
  living: boolean;
};

function packForId(packs: CitadelPack[], id?: string | null): CitadelPack | undefined {
  if (!id) return undefined;
  return packs.find((p) => p.root.id === id || p.rooms.some((r) => r.id === id));
}

/** Load citadels Hang may pick — every living card, not only lastPlay / richest. */
export function listHangCitadels(
  rows: RuneSessionMeta[] = [],
  last: LastPlayHint = null,
  want?: string | null,
): HangCitadelPick[] {
  const packs = livingLoadPacks(rows);
  const cit = bindCitadel(rows, last, want);
  return packs.map((p) => ({
    id: p.root.id,
    title: p.title,
    rooms: Math.max(1, Math.min(8, p.rooms.length)),
    thumb: p.root.thumb || "",
    living: p.root.id === cit.citadel,
  }));
}

/** The citadel Hang A/B should bind — explicit pick, else lastPlay if living, else richest. */
export function bindCitadel(
  rows: RuneSessionMeta[] = [],
  last: LastPlayHint = null,
  want?: string | null,
): { citadel: string; hall: number; title: string } {
  const living = livingHangRows(rows);
  if (!living.length) return { citadel: "", hall: 1, title: "" };
  const hint = hangLastHint(rows, last);
  const packs = packCitadels(living);
  const richest = richestHangPack(packs);
  const pack = packForId(packs, want) || packForId(packs, hint?.id) || richest || packs[0];
  const hit = pack?.root || living[0];
  const hintedHall = hallN(hint?.hall);
  const hintOnThis =
    Boolean(hintedHall) &&
    Boolean(pack) &&
    (!hint?.id || pack!.root.id === hint.id || pack!.rooms.some((r) => r.id === hint.id));
  const onPack = hintOnThis && pack?.rooms.some((r) => (hallN(r.hall) || 0) === hintedHall);
  const hall = onPack ? hintedHall : Math.max(1, Math.min(8, pack?.root.hall || hit.hall || 1));
  return {
    citadel: pack?.root.id || rootOf(hit.id, living),
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

function hintOnCitadel(hint: LastPlayHint, citadel: string, pack?: CitadelPack): boolean {
  if (!hint) return false;
  if (!hint.id) return true;
  if (hint.id === citadel) return true;
  return Boolean(pack?.rooms.some((r) => r.id === hint.id));
}

/** Rooms of one citadel — never flatten other Loads into this strip. Cap 8. */
export function listHangRooms(
  rows: RuneSessionMeta[] = [],
  last: LastPlayHint = null,
  arts?: Array<{ room?: { hall?: number; still?: string; citadel?: string } | null; still?: string }>,
  extra?: HangRoomPick[],
  held?: HangRoomPick[],
  citadel?: string | null,
): HangRoomPick[] {
  const living = livingHangRows(rows);
  const hint = hangLastHint(rows, last);
  const cit = bindCitadel(rows, last, citadel);
  const packs = livingLoadPacks(rows);
  const pack = packForId(packs, cit.citadel) || packs[0];
  const kin = livingCitadelRows(living, cit.citadel);
  const here = cit.hall || 1;
  const seen = new Set<number>();
  const rooms: HangRoomPick[] = [];
  const put = (hall: number, still: string, owner?: string, bindHall?: number) => {
    if (hall < 1 || hall > 8) return;
    if (seen.has(hall)) {
      const i = rooms.findIndex((r) => r.hall === hall);
      if (i >= 0 && still && !rooms[i]?.still) rooms[i] = { ...rooms[i]!, still };
      return;
    }
    seen.add(hall);
    rooms.push({
      hall,
      name: `Room ${hall}`,
      still,
      living: hall === here && (!owner || owner === cit.citadel),
      citadel: owner || cit.citadel || undefined,
      bindHall,
    });
  };
  const fillCount = (count: number, meta?: Pick<RuneSessionMeta, "thumb" | "name" | "hall">, owner?: string) => {
    const n = Math.max(0, Math.min(8, count || 0));
    for (let i = 1; i <= n; i++) put(i, roomStill(i, meta?.hall === i ? meta : undefined, arts), owner || cit.citadel);
  };
  if (pack) {
    if (pack.rooms.length > 1) {
      pack.rooms.forEach((r, i) => {
        const hall = hallN(r.hall) || i + 1;
        put(hall, roomStill(hall, r, arts), pack.root.id);
      });
      fillCount(
        Math.max(pack.rooms.length, citadelRoomCount({ rooms: pack.root.rooms, halls: pack.root.hallHints })),
        pack.root,
        pack.root.id,
      );
    } else {
      const actual = hallN(pack.root.hall) || hallN(pack.rooms[0]?.hall) || 1;
      put(actual, pack.root.thumb || roomStill(actual, pack.root, arts), pack.root.id);
    }
  }
  for (const s of kin) {
    fillCount(citadelRoomCount({ rooms: s.rooms, hall: s.hall, halls: s.hallHints }), s, cit.citadel);
    const hn = hallN(s.hall);
    if (hn) put(hn, roomStill(hn, s, arts), cit.citadel);
    for (const h of s.hallHints || []) {
      const n = hallN(h.n) || hallN(h.hall);
      if (n) put(n, h.still || roomStill(n, s, arts), cit.citadel);
    }
  }
  for (const e of extra || []) {
    const hall = hallN(e.hall);
    if (!hall) continue;
    if (e.citadel && e.citadel !== cit.citadel) continue;
    put(hall, e.still || roomStill(hall, undefined, arts), e.citadel || cit.citadel, e.bindHall);
  }
  for (const a of arts || []) {
    const hall = hallN(a.room?.hall);
    const owner = a.room?.citadel;
    if (!hall) continue;
    if (owner && owner !== cit.citadel) continue;
    put(hall, a.room?.still || a.still || "", owner || cit.citadel);
  }
  if (hint?.rooms && hintOnCitadel(hint, cit.citadel, pack)) {
    const lastRooms = Math.max(1, Math.min(8, hint.rooms));
    for (let i = 1; i <= lastRooms; i++) put(i, roomStill(i, undefined, arts), cit.citadel);
  }
  const lastN = hallN(hint?.hall);
  const known = Math.max(
    citadelRoomCount({ rooms: pack?.root.rooms, halls: pack?.root.hallHints }),
    pack?.rooms.length || 0,
    hintOnCitadel(hint, cit.citadel, pack) ? hint?.rooms || 0 : 0,
    rooms.length,
  );
  if (lastN && lastN <= known && hintOnCitadel(hint, cit.citadel, pack)) put(lastN, roomStill(lastN, undefined, arts), cit.citadel);
  const cap = Math.max(
    citadelRoomCount({
      rooms: pack?.root.rooms,
      halls: pack?.root.hallHints,
      lastRooms: hintOnCitadel(hint, cit.citadel, pack) ? hint?.rooms : undefined,
      hungHalls: (arts || [])
        .filter((a) => !a.room?.citadel || a.room.citadel === cit.citadel)
        .map((a) => a.room?.hall),
    }),
    pack?.rooms.length || 0,
    ...kin.map((s) => citadelRoomCount({ rooms: s.rooms, hall: s.hall, halls: s.hallHints })),
  );
  for (let i = 1; i <= cap; i++) put(i, roomStill(i, undefined, arts), cit.citadel);
  if (!rooms.length) rooms.push({ hall: 1, name: "Room 1", still: "", living: true, citadel: cit.citadel || undefined });
  return holdHangRooms(held, rooms.sort((a, b) => a.hall - b.hall));
}

export function defaultHangRoom(rooms: HangRoomPick[]): number {
  return rooms.find((r) => r.living)?.hall || rooms[0]?.hall || 1;
}

/**
 * Bot: one room → that hall. Many rooms → explicit `data-hang-room` / hall number,
 * else the living hall (or hall 1).
 * An explicit pick N (Room 8) must not fall back to defaultHangRoom / living 2
 * just because a late hydrate list is shorter than the sheet.
 */
export function resolveHangRoom(rooms: HangRoomPick[], want?: number | string | null): number {
  const list = rooms.length ? rooms : [{ hall: 1, name: "Room 1", still: "", living: true }];
  const n = hallN(typeof want === "number" ? want : want == null || want === "" ? 0 : want);
  /* Explicit pick N wins even if a late hydrate list is one card — leftover
     Hang B after Hang Room 4 must not collapse to Room 1. */
  if (n) return n;
  if (list.length === 1) return list[0]!.hall;
  return defaultHangRoom(list);
}

/** Living Hang Room N is hall N. A picked 8 must not collapse to the column default. */
export function livingHangHall(rooms: HangRoomPick[], want?: number | string | null): number {
  const n = hallN(typeof want === "number" ? want : want == null || want === "" ? 0 : want);
  if (n) return n;
  return resolveHangRoom(rooms, want);
}

/** Hang confirm: tapped hall N wins — never defaultHangRoom / stale hangHallN. */
export function confirmHangHall(rooms: HangRoomPick[], want?: number | string | null): number {
  return livingHangHall(rooms, want);
}
