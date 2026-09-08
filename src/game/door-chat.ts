/** In-picture hall seats. One hop. Wake URLs stay server-side. */

export const DOOR_CHAT_HOP = "/api/door-chat";

export const DOOR_BOT_ID = "002bcd41-29f7-4cf0-9eba-d67fad9fa3f6";
export const SMOKE_BOT_ID = "0d69dbc8-a28a-4bb6-b53b-2d50d0329af9";

export type HallSeatId = "door" | "smoke";
export type HallSeatRole = "say" | "gate";

export type HallSeatSpec = {
  id: HallSeatId;
  label: string;
  role: HallSeatRole;
  botId: string;
  wakeEnv: string;
  botEnv: string;
  wakeFile: string;
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
  },
  smoke: {
    id: "smoke",
    label: "Smoke",
    role: "gate",
    botId: SMOKE_BOT_ID,
    wakeEnv: "SMOKE_WAKE_URL",
    botEnv: "SMOKE_BOT_ID",
    wakeFile: "/seats/smoke.wake.json",
  },
};

export const HALL_SEAT_IDS = Object.keys(HALL_SEATS) as HallSeatId[];

export function isHallSeat(raw: unknown): raw is HallSeatId {
  return raw === "door" || raw === "smoke";
}

export type PublicHallSeat = {
  id: HallSeatId;
  label: string;
  role: HallSeatRole;
  botId: string;
  hop: typeof DOOR_CHAT_HOP;
  wakeFile: string;
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
  };
}

export function publicRoster(botIds?: Partial<Record<HallSeatId, string>>): {
  hop: typeof DOOR_CHAT_HOP;
  seats: PublicHallSeat[];
} {
  return {
    hop: DOOR_CHAT_HOP,
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

export function doorChatPayload(input: { seat: HallSeatId; text: unknown; source?: string; botId?: string }) {
  const text = cleanDoorLine(input.text);
  if (!text) return { ok: false as const, error: "empty" };
  return {
    ok: true as const,
    body: {
      seat: input.seat,
      text,
      source: String(input.source || "hall").slice(0, 32),
      botId: String(input.botId || HALL_SEATS[input.seat].botId),
    },
  };
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

export type DoorChatHopOk = { ok: true; seat: HallSeatId; wired: boolean; reply: string; status?: string };
export type DoorChatHopErr = { ok: false; seat?: HallSeatId; error: string; wired?: boolean };
export type DoorChatHopResult = DoorChatHopOk | DoorChatHopErr;

export async function hopDoorChat(
  seat: HallSeatId,
  text: string,
  source = "hall",
  fetchImpl: typeof fetch = fetch,
): Promise<DoorChatHopResult> {
  const packed = doorChatPayload({ seat, text, source });
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
      if (body.ok === false) return { ok: false, seat, error: body.error || "hop", wired: body.wired };
    }
    return { ok: false, seat, error: r.ok ? "empty-reply" : `hop-${r.status}` };
  } catch {
    return { ok: false, seat, error: "hop" };
  }
}

export type BoltSeatHook = {
  wake: (seat: HallSeatId, text: string) => Promise<DoorChatHopResult>;
  roster: ReturnType<typeof publicRoster>;
};

export type WakeFile = {
  seat: HallSeatId;
  role: HallSeatRole;
  botId: string;
  wakeEnv: string;
  hop: typeof DOOR_CHAT_HOP;
  label: string;
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
  };
}
