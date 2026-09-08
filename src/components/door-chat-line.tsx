import { useEffect, useState } from "react";
import {
  DOOR_CHAT_HOP,
  HALL_SEAT_IDS,
  HALL_SEATS,
  PACK_SKILL,
  DIRECTOR_FALLBACK,
  emptySeatFlags,
  hopDoorChat,
  isHallSeat,
  isHttpWakeUrl,
  publicRoster,
  readOwnerWakeUrl,
  unwiredFrost,
  writeOwnerWakeUrl,
  type BoltSeatHook,
  type HallSeatId,
} from "@/game/door-chat";

type Line = { seat: HallSeatId; who: "you" | "seat"; text: string };

declare global {
  interface Window {
    __boltSeats?: BoltSeatHook;
  }
}

function seatTone(id: HallSeatId) {
  if (id === "door") return "text-[#9ef0e4]";
  if (id === "cook") return "text-[#f4c4a0]";
  if (id === "continuity") return "text-[#d8c6ff]";
  return "text-[#f0d48a]";
}

function seatRing(id: HallSeatId, on: boolean) {
  if (!on) return "border-white/20";
  if (id === "door") return "border-[#9ef0e4]/70";
  if (id === "cook") return "border-[#f4c4a0]/70";
  if (id === "continuity") return "border-[#d8c6ff]/70";
  return "border-[#f0d48a]/70";
}

