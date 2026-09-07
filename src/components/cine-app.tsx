import { useEffect, useRef, useState } from "react";
import { FilmStage, type RunResult } from "@/components/film-stage";
import { type Film } from "@/game/films";
import { ENGINE, RAILS } from "@/game/laws";
import { recordRun, readSave, type Save } from "@/game/save";
import { filmOf, gradeArtifact, hangArtifact, mergeHall, readArtifacts, type HungArtifact } from "@/game/artifacts";
import { hangHall, listHall } from "@/lib/hall";
import { startBed, stopBed, stopPad, unlockAudio, setMuted, sfxForge } from "@/game/audio";
import { CookStudio } from "@/components/cook-studio";
import { ForgeAura, type Mark } from "@/components/forge-aura";
import { RuneEngine } from "@/components/rune-engine";
import { boltFull, press } from "@/lib/press";
import { boltBack, boltHome, boltDepth, locFromHash, pushBolt, readBolt, replaceBolt, sameBolt, type BoltLoc } from "@/lib/bolt-history";
import { bootCookLoc } from "@/game/cook-ready";
import { hungFilmHold, walkHungHref } from "@/game/enter-graph";

type Screen = "title" | "how" | "play" | "result" | "cook";
type From = Mark | "idle";
type Leg = { src: string; back: string; at?: number };

function Home() {
  useEffect(() => {
    try {
      stopBed();
    } catch {
      /* */
    }
  }, []);
  return (
    <div
      className="relative z-50 flex min-h-dvh flex-col bg-bg"
      data-home="3"
      style={{ touchAction: "manipulation", pointerEvents: "auto" }}
    >
      <div className="pointer-events-none px-6 pt-[max(2rem,env(safe-area-inset-top))]">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">Bolt Engine</p>
        <h1 className="mt-2 font-display text-4xl leading-none text-fg">Bolt Forge</h1>
      </div>
      <button
        type="button"
        data-go="artifacts"
        className="relative z-50 mx-4 mt-8 flex min-h-0 flex-1 items-center justify-center rounded-2xl bg-accent px-5 text-center text-2xl font-medium text-bg"
        style={{ touchAction: "manipulation", pointerEvents: "auto" }}
        onPointerUp={() => {
          window.location.hash = "artifacts";
        }}
        onClick={() => {
          window.location.hash = "artifacts";
        }}
      >
        Artifact forge
      </button>
      <button
        type="button"
        data-go="runes"
        className="relative z-50 mx-4 mt-4 mb-[max(1.5rem,env(safe-area-inset-bottom))] flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-ice bg-surface px-5 text-center text-2xl text-ice"
        style={{ touchAction: "manipulation", pointerEvents: "auto" }}
        onPointerUp={() => {
          window.location.hash = "forge/rune";
        }}
        onClick={() => {
          window.location.hash = "forge/rune";
        }}
      >
        Rune forge
      </button>
    </div>
  );
}

const IDLE: Record<Mark, Partial<Record<Mark, Leg>>> = {
  center: {
    left: { src: "/films/forge-artifacts-walk.mp4?v=1", at: 4.02, back: "/films/forge-artifacts-left-back.mp4?v=1" },
    right: { src: "/films/forge-artifacts-right.mp4?v=1", back: "/films/forge-artifacts-right-back.mp4?v=1" },
    bell: { src: "/films/forge-artifacts-home-bell.mp4?v=1", back: "/films/forge-artifacts-bell-home.mp4?v=1" },
  },
  left: {
    center: { src: "/films/forge-artifacts-left-back.mp4?v=1", back: "/films/forge-artifacts-walk.mp4?v=1" },
    right: { src: "/films/forge-artifacts-cross.mp4?v=1", at: 1.8, back: "/films/forge-artifacts-cross-back.mp4?v=1" },
    bell: { src: "/films/forge-artifacts-left-bell.mp4?v=1", back: "/films/forge-artifacts-bell-left.mp4?v=1" },
  },
  right: {
    center: { src: "/films/forge-artifacts-right-back.mp4?v=1", back: "/films/forge-artifacts-right.mp4?v=1" },
    left: { src: "/films/forge-artifacts-cross-back.mp4?v=1", back: "/films/forge-artifacts-cross.mp4?v=1" },
    bell: { src: "/films/forge-artifacts-right-bell.mp4?v=1", back: "/films/forge-artifacts-bell-right.mp4?v=1" },
  },
  bell: {
    center: { src: "/films/forge-artifacts-bell-home.mp4?v=1", back: "/films/forge-artifacts-home-bell.mp4?v=1" },
    left: { src: "/films/forge-artifacts-bell-left.mp4?v=1", back: "/films/forge-artifacts-left-bell.mp4?v=1" },
    right: { src: "/films/forge-artifacts-bell-right.mp4?v=1", back: "/films/forge-artifacts-right-bell.mp4?v=1" },
  },
};

