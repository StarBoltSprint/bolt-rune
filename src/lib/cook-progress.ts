/** Imagine poll bodies nest frame / status / progress. Never String(object). */

export type CookPollStatus = "pending" | "done" | "failed";

const JUNK = /\[object\s+object\]/i;
const DONE = new Set(["done", "succeeded", "complete", "completed", "success", "ready", "finished"]);
const FAIL = new Set(["failed", "expired", "error", "cancelled", "canceled"]);
const PCT_KEYS = ["progress", "progress_pct", "percent", "percentage", "progress_percent", "completion", "ratio"];
const CUR_KEYS = ["current_frame", "frames_done", "current", "index", "n", "i", "done", "value", "frame"];
const TOT_KEYS = ["total_frames", "total", "count", "frames"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function asFinite(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+(\.\d+)?%?$/.test(v.trim())) return parseFloat(v);
  return undefined;
}

function pickNum(v: unknown, keys: string[], depth = 0): number | undefined {
  const n = asFinite(v);
  if (n != null) return n;
  if (depth > 2 || !isRecord(v)) return undefined;
  for (const k of keys) {
    if (k in v) {
      const got = pickNum(v[k], keys, depth + 1);
      if (got != null) return got;
    }
  }
  return undefined;
}

function asLabel(v: unknown): string | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return String(Math.round(v));
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t || JUNK.test(t)) return undefined;
  if (/^(https?:|data:|blob:)/i.test(t)) return undefined;
  return t.length > 48 ? t.slice(0, 48) : t;
}

function bags(body: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [body];
  for (const k of ["progress", "status", "state", "meta", "event"]) {
    if (isRecord(body[k])) out.push(body[k]);
  }
  if (isRecord(body.frame)) out.push(body.frame);
  const prog = body.progress;
  if (isRecord(prog) && isRecord(prog.frame)) out.push(prog.frame);
  return out;
}

export function readPct(body: Record<string, unknown>): number | undefined {
  for (const bag of bags(body)) {
    for (const k of PCT_KEYS) {
      const n = asFinite(bag[k]);
      if (n == null) continue;
      const scaled = n <= 1 ? n * 100 : n;
      return Math.max(0, Math.min(99, Math.round(scaled)));
    }
  }
  for (const bag of bags(body)) {
    const cur = pickNum(bag.current_frame ?? bag.frames_done ?? bag.current ?? bag.frame, CUR_KEYS);
    const tot = pickNum(
      typeof bag.total_frames === "number" || typeof bag.total_frames === "string"
        ? bag.total_frames
        : typeof bag.total === "number" || typeof bag.total === "string"
          ? bag.total
          : typeof bag.frames === "number" || typeof bag.frames === "string"
            ? bag.frames
            : undefined,
      TOT_KEYS,
    );
    const innerTot = tot ?? (isRecord(bag.frame) ? pickNum(bag.frame, TOT_KEYS) : undefined);
    if (cur != null && innerTot != null && innerTot > 0) {
      return Math.max(0, Math.min(99, Math.round((cur / innerTot) * 100)));
    }
  }
  return undefined;
}

export function readFrame(body: Record<string, unknown>): string | undefined {
  for (const bag of bags(body)) {
    const curRaw = bag.current_frame ?? bag.frames_done ?? bag.current ?? bag.index ?? bag.n ?? bag.frame;
    const totRaw =
      typeof bag.total_frames === "number" || typeof bag.total_frames === "string"
        ? bag.total_frames
        : typeof bag.total === "number" || typeof bag.total === "string"
          ? bag.total
          : typeof bag.frames === "number" || typeof bag.frames === "string"
            ? bag.frames
            : isRecord(curRaw)
              ? curRaw.total ?? curRaw.total_frames ?? curRaw.frames ?? curRaw.count
              : undefined;
    const cur = pickNum(curRaw, CUR_KEYS);
    const tot = pickNum(totRaw, TOT_KEYS);
    if (cur != null && tot != null) return `${Math.round(cur)} / ${Math.round(tot)}`;
    if (cur != null) return String(Math.round(cur));
    const named = asLabel(bag.label) ?? asLabel(bag.stage) ?? asLabel(bag.phase);
    if (named) return named;
  }
  return undefined;
}

function statusText(raw: unknown, depth = 0): string {
  if (typeof raw === "string") return raw.toLowerCase().trim();
  if (depth > 2 || !isRecord(raw)) return "";
  for (const k of ["status", "state", "phase", "kind", "stage"]) {
    const t = statusText(raw[k], depth + 1);
    if (t) return t;
  }
  return "";
}

export function readImagineStatus(body: Record<string, unknown>): CookPollStatus {
  const text = statusText(body.status) || statusText(body.state) || statusText(body.phase) || "pending";
  if (DONE.has(text)) return "done";
  if (FAIL.has(text)) return "failed";
  return "pending";
}

export function readImagineWhy(body: Record<string, unknown>): string | undefined {
  return flattenWhy(body.error ?? body.message ?? body.reason ?? body.detail);
}

function flattenWhy(raw: unknown, depth = 0): string | undefined {
  if (typeof raw === "string") {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t || JUNK.test(t)) return undefined;
    return t.slice(0, 80);
  }
  if (depth > 2 || !isRecord(raw)) return undefined;
  for (const k of ["message", "error", "reason", "detail", "code"]) {
    const t = flattenWhy(raw[k], depth + 1);
    if (t) return t;
  }
  return undefined;
}

export function readImaginePoll(body: Record<string, unknown>): {
  status: CookPollStatus;
  pct?: number;
  frame?: string;
} {
  const status = readImagineStatus(body);
  if (status === "failed") {
    return { status, pct: 0, frame: readImagineWhy(body) };
  }
  const frame = readFrame(body);
  const pct = status === "done" ? 100 : readPct(body);
  return { status, pct, frame };
}

/** Safe FRAME overlay label. Empty when the poll field is missing or an object-string. */
export function cookFrameHint(frame: unknown): string {
  if (frame == null || frame === false) return "";
  if (typeof frame === "number" && Number.isFinite(frame)) return String(Math.round(frame));
  if (typeof frame === "string") {
    const t = frame.trim();
    if (!t || JUNK.test(t)) return "";
    if (/^(https?:|data:|blob:)/i.test(t)) return "";
    return t.length > 48 ? t.slice(0, 48) : t;
  }
  if (isRecord(frame)) return readFrame(frame) ?? "";
  return "";
}

export function cookFrameLine(frame: unknown, fallback: string): string {
  const hint = cookFrameHint(frame);
  return hint ? `frame ${hint}` : fallback;
}
