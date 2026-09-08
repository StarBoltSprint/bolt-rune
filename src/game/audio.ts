import {
  applySmokeAudioGate,
  fireGradeAudio as fireGradeLaw,
  howlOnce as howlOnceLaw,
  isPictureMuted,
  mutePictureAudio,
  pictureAudioSnapshot,
  prefetchStockAudio as prefetchStockLaw,
  releasePictureAudio as releasePictureLaw,
  holdPictureAudio as holdPictureLaw,
  resetPictureAudio,
  syncPictureAudio as syncPictureLaw,
  toggleMutePictureAudio as toggleMuteLaw,
  type EngineShot,
  type PictureAudioClock,
} from "./pcg-audio.ts";
import type { HitClass } from "./pcg-play.ts";

export {
  applySmokeAudioGate,
  isPictureMuted,
  mutePictureAudio,
  pictureAudioSnapshot,
  resetPictureAudio,
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfx: GainNode | null = null;
let music: GainNode | null = null;
let plateGain: GainNode | null = null;
let engineGain: GainNode | null = null;
let caveGain: GainNode | null = null;
let caveOn = false;
let dripTimer = 0;
let crackleTimer = 0;
const caveStops: Array<() => void> = [];
let bedsHeld = false;
let weather: { filter: BiquadFilterNode; gain: GainNode } | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      try {
        ctx = new Ctor({ latencyHint: "interactive" });
      } catch {
        ctx = new Ctor();
      }
      master = ctx.createGain();
      plateGain = ctx.createGain();
      engineGain = ctx.createGain();
      sfx = ctx.createGain();
      music = ctx.createGain();
      master.gain.value = 0.7;
      plateGain.gain.value = 1;
      engineGain.gain.value = 1;
      sfx.gain.value = 0.85;
      music.gain.value = 0.55;
      plateGain.connect(master);
      engineGain.connect(master);
      sfx.connect(engineGain);
      music.connect(plateGain);
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  return ctx;
}

export function unlockAudio() {
  try {
    const c = ac();
    if (!c) return;
    if (c.state === "suspended") void c.resume();
  } catch {
    /* never block UI */
  }
}

function applyBusGains() {
  const c = ac();
  if (!c) return;
  const silent = isPictureMuted() || bedsHeld;
  const plate = silent ? 0 : 1;
  const engine = silent ? 0 : 1;
  if (plateGain) plateGain.gain.setTargetAtTime(plate, c.currentTime, 0.04);
  if (engineGain) engineGain.gain.setTargetAtTime(engine, c.currentTime, 0.04);
  if (master) master.gain.setTargetAtTime(isPictureMuted() ? 0 : 0.7, c.currentTime, 0.04);
  if (scoreEl) {
    scoreEl.muted = isPictureMuted();
    if (bedsHeld || isPictureMuted()) {
      try {
        scoreEl.pause();
      } catch {
        /* */
      }
    }
  }
}

export function setMuted(muted: boolean) {
  mutePictureAudio(muted);
  applyBusGains();
}

function tone(freq: number, dur: number, type: OscillatorType, gain = 0.16, dest?: GainNode) {
  const c = ac();
  if (!c || !sfx) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g);
  g.connect(dest ?? sfx);
  o.start();
  o.stop(c.currentTime + dur + 0.02);
}

function noiseBuf(c: AudioContext, seconds: number, brown = false) {
  const n = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + w * 0.02) * 0.986;
      d[i] = last * 4;
    } else {
      d[i] = w;
    }
  }
  return buf;
}

function whoosh(dur = 0.32, gain = 0.1) {
  const c = ac();
  if (!c || !sfx) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf(c, dur, true);
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.setValueAtTime(280, c.currentTime);
  f.frequency.exponentialRampToValueAtTime(980, c.currentTime + dur);
  f.Q.value = 1.6;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  src.connect(f);
  f.connect(g);
  g.connect(sfx);
  src.start();
}

