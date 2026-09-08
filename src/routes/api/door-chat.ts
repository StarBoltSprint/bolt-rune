import { createFileRoute } from "@tanstack/react-router";
import { inspectSeatWakeDebug, loadSeatSecretEnv } from "@/game/door-chat-env.server";
import {
  HALL_SEAT_IDS,
  PACK_SKILL,
  doorChatPayload,
  isHallSeat,
  publicRoster,
  readWakeReply,
  resolveHopWakeUrl,
  resolveSeatWake,
  unwiredDirectorFallback,
  type DoorChatHopResult,
  type HallSeatId,
} from "@/game/door-chat";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function roster() {
  const env = loadSeatSecretEnv();
  const seats = HALL_SEAT_IDS.map((id) => {
    const wake = resolveSeatWake(id, env);
    return { ...wake, public: true };
  });
  const publicSeats = publicRoster(
    Object.fromEntries(seats.map((s) => [s.id, s.botId])) as Record<HallSeatId, string>,
  );
  return {
    hop: "/api/door-chat",
    pack: PACK_SKILL,
    owner: "smir",
    mesh: false,
    seats: publicSeats.seats.map((seat) => ({
      ...seat,
      wired: seats.find((s) => s.id === seat.id)?.wired === true,
    })),
    wakeDebug: inspectSeatWakeDebug(),
  };
}

async function hopWake(seat: HallSeatId, text: unknown, source?: string, ownerWake = ""): Promise<DoorChatHopResult> {
  const env = loadSeatSecretEnv();
  const wake = resolveSeatWake(seat, env);
  const packed = doorChatPayload({ seat, text, source, botId: wake.botId });
  if (!packed.ok) return { ok: false, seat, error: packed.error, wired: wake.wired };
  const hop = resolveHopWakeUrl(wake.wakeUrl, ownerWake);
  if (!hop.wired) return unwiredDirectorFallback(seat);

  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = String(env.DOOR_CHAT_WAKE_SECRET || "").trim();
  if (secret) headers.Authorization = `Bearer ${secret}`;

  try {
    const up = await fetch(hop.wakeUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(packed.body),
      redirect: "follow",
      signal: AbortSignal.timeout(22000),
    });
    const rawText = await up.text();
    let parsed: unknown = rawText;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = rawText;
    }
    const reply = readWakeReply(parsed) || (up.ok ? "woken" : "");
    if (!up.ok) return { ok: false, seat, error: reply || `wake-${up.status}`, wired: true };
    return { ok: true, seat, wired: true, reply, status: up.status === 200 ? "ok" : String(up.status) };
  } catch {
    return { ok: false, seat, error: "wake-hop", wired: true };
  }
}

async function postLine(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad-json" }, 400);
  }
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (!isHallSeat(rec.seat)) return json({ ok: false, error: "bad-seat" }, 400);
  const ownerWake = typeof rec.wakeUrl === "string" ? rec.wakeUrl : "";
  const got = await hopWake(rec.seat, rec.text, typeof rec.source === "string" ? rec.source : "hall", ownerWake);
  return json(got, got.ok ? 200 : got.error === "wake-unwired" ? 503 : 502);
}

export const Route = createFileRoute("/api/door-chat")({
  server: {
    handlers: {
      GET: () => json(roster()),
      POST: ({ request }) => postLine(request),
    },
  },
});
