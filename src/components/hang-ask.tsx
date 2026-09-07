import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { vaultHangRoom } from "@/game/path-entry";
import {
  HANG_CONFIRM_ARM_MS,
  HANG_LEFTOVER_SWALLOW_MS,
  hangBindHall,
  hangCardHall,
  hangStillLane,
  hangStillSwipe,
  hangStillWrap,
  hangStripCards,
  hangStripPick,
  swallowOpeningTap,
} from "@/game/hang-ask";
import { type HangCitadelPick, type HangRoomPick } from "@/game/rooms";
import { press } from "@/lib/press";

const CHIP = {
  ice: "border-[#9ef0e4]/40 text-[#9ef0e4]",
  gold: "border-[#e4c37a]/40 text-[#f0d48a]",
  quiet: "border-white/22 text-white/75",
  warn: "border-[#f0b4a8]/35 text-[#f0b4a8]",
} as const;

export function StillChip({
  children,
  tone = "ice",
  disabled,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: keyof typeof CHIP;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`inline-flex min-h-11 flex-col items-center justify-center rounded-full border bg-black/55 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] disabled:opacity-30 ${CHIP[tone]} ${className}`}
      style={{ touchAction: "manipulation" }}
      {...rest}
    >
      {children}
    </button>
  );
}

function StillDots({ count, index }: { count: number; index: number }) {
  if (count <= 1) return null;
  return (
    <div className="pointer-events-none mb-2 flex justify-center gap-1.5" data-hang-dots={count}>
      {Array.from({ length: count }, (_, d) => (
        <span key={d} className={`h-1 w-1 rounded-full ${d === index ? "bg-white/80" : "bg-white/25"}`} />
      ))}
    </div>
  );
}