export function sfxHit(kind: "perfect" | "great" | "good" | "miss" | "relic" | "rewind") {
  const mapped = kind === "miss" ? "miss" : kind === "good" ? "late" : kind === "rewind" ? null : "hit";
  if (mapped) {
    const before = pictureAudioSnapshot().engineEvents.length;
    const ev = fireGradeLaw(mapped);
    if (ev && pictureAudioSnapshot().engineEvents.length === before) return;
    if (ev?.audible) {
      try {
        unlockAudio();
        playEngineOsc(ev.shot);
      } catch {
        /* */
      }
      return;
    }
    if (isPictureMuted() || bedsHeld) return;
  }
  const c = ac();
  if (!c) return;
  const jitter = 0.96 + Math.random() * 0.08;
  if (kind === "perfect") {
    tone(880 * jitter, 0.12, "sine", 0.14);
    tone(1320 * jitter, 0.18, "triangle", 0.07);
  } else if (kind === "great") {
    tone(660 * jitter, 0.11, "sine", 0.12);
  } else if (kind === "good") {
    tone(494 * jitter, 0.1, "triangle", 0.1);
  } else if (kind === "miss") {
    tone(110 * jitter, 0.18, "sawtooth", 0.08);
  } else if (kind === "relic") {
    tone(988 * jitter, 0.22, "sine", 0.12);
    tone(1480 * jitter, 0.28, "triangle", 0.06);
  } else {
    tone(196, 0.28, "sine", 0.1);
    tone(147, 0.34, "triangle", 0.06);
  }
}

export function sfxForge(kind: "page" | "pick" | "enter" | "full" | "howl" | "cook") {
  unlockAudio();
  startBed();
  const jitter = 0.97 + Math.random() * 0.06;
  if (kind === "page") {
    whoosh(0.36, 0.11);
  } else if (kind === "pick") {
    tone(920 * jitter, 0.09, "sine", 0.07);
    tone(1380 * jitter, 0.14, "sine", 0.03);
  } else if (kind === "enter") {
    whoosh(0.4, 0.09);
    tone(310 * jitter, 0.32, "sine", 0.08);
    tone(620 * jitter, 0.4, "sine", 0.035);
  } else if (kind === "full") {
    whoosh(0.22, 0.06);
  } else if (kind === "howl") {
    whoosh(0.5, 0.1);
    tone(140 * jitter, 0.45, "sine", 0.05);
  } else {
    whoosh(0.28, 0.08);
    tone(180 * jitter, 0.2, "sine", 0.05);
  }
}

function loopNoise(c: AudioContext, dest: GainNode, opts: { brown?: boolean; type: BiquadFilterType; freq: number; q: number; gain: number }) {
  const src = c.createBufferSource();
  src.buffer = noiseBuf(c, 3.5, opts.brown);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = opts.type;
  f.frequency.value = opts.freq;
  f.Q.value = opts.q;
  const g = c.createGain();
  g.gain.value = opts.gain;
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start();
  caveStops.push(() => {
    try {
      src.stop();
    } catch {
      /* */
    }
  });
  return { filter: f, gain: g };
}

function drip() {
  if (bedsHeld || isPictureMuted()) return;
  const c = ac();
  if (!c || !caveGain) return;
  const f = 1400 + Math.random() * 900;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(f, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(f * 0.55, c.currentTime + 0.18);
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.045, c.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.22);
  o.connect(g);
  g.connect(caveGain);
  o.start();
  o.stop(c.currentTime + 0.24);
}

function crackle() {
  if (bedsHeld || isPictureMuted()) return;
  const c = ac();
  if (!c || !caveGain) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf(c, 0.08, false);
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 280 + Math.random() * 520;
  f.Q.value = 1.1;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.04, c.currentTime + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.09);
  src.connect(f);
  f.connect(g);
  g.connect(caveGain);
  src.start();
}

function armCave(c: AudioContext) {
  window.clearTimeout(dripTimer);
  window.clearTimeout(crackleTimer);
  const nextDrip = () => {
    drip();
    dripTimer = window.setTimeout(nextDrip, 2200 + Math.random() * 4200);
  };
  const nextCrack = () => {
    if (Math.random() > 0.35) crackle();
    crackleTimer = window.setTimeout(nextCrack, 180 + Math.random() * 520);
  };
  dripTimer = window.setTimeout(nextDrip, 800);
  crackleTimer = window.setTimeout(nextCrack, 400);
  const wind = loopNoise(c, caveGain!, { brown: true, type: "lowpass", freq: 340, q: 0.7, gain: 0.07 });
  const lfo = c.createOscillator();
  const lfoG = c.createGain();
  lfo.frequency.value = 0.07;
  lfoG.gain.value = 80;
  lfo.connect(lfoG);
  lfoG.connect(wind.filter.frequency);
  lfo.start();
  caveStops.push(() => {
    try {
      lfo.stop();
    } catch {
      /* */
    }
  });
}

export function startPad() {
  startBed();
}

