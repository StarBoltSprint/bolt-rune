import { CLIP_SPEC_EVENT, readClipSpec, writeClipSpec, type ClipRes, type ClipSecs } from "@/game/cook";
import { press } from "@/lib/press";
import { useEffect, useState } from "react";

const SECS: ClipSecs[] = [6, 10, 15];
const RES: ClipRes[] = ["720", "1080"];

export function ClipSpecBar({ disabled, compact }: { disabled?: boolean; compact?: boolean }) {
  const [spec, setSpec] = useState(readClipSpec);

  useEffect(() => {
    function sync() {
      setSpec(readClipSpec());
    }
    sync();
    window.addEventListener(CLIP_SPEC_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CLIP_SPEC_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function pick(secs?: ClipSecs, res?: ClipRes) {
    setSpec((cur) => {
      const next = { secs: secs ?? cur.secs, res: res ?? cur.res };
      writeClipSpec(next.secs, next.res);
      return next;
    });
  }

  if (compact) {
    return (
      <div
        data-clip-spec="card"
        data-clip-secs={spec.secs}
        data-clip-res={spec.res}
        className="flex w-full flex-col items-center gap-1.5"
        style={{ touchAction: "manipulation" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">
          Next continue / shift · {spec.secs}s · {spec.res}p
        </p>
        <div className="flex flex-wrap justify-center gap-1.5">
          {SECS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              data-clip-secs-pick={s}
              className={`inline-flex min-h-8 items-center justify-center rounded-full border px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] disabled:opacity-40 ${
                spec.secs === s
                  ? "border-[#e4c37a]/55 bg-[#e4c37a]/20 text-[#f0d48a]"
                  : "border-white/18 bg-black/45 text-white/60"
              }`}
              style={{ touchAction: "manipulation" }}
              {...press(() => pick(s))}
            >
              {s}s
            </button>
          ))}
          <span className="mx-0.5 w-px self-stretch bg-white/18" aria-hidden />
          {RES.map((r) => (
            <button
              key={r}
              type="button"
              disabled={disabled}
              data-clip-res-pick={r}
              className={`inline-flex min-h-8 items-center justify-center rounded-full border px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] disabled:opacity-40 ${
                spec.res === r
                  ? "border-[#9ef0e4]/50 bg-[#9ef0e4]/18 text-[#9ef0e4]"
                  : "border-white/18 bg-black/45 text-white/60"
              }`}
              style={{ touchAction: "manipulation" }}
              {...press(() => pick(undefined, r))}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      data-clip-spec="sheet"
      data-clip-secs={spec.secs}
      data-clip-res={spec.res}
      className="w-full rounded-2xl border border-white/16 bg-black/55 px-3 py-3"
      style={{ touchAction: "manipulation" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-white/40">Length</p>
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#e4c37a]/80">
          {spec.secs}s · {spec.res}p
        </p>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {SECS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            data-clip-secs-pick={s}
            className={`min-h-11 rounded-xl font-mono text-[12px] tracking-[0.08em] ${
              spec.secs === s ? "bg-[#e4c37a] text-black" : "bg-white/8 text-white/65"
            } disabled:opacity-40`}
            style={{ touchAction: "manipulation" }}
            {...press(() => pick(s))}
          >
            {s}s
          </button>
        ))}
      </div>
      <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.22em] text-white/40">Picture</p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {RES.map((r) => (
          <button
            key={r}
            type="button"
            disabled={disabled}
            data-clip-res-pick={r}
            className={`min-h-11 rounded-xl font-mono text-[12px] tracking-[0.08em] ${
              spec.res === r ? "bg-[#9ef0e4] text-black" : "bg-white/8 text-white/65"
            } disabled:opacity-40`}
            style={{ touchAction: "manipulation" }}
            {...press(() => pick(undefined, r))}
          >
            {r}p
          </button>
        ))}
      </div>
    </div>
  );
}