const FROM: Partial<Record<Mark, Partial<Record<Mark, Partial<Record<Mark, Leg>>>>>> = {
  center: {
    right: {
      left: { src: "/films/forge-artifacts-cr-left.mp4?v=1", back: "/films/forge-artifacts-cr-left-back.mp4?v=1" },
      bell: { src: "/films/forge-artifacts-cr-bell.mp4?v=1", back: "/films/forge-artifacts-cr-bell-back.mp4?v=1" },
    },
    left: {
      right: { src: "/films/forge-artifacts-cl-right.mp4?v=1", back: "/films/forge-artifacts-cl-right-back.mp4?v=1" },
      bell: { src: "/films/forge-artifacts-cl-bell.mp4?v=1", back: "/films/forge-artifacts-cl-bell-back.mp4?v=1" },
    },
    bell: {
      left: { src: "/films/forge-artifacts-cb-left.mp4?v=1", back: "/films/forge-artifacts-cb-left-back.mp4?v=1" },
      right: { src: "/films/forge-artifacts-cb-right.mp4?v=1", back: "/films/forge-artifacts-cb-right-back.mp4?v=1" },
    },
  },
};

function pickLeg(here: Mark, from: From, to: Mark): Leg | null {
  if (from !== "idle") {
    const posed = FROM[here]?.[from]?.[to];
    if (posed) return posed;
  }
  return IDLE[here]?.[to] ?? null;
}

function filmNorm(clientX: number, clientY: number, rect: DOMRect) {
  const ar = 9 / 16;
  let fw = rect.width;
  let fh = rect.width / ar;
  if (fh > rect.height) {
    fh = rect.height;
    fw = rect.height * ar;
  }
  return {
    nx: (clientX - rect.left - (rect.width - fw) / 2) / fw,
    ny: (clientY - rect.top - (rect.height - fh) / 2) / fh,
  };
}

function hitMark(nx: number, ny: number): Mark | null {
  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
  if (ny > 0.84) return "center";
  if (nx < 0.34 && ny > 0.3 && ny < 0.82) return "left";
  if (nx > 0.66 && ny > 0.3 && ny < 0.82) return "right";
  if (nx > 0.28 && nx < 0.66 && ny > 0.36 && ny < 0.8) return "bell";
  return null;
}

