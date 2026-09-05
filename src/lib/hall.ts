import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { packRoom, type HungArtifact, type HungRoom } from "@/game/artifacts";

type Row = {
  id: string;
  name: string;
  still: string;
  playlist: string;
  prompt: string;
  hung_at: string | Date;
  grade: string | null;
  room?: string | null;
};

function artUrl(u: unknown) {
  if (typeof u !== "string") return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u.slice(0, 2000);
  if (u.startsWith("/films/") || u.startsWith("/refs/") || u.startsWith("/ui/")) return u.slice(0, 500);
  if (u.startsWith("data:image/") && u.length < 480000) return u;
  return "";
}

function parseRoom(raw: unknown): HungRoom | null | undefined {
  if (raw == null || raw === "") return undefined;
  try {
    const v = typeof raw === "string" ? (JSON.parse(raw) as HungRoom) : (raw as HungRoom);
    return packRoom(v);
  } catch {
    return undefined;
  }
}

function parsePlaylist(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.map(artUrl).filter(Boolean).slice(0, 24);
  } catch {
    return [];
  }
}

function toHung(row: Row): HungArtifact | null {
  const playlist = parsePlaylist(row.playlist);
  const still = artUrl(row.still) || playlist[0] || "";
  if (!still && !playlist.length) return null;
  const hungAt =
    typeof row.hung_at === "string" ? Date.parse(row.hung_at) || Date.now() : row.hung_at.getTime();
  return {
    id: row.id,
    name: String(row.name).slice(0, 42),
    still,
    playlist: playlist.length ? playlist : still ? [still] : [],
    prompt: String(row.prompt ?? "").slice(0, 80),
    hungAt,
    grade: null,
    room: parseRoom(row.room),
  };
}

function safeId(id: string) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
}

function ownerKey(userId: string) {
  return String(userId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

async function disk(userId: string) {
  const owner = ownerKey(userId);
  if (!owner) return null;
  const [{ mkdir, readdir, readFile, writeFile }, path] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
  ]);
  const dir = path.join(process.cwd(), "data", "artifacts", owner);
  await mkdir(dir, { recursive: true });
  return {
    file: (id: string) => path.join(dir, `${safeId(id)}.json`),
    dir,
    mkdir,
    readdir,
    readFile,
    writeFile,
  };
}

async function writeArtFile(userId: string, a: HungArtifact) {
  const id = safeId(a.id);
  if (!id) return;
  try {
    const io = await disk(userId);
    if (!io) return;
    await io.writeFile(io.file(id), JSON.stringify(a), "utf8");
  } catch {
    /* */
  }
}

async function readArtFiles(userId: string): Promise<HungArtifact[]> {
  try {
    const io = await disk(userId);
    if (!io) return [];
    const names = await io.readdir(io.dir);
    const rows: HungArtifact[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const raw = await io.readFile(`${io.dir}/${name}`, "utf8");
        const a = JSON.parse(raw) as HungArtifact;
        if (a?.id && (a.still || a.playlist?.length)) rows.push(a);
      } catch {
        /* */
      }
    }
    return rows.sort((a, b) => (b.hungAt || 0) - (a.hungAt || 0));
  } catch {
    return [];
  }
}

function mergeArts(rows: HungArtifact[]): HungArtifact[] {
  const byId = new Map<string, HungArtifact>();
  for (const a of rows) {
    if (!a?.id) continue;
    const prev = byId.get(a.id);
    if (!prev || (a.hungAt || 0) >= (prev.hungAt || 0)) byId.set(a.id, a);
  }
  return [...byId.values()].sort((a, b) => (b.hungAt || 0) - (a.hungAt || 0)).slice(0, 24);
}

async function listOwned(userId: string): Promise<HungArtifact[]> {
  const files = await readArtFiles(userId);
  try {
    const sql = await getSql();
    const rows = await sql<Row>`
      select id, name, still, playlist, prompt, hung_at, grade, room
      from artifacts
      where user_id = ${userId}
      order by hung_at desc
      limit 24
    `;
    return mergeArts([...rows.map(toHung).filter((a): a is HungArtifact => Boolean(a)), ...files]);
  } catch {
    return mergeArts(files);
  }
}

export const listHall = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<HungArtifact[]> => listOwned(context.userId));

export const hangHall = createServerFn({ method: "POST" })
  .validator((input: { id: string; name: string; still: string; playlist: string[]; prompt: string; room?: HungRoom | null }) => {
    const playlist = (input.playlist ?? []).map(artUrl).filter(Boolean).slice(0, 24);
    const still = artUrl(input.still) || playlist[0] || "";
    const room = input.room === undefined ? undefined : packRoom(input.room);
    return {
      id: safeId(input.id),
      name: String(input.name ?? "Artifact").slice(0, 42),
      still,
      playlist: playlist.length ? playlist : still ? [still] : [],
      prompt: String(input.prompt ?? "").slice(0, 80),
      room,
    };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<HungArtifact[]> => {
    if (!data.id || (!data.still && !data.playlist.length)) return listOwned(context.userId);
    const hung: HungArtifact = {
      id: data.id,
      name: data.name,
      still: data.still,
      playlist: data.playlist,
      prompt: data.prompt,
      hungAt: Date.now(),
      grade: null,
      room: data.room === undefined ? undefined : data.room,
    };
    const roomBlob = data.room === undefined ? undefined : data.room ? JSON.stringify(data.room) : null;
    try {
      const sql = await getSql();
      const blob = JSON.stringify(data.playlist);
      if (roomBlob === undefined) {
        await sql`
          insert into artifacts (user_id, id, name, still, playlist, prompt, hung_at)
          values (${context.userId}, ${data.id}, ${data.name}, ${data.still}, ${blob}, ${data.prompt}, now())
          on conflict (user_id, id) do update set
            name = excluded.name,
            still = excluded.still,
            playlist = excluded.playlist,
            prompt = excluded.prompt,
            hung_at = now()
        `;
      } else {
        await sql`
          insert into artifacts (user_id, id, name, still, playlist, prompt, hung_at, room)
          values (${context.userId}, ${data.id}, ${data.name}, ${data.still}, ${blob}, ${data.prompt}, now(), ${roomBlob})
          on conflict (user_id, id) do update set
            name = excluded.name,
            still = excluded.still,
            playlist = excluded.playlist,
            prompt = excluded.prompt,
            hung_at = now(),
            room = excluded.room
        `;
      }
    } catch {
      /* preview disk / ram still hold */
    }
    const live = hung.room !== undefined ? hung : { ...hung, room: (await readArtFiles(context.userId)).find((a) => a.id === hung.id)?.room };
    await writeArtFile(context.userId, live);
    return listOwned(context.userId);
  });
