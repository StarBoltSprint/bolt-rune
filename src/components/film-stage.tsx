import { useEffect, useRef, useState, type PointerEvent as PE } from "react";
import {
  CUE_GAP_MIN,
  FILM_BY_ID,
  gradeOf,
  cueFillGone,
  cueFillLive,
  cueFillShown,
  cueFillSide,
  cuePictureSpot,
  HOLD_CUE_APPROACH,
  PACE_MAX,
  PACE_MIN,
  paceAfterMiss,
  prepareBeats,
  prepareHoldBeats,
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
import { sfxHit, unlockAudio, startScore, stopScore, syncScore, syncPictureAudio, fireGradeAudio, howlOnce, toggleMutePictureAudio, prefetchStockAudio, holdPictureAudio, releasePictureAudio, isPictureMuted } from "@/game/audio";
import { fireGradeHaptic, type HapticPrefs } from "@/game/pcg-haptics";
import {
  chromePauseOnly,
  isLocomotionKey,
  keyPlayAct,
  laneOfSide,
  mapPlayContact,
  resolvePlayPointer,
  swipeSideOf,
  videoLayoutRect,
  type PlaySide,
  type TapMemory,
  type VideoLayout,
} from "@/game/pcg-input";
import { PLAY_A11Y_LABEL, defaultPlayA11y, playCoyoteS, reduceMotionOn, type PlayA11y } from "@/game/pcg-a11y";
import { press } from "@/lib/press";
import { isClip, localizeClip, uniqueClips } from "@/game/artifacts";
import { cacheClip } from "@/lib/cook";
import { playableClipSrc, stockBiomeLoop, warmClip } from "@/game/play-clip";
import { HazardLayer } from "@/components/hazard-layer";
import { biomeQteQuiet, doorLetterOf, firstBiomePlate, hallDoorTap, hallPlateAt, holdDoorLoops, holdLoopSeam, holdPlateStuck, holdPlateUnderrun, hungBiomePlaylist, hungStageChrome, shouldHoldBiome, sprintHallDoor, stagePlateMustLoad } from "@/game/enter-graph";
import { doorAtPoint, isHallFilm, isLivingHallLoop } from "@/game/stock-room";
import { afterPlate, beginOnline, pictureTimeFromPlates, type OnlineStrip, type TapObserve } from "@/game/pcg-wfc";
import { readRunSeed } from "@/game/pcg-rail";
import {
  activeCueIndex,
  advancePictureTime,
  applyGradeMomentum,
  applyHowlMomentum,
  applyRecallMomentum,
  beginPlayClock,
  tickIdleDecay,
  trailStepOnCross,
  type IdleTrail,
  mediaWrapDt,
  SPAWN_M,
  commitNodeStill,
  cuesFromBeats,
  decoderSkipNotMiss,
  endPlateClock,
  gradeEnterArm,
  hidePlayClock,
  howlAct,
  makePlate,
  mayAdvancePicture,
  mayAdvanceWfc,
  mayEnterArm,
  mayPrefetch,
  nextCueOn,
  noteWalkHit,
  pausePlayClock,
  pictureTimeNow,
  plateTapFromGrades,
  playMayPeak,
  playPhase,
  recallStill,
  resonanceFill,
  resonanceTone,
  resumePlayClock,
  sideFromLane,
  type Cue,
  type CueSide,
  type HitClass,
  type PicturePhase,
  type Plate,
  type PlayClock,
} from "@/game/pcg-play";
import {
  applyPoseIntent,
  advancePosePicture,
  beginPose,
  centerHowlHit,
  gradePoseTap,
  HOWL_HOLD_MS,
  howlPose,
  onBreathLap,
  onEndedPose,
  pausePose,
  poseBreathLoops,
  recallPose,
  resumePose,
  type DoorSide,
  type PoseState,
} from "@/game/pcg-pose";
import { createDomTransitionPlayer, planTransition, runTransition } from "@/game/transition";
import { createPreloadPool, syncPreload } from "@/game/preload";

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
  /** Door that opened this sprint — leftover / same-door taps stay on biome. */
  holdDoor?: "A" | "B";
  /** Bound living hall — title is Room N • Door A, never only the biome name. */
  holdHall?: number;
  /** Pause / forge chrome (SEATS) — never over living play. */
  onPaused?: (paused: boolean) => void;
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
    resonance: SPAWN_M,
  };
}

function liveSpot(beat: Beat, t: number): Spot {
  if (!beat.canyon) return spotOf(beat);
  const p = Math.max(0, Math.min(1, 1 - (beat.at - t) / CANYON_APPROACH));
  const pr = projectHazard(beat.canyon, p);
  return { x: pr.x, y: pr.y };
}