export function CineApp({ bootScreen, playArt }: { bootScreen?: Screen; playArt?: string } = {}) {
  const boot = typeof window === "undefined" ? null : (locFromHash() ?? readBolt());
  const [screen, setScreen] = useState<Screen>(bootScreen ?? boot?.screen ?? "title");
  const [gatePage, setGatePage] = useState<number | undefined>(boot?.page);
  const [save, setSave] = useState<Save>(() => (typeof window === "undefined" ? readSave() : readSave()));
  const [result, setResult] = useState<RunResult | null>(null);
  const [muted, setMutedState] = useState(false);
  const [custom, setCustom] = useState<Film | null>(null);
  const [artifacts, setArtifacts] = useState<HungArtifact[]>(() =>
    typeof window === "undefined" ? [] : readArtifacts(),
  );
  const [artId, setArtId] = useState<string | null>(null);
  const applying = useRef(false);

  function applyLoc(loc: BoltLoc | null) {
    applying.current = true;
    setScreen(loc?.screen ?? "title");
    setGatePage(loc?.page);
    applying.current = false;
  }

  function go(loc: BoltLoc, screen: Screen) {
    if (!applying.current) pushBolt(loc);
    setScreen(screen);
    setGatePage(loc.page);
  }

  useEffect(() => {
    if (playArt) return;
    const loc = bootCookLoc({
      bootScreen,
      hashed: locFromHash(),
      stored: readBolt(),
    }) as BoltLoc;
    replaceBolt(loc);
    applyLoc(loc);
    const sync = () => {
      const next = locFromHash() ?? readBolt() ?? { screen: "title" as const };
      if (sameBolt(readBolt(), next)) {
        applyLoc(next);
        return;
      }
      replaceBolt(next);
      applyLoc(next);
    };
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, [bootScreen, playArt]);

  useEffect(() => {
    if (!playArt) return;
    function run(list: HungArtifact[]) {
      const hit = list.find((a) => a.id === playArt);
      if (!hit) return false;
      setArtifacts(list);
      setArtId(hit.id);
      setCustom(filmOf(hit));
      setResult(null);
      setScreen("play");
      return true;
    }
    if (run(readArtifacts())) return;
    void listHall()
      .then((hall) => {
        const all = mergeHall(hall || [], readArtifacts());
        if (!run(all)) setScreen("cook");
      })
      .catch(() => {
        if (!run(readArtifacts())) setScreen("cook");
      });
  }, [playArt]);

  function openArtifactsGate() {
    go({ screen: "title", page: 0 }, "title");
  }

  function openForge() {
    go({ screen: "cook", gate: "rifts", page: 0 }, "cook");
  }

  function openRuneGate() {
    go({ screen: "cook", gate: "rune", page: 1 }, "cook");
  }

  function goHome() {
    if (boltDepth() > 0) boltBack();
    else {
      replaceBolt({ screen: "title" });
      applyLoc({ screen: "title" });
    }
  }

  function hangFromForge(film: Film) {
    const list = hangArtifact(film, true);
    setArtifacts(list);
    setArtId(list[0]?.id ?? null);
    const hung = list[0];
    if (!hung) return;
    void hangHall({
      data: {
        id: hung.id,
        name: hung.name,
        still: hung.still,
        playlist: hung.playlist,
        prompt: hung.prompt,
      },
    })
      .then((hall) => {
        if (hall?.length) setArtifacts(mergeHall(hall, readArtifacts()));
      })
      .catch(() => {
        /* hall dark: local still holds */
      });
  }

  function playCustom(film: Film) {
    try {
      unlockAudio();
      stopBed();
      stopPad();
    } catch {
      /* */
    }
    hangFromForge(film);
    setCustom(film);
    setResult(null);
    go({ screen: "play" }, "play");
  }

  function playArtifact(a: HungArtifact) {
    try {
      unlockAudio();
      stopBed();
      stopPad();
    } catch {
      /* */
    }
    const href = walkHungHref(a.room);
    if (href) {
      window.location.assign(href);
      return;
    }
    setArtId(a.id);
    setCustom(filmOf(a));
    setResult(null);
    go({ screen: "play" }, "play");
  }

  function onDone(res: RunResult) {
    setResult(res);
    if (artId) setArtifacts(gradeArtifact(artId, res.grade));
    else setSave(recordRun("asteroid", res.score, res.grade, res.shards, res.combo));
    setScreen("result");
    replaceBolt({ screen: "result" });
    try {
      startBed();
    } catch {
      /* */
    }
  }

  useEffect(() => {
    listHall()
      .then((hall) => {
        if (hall?.length) setArtifacts(mergeHall(hall, readArtifacts()));
      })
      .catch(() => {
        /* local hall still shows */
      });
  }, []);

  if (screen === "cook") {
    return (
      <CookStudio
        onPlay={playCustom}
        onHang={hangFromForge}
        onExit={() => {
          if (bootScreen === "cook") window.location.href = "/";
          else boltBack();
        }}
      />
    );
  }

  if (screen === "title" && gatePage !== 0 && gatePage !== 1) {
    return <Home />;
  }

  if (screen === "title") {
    return <TitleGates onArtifacts={openForge} onRunes={openRuneGate} onHome={goHome} />;
  }

  if (screen === "play") {
    const hold = hungFilmHold(custom);
    const hungStay = Boolean(hold.hall || hold.door || custom?.playlist?.length);
    return (
      <FilmStage
        id={custom?.id ?? (hungStay ? "sprint" : "asteroid")}
        original={!custom?.playlist?.length && !hungStay}
        custom={custom?.playlist?.length || hungStay ? custom : undefined}
        holdHall={hold.hall}
        holdDoor={hold.door}
        onExit={() => {
          if (playArt || bootScreen === "cook") window.location.href = "/";
          else boltBack();
        }}
        onDone={onDone}
      />
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg text-fg">
      <img
        src="/films/cook-asteroid.jpg"
        alt=""
        className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover object-[center_28%] opacity-70"
      />
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,rgba(7,8,12,0.35)_0%,rgba(7,8,12,0.82)_100%)]" />

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <header className="relative z-20 flex items-center justify-between gap-3">
          <button type="button" className="text-left" {...press(() => boltHome())}>
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">Bolt Engine</p>
            <p className="font-display text-xl leading-none">Bolt Forge</p>
          </button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">{save.shards} shards</span>
            <button
              type="button"
              className="min-h-11 rounded-xl border border-line bg-surface/80 px-3 text-sm text-muted"
              {...press(() => {
                const next = !muted;
                setMutedState(next);
                try {
                  setMuted(next);
                } catch {
                  /* */
                }
              })}
            >
              {muted ? "Sound off" : "Sound on"}
            </button>
          </div>
        </header>

        {screen === "how" && (
          <main className="mx-auto mt-8 max-w-lg flex-1">
            <h2 className="font-display text-3xl">{ENGINE.bone}</h2>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-ice">{ENGINE.clock}</p>
            <ul className="mt-5 space-y-3 text-sm text-muted">
              {RAILS.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-8 min-h-12 rounded-xl bg-accent px-5 text-sm font-medium text-bg"
              {...press(openForge)}
            >
              Bolt Forge
            </button>
          </main>
        )}

        {screen === "result" && result && (
          <main className="flex flex-1 flex-col items-start justify-center gap-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
              {custom?.name ?? "Forge sprint"}
            </p>
            <h2 className="font-display text-7xl leading-none text-ice">{result.grade}</h2>
            <p className="font-mono text-xl tabular-nums">
              {result.score} · {result.combo}x combo
            </p>
            <p className="max-w-md text-sm text-muted">
              {result.perfect} perfect · {result.great} great · {result.good} good · {result.miss} miss
              {result.crashed ? " · the cut fractured" : ""}
            </p>
            <div className="flex w-full max-w-md flex-col gap-3">
              <button
                type="button"
                className="min-h-14 rounded-xl bg-accent px-5 text-sm font-medium text-bg"
                {...press(() => boltHome())}
              >
                Keep
              </button>
              <button
                type="button"
                className="min-h-14 rounded-xl border border-ice bg-surface/80 px-5 text-sm text-ice"
                {...press(() => {
                  if (artId && artifacts.length) {
                    const i = artifacts.findIndex((a) => a.id === artId);
                    const n = artifacts[(i + 1) % artifacts.length];
                    if (n) playArtifact(n);
                    else openForge();
                  } else openForge();
                })}
              >
                Next
              </button>
              <button
                type="button"
                className="min-h-12 text-left font-mono text-[11px] uppercase tracking-[0.2em] text-muted"
                {...press(() => (custom ? playCustom(custom) : openForge()))}
              >
                Run it again
              </button>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}

function TitleGates({
  onArtifacts,
  onRunes,
  onHome,
}: {
  onArtifacts: () => void;
  onRunes: () => void;
  onHome: () => void;
}) {
  const landedOnRunes = useRef((readBolt() ?? locFromHash())?.page === 1);
  const [page, setPage] = useState<0 | 1>(() => (readBolt()?.page === 1 ? 1 : 0));
  const [lit, setLit] = useState(false);
  const [mark, setMark] = useState<Mark>("center");
  const [came, setCame] = useState<From>("idle");
  const [act, setAct] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef(0);
  const pending = useRef(0);
  const pageRef = useRef<0 | 1>(page);
  const markRef = useRef<Mark>("center");
  const going = useRef(false);
  const held = useRef(false);
  const arrive = useRef<Mark>("center");
  const origin = useRef<From>("idle");
  const fromRef = useRef<From>("idle");
  const lastFwd = useRef<string | null>(null);
  const lastBack = useRef<string | null>(null);
  const startAt = useRef(0.05);
  const moveTimer = useRef(0);
  const armed = useRef(false);
  const film = useRef<HTMLVideoElement | null>(null);
  const move = useRef<HTMLVideoElement | null>(null);
  pageRef.current = page;
  markRef.current = mark;
  useEffect(() => {
    const t = window.setTimeout(() => {
      armed.current = true;
    }, 480);
    return () => window.clearTimeout(t);
  }, []);

  const poster =
    mark === "left"
      ? "/films/cook-artifacts-left.jpg?v=2"
      : mark === "right"
        ? "/films/cook-artifacts-right.jpg?v=1"
        : mark === "bell"
          ? "/films/cook-artifacts-bell.jpg?v=1"
          : "/films/cook-artifacts.jpg?v=3";

  const gates = [
    {
      id: "artifacts" as const,
      src: "/films/forge-artifacts.mp4?v=2",
      poster,
      enter: onArtifacts,
    },
    {
      id: "runes" as const,
      src: "/films/forge-runes.mp4",
      poster: "/films/cook-runes.jpg",
      enter: onRunes,
    },
  ];
  const gate = gates[page]!;

  function show(n: 0 | 1) {
    if (n === pageRef.current) return;
    sfxForge("page");
    setLit(false);
    setAct(null);
    setMark("center");
    markRef.current = "center";
    going.current = false;
    held.current = false;
    fromRef.current = "idle";
    setCame("idle");
    lastFwd.current = null;
    lastBack.current = null;
    window.clearTimeout(moveTimer.current);
    setBusy(false);
    setPage(n);
    pageRef.current = n;
    replaceBolt({ screen: "title", page: n });
  }

  if (page === 1) {
    return <RuneEngine onBack={() => (landedOnRunes.current ? onHome() : show(0))} />;
  }

  function walkLeft() {
    const el = film.current;
    if (!el || going.current) return;
    going.current = true;
    held.current = false;
    setBusy(true);
    sfxForge("page");
    try {
      el.loop = false;
      el.currentTime = 4.02;
      void el.play();
    } catch {
      going.current = false;
      setBusy(false);
    }
  }

  function playMove(src: string, dest: Mark, at = 0.05, back: string | null = null) {
    if (going.current) return;
    going.current = true;
    held.current = false;
    setBusy(true);
    sfxForge("page");
    origin.current = markRef.current;
    arrive.current = dest;
    startAt.current = at;
    lastFwd.current = src;
    lastBack.current = back;
    setAct(src);
    film.current?.pause();
    const el = move.current;
    if (!el) return;
    const name = src.split("?")[0]!.split("/").pop();
    if (!el.currentSrc.includes(name ?? "nope")) {
      el.src = src;
      el.load();
    }
    const kick = () => {
      try {
        if (at > 0) el.currentTime = at;
      } catch {
        /* */
      }
      const p = el.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          going.current = false;
          setBusy(false);
        });
      }
    };
    if (el.readyState >= 2) kick();
    else el.addEventListener("loadeddata", kick, { once: true });
    window.clearTimeout(moveTimer.current);
    moveTimer.current = window.setTimeout(() => {
      if (going.current && arrive.current === dest) onMoveEnd();
    }, 16000);
  }

  function goTo(target: Mark) {
    if (going.current) return;
    const here = markRef.current;
    if (target === here) {
      if (here === "center") return;
      sfxForge("enter");
      setLit(true);
      window.setTimeout(() => setLit(false), 280);
      if (here === "left") show(1);
      else onArtifacts();
      return;
    }
    if (target === fromRef.current && lastBack.current) {
      const back = lastBack.current;
      const fwd = lastFwd.current;
      playMove(back, target, 0.05, fwd);
      return;
    }
    const leg = pickLeg(here, fromRef.current, target);
    if (!leg) return;
    playMove(leg.src, target, leg.at ?? 0.05, leg.back);
  }


  function holdLast(el: HTMLVideoElement | null) {
    if (!el) return;
    try {
      const d = el.duration;
      if (Number.isFinite(d) && d > 0.25) el.currentTime = d - 0.12;
      el.pause();
    } catch {
      /* */
    }
  }

  function freezeFilm() {
    const el = film.current;
    if (!el || pageRef.current !== 0) return;
    held.current = true;
    try {
      if (markRef.current === "center") el.currentTime = 1.55;
      else if (markRef.current === "left") el.currentTime = 14.72;
      el.pause();
    } catch {
      /* */
    }
  }

  function onFilmTime() {
    const el = film.current;
    if (!el || pageRef.current !== 0 || act) return;
    if (going.current) return;
    if (held.current) {
      if (!el.paused) el.pause();
      return;
    }
    if (markRef.current === "center" && el.currentTime >= 1.7) freezeFilm();
    if (markRef.current === "left" && el.currentTime >= 14.55) {
      held.current = true;
      el.pause();
    }
  }

  function onFilmEnd() {
    if (pageRef.current !== 0 || act) return;
    going.current = false;
    held.current = true;
    setBusy(false);
    setMark("left");
    markRef.current = "left";
    holdLast(film.current);
  }

  function onMoveEnd() {
    window.clearTimeout(moveTimer.current);
    const dest = arrive.current;
    going.current = false;
    held.current = true;
    setBusy(false);
    fromRef.current = origin.current;
    setCame(origin.current);
    setMark(dest);
    markRef.current = dest;
    holdLast(move.current);
  }

  function onDown(e: React.PointerEvent) {
    if (!armed.current) return;
    swipe.current = { x: e.clientX, y: e.clientY };
    unlockAudio();
    startBed();
    if (!going.current && !act) {
      void film.current?.play();
    }
  }

  function onUp(e: React.PointerEvent) {
    if (!armed.current) {
      swipe.current = null;
      return;
    }
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy)) {
      window.clearTimeout(pending.current);
      if (dx > 0) onHome();
      else show(1);
      return;
    }
    if (Math.abs(dx) > 56 || Math.abs(dy) > 56) return;
    const now = performance.now();
    const box = e.currentTarget.getBoundingClientRect();
    const { nx, ny } = filmNorm(e.clientX, e.clientY, box);
    if (now - lastTap.current < 420) {
      window.clearTimeout(pending.current);
      lastTap.current = 0;
      sfxForge("full");
      boltFull();
      return;
    }
    lastTap.current = now;
    const id = gate.id;
    const enter = gate.enter;
    if (id === "artifacts") {
      const target = hitMark(nx, ny);
      if (target) goTo(target);
      return;
    }
    window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => {
      if (going.current) return;
      if (nx < 0.22 || nx > 0.78) {
        show(0);
        return;
      }
      sfxForge("enter");
      setLit(true);
      window.setTimeout(() => setLit(false), 280);
      enter();
    }, 340);
  }

  return (
    <div
      className="relative min-h-dvh overflow-hidden bg-bg"
      data-gate={gate.id}
      data-mark={mark}
      data-from={came}
      data-idle={busy ? "0" : "1"}
      style={{ touchAction: "none" }}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={() => {
        swipe.current = null;
      }}
    >
      <img
        src={gate.poster}
        alt=""
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full object-contain object-center"
      />
      <video
        ref={film}
        key={gate.src}
        src={gate.src}
        poster={gate.poster}
        muted
        playsInline
        autoPlay
        loop
        className="pointer-events-none absolute inset-0 h-full w-full object-contain object-center"
      />
      {gate.id === "artifacts" && (
        <video
          ref={move}
          muted
          playsInline
          preload="auto"
          className={`pointer-events-none absolute inset-0 h-full w-full object-contain object-center ${act ? "opacity-100" : "opacity-0"}`}
          onEnded={onMoveEnd}
        />
      )}
      {gate.id === "artifacts" && <ForgeAura mark={mark} walking={busy} />}
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          background: lit
            ? "radial-gradient(ellipse 55% 50% at 50% 48%, rgba(158,201,212,0.28) 0%, transparent 70%)"
            : "transparent",
        }}
      />
    </div>
  );
}
