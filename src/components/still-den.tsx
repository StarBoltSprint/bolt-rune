import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { press } from "@/lib/press";

type Path = "main" | "river" | "thicket";

type Props = {
  still: string;
  path: Path;
  dusk: boolean;
  onExit: () => void;
};

type DenMark = {
  id: string;
  z: number;
  x: number;
  label: string;
  hold?: boolean;
};

const MARKS: DenMark[] = [
  { id: "d1", z: 0.4, x: 0, label: "TAP" },
  { id: "d2", z: -4.4, x: -0.55, label: "VAULT" },
  { id: "d3", z: -8.8, x: 0.62, label: "DODGE" },
  { id: "d4", z: -13.2, x: 0, label: "SLIDE", hold: true },
  { id: "d5", z: -17.6, x: -0.48, label: "LIGHT" },
  { id: "d6", z: -22.2, x: 0, label: "HOWL", hold: true },
];

function fogHex(path: Path, dusk: boolean) {
  if (dusk) return 0x2a1e14;
  if (path === "river") return 0x1a2428;
  if (path === "thicket") return 0x12160f;
  return 0x1a1c16;
}

type HudMark = { id: string; label: string; x: number; y: number; hold: boolean; p: number; live: boolean };

export function StillDen({ still, path, dusk, onExit }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const walking = useRef(false);
  const look = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const yaw = useRef(0);
  const pitch = useRef(0);
  const z = useRef(3.6);
  const hits = useRef<Record<string, "hit" | "miss" | "open">>({});
  const holdMs = useRef(0);
  const liveId = useRef<string | null>(null);
  const [held, setHeld] = useState(false);
  const [hud, setHud] = useState<HudMark[]>([]);
  const [score, setScore] = useState(0);
  const [miss, setMiss] = useState(0);
  const [phase, setPhase] = useState<"run" | "win" | "out">("run");
  const phaseRef = useRef<"run" | "win" | "out">("run");

  useEffect(() => {
    MARKS.forEach((m) => {
      hits.current[m.id] = "open";
    });
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const size = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      return { w: Math.max(2, w), h: Math.max(2, h) };
    };
    let { w, h } = size();
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    renderer.setSize(w, h, false);
    renderer.setClearColor(fogHex(path, dusk), 1);
    const canvas = renderer.domElement;
    canvas.style.cssText = "width:100%;height:100%;display:block;touch-action:none;";
    el.appendChild(canvas);

    const scene = new THREE.Scene();
    const fogCol = new THREE.Color(fogHex(path, dusk));
    scene.fog = new THREE.FogExp2(fogCol, 0.07);
    scene.background = fogCol;

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.12, 80);
    camera.position.set(0, 1.52, z.current);

    const loader = new THREE.TextureLoader();
    const tex = (url: string, wrap = false) => {
      const t = loader.load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      if (wrap) {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
      }
      return t;
    };
    const woods = tex("/films/den-path-p.jpg");
    const groundMap = tex("/films/den-ground.jpg", true);
    groundMap.repeat.set(3, 16);
    const treeA = tex("/films/tree-a.png");
    const treeB = tex("/films/tree-b.png");

    const geos: THREE.BufferGeometry[] = [];
    const mats: THREE.Material[] = [];
    const track = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      geos.push(geo);
      mats.push(mat);
    };

    const groundGeo = new THREE.PlaneGeometry(10, 40);
    const groundMat = new THREE.MeshBasicMaterial({ map: groundMap, fog: true, color: 0x6a6358 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    track(groundGeo, groundMat);

    const farGeo = new THREE.PlaneGeometry(22, 16);
    const farMat = new THREE.MeshBasicMaterial({ map: woods, fog: true, color: 0x9aa090 });
    const far = new THREE.Mesh(farGeo, farMat);
    far.position.set(0, 5.4, -24);
    scene.add(far);
    track(farGeo, farMat);

    const boardGeo = new THREE.PlaneGeometry(3.6, 7.4);
    const matA = new THREE.MeshBasicMaterial({
      map: treeA,
      alphaTest: 0.5,
      fog: true,
      side: THREE.DoubleSide,
      depthWrite: true,
      transparent: false,
    });
    const matB = new THREE.MeshBasicMaterial({
      map: treeB,
      alphaTest: 0.5,
      fog: true,
      side: THREE.DoubleSide,
      depthWrite: true,
      transparent: false,
    });
    track(boardGeo, matA);
    track(boardGeo, matB);

    const trees: THREE.Group[] = [];
    const TREE_N = 26;
    const TREE_STEP = 2.1;
    for (let i = 0; i < TREE_N; i++) {
      const g = new THREE.Group();
      const mat = i % 2 === 0 ? matA : matB;
      g.add(new THREE.Mesh(boardGeo, mat));
      const side = i % 2 === 0 ? -1 : 1;
      g.position.set(side * (2.7 + (i % 5) * 0.7), 3.55, -i * TREE_STEP);
      g.scale.setScalar(1.05 + (i % 4) * 0.18);
      scene.add(g);
      trees.push(g);
    }

    const tmp = new THREE.Vector3();
    let raf = 0;
    let live = true;
    let lastHud = 0;
    const loop = TREE_STEP * TREE_N;
    const tick = (now: number) => {
      if (!live) return;
      if (phaseRef.current === "run" && walking.current) {
        z.current = Math.max(-25.2, z.current - 0.13);
      }
      const bob = walking.current ? Math.sin(now * 0.014) * 0.035 : 0;
      camera.position.set(0, 1.5 + bob, z.current);
      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw.current * 0.35;
      camera.rotation.x = -0.05 + pitch.current * 0.2;
      ground.position.z = z.current - 8;
      far.position.z = z.current - 22;
      groundMap.offset.y = z.current * 0.04;
      for (const t of trees) {
        while (t.position.z > z.current + 3.5) t.position.z -= loop;
        t.lookAt(camera.position.x, t.position.y, camera.position.z);
      }
      renderer.render(scene, camera);

      if (phaseRef.current === "run" && now - lastHud > 70) {
        lastHud = now;
        let current: string | null = null;
        const next: HudMark[] = [];
        for (const m of MARKS) {
          const st = hits.current[m.id];
          const dist = z.current - m.z;
          if (st === "open" && dist < -0.55) {
            hits.current[m.id] = "miss";
            setMiss((n) => {
              const v = n + 1;
              if (v >= 3) {
                phaseRef.current = "out";
                setPhase("out");
              }
              return v;
            });
            continue;
          }
          if (st !== "open") continue;
          if (dist > 2.6 || dist < -0.45) continue;
          tmp.set(m.x, 1.15, m.z);
          tmp.project(camera);
          const p = Math.max(0, Math.min(1, 1 - dist / 2.6));
          const liveMark = dist < 1.35;
          if (liveMark) current = m.id;
          next.push({
            id: m.id,
            label: m.label,
            x: tmp.x * 0.5 + 0.5,
            y: -tmp.y * 0.5 + 0.5,
            hold: Boolean(m.hold),
            p,
            live: liveMark,
          });
        }
        liveId.current = current;
        if (current && MARKS.find((m) => m.id === current)?.hold && walking.current) {
          holdMs.current += 70;
          if (holdMs.current > 420) {
            hits.current[current] = "hit";
            holdMs.current = 0;
            setScore((s) => s + 280);
          }
        }
        setHud(next);
        if (z.current <= -24.8 && MARKS.every((m) => hits.current[m.id] !== "open")) {
          phaseRef.current = "win";
          setPhase("win");
        } else if (z.current <= -24.8) {
          phaseRef.current = "win";
          setPhase("win");
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onResize = () => {
      const next = size();
      camera.aspect = next.w / next.h;
      camera.updateProjectionMatrix();
      renderer.setSize(next.w, next.h, false);
    };
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    return () => {
      live = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      woods.dispose();
      treeA.dispose();
      treeB.dispose();
      groundMap.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [still, path, dusk]);

  function strike(id: string) {
    if (phaseRef.current !== "run") return;
    if (hits.current[id] !== "open") return;
    const m = MARKS.find((x) => x.id === id);
    if (!m || liveId.current !== id) return;
    if (m.hold) return;
    hits.current[id] = "hit";
    setScore((s) => s + 220);
  }

  function lookDown(e: React.PointerEvent) {
    look.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function lookMove(e: React.PointerEvent) {
    if (!look.current) return;
    yaw.current -= (e.clientX - last.current.x) * 0.005;
    pitch.current = Math.max(-0.3, Math.min(0.18, pitch.current - (e.clientY - last.current.y) * 0.004));
    last.current = { x: e.clientX, y: e.clientY };
  }
  function lookUp() {
    look.current = false;
  }
  function walkStart(e: React.PointerEvent | React.TouchEvent) {
    e.preventDefault();
    e.stopPropagation();
    walking.current = true;
    setHeld(true);
    if ("pointerId" in e) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* */
      }
    }
  }
  function walkEnd() {
    walking.current = false;
    setHeld(false);
    holdMs.current = 0;
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg text-fg" style={{ touchAction: "none" }}>
      <div
        ref={host}
        className="absolute inset-0"
        style={{ touchAction: "none" }}
        onPointerDown={lookDown}
        onPointerMove={lookMove}
        onPointerUp={lookUp}
        onPointerCancel={lookUp}
      />
      {hud.map((m) => (
        <button
          key={m.id}
          type="button"
          aria-label={m.label}
          className={`absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border ${
            m.live ? "border-ice bg-accent text-bg" : "pointer-events-none border-line bg-bg/50 text-muted"
          }`}
          style={{
            left: `${m.x * 100}%`,
            top: `${m.y * 100}%`,
            width: m.live ? 104 : 80,
            height: m.live ? 104 : 80,
            opacity: m.live ? 1 : 0.4 + m.p * 0.5,
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (m.hold) {
              holdMs.current = 1;
              const t0 = performance.now();
              const up = () => {
                window.removeEventListener("pointerup", up);
                if (liveId.current === m.id && performance.now() - t0 > 400 && hits.current[m.id] === "open") {
                  hits.current[m.id] = "hit";
                  setScore((s) => s + 280);
                }
                holdMs.current = 0;
              };
              window.addEventListener("pointerup", up, { once: true });
              return;
            }
            strike(m.id);
          }}
        >
          <span className="font-display text-sm">{m.label}</span>
        </button>
      ))}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          className="pointer-events-auto z-30 min-h-11 rounded-xl border border-line bg-bg/80 px-3 font-mono text-[11px] uppercase tracking-[0.16em]"
          {...press(onExit)}
        >
          Leave
        </button>
        <div className="text-right">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ice">Still den</p>
          <p className="font-mono text-sm tabular-nums text-accent">{score}</p>
          <p className="font-mono text-[11px] text-muted">{miss}/3 miss</p>
        </div>
      </header>
      {phase !== "run" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-bg/55 px-6 text-center">
          <p className="font-display text-5xl text-ice">{phase === "win" ? "The den holds" : "The cut broke"}</p>
          <p className="font-mono text-sm">{score} · {miss} miss</p>
          <button type="button" className="min-h-12 rounded-xl bg-accent px-5 text-sm text-bg" {...press(onExit)}>
            Back
          </button>
        </div>
      )}
      {phase === "run" && (
        <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[max(1.2rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            className={`min-h-14 min-w-[70%] rounded-xl px-6 text-sm font-medium ${
              held ? "bg-ice text-bg" : "border border-ice bg-bg/80 text-ice"
            }`}
            style={{ touchAction: "none" }}
            onPointerDown={walkStart}
            onPointerUp={walkEnd}
            onPointerCancel={walkEnd}
            onTouchStart={walkStart}
            onTouchEnd={walkEnd}
            onContextMenu={(e) => e.preventDefault()}
          >
            {held ? "Walking…" : "Hold to walk"}
          </button>
        </div>
      )}
    </div>
  );
}
