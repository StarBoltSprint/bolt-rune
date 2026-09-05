import { useEffect, useRef, useState, type PointerEvent as PE } from "react";
import { CANYON_APPROACH, projectHazard } from "@/game/canyon";
import type { Beat } from "@/game/films";

type Clock = { t: number; i: number; hold: number; mash: number; need: number };

type Props = {
  beats: Beat[];
  getClock: () => Clock;
  reduced: boolean;
  onMarkDown: (e: PE<HTMLButtonElement>, beat: Beat) => void;
  onMarkUp: (e: PE<HTMLButtonElement>) => void;
};

export function HazardLayer({ beats, getClock, reduced, onMarkDown, onMarkUp }: Props) {
  const getClockRef = useRef(getClock);
  getClockRef.current = getClock;
  const [, bump] = useState(0);
  const clock = useRef<Clock>({ t: 0, i: 0, hold: 0, mash: 0, need: 1 });
  useEffect(() => {
    let r = 0;
    const tick = () => {
      clock.current = getClockRef.current();
      bump((n) => (n + 1) & 1023);
      r = requestAnimationFrame(tick);
    };
    r = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(r);
  }, []);

  const { t, i, hold, mash, need } = clock.current;
  const visible: Beat[] = [];
  for (let n = i; n < beats.length && n < i + 4; n++) {
    const b = beats[n]!;
    if (!b.canyon) continue;
    const until = b.at - t;
    if (until < CANYON_APPROACH && until > -b.win * 0.28) visible.push(b);
  }

  return (
    <>
      {visible.map((beat) => {
        const until = beat.at - t;
        const p = Math.max(0, Math.min(1.12, 1 - until / CANYON_APPROACH));
        const current = beat.id === beats[i]?.id;
        const proj = projectHazard(beat.canyon!, p);
        if (!current && proj.scale < 0.28) return null;
        const size = current ? 108 : 86;
        return (
          <button
            key={beat.id}
            type="button"
            aria-label={beat.label}
            className={`absolute z-10 ${current ? "" : "pointer-events-none"}`}
            style={{
              left: `${proj.x * 100}%`,
              top: `${proj.y * 100}%`,
              width: size,
              height: size,
              transform: `translate3d(-50%,-50%,0) rotate(${proj.roll}deg) scale(${proj.scale})`,
              opacity: proj.opacity,
            }}
            onPointerDown={(e) => onMarkDown(e, beat)}
            onPointerUp={onMarkUp}
            onPointerCancel={onMarkUp}
          >
            <Shard kind={beat.kind} current={current} mash={current ? mash / need : 0} hold={current ? hold : 0} reduced={reduced} />
            <span
              className={`absolute inset-x-0 bottom-[8%] text-center font-display text-sm tracking-wide ${
                current ? "text-ice" : "text-muted"
              }`}
            >
              {beat.label}
              {current && beat.kind === "mash" ? ` ${mash}/${need}` : ""}
              {current && beat.kind === "swipe" ? (beat.lane === "l" ? " ←" : " →") : ""}
            </span>
          </button>
        );
      })}
    </>
  );
}

function Shard({
  kind,
  current,
  mash,
  hold,
  reduced,
}: {
  kind: Beat["kind"];
  current: boolean;
  mash: number;
  hold: number;
  reduced: boolean;
}) {
  const stroke = current ? "#9ec9d4" : "#5c676e";
  const fill = current ? "rgba(16,18,24,0.55)" : "rgba(16,18,24,0.35)";
  const ice = "#9ec9d4";
  return (
    <svg viewBox="0 0 80 80" className="absolute inset-0 h-full w-full" aria-hidden>
      {kind === "relic" ? (
        <>
          <circle cx="40" cy="36" r="22" fill="rgba(158,201,212,0.12)" stroke={ice} strokeWidth="1.4" />
          <circle cx="40" cy="36" r="11" fill="rgba(197,212,220,0.35)" />
          {!reduced && current && (
            <circle cx="40" cy="36" r="28" fill="none" stroke={ice} strokeOpacity="0.35" />
          )}
        </>
      ) : kind === "hold" ? (
        <>
          <polygon points="40,6 70,40 40,74 10,40" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <polygon points="40,18 58,40 40,62 22,40" fill="none" stroke={ice} strokeWidth="1.1" opacity="0.8" />
          <rect x="18" y="68" width={44 * hold} height="4" rx="2" fill="#d4c4a8" />
        </>
      ) : kind === "mash" ? (
        <>
          <polygon points="18,14 62,10 74,46 50,72 12,60" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <polygon points="28,22 54,20 62,44 40,62 20,50" fill="none" stroke={ice} strokeWidth="1" opacity={0.4 + mash * 0.6} />
        </>
      ) : kind === "swipe" ? (
        <>
          <polygon points="12,28 68,18 70,42 14,58" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <polyline points="22,40 50,34 42,28" fill="none" stroke={ice} strokeWidth="2" />
          <polyline points="50,34 42,46" fill="none" stroke={ice} strokeWidth="2" />
        </>
      ) : (
        <>
          <polygon points="40,8 66,30 56,70 24,70 14,30" fill={fill} stroke={stroke} strokeWidth="1.6" />
          <polygon points="40,18 54,32 48,60 32,60 26,32" fill="rgba(158,201,212,0.12)" stroke={ice} strokeWidth="0.9" />
        </>
      )}
    </svg>
  );
}