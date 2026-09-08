/**
 * Keep share recipe — graph + pin keys, never an mp4 dump.
 * Compact base64url gzip (or short host id). Visitor resolve never auto-bills.
 * No wake URLs, API keys, or SuperGrok tokens in the share.
 * Asteroid HOLD. No Pack seats.
 */

import { listChunks } from "./pcg-chunk.ts";
import type { HitClass } from "./pcg-play.ts";
import {
  RAILS_VERSION,
  clipCacheGet,
  isRunSeed,
  pcgHash,
  pinKeepFromSession,
  type KeepPinSession,
} from "./pcg-rail.ts";

export const KEEP_SHARE_V = 1 as const;

export type ShareNode = { id: string; name?: string };
export type ShareEdge = { id: string; from: string; to: string; act?: string };
export type ShareGrade = { grade: HitClass } | HitClass;

export type KeepShare = {
  v: typeof KEEP_SHARE_V;
  railsVersion: typeof RAILS_VERSION;
  runSeed: string;
  graph: { nodes: ShareNode[]; edges: ShareEdge[] };
  pins: Record<string, string>;
  transcript?: Array<{ grade: HitClass }>;
};

export type ShareResolveSource = "catalog" | "cache" | "unlit" | "ticket";

export type ShareResolve = {
  edgeId: string;
  pin: string;
  url: string;
  source: ShareResolveSource;
  imagine: false;
  bill: false;
  ticket?: "forge";
};

export type ShareExportInput = {
  runSeed?: string;
  session?: KeepPinSession & {
    seed?: string;
    pins?: Array<{ id?: string; name?: string } | null> | null;
    wish?: string;
    title?: string;
  };
  graph?: { nodes?: ShareNode[]; edges?: ShareEdge[] };
  pins?: Record<string, string>;
  transcript?: ShareGrade[];
  hung?: Array<{ still?: string; playlist?: string[] | null; id?: string }>;
};

const SECRET_KEY =
  /^(?:.*(?:wake[_-]?url|api[_-]?key|access[_-]?token|secret|authorization|bearer|supergrok|xai[_-]?api|door_wake|smoke_wake|cook_wake|continuity_wake).*)$/i;

const SECRET_VAL =
  /(?:sk-[a-z0-9_-]{8,}|xai-[a-z0-9_-]{8,}|grok-[a-z0-9_-]{12,}|bearer\s+[a-z0-9._-]+|supergrok|(?:SMOKE|DOOR|COOK|CONTINUITY)_WAKE_URL\s*=|XAI_API_KEY\s*=)/i;

function nodeZlib(): { gzipSync: (b: Uint8Array) => Uint8Array; gunzipSync: (b: Uint8Array) => Uint8Array } | null {
  const getter = (globalThis as { process?: { getBuiltinModule?: (n: string) => unknown } }).process?.getBuiltinModule;
  if (typeof getter !== "function") return null;
  try {
    return getter("zlib") as { gzipSync: (b: Uint8Array) => Uint8Array; gunzipSync: (b: Uint8Array) => Uint8Array };
  } catch {
    return null;
  }
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function fromUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(token: string): Uint8Array | null {
  const pad = token.length % 4 === 0 ? "" : "=".repeat(4 - (token.length % 4));
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/") + pad;
  try {
    if (typeof atob === "function") {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(b64, "base64"));
  } catch {
    return null;
  }
}

function gzipUtf8(text: string): { bytes: Uint8Array; gzip: boolean } {
  const raw = utf8(text);
  const zlib = nodeZlib();
  if (zlib) {
    try {
      return { bytes: new Uint8Array(zlib.gzipSync(raw)), gzip: true };
    } catch {
      /* */
    }
  }
  return { bytes: raw, gzip: false };
}

function gunzipUtf8(bytes: Uint8Array, gzip: boolean): string {
  if (!gzip) return fromUtf8(bytes);
  const zlib = nodeZlib();
  if (zlib) {
    try {
      return fromUtf8(new Uint8Array(zlib.gunzipSync(bytes)));
    } catch {
      return "";
    }
  }
  return "";
}

function asId(v?: string | null): string {
  return String(v || "")
    .replace(/[^a-zA-Z0-9_.:>-]/g, "")
    .slice(0, 64);
}

function edgeId(from: string, to: string, act = "walk"): string {
  return `${asId(from)}>${asId(to)}:${asId(act) || "walk"}`;
}

function parseBankEdge(key?: string | null): ShareEdge | null {
  const raw = String(key || "").trim();
  if (!raw) return null;
  const m = /^([^→>]+)(?:→|>)([^:→>]+)(?::([a-z0-9_-]+))?$/i.exec(raw);
  if (!m) return null;
  const from = asId(m[1]);
  const to = asId(m[2]);
  const act = asId(m[3] || (from === "enter" || to === "spawn" ? "enter" : "walk"));
  if (!from || !to) return null;
  return { id: edgeId(from, to, act), from, to, act };
}

function catalogUrl(id: string): string {
  const pin = String(id || "").trim();
  if (!pin) return "";
  if (pin.startsWith("/films/") || pin.startsWith("/ui/") || pin.startsWith("/refs/")) return pin;
  const chunk = listChunks().find((c) => c.id === pin);
  if (chunk) return chunk.loop || chunk.still || "";
  return "";
}

export function isCatalogPin(id?: string | null): boolean {
  const pin = String(id || "").trim();
  if (!pin) return false;
  if (pin.startsWith("chunk-")) return true;
  if (pin.startsWith("/films/") || pin.startsWith("/ui/") || pin.startsWith("/refs/")) return true;
  return Boolean(listChunks().some((c) => c.id === pin));
}

export function isSecretKey(name: string): boolean {
  return SECRET_KEY.test(String(name || ""));
}

export function isSecretValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const t = value.trim();
  if (!t) return false;
  if (SECRET_VAL.test(t)) return true;
  if (/^https?:\/\//i.test(t) && /wake|webhook|hook/i.test(t) && /[?&]/.test(t) === false && /grok|x\.ai|openai|anthropic/i.test(t)) {
    return true;
  }
  return false;
}

