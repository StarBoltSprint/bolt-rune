import { useEffect, useRef, useState } from "react";
import { vaultHangRoom } from "@/game/path-entry";
import { HANG_CONFIRM_ARM_MS, HANG_LEFTOVER_SWALLOW_MS, hangBindHall, hangCardHall, hangStripCards, hangStripPick, swallowOpeningTap } from "@/game/hang-ask";
import { type HangCitadelPick, type HangRoomPick } from "@/game/rooms";
import { press } from "@/lib/press";


export function HangCitadelStrip({
  citadels,
  citadel,
  onCitadel,
  disabled,
}: {
  citadels: HangCitadelPick[];
  citadel: string;
  onCitadel: (id: string) => void;
  disabled?: boolean;
}) {
  if (citadels.length <= 1) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" data-hang-citadels={citadels.length}>
      {citadels.map((c) => {
        const on = c.id === citadel;
        return (
          <button
            key={c.id}
            type="button"
            data-hang-citadel-pick={c.id}
            aria-pressed={on}
            disabled={disabled}
            className={`min-w-[7.2rem] overflow-hidden rounded-2xl border bg-black/50 text-left disabled:opacity-40 ${
              on ? "border-[#9ef0e4]/70 ring-1 ring-[#9ef0e4]/35" : "border-white/25"
            }`}
            style={{ touchAction: "manipulation" }}
            onPointerDown={(e) => e.stopPropagation()}
            {...press(() => {
              if (disabled) return;
              onCitadel(c.id);
            })}
          >
            {c.thumb ? (
              <img src={c.thumb} alt="" className="h-[3.6rem] w-full object-cover" />
            ) : (
              <div className="h-[3.6rem] w-full bg-[linear-gradient(180deg,rgba(158,240,228,0.16),rgba(7,8,12,0.7))]" />
            )}
            <span
              className={`block px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
                on ? "text-[#9ef0e4]" : "text-white/65"
              }`}
            >
              {c.title || "Citadel"}
              <span className="mt-0.5 block text-[9px] tracking-[0.12em] text-white/45">
                {c.rooms} room{c.rooms === 1 ? "" : "s"}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function HangRoomStrip({
  rooms,
  hall,
  onHall,
  disabled,
}: {
  rooms: HangRoomPick[];
  hall: number;
  onHall: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" data-hang-rooms="" data-hang-load-halls={rooms.length}>
      {hangStripCards(rooms).map((card) => {
        const r = rooms[card.index];
        const n = card.hall;
        const pick = (from?: string | null) => {
          if (disabled) return;
          onHall(hangCardHall(from) || hangStripPick(rooms, card.index) || n);
        };
        return (
          <button
            key={`${r?.citadel || ""}-${n}-${card.index}`}
            type="button"
            data-hang-pick={n}
            data-hang-card-index={card.index}
            {...vaultHangRoom(n)}
            aria-pressed={hall === n}
            disabled={disabled}
            className={`min-w-[6.4rem] overflow-hidden rounded-2xl border bg-black/50 text-left disabled:opacity-40 ${
              hall === n ? "border-[#9ef0e4]/70 ring-1 ring-[#9ef0e4]/35" : "border-white/25"
            }`}
            style={{ touchAction: "manipulation" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              pick(e.currentTarget.getAttribute("data-hang-pick"));
            }}
            {...press(() => pick(String(n)))}
          >
            {r?.still ? (
              <img src={r.still} alt="" className="h-[4.4rem] w-full object-cover" />
            ) : (
              <div className="h-[4.4rem] w-full bg-[linear-gradient(180deg,rgba(158,240,228,0.16),rgba(7,8,12,0.7))]" />
            )}
            <span
              className={`block px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
                hall === n ? "text-[#9ef0e4]" : "text-white/65"
              }`}
            >
              Room {n}
              {r?.living ? " · here" : rooms.length === 1 ? " · only" : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function HangAskSheet({
  door,
  name,
  rooms,
  hall,
  onHall,
  onConfirm,
  onClose,
  citadels = [],
  citadel = "",
  onCitadel,
}: {
  door: "A" | "B";
  name: string;
  rooms: HangRoomPick[];
  hall: number;
  onHall: (n: number) => void;
  onConfirm: (hall: number) => void;
  onClose: () => void;
  citadels?: HangCitadelPick[];
  citadel?: string;
  onCitadel?: (id: string) => void;
}) {
  const [armed, setArmed] = useState(false);
  const [held, setHeld] = useState(rooms);
  const [picked, setPicked] = useState(() => hangCardHall(hall) || 1);
  const pickedRef = useRef(picked);
  const choseRef = useRef(false);
  const citadelRef = useRef(citadel);
  useEffect(() => {
    /* Do not release swallow on unmount — confirm click unmounts the sheet
       and leftover touchend would hit Hang B / Play Sprint underneath
       (Room 1 · Door B after Hang Room 4). The leftover timer removes it. */
    swallowOpeningTap(HANG_LEFTOVER_SWALLOW_MS);
    const t = window.setTimeout(() => setArmed(true), HANG_CONFIRM_ARM_MS);
    return () => {
      window.clearTimeout(t);
    };
  }, []);
  useEffect(() => {
    if (citadel && citadel !== citadelRef.current) {
      citadelRef.current = citadel;
      choseRef.current = false;
      setHeld(rooms);
      const next = hangCardHall(hall) || 1;
      pickedRef.current = next;
      setPicked(next);
      return;
    }
    const same = rooms[0]?.citadel && held[0]?.citadel && rooms[0].citadel === held[0].citadel;
    if (!same && rooms.length) {
      setHeld(rooms);
      return;
    }
    if (rooms.length >= held.length) setHeld(rooms);
  }, [rooms, held.length, citadel, hall]);
  useEffect(() => {
    /* Parent hall is the column / last hang — do not overwrite a tapped Room N. */
    if (choseRef.current) return;
    const next = hangCardHall(hall);
    if (!next) return;
    pickedRef.current = next;
    setPicked(next);
  }, [hall]);
  const picks = held.length >= rooms.length && (!citadel || held[0]?.citadel === citadel || !held[0]?.citadel) ? held : rooms;
  function pickHall(n: number) {
    const next = hangCardHall(n) || 1;
    choseRef.current = true;
    pickedRef.current = next;
    setPicked(next);
    onHall(next);
  }
  const chosen = citadels.find((c) => c.id === citadel);
  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col bg-black/92 px-5 pt-[max(1.6rem,env(safe-area-inset-top))] pb-[max(1.6rem,env(safe-area-inset-bottom))]"
      data-hang-ask={door}
      data-hang-sheet="1"
      data-hang-load-halls={picks.length}
      data-hang-picked={picked}
      data-hang-citadel={citadel || undefined}
      data-hang-armed={armed ? "1" : "0"}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="self-start font-mono text-[10px] uppercase tracking-[0.42em] text-white/55"
        style={{ touchAction: "manipulation" }}
        {...press(onClose)}
      >
        Close
      </button>
      <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.28em] text-white/45">{name}</p>
      <h2 className="mt-1 font-display text-4xl text-white/90">Hang {door}</h2>
      <p className="mt-2 max-w-xs font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
        {citadels.length > 1
          ? `Pick any citadel, then the room, then hang door ${door}.`
          : `Pick the citadel room, then hang door ${door}.`}
      </p>
      {citadels.length > 1 ? (
        <>
          <p className="mt-5 mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#9ef0e4]">
            {citadels.length} citadels · tap one
          </p>
          <HangCitadelStrip citadels={citadels} citadel={citadel} onCitadel={onCitadel || (() => {})} />
        </>
      ) : null}
      <p className={`${citadels.length > 1 ? "mt-4" : "mt-5"} mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#9ef0e4]`}>
        {chosen?.title ? `${chosen.title} · ` : ""}
        {picks.length > 1 ? `${picks.length} rooms · tap one` : "one room · confirm to hang"}
      </p>
      <HangRoomStrip
        rooms={picks}
        hall={picked}
        onHall={pickHall}
      />
      {armed ? (
        <button
          type="button"
          data-hang-confirm={door}
          {...vaultHangRoom(picked)}
          className="mt-6 rounded-2xl border border-[#9ef0e4]/50 px-4 py-3 font-display text-2xl text-[#9ef0e4]"
          style={{ touchAction: "manipulation" }}
          {...press(() => onConfirm(hangBindHall(picked) || hangBindHall(pickedRef.current)))}
        >
          Hang {door} · room {picked}
        </button>
      ) : (
        <p
          className="pointer-events-none mt-6 rounded-2xl border border-white/10 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/35"
          data-hang-confirm-wait={door}
        >
          pick a room — then confirm
        </p>
      )}
    </div>
  );
}
