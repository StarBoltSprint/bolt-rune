/** In-picture hall seats. One hop. Wake URLs stay server-side. SmiR pack only. */

export const DOOR_CHAT_HOP = "/api/door-chat";
export const PACK_SKILL = "/pack/skill.md";
export const DIRECTOR_FALLBACK = "Exécution de test / Director SendToAgent";

export const DOOR_BOT_ID = "002bcd41-29f7-4cf0-9eba-d67fad9fa3f6";
export const SMOKE_BOT_ID = "0d69dbc8-a28a-4bb6-b53b-2d50d0329af9";
export const COOK_BOT_ID = "2a8e88a2-3c88-41c3-b489-1c4a4a7c43d8";
export const CONTINUITY_BOT_ID = "efba9930-f946-4caf-a7a7-b50580047c51";

export type HallSeatId = "door" | "smoke" | "cook" | "continuity";
export type HallSeatRole = "say" | "gate" | "cook" | "continuity";

export type HallSeatSpec = {
  id: HallSeatId;
  label: string;
  role: HallSeatRole;
  botId: string;
  wakeEnv: string;
  botEnv: string;
  wakeFile: string;
  brief: string;
};

export const HALL_SEATS: Record<HallSeatId, HallSeatSpec> = {
  door: {
    id: "door",
    label: "Door",
    role: "say",
    botId: DOOR_BOT_ID,
    wakeEnv: "DOOR_WAKE_URL",
    botEnv: "DOOR_BOT_ID",
    wakeFile: "/seats/door.wake.json",
    brief: "say",
  },
  smoke: {
    id: "smoke",
    label: "Smoke",
    role: "gate",
    botId: SMOKE_BOT_ID,
    wakeEnv: "SMOKE_WAKE_URL",
    botEnv: "SMOKE_BOT_ID",
    wakeFile: "/seats/smoke.wake.json",
    brief: "walk / breath / biome",
  },
  cook: {
    id: "cook",
    label: "Cook",
    role: "cook",
    botId: COOK_BOT_ID,
    wakeEnv: "COOK_WAKE_URL",
    botEnv: "COOK_BOT_ID",
    wakeFile: "/seats/cook.wake.json",
    brief: "hall stills · classic",
  },
  continuity: {
    id: "continuity",
    label: "Continuity",
    role: "continuity",
    botId: CONTINUITY_BOT_ID,
    wakeEnv: "CONTINUITY_WAKE_URL",
    botEnv: "CONTINUITY_BOT_ID",
    wakeFile: "/seats/continuity.wake.json",
    brief: "hold the cut",
  },
};

export const HALL_SEAT_IDS = Object.keys(HALL_SEATS) as HallSeatId[];

export function isHallSeat(raw: unknown): raw is HallSeatId {
  return typeof raw === "string" && raw in HALL_SEATS;
}

export function emptySeatFlags(): Record<HallSeatId, boolean> {
  return { door: false, smoke: false, cook: false, continuity: false };
}

export type PublicHallSeat = {
  id: HallSeatId;
  label: string;
  role: HallSeatRole;
  botId: string;
  hop: typeof DOOR_CHAT_HOP;
  wakeFile: string;
  brief: string;
};

export function publicSeat(id: HallSeatId, botId = HALL_SEATS[id].botId): PublicHallSeat {
  const spec = HALL_SEATS[id];
  return {
    id: spec.id,
    label: spec.label,
    role: spec.role,
    botId,
    hop: DOOR_CHAT_HOP,
    wakeFile: spec.wakeFile,
    brief: spec.brief,
  };
}

export function publicRoster(botIds?: Partial<Record<HallSeatId, string>>): {
  hop: typeof DOOR_CHAT_HOP;
  pack: typeof PACK_SKILL;
  owner: "smir";
  mesh: false;
  seats: PublicHallSeat[];
} {
  return {
    hop: DOOR_CHAT_HOP,
    pack: PACK_SKILL,
    owner: "smir",
    mesh: false,
    seats: HALL_SEAT_IDS.map((id) => publicSeat(id, botIds?.[id])),
  };
}

