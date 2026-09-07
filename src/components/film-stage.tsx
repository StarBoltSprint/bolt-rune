import { useEffect, useRef, useState, type PointerEvent as PE } from "react";
import {
  FILM_BY_ID,
  gradeOf,
  prepareBeats,
  shardsOf,
  spotOf,
  type Beat,
  type Film,
  type FilmId,
  type Grade,
  type Lane,
  type Spot,
} from "@/game/films";
import { CANYON_APPROACH, projectHazard } from "@/game/canyon";
import { sfxHit, unlockAudio, startScore, stopScore, syncScore } from "@/game/audio";
import { press } from "@/lib/press";
import { isClip, localizeClip, uniqueClips } from "@/game/artifacts";
import { cacheClip } from "@/lib/cook";
import { playableClipSrc } from "@/game/play-clip";
import { HazardLayer } from "@/components/hazard-layer";
import { doorLetterOf, sprintHallDoor } from "@/game/enter-graph";
import { doorAtPoint, isHallFilm } from "@/game/stock-room";

export type RunResult = {
  score: number;
  combo: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  relics: number;
  grade: Grade;
  shards: number;
  crashed: boolean;
  path?: "main" | "river" | "thicket";
  dusk?: boolean;
  hunter?: number;
};

type Pop = { id: number; text: string; x: number; y: number; tone: "ok" | "mid" | "bad" };
type Phase = "arm" | "run" | "crash" | "done";

const APPROACH = 1.55;
const HOLD_NEED_DEFAULT = 520;
const PACE_MIN = 0.5;
const PACE_MAX = 8;

type Props = {
  id: FilmId;
  original: boolean;
  echoSrc?: string | null;
  custom?: Film;
  ramp?: boolean;
  onExit: () => void;
  onDone: (result: RunResult) => void;
  onCook?: (seed: { frame: string; path: "main" | "river" | "thicket"; dusk: boolean; hunter: number; crashed: boolean; grade: Grade }) => void;
  onHallDoor?: (door: "A" | "B") => void;
};

type G = {
  beats: Beat[];
  i: number;
  resolved: boolean;
  hits: number;
  hold: number;
  holding: boolean;
  combo: number;
  maxCombo: number;
  score: number;
  perfect: number;
  great: number;
  good: number;
  miss: number;
  relics: number;
  streakMiss: number;
  rewind: number;
  trauma: number;
  hitstop: number;
  rate: number;
  pace: number;
  crashed: boolean;
  done: boolean;
  fakeT: number;
  seed: number;
  charted: boolean;
  resonance: number;
};

function fresh(beats: Beat[], seed?: number, rewind = 3, ramp = false): G {
  const s = seed ?? ((Math.random() * 0x7fffffff) | 0);
  return {
    beats,
    i: 0,
    resolved: false,
    hits: 0,
    hold: 0,
    holding: false,
    combo: 0,
    maxCombo: 0,
    score: 0,
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0,
    relics: 0,
    streakMiss: 0,
    rewind,
    trauma: 0,
    hitstop: 0,
    rate: ramp ? 0.7 : 1,
    pace: ramp ? 0.7 : 1,
    crashed: false,
    done: false,
    fakeT: 0,
    seed: s,
    charted: false,
    resonance: 0.08,
  };
}

function isHitKey(code: string) {
  return (
    code === "Space" ||
    code === "KeyK" ||
    code === "Enter" ||
    code === "KeyW" ||
    code === "KeyS" ||
    code === "ArrowUp" ||
    code === "ArrowDown" ||
    code === "Digit2"
  );
}

function swipeLaneOfKey(code: string): Lane | null {
  if (code === "KeyA" || code === "ArrowLeft" || code === "Digit1") return "l";
  if (code === "KeyD" || code === "ArrowRight" || code === "Digit3") return "r";
  return null;
}

function liveSpot(beat: Beat, t: number): Spot {
  if (!beat.canyon) return spotOf(beat);
  const p = Math.max(0, Math.min(1, 1 - (beat.at - t) / CANYON_APPROACH));
  const pr = projectHazard(beat.canyon, p);
  return { x: pr.x, y: pr.y };
}

function nearSpot(nx: number, ny: number, spot: Spot, box: DOMRect) {
  const dx = (nx - spot.x) * box.width;
  const dy = (ny - spot.y) * box.height;
  return dx * dx + dy * dy <= 110 * 110;
}