/** Drop wake URLs, API keys, SuperGrok tokens. Used by share encode and Keep cloud pack. */
export function scrubKeepSecrets<T>(value: T): T {
  if (value == null) return value;
  if (typeof value === "string") return (isSecretValue(value) ? "" : value) as T;
  if (Array.isArray(value)) return value.map((v) => scrubKeepSecrets(v)) as T;
  if (typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSecretKey(k)) continue;
    if (typeof v === "string" && isSecretValue(v)) continue;
    out[k] = scrubKeepSecrets(v);
  }
  return out as T;
}

function packTranscript(raw?: ShareGrade[] | null): Array<{ grade: HitClass }> | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined;
  const grades = raw
    .map((g) => {
      const grade = typeof g === "string" ? g : g?.grade;
      return grade === "early" || grade === "hit" || grade === "late" || grade === "miss" || grade === "idle"
        ? { grade }
        : null;
    })
    .filter((g): g is { grade: HitClass } => Boolean(g))
    .slice(0, 48);
  return grades.length ? grades : undefined;
}

function graphFromSession(session?: ShareExportInput["session"], graph?: ShareExportInput["graph"]): KeepShare["graph"] {
  const nodes: ShareNode[] = [];
  const seenN = new Set<string>();
  const pushNode = (id?: string | null, name?: string) => {
    const n = asId(id);
    if (!n || seenN.has(n)) return;
    seenN.add(n);
    nodes.push(name ? { id: n, name: String(name).slice(0, 32) } : { id: n });
  };
  pushNode("spawn", "spawn");
  for (const p of session?.pins || []) pushNode(p?.id, p?.name);
  for (const n of graph?.nodes || []) pushNode(n.id, n.name);

  const edges: ShareEdge[] = [];
  const seenE = new Set<string>();
  const pushEdge = (e?: ShareEdge | null) => {
    if (!e?.id || !e.from || !e.to) return;
    if (seenE.has(e.id)) return;
    seenE.add(e.id);
    pushNode(e.from);
    pushNode(e.to);
    edges.push({ id: e.id, from: e.from, to: e.to, act: e.act || "walk" });
  };
  for (const b of session?.bank || []) pushEdge(parseBankEdge(b?.key));
  for (const h of session?.halls || []) {
    for (const b of h?.bank || []) pushEdge(parseBankEdge(b?.key));
  }
  for (const e of graph?.edges || []) {
    const from = asId(e.from);
    const to = asId(e.to);
    const act = asId(e.act || "walk") || "walk";
    pushEdge({ id: asId(e.id) || edgeId(from, to, act), from, to, act });
  }
  return { nodes: nodes.slice(0, 24), edges: edges.slice(0, 48) };
}

function cleanPins(raw?: Record<string, string> | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const [k, v] of Object.entries(raw)) {
    const id = asId(k);
    const pin = String(v || "").trim().slice(0, 80);
    if (!id || !pin) continue;
    if (isSecretKey(id) || isSecretValue(pin) || isSecretKey(pin)) continue;
    out[id] = pin;
  }
  return out;
}

export function exportKeepShare(input: ShareExportInput = {}): KeepShare {
  const seed = isRunSeed(input.runSeed) ? input.runSeed : isRunSeed(input.session?.seed) ? input.session!.seed! : "";
  const graph = graphFromSession(input.session, input.graph);
  const pins = cleanPins(input.pins);
  if (input.session) pinKeepFromSession(input.session, input.hung);
  const share: KeepShare = {
    v: KEEP_SHARE_V,
    railsVersion: RAILS_VERSION,
    runSeed: seed,
    graph,
    pins,
  };
  const transcript = packTranscript(input.transcript);
  if (transcript) share.transcript = transcript;
  return scrubKeepSecrets(share);
}