export type SeatWake = HallSeatSpec & {
  botId: string;
  wakeUrl: string;
  wired: boolean;
};

function envText(env: Record<string, string | undefined> | NodeJS.ProcessEnv, key: string): string {
  return String(env[key] || "").trim();
}

export function isHttpWakeUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export type WakeUrlKind = "http" | "empty" | "non-http";

export function wakeUrlKind(raw: string): WakeUrlKind {
  const t = String(raw || "").trim();
  if (!t) return "empty";
  return isHttpWakeUrl(t) ? "http" : "non-http";
}

export type SeatWakeDebug = {
  wired: boolean;
  hasLive: boolean;
  hasInlined: boolean;
  hasBaked: boolean;
  hasDisk: boolean;
  urlKind: WakeUrlKind;
};

/** Safe debug flags. Never put a URL in here. */
export function seatWakeDebugFlags(input: {
  resolved: string;
  live: string;
  inlined: string;
  baked: string;
  disk: string;
}): SeatWakeDebug {
  return {
    wired: isHttpWakeUrl(input.resolved),
    hasLive: Boolean(String(input.live || "").trim()),
    hasInlined: Boolean(String(input.inlined || "").trim()),
    hasBaked: Boolean(String(input.baked || "").trim()),
    hasDisk: Boolean(String(input.disk || "").trim()),
    urlKind: wakeUrlKind(input.resolved),
  };
}

/**
 * Server hop target. Env http URL wins. Owner paste is used only when the
 * server has no usable http wake URL (empty or a leftover non-http deep link).
 */
export function resolveHopWakeUrl(
  serverWakeUrl: string,
  ownerWakeUrl?: string,
): { wakeUrl: string; wired: boolean; from: "server" | "owner" | "none" } {
  const server = String(serverWakeUrl || "").trim();
  if (isHttpWakeUrl(server)) return { wakeUrl: server, wired: true, from: "server" };
  const owner = String(ownerWakeUrl || "").trim();
  if (isHttpWakeUrl(owner)) return { wakeUrl: owner, wired: true, from: "owner" };
  return { wakeUrl: "", wired: false, from: "none" };
}

export type OwnerWakeStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function ownerWakeStorageKey(id: HallSeatId): string {
  return HALL_SEATS[id].wakeEnv;
}

