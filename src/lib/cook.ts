import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServerFn } from "@tanstack/react-start";
import { platePrompt, stillPrompt, type BiomeId, ACTS } from "@/game/cook";
import { CAM_LOCK, citadelPrompt } from "@/game/rune";

const exec = promisify(execFile);
const API = "https://api.x.ai/v1";
const MIN_GAP_MS = 8_000;
const STALE_MS = 90_000;

let lastStart = 0;
let inflight = 0;
const stillCache = new Map<string, string>();

type StartOk = { ok: true; requestId: string };
type StartErr = { ok: false; error: string };
function clipStillErr(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes("overload") || t.includes("unavailable") || t.includes("429") || t.includes("capacity") || t.includes("rate limit")) return "busy";
  if (t.includes("timeout") || t.includes("abort")) return "timeout";
  if (t.includes("echo-off") || t.includes("unauthorized") || t.includes("401")) return "echo-off";
  return raw.replace(/[{}"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 42) || "rejected";
}
type PollOk = { ok: true; status: "pending" | "done" | "failed"; url?: string; pct?: number; frame?: string };
type PollErr = { ok: false; error: string };

function readPct(body: Record<string, unknown>): number | undefined {
  const nested = body.progress;
  const bag = nested && typeof nested === "object" ? (nested as Record<string, unknown>) : body;
  for (const k of ["progress", "progress_pct", "percent", "percentage", "progress_percent", "completion", "ratio"]) {
    const v = bag[k] ?? body[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      const n = v <= 1 ? v * 100 : v;
      return Math.max(0, Math.min(99, Math.round(n)));
    }
    if (typeof v === "string" && /^\d+(\.\d+)?%?$/.test(v.trim())) {
      return Math.max(0, Math.min(99, Math.round(parseFloat(v))));
    }
  }
  const cur = Number(body.current_frame ?? body.frame ?? body.frames_done);
  const tot = Number(body.total_frames ?? body.frames);
  if (Number.isFinite(cur) && Number.isFinite(tot) && tot > 0) {
    return Math.max(0, Math.min(99, Math.round((cur / tot) * 100)));
  }
  return undefined;
}

function readFrame(body: Record<string, unknown>): string | undefined {
  const cur = body.current_frame ?? body.frame ?? body.frames_done;
  const tot = body.total_frames ?? body.frames;
  if (cur != null && tot != null) return `${cur} / ${tot}`;
  if (cur != null) return String(cur);
  return undefined;
}

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
  return {
    hasKey: Boolean(process.env.XAI_API_KEY),
    busy: inflight > 0,
  };
});

