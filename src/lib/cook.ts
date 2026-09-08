import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServerFn } from "@tanstack/react-start";
import { type BiomeId, ACTS } from "@/game/cook";
import { playableClipSrc } from "@/game/play-clip";
import { clipImaginePrompt, runeFilmVariants, runeStillJobs } from "@/game/imagine-payload";
import { applyImagineAvoid, assembleCookPlate, fewShotRefs, isSprintGrammarPrompt, lintPrompt } from "@/game/pcg-prompt";
import { CAM_LOCK, citadelPrompt, dropTaintedBolt } from "@/game/rune";
import { bindCookSlot, classifyImagineRaw, emptyCookSlot, freeCookSlot, releaseCookSlot, slotStatus, sweepStale, takeCookSlot, type CookSlot } from "@/lib/cook-slot";
import { imagineVideoOverCap, readImaginePoll } from "@/lib/cook-progress";

const exec = promisify(execFile);
const API = "https://api.x.ai/v1";
let slot: CookSlot = emptyCookSlot();
const stillCache = new Map<string, string>();

type StartOk = { ok: true; requestId: string };
type StartErr = { ok: false; error: string; reason?: string; ageMs?: number; stock?: string };
function clipStillErr(raw: string): string {
  return classifyImagineRaw(raw) ?? (raw.replace(/[{}"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 42) || "rejected");
}

function takeOrBlock(): StartErr | null {
  const now = Date.now();
  const next = takeCookSlot(slot, now);
  slot = next.slot;
  if (next.error) return { ok: false, error: next.error, reason: next.error, ageMs: next.ageMs };
  return null;
}

function dropSlot() {
  slot = releaseCookSlot(slot);
}
type PollOk = { ok: true; status: "pending" | "done" | "failed"; url?: string; pct?: number; frame?: string };
type PollErr = { ok: false; error: string };

function keepStore(name: string) {
  return { filename: name, public_url: true as const };
}

type FileOut = { public_url?: string };
function lastingUrl(body: Record<string, unknown>): string {
  const video = body.video as { url?: string; file_output?: FileOut } | undefined;
  const data = body.data as { url?: string; file_output?: FileOut } | { url?: string; file_output?: FileOut }[] | undefined;
  const first = Array.isArray(data) ? data[0] : data;
  const out =
    video?.file_output?.public_url ||
    first?.file_output?.public_url ||
    (typeof body.public_url === "string" ? body.public_url : "") ||
    video?.url ||
    first?.url ||
    (typeof body.url === "string" ? body.url : "");
  return typeof out === "string" ? out : "";
}

function auth() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  try {
    const r = await fetch(url);
    if (!r.ok) return url;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 8_000_000) return url;
    const mime = (r.headers.get("content-type") || "image/jpeg").split(";")[0] || "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return url;
  }
}

function stillDataUrl(file: string) {
  const hit = stillCache.get(file);
  if (hit) return hit;
  const name =
    file.includes("forest") ? "cook-id-forest.jpg"
    : file.includes("canyon") ? "cook-id-canyon.jpg"
    : file.includes("city") ? "cook-id-city.jpg"
    : file.includes("ocean") ? "cook-id-ocean.jpg"
    : file.includes("dune") ? "cook-id-dune.jpg"
    : file.includes("ruin") ? "cook-id-ruin.jpg"
    : file.includes("ember") ? "cook-id-ember.jpg"
    : file.includes("peak") ? "cook-id-peak.jpg"
    : file.includes("rome") ? "cook-id-rome.jpg"
    : file.includes("greece") ? "cook-id-greece.jpg"
    : file.includes("persia") ? "cook-id-persia.jpg"
    : file.includes("egypt") ? "cook-id-egypt.jpg"
    : file.includes("babylon") ? "cook-id-babylon.jpg"
    : file.includes("seed") || file.includes("open") ? "cook-id-seed.jpg"
    : "cook-id-asteroid.jpg";
  const buf = readFileSync(join(process.cwd(), "public/films", name));
  const url = `data:image/jpeg;base64,${buf.toString("base64")}`;
  stillCache.set(file, url);
  return url;
}

async function frameFromPrev(url: string): Promise<string | null> {
  if (!/^https?:\/\//.test(url)) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000) return null;
    const dir = mkdtempSync(join(tmpdir(), "cook-"));
    const mp4 = join(dir, "in.mp4");
    const jpg = join(dir, "out.jpg");
    writeFileSync(mp4, buf);
    try {
      await exec(
        "/usr/local/bin/ffmpeg",
        ["-y", "-sseof", "-0.2", "-i", mp4, "-frames:v", "1", "-vf", "scale=1080:-2", "-q:v", "2", jpg],
        { timeout: 22000 },
      );
      const out = readFileSync(jpg);
      if (out.length < 400) return null;
      return `data:image/jpeg;base64,${out.toString("base64")}`;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    return null;
  }
}

export const cookStatus = createServerFn({ method: "GET" }).handler(async () => {
  const now = Date.now();
  slot = sweepStale(slot, now);
  const st = slotStatus(slot, now);
  return {
    hasKey: Boolean(process.env.XAI_API_KEY),
    busy: st.busy,
    reason: st.reason,
    ageMs: st.ageMs,
    hasJob: st.hasJob,
    stale: st.stale,
  };
});

export const startRuneStill = createServerFn({ method: "POST" })
  .validator((input: { prompt: string; refs?: string[]; ratio?: "9:16" | "1:1"; edit?: boolean; editOnly?: boolean; res?: "720" | "1080" }) => input)
  .handler(async ({ data }): Promise<{ ok: true; url: string } | StartErr> => {
    const headers = auth();
    if (!headers) return { ok: false, error: "echo-off" };
    const prompt = clipImaginePrompt(data.prompt.trim());
    if (!prompt) return { ok: false, error: "empty" };
    const refs = dropTaintedBolt(data.refs ?? [])
      .slice(0, 5)
      .map(resolveRuneStill)
      .filter((u) => u && !u.startsWith("blob:"));
    const ratio = data.ratio === "1:1" ? "1:1" : "9:16";
    const resolution = data.res === "1080" ? "2k" : "1k";
    const pics = refs.map((url) => ({ url }));
    const jobs = runeStillJobs({
      prompt,
      pics,
      edit: data.edit,
      editOnly: data.editOnly,
      ratio,
      resolution,
      store: keepStore(`bolt-${Date.now().toString(36)}.jpg`),
    });
    try {
      let last = "";
      for (const job of jobs) {
        const body = { ...job.body };
        for (const k of Object.keys(body)) {
          if (body[k] === undefined) delete body[k];
        }
        const ctrl = new AbortController();
        const kill = setTimeout(() => ctrl.abort(), 48000);
        try {
          const res = await fetch(`${API}${job.path}`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: ctrl.signal,
          });
          const raw = await res.text();
          last = raw;
          if (!res.ok) continue;
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          const url = lastingUrl(parsed);
          if (url) return { ok: true, url };
        } finally {
          clearTimeout(kill);
        }
      }
      const clip = clipStillErr(last);
      return { ok: false, error: clip === "rejected" ? "rejected" : clip };
    } catch {
      return { ok: false, error: "net" };
    }
  });

export const startCookStill = createServerFn({ method: "POST" })
  .validator((input: { world: string; kind?: "sprint" | "citadel" }) => input)
  .handler(async ({ data }): Promise<{ ok: true; url: string } | StartErr> => {
    const world = data.world.trim().slice(0, 140);
    if (!world) return { ok: false, error: "empty" };
    const cooked = data.kind === "citadel" ? null : assembleCookPlate({ biome: "open", playerVoice: world, tap: "walk-A" });
    if (cooked && !cooked.lint.ok) {
      return { ok: true, url: cooked.stock.still };
    }
    const headers = auth();
    if (!headers) return { ok: false, error: "echo-off" };
    const prompt = data.kind === "citadel" ? citadelPrompt(world) : cooked!.prompt;
    const stillBody: Record<string, unknown> = {
      model: "grok-imagine-image-2.0",
      prompt,
      n: 1,
      aspect_ratio: "9:16",
      storage_options: keepStore(`bolt-${Date.now().toString(36)}.jpg`),
    };
    if (cooked) applyImagineAvoid(stillBody, cooked.avoid);
    try {
      const res = await fetch(`${API}/images/generations`, {
        method: "POST",
        headers,
        body: JSON.stringify(stillBody),
        signal: AbortSignal.timeout(38000),
      });
      const raw = await res.text();
      if (!res.ok) {
        const clip = raw.replace(/\s+/g, " ").slice(0, 140);
        return { ok: false, error: `still ${res.status}${clip ? ` ${clip}` : ""}` };
      }
      const body = JSON.parse(raw) as Record<string, unknown>;
      const url = lastingUrl(body);
      if (!url) return { ok: false, error: "no-still" };
      const local = await stashStill(url);
      return { ok: true, url: local };
    } catch {
      return { ok: false, error: "net" };
    }
  });

export const startCookPlate = createServerFn({ method: "POST" })
  .validator((input: {
    biome: BiomeId;
    prompt: string;
    act: number;
    still: string;
    prevUrl?: string;
    world?: string;
    stillUrl?: string;
    destStill?: string;
    seed?: string;
    duration?: 6 | 10 | 15;
    res?: "720" | "1080";
    runSeed?: string;
    i?: number;
    momentum?: number;
    miss?: boolean;
    idle?: boolean;
  }) => input)
  .handler(async ({ data }): Promise<StartOk | StartErr> => {
    const actI = Math.max(0, Math.min(ACTS.length - 1, data.act | 0));
    const act = ACTS[actI];
    const cellI = Number.isFinite(Number(data.i)) ? Math.max(0, data.i | 0) : actI;
    const cooked = assembleCookPlate({
      biome: data.biome,
      playerVoice: data.prompt || data.world,
      world: data.world,
      cookAct: act,
      still: data.stillUrl || data.still,
      destStill: data.destStill,
      seed: data.seed,
      runSeed: data.runSeed,
      i: cellI,
      momentum: data.momentum,
      miss: data.miss,
      idle: data.idle,
    });
    const lint = cooked.lint.ok ? lintPrompt(cooked.prompt, cooked.slots) : cooked.lint;
    if (!lint.ok) {
      return { ok: false, error: "lint-stock", reason: lint.issue, stock: cooked.stock.clip };
    }
    if (cooked.wfc?.stock) {
      return { ok: false, error: "lint-stock", reason: "wfc-stock", stock: cooked.stock.clip };
    }
    const headers = auth();
    if (!headers) return { ok: false, error: "echo-off" };
    const blocked = takeOrBlock();
    if (blocked) return blocked;
    const chained = data.prevUrl ? await frameFromPrev(data.prevUrl) : null;
    const refs = fewShotRefs({
      ...cooked.slots,
      still: chained || cooked.slots.still,
    });
    const customImg = data.stillUrl && !/\/films\/cook-/.test(data.stillUrl) ? data.stillUrl : "";
    const imageUrl =
      chained ||
      refs[0] ||
      customImg ||
      (data.world ? "" : data.still && !/\/films\/cook-/.test(data.still) ? stillDataUrl(data.still) : "");
    const duration = data.duration === 6 || data.duration === 15 ? data.duration : 10;
    const resolution = data.res === "1080" ? "1080p" : "720p";
    try {
      const payload: Record<string, unknown> = {
        model: "grok-imagine-video-1.5",
        prompt: cooked.prompt,
        duration,
        aspect_ratio: "9:16",
        resolution,
        storage_options: keepStore(`bolt-${Date.now().toString(36)}.mp4`),
      };
      applyImagineAvoid(payload, cooked.avoid);
      if (imageUrl) payload.image = { url: imageUrl };
      const res = await fetch(`${API}/videos/generations`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(45000),
      });
      const raw = await res.text();
      if (!res.ok) {
        dropSlot();
        const clip = raw.replace(/\s+/g, " ").slice(0, 140);
        return { ok: false, error: clipStillErr(clip) === "capacity" ? "capacity" : `imagine ${res.status}${clip ? ` ${clip}` : ""}` };
      }
      const body = JSON.parse(raw) as { request_id?: string; id?: string };
      const requestId = body.request_id || body.id;
      if (!requestId) {
        dropSlot();
        return { ok: false, error: "no-id" };
      }
      slot = bindCookSlot(slot, requestId);
      return { ok: true, requestId };
    } catch {
      dropSlot();
      return { ok: false, error: "net" };
    }
  });