function StillActions({
  title,
  count,
  index,
  children,
}: {
  title?: string;
  count: number;
  index: number;
  children?: ReactNode;
}) {
  return (
    <div
      data-still-actions=""
      className="absolute inset-x-0 bottom-0 z-20 px-4 pb-[max(1.1rem,env(safe-area-inset-bottom))] pt-16"
      style={{
        background: "linear-gradient(180deg, transparent, rgba(7,8,12,0.86) 38%)",
        touchAction: "manipulation",
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {title ? (
        <p className="mb-2 text-center font-display text-[1.7rem] leading-none text-white/92 drop-shadow-[0_8px_18px_rgba(0,0,0,0.85)]">
          {title}
        </p>
      ) : null}
      <StillDots count={count} index={index} />
      {children ? <div className="flex flex-col items-center gap-2">{children}</div> : null}
    </div>
  );
}

function StillStage({
  still,
  index,
  count,
  onNext,
  onPrev,
  onLock,
  onBack,
  onDrop,
  dropArmed,
  disabled,
  kind,
  lockAttr,
  title,
  actions,
}: {
  still: string;
  index: number;
  count: number;
  onNext: () => void;
  onPrev: () => void;
  onLock: () => void;
  onBack: () => void;
  onDrop?: () => void;
  dropArmed?: boolean;
  disabled?: boolean;
  kind: "citadel" | "room" | "load" | "vault";
  lockAttr?: Record<string, string | number | undefined>;
  title?: string;
  actions?: ReactNode;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const n = Math.max(1, count);
  const i = hangStillWrap(n, index, 0);
  function end(e: React.PointerEvent) {
    if (disabled) return;
    const from = start.current;
    start.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    const swipe = hangStillSwipe(dx, dy);
    if (swipe === 1) {
      onNext();
      return;
    }
    if (swipe === -1) {
      onPrev();
      return;
    }
    const box = e.currentTarget.getBoundingClientRect();
    const nx = box.width ? (e.clientX - box.left) / box.width : 0.5;
    if (hangStillLane(nx) === "back") {
      onBack();
      return;
    }
    onLock();
  }
  return (
    <div
      className="absolute inset-0 overflow-hidden bg-[#07080c]"
      data-still-carousel={kind}
      data-still-index={i}
      data-still-count={n}
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        e.stopPropagation();
        start.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        end(e);
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
    >
      {still ? (
        <img src={still} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(158,240,228,0.16),rgba(7,8,12,0.85))]" />
      )}
      <button
        type="button"
        aria-label="back"
        data-still-back=""
        className="absolute left-5 top-[max(1.2rem,env(safe-area-inset-top))] z-10 font-mono text-[18px] leading-none text-white/70"
        style={{ touchAction: "manipulation" }}
        onPointerDown={(e) => e.stopPropagation()}
        {...press(() => {
          if (disabled) return;
          onBack();
        })}
      >
        ×
      </button>
      {onDrop ? (
        <button
          type="button"
          aria-label={dropArmed ? "confirm drop" : "drop room"}
          data-load-drop=""
          data-load-drop-arm={dropArmed ? "1" : "0"}
          className={`absolute right-5 top-[max(1.2rem,env(safe-area-inset-top))] z-10 font-mono text-[11px] uppercase tracking-[0.22em] ${
            dropArmed ? "text-danger" : "text-white/55"
          }`}
          style={{ touchAction: "manipulation" }}
          onPointerDown={(e) => e.stopPropagation()}
          {...press(() => {
            if (disabled) return;
            onDrop();
          })}
        >
          {dropArmed ? "drop?" : "drop"}
        </button>
      ) : null}
      {title || actions || n > 1 ? (
        <StillActions title={title} count={n} index={i}>
          {actions}
        </StillActions>
      ) : null}
      {lockAttr ? (
        <span
          className="sr-only"
          {...lockAttr}
        />
      ) : null}
    </div>
  );
}

export function HangCitadelStrip({
  citadels,
  citadel,
  onCitadel,
  onBack,
  disabled,
  actions,
}: {
  citadels: HangCitadelPick[];
  citadel: string;
  onCitadel: (id: string) => void;
  onBack?: () => void;
  disabled?: boolean;
  actions?: ReactNode;
}) {
  const start = Math.max(0, citadels.findIndex((c) => c.id === citadel));
  const [at, setAt] = useState(start);
  useEffect(() => {
    setAt(Math.max(0, citadels.findIndex((c) => c.id === citadel)));
  }, [citadel, citadels]);
  if (citadels.length <= 1) return null;
  const shown = citadels[hangStillWrap(citadels.length, at, 0)] || citadels[0];
  if (!shown) return null;
  return (
    <div className="absolute inset-0" data-hang-citadels={citadels.length}>
      <StillStage
        kind="citadel"
        still={shown.thumb}
        index={at}
        count={citadels.length}
        disabled={disabled}
        lockAttr={{ "data-hang-citadel-pick": shown.id }}
        title={shown.title || "Citadel"}
        actions={
          actions ?? (
            <StillChip
              data-hang-citadel-lock={shown.id}
              disabled={disabled}
              onPointerDown={(e) => e.stopPropagation()}
              {...press(() => {
                if (disabled) return;
                onCitadel(shown.id);
              })}
            >
              Lock
            </StillChip>
          )
        }
        onNext={() => {
          if (disabled) return;
          setAt((i) => hangStillWrap(citadels.length, i, 1));
        }}
        onPrev={() => {
          if (disabled) return;
          setAt((i) => hangStillWrap(citadels.length, i, -1));
        }}
        onLock={() => {
          if (disabled) return;
          onCitadel(shown.id);
        }}
        onBack={() => {
          if (disabled) return;
          onBack?.();
        }}
      />
    </div>
  );
}

export function HangRoomStrip({
  rooms,
  hall,
  onHall,
  onLock,
  onBack,
  disabled,
  actions,
}: {
  rooms: HangRoomPick[];
  hall: number;
  onHall: (n: number) => void;
  onLock?: (n: number) => void;
  onBack?: () => void;
  disabled?: boolean;
  actions?: ReactNode;
}) {
  const cards = hangStripCards(rooms);
  const idx = Math.max(0, cards.findIndex((c) => c.hall === hangCardHall(hall)));
  const card = cards[idx] || cards[0] || { index: 0, hall: hangCardHall(hall) || 1 };
  const n = card.hall;
  const r = rooms[card.index];
  const pick = (from?: string | null) => {
    if (disabled) return;
    onHall(hangCardHall(from) || hangStripPick(rooms, card.index) || n);
  };
  return (
    <div className="absolute inset-0" data-hang-rooms="" data-hang-load-halls={rooms.length}>
      <StillStage
        kind="room"
        still={r?.still || ""}
        index={idx}
        count={Math.max(1, cards.length)}
        disabled={disabled}
        lockAttr={{
          "data-hang-pick": n,
          "data-hang-card-index": card.index,
          ...vaultHangRoom(n),
        }}
        title={r?.name || `Room ${n}`}
        actions={
          actions ?? (
            <StillChip
              data-hang-room-lock={n}
              disabled={disabled}
              onPointerDown={(e) => e.stopPropagation()}
              {...press(() => {
                if (disabled) return;
                pick(String(n));
                onLock?.(hangCardHall(n) || n);
              })}
            >
              Walk this hall
            </StillChip>
          )
        }
        onNext={() => {
          if (disabled || cards.length <= 1) return;
          const next = cards[hangStillWrap(cards.length, idx, 1)];
          if (next) onHall(hangStripPick(rooms, next.index) || next.hall);
        }}
        onPrev={() => {
          if (disabled || cards.length <= 1) return;
          const next = cards[hangStillWrap(cards.length, idx, -1)];
          if (next) onHall(hangStripPick(rooms, next.index) || next.hall);
        }}
        onLock={() => {
          if (disabled) return;
          pick(String(n));
          onLock?.(hangCardHall(n) || n);
        }}
        onBack={() => {
          if (disabled) return;
          onBack?.();
        }}
      />
      <button
        type="button"
        data-hang-pick={n}
        data-hang-card-index={card.index}
        {...vaultHangRoom(n)}
        className="sr-only"
        disabled={disabled}
        onPointerDown={(e) => {
          e.stopPropagation();
          pick(e.currentTarget.getAttribute("data-hang-pick"));
        }}
        {...press(() => pick(String(n)))}
      >
        Room {n}
      </button>
    </div>
  );
}

export function StillCarousel({
  still,
  index,
  count,
  onNext,
  onPrev,
  onLock,
  onBack,
  onDrop,
  dropArmed,
  disabled,
  kind,
  title,
  actions,
}: {
  still: string;
  index: number;
  count: number;
  onNext: () => void;
  onPrev: () => void;
  onLock: () => void;
  onBack: () => void;
  onDrop?: () => void;
  dropArmed?: boolean;
  disabled?: boolean;
  kind: "load" | "vault";
  title?: string;
  actions?: ReactNode;
}) {
  return (
    <StillStage
      still={still}
      index={index}
      count={count}
      onNext={onNext}
      onPrev={onPrev}
      onLock={onLock}
      onBack={onBack}
      onDrop={onDrop}
      dropArmed={dropArmed}
      disabled={disabled}
      kind={kind}
      title={title}
      actions={actions}
    />
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
  const [step, setStep] = useState<"citadel" | "room">(citadels.length > 1 ? "citadel" : "room");
  const pickedRef = useRef(picked);
  const choseRef = useRef(false);
  const citadelRef = useRef(citadel);
  const lockedCitadel = useRef(citadels.length <= 1);
  void name;
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
      if (lockedCitadel.current) setStep("room");
      return;
    }
    const same = rooms[0]?.citadel && held[0]?.citadel && rooms[0].citadel === held[0].citadel;
    if (!same && rooms.length) {
      setHeld(rooms);
      return;
    }
    /* Load drop shrinks the same citadel — do not keep orphan Room N. */
    if (same && rooms.length < held.length) {
      setHeld(rooms);
      if (!rooms.some((r) => r.hall === pickedRef.current)) {
        const next = hangCardHall(hall) || rooms[0]?.hall || 1;
        pickedRef.current = next;
        setPicked(next);
      }
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
  useEffect(() => {
    if (citadels.length > 1 && !lockedCitadel.current) setStep("citadel");
    if (citadels.length <= 1) {
      lockedCitadel.current = true;
      setStep("room");
    }
  }, [citadels.length]);
  const picks = held.length >= rooms.length && (!citadel || held[0]?.citadel === citadel || !held[0]?.citadel) ? held : rooms;
  function pickHall(n: number) {
    const next = hangCardHall(n) || 1;
    choseRef.current = true;
    pickedRef.current = next;
    setPicked(next);
    onHall(next);
  }
  function lockRoom() {
    if (!armed) return;
    onConfirm(hangBindHall(picked) || hangBindHall(pickedRef.current));
  }
  function lockCitadel(id: string) {
    lockedCitadel.current = true;
    onCitadel?.(id);
    setStep("room");
  }
  return (
    <div
      className="fixed inset-0 z-[90] bg-[#07080c]"
      data-hang-ask={door}
      data-hang-sheet="1"
      data-hang-load-halls={picks.length}
      data-hang-picked={picked}
      data-hang-citadel={citadel || undefined}
      data-hang-armed={armed ? "1" : "0"}
      data-hang-step={step}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {step === "citadel" && citadels.length > 1 ? (
        <HangCitadelStrip
          citadels={citadels}
          citadel={citadel}
          onCitadel={lockCitadel}
          onBack={onClose}
        />
      ) : (
        <HangRoomStrip
          rooms={picks}
          hall={picked}
          onHall={pickHall}
          onLock={lockRoom}
          onBack={() => {
            if (citadels.length > 1) {
              lockedCitadel.current = false;
              setStep("citadel");
              return;
            }
            onClose();
          }}
          actions={
            armed ? (
              <StillChip
                data-hang-confirm={door}
                {...vaultHangRoom(picked)}
                onPointerDown={(e) => e.stopPropagation()}
                {...press(() => onConfirm(hangBindHall(picked) || hangBindHall(pickedRef.current)))}
              >
                Walk this hall
                <span className="mt-0.5 block text-[8px] tracking-[0.12em] text-white/45">
                  Hang {door} · room {picked}
                </span>
              </StillChip>
            ) : (
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45" data-hang-confirm-wait={door}>
                pick a room — then confirm
              </p>
            )
          }
        />
      )}
    </div>
  );
}