export function FilmStage({ id, original, echoSrc, custom, ramp = false, onExit, onDone, onHallDoor }: Props) {
  const film = custom ?? FILM_BY_ID[id];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const aRef = useRef<HTMLVideoElement | null>(null);
  const bRef = useRef<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const gRef = useRef<G>(fresh(film.beats, undefined, film.hazards ? 4 : 3, ramp));
  const rampRef = useRef(ramp);
  rampRef.current = ramp;
  const offsetRef = useRef(0);
  const plateRef = useRef(0);
  const platesRef = useRef<string[]>([]);
  const hallFlagsRef = useRef<boolean[]>([]);
  const advancing = useRef(false);
  const laneRef = useRef<0 | 1>(0);
  const swapLock = useRef(0);
  const raf = useRef(0);
  const last = useRef(0);
  const popN = useRef(0);
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  const reduced = useRef(false);
  const doneSent = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onHallDoorRef = useRef(onHallDoor);
  onHallDoorRef.current = onHallDoor;

  const [live, setLive] = useState(false);
  const [phase, setPhase] = useState<Phase>(custom || film.pad === "arrows" || film.id === "sprint" ? "run" : "arm");
  const [hud, setHud] = useState({
    score: 0,
    combo: 0,
    i: 0,
    rewind: film.hazards ? 4 : 3,
    hold: 0,
    mash: 0,
    need: 1,
    t: 0,
    dur: film.chart,
    total: film.beats.length,
    resonance: 0.08,
    pace: 1,
  });
  const [pops, setPops] = useState<Pop[]>([]);
  const [shake, setShake] = useState({ x: 0, y: 0, rot: 0 });
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [flash, setFlash] = useState(0);
  const [nowBeat, setNowBeat] = useState<Beat | null>(film.beats[0] ?? null);
  const [portrait, setPortrait] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.innerHeight > window.innerWidth || window.matchMedia("(pointer: coarse)").matches),
  );
  const [src, setSrc] = useState(() => {
    const plates = uniqueClips(film.playlist || []);
    if (plates[0]) return localizeClip(plates[0]);
    if (echoSrc && isClip(echoSrc)) return echoSrc;
    if (original && isClip(film.origin)) return film.origin;
    if (isClip(film.local)) return film.local;
    if (isClip(film.portrait)) return film.portrait;
    return "";
  });
  const [poster, setPoster] = useState(() => {
    const s = custom?.still || custom?.portraitStill || "";
    if (s.includes("citadel-tour")) return s;
    if (typeof window !== "undefined" && window.innerHeight >= window.innerWidth * 0.95) return film.portraitStill;
    return film.still;
  });
  const [result, setResult] = useState<RunResult | null>(null);
  const [usingStill, setUsingStill] = useState(false);
  const [lane, setLane] = useState<0 | 1>(0);
  const usingStillRef = useRef(false);
  usingStillRef.current = usingStill;
  const phaseRef = useRef<Phase>("arm");
  phaseRef.current = phase;
  const lastHudAt = useRef(0);
  const lastHudI = useRef(-1);
  const lastShakeOn = useRef(false);
  const lastRate = useRef(1);
  const skipAcc = useRef(0);
  const coarse = useRef(false);

  function bindActive(n: 0 | 1) {
    laneRef.current = n;
    videoRef.current = n === 0 ? aRef.current : bRef.current;
    setLane(n);
  }

  function armPlate(el: HTMLVideoElement | null, url: string | undefined) {
    if (!el || !url) return;
    if (el.getAttribute("data-url") === url && el.readyState >= 2) return;
    el.setAttribute("data-url", url);
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.preload = "auto";
    const src = playableClipSrc(url) || url;
    if (el.getAttribute("src") !== src) {
      el.src = src;
      el.load();
    }
  }

  function otherPlate() {
    return laneRef.current === 0 ? bRef.current : aRef.current;
  }

  useEffect(() => {
    return () => stopScore();
  }, []);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    coarse.current = window.matchMedia("(pointer: coarse)").matches;
    const apply = () => {
      const tall = window.innerHeight > window.innerWidth || window.matchMedia("(pointer: coarse)").matches;
      setPortrait(tall);
    };
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);

  useEffect(() => {
    unlockAudio();
    const seed = (Math.random() * 0x7fffffff) | 0;
    gRef.current = fresh(prepareBeats(film, film.chart, seed, original), seed, film.lives === 1 ? 0 : film.hazards ? 4 : 3, ramp);
    gRef.current.charted = false;
    doneSent.current = false;
    offsetRef.current = 0;
    plateRef.current = 0;
    advancing.current = false;
    laneRef.current = 0;
    swapLock.current = 0;
    const list = uniqueClips(film.playlist || []).map(localizeClip);
    platesRef.current = list.slice();
    hallFlagsRef.current = list.map((u) => isHallFilm(u));
    const first = list[0] || (original ? film.origin : portrait ? film.portrait : film.local);
    if (isClip(first)) setSrc(first);
    const pic = [film.portraitStill, film.still].find((u) => u && (/\.(jpe?g|png|webp)(\?|$)/i.test(u) || u.startsWith("data:image")));
    setPoster(pic || "");
    setLive(false);
    setUsingStill(false);
    setResult(null);
    setLane(0);
    setPhase("run");
    videoRef.current = aRef.current;
    let gone = false;
    let tries = 0;
    const kick = () => {
      if (gone) return;
      const a = aRef.current;
      const b = bRef.current;
      if (!a) {
        tries += 1;
        if (tries < 80) window.setTimeout(kick, 40);
        return;
      }
      videoRef.current = a;
      armPlate(a, list[0] || first);
      armPlate(b, list[1]);
      a.muted = true;
      a.defaultMuted = true;
      a.loop = false;
      a.playsInline = true;
      a.playbackRate = ramp ? 0.42 : 1;
      const holdRoom = (film.still || "").includes("citadel-tour");
      const ready = () => {
        if (gone) return;
        const start = () => void a.play().then(() => setLive(true)).catch(() => {});
        if (holdRoom) window.setTimeout(start, 1100);
        else start();
      };
      a.addEventListener("canplay", ready);
      a.addEventListener("loadedmetadata", () => {
        if (a.duration > 1) {
          const g = gRef.current;
          g.beats = prepareBeats(film, a.duration, g.seed, original);
          g.charted = true;
          g.i = 0;
        }
      });
      if (a.readyState >= 2) ready();
      else void a.play().catch(() => {
        if (!gone) window.setTimeout(ready, 280);
      });
    };
    kick();
    const links: HTMLLinkElement[] = [];
    for (const u of list) {
      if (!u) continue;
      const l = document.createElement("link");
      l.rel = "preload";
      l.as = "video";
      l.href = u;
      document.head.appendChild(l);
      links.push(l);
    }
    void (async () => {
      const next = list.slice();
      const jobs = next.map(async (u, i) => {
        if (!u || u.startsWith("/") || u.startsWith("blob:")) return;
        try {
          const cached = await cacheClip({ data: { url: u } });
          if (gone || !cached.ok) return;
          next[i] = cached.url;
          platesRef.current = next.slice();
          if (i === 0) {
            setSrc(cached.url);
            armPlate(aRef.current, cached.url);
          }
          if (i === 1) armPlate(bRef.current, cached.url);
        } catch {
          /* keep remote */
        }
      });
      await Promise.all(jobs);
    })();
    return () => {
      gone = true;
      for (const l of links) l.remove();
    };
  }, [film.playlist?.join("|") ?? film.local, original, ramp]);

  useEffect(() => {
    if (original) return;
    if (film.playlist?.length) return;
    setSrc(portrait ? film.portrait : film.local);
    setPoster(portrait ? film.portraitStill : film.still);
  }, [portrait, film, original]);

  useEffect(() => {
    if (phase !== "run") return;
    if ((film.still || "").includes("citadel-tour")) return;
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.playsInline = true;
    v.defaultMuted = true;
    if (rampRef.current) v.playbackRate = gRef.current.pace || 0.7;
    else v.playbackRate = gRef.current.pace || 1;
    const kick = () => {
      advancing.current = false;
      if (!v.getAttribute("data-url") && film.playlist?.[0]) armPlate(v, film.playlist[0]);
      void v.play().then(() => {
        setLive(true);
        setUsingStill(false);
      }).catch(() => {});
    };
    if (v.readyState >= 2) kick();
    v.addEventListener("canplay", kick);
    v.addEventListener("playing", () => {
      setLive(true);
      setUsingStill(false);
    });
    kick();
    const retry = window.setInterval(() => {
      if (!v.paused) {
        window.clearInterval(retry);
        return;
      }
      kick();
    }, 400);
    if (film.score) startScore(film.score, 0);
    return () => {
      v.removeEventListener("canplay", kick);
      window.clearInterval(retry);
    };
  }, [phase, src]);

  useEffect(() => {
    const tick = (now: number) => {
      const dt = Math.min((now - (last.current || now)) / 1000, 0.1);
      last.current = now;
      const g = gRef.current;
      const v = videoRef.current;
      if (g.hitstop > 0) g.hitstop -= dt;
      if (v && v.paused && live && phaseRef.current === "run" && !g.crashed && !g.done) {
        void v.play().catch(() => {});
      }

      let t = 0;
      if (usingStill) {
        g.fakeT += dt;
        t = g.fakeT;
      } else if (v) {
        t = clock();
        if (v.duration && !g.charted && v.duration > 1) {
          g.beats = prepareBeats(film, v.duration, g.seed, original);
          g.charted = true;
        }
        const list = platesRef.current.length ? platesRef.current : uniqueClips(film.playlist || []);
        if (list.length > 1 && plateRef.current < list.length - 1 && !advancing.current && v.duration > 1 && Number.isFinite(v.duration)) {
          const nxt = otherPlate();
          const nextUrl = list[plateRef.current + 1];
          if (nextUrl) armPlate(nxt, nextUrl);
          const left = v.duration - v.currentTime;
          if (left <= 0.18) goNextPlate();
        }
      }
      if (film.score && phaseRef.current === "run") syncScore(t);

      g.trauma = Math.max(0, g.trauma - dt * 2.4);
      if (phaseRef.current === "run") {
        if (g.combo > 0) g.resonance = Math.min(1, g.resonance + dt * (0.018 + Math.min(10, g.combo) * 0.006));
        else g.resonance = Math.max(0.05, g.resonance - dt * 0.035);
      }
      const sh = g.trauma * g.trauma;
      if (!reduced.current && sh > 0.002) {
        setShake({
          x: (Math.sin(now * 0.053) * 10 + Math.cos(now * 0.031) * 6) * sh,
          y: (Math.cos(now * 0.047) * 8) * sh,
          rot: Math.sin(now * 0.02) * 1.4 * sh,
        });
        lastShakeOn.current = true;
      } else if (lastShakeOn.current) {
        setShake({ x: 0, y: 0, rot: 0 });
        lastShakeOn.current = false;
      }
      const want = g.crashed || g.done ? 0 : Math.max(PACE_MIN, Math.min(PACE_MAX, g.pace));
      g.rate += (want - g.rate) * (1 - Math.exp(-12 * dt));
      if (v && !g.crashed && !g.done && phaseRef.current === "run") {
        const native = Math.max(0.25, Math.min(16, g.rate));
        const r = Math.round(native * 20) / 20;
        if (r !== lastRate.current) {
          lastRate.current = r;
          try {
            v.playbackRate = r;
          } catch {
            /* */
          }
        }
        const actual = v.playbackRate || 1;
        if (g.rate > actual + 0.12 && !advancing.current && Number.isFinite(v.duration) && v.duration > 1) {
          skipAcc.current += (g.rate - actual) * dt;
          if (skipAcc.current >= 0.04) {
            const jump = skipAcc.current;
            skipAcc.current = 0;
            const list = platesRef.current.length ? platesRef.current : uniqueClips(film.playlist || []);
            const room = list.length > 1 && plateRef.current < list.length - 1 ? 0.4 : 0.05;
            try {
              v.currentTime = Math.min(Math.max(0, v.duration - room), v.currentTime + jump);
            } catch {
              /* */
            }
          }
        } else {
          skipAcc.current *= 0.4;
        }
      }

      const beat = g.beats[g.i] ?? null;
      if (beat && phaseRef.current === "run" && !g.resolved) {
        if (g.holding && beat.kind === "hold" && Math.abs(t - beat.at) < beat.win) g.hold += dt * 1000;
        const late = t > beat.at + beat.win * 0.7;
        if (beat.kind === "hold" && g.hold >= beat.holdMs && Math.abs(t - beat.at) < beat.win) {
          judge(g, beat, Math.abs(t - beat.at));
        } else if (late && !advancing.current) {
          if (hallPlateNow()) {
            g.resolved = true;
            advance(g);
          } else if (t - beat.at > 1.35) {
            g.resolved = true;
            advance(g);
          } else {
            miss(g, beat);
          }
        }
      }

      const listLen = Math.max(1, (platesRef.current.length ? platesRef.current : film.playlist || []).length);
      if (usingStill && phaseRef.current === "run" && t >= film.chart) {
        finish(g);
      } else if (
        phaseRef.current === "run" &&
        !advancing.current &&
        !usingStill &&
        v &&
        plateRef.current >= listLen - 1 &&
        v.ended &&
        v.duration > 1
      ) {
        finish(g);
      }

      const nextHud = {
        score: g.score,
        combo: g.combo,
        i: g.i,
        rewind: g.rewind,
        hold: beat?.kind === "hold" ? Math.min(1, g.hold / (beat.holdMs || HOLD_NEED_DEFAULT)) : 0,
        mash: beat?.kind === "mash" ? g.hits : 0,
        need: beat?.need ?? 1,
        t,
        dur: runEnd(),
        total: g.beats.length,
        resonance: g.resonance,
        pace: g.pace,
      };
      const due = now - lastHudAt.current > (coarse.current ? 120 : 64);
      if (phaseRef.current === "run" && (due || g.i !== lastHudI.current)) {
        lastHudAt.current = now;
        lastHudI.current = g.i;
        setHud(nextHud);
        setNowBeat(beat);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // phase/live/usingStill intentionally rebind the loop
  }, [phase, live, usingStill, film]);

  function pop(text: string, tone: Pop["tone"], x = 50, y = 42) {
    const item: Pop = { id: ++popN.current, text, x, y, tone };
    setPops((p) => [...p.slice(-7), item]);
    window.setTimeout(() => setPops((p) => p.filter((n) => n.id !== item.id)), 720);
  }

  function runEnd() {
    const v = videoRef.current;
    const n = Math.max(1, film.playlist?.length || 1);
    const here = v && Number.isFinite(v.duration) && v.duration > 1 ? v.duration : 0;
    if (here) {
      const left = Math.max(0, n - 1 - plateRef.current);
      return offsetRef.current + here + left * here;
    }
    return Math.max(film.chart, n * 15);
  }

  function clock() {
    if (usingStill) return gRef.current.fakeT;
    const v = videoRef.current;
    const ct = v && Number.isFinite(v.currentTime) ? v.currentTime : 0;
    return offsetRef.current + (advancing.current ? 0 : ct);
  }

  function goNextPlate() {
    const list = (platesRef.current.length ? platesRef.current : uniqueClips(film.playlist || [])).map(localizeClip);
    const cur = videoRef.current;
    if (!list.length || !cur) return false;
    const i = plateRef.current;
    if (i + 1 >= list.length) return false;
    if (advancing.current) return true;
    if (performance.now() < swapLock.current) return true;
    advancing.current = true;
    swapLock.current = performance.now() + 700;
    const add = cur.duration && Number.isFinite(cur.duration) && cur.duration > 1 ? cur.duration : 10;
    const nextI = i + 1;
    skipAcc.current = 0;
    const nextUrl = list[nextI];
    const next = laneRef.current === 0 ? bRef.current : aRef.current;
    const to: 0 | 1 = laneRef.current === 0 ? 1 : 0;
    const take = () => {
      const ready = next && (next.readyState >= 2 || next.videoWidth > 8);
      if (!ready) {
        setSrc(nextUrl);
        armPlate(cur, nextUrl);
        offsetRef.current += add;
        plateRef.current = nextI;
        void cur.play().finally(() => {
          advancing.current = false;
        });
        return;
      }
      offsetRef.current += add;
      plateRef.current = nextI;
      if (!next) {
        armPlate(cur, nextUrl);
        void cur.play().finally(() => {
          advancing.current = false;
        });
        return;
      }
      next.muted = true;
      next.defaultMuted = true;
      next.playsInline = true;
      try {
        next.playbackRate = gRef.current.rate || 1;
      } catch {
        /* */
      }
      const already = !next.paused && next.currentTime > 0.02;
      if (!already) {
        try {
          next.currentTime = 0;
        } catch {
          /* */
        }
      }
      const show = () => {
        bindActive(to);
        advancing.current = false;
        try {
          cur.pause();
        } catch {
          /* */
        }
        const more = list[nextI + 1];
        if (more) armPlate(cur, more);
      };
      if (already) {
        show();
        return;
      }
      void next
        .play()
        .then(show)
        .catch(() => {
          armPlate(cur, nextUrl);
          void cur.play().finally(() => {
            advancing.current = false;
          });
        });
    };
    armPlate(next, nextUrl);
    if (next && next.getAttribute("data-url") === nextUrl && (next.readyState >= 3 || (!next.paused && next.currentTime > 0.02))) {
      take();
    } else {
      next?.addEventListener("canplaythrough", take, { once: true });
      next?.addEventListener("canplay", take, { once: true });
      window.setTimeout(() => {
        if (!advancing.current) return;
        if (next && next.readyState >= 2) take();
        else window.setTimeout(() => {
          if (advancing.current) take();
        }, 4000);
      }, 1200);
    }
    return true;
  }

  function finish(g: G) {
    if (g.done) return;
    g.done = true;
    const total = g.perfect + g.great + g.good + g.miss;
    const grade = gradeOf(g.perfect, g.great, g.good, g.miss, total);
    const shards = shardsOf(g.perfect, g.great, g.good, g.relics, grade);
    setPhase("done");
    videoRef.current?.pause();
    stopScore();
    if (!doneSent.current) {
      doneSent.current = true;
      const res: RunResult = {
        score: g.score,
        combo: g.maxCombo,
        perfect: g.perfect,
        great: g.great,
        good: g.good,
        miss: g.miss,
        relics: g.relics,
        grade,
        shards,
        crashed: g.crashed,
      };
      setResult(res);
      onDoneRef.current(res);
    }
  }

  function miss(g: G, beat: Beat) {
    if (g.resolved) return;
    g.resolved = true;
    g.miss += 1;
    g.combo = 0;
    g.streakMiss += 1;
    g.trauma = Math.min(1, g.trauma + 0.45);
    g.resonance = Math.max(0.04, g.resonance * 0.32);
    sfxHit("miss");
    pop("MISS", "bad", liveSpot(beat, clock()).x * 100, liveSpot(beat, clock()).y * 100);
    g.pace = Math.max(PACE_MIN, g.pace - 0.32);
    setFlash(1);
    window.setTimeout(() => setFlash(0), 120);
    if (g.streakMiss >= (film.lives ?? 3)) {
      g.crashed = true;
      setPhase("crash");
      videoRef.current?.pause();
      stopScore();
      return;
    }
    advance(g);
  }

  function judge(g: G, beat: Beat, err: number) {
    if (g.resolved) return;
    const perfectCut = beat.kind === "hold" ? 0.28 : 0.12;
    const greatCut = beat.kind === "hold" ? 0.5 : 0.28;
    let word: "perfect" | "great" | "good" = "good";
    let pts = 120;
    if (err <= perfectCut) {
      word = "perfect";
      pts = 320;
      g.perfect += 1;
      g.trauma = Math.min(1, g.trauma + 0.22);
    } else if (err <= greatCut) {
      word = "great";
      pts = 210;
      g.great += 1;
      g.trauma = Math.min(1, g.trauma + 0.12);
    } else {
      g.good += 1;
    }
    g.resolved = true;
    g.combo += 1;
    g.maxCombo = Math.max(g.maxCombo, g.combo);
    g.streakMiss = 0;
    g.resonance = Math.min(1, g.resonance + (word === "perfect" ? 0.07 : word === "great" ? 0.045 : 0.025));
    if (g.combo % 2 === 0) {
      g.pace = Math.min(PACE_MAX, g.pace + (word === "perfect" ? 0.28 : word === "great" ? 0.2 : 0.14));
    }
    const mult = 1 + Math.min(8, g.combo) * 0.12;
    g.score += Math.round(pts * mult);
    if (beat.kind === "relic") g.relics += 1;
    sfxHit(beat.kind === "relic" ? "relic" : word);
    pop(word.toUpperCase(), word === "good" ? "mid" : "ok", liveSpot(beat, clock()).x * 100, liveSpot(beat, clock()).y * 100);
    advance(g);
  }

  function advance(g: G) {
    g.i += 1;
    g.resolved = false;
    g.hits = 0;
    g.hold = 0;
    g.holding = false;
    if (g.i >= g.beats.length) {
      if (!film.playlist?.length) window.setTimeout(() => finish(g), 380);
    }
  }

  function hallPlateNow() {
    const orig = uniqueClips(film.playlist || []);
    const list = platesRef.current.length ? platesRef.current : orig;
    const i = plateRef.current;
    const v = videoRef.current;
    return Boolean(
      hallFlagsRef.current[i] ||
        isHallFilm(list[i]) ||
        isHallFilm(orig[i]) ||
        isHallFilm(v?.getAttribute("data-url")) ||
        isHallFilm(v?.currentSrc) ||
        isHallFilm(v?.getAttribute("src")) ||
        sprintHallDoor(list[i] || orig[i] || v?.getAttribute("data-url"), 0.22, 0.42),
    );
  }

  function tryHallDoor(clientX: number, clientY: number) {
    if (!hallPlateNow()) return false;
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return Boolean(onHallDoorRef.current);
    const nx = (clientX - box.left) / box.width;
    const ny = (clientY - box.top) / box.height;
    const hit = doorAtPoint(nx, ny);
    if ((hit === "m1" || hit === "m2") && onHallDoorRef.current) {
      onHallDoorRef.current(doorLetterOf(hit));
    }
    return true;
  }

  function tryHit(nx?: number, ny?: number, swipe?: Lane) {
    const g = gRef.current;
    if (hallPlateNow()) return;
    if (phaseRef.current !== "run" || g.crashed) return;
    const v = videoRef.current;
    const t = clock();
    const beat = g.beats[g.i];
    if (!beat || g.resolved) return;
    if (Math.abs(t - beat.at) > beat.win) {
      if (t < beat.at && beat.at - t < APPROACH) {
        pop("SOON", "mid", spotOf(beat).x * 100, spotOf(beat).y * 100);
      }
      return;
    }
    const spot = liveSpot(beat, t);
    const box = wrapRef.current?.getBoundingClientRect();
    const cookedTap = Boolean(film.playlist?.length) && beat.kind === "tap";
    if (nx != null && ny != null && box && !cookedTap && !nearSpot(nx, ny, spot, box)) return;

    if (beat.kind === "swipe") {
      if (!swipe) return;
      if (swipe !== beat.lane) {
        miss(g, beat);
        return;
      }
      judge(g, beat, Math.abs(t - beat.at));
      return;
    }
    if (beat.kind === "mash") {
      g.hits += 1;
      sfxHit("good");
      if (g.hits >= beat.need) judge(g, beat, Math.abs(t - beat.at));
      return;
    }
    if (beat.kind === "hold") return;
    if (beat.kind === "left" || beat.kind === "right") return;
    judge(g, beat, Math.abs(t - beat.at));
  }

  function hitArrow(lane: Lane) {
    const g = gRef.current;
    if (hallPlateNow()) return;
    if (phaseRef.current !== "run" || g.crashed) return;
    const v = videoRef.current;
    const t = clock();
    const beat = g.beats[g.i];
    if (!beat || g.resolved) return;
    if (beat.kind !== "left" && beat.kind !== "right") return;
    if (Math.abs(t - beat.at) > beat.win) {
      if (t < beat.at && beat.at - t < APPROACH) pop("SOON", "mid", 50, 72);
      return;
    }
    const want: Lane = beat.kind === "left" ? "l" : "r";
    if (lane !== want) {
      miss(g, beat);
      return;
    }
    judge(g, beat, Math.abs(t - beat.at));
  }

  function rewind() {
    const g = gRef.current;
    if (g.rewind <= 0 || g.done) return;
    const target = g.beats[g.i];
    g.rewind -= 1;
    g.crashed = false;
    g.resolved = false;
    g.hits = 0;
    g.hold = 0;
    g.holding = false;
    g.streakMiss = 0;
    g.trauma = 0.2;
    sfxHit("rewind");
    const v = videoRef.current;
    const t = Math.max(0, (target?.at ?? 0) - 0.85);
    if (usingStillRef.current) g.fakeT = t;
    else if (v) v.currentTime = t;
    setPhase("run");
    void v?.play().catch(() => {});
    pop("REWIND", "mid", 50, 40);
  }

  function onKey(e: KeyboardEvent) {
    if (e.code === "Escape") {
      onExit();
      return;
    }
    if (e.code === "KeyR") {
      e.preventDefault();
      rewind();
      return;
    }
    if (e.repeat) return;
    const g = gRef.current;
    const beat = g.beats[g.i];
    const swipe = swipeLaneOfKey(e.code);
    if (beat?.kind === "left" || beat?.kind === "right") {
      if (!swipe) return;
      e.preventDefault();
      hitArrow(swipe);
      return;
    }
    if (beat?.kind === "swipe") {
      if (!swipe) return;
      e.preventDefault();
      tryHit(undefined, undefined, swipe);
      return;
    }
    if (swipe || isHitKey(e.code)) {
      e.preventDefault();
      if (beat?.kind === "hold") g.holding = true;
      tryHit();
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (isHitKey(e.code) || swipeLaneOfKey(e.code)) gRef.current.holding = false;
  }

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  function pointerDown(e: PE<HTMLDivElement>) {
    swipe.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  function pointerUp(e: PE<HTMLDivElement>) {
    const g = gRef.current;
    g.holding = false;
    const start = swipe.current;
    swipe.current = null;
    if (tryHallDoor(e.clientX, e.clientY)) return;
    const beat = g.beats[g.i];
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box || !beat || !start) return;
    if (beat.kind === "left" || beat.kind === "right") {
      const dx = e.clientX - start.x;
      const dir: Lane =
        Math.abs(dx) >= 36 ? (dx < 0 ? "l" : "r") : (e.clientX - box.left) / box.width < 0.5 ? "l" : "r";
      hitArrow(dir);
      return;
    }
    if (beat.kind !== "swipe") return;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) < 42) return;
    const nx = (start.x - box.left) / box.width;
    const ny = (start.y - box.top) / box.height;
    const dir: Lane = dx < 0 ? "l" : "r";
    tryHit(nx, ny, dir);
  }

  function onMarkDown(e: PE<HTMLButtonElement>, beat: Beat) {
    e.stopPropagation();
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* some mobile browsers refuse capture */
    }
    swipe.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    const g = gRef.current;
    if (beat.kind === "hold") g.holding = true;
    if (beat.kind === "swipe") return;
    tryHit();
  }

  const heat = Math.min(1, hud.combo / 10);
  const lookAmt = portrait ? 4 : 8;

  return (
    <div
      ref={wrapRef}
      className="relative h-dvh w-full overflow-hidden bg-bg text-fg select-none"
      data-sprint={ramp ? "1" : undefined}
      data-ramp={ramp ? "1" : undefined}
      style={{ touchAction: film.pad === "arrows" ? "none" : "manipulation" }}
      onPointerDown={pointerDown}
      onPointerUp={pointerUp}
      onPointerCancel={() => {
        gRef.current.holding = false;
        swipe.current = null;
      }}
      onPointerMove={(e) => {
        if (coarse.current) return;
        const box = wrapRef.current?.getBoundingClientRect();
        if (!box) return;
        const nx = ((e.clientX - box.left) / box.width - 0.5) * 2;
        const ny = ((e.clientY - box.top) / box.height - 0.5) * 2;
        setLook({ x: nx, y: ny });
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 will-change-transform"
        style={{
          transform: reduced.current
            ? undefined
            : `translate3d(${shake.x + look.x * lookAmt}px, ${shake.y + look.y * lookAmt}px, 0)`,
        }}
      >
        <img
          src={poster || undefined}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
        <video
          ref={(el) => {
            aRef.current = el;
            if (laneRef.current === 0) videoRef.current = el;
            if (el) {
              el.muted = true;
              el.defaultMuted = true;
              el.playsInline = true;
              el.setAttribute("playsinline", "true");
              el.setAttribute("webkit-playsinline", "true");
            }
          }}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          src={lane === 0 && isClip(src) ? src : undefined}
          poster={poster || undefined}
          playsInline
          muted
          autoPlay={!(film.still || "").includes("citadel-tour")}
          preload="auto"
          style={{ opacity: lane === 0 && live ? 1 : 0, zIndex: lane === 0 ? 2 : 0, transform: "translateZ(0)", backfaceVisibility: "hidden" }}
          onPlaying={() => {
            setLive(true);
            setUsingStill(false);
          }}
          onCanPlay={() => {
            if ((film.still || "").includes("citadel-tour")) return;
            const el = aRef.current;
            if (el) void el.play().then(() => setLive(true)).catch(() => {});
          }}
          onEnded={() => {
            if (laneRef.current !== 0) return;
            const n = (platesRef.current.length ? platesRef.current : uniqueClips(film.playlist || [])).length;
            if (plateRef.current < n - 1) {
              goNextPlate();
              return;
            }
            const g = gRef.current;
            if (!g.done) finish(g);
          }}
          onError={() => {
            const list = platesRef.current.length ? platesRef.current : uniqueClips(film.playlist || []);
            if (plateRef.current < list.length - 1) {
              goNextPlate();
              return;
            }
            const g = gRef.current;
            if (!g.done) finish(g);
          }}
        />
        <video
          ref={(el) => {
            bRef.current = el;
            if (laneRef.current === 1) videoRef.current = el;
          }}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          playsInline
          muted
          preload="auto"
          style={{ opacity: lane === 1 && live ? 1 : 0, zIndex: lane === 1 ? 2 : 0, transform: "translateZ(0)", backfaceVisibility: "hidden" }}
          onPlaying={() => {
            setLive(true);
            setUsingStill(false);
          }}
          onEnded={() => {
            if (laneRef.current !== 1) return;
            const n = (platesRef.current.length ? platesRef.current : uniqueClips(film.playlist || [])).length;
            if (plateRef.current < n - 1) {
              goNextPlate();
              return;
            }
            const g = gRef.current;
            if (!g.done) finish(g);
          }}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(7,8,12,0.34)_100%)]" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `rgba(158, 201, 212, ${heat * 0.05})` }}
      />
      {phase === "crash" && <div className="pointer-events-none absolute inset-0 bg-bg/40" />}
      <div
        className="pointer-events-none absolute inset-0 bg-fg mix-blend-overlay"
        style={{ opacity: flash * 0.14 }}
      />

      {!live && phase === "run" && !custom && (
        <button
          type="button"
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/40"
          style={{ touchAction: "manipulation" }}
          {...press(() => {
            const v = aRef.current || videoRef.current;
            const list = platesRef.current;
            if (v && list[0]) armPlate(v, list[0]);
            if (!v) return;
            v.muted = true;
            void v.play().then(() => {
              setLive(true);
              setUsingStill(false);
            }).catch(() => {});
          })}
        >
          <span className="rounded-full border border-white/30 bg-black/50 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.22em] text-ice">
            Tap to play
          </span>
        </button>
      )}
      {pops.map((p) => (
        <div
          key={p.id}
          className={`pointer-events-none absolute z-20 font-display text-2xl tracking-wide ${
            p.tone === "ok" ? "text-ice" : p.tone === "bad" ? "text-danger" : "text-accent"
          }`}
          style={{ left: `${p.x}%`, top: `${p.y}%`, animation: "pop-float 700ms ease-out forwards" }}
        >
          {p.text}
        </div>
      ))}

      {phase === "run" && film.hazards && !original && (
        <HazardLayer
          beats={gRef.current.beats}
          getClock={() => {
            const g = gRef.current;
            const beat = g.beats[g.i];
            const v = videoRef.current;
            const t = clock();
            return {
              t,
              i: g.i,
              hold: beat?.kind === "hold" ? Math.min(1, g.hold / (beat.holdMs || HOLD_NEED_DEFAULT)) : 0,
              mash: beat?.kind === "mash" ? g.hits : 0,
              need: beat?.need ?? 1,
            };
          }}
          reduced={reduced.current}
          onMarkDown={onMarkDown}
          onMarkUp={(e) => {
            e.stopPropagation();
            pointerUp(e as unknown as PE<HTMLDivElement>);
          }}
        />
      )}
      {phase === "run" && film.pad === "arrows" && <CutWash beat={nowBeat ?? undefined} t={hud.t} />}
      {phase === "run" && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-40 pb-[max(0.55rem,env(safe-area-inset-bottom))]">
          <Resonance value={hud.resonance} />
        </div>
      )}
      {phase === "run" && !(film.hazards && !original) && film.pad !== "arrows" && (
        <Marks
          beats={gRef.current.beats}
          index={hud.i}
          t={hud.t}
          hud={hud}
          onMarkDown={onMarkDown}
          onMarkUp={(e) => {
            e.stopPropagation();
            pointerUp(e as unknown as PE<HTMLDivElement>);
          }}
        />
      )}

      <header className="pointer-events-none absolute top-0 left-0 right-0 z-50 flex items-start justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              className="min-h-12 shrink-0 rounded-xl border border-line bg-surface/80 px-3 text-sm text-muted"
              {...press(onExit)}
            >
              Leave
            </button>
            {film.lives !== 1 && (
            <button
              type="button"
              className="min-h-12 shrink-0 rounded-xl border border-line bg-surface/80 px-3 font-mono text-[11px] uppercase tracking-[0.16em] text-muted disabled:opacity-40"
              disabled={hud.rewind <= 0}
              {...press(rewind)}
            >
              Rewind {hud.rewind}
            </button>
            )}
          </div>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.22em] text-muted">{film.keeper}</p>
          <h1 className="font-display text-2xl leading-tight">{film.name}</h1>
        </div>
        <div className="text-right font-mono tabular-nums">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Score</p>
          <p className="text-xl text-accent">{hud.score}</p>
          <p className="text-xl text-ice">{(hud.pace ?? 1).toFixed(1)}×</p>
          <p className="text-sm text-ice">{hud.combo > 1 ? `${hud.combo}x` : "—"}</p>
          {film.hazards && (
            <p className="text-[11px] text-muted">
              {Math.min(hud.i + 1, hud.total)}/{hud.total}
            </p>
          )}
        </div>
      </header>

      {film.hazards && phase === "run" && (
        <div className="pointer-events-none absolute top-0 left-0 right-0 z-10 h-[3px] bg-line/40">
          <div className="h-full bg-ice/80" style={{ width: `${hud.dur > 0 ? Math.min(100, (hud.t / hud.dur) * 100) : 0}%` }} />
        </div>
      )}

      {phase === "arm" && !custom && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-bg/55 px-6 text-center"
          style={{ pointerEvents: "auto", touchAction: "manipulation" }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (phaseRef.current !== "arm") return;
            try {
              unlockAudio();
            } catch {
              /* */
            }
            const v = videoRef.current;
            const g = gRef.current;
            g.fakeT = 0;
            g.i = 0;
            g.resolved = false;
            if (!g.charted) {
              g.beats = prepareBeats(film, v?.duration || film.chart, g.seed, original);
              g.charted = true;
            }
            if (v) {
              try {
                v.currentTime = 0;
              } catch {
                /* */
              }
              void v.play().then(() => setLive(true)).catch(() => setUsingStill(true));
            } else {
              setUsingStill(true);
            }
            setPhase("run");
          }}
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">Living film</p>
          <h2 className="font-display text-4xl">{film.verb}</h2>
          <p className="max-w-sm text-muted">
            {echoSrc
              ? "This cut grew from your howl. Three hits. Same tap-or-die."
              : film.id === "sprint"
              ? "StarBoltSprint is in the cut. Vault the log, dodge the branch, slide the root — or the run breaks."
              : film.hazards
                ? "Ice grows out of the canyon. Strike the shard, or the cut breaks."
                : `${film.line}. Marks bloom on the picture — hit them or the cut breaks.`}
          </p>
          <span className="relative z-50 min-h-14 rounded-xl bg-accent px-8 py-3 text-base font-medium text-bg">
            Enter the reel
          </span>
        </div>
      )}

      {phase === "done" && result && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-bg/72 px-6 text-center" style={{ touchAction: "manipulation" }}>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-ice">Sprint closed</p>
          <h2 className="font-display text-6xl leading-none text-ice">{result.grade}</h2>
          <p className="font-mono text-xl tabular-nums">
            {result.score} · {result.combo}x
          </p>
          <p className="max-w-sm text-sm text-muted">
            {result.perfect} perfect · {result.great} great · {result.good} good · {result.miss} miss
          </p>
          <button type="button" className="min-h-12 rounded-xl bg-accent px-8 text-sm font-medium text-bg" {...press(onExit)}>
            Vault
          </button>
        </div>
      )}

      {phase === "crash" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-bg/70 px-6 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-danger">Film fracture</p>
          <h2 className="font-display text-4xl">{film.lives === 1 ? "One miss" : "The cut broke"}</h2>
          <p className="max-w-sm text-muted">
            {film.lives === 1 ? "The line is dead. Start the minute again." : "Three misses. Rewind the frame or leave the den."}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {film.lives !== 1 && (
            <button
              type="button"
              disabled={hud.rewind <= 0}
              className="min-h-12 rounded-xl bg-accent px-5 text-sm font-medium text-bg disabled:opacity-40"
              {...press(rewind)}
            >
              Rewind
            </button>
            )}
            {film.lives === 1 && (
            <button
              type="button"
              className="min-h-12 rounded-xl bg-accent px-5 text-sm font-medium text-bg"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const seed = (Math.random() * 0x7fffffff) | 0;
                const v = videoRef.current;
                gRef.current = fresh(prepareBeats(film, v?.duration || film.chart, seed, original), seed, 0, ramp);
                gRef.current.charted = true;
                doneSent.current = false;
                setUsingStill(false);
                setLive(true);
                setPhase("run");
                if (v) {
                  try { v.currentTime = 0; } catch { /* */ }
                  void v.play().catch(() => {});
                }
                if (film.score) startScore(film.score, 0);
              }}
            >
              Run it again
            </button>
            )}
            <button type="button" className="min-h-12 rounded-xl border border-line px-5 text-sm" {...press(onExit)}>
              Leave
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Resonance({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="pointer-events-none px-6">
      <div className="h-[5px] overflow-hidden rounded-full bg-line/40">
        <div
          className="h-full rounded-full"
          style={{
            width: `${v * 100}%`,
            background: "linear-gradient(90deg, #3d6a78 0%, #9ec9d4 58%, #f2fbff 100%)",
            boxShadow: v > 0.18 ? `0 0 ${8 + v * 20}px rgba(158,201,212,${0.2 + v * 0.5})` : "none",
            transition: "width 180ms linear",
          }}
        />
      </div>
    </div>
  );
}

