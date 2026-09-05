import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { echoPrompt, type EchoSeed } from "@/game/echo";

const API = "https://api.x.ai/v1";
const MIN_GAP_MS = 40_000;
const MAX_FRAME = 400_000;

let lastStart = 0;
let inflight = 0;
let cachedStill = "";

type StartOk = { ok: true; requestId: string };
type StartErr = { ok: false; error: string };
type PollOk = { ok: true; status: "pending" | "done" | "failed"; url?: string };
type PollErr = { ok: false; error: string };

export type EchoInput = Omit<EchoSeed, "frame"> & { frame?: string };

function keepStore(name: string) {
  return { filename: name, public_url: true as const };
}

function lastingUrl(body: {
  video?: { url?: string; file_output?: { public_url?: string } };
  url?: string;
}): string {
  return body.video?.file_output?.public_url || body.video?.url || body.url || "";
}

function auth() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

function stillDataUrl() {
  if (cachedStill) return cachedStill;
  const buf = readFileSync(join(process.cwd(), "public/films/sprint.jpg"));
  cachedStill = `data:image/jpeg;base64,${buf.toString("base64")}`;
  return cachedStill;
}

function pickFrame(frame?: string) {
  if (frame && frame.startsWith("data:image/") && frame.length <= MAX_FRAME) return frame;
  return stillDataUrl();
}

export const startEcho = createServerFn({ method: "POST" })
  .validator((input: { seed: EchoInput }) => input)
  .handler(async ({ data }): Promise<StartOk | StartErr> => {
    const headers = auth();
    if (!headers) return { ok: false, error: "echo-off" };
    const now = Date.now();
    if (inflight > 0) return { ok: false, error: "busy" };
    if (now - lastStart < MIN_GAP_MS) return { ok: false, error: "cooldown" };
    inflight += 1;
    lastStart = now;
    const imageUrl = pickFrame(data.seed?.frame);
    const seed: EchoSeed = {
      frame: imageUrl,
      path: data.seed.path,
      dusk: data.seed.dusk,
      hunter: data.seed.hunter,
      crashed: data.seed.crashed,
      grade: data.seed.grade,
    };
    try {
      const res = await fetch(`${API}/videos/generations`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "grok-imagine-video-1.5",
          prompt: echoPrompt(seed),
          image: { url: imageUrl },
          duration: 10,
          storage_options: keepStore(`bolt-${Date.now().toString(36)}.mp4`),
        }),
      });
      const raw = await res.text();
      if (!res.ok) {
        inflight = Math.max(0, inflight - 1);
        return { ok: false, error: `imagine ${res.status}` };
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

export const pollEcho = createServerFn({ method: "POST" })
  .validator((input: { requestId: string }) => input)
  .handler(async ({ data }): Promise<PollOk | PollErr> => {
    const headers = auth();
    if (!headers) return { ok: false, error: "echo-off" };
    const id = data.requestId?.slice(0, 128);
    if (!id) return { ok: false, error: "no-id" };
    try {
      const res = await fetch(`${API}/videos/${id}`, { headers });
      if (!res.ok) return { ok: false, error: `poll ${res.status}` };
      const body = (await res.json()) as {
        status?: string;
        video?: { url?: string; file_output?: { public_url?: string } };
        url?: string;
      };
      const status = (body.status || "pending").toLowerCase();
      if (status === "done" || status === "succeeded" || status === "complete") {
        inflight = Math.max(0, inflight - 1);
        const url = lastingUrl(body);
        if (!url) return { ok: false, error: "no-url" };
        return { ok: true, status: "done", url };
      }
      if (status === "failed" || status === "expired" || status === "error") {
        inflight = Math.max(0, inflight - 1);
        return { ok: true, status: "failed" };
      }
      return { ok: true, status: "pending" };
    } catch {
      return { ok: false, error: "net" };
    }
  });
