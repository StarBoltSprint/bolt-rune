import { useEffect, useRef, useState } from "react";

type Ring = { id: number; x: number; y: number };

export function TapWave() {
  const [rings, setRings] = useState<Ring[]>([]);
  const n = useRef(0);

  useEffect(() => {
    const on = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const id = ++n.current;
      const x = e.clientX;
      const y = e.clientY;
      setRings((r) => [...r.slice(-4), { id, x, y }]);
      window.setTimeout(() => {
        setRings((r) => r.filter((w) => w.id !== id));
      }, 720);
    };
    window.addEventListener("pointerdown", on, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", on, true);
  }, []);

  if (!rings.length) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[240] overflow-hidden" aria-hidden>
      {rings.map((w) => (
        <span
          key={w.id}
          className="tap-wave"
          style={{ left: w.x, top: w.y }}
        >
          <i />
          <i />
          <i />
        </span>
      ))}
    </div>
  );
}