export const startRuneFilm = createServerFn({ method: "POST" })
  .validator((input: { still: string; prompt: string; duration: 6 | 10 | 15; refs?: string[]; res?: "720" | "1080" }) => input)
  .handler(async ({ data }): Promise<StartOk | StartErr> => {
    const headers = auth();
    if (!headers) return { ok: false, error: "echo-off" };
    const rawPrompt = data.prompt.trim();
    if (isSprintGrammarPrompt(rawPrompt)) {
      const lint = lintPrompt(rawPrompt);
      if (!lint.ok) return { ok: false, error: "lint-stock", reason: lint.issue, stock: assembleCookPlate({ biome: "asteroid" }).stock.clip };
    }
    const blocked = takeOrBlock();
    if (blocked) return blocked;
    const imageUrl = resolveRuneStill(data.still);
    const duration = data.duration === 6 || data.duration === 15 ? data.duration : 10;
    const already = /STATIC CCTV|LOCKED-OFF|CAMERA LOCK|PORTAL CROSS|WIDE LOCKED CCTV|LOCKED CCTV|LEGAL SHOT ONLY|REJECT LIST/i.test(rawPrompt);
    const prompt = clipImaginePrompt(already ? rawPrompt : `${CAM_LOCK} ${rawPrompt}`);
    const resolution = data.res === "1080" ? "1080p" : "720p";
    const store = keepStore(`bolt-${Date.now().toString(36)}.mp4`);
    const variants = runeFilmVariants({ prompt, imageUrl, duration, resolution, store });
    try {
      let last = "";
      for (const body of variants) {
        const res = await fetch(`${API}/videos/generations`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45000),
        });
        const raw = await res.text();
        last = raw;
        if (!res.ok) continue;
        const parsed = JSON.parse(raw) as { request_id?: string; id?: string };
        const requestId = parsed.request_id || parsed.id;
        if (requestId) {
          slot = bindCookSlot(slot, requestId);
          return { ok: true, requestId };
        }
      }
      dropSlot();
      return { ok: false, error: clipStillErr(last) };
    } catch {
      dropSlot();
      return { ok: false, error: "net" };
    }
  });