function CutWash({ beat, t }: { beat?: Beat; t: number }) {
  if (!beat || (beat.kind !== "left" && beat.kind !== "right")) return null;
  const dt = beat.at - t;
  if (dt > 2.4 || dt < -beat.win) return null;
  const live = Math.abs(t - beat.at) < beat.win;
  const k = live ? 1 : Math.max(0, 1 - Math.max(0, dt) / 2.4);
  const left = beat.kind === "left";
  const glow = live ? 0.72 : 0.28 + k * 0.4;
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div
        className="absolute inset-0"
        style={{
          background: left
            ? `linear-gradient(90deg, rgba(158,201,212,${glow}) 0%, rgba(90,170,210,${glow * 0.35}) 28%, transparent 58%)`
            : `linear-gradient(270deg, rgba(158,201,212,${glow}) 0%, rgba(90,170,210,${glow * 0.35}) 28%, transparent 58%)`,
        }}
      />
      <div
        className="absolute bottom-[18%] h-[22%]"
        style={{
          left: left ? "0%" : "42%",
          width: "58%",
          background: left
            ? `linear-gradient(90deg, rgba(232,180,80,${0.15 + k * 0.35}) 0%, rgba(158,201,212,${0.2 + k * 0.4}) 40%, transparent 100%)`
            : `linear-gradient(270deg, rgba(232,180,80,${0.15 + k * 0.35}) 0%, rgba(158,201,212,${0.2 + k * 0.4}) 40%, transparent 100%)`,
          filter: `blur(${6 + k * 8}px)`,
        }}
      />
      {live && (
        <div
          className="absolute top-[28%] h-[44%] w-[3px]"
          style={{
            left: left ? "18%" : "auto",
            right: left ? "auto" : "18%",
            background: "linear-gradient(180deg, transparent, #9ec9d4, #fff, #9ec9d4, transparent)",
            boxShadow: "0 0 18px 4px rgba(158,201,212,0.7)",
            opacity: 0.9,
          }}
        />
      )}
    </div>
  );
}