export const startRuneStill = createServerFn({ method: "POST" })
  .validator((input: { prompt: string; refs?: string[]; ratio?: "9:16" | "1:1"; edit?: boolean; editOnly?: boolean; res?: "720" | "1080" }) => input)
  .handler(async ({ data }): Promise<{ ok: true; url: string } | StartErr> => {
    const headers = auth();
    if (!headers) return { ok: false, error: "echo-off" };
    const prompt = data.prompt.trim().slice(0, 2200);
    if (!prompt) return { ok: false, error: "empty" };
    const refs = (data.refs ?? []).slice(0, 5).map(resolveRuneStill).filter((u) => u && !u.startsWith("blob:"));
    const ratio = data.ratio === "1:1" ? "1:1" : "9:16";
    const resolution = data.res === "1080" ? "2k" : "1k";
    const pics = refs.map((url) => ({ url }));
    const jobs: { path: string; body: Record<string, unknown> }[] = [];
    const model = "grok-imagine-image-2.0";
    if (data.edit && pics[0]) {
      jobs.push({
        path: "/images/edits",
        body: { model, prompt, aspect_ratio: ratio, resolution, image: pics[0], storage_options: keepStore(`bolt-${Date.now().toString(36)}.jpg`) },
      });
      if (!data.editOnly) {
        jobs.push({
          path: "/images/generations",
          body: { model, prompt, n: 1, aspect_ratio: ratio, resolution, images: [pics[0]], storage_options: keepStore(`bolt-${Date.now().toString(36)}.jpg`) },
        });
      }
    } else if (pics.length) {
      jobs.push({
        path: "/images/generations",
        body: { model, prompt, n: 1, aspect_ratio: ratio, resolution, images: pics, storage_options: keepStore(`bolt-${Date.now().toString(36)}.jpg`) },
      });
    } else {
      jobs.push({
        path: "/images/generations",
        body: { model, prompt, n: 1, aspect_ratio: ratio, resolution, storage_options: keepStore(`bolt-${Date.now().toString(36)}.jpg`) },
      });
    }
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
    const headers = auth();
    if (!headers) return { ok: false, error: "echo-off" };
    const world = data.world.trim().slice(0, 140);
    if (!world) return { ok: false, error: "empty" };
    try {
      const res = await fetch(`${API}/images/generations`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "grok-imagine-image-2.0",
          prompt: data.kind === "citadel" ? citadelPrompt(world) : stillPrompt(world),
          n: 1,
          aspect_ratio: "9:16",
          storage_options: keepStore(`bolt-${Date.now().toString(36)}.jpg`),
        }),
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
    duration?: 6 | 10 | 15;
    res?: "720" | "1080";
  }) => input)
  .handler(async ({ data }): Promise<StartOk | StartErr> => {
    const headers = auth();
    if (!headers) return { ok: false, error: "echo-off" };
    const now = Date.now();
    if (inflight > 0 && now - lastStart > STALE_MS) inflight = 0;
    if (inflight > 0) return { ok: false, error: "busy" };
    if (now - lastStart < MIN_GAP_MS) return { ok: false, error: "cooldown" };
    const act = ACTS[Math.max(0, Math.min(ACTS.length - 1, data.act | 0))];
    inflight += 1;
    lastStart = now;
    const chained = data.prevUrl ? await frameFromPrev(data.prevUrl) : null;
    const customImg = data.stillUrl && !/\/films\/cook-/.test(data.stillUrl) ? data.stillUrl : "";
    const imageUrl =
      chained ||
      customImg ||
      (data.world ? "" : data.still && !/\/films\/cook-/.test(data.still) ? stillDataUrl(data.still) : "");
    const duration = data.duration === 6 || data.duration === 15 ? data.duration : 10;
    const resolution = data.res === "1080" ? "1080p" : "720p";
    try {
      const payload: Record<string, unknown> = {
        model: "grok-imagine-video-1.5",
        prompt: platePrompt(data.biome, data.prompt, act, data.world, duration),
        duration,
        aspect_ratio: "9:16",
        resolution,
        storage_options: keepStore(`bolt-${Date.now().toString(36)}.mp4`),
      };
      if (imageUrl) payload.image = { url: imageUrl };
      const res = await fetch(`${API}/videos/generations`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(45000),
      });
      const raw = await res.text();
      if (!res.ok) {
        inflight = Math.max(0, inflight - 1);
        const clip = raw.replace(/\s+/g, " ").slice(0, 140);
        return { ok: false, error: `imagine ${res.status}${clip ? ` ${clip}` : ""}` };
      }
      const body = JSON.parse(raw) as { request_id?: string; id?: string };
      const requestId = body.request_id || body.id;
      if (!requestId) {
        inflight = Math.max(0, inflight - 1);
        return { ok: false, error: "no-id" };
      }
      return { ok: true, requestId };
    } catch {
      inflight = Math.max(0, inflight - 1);
      return { ok: false, error: "net" };
    }
  });