export function startBed() {
  try {
    unlockAudio();
    const c = ac();
    if (!c || !music) return;
    if (bedsHeld) return;
    if (caveOn && caveGain) {
      caveGain.gain.setTargetAtTime(1, c.currentTime, 0.4);
      return;
    }
    caveOn = true;
    caveGain = c.createGain();
    caveGain.gain.value = 0.0001;
    caveGain.connect(music);
    const stone = c.createOscillator();
    const stoneG = c.createGain();
    stone.type = "sine";
    stone.frequency.value = 46;
    stoneG.gain.value = 0.045;
    stone.connect(stoneG);
    stoneG.connect(caveGain);
    stone.start();
    caveStops.push(() => {
      try {
        stone.stop();
      } catch {
        /* */
      }
    });
    loopNoise(c, caveGain, { brown: true, type: "lowpass", freq: 220, q: 0.6, gain: 0.09 });
    loopNoise(c, caveGain, { brown: false, type: "bandpass", freq: 2400, q: 0.8, gain: 0.012 });
    armCave(c);
    caveGain.gain.setTargetAtTime(1, c.currentTime, 0.8);
  } catch {
    /* never block UI */
  }
}

export function stopPad() {
  stopBed();
}

export function stopBed() {
  const c = ac();
  window.clearTimeout(dripTimer);
  window.clearTimeout(crackleTimer);
  if (c && caveGain) caveGain.gain.setTargetAtTime(0.0001, c.currentTime, 0.35);
}

let scoreEl: HTMLAudioElement | null = null;

export function startScore(src: string, at = 0) {
  try {
    if (bedsHeld || isPictureMuted()) return;
    unlockAudio();
    stopBed();
    if (!scoreEl) {
      scoreEl = new Audio();
      scoreEl.preload = "auto";
      scoreEl.loop = false;
    }
    if (scoreEl.src.indexOf(src) < 0) scoreEl.src = src;
    scoreEl.volume = 0.72;
    if (at > 0.05) {
      try {
        scoreEl.currentTime = at;
      } catch {
        /* */
      }
    }
    void scoreEl.play().catch(() => {});
  } catch {
    /* never block UI */
  }
}

export function stopScore() {
  if (!scoreEl) return;
  try {
    scoreEl.pause();
    scoreEl.currentTime = 0;
  } catch {
    /* */
  }
}

export function syncScore(t: number) {
  if (!scoreEl) return;
  try {
    if (bedsHeld || isPictureMuted()) {
      scoreEl.pause();
      return;
    }
    if (Math.abs(scoreEl.currentTime - t) > 0.4) scoreEl.currentTime = t;
    if (scoreEl.paused) void scoreEl.play().catch(() => {});
  } catch {
    /* */
  }
}

let living: "off" | "idle" | "walk" = "off";
let breathTimer = 0;
let stepTimer = 0;

function breathPulse(gain = 0.042) {
  const c = ac();
  if (!c || !sfx) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf(c, 1.8, true);
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(280, c.currentTime);
  f.frequency.exponentialRampToValueAtTime(520, c.currentTime + 0.55);
  f.frequency.exponentialRampToValueAtTime(240, c.currentTime + 1.45);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + 0.38);
  g.gain.exponentialRampToValueAtTime(gain * 0.45, c.currentTime + 0.85);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.65);
  src.connect(f);
  f.connect(g);
  g.connect(sfx);
  src.start();
}

function paw() {
  const c = ac();
  if (!c || !sfx) return;
  const j = 0.94 + Math.random() * 0.12;
  const o = c.createOscillator();
  const og = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(72 * j, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(48 * j, c.currentTime + 0.09);
  og.gain.setValueAtTime(0.0001, c.currentTime);
  og.gain.exponentialRampToValueAtTime(0.07, c.currentTime + 0.008);
  og.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.11);
  o.connect(og);
  og.connect(sfx);
  o.start();
  o.stop(c.currentTime + 0.13);
  const src = c.createBufferSource();
  src.buffer = noiseBuf(c, 0.09, true);
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 180 + Math.random() * 70;
  f.Q.value = 1.4;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.055, c.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.08);
  src.connect(f);
  f.connect(g);
  g.connect(sfx);
  src.start();
}

function hushLiving() {
  window.clearTimeout(breathTimer);
  window.clearTimeout(stepTimer);
  breathTimer = 0;
  stepTimer = 0;
}

function pulseBreath() {
  if (living === "off" || bedsHeld || isPictureMuted()) return;
  breathPulse(living === "walk" ? 0.018 : 0.046);
  breathTimer = window.setTimeout(pulseBreath, living === "walk" ? 1500 : 2100 + Math.random() * 400);
}