export function FilmStage({ id, original, echoSrc, custom, ramp = false, onExit, onDone, onHallDoor, holdDoor, holdHall, onPaused }: Props) {
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
  const wfcRef = useRef<OnlineStrip | null>(null);
  const wfcPlayed = useRef<number[]>([]);
  const plateTap = useRef({ miss: 0, hit: 0, late: 0 });
  const playClockRef = useRef<PlayClock>(beginPlayClock());
  const playPausedRef = useRef(false);
  const playCuesRef = useRef<Cue[]>([]);
  const playGradedRef = useRef<boolean[]>([]);
  const playGradesRef = useRef<HitClass[]>([]);
  const walkHitsRef = useRef({ A: false, B: false });
  const poseRef = useRef<PoseState>(beginPose());
  const [poseLoop, setPoseLoop] = useState(true);
  const lastMediaTRef = useRef(0);
  const recallSkipRef = useRef(false);
  const idleTrailRef = useRef<IdleTrail | null>(null);
  const drainRef = useRef(0);
  const playPlateRef = useRef<Plate | null>(null);
  const hallFlagsRef = useRef<boolean[]>([]);
  const advancing = useRef(false);
  const laneRef = useRef<0 | 1>(0);
  const swapLock = useRef(0);
  const raf = useRef(0);
  const last = useRef(0);
  const popN = useRef(0);
  const swipe = useRef<{ x: number; y: number; playhead: number; zone?: string } | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const lastTapRef = useRef<TapMemory | null>(null);
  const howlTimerRef = useRef(0);
  const howledRef = useRef(false);
  const reduced = useRef(false);
  const doneSent = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onHallDoorRef = useRef(onHallDoor);
  onHallDoorRef.current = onHallDoor;
  const holdDoorRef = useRef(holdDoor);
  holdDoorRef.current = holdDoor;
  const mountedAt = useRef(typeof performance !== "undefined" ? performance.now() : Date.now());

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
    resonance: SPAWN_M,
    pace: 1,
    paused: false,
    peak: false,
    phase: "calm" as PicturePhase,
    drain: 0,
  });
  const [pops, setPops] = useState<Pop[]>([]);
  const [shake, setShake] = useState({ x: 0, y: 0, rot: 0 });
  const [flash, setFlash] = useState(0);
  const [a11y, setA11y] = useState<PlayA11y>(() => defaultPlayA11y());
  const a11yRef = useRef(a11y);
  a11yRef.current = a11y;
  const [layout, setLayout] = useState<VideoLayout>({ x: 0, y: 0, w: 0, h: 0 });
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
  const loopT = useRef(0);
  const coarse = useRef(false);
  const recoverAt = useRef(0);
  const fadeAbort = useRef<AbortController>(new AbortController());
  const preloadRef = useRef(createPreloadPool());

  function abortPlateFade() {
    fadeAbort.current.abort();
    fadeAbort.current = new AbortController();
    preloadRef.current.pauseAll();
  }

  function bindActive(n: 0 | 1) {
    laneRef.current = n;
    videoRef.current = n === 0 ? aRef.current : bRef.current;
    setLane(n);
  }

  function armPlate(el: HTMLVideoElement | null, url: string | undefined) {
    if (!el || !url) return;
    el.loop = holdDoorLoops(holdDoorRef.current);
    if (el.getAttribute("data-url") === url && el.readyState >= 3 && !el.paused) return;
    el.setAttribute("data-url", url);
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.preload = "auto";
    const src = playableClipSrc(url) || url;
    /* warmClip is HTTP cache only — always load() the visible stage plate. */
    const changed = el.getAttribute("src") !== src;
    if (changed) el.src = src;
    if (stagePlateMustLoad(changed, el.readyState)) {
      el.load();
      recoverAt.current = typeof performance !== "undefined" ? performance.now() : Date.now();
    }
    prefetchStockAudio(src);
    el.onerror = () => {
      if (holdDoorRef.current) {
        const fallback = stockBiomeLoop();
        if (el.getAttribute("src") !== fallback && src !== fallback) {
          el.setAttribute("data-url", fallback);
          el.src = fallback;
          el.loop = true;
          el.load();
          void el.play().then(() => setLive(true)).catch(() => {
            setUsingStill(true);
            setLive(false);
          });
          return;
        }
        setUsingStill(true);
        setLive(false);
        return;
      }
      if (isHallFilm(url) || isLivingHallLoop(url)) return;
      if (el.getAttribute("src") === stockBiomeLoop()) return;
      if (isLivingHallLoop(stockBiomeLoop())) return;
      el.setAttribute("data-url", stockBiomeLoop());
      el.src = stockBiomeLoop();
      el.load();
    };
  }

  function otherPlate() {
    return laneRef.current === 0 ? bRef.current : aRef.current;
  }

  function chartFor(duration: number, seed: number) {
    if (holdDoorRef.current) {
      const plate = duration > 1 ? duration : 15;
      return prepareHoldBeats(plate, seed);
    }
    return prepareBeats(film, duration, seed, original);
  }

  /** One in-flight CueFill at a time — skip jumps, stacked L/R ticks, and already-gone fills. */
  function playNodeId() {
    return `${film.id}:${holdHall ?? ""}:${holdDoorRef.current || "run"}`;
  }

  function coyoteNow() {
    return playCoyoteS(a11yRef.current);
  }

  function hapticPrefs(): HapticPrefs {
    return {
      muted: isPictureMuted(),
      reduceMotion: reduced.current || reduceMotionOn() || a11yRef.current.reduceFlash,
      cueOn: a11yRef.current.cueOnHaptic,
    };
  }

  function measurePlayLayout() {
    const el = wrapRef.current;
    const next = videoLayoutRect(el?.clientWidth || window.innerWidth || 9, el?.clientHeight || window.innerHeight || 16);
    setLayout(next);
    return next;
  }

  function playLayout(): VideoLayout {
    const el = wrapRef.current;
    if (!el) return layout.w ? layout : videoLayoutRect(9, 16);
    return videoLayoutRect(el.clientWidth, el.clientHeight);
  }

  function recallNow() {
    commitPose(recallPose(poseRef.current));
    gRef.current.resonance = applyRecallMomentum(gRef.current.resonance);
    recallSkipRef.current = true;
    const still = recallStill(playNodeId(), playPlateRef.current);
    if (still) setPoster(still);
  }

  function resetPlaySheet(beats: Beat[], duration: number, clip = "") {
    const cues = cuesFromBeats(beats, duration);
    playCuesRef.current = cues;
    playGradedRef.current = cues.map(() => false);
    playGradesRef.current = [];
    walkHitsRef.current = { A: false, B: false };
    lastMediaTRef.current = 0;
    playPlateRef.current = makePlate({
      clip: clip || src || film.local || "",
      duration,
      cues,
      stillStart: poster || film.still || "",
      stillEnd: poster || film.still || "",
    });
  }

  function commitPose(next: PoseState) {
    const prev = poseRef.current;
    poseRef.current = next;
    setPoseLoop(poseBreathLoops(next));
    if (next.mode === "paused") {
      preloadRef.current.pauseAll();
      return;
    }
    if (prev.pose !== next.pose || prev.mode !== next.mode || prev.clip !== next.clip) {
      const sm = next;
      const lib = { url: () => "", onDisk: () => false };
      const pre = preloadRef.current;
      syncPreload(sm, lib, pre);
    }
  }

  function keepPoseBreath(el?: HTMLVideoElement | null, restart = false) {
    if (!poseBreathLoops(poseRef.current)) return;
    const v = el || videoRef.current;
    if (!v) return;
    v.loop = true;
    if (restart || v.ended || (Number.isFinite(v.duration) && v.duration > 0 && v.currentTime >= v.duration - 0.08)) {
      try {
        v.currentTime = 0;
      } catch {
        /* */
      }
    }
    void v.play().then(() => {
      setLive(true);
      setUsingStill(false);
    }).catch(() => {});
  }

  function applyResonance(hit: HitClass) {
    const g = gRef.current;
    g.resonance = applyGradeMomentum(g.resonance, hit);
    if (hit === "miss") drainRef.current += 1;
  }

  function notePlayGrade(t: number, side?: CueSide | null) {
    const cues = playCuesRef.current;
    const coyote = coyoteNow();
    const i = activeCueIndex(cues, t, coyote, playGradedRef.current);
    if (i < 0) return null;
    const cue = cues[i]!;
    const hit = gradeEnterArm(t, cue, walkHitsRef.current, coyote, nextCueOn(cues, i), side);
    playGradedRef.current[i] = true;
    playGradesRef.current.push(hit);
    walkHitsRef.current = noteWalkHit(walkHitsRef.current, cue, hit);
    if (poseRef.current.mode === "walk" && (side === "A" || side === "B")) {
      commitPose(gradePoseTap(poseRef.current, side, t, cues).state);
    }
    applyResonance(hit);
    fireGradeAudio(hit, t);
    fireGradeHaptic(hit, hapticPrefs());
    return hit;
  }

  function togglePlayPause() {
    abortPlateFade();
    const v = videoRef.current;
    if (playPausedRef.current) {
      playPausedRef.current = false;
      playClockRef.current = resumePlayClock(playClockRef.current);
      commitPose(resumePose(poseRef.current));
      lastMediaTRef.current = v && Number.isFinite(v.currentTime) ? v.currentTime : lastMediaTRef.current;
      releasePictureAudio();
      void v?.play().catch(() => {});
      setHud((h) => ({ ...h, paused: false }));
      onPaused?.(false);
      return;
    }
    playPausedRef.current = true;
    playClockRef.current = pausePlayClock(playClockRef.current);
    commitPose(pausePose(poseRef.current));
    holdPictureAudio();
    try {
      v?.pause();
    } catch {
      /* */
    }
    setHud((h) => ({ ...h, paused: true, resonance: gRef.current.resonance }));
    onPaused?.(true);
  }

  function pausePlay() {
    if (playPausedRef.current) return;
    togglePlayPause();
  }

  function skipToHoldCue(g: G, afterAt = Number.NEGATIVE_INFINITY) {
    if (!holdDoorRef.current) return;
    const t = Number.isFinite(afterAt) ? clock() : Number.NEGATIVE_INFINITY;
    while (g.i < g.beats.length) {
      const n = g.beats[g.i];
      if (cueFillShown(n) && n.at - afterAt >= CUE_GAP_MIN && (t < 0 || !cueFillGone(n, t))) break;
      g.i += 1;
    }
  }

  function restartHoldChart() {
    const g = gRef.current;
    g.i = 0;
    g.resolved = false;
    g.hits = 0;
    g.hold = 0;
    g.holding = false;
    g.streakMiss = 0;
    skipToHoldCue(g);
  }

  /** Native-loop the hung plate. Seek 0 at the seam — never finish / Film fracture. */
  function keepHoldLoop(el?: HTMLVideoElement | null) {
    if (!holdDoorLoops(holdDoorRef.current)) return;
    const v = el || videoRef.current;
    if (!v) return;
    v.loop = true;
    if (holdLoopSeam(v.ended, v.currentTime, v.duration)) {
      try {
        v.currentTime = 0;
      } catch {
        /* */
      }
      restartHoldChart();
      offsetRef.current = 0;
      loopT.current = 0;
    }
    void v.play().then(() => {
      setLive(true);
      setUsingStill(false);
    }).catch(() => holdBiomePlate(v));
  }

  /** waiting/stalled with paused===false — load()+play so the MP4 is not a frozen poster. */
  function recoverHoldPlate(el?: HTMLVideoElement | null, event?: string | null) {
    if (!holdDoorRef.current || !el) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - recoverAt.current < 420) return;
    if (!holdPlateStuck(el.readyState, el.paused, event) && !el.paused) return;
    recoverAt.current = now;
    if (event === "waiting" || event === "stalled" || el.readyState < 2) {
      const keep = Number.isFinite(el.currentTime) ? el.currentTime : 0;
      try {
        el.load();
      } catch {
        /* */
      }
      if (keep > 0.05) {
        try {
          el.currentTime = keep;
        } catch {
          /* */
        }
      }
    }
    el.loop = true;
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    void el.play().then(() => {
      setLive(true);
      setUsingStill(false);
    }).catch(() => {});
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
      measurePlayLayout();
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
    gRef.current = fresh(chartFor(film.chart, seed), seed, film.lives === 1 ? 0 : film.hazards ? 4 : 3, ramp);
    gRef.current.charted = false;
    skipToHoldCue(gRef.current);
    doneSent.current = false;
    offsetRef.current = 0;
    plateRef.current = 0;
    advancing.current = false;
    laneRef.current = 0;
    swapLock.current = 0;
    const raw = uniqueClips(film.playlist || []);
    const keep = holdDoor ? hungBiomePlaylist(raw) : raw.filter((u) => !isLivingHallLoop(u));
    const list = (keep.length ? keep : holdDoor ? hungBiomePlaylist(raw) : raw).map((u) => playableClipSrc(localizeClip(u)) || localizeClip(u));
    platesRef.current = list.slice();
    wfcRef.current = beginOnline({ s: readRunSeed() || "s0", n: Math.max(5, list.length || 6), momentum: 0.7 });
    wfcPlayed.current = [];
    plateTap.current = { miss: 0, hit: 0, late: 0 };
    playClockRef.current = beginPlayClock();
    playPausedRef.current = false;
    playCuesRef.current = [];
    playGradedRef.current = [];
    playGradesRef.current = [];
    walkHitsRef.current = { A: false, B: false };
    commitPose(beginPose());
    {
      const sm = poseRef.current;
      const lib = { url: () => "", onDisk: () => false };
      const pre = preloadRef.current;
      syncPreload(sm, lib, pre);
    }
    lastMediaTRef.current = 0;
    playPlateRef.current = null;
    hallFlagsRef.current = list.map((u) => isHallFilm(u) || Boolean(sprintHallDoor(u, 0.22, 0.42)));
    const startI = holdDoor ? firstBiomePlate(list) : 0;
    plateRef.current = startI;
    const first = list[startI] || list[0] || (original ? film.origin : portrait ? film.portrait : film.local);
    if (holdDoor && first) warmClip(first);
    if (isClip(first) || playableClipSrc(first)) setSrc(playableClipSrc(first) || first);
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
      armPlate(a, list[startI] || first);
      if (!holdDoor) armPlate(b, list[startI + 1]);
      a.muted = true;
      a.defaultMuted = true;
      a.loop = Boolean(holdDoor);
      if (poseBreathLoops(poseRef.current)) a.loop = true;
      a.playsInline = true;
      a.playbackRate = holdDoor ? 1 : ramp ? 0.42 : 1;
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
          g.beats = chartFor(a.duration, g.seed);
          g.charted = true;
          g.i = 0;
          skipToHoldCue(g);
        }
      });
      if (a.readyState >= 2) ready();
      else void a.play().catch(() => {
        if (!gone) window.setTimeout(ready, 280);
      });
    };
    kick();
    /* holdDoor: first plate is warmed during hall breath — skip late post-mount preload. */
    if (holdDoor) {
      return () => {
        gone = true;
      };
    }
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
          if (i === 0 && !holdDoor) {
            const play = playableClipSrc(cached.url) || cached.url;
            setSrc(play);
            armPlate(aRef.current, play);
          }
          if (i === 1 && !holdDoor) armPlate(bRef.current, cached.url);
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
  }, [film.playlist?.join("|") ?? film.local, original, ramp, holdDoor]);

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
    v.loop = holdDoorLoops(holdDoorRef.current);
    if (rampRef.current) v.playbackRate = gRef.current.pace || 0.7;
    else v.playbackRate = gRef.current.pace || 1;
    const kick = () => {
      advancing.current = false;
      if (!v.getAttribute("data-url") && film.playlist?.[0]) armPlate(v, film.playlist[0]);
      if (holdDoorLoops(holdDoorRef.current) && holdLoopSeam(v.ended, v.currentTime, v.duration)) {
        keepHoldLoop(v);
        return;
      }
      if (holdDoorLoops(holdDoorRef.current) && holdPlateStuck(v.readyState, v.paused)) {
        recoverHoldPlate(v);
        return;
      }
      void v.play().then(() => {
        setLive(true);
        setUsingStill(false);
      }).catch(() => {});
    };
    const onWait = () => recoverHoldPlate(v, "waiting");
    const onStall = () => recoverHoldPlate(v, "stalled");
    if (v.readyState >= 2) kick();
    v.addEventListener("canplay", kick);
    v.addEventListener("waiting", onWait);
    v.addEventListener("stalled", onStall);
    v.addEventListener("playing", () => {
      setLive(true);
      setUsingStill(false);
    });
    kick();
    const retry = window.setInterval(() => {
      if (!v.paused && v.readyState >= 2) {
        window.clearInterval(retry);
        return;
      }
      kick();
    }, 400);
    if (film.score) startScore(film.score, 0);
    return () => {
      v.removeEventListener("canplay", kick);
      v.removeEventListener("waiting", onWait);
      v.removeEventListener("stalled", onStall);
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
      const hold = Boolean(holdDoorRef.current);
      const hallQuiet = hallPlateNow();
      if (v && phaseRef.current === "run" && !g.crashed && !g.done) {
        if (hold && holdLoopSeam(v.ended, v.currentTime, v.duration)) keepHoldLoop(v);
        else if (hold && holdPlateStuck(v.readyState, v.paused)) recoverHoldPlate(v);
        else if (hold && holdPlateUnderrun(v.readyState, v.paused, v.currentTime)) recoverHoldPlate(v, "waiting");
        else if (v.paused && (live || hold) && !playPausedRef.current) void v.play().catch(() => {});
      }

      let t = 0;
      if (usingStill) {
        if (mayAdvancePicture(playClockRef.current)) g.fakeT += dt;
        t = g.fakeT;
      } else if (v) {
        t = clock();
        if (v.duration && !g.charted && v.duration > 1) {
          g.beats = chartFor(v.duration, g.seed);
          g.charted = true;
          g.i = 0;
          skipToHoldCue(g);
          resetPlaySheet(g.beats, v.duration, v.getAttribute("data-url") || src);
        }
        const list = platesRef.current.length ? platesRef.current : uniqueClips(film.playlist || []);
        if (!hold && list.length > 1 && plateRef.current < list.length - 1 && !advancing.current && v.duration > 1 && Number.isFinite(v.duration) && mayPrefetch(playClockRef.current)) {
          const nxt = otherPlate();
          const nextUrl = list[plateRef.current + 1];
          if (nextUrl) armPlate(nxt, nextUrl);
          const left = v.duration - v.currentTime;
          if (left <= 0.18 && v.currentTime > 0.5) goNextPlate();
        }
      }
      if (hold && v && holdLoopSeam(v.ended, v.currentTime, v.duration)) {
        keepHoldLoop(v);
        t = clock();
      }
      if (hold && t + 0.45 < loopT.current) restartHoldChart();
      loopT.current = t;
      if (film.score && phaseRef.current === "run") syncScore(t);

      const mediaT = usingStill ? g.fakeT : v && Number.isFinite(v.currentTime) ? v.currentTime : 0;
      const prevMedia = lastMediaTRef.current;
      const jump = mediaT - prevMedia;
      const wrapped = prevMedia > 0.2 && mediaT + 0.15 < prevMedia;
      if (prevMedia > 0 && jump > 0.12) {
        const cues = playCuesRef.current;
        for (let i = 0; i < cues.length; i++) {
          if (playGradedRef.current[i]) continue;
          if (decoderSkipNotMiss(prevMedia, mediaT, cues[i]!, coyoteNow(), nextCueOn(cues, i))) {
            playGradedRef.current[i] = true;
          }
        }
      }
      const wrapDt = wrapped ? mediaWrapDt(prevMedia, mediaT, v && Number.isFinite(v.duration) ? v.duration : 0) : 0;
      const mediaDt = wrapped ? wrapDt : jump > 0 && jump < 0.8 ? jump : 0;
      if (mayAdvancePicture(playClockRef.current) && mediaDt > 0) {
        playClockRef.current = advancePictureTime(playClockRef.current, mediaDt * 1000);
        if (wrapped && poseBreathLoops(poseRef.current) && !hold) {
          /* Native loop swallows ended — same breath(pose). Never afterPlate / WFC / recook. */
          commitPose(onBreathLap(poseRef.current));
        }
      }
      const pose = poseRef.current;
      const beforeM = g.resonance;
      const idle = tickIdleDecay(beforeM, {
        paused: playPausedRef.current || playClockRef.current.paused || playClockRef.current.hidden || playClockRef.current.waitingOnCook,
        mode: pose.clip === "decay" ? "decay" : pose.mode,
        clip: pose.clip,
        currentTime: mediaT,
        lastSample: prevMedia,
        duration: v && Number.isFinite(v.duration) ? v.duration : undefined,
        justRecalled: recallSkipRef.current,
        pictureMs: pose.pictureMs,
        peak: playMayPeak(playClockRef.current, beforeM),
      });
      recallSkipRef.current = false;
      if (idle.dt > 0) {
        g.resonance = idle.m;
        commitPose(advancePosePicture(poseRef.current, idle.dt * 1000));
        const step = trailStepOnCross(beforeM, idle.m, idleTrailRef.current || "none");
        if (step.stepped) idleTrailRef.current = step.trail;
      }
      lastMediaTRef.current = mediaT;
      const liveCell = wfcRef.current?.cells[plateRef.current];
      syncPictureAudio({
        playhead: mediaT,
        paused: playClockRef.current.paused || playPausedRef.current,
        waitingOnCook: playClockRef.current.waitingOnCook || Boolean(v && !usingStill && v.readyState < 2 && !playPausedRef.current),
        hidden: playClockRef.current.hidden,
        trail: idleTrailRef.current || liveCell?.trail,
        role: liveCell?.role,
        plate: plateRef.current,
      });

      g.trauma = Math.max(0, g.trauma - dt * 2.4);
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
        if (!hold && g.rate > actual + 0.12 && !advancing.current && Number.isFinite(v.duration) && v.duration > 1) {
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
        const late = hold ? cueFillGone(beat, t) : t > beat.at + beat.win * 0.7;
        if (beat.kind === "hold" && g.hold >= beat.holdMs && Math.abs(t - beat.at) < beat.win) {
          judge(g, beat, Math.abs(t - beat.at));
        } else if (late && !advancing.current) {
          if (hold && v && holdLoopSeam(v.ended, v.currentTime, v.duration)) {
            keepHoldLoop(v);
          } else if (biomeQteQuiet(holdDoorRef.current, hallQuiet) || hallQuiet) {
            g.resolved = true;
            advance(g);
          } else if (holdDoorRef.current && !cueFillShown(beat)) {
            /* Jump / vault / center: no CueFill this pass — do not MISS or tank pace. */
            g.resolved = true;
            advance(g);
          } else if (holdDoorRef.current && t - beat.at > beat.win) {
            /* Jumped past this CueFill (seek / stale wrap) — do not MISS. */
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
        const list = platesRef.current.length ? platesRef.current : uniqueClips(film.playlist || []);
        if (holdDoorLoops(holdDoorRef.current) || (custom && shouldHoldBiome(list, plateRef.current))) holdBiomePlate(v);
        else finish(g);
      } else if (
        holdDoorLoops(holdDoorRef.current) &&
        phaseRef.current === "run" &&
        v &&
        (v.ended || holdLoopSeam(v.ended, v.currentTime, v.duration))
      ) {
        keepHoldLoop(v);
      } else if (
        !hold &&
        phaseRef.current === "run" &&
        !advancing.current &&
        !usingStill &&
        v &&
        plateRef.current >= listLen - 1 &&
        v.ended &&
        v.duration > 1
      ) {
        const list = platesRef.current.length ? platesRef.current : uniqueClips(film.playlist || []);
        if (custom && shouldHoldBiome(list, plateRef.current)) holdBiomePlate(v);
        else finish(g);
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
        paused: playPausedRef.current,
        peak: playMayPeak(playClockRef.current, g.resonance),
        phase: playPhase(playClockRef.current, g.resonance),
        drain: drainRef.current,
      };
      const due = now - lastHudAt.current > (coarse.current ? 120 : 64);
      if (phaseRef.current === "run" && (due || g.i !== lastHudI.current)) {
        lastHudAt.current = now;
        lastHudI.current = g.i;
        setHud(nextHud);
        setNowBeat(holdDoorRef.current && beat && !cueFillShown(beat) ? null : beat);
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

  function plateTapKind(): TapObserve {
    const t = plateTap.current;
    if (t.miss > 0) return "miss";
    if (t.hit > 0) return "hit";
    if (t.late > 0) return "late";
    return "idle";
  }

  function observePlateTap(i: number, durationMs: number) {
    const live = wfcRef.current;
    if (!live || !mayAdvanceWfc(playClockRef.current)) return;
    const played = playClockRef.current.platePlayedMs || Math.max(0, Number(durationMs) || live.wave.plateSecs * 1000);
    playClockRef.current = endPlateClock(playClockRef.current, played);
    wfcPlayed.current[i] = played;
    const pictureTime = pictureTimeNow(playClockRef.current) || pictureTimeFromPlates(wfcPlayed.current.slice(0, i + 1));
    const tap: TapObserve = playGradesRef.current.length ? plateTapFromGrades(playGradesRef.current) : plateTapKind();
    if (tap === "idle") applyResonance("idle");
    const m = Math.min(1, Math.max(0, gRef.current.resonance));
    wfcRef.current = afterPlate(live, i, tap, m, pictureTime);
    const plate = playPlateRef.current;
    commitNodeStill(playNodeId(), plate?.stillEnd || poster || film.still);
    plateTap.current = { miss: 0, hit: 0, late: 0 };
    playGradesRef.current = [];
  }

  function goNextPlate() {
    const list = (platesRef.current.length ? platesRef.current : uniqueClips(film.playlist || [])).map((u) => playableClipSrc(localizeClip(u)) || localizeClip(u));
    const cur = videoRef.current;
    if (!list.length || !cur) return false;
    const i = plateRef.current;
    if (i + 1 >= list.length) return false;
    if (playPausedRef.current) return false;
    if (holdDoorRef.current && (usingStillRef.current || cur.currentTime < 0.5 || cur.paused)) return false;
    if (advancing.current) return true;
    if (performance.now() < swapLock.current) return true;
    advancing.current = true;
    swapLock.current = performance.now() + 700;
    const add = cur.duration && Number.isFinite(cur.duration) && cur.duration > 1 ? cur.duration : 10;
    observePlateTap(i, add * 1000);
    const nextI = i + 1;
    skipAcc.current = 0;
    const nextUrl = list[nextI];
    const next = laneRef.current === 0 ? bRef.current : aRef.current;
    const to: 0 | 1 = laneRef.current === 0 ? 1 : 0;
    const fromPlate = playPlateRef.current;
    const platePlan = planTransition(
      {
        clip: list[i],
        stillStart: fromPlate?.stillStart,
        stillEnd: fromPlate?.stillEnd,
        pose: poseRef.current.pose,
        act: poseRef.current.mode,
      },
      {
        clip: nextUrl,
        stillStart: fromPlate?.stillEnd || fromPlate?.stillStart,
        stillEnd: fromPlate?.stillEnd,
        pose: poseRef.current.pose,
        act: poseRef.current.mode,
      },
    );
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
    const player = createDomTransitionPlayer({
      outgoing: cur,
      incoming: next,
      pre: preloadRef.current,
      plateId: poseRef.current.clip,
      assignSrc: (el, url, loop) => {
        el.loop = loop || poseBreathLoops(poseRef.current);
        armPlate(el, url);
      },
    });
    void runTransition(player, platePlan, nextUrl, {
      signal: fadeAbort.current.signal,
      pre: preloadRef.current,
      plateId: poseRef.current.clip,
      resetPlateTime: () => {
        playClockRef.current = { ...playClockRef.current, platePlayedMs: 0 };
        poseRef.current = { ...poseRef.current, plateTimeMs: 0 };
      },
      play: () => {
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
      },
    });
    return true;
  }

  function finish(g: G) {
    if (holdDoorLoops(holdDoorRef.current)) {
      keepHoldLoop(videoRef.current);
      return;
    }
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
    const holdVid = videoRef.current;
    if (holdDoorLoops(holdDoorRef.current) && holdVid && holdLoopSeam(holdVid.ended, holdVid.currentTime, holdVid.duration)) {
      keepHoldLoop(holdVid);
      return;
    }
    /* Hall leftover / door taps on a hung enter never MISS and never tank pace. */
    if (biomeQteQuiet(holdDoorRef.current, hallPlateNow()) || hallPlateNow()) {
      if (g.resolved) return;
      g.resolved = true;
      advance(g);
      return;
    }
    if (holdDoorRef.current && !cueFillShown(beat)) {
      if (g.resolved) return;
      g.resolved = true;
      advance(g);
      return;
    }
    if (holdDoorRef.current && !cueFillLive(beat, clock()) && !cueFillGone(beat, clock())) {
      /* No in-picture CueFill — empty-space taps never MISS. */
      return;
    }
    if (g.resolved) return;
    g.resolved = true;
    plateTap.current.miss += 1;
    g.miss += 1;
    g.combo = 0;
    g.streakMiss += 1;
    g.trauma = Math.min(1, g.trauma + 0.45);
    if (!notePlayGrade(clock(), null)) applyResonance("miss");
    sfxHit("miss");
    pop("MISS", "bad", liveSpot(beat, clock()).x * 100, liveSpot(beat, clock()).y * 100);
    g.pace = paceAfterMiss(g.pace);
    if (!a11yRef.current.reduceFlash) {
      setFlash(1);
      window.setTimeout(() => setFlash(0), 120);
    }
    if (g.streakMiss >= (film.lives ?? 3)) {
      const v = videoRef.current;
      if (holdDoorLoops(holdDoorRef.current) && v && holdLoopSeam(v.ended, v.currentTime, v.duration)) {
        keepHoldLoop(v);
        return;
      }
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
      plateTap.current.hit += 1;
      g.trauma = Math.min(1, g.trauma + 0.22);
    } else if (err <= greatCut) {
      word = "great";
      pts = 210;
      g.great += 1;
      plateTap.current.hit += 1;
      g.trauma = Math.min(1, g.trauma + 0.12);
    } else {
      g.good += 1;
      plateTap.current.late += 1;
    }
    g.resolved = true;
    g.combo += 1;
    g.maxCombo = Math.max(g.maxCombo, g.combo);
    g.streakMiss = 0;
    if (!notePlayGrade(clock(), sideFromLane(beat.kind === "left" ? "l" : beat.kind === "right" ? "r" : beat.lane))) {
      applyResonance(word === "good" ? "late" : "hit");
    }
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
    const from = g.beats[g.i];
    const fromAt = from && cueFillShown(from) ? from.at : Number.NEGATIVE_INFINITY;
    g.i += 1;
    g.resolved = false;
    g.hits = 0;
    g.hold = 0;
    g.holding = false;
    if (holdDoorRef.current) {
      skipToHoldCue(g, fromAt);
    }
    if (g.i >= g.beats.length) {
      if (holdDoorLoops(holdDoorRef.current)) {
        /* Last CueFill this plate — ignore taps until the loop seam restarts the chart. */
        return;
      }
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
        hallPlateAt(orig, i, v?.getAttribute("data-url") || v?.currentSrc || v?.getAttribute("src")) ||
        hallPlateAt(list, i) ||
        sprintHallDoor(list[i] || orig[i] || v?.getAttribute("data-url"), 0.22, 0.42),
    );
  }

  function tryHallDoor(clientX: number, clientY: number) {
    if (!hallPlateNow()) return false;
    if (holdDoorRef.current) return true;
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return true;
    const nx = (clientX - box.left) / box.width;
    const ny = (clientY - box.top) / box.height;
    const hit = doorAtPoint(nx, ny);
    if (hit !== "m1" && hit !== "m2") return true;
    const letter = doorLetterOf(hit);
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (hallDoorTap(now, mountedAt.current, letter, holdDoorRef.current) === "stay") return true;
    /* Video-layout A/B (play input) feed the pose SM — do not invent a second hitbox. */
    const side = letter as DoorSide;
    const decided = applyPoseIntent(poseRef.current, { act: "grade", side }, { mediaT: clock() });
    commitPose(decided.state);
    if (decided.act === "enter") onHallDoorRef.current?.(letter);
    return true;
  }

  function holdBiomePlate(el?: HTMLVideoElement | null) {
    const raw = platesRef.current.length ? platesRef.current : uniqueClips(film.playlist || []);
    const list = holdDoorRef.current ? hungBiomePlaylist(raw) : raw;
    const i = firstBiomePlate(list);
    const candidate = list[i] && !isHallFilm(list[i]) ? list[i] : "";
    const next = playableClipSrc(candidate) || candidate || stockBiomeLoop();
    plateRef.current = Math.max(0, i);
    advancing.current = false;
    if (!next) {
      setUsingStill(true);
      setLive(false);
      return;
    }
    const v = el || videoRef.current;
    if (!v) {
      setUsingStill(true);
      return;
    }
    v.loop = holdDoorLoops(holdDoorRef.current);
    if (holdDoorLoops(holdDoorRef.current) && holdLoopSeam(v.ended, v.currentTime, v.duration)) {
      try {
        v.currentTime = 0;
      } catch {
        /* */
      }
      restartHoldChart();
    }
    armPlate(v, next);
    void v.play().then(() => {
      setLive(true);
      setUsingStill(false);
    }).catch(() => {
      const fallback = stockBiomeLoop();
      if (v.getAttribute("src") === fallback) {
        setUsingStill(true);
        setLive(false);
        return;
      }
      v.loop = true;
      armPlate(v, fallback);
      void v.play().then(() => {
        setLive(true);
        setUsingStill(false);
      }).catch(() => {
        setUsingStill(true);
        setLive(false);
      });
    });
  }

  function tryHit(nx?: number, ny?: number, swipe?: Lane) {
    const g = gRef.current;
    if (biomeQteQuiet(holdDoorRef.current, hallPlateNow()) || hallPlateNow()) return;
    if (phaseRef.current !== "run" || g.crashed) return;
    if (holdDoorRef.current && (!g.beats[g.i] || !cueFillShown(g.beats[g.i]))) return;
    const v = videoRef.current;
    const t = clock();
    const beat = g.beats[g.i];
    if (!beat || g.resolved) return;
    if (holdDoorRef.current && !cueFillLive(beat, t)) {
      /* Empty-space / dead-window taps: no MISS, no pace drop, no path fracture. */
      return;
    }
    const liveCue = playCuesRef.current[activeCueIndex(playCuesRef.current, t, coyoteNow(), playGradedRef.current)];
    if (liveCue?.kind === "enter-arm" && !mayEnterArm(walkHitsRef.current, liveCue.side)) {
      miss(g, beat);
      return;
    }
    if (Math.abs(t - beat.at) > beat.win) {
      const soon = holdDoorRef.current ? HOLD_CUE_APPROACH : APPROACH;
      if (t < beat.at && beat.at - t < soon) {
        fireGradeAudio("early", t);
        pop("SOON", "mid", spotOf(beat).x * 100, spotOf(beat).y * 100);
      }
      return;
    }

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
    judge(g, beat, Math.abs(t - beat.at));
  }

  function hitArrow(lane: Lane) {
    const g = gRef.current;
    if (biomeQteQuiet(holdDoorRef.current, hallPlateNow()) || hallPlateNow()) return;
    if (phaseRef.current !== "run" || g.crashed) return;
    if (holdDoorRef.current && (!g.beats[g.i] || !cueFillShown(g.beats[g.i]))) return;
    const v = videoRef.current;
    const t = clock();
    const beat = g.beats[g.i];
    if (!beat || g.resolved) return;
    if (beat.kind !== "left" && beat.kind !== "right") return;
    if (holdDoorRef.current && !cueFillLive(beat, t)) {
      /* Empty-space / dead-window taps: no MISS, no pace drop, no path fracture. */
      return;
    }
    const liveCue = playCuesRef.current[activeCueIndex(playCuesRef.current, t, coyoteNow(), playGradedRef.current)];
    if (liveCue?.kind === "enter-arm" && !mayEnterArm(walkHitsRef.current, liveCue.side)) {
      miss(g, beat);
      return;
    }
    if (Math.abs(t - beat.at) > beat.win) {
      const soon = holdDoorRef.current ? HOLD_CUE_APPROACH : APPROACH;
      if (t < beat.at && beat.at - t < soon) {
        fireGradeAudio("early", t);
        pop("SOON", "mid", 50, 72);
      }
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
    if (holdDoorLoops(holdDoorRef.current)) {
      restartHoldChart();
      if (usingStillRef.current) g.fakeT = 0;
      else if (v) {
        v.loop = true;
        try {
          v.currentTime = 0;
        } catch {
          /* */
        }
      }
      setPhase("run");
      void v?.play().catch(() => {});
      pop("REWIND", "mid", 50, 40);
      return;
    }
    const t = Math.max(0, (target?.at ?? 0) - 0.85);
    if (usingStillRef.current) g.fakeT = t;
    else if (v) v.currentTime = t;
    setPhase("run");
    void v?.play().catch(() => {});
    pop("REWIND", "mid", 50, 40);
  }

  function gradeSide(side: PlaySide) {
    const lane = laneOfSide(side);
    const g = gRef.current;
    const beat = g.beats[g.i];
    if (beat?.kind === "left" || beat?.kind === "right") {
      hitArrow(lane);
      return;
    }
    tryHit(undefined, undefined, lane);
  }

  function onKey(e: KeyboardEvent) {
    if (isLocomotionKey(e.code)) return;
    const act = keyPlayAct(e.code);
    if (!act) return;
    if (e.repeat && (act.kind === "side" || act.kind === "howl")) return;
    e.preventDefault();
    if (act.kind === "pause") {
      togglePlayPause();
      return;
    }
    if (act.kind === "mute") {
      toggleMutePictureAudio();
      return;
    }
    if (act.kind === "howl") {
      fireHowl();
      return;
    }
    if (act.kind === "recall") {
      recallNow();
      return;
    }
    if (playPausedRef.current) return;
    const g = gRef.current;
    const beat = g.beats[g.i];
    if (beat?.kind === "hold") g.holding = true;
    const decided = applyPoseIntent(poseRef.current, { act: "grade", side: act.side }, { mediaT: clock() });
    commitPose(decided.state);
    if (decided.act === "enter") onHallDoorRef.current?.(act.side);
    gradeSide(act.side);
  }

  function onKeyUp(e: KeyboardEvent) {
    const act = keyPlayAct(e.code);
    if (act?.kind === "side" || act?.kind === "howl") gRef.current.holding = false;
  }

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    const onVis = () => {
      playClockRef.current = hidePlayClock(playClockRef.current, document.hidden);
      if (document.hidden) pausePlay();
    };
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  function fireHowl() {
    howlAct();
    howlOnce();
    fireGradeHaptic("howl", hapticPrefs());
    abortPlateFade();
    gRef.current.resonance = applyHowlMomentum(gRef.current.resonance);
    commitPose(howlPose(poseRef.current));
    keepPoseBreath(videoRef.current, true);
  }

  function pointerDown(e: PE<HTMLDivElement>) {
    if (chromePauseOnly(e.target)) {
      pausePlay();
      return;
    }
    if (pointerIdRef.current != null && pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = e.pointerId;
    e.preventDefault();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const box = wrap.getBoundingClientRect();
    const frame = playLayout();
    const playhead = clock();
    const mapped = mapPlayContact({
      clientX: e.clientX,
      clientY: e.clientY,
      viewport: { left: box.left, top: box.top, w: box.width, h: box.height },
      layout: frame,
      widen: a11yRef.current.hitboxWiden,
    });
    howledRef.current = false;
    window.clearTimeout(howlTimerRef.current);
    swipe.current = { x: e.clientX, y: e.clientY, playhead, zone: mapped.zone };
    if (mapped.zone === "outside") {
      togglePlayPause();
      swipe.current = null;
      return;
    }
    if (mapped.zone === "center" && centerHowlHit(mapped.nx, mapped.ny) && !playPausedRef.current) {
      howlTimerRef.current = window.setTimeout(() => {
        howledRef.current = true;
        fireHowl();
      }, HOWL_HOLD_MS);
    }
  }

  function pointerUp(e: PE<HTMLDivElement>) {
    if (pointerIdRef.current != null && pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    window.clearTimeout(howlTimerRef.current);
    const g = gRef.current;
    g.holding = false;
    const start = swipe.current;
    swipe.current = null;
    if (howledRef.current) {
      howledRef.current = false;
      return;
    }
    if (tryHallDoor(e.clientX, e.clientY)) return;
    if (!start || playPausedRef.current) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const box = wrap.getBoundingClientRect();
    const frame = playLayout();
    const mapped = mapPlayContact({
      clientX: e.clientX,
      clientY: e.clientY,
      viewport: { left: box.left, top: box.top, w: box.width, h: box.height },
      layout: frame,
      widen: a11yRef.current.hitboxWiden,
    });
    const flicked = swipeSideOf(e.clientX - start.x);
    const intent = resolvePlayPointer({
      zone: mapped.zone,
      side: mapped.side === "A" || mapped.side === "B" ? mapped.side : null,
      swipe: flicked,
      center: "short",
      howlMode: a11yRef.current.howlMode,
      armed: mapped.side ? mayEnterArm(walkHitsRef.current, mapped.side) : false,
      prev: lastTapRef.current,
      playhead: start.playhead,
    });
    if (intent.act === "pause") {
      togglePlayPause();
      return;
    }
    if (intent.act === "howl") {
      fireHowl();
      return;
    }
    if (intent.act === "ignore") return;
    if (intent.act === "enter") {
      const side = intent.side;
      if (!mayEnterArm(walkHitsRef.current, side)) return;
      fireGradeHaptic("enter-armed", hapticPrefs());
      lastTapRef.current = null;
      const decided = applyPoseIntent(poseRef.current, { act: "enter", side }, { mediaT: clock() });
      commitPose(decided.state);
      if (decided.act === "enter") onHallDoorRef.current?.(side);
      gradeSide(side);
      return;
    }
    if (intent.act === "grade") {
      lastTapRef.current = { side: intent.side, playhead: start.playhead };
      const decided = applyPoseIntent(poseRef.current, { act: "grade", side: intent.side }, { mediaT: clock() });
      commitPose(decided.state);
      if (decided.act === "enter") onHallDoorRef.current?.(intent.side);
      gradeSide(intent.side);
    }
  }

  function onMarkDown(e: PE<HTMLButtonElement>, beat: Beat) {
    e.stopPropagation();
    e.preventDefault();
    if (tryHallDoor(e.clientX, e.clientY)) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* some mobile browsers refuse capture */
    }
    swipe.current = { x: e.clientX, y: e.clientY, playhead: clock() };
    const g = gRef.current;
    if (beat.kind === "hold") g.holding = true;
    if (beat.kind === "swipe") return;
    tryHit();
  }

  const heat = Math.min(1, hud.combo / 10);
  const pictureStyle = layout.w
    ? { left: layout.x, top: layout.y, width: layout.w, height: layout.h }
    : { inset: 0 as const };

  return (
    <div
      ref={wrapRef}
      className="play-surface relative h-dvh w-full overflow-hidden bg-bg text-fg select-none"
      data-sprint={ramp ? "1" : undefined}
      data-ramp={ramp ? "1" : undefined}
      data-play-paused={playPausedRef.current ? "1" : undefined}
      data-pose={poseRef.current.pose}
      data-pose-mode={poseRef.current.mode}
      data-pose-loop={poseLoop ? "1" : "0"}
      data-qte={holdDoor ? "play" : undefined}
      data-biome-play={holdDoor ? "1" : undefined}
      data-biome-quiet={undefined}
      data-biome-plate={holdDoor ? (usingStill || !live ? "still" : "clip") : undefined}
      style={{ touchAction: "none" }}
      aria-label={PLAY_A11Y_LABEL.surface}
      onPointerDown={pointerDown}
      onPointerUp={pointerUp}
      onPointerCancel={() => {
        gRef.current.holding = false;
        swipe.current = null;
        pointerIdRef.current = null;
        window.clearTimeout(howlTimerRef.current);
      }}
    >
      <div
        className="play-picture pointer-events-none absolute overflow-hidden will-change-transform"
        data-play-frame="9:16"
        style={{
          ...pictureStyle,
          transform: reduced.current ? undefined : `translate3d(${shake.x}px, ${shake.y}px, 0)`,
        }}
      >
        <img
          src={poster || undefined}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />
        <video
          ref={(el) => {
            aRef.current = el;
            if (laneRef.current === 0) videoRef.current = el;
            if (el) {
              el.muted = true;
              el.defaultMuted = true;
              el.playsInline = true;
              el.loop = holdDoorLoops(holdDoorRef.current) || poseBreathLoops(poseRef.current);
              el.setAttribute("playsinline", "true");
              el.setAttribute("webkit-playsinline", "true");
            }
          }}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          src={lane === 0 && (isClip(src) || playableClipSrc(src)) ? playableClipSrc(src) || src : undefined}
          poster={poster || undefined}
          playsInline
          muted
          loop={Boolean(holdDoor) || poseLoop}
          autoPlay={!(film.still || "").includes("citadel-tour")}
          preload="auto"
          style={{ opacity: lane === 0 && live ? 1 : 0, zIndex: lane === 0 ? 2 : 0, transform: "translateZ(0)", backfaceVisibility: "hidden", willChange: "opacity" }}
          onPlaying={() => {
            setLive(true);
            setUsingStill(false);
          }}
          onWaiting={() => recoverHoldPlate(aRef.current, "waiting")}
          onStalled={() => recoverHoldPlate(aRef.current, "stalled")}
          onCanPlay={() => {
            if ((film.still || "").includes("citadel-tour")) return;
            const el = aRef.current;
            if (el) void el.play().then(() => setLive(true)).catch(() => {});
          }}
          onEnded={() => {
            if (laneRef.current !== 0) return;
            if (holdDoorLoops(holdDoorRef.current)) {
              keepHoldLoop(aRef.current);
              return;
            }
            commitPose(onEndedPose(poseRef.current));
            if (poseBreathLoops(poseRef.current)) {
              keepPoseBreath(aRef.current);
              return;
            }
            const list = platesRef.current.length ? platesRef.current : uniqueClips(film.playlist || []);
            if (plateRef.current < list.length - 1) {
              goNextPlate();
              return;
            }
            if (custom && shouldHoldBiome(list, plateRef.current)) {
              holdBiomePlate(aRef.current);
              return;
            }
            const g = gRef.current;
            if (!g.done) finish(g);
          }}
          onError={() => {
            const list = platesRef.current.length ? platesRef.current : uniqueClips(film.playlist || []);
            if (holdDoorLoops(holdDoorRef.current) || (custom && shouldHoldBiome(list, plateRef.current))) {
              keepHoldLoop(aRef.current);
              return;
            }
            const at = list[plateRef.current] || "";
            if ((isHallFilm(at) || isLivingHallLoop(at)) && plateRef.current < list.length - 1) {
              goNextPlate();
              return;
            }
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
            if (el) el.loop = holdDoorLoops(holdDoorRef.current) || poseBreathLoops(poseRef.current);
          }}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          playsInline
          muted
          loop={Boolean(holdDoor) || poseLoop}
          preload="auto"
          style={{ opacity: lane === 1 && live ? 1 : 0, zIndex: lane === 1 ? 2 : 0, transform: "translateZ(0)", backfaceVisibility: "hidden", willChange: "opacity" }}
          onPlaying={() => {
            setLive(true);
            setUsingStill(false);
          }}
          onWaiting={() => recoverHoldPlate(bRef.current, "waiting")}
          onStalled={() => recoverHoldPlate(bRef.current, "stalled")}
          onEnded={() => {
            if (laneRef.current !== 1) return;
            if (holdDoorLoops(holdDoorRef.current)) {
              keepHoldLoop(bRef.current);
              return;
            }
            commitPose(onEndedPose(poseRef.current));
            if (poseBreathLoops(poseRef.current)) {
              keepPoseBreath(bRef.current);
              return;
            }
            const list = platesRef.current.length ? platesRef.current : uniqueClips(film.playlist || []);
            if (plateRef.current < list.length - 1) {
              goNextPlate();
              return;
            }
            if (custom && shouldHoldBiome(list, plateRef.current)) {
              holdBiomePlate(bRef.current);
              return;
            }
            const g = gRef.current;
            if (!g.done) finish(g);
          }}
          onError={() => {
            const list = platesRef.current.length ? platesRef.current : uniqueClips(film.playlist || []);
            if (holdDoorLoops(holdDoorRef.current) || (custom && shouldHoldBiome(list, plateRef.current))) {
              keepHoldLoop(bRef.current);
              return;
            }
            const at = list[plateRef.current] || "";
            if ((isHallFilm(at) || isLivingHallLoop(at)) && plateRef.current < list.length - 1) {
              goNextPlate();
              return;
            }
          }}
        />

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

      {phase === "run" && film.hazards && !original && !holdDoor && (
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
      {phase === "run" && film.pad === "arrows" && !holdDoor && <CutWash beat={nowBeat ?? undefined} t={hud.t} />}
      {phase === "run" && holdDoor && <CueFill beat={nowBeat ?? undefined} t={hud.t} />}
      {phase === "run" && (
        <Resonance
          value={hud.resonance}
          paused={hud.paused}
          peak={hud.peak}
          phase={hud.phase}
          drain={hud.drain}
        />
      )}
      {phase === "run" && !(film.hazards && !original) && film.pad !== "arrows" && !holdDoor && (
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
      </div>

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
            <button
              type="button"
              className="min-h-12 shrink-0 rounded-xl border border-line bg-surface/80 px-3 text-sm text-muted"
              {...press(togglePlayPause)}
            >
              {hud.paused ? "Resume" : "Pause"}
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
          {(() => {
            const stage = hungStageChrome(holdHall, holdDoor, film);
            /* Hall / hung stay: picture is the UI — no Room N • Door A Play Sprint header. */
            if (holdHall || holdDoor) return null;
            return (
              <>
                <h1 className="mt-2 font-display text-2xl leading-tight">{stage.title || film.name}</h1>
                {stage.play ? (
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">{stage.play}</p>
                ) : null}
                {stage.biome ? (
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">{stage.biome}</p>
                ) : null}
              </>
            );
          })()}
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

      {hud.paused && (
        <div
          className="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-bg/70 px-6"
          role="dialog"
          aria-label={PLAY_A11Y_LABEL.pause}
          data-pause-menu="1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <p role="status" aria-live="polite" className="font-mono text-[11px] uppercase tracking-[0.24em] text-ice">
            Paused. Picture frozen.
          </p>
          <div className="flex w-full max-w-sm flex-col gap-2 text-left text-sm">
            <label className="flex items-center justify-between gap-3">
              <span>{PLAY_A11Y_LABEL.coyote}</span>
              <input
                type="checkbox"
                checked={a11y.coyoteAssist}
                onChange={(e) => setA11y((s) => ({ ...s, coyoteAssist: e.target.checked }))}
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>{a11y.howlMode === "tap" ? PLAY_A11Y_LABEL.howlTap : PLAY_A11Y_LABEL.howlHold}</span>
              <input
                type="checkbox"
                checked={a11y.howlMode === "tap"}
                onChange={(e) => setA11y((s) => ({ ...s, howlMode: e.target.checked ? "tap" : "hold" }))}
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>{PLAY_A11Y_LABEL.widen}</span>
              <input
                type="checkbox"
                checked={a11y.hitboxWiden}
                onChange={(e) => setA11y((s) => ({ ...s, hitboxWiden: e.target.checked }))}
              />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>{PLAY_A11Y_LABEL.flash}</span>
              <input
                type="checkbox"
                checked={a11y.reduceFlash}
                onChange={(e) => setA11y((s) => ({ ...s, reduceFlash: e.target.checked }))}
              />
            </label>
            <p className="text-muted">{PLAY_A11Y_LABEL.captions}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" className="min-h-12 rounded-xl bg-accent px-5 text-sm font-medium text-bg" {...press(togglePlayPause)}>
              Resume
            </button>
            <button type="button" className="min-h-12 rounded-xl border border-line px-5 text-sm" {...press(recallNow)}>
              Recall
            </button>
          </div>
        </div>
      )}

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
              g.beats = chartFor(v?.duration || film.chart, g.seed);
              g.charted = true;
              skipToHoldCue(g);
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
                gRef.current = fresh(chartFor(v?.duration || film.chart, seed), seed, 0, ramp);
                gRef.current.charted = true;
                skipToHoldCue(gRef.current);
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

function Resonance({
  value,
  paused = false,
  peak = false,
  phase = "calm",
  drain = 0,
}: {
  value: number;
  paused?: boolean;
  peak?: boolean;
  phase?: PicturePhase;
  drain?: number;
}) {
  const m = Math.max(0, Math.min(1, value));
  const fill = resonanceFill(m);
  const tone = resonanceTone(m, phase, peak);
  return (
    <div
      className="resonance-chrome pointer-events-none"
      data-resonance="m"
      data-tone={tone}
      data-paused={paused ? "1" : undefined}
      data-drain={drain > 0 ? String(drain) : undefined}
      data-peak={peak ? "1" : undefined}
      aria-hidden
    >
      <div className="resonance-capsule">
        <div
          key={drain}
          className="resonance-fill"
          data-m={m}
          style={{ ["--resonance-fill" as string]: String(fill) }}
        />
      </div>
    </div>
  );
}

/** Narrow vertical tick on the turn lane / path side — never on the white GSD, never a Resonance HUD strip. */
function CueFill({ beat, t }: { beat?: Beat; t: number }) {
  if (!beat) return null;
  const side = cueFillSide(beat);
  if (!side) return null;
  if (!cueFillLive(beat, t)) return null;
  const until = beat.at - t;
  const fill = until >= 0 ? Math.max(0, Math.min(1, 1 - until / HOLD_CUE_APPROACH)) : 1;
  const live = Math.abs(t - beat.at) < beat.win * 0.55;
  const spot = cuePictureSpot(beat);
  return (
    <div
      className="pointer-events-none absolute z-30"
      data-cue-fill={side}
      data-cue-axis="y"
      aria-hidden
      style={{
        left: `${spot.x * 100}%`,
        top: `${spot.y * 100}%`,
        width: 6,
        height: 34,
        transform: "translate(-50%, -50%)",
      }}
    >
      <div className="absolute inset-0 overflow-hidden rounded-full bg-white/12">
        <div
          className="absolute bottom-0 left-0 right-0 rounded-full"
          style={{
            height: `${fill * 100}%`,
            background: live
              ? "linear-gradient(180deg, #f2fbff, #9ec9d4)"
              : "linear-gradient(180deg, #9ec9d4, #3d6a78)",
            boxShadow: live ? "0 0 7px rgba(158,201,212,0.35)" : "none",
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
