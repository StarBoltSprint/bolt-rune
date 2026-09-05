let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfx: GainNode | null = null;
let music: GainNode | null = null;
let caveGain: GainNode | null = null;
let caveOn = false;
let dripTimer = 0;
let crackleTimer = 0;
const caveStops: Array<() => void> = [];

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
      sfx = ctx.createGain();
      music = ctx.createGain();
      master.gain.value = 0.7;
      sfx.gain.value = 0.85;
      music.gain.value = 0.55;
      sfx.connect(master);
      music.connect(master);
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

export function setMuted(muted: boolean) {
  const c = ac();
  if (!c || !master) return;
  master.gain.setTargetAtTime(muted ? 0 : 0.7, c.currentTime, 0.04);
  if (scoreEl) scoreEl.muted = muted;
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
    if (Math.abs(scoreEl.currentTime - t) > 0.4) scoreEl.currentTime = t;
    if (scoreEl.paused) void scoreEl.play().catch(() => {});
  } catch {
    /* */
  }
}