export function DoorChatLine({
  where = "hall",
  box,
}: {
  where?: "hall" | "play";
  box?: { x: number; y: number; w: number; h: number } | null;
}) {
  const [sheet, setSheet] = useState(false);
  const [open, setOpen] = useState<HallSeatId | null>(null);
  const [draft, setDraft] = useState("");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [frost, setFrost] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [serverWired, setServerWired] = useState<Partial<Record<HallSeatId, boolean>> | null>(null);
  const [held, setHeld] = useState<Record<HallSeatId, boolean>>(emptySeatFlags);

  useEffect(() => {
    const api: BoltSeatHook = {
      roster: publicRoster(),
      pack: PACK_SKILL,
      wake: (seat, text) => hopDoorChat(seat, text || HALL_SEATS[seat].brief, "director"),
    };
    window.__boltSeats = api;
    return () => {
      if (window.__boltSeats === api) delete window.__boltSeats;
    };
  }, []);

  useEffect(() => {
    if (!sheet) return;
    const nextHeld = emptySeatFlags();
    for (const id of HALL_SEAT_IDS) nextHeld[id] = Boolean(readOwnerWakeUrl(id));
    setHeld(nextHeld);
    let dead = false;
    void fetch(DOOR_CHAT_HOP)
      .then((r) => r.json())
      .then((raw) => {
        if (dead || !raw || typeof raw !== "object") return;
        const seats = Array.isArray((raw as { seats?: unknown }).seats) ? (raw as { seats: unknown[] }).seats : [];
        const next: Partial<Record<HallSeatId, boolean>> = {};
        for (const row of seats) {
          if (!row || typeof row !== "object") continue;
          const id = (row as { id?: unknown }).id;
          if (isHallSeat(id)) next[id] = (row as { wired?: unknown }).wired === true;
        }
        setServerWired(next);
      })
      .catch(() => {
        if (!dead) setServerWired(emptySeatFlags());
      });
    return () => {
      dead = true;
    };
  }, [sheet]);

  function closeSheet() {
    setSheet(false);
    setOpen(null);
    setFrost("");
  }

  async function say(seat: HallSeatId, text: string, source?: string) {
    const line = text.trim() || HALL_SEATS[seat].brief;
    if (!line || busy) return;
    setBusy(true);
    setFrost("");
    setLines((cur) => [...cur.slice(-4), { seat, who: "you", text: line }]);
    const got = await hopDoorChat(seat, line, source || (where === "play" ? "play" : "hall"));
    setBusy(false);
    if (!got.ok) {
      setFrost(got.error === "wake-unwired" ? unwiredFrost(seat) : got.error);
      return;
    }
    if (got.reply) setLines((cur) => [...cur.slice(-4), { seat, who: "seat", text: got.reply }]);
  }

  function seatNeedsPaste(id: HallSeatId) {
    return serverWired?.[id] !== true;
  }

  const pasteFor: HallSeatId | null = open && seatNeedsPaste(open) ? open : null;

  function holdPaste(id: HallSeatId, raw: string, clear = true) {
    const url = writeOwnerWakeUrl(id, raw);
    setHeld((cur) => ({ ...cur, [id]: Boolean(url) }));
    if (clear) setPaste("");
    setFrost(url ? `${HALL_SEATS[id].label} · held` : `${HALL_SEATS[id].label} · optional https`);
    return url;
  }

  const left = box ? box.x + box.w * 0.08 : undefined;
  const width = box ? box.w * 0.84 : undefined;
  const top = box ? box.y + 6 : undefined;

  return (
    <div
      className="pointer-events-none absolute z-[90] flex flex-col items-center"
      data-hall-seats="1"
      data-seat-where={where}
      data-seat-sheet={sheet ? "open" : "closed"}
      data-seat-open={open || ""}
      data-seat-pack={PACK_SKILL}
      style={{
        left: left != null ? left : "8%",
        width: width != null ? width : "84%",
        top: top != null ? top : "max(0.45rem, env(safe-area-inset-top))",
      }}
    >
      <button
        type="button"
        data-seat-handle="1"
        aria-expanded={sheet}
        aria-label={sheet ? "close seats" : "seats"}
        className="pointer-events-auto relative z-[92] flex h-6 items-center rounded-b-2xl border border-t-0 border-white/20 bg-black/50 px-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[#f0d48a]"
        style={{ touchAction: "manipulation" }}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (sheet) closeSheet();
          else {
            setSheet(true);
            setFrost("");
          }
        }}
      >
        seats
      </button>
      {sheet ? (
        <button
          type="button"
          data-seat-dismiss="1"
          aria-label="close seats"
          className="pointer-events-auto fixed inset-0 z-[89] bg-transparent"
          style={{ touchAction: "manipulation" }}
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            e.preventDefault();
            closeSheet();
          }}
        />
      ) : null}
      {sheet ? (
        <div
          className="pointer-events-auto relative z-[91] mt-1.5 flex w-full flex-col items-stretch gap-1.5 rounded-2xl border border-white/15 bg-black/55 px-2.5 py-2 backdrop-blur-sm"
          data-seat-panel="1"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            data-seat-close="1"
            aria-label="close seats"
            className="self-center rounded-full border border-white/20 bg-black/40 px-3 py-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[#f0d48a]"
            style={{ touchAction: "manipulation" }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => {
              e.stopPropagation();
              e.preventDefault();
              closeSheet();
            }}
          >
            close
          </button>
          {open && lines.length ? (
            <div className="pointer-events-none flex flex-col gap-1 px-1" data-seat-lines="1">
              {lines
                .filter((l) => l.seat === open)
                .slice(-3)
                .map((l, i) => (
                  <p
                    key={`${l.seat}-${i}-${l.text.slice(0, 12)}`}
                    className={`font-mono text-[10px] uppercase tracking-[0.16em] ${
                      l.who === "you" ? "text-white/55" : "text-[#9ef0e4]"
                    }`}
                  >
                    {l.who === "you" ? "you" : HALL_SEATS[l.seat].label} ·{" "}
                    {l.who === "seat" ? l.text.replace(new RegExp(`^${HALL_SEATS[l.seat].label}\\s*[·:]\\s*`, "i"), "") : l.text}
                  </p>
                ))}
            </div>
          ) : null}
          {frost ? (
            <p className="pointer-events-none px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#f0d48a]" data-seat-frost="1">
              {frost}
            </p>
          ) : (
            <p className="pointer-events-none px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40" data-seat-director-hint="1">
              tap seat · {HALL_SEATS.smoke.label} · {DIRECTOR_FALLBACK}
            </p>
          )}
          {pasteFor ? (
            <form
              className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/20 bg-black/50 px-3 py-1.5"
              data-seat-paste={pasteFor}
              data-seat-held={held[pasteFor] ? "1" : "0"}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                holdPaste(pasteFor, paste);
              }}
            >
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-[#f0d48a]">
                {HALL_SEATS[pasteFor].label}
              </span>
              <input
                value={paste}
                onChange={(e) => {
                  const next = e.target.value;
                  setPaste(next);
                  if (isHttpWakeUrl(next.trim())) {
                    writeOwnerWakeUrl(pasteFor, next);
                    setHeld((cur) => ({ ...cur, [pasteFor]: true }));
                  }
                }}
                placeholder="optional https"
                inputMode="url"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label={`${HALL_SEATS[pasteFor].label} optional https webhook`}
                className="min-w-0 flex-1 bg-transparent font-mono text-[11px] tracking-[0.08em] text-white/85 outline-none placeholder:text-white/30"
              />
              <button
                type="submit"
                className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#9ef0e4] disabled:text-white/25"
                style={{ touchAction: "manipulation" }}
              >
                {held[pasteFor] ? "held" : "hold"}
              </button>
            </form>
          ) : null}
          <div className="flex flex-wrap items-center justify-center gap-1.5" data-seat-roster="1">
            {HALL_SEAT_IDS.map((id) => {
              const on = open === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-seat={id}
                  data-seat-role={HALL_SEATS[id].role}
                  data-seat-bot={HALL_SEATS[id].botId}
                  className={`pointer-events-auto flex h-9 items-center rounded-full border bg-black/45 px-2.5 font-mono text-[10px] uppercase tracking-[0.18em] ${seatTone(id)} ${seatRing(id, on)}`}
                  style={{ touchAction: "manipulation" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const next = on ? null : id;
                    setOpen(next);
                    setFrost("");
                    if (next) void say(next, HALL_SEATS[next].brief, where === "play" ? "play" : "hall");
                  }}
                >
                  {HALL_SEATS[id].label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              data-seat-director="1"
              data-seat-director-target={open || "smoke"}
              className="pointer-events-auto flex h-8 items-center rounded-full border border-white/20 bg-black/45 px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#9ef0e4]"
              style={{ touchAction: "manipulation" }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => {
                e.stopPropagation();
                e.preventDefault();
                const seat = open || "smoke";
                setOpen(seat);
                void say(seat, HALL_SEATS[seat].brief, "director");
              }}
            >
              director
            </button>
          </div>
          {open ? (
            <form
              className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/20 bg-black/50 px-3 py-1.5"
              data-seat-line={open}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                const text = draft.trim() || HALL_SEATS[open].brief;
                setDraft("");
                void say(open, text);
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={HALL_SEATS[open].brief}
                maxLength={400}
                autoComplete="off"
                autoCorrect="off"
                enterKeyHint="send"
                className="min-w-0 flex-1 bg-transparent font-mono text-[11px] uppercase tracking-[0.14em] text-white/85 outline-none placeholder:text-white/30"
              />
              <button
                type="submit"
                disabled={busy}
                className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#9ef0e4] disabled:text-white/25"
                style={{ touchAction: "manipulation" }}
              >
                {busy ? "…" : "wake"}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
