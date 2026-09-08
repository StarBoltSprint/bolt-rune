import { useEffect, useState } from "react";
import {
  HALL_SEAT_IDS,
  HALL_SEATS,
  hopDoorChat,
  publicRoster,
  type BoltSeatHook,
  type HallSeatId,
} from "@/game/door-chat";

type Line = { seat: HallSeatId; who: "you" | "seat"; text: string };

declare global {
  interface Window {
    __boltSeats?: BoltSeatHook;
  }
}

const HINT: Record<HallSeatId, string> = {
  door: "say",
  smoke: "walk / breath / biome",
};

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
  const [busy, setBusy] = useState(false);
  const [frost, setFrost] = useState("");
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    const api: BoltSeatHook = {
      roster: publicRoster(),
      wake: (seat, text) => hopDoorChat(seat, text, "director"),
    };
    window.__boltSeats = api;
    return () => {
      if (window.__boltSeats === api) delete window.__boltSeats;
    };
  }, []);

  function closeSheet() {
    setSheet(false);
    setOpen(null);
    setFrost("");
  }

  async function say(seat: HallSeatId, text: string) {
    const line = text.trim();
    if (!line || busy) return;
    setBusy(true);
    setFrost("");
    setLines((cur) => [...cur.slice(-4), { seat, who: "you", text: line }]);
    const got = await hopDoorChat(seat, line, where === "play" ? "play" : "hall");
    setBusy(false);
    if (!got.ok) {
      setFrost(got.error === "wake-unwired" ? `${HALL_SEATS[seat].label} · point wake URL` : got.error);
      return;
    }
    if (got.reply) setLines((cur) => [...cur.slice(-4), { seat, who: "seat", text: got.reply }]);
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
          ) : null}
          <div className="flex items-center justify-center gap-2">
            {HALL_SEAT_IDS.map((id) => {
              const on = open === id;
              const tone = id === "door" ? "text-[#9ef0e4]" : "text-[#f0d48a]";
              const ring = on ? (id === "door" ? "border-[#9ef0e4]/70" : "border-[#f0d48a]/70") : "border-white/20";
              return (
                <button
                  key={id}
                  type="button"
                  data-seat={id}
                  data-seat-role={HALL_SEATS[id].role}
                  data-seat-bot={HALL_SEATS[id].botId}
                  className={`pointer-events-auto flex h-9 items-center rounded-full border bg-black/45 px-3 font-mono text-[10px] uppercase tracking-[0.22em] ${tone} ${ring}`}
                  style={{ touchAction: "manipulation" }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setOpen(on ? null : id);
                    setFrost("");
                  }}
                >
                  {HALL_SEATS[id].label}
                </button>
              );
            })}
          </div>
          {open ? (
            <form
              className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/20 bg-black/50 px-3 py-1.5"
              data-seat-line={open}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                const text = draft;
                setDraft("");
                void say(open, text);
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={HINT[open]}
                maxLength={400}
                autoComplete="off"
                autoCorrect="off"
                enterKeyHint="send"
                className="min-w-0 flex-1 bg-transparent font-mono text-[11px] uppercase tracking-[0.14em] text-white/85 outline-none placeholder:text-white/30"
              />
              <button
                type="submit"
                disabled={busy || !draft.trim()}
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