async function probeVideoBytes(url: string, authz: string): Promise<number | null> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { Authorization: authz },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    const len = Number(res.headers.get("content-length") || 0);
    return Number.isFinite(len) && len > 0 ? len : null;
  } catch {
    return null;
  }
}

export const startRuneExtend = createServerFn({ method: "POST" })
  .validator((input: { video: string; prompt: string; duration: 6 | 10 | 15 }) => input)
  .handler(async ({ data }): Promise<StartOk | StartErr> => {
    const headers = auth();
    if (!headers) return { ok: false, error: "echo-off" };
    const video = String(data.video || "").slice(0, 2000);
    if (!/^https:\/\//i.test(video)) return { ok: false, error: "no-extend" };
    if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(video)) return { ok: false, error: "no-extend" };
    const bytes = await probeVideoBytes(video, headers.Authorization);
    if (imagineVideoOverCap(bytes)) return { ok: false, error: "clip-too-large" };
    const rawPrompt = data.prompt.trim();
    if (isSprintGrammarPrompt(rawPrompt)) {
      const lint = lintPrompt(rawPrompt);
      if (!lint.ok) return { ok: false, error: "lint-stock", reason: lint.issue, stock: assembleCookPlate({ biome: "asteroid" }).stock.clip };
    }
    const blocked = takeOrBlock();
    if (blocked) return blocked;
    const duration = data.duration === 10 ? 10 : 6;
    const already = /STATIC CCTV|LOCKED-OFF|CAMERA LOCK|PORTAL CROSS|WIDE LOCKED CCTV|LOCKED CCTV|LEGAL SHOT ONLY|REJECT LIST/i.test(rawPrompt);
    const prompt = clipImaginePrompt(already ? rawPrompt : `${CAM_LOCK} ${rawPrompt}`);
    const variants: Record<string, unknown>[] = [
      {
        model: "grok-imagine-video-1.5",
        prompt,
        duration,
        video: { url: video },
        storage_options: keepStore(`bolt-${Date.now().toString(36)}.mp4`),
      },
      {
        model: "grok-imagine-video-1.5",
        prompt,
        duration,
        video: { url: video },
      },
      {
        model: "grok-imagine-video",
        prompt,
        duration,
        video: { url: video },
      },
    ];
    try {
      let last = "";
      for (const body of variants) {
        const res = await fetch(`${API}/videos/extensions`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45000),
        });
        const raw = await res.text();
        last = raw;
        if (!res.ok) continue;
        const parsed = JSON.parse(raw) as { request_id?: string; id?: string };
        const requestId = parsed.request_id || parsed.id;
        if (requestId) {
          slot = bindCookSlot(slot, requestId);
          return { ok: true, requestId };
        }
      }
      dropSlot();
      return { ok: false, error: clipStillErr(last) };
    } catch {
      dropSlot();
      return { ok: false, error: "net" };
    }
  });

