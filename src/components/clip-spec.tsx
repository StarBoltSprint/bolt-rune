import { readClipSpec, writeClipSpec, type ClipRes, type ClipSecs } from "@/game/cook";
import { press } from "@/lib/press";
import { useEffect, useState } from "react";

export function ClipSpecBar({ disabled }: { disabled?: boolean }) {
  const [spec, setSpec] = useState(readClipSpec);

  useEffect(() => {
    setSpec(readClipSpec());
  }, []);

  function pick(secs?: ClipSecs, res?: ClipRes) {
    setSpec((cur) => {
      const next = { secs: secs ?? cur.secs, res: res ?? cur.res };
      writeClipSpec(next.secs, next.res);
      return next;
    });
  }

  return (
    <div
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
        {([6, 10, 15] as const).map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
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
        {(["720", "1080"] as const).map((r) => (
          <button
            key={r}
            type="button"
            disabled={disabled}
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
