import { useEffect, useRef } from "react";

export type Mark = "center" | "left" | "right" | "bell";

function box(w: number, h: number) {
  const ar = 9 / 16;
  let fw = w;
  let fh = w / ar;
  if (fh > h) {
    fh = h;
    fw = h * ar;
  }
  return { x: (w - fw) / 2, y: (h - fh) / 2, w: fw, h: fh };
}

type Spark = { x: number; y: number; vx: number; vy: number; life: number; rgb: string; r: number };

export function ForgeAura({ walking }: { mark: Mark; walking: boolean }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const walkRef = useRef(walking);
  walkRef.current = walking;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d", { alpha: true });
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let tick = 0;
    const sparks: Spark[] = [];
    const mouths = [
      { x: 0.135, y: 0.56, rgb: "90,220,180" },
      { x: 0.865, y: 0.54, rgb: "255,150,55" },
      { x: 0.42, y: 0.52, rgb: "120,240,220" },
    ];

    function fit() {
      const p = el!.parentElement;
      if (!p) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = p.clientWidth;
      const h = p.clientHeight;
      el!.width = Math.max(1, Math.floor(w * dpr));
      el!.height = Math.max(1, Math.floor(h * dpr));
      el!.style.width = `${w}px`;
      el!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn() {
      if (reduce || walkRef.current) return;
      for (const m of mouths) {
        if (Math.random() > 0.55) continue;
        sparks.push({
          x: m.x + (Math.random() - 0.5) * 0.04,
          y: m.y + (Math.random() - 0.5) * 0.03,
          vx: (Math.random() - 0.5) * 0.0008,
          vy: -0.0012 - Math.random() * 0.0014,
          life: 0.7 + Math.random() * 0.6,
          rgb: m.rgb,
          r: 1.2 + Math.random() * 1.8,
        });
      }
    }

    function step() {
      const p = el!.parentElement;
      if (!p || !ctx) return;
      const w = p.clientWidth;
      const h = p.clientHeight;
      const f = box(w, h);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(f.x, f.y);
      tick += 1;
      const t = reduce ? 0 : tick / 60;
      if (tick % 3 === 0) spawn();
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]!;
        s.x += s.vx;
        s.y += s.vy;
        s.life -= 0.016;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.fillStyle = `rgba(${s.rgb},${Math.max(0, s.life * 0.45)})`;
        ctx.beginPath();
        ctx.arc(s.x * f.w, s.y * f.h, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      const flicker = walkRef.current ? 0.04 : 0.1 + Math.sin(t * 5.4) * 0.03;
      for (const m of mouths) {
        const g = ctx.createRadialGradient(m.x * f.w, m.y * f.h, 2, m.x * f.w, m.y * f.h, 0.055 * f.w);
        g.addColorStop(0, `rgba(${m.rgb},${flicker})`);
        g.addColorStop(1, `rgba(${m.rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(m.x * f.w - 0.05 * f.w, m.y * f.h - 0.08 * f.h, 0.1 * f.w, 0.16 * f.h);
      }
      ctx.restore();
      raf = window.requestAnimationFrame(step);
    }

    fit();
    raf = window.requestAnimationFrame(step);
    const ro = new ResizeObserver(fit);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvas} className="forge-aura" data-aura="v5" aria-hidden />;
}
