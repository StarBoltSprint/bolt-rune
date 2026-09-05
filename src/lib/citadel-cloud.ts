import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import type { RuneSession, RuneSessionMeta } from "@/game/rune-session";

type Row = {
  id: string;
  name: string;
  updated: number;
  phase: string;
  want: number;
  walks: number;
  thumb: string;
  rooms: number | null;
  hall: number | null;
  body?: string;
};

function httpUrl(u: unknown) {
  if (typeof u !== "string") return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u.slice(0, 2000);
  if (u.startsWith("/")) return u.slice(0, 500);
  if (u.startsWith("data:image/") && u.length < 480000) return u;
  return "";
}

function safeId(id: string) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
}

function ownerKey(userId: string) {
  return String(userId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

function metaFrom(session: RuneSession): RuneSessionMeta {
  return {
    id: session.id,
    name: session.name || "Room",
    updated: Number(session.updated) || Date.now(),
    phase: session.phase || "play",
    want: session.want || 2,
    walks: Array.isArray(session.bank) ? session.bank.filter((b) => b?.url).length : session.walks || 0,
    thumb: httpUrl(session.thumb) || httpUrl(session.plate) || "/refs/hall-doors.jpg",
    rooms: session.rooms,
    hall: session.hall,
    from: session.from,
    via: session.via,
    title: session.title,
  };
}

async function disk(userId: string) {
  const owner = ownerKey(userId);
  if (!owner) return null;
  const [{ mkdir, readdir, readFile, writeFile, unlink }, path] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
  ]);
  const dir = path.join(process.cwd(), "data", "citadels", owner);
  await mkdir(dir, { recursive: true });
  return {
    dir,
    file: (id: string) => path.join(dir, `${safeId(id)}.json`),
    mkdir,
    readdir,
    readFile,
    writeFile,
    unlink,
  };
}

async function writeCitadelFile(userId: string, session: RuneSession) {
  const id = safeId(session.id);
  if (!id) return;
  const io = await disk(userId);
  if (!io) return;
  await io.writeFile(io.file(id), JSON.stringify(session), "utf8");
}

async function readCitadelFile(userId: string, id: string): Promise<RuneSession | null> {
  try {
    const io = await disk(userId);
    if (!io) return null;
    const raw = await io.readFile(io.file(id), "utf8");
    const row = JSON.parse(raw) as RuneSession;
    return row?.id ? row : null;
  } catch {
    return null;
  }
}

async function listCitadelFiles(userId: string): Promise<RuneSession[]> {
  try {
    const io = await disk(userId);
    if (!io) return [];
    const names = await io.readdir(io.dir);
    const rows: RuneSession[] = [];
    for (const n of names) {
      if (!n.endsWith(".json")) continue;
      const row = await readCitadelFile(userId, n.slice(0, -5));
      if (row) rows.push(row);
    }
    return rows.sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 24);
  } catch {
    return [];
  }
}

async function dropCitadelFile(userId: string, id: string) {
  try {
    const io = await disk(userId);
    if (!io) return;
    await io.unlink(io.file(id));
  } catch {
    /* */
  }
}

function pack(session: RuneSession): { meta: RuneSessionMeta; body: string; session: RuneSession } {
  const bank = (session.bank || [])
    .map((b) => ({ key: String(b.key || "").slice(0, 40), url: httpUrl(b.url), end: httpUrl(b.end) }))
    .filter((b) => b.key && b.url)
    .slice(0, 24);
  const refs = (session.refs || [])
    .map((r) => ({ id: String(r.id || "").slice(0, 24), name: String(r.name || "").slice(0, 32), src: httpUrl(r.src) }))
    .filter((r) => r.src)
    .slice(0, 16);
  const light: RuneSession = {
    id: safeId(session.id),
    name: String(session.name || "Room").slice(0, 80),
    updated: Number(session.updated) || Date.now(),
    phase: session.phase || "play",
    want: Math.max(1, Math.min(8, Number(session.want) || 2)),
    walks: bank.length,
    thumb: httpUrl(session.thumb) || httpUrl(session.plate) || "/refs/hall-doors.jpg",
    rooms: session.rooms,
    hall: session.hall,
    walkSecs: session.walkSecs === 6 || session.walkSecs === 15 ? session.walkSecs : 10,
    pins: Array.isArray(session.pins) ? session.pins.slice(0, 8) : [],
    plate: httpUrl(session.plate) || "/refs/hall-doors.jpg",
    start: httpUrl(session.start),
    here: String(session.here || "spawn").slice(0, 12),
    cameFrom: String(session.cameFrom || "spawn").slice(0, 12),
    forged: Number(session.forged) || 0,
    refs,
    bank,
    from: session.from,
    via: session.via,
    next: session.next,
    title: session.title,
  };
  const body = JSON.stringify(light);
  return {
    meta: metaFrom(light),
    body: body.slice(0, 180000),
    session: light,
  };
}