function ownerWakeStore(explicit?: OwnerWakeStore | null): OwnerWakeStore | null {
  if (explicit !== undefined) return explicit;
  try {
    const ls = (globalThis as { localStorage?: OwnerWakeStore }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

export function readOwnerWakeUrl(id: HallSeatId, storage?: OwnerWakeStore | null): string {
  const store = ownerWakeStore(storage);
  if (!store) return "";
  try {
    const raw = String(store.getItem(ownerWakeStorageKey(id)) || "").trim();
    return isHttpWakeUrl(raw) ? raw : "";
  } catch {
    return "";
  }
}

export function writeOwnerWakeUrl(id: HallSeatId, raw: string, storage?: OwnerWakeStore | null): string {
  const store = ownerWakeStore(storage);
  if (!store) return "";
  const url = String(raw || "").trim();
  try {
    if (!isHttpWakeUrl(url)) {
      store.removeItem(ownerWakeStorageKey(id));
      return "";
    }
    store.setItem(ownerWakeStorageKey(id), url);
    return url;
  } catch {
    return "";
  }
}

/**
 * Resolve a seat against a secret bag. Default is empty — this module is also
 * imported by the hall picture, so it must not touch `process.env` (Vite would
 * snapshot / strip it for the client bundle). The hop loads secrets via
 * `loadSeatSecretEnv` in `door-chat-env.server.ts`.
 */
export function resolveSeatWake(
  id: HallSeatId,
  env: Record<string, string | undefined> | NodeJS.ProcessEnv = {},
): SeatWake {
  const spec = HALL_SEATS[id];
  const wakeUrl = envText(env, spec.wakeEnv);
  const botId = envText(env, spec.botEnv) || spec.botId;
  return { ...spec, botId, wakeUrl, wired: isHttpWakeUrl(wakeUrl) };
}

export function cleanDoorLine(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

export function doorChatPayload(input: {
  seat: HallSeatId;
  text: unknown;
  source?: string;
  botId?: string;
  wakeUrl?: string;
}) {
  const text = cleanDoorLine(input.text);
  if (!text) return { ok: false as const, error: "empty" };
  const body: {
    seat: HallSeatId;
    text: string;
    source: string;
    botId: string;
    wakeUrl?: string;
  } = {
    seat: input.seat,
    text,
    source: String(input.source || "hall").slice(0, 32),
    botId: String(input.botId || HALL_SEATS[input.seat].botId),
  };
  const owner = String(input.wakeUrl || "").trim();
  if (isHttpWakeUrl(owner)) body.wakeUrl = owner;
  return { ok: true as const, body };
}

export function readWakeReply(raw: unknown): string {
  if (typeof raw === "string") return raw.replace(/\s+/g, " ").trim().slice(0, 800);
  if (!raw || typeof raw !== "object") return "";
  const o = raw as Record<string, unknown>;
  for (const key of ["reply", "text", "message", "line", "result", "status"]) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) return v.replace(/\s+/g, " ").trim().slice(0, 800);
  }
  return "";
}

export type DoorChatHopOk = {
  ok: true;
  seat: HallSeatId;
  wired: boolean;
  reply: string;
  status?: string;
  fallback?: string;
};
export type DoorChatHopErr = { ok: false; seat?: HallSeatId; error: string; wired?: boolean; fallback?: string };
export type DoorChatHopResult = DoorChatHopOk | DoorChatHopErr;

/** Unwired hop: do not demand a paste. Director SendToAgent is the zero-URL path. */
export function unwiredDirectorFallback(seat: HallSeatId): DoorChatHopErr {
  return {
    ok: false,
    seat,
    error: "wake-unwired",
    wired: false,
    fallback: DIRECTOR_FALLBACK,
  };
}

export function unwiredFrost(seat: HallSeatId): string {
  return `${HALL_SEATS[seat].label} · ${DIRECTOR_FALLBACK}`;
}

export async function hopDoorChat(
  seat: HallSeatId,
  text: string,
  source = "hall",
  fetchImpl: typeof fetch = fetch,
  wakeUrl?: string,
): Promise<DoorChatHopResult> {
  const owner = wakeUrl === undefined ? readOwnerWakeUrl(seat) : String(wakeUrl || "");
  const packed = doorChatPayload({ seat, text, source, wakeUrl: owner });
  if (!packed.ok) return { ok: false, seat, error: packed.error };
  try {
    const r = await fetchImpl(DOOR_CHAT_HOP, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(packed.body),
    });
    const raw = await r.json().catch(() => null);
    if (raw && typeof raw === "object") {
      const body = raw as DoorChatHopResult;
      if (body.ok === true && isHallSeat(body.seat)) return body;
      if (body.ok === false) {
        return {
          ok: false,
          seat,
          error: body.error || "hop",
          wired: body.wired,
          fallback: body.fallback || (body.error === "wake-unwired" ? DIRECTOR_FALLBACK : undefined),
        };
      }
    }
    return { ok: false, seat, error: r.ok ? "empty-reply" : `hop-${r.status}` };
  } catch {
    return { ok: false, seat, error: "hop" };
  }
}

export type BoltSeatHook = {
  wake: (seat: HallSeatId, text?: string) => Promise<DoorChatHopResult>;
  roster: ReturnType<typeof publicRoster>;
  pack: typeof PACK_SKILL;
};

export type WakeFile = {
  seat: HallSeatId;
  role: HallSeatRole;
  botId: string;
  wakeEnv: string;
  hop: typeof DOOR_CHAT_HOP;
  label: string;
  brief: string;
};

export function wakeFileOf(id: HallSeatId): WakeFile {
  const spec = HALL_SEATS[id];
  return {
    seat: spec.id,
    role: spec.role,
    botId: spec.botId,
    wakeEnv: spec.wakeEnv,
    hop: DOOR_CHAT_HOP,
    label: spec.label,
    brief: spec.brief,
  };
}