function resolveRuneStill(still: string) {
  if (still.startsWith("data:") || still.startsWith("http://") || still.startsWith("https://")) return still;
  const rel = still.replace(/^\//, "");
  try {
    const buf = readFileSync(join(process.cwd(), "public", rel));
    const mime = rel.endsWith(".png") ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return still;
  }
}

function durableMedia(url: string) {
  if (!url) return "";
  if (url.startsWith("/films/") || url.startsWith("/refs/") || url.startsWith("/ui/") || url.startsWith("data:")) return url;
  if (/^https?:\/\//i.test(url)) return url.slice(0, 2000);
  return url;
}

async function stashStill(url: string): Promise<string> {
  return durableMedia(url);
}

export const cacheStill = createServerFn({ method: "POST" })
  .validator((input: { url: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true; url: string } | { ok: false; error: string }> => {
    const url = String(data.url || "").slice(0, 2000);
    if (!url) return { ok: false, error: "no-url" };
    return { ok: true, url: await stashStill(url) };
  });

async function stashClip(url: string): Promise<string> {
  const raw = durableMedia(url);
  return playableClipSrc(raw) || raw;
}

export const cacheClip = createServerFn({ method: "POST" })
  .validator((input: { url: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true; url: string } | { ok: false; error: string }> => {
    const url = String(data.url || "").slice(0, 2000);
    if (!url) return { ok: false, error: "no-url" };
    return { ok: true, url: await stashClip(url) };
  });

export const pollCookPlate = createServerFn({ method: "POST" })
  .validator((input: { requestId: string }) => input)
  .handler(async ({ data }): Promise<PollOk | PollErr> => {
    const headers = auth();
    if (!headers) return { ok: false, error: "echo-off" };
    const id = data.requestId?.slice(0, 128);
    if (!id) return { ok: false, error: "no-id" };
    try {
      const paths = [`${API}/videos/${id}`, `${API}/videos/generations/${id}`];
      let body: Record<string, unknown> | null = null;
      let lastErr = "";
      for (const path of paths) {
        const res = await fetch(path, { headers });
        if (!res.ok) {
          lastErr = `poll ${res.status}`;
          continue;
        }
        body = (await res.json()) as Record<string, unknown>;
        break;
      }
      if (!body) {
        if (/404|410/.test(lastErr)) dropSlot();
        return { ok: false, error: lastErr || "poll" };
      }
      const poll = readImaginePoll(body);
      const url = lastingUrl(body);
      if (poll.status === "done" || url) {
        dropSlot();
        if (!url) return { ok: false, error: "no-url" };
        const local = await stashClip(url);
        return { ok: true, status: "done", url: local, pct: 100 };
      }
      if (poll.status === "failed") {
        dropSlot();
        return { ok: true, status: "failed", url: undefined, pct: 0, frame: poll.frame };
      }
      return { ok: true, status: "pending", pct: poll.pct, frame: poll.frame };
    } catch {
      return { ok: false, error: "net" };
    }
  });

export const freeRuneSlot = createServerFn({ method: "POST" })
  .validator(() => ({}))
  .handler(async () => {
    slot = freeCookSlot();
    return { ok: true as const, reason: "idle" as const };
  });

export const grabRuneFrame = createServerFn({ method: "POST" })
  .validator((input: { url: string; at?: "start" | "end"; res?: "720" | "1080" }) => input)
  .handler(async ({ data }): Promise<{ ok: true; url: string } | StartErr> => {
    const src = data.url;
    const local = src.startsWith("/films/") || src.startsWith("/refs/");
    if (!src || (!/^https?:\/\//.test(src) && !src.startsWith("data:") && !local)) return { ok: false, error: "bad-url" };
    const dir = mkdtempSync(join(tmpdir(), "rune-"));
    const mp4 = join(dir, "in.mp4");
    const jpg = join(dir, "out.jpg");
    try {
      if (src.startsWith("data:")) {
        const comma = src.indexOf(",");
        if (comma < 0) return { ok: false, error: "bad-data" };
        writeFileSync(mp4, Buffer.from(src.slice(comma + 1), "base64"));
      } else if (local) {
        const rel = src.replace(/^\//, "");
        writeFileSync(mp4, readFileSync(join(process.cwd(), "public", rel)));
      } else {
        const res = await fetch(src, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) return { ok: false, error: `fetch ${res.status}` };
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 2000) return { ok: false, error: "tiny" };
        writeFileSync(mp4, buf);
      }
      const seek = data.at === "end" ? ["-sseof", "-0.12"] : ["-ss", "0.35"];
      const wide = data.res === "720" ? "720" : "1080";
      await exec(
        "/usr/local/bin/ffmpeg",
        ["-y", ...seek, "-i", mp4, "-frames:v", "1", "-vf", `scale=${wide}:-2`, "-q:v", "2", jpg],
        { timeout: 25000 },
      );
      const out = readFileSync(jpg);
      if (out.length < 400) return { ok: false, error: "empty" };
      return { ok: true, url: `data:image/jpeg;base64,${out.toString("base64")}` };
    } catch {
      return { ok: false, error: "ffmpeg" };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