export const startRuneFilm = createServerFn({ method: "POST" })
  .validator((input: { still: string; prompt: string; duration: 6 | 10 | 15; refs?: string[]; res?: "720" | "1080" }) => input)
  .handler(async ({ data }): Promise<StartOk | StartErr> => {
    const headers = auth();
    if (!headers) return { ok: false, error: "echo-off" };
    const now = Date.now();
    if (inflight > 0 && now - lastStart > STALE_MS) inflight = 0;
    if (inflight > 0) return { ok: false, error: "busy" };
    if (now - lastStart < MIN_GAP_MS) return { ok: false, error: "cooldown" };
    inflight += 1;
    lastStart = now;
    const imageUrl = resolveRuneStill(data.still);
    const duration = data.duration === 6 || data.duration === 15 ? data.duration : 10;
    const refs = (data.refs ?? [])
      .slice(0, 5)
      .map(resolveRuneStill)
      .filter((u) => u && u !== imageUrl && !u.startsWith("blob:") && !(u.startsWith("data:") && u.length > 350_000));
    const rawPrompt = data.prompt.trim();
    const already = /STATIC CCTV|LOCKED-OFF|CAMERA LOCK|PORTAL CROSS|WIDE LOCKED CCTV|LOCKED CCTV/i.test(rawPrompt);
    const prompt = (already ? rawPrompt : `${CAM_LOCK} ${rawPrompt}`).slice(0, 2200);
    const resolution = data.res === "1080" ? "1080p" : "720p";
    const store = keepStore(`bolt-${Date.now().toString(36)}.mp4`);
    function plate(res?: string, withRefs = false) {
      const body: Record<string, unknown> = {
        model: "grok-imagine-video-1.5",
        prompt,
        image: { url: imageUrl },
        duration,
        aspect_ratio: "9:16",
        storage_options: store,
      };
      if (res) body.resolution = res;
      if (withRefs && refs.length) body.reference_images = refs.map((url) => ({ url }));
      return body;
    }
    const variants: Record<string, unknown>[] = [plate(resolution, false)];
    if (refs.length) variants.push(plate(resolution, true));
    if (resolution === "1080p") variants.push(plate("720p", false));
    variants.push(plate(undefined, false));
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
        if (requestId) return { ok: true, requestId };
      }
      inflight = Math.max(0, inflight - 1);
      return { ok: false, error: clipStillErr(last) };
    } catch {
      inflight = Math.max(0, inflight - 1);
      return { ok: false, error: "net" };
    }
  });

export const startRuneExtend = createServerFn({ method: "POST" })
  .validator((input: { video: string; prompt: string; duration: 6 | 10 | 15 }) => input)
  .handler(async ({ data }): Promise<StartOk | StartErr> => {
    const headers = auth();
    if (!headers) return { ok: false, error: "echo-off" };
    const video = String(data.video || "").slice(0, 2000);
    if (!/^https:\/\//i.test(video)) return { ok: false, error: "no-extend" };
    if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(video)) return { ok: false, error: "no-extend" };
    const now = Date.now();
    if (inflight > 0 && now - lastStart > STALE_MS) inflight = 0;
    if (inflight > 0) return { ok: false, error: "busy" };
    if (now - lastStart < MIN_GAP_MS) return { ok: false, error: "cooldown" };
    inflight += 1;
    lastStart = now;
    const duration = data.duration === 10 ? 10 : 6;
    const rawPrompt = data.prompt.trim();
    const already = /STATIC CCTV|LOCKED-OFF|CAMERA LOCK|PORTAL CROSS|WIDE LOCKED CCTV|LOCKED CCTV/i.test(rawPrompt);
    const prompt = (already ? rawPrompt : `${CAM_LOCK} ${rawPrompt}`).slice(0, 2200);
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
        if (requestId) return { ok: true, requestId };
      }
      inflight = Math.max(0, inflight - 1);
      return { ok: false, error: clipStillErr(last) };
    } catch {
      inflight = Math.max(0, inflight - 1);
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
  return durableMedia(url);
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
      if (!body) return { ok: false, error: lastErr || "poll" };
      const status = String(body.status || body.state || "pending").toLowerCase();
      const url = lastingUrl(body);
      const done =
        status === "done" ||
        status === "succeeded" ||
        status === "complete" ||
        status === "completed" ||
        status === "success" ||
        status === "ready" ||
        status === "finished";
      if (done || url) {
        inflight = Math.max(0, inflight - 1);
        if (!url) return { ok: false, error: "no-url" };
        const local = await stashClip(url);
        return { ok: true, status: "done", url: local, pct: 100 };
      }
      if (status === "failed" || status === "expired" || status === "error" || status === "cancelled") {
        inflight = Math.max(0, inflight - 1);
        const why = String(body.error || body.message || body.reason || status).slice(0, 80);
        return { ok: true, status: "failed", url: undefined, pct: 0, frame: why };
      }
      return { ok: true, status: "pending", pct: readPct(body), frame: readFrame(body) };
    } catch {
      return { ok: false, error: "net" };
    }
  });

export const freeRuneSlot = createServerFn({ method: "POST" })
  .validator(() => ({}))
  .handler(async () => {
    inflight = 0;
    return { ok: true as const };
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
        const res = await fetch(src);
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