function Marks({
  beats,
  index,
  t,
  hud,
  onMarkDown,
  onMarkUp,
}: {
  beats: Beat[];
  index: number;
  t: number;
  hud: { hold: number; mash: number; need: number };
  onMarkDown: (e: PE<HTMLButtonElement>, beat: Beat) => void;
  onMarkUp: (e: PE<HTMLButtonElement>) => void;
}) {
  const visible = beats.filter((b, i) => {
    if (i < index) return false;
    const until = b.at - t;
    return until < APPROACH && until > -b.win * 0.35;
  });

  return (
    <>
      {visible.map((beat) => {
        const spot = spotOf(beat);
        const until = beat.at - t;
        const p = Math.max(0, Math.min(1, 1 - until / APPROACH));
        const current = beat.id === beats[index]?.id;
        if (!current) {
          const cur = beats[index];
          if (cur) {
            const c = spotOf(cur);
            if ((c.x - spot.x) ** 2 + (c.y - spot.y) ** 2 < 0.065) return null;
          }
        }
        const round = beat.kind === "relic" ? "rounded-full" : "rounded-2xl";
        const sub =
          beat.kind === "mash"
            ? ` ${hud.mash}/${hud.need}`
            : beat.kind === "hold"
              ? ` ${Math.round(hud.hold * 100)}%`
              : beat.kind === "swipe"
                ? beat.lane === "l"
                  ? " ←"
                  : " →"
                : "";
        return (
          <button
            key={beat.id}
            type="button"
            aria-label={beat.label}
            className={`absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center border ${round} ${
              current ? "border-ice bg-bg/85 text-ice" : "pointer-events-none border-line bg-bg/55 text-muted"
            }`}
            style={{
              left: `${spot.x * 100}%`,
              top: `${spot.y * 100}%`,
              width: current ? 96 : 80,
              height: current ? 96 : 80,
              opacity: 0.45 + p * 0.55,
              animation: reducedMotion() ? undefined : "mark-bloom 280ms ease-out",
            }}
            onPointerDown={(e) => onMarkDown(e, beat)}
            onPointerUp={onMarkUp}
            onPointerCancel={onMarkUp}
          >
            <span
              className={`pointer-events-none absolute rounded-full border border-ice/55 ${round}`}
              style={{
                inset: "-22%",
                transform: `scale(${Math.max(1, 2.15 - p * 1.15)})`,
                opacity: 0.2 + p * 0.65,
              }}
            />
            <span className="relative px-1 text-center font-display text-sm leading-tight">
              {beat.label}
              {current ? sub : ""}
            </span>
            {current && beat.kind === "hold" && (
              <span
                className="pointer-events-none absolute right-2 bottom-2 left-2 h-1 overflow-hidden rounded-full bg-line"
              >
                <span className="block h-full bg-hold" style={{ width: `${hud.hold * 100}%` }} />
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