export const listCitadels = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<RuneSessionMeta[]> => {
    const byId = new Map<string, RuneSessionMeta>();
    try {
      const sql = await getSql();
      const rows = await sql<Row>`
        select id, name, updated, phase, want, walks, thumb, rooms, hall
        from citadels
        where user_id = ${context.userId}
        order by updated desc
        limit 24
      `;
      for (const r of rows) {
        if (!r.id) continue;
        byId.set(r.id, {
          id: r.id,
          name: r.name,
          updated: Number(r.updated) || 0,
          phase: (r.phase as RuneSessionMeta["phase"]) || "play",
          want: Number(r.want) || 2,
          walks: Number(r.walks) || 0,
          thumb: r.thumb || "/refs/hall-doors.jpg",
          rooms: r.rooms ?? undefined,
          hall: r.hall ?? undefined,
        });
      }
    } catch {
      /* */
    }
    try {
      for (const s of await listCitadelFiles(context.userId)) {
        if (!s.id) continue;
        const prev = byId.get(s.id);
        if (!prev || (s.updated || 0) >= (prev.updated || 0)) byId.set(s.id, metaFrom(s));
      }
    } catch {
      /* */
    }
    return [...byId.values()].sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 24);
  });

export const putCitadel = createServerFn({ method: "POST" })
  .validator((input: { session: RuneSession }) => pack(input.session))
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: boolean }> => {
    if (!data.meta.id || data.body.length < 8) return { ok: false };
    let ok = false;
    try {
      const sql = await getSql();
      const m = data.meta;
      await sql`
        insert into citadels (user_id, id, name, updated, phase, want, walks, thumb, rooms, hall, body)
        values (${context.userId}, ${m.id}, ${m.name}, ${m.updated}, ${m.phase}, ${m.want}, ${m.walks}, ${m.thumb}, ${m.rooms ?? null}, ${m.hall ?? null}, ${data.body})
        on conflict (user_id, id) do update set
          name = excluded.name,
          updated = excluded.updated,
          phase = excluded.phase,
          want = excluded.want,
          walks = excluded.walks,
          thumb = excluded.thumb,
          rooms = excluded.rooms,
          hall = excluded.hall,
          body = excluded.body
      `;
      ok = true;
    } catch {
      /* */
    }
    try {
      await writeCitadelFile(context.userId, data.session);
      ok = true;
    } catch {
      /* */
    }
    return { ok };
  });

export const getCitadel = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => ({
    id: safeId(input?.id ?? ""),
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<RuneSession | null> => {
    if (!data.id) return null;
    try {
      const sql = await getSql();
      const rows = await sql<Row>`
        select body from citadels
        where id = ${data.id} and user_id = ${context.userId}
        limit 1
      `;
      const raw = rows[0]?.body;
      if (raw) {
        const row = JSON.parse(raw) as RuneSession;
        if (row?.id) return row;
      }
    } catch {
      /* */
    }
    return readCitadelFile(context.userId, data.id);
  });

export const dropCitadel = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => ({
    id: safeId(input?.id ?? ""),
  }))
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: boolean }> => {
    if (!data.id) return { ok: false };
    await dropCitadelFile(context.userId, data.id);
    try {
      const sql = await getSql();
      await sql`delete from citadels where id = ${data.id} and user_id = ${context.userId}`;
    } catch {
      /* */
    }
    return { ok: true };
  });