export function setLiving(kind: "off" | "idle" | "walk", walkSecs = 10) {
  try {
    unlockAudio();
    if (kind !== "off") startBed();
    hushLiving();
    living = kind;
    if (kind === "off") return;
    pulseBreath();
    if (kind !== "walk") return;
    const n = 8;
    const gap = Math.max(0.38, (Math.min(10, Math.max(6, walkSecs)) * 0.82) / n);
    let i = 0;
    const next = () => {
      if (living !== "walk" || bedsHeld || isPictureMuted()) return;
      paw();
      i += 1;
      if (i < n) stepTimer = window.setTimeout(next, gap * 1000 * (0.9 + Math.random() * 0.18));
    };
    stepTimer = window.setTimeout(next, 160);
  } catch {
    /* never block UI */
  }
}

function holdBeds(held: boolean) {
  bedsHeld = held;
  applyBusGains();
  if (held) {
    window.clearTimeout(dripTimer);
    window.clearTimeout(crackleTimer);
    dripTimer = 0;
    crackleTimer = 0;
    hushLiving();
    const c = ac();
    if (c && caveGain) caveGain.gain.setTargetAtTime(0.0001, c.currentTime, 0.05);
  } else if (caveOn && caveGain) {
    const c = ac();
    if (c) {
      caveGain.gain.setTargetAtTime(1, c.currentTime, 0.2);
      if (!dripTimer) armCave(c);
    }
    if (living !== "off") pulseBreath();
  }
}

function playEngineOsc(shot: EngineShot) {
  const c = ac();
  if (!c || !engineGain) return;
  if (shot === "hit") {
    tone(2100, 0.07, "sine", 0.12, engineGain);
    tone(3120, 0.09, "triangle", 0.04, engineGain);
    return;
  }
  if (shot === "late") {
    tone(1480, 0.08, "sine", 0.06, engineGain);
    return;
  }
  if (shot === "miss" || shot === "drain") {
    whoosh(0.22, 0.07);
    return;
  }
  if (shot === "howl") {
    whoosh(0.5, 0.1);
    tone(140, 0.45, "sine", 0.05, engineGain);
  }
}

function applyTrailVoice() {
  const c = ac();
  if (!c || !plateGain) return;
  const snap = pictureAudioSnapshot();
  if (!weather) {
    const wind = loopNoise(c, plateGain, { brown: true, type: "lowpass", freq: 280, q: 0.7, gain: 0.05 });
    weather = wind;
  }
  const freq = snap.trailVoice === "storm" ? 920 : snap.trailVoice === "light-crackle" ? 540 : snap.trailVoice === "decay-filter" ? 220 : 280;
  weather.filter.frequency.setTargetAtTime(freq, c.currentTime, snap.trailVoice === "decay-filter" ? 0.8 : 0.25);
  weather.gain.gain.setTargetAtTime(snap.plateOpen && !bedsHeld ? (snap.trailVoice === "storm" ? 0.09 : 0.05) : 0.0001, c.currentTime, 0.2);
}

export function syncPictureAudio(clock: PictureAudioClock) {
  const snap = syncPictureLaw(clock);
  holdBeds(snap.bedsFrozen);
  applyTrailVoice();
  return snap;
}

export function fireGradeAudio(hit: HitClass | EngineShot, playhead?: number) {
  const ev = fireGradeLaw(hit, playhead);
  if (ev?.audible) {
    try {
      unlockAudio();
      playEngineOsc(ev.shot);
    } catch {
      /* never block UI */
    }
  }
  return ev;
}

export function howlOnce(playhead?: number) {
  const ev = howlOnceLaw(playhead);
  if (ev?.audible) {
    try {
      unlockAudio();
      playEngineOsc("howl");
    } catch {
      /* */
    }
  }
  return ev;
}

export function holdPictureAudio() {
  holdPictureLaw();
  holdBeds(true);
}

export function releasePictureAudio() {
  releasePictureLaw();
  holdBeds(false);
}

export function toggleMutePictureAudio() {
  const muted = toggleMuteLaw();
  applyBusGains();
  return muted;
}

export function prefetchStockAudio(url?: string | null) {
  const got = prefetchStockLaw(url);
  if (!got.decode || !url || typeof window === "undefined") return got;
  try {
    const c = ac();
    if (!c) return got;
    void fetch(url, { credentials: "same-origin", cache: "force-cache" })
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((buf) => (buf && c ? c.decodeAudioData(buf.slice(0)) : null))
      .catch(() => null);
  } catch {
    /* decode is best-effort; never Imagine */
  }
  return got;
}

export function sfxHitPicture(kind: "perfect" | "great" | "good" | "miss" | "relic" | "rewind") {
  if (kind === "miss") return fireGradeAudio("miss");
  if (kind === "good") return fireGradeAudio("late");
  if (kind === "rewind") return sfxHit(kind);
  return fireGradeAudio("hit");
}