export function compactKeepShare(share: KeepShare): KeepShare {
  return scrubKeepSecrets({
    v: 1 as const,
    railsVersion: RAILS_VERSION,
    runSeed: isRunSeed(share.runSeed) ? share.runSeed : "",
    graph: {
      nodes: (share.graph?.nodes || []).map((n) => ({ id: asId(n.id), ...(n.name ? { name: String(n.name).slice(0, 32) } : {}) })).filter((n) => n.id).slice(0, 24),
      edges: (share.graph?.edges || [])
        .map((e) => {
          const from = asId(e.from);
          const to = asId(e.to);
          const act = asId(e.act || "walk") || "walk";
          return { id: asId(e.id) || edgeId(from, to, act), from, to, act };
        })
        .filter((e) => e.id && e.from && e.to)
        .slice(0, 48),
    },
    pins: cleanPins(share.pins),
    ...(share.transcript ? { transcript: packTranscript(share.transcript) } : {}),
  });
}

export function hostShareId(share: KeepShare): string {
  const compact = compactKeepShare(share);
  return pcgHash(["keep-share", JSON.stringify(compact)]).slice(0, 12);
}

/** Compact token: `g1.` gzip+base64url when zlib is present, else `j1.` json. */
export function encodeKeepShare(share: KeepShare): string {
  const compact = compactKeepShare(share);
  const json = JSON.stringify(compact);
  const { bytes, gzip } = gzipUtf8(json);
  return `${gzip ? "g1" : "j1"}.${toBase64Url(bytes)}`;
}

export function decodeKeepShare(token?: string | null): KeepShare | null {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const dot = raw.indexOf(".");
  const tag = dot > 0 ? raw.slice(0, dot) : "";
  const body = dot > 0 ? raw.slice(dot + 1) : raw;
  const bytes = fromBase64Url(body);
  if (!bytes) return null;
  const gzip = tag === "g1" || tag === "brg1";
  const json = gunzipUtf8(bytes, gzip) || (!gzip ? fromUtf8(bytes) : "");
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as KeepShare;
    if (!parsed || parsed.v !== 1) return null;
    const share = compactKeepShare(parsed);
    if (!share.runSeed && !share.graph.nodes.length) return share;
    return share;
  } catch {
    return null;
  }
}

export function importKeepShare(token?: string | null): KeepShare | null {
  return decodeKeepShare(token);
}

/**
 * Resolve one share pin: catalog → local cache → missing = unlit door / forge ticket.
 * NEVER auto-bill a visitor. Never Imagine. Never wake / API keys.
 */
export function resolveSharePin(
  share: KeepShare | null | undefined,
  edgeId: string,
  _visitor = true,
): ShareResolve {
  void _visitor;
  const id = asId(edgeId);
  const pin = String(share?.pins?.[id] || share?.pins?.[edgeId] || "").trim();
  const base: ShareResolve = { edgeId: id, pin, url: "", source: "unlit", imagine: false, bill: false };
  if (!share || !id || !pin) return { ...base, ticket: "forge" };
  if (isCatalogPin(pin)) {
    const url = catalogUrl(pin);
    if (url) return { ...base, url, source: "catalog" };
  }
  const cached = clipCacheGet(pin);
  if (cached) return { ...base, url: cached, source: "cache" };
  return { ...base, source: "unlit", ticket: "forge" };
}

export function resolveKeepShare(share: KeepShare | null | undefined, visitor = true): ShareResolve[] {
  if (!share) return [];
  const ids = new Set([...Object.keys(share.pins || {}), ...(share.graph?.edges || []).map((e) => e.id)]);
  return [...ids].filter(Boolean).map((id) => resolveSharePin(share, id, visitor));
}

/** Law: a visitor must never be billed for a missing pin. */
export function visitorAutoBill(_share?: KeepShare | null): false {
  void _share;
  return false;
}

export function visitorMayImagine(_share?: KeepShare | null): false {
  void _share;
  return false;
}

export function shareHasSecrets(share: KeepShare | string | null | undefined): boolean {
  const blob = typeof share === "string" ? share : JSON.stringify(share || {});
  if (!blob) return false;
  if (SECRET_VAL.test(blob)) return true;
  if (/\b(?:XAI_API_KEY|SMOKE_WAKE_URL|DOOR_WAKE_URL|COOK_WAKE_URL|CONTINUITY_WAKE_URL|SuperGrok)\b/i.test(blob)) {
    return true;
  }
  return false;
}
