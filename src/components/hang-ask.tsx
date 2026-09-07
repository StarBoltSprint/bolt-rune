import { useEffect, useState } from "react";
import { vaultHangRoom } from "@/game/path-entry";
import { HANG_CONFIRM_ARM_MS, HANG_LEFTOVER_SWALLOW_MS, swallowOpeningTap } from "@/game/hang-ask";
import { type HangRoomPick } from "@/game/rooms";
import { press } from "@/lib/press";


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
    <div className="flex gap-2 overflow-x-auto pb-1" data-hang-rooms="">
      {rooms.map((r) => {
        const on = hall === r.hall;
        return (
          <button
            key={r.hall}
            type="button"
            data-hang-pick={r.hall}
            {...vaultHangRoom(r.hall)}
            aria-pressed={on}
            disabled={disabled}
            className={`min-w-[6.4rem] overflow-hidden rounded-2xl border bg-black/50 text-left disabled:opacity-40 ${
              on ? "border-[#9ef0e4]/70 ring-1 ring-[#9ef0e4]/35" : "border-white/25"
            }`}
            style={{ touchAction: "manipulation" }}
            {...press(() => {
              if (disabled) return;
              onHall(r.hall);
            })}
          >
            {r.still ? (
              <img src={r.still} alt="" className="h-[4.4rem] w-full object-cover" />
            ) : (
              <div className="h-[4.4rem] w-full bg-[linear-gradient(180deg,rgba(158,240,228,0.16),rgba(7,8,12,0.7))]" />
            )}
            <span
              className={`block px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
                on ? "text-[#9ef0e4]" : "text-white/65"
              }`}
            >
              Room {r.hall}
              {r.living ? " · here" : rooms.length === 1 ? " · only" : ""}
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
}: {
  door: "A" | "B";
  name: string;
  rooms: HangRoomPick[];
  hall: number;
  onHall: (n: number) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const release = swallowOpeningTap(HANG_LEFTOVER_SWALLOW_MS);
    const t = window.setTimeout(() => setArmed(true), HANG_CONFIRM_ARM_MS);
    return () => {
      release();
      window.clearTimeout(t);
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col bg-black/92 px-5 pt-[max(1.6rem,env(safe-area-inset-top))] pb-[max(1.6rem,env(safe-area-inset-bottom))]"
      data-hang-ask={door}
      data-hang-sheet="1"
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
        Pick the citadel room, then hang door {door}.
      </p>
      <p className="mt-5 mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#9ef0e4]">
        {rooms.length > 1 ? `${rooms.length} rooms · tap one` : "one room · confirm to hang"}
      </p>
      <HangRoomStrip rooms={rooms} hall={hall} onHall={onHall} />
      {armed ? (
        <button
          type="button"
          data-hang-confirm={door}
          {...vaultHangRoom(hall)}
          className="mt-6 rounded-2xl border border-[#9ef0e4]/50 px-4 py-3 font-display text-2xl text-[#9ef0e4]"
          style={{ touchAction: "manipulation" }}
          {...press(onConfirm)}
        >
          Hang {door} · room {hall}
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
