import { buildCanyonChart } from "./canyon";

export type Lane = "l" | "c" | "r";
export type BeatKind = "tap" | "hold" | "mash" | "swipe" | "relic" | "pick" | "left" | "right";
export type FilmId = "den" | "kiln" | "dive" | "hall" | "sprint" | "lane" | "asteroid";
export type Spot = { x: number; y: number };
export type CanyonMeta = { side: number; lift: number; roll: number };

export type Beat = {
  id: string;
  at: number;
  win: number;
  kind: BeatKind;
  lane: Lane;
  need: number;
  holdMs: number;
  label: string;
  relic?: Spot;
  spot?: Spot;
  canyon?: CanyonMeta;
  optional?: boolean;
};

export type Film = {
  id: FilmId;
  name: string;
  keeper: string;
  line: string;
  verb: string;
  still: string;
  portraitStill: string;
  local: string;
  portrait: string;
  origin: string;
  chart: number;
  beats: Beat[];
  hazards?: boolean;
  takes?: {
    hurt: string;
    hurtPortrait: string;
    endS: string;
    endSPortrait: string;
    endF: string;
    endFPortrait: string;
  };
  plates?: {
    river: string;
    riverPortrait: string;
    thicket: string;
    thicketPortrait: string;
    dusk: string;
    duskPortrait: string;
    howl: string;
    howlPortrait: string;
    hunter: string;
    hunterPortrait: string;
  };
  pad?: "arrows";
  lives?: number;
  score?: string;
  playlist?: string[];
};

const GH =
  "https://cdn.jsdelivr.net/gh/StarBoltSprint/Boltverse-odyssey@main/public/citadel";

export function b(
  id: string,
  at: number,
  kind: BeatKind,
  lane: Lane,
  label: string,
  extra: Partial<Beat> = {},
): Beat {
  const win =
    kind === "mash" ? 1.45 : kind === "hold" || kind === "pick" ? 1.55 : kind === "relic" ? 1.5 : kind === "swipe" ? 0.95 : kind === "left" || kind === "right" ? 0.72 : 0.78;
  return {
    id,
    at,
    win,
    kind,
    lane,
    need: kind === "mash" ? 4 : 1,
    holdMs: kind === "hold" || kind === "pick" ? 560 : 0,
    label,
    ...extra,
  };
}

export const FILMS: Film[] = [
  {
    id: "den",
    name: "Walker Den",
    keeper: "Rhoa",
    line: "Where your howl sleeps",
    verb: "Rest",
    still: "/films/den.jpg",
    portraitStill: "/films/den-p.jpg",
    local: "/films/den.mp4",
    portrait: "/films/den-p.mp4",
    origin: `${GH}/den-walker.mp4`,
    chart: 10,
    beats: [
      b("d1", 1.15, "tap", "l", "TAP"),
      b("d2", 2.25, "tap", "r", "TAP"),
      b("d3", 3.5, "hold", "c", "BREATHE"),
      b("d4", 5.05, "relic", "c", "HOWL", { relic: { x: 0.44, y: 0.5 } }),
      b("d5", 6.2, "tap", "c", "TAP"),
      b("d6", 7.35, "hold", "c", "REST"),
      b("d7", 8.55, "mash", "c", "WAKE", { need: 5 }),
      b("d8", 9.45, "relic", "c", "SHARD", { relic: { x: 0.62, y: 0.36 } }),
    ],
  },
  {
    id: "kiln",
    name: "Howlwright Kiln",
    keeper: "Orren",
    line: "Where makers keep the fire",
    verb: "Forge",
    still: "/films/kiln.jpg",
    portraitStill: "/films/kiln-p.jpg",
    local: "/films/kiln.mp4",
    portrait: "/films/kiln-p.mp4",
    origin: `${GH}/kiln-new.mp4`,
    chart: 10,
    beats: [
      b("k1", 0.95, "tap", "l", "STRIKE"),
      b("k2", 1.85, "tap", "r", "STRIKE"),
      b("k3", 2.85, "mash", "c", "HEAT", { need: 5 }),
      b("k4", 4.2, "hold", "c", "QUENCH"),
      b("k5", 5.4, "tap", "l", "STRIKE"),
      b("k6", 6.25, "tap", "r", "STRIKE"),
      b("k7", 7.2, "relic", "c", "RELIC", { relic: { x: 0.5, y: 0.44 } }),
      b("k8", 8.25, "mash", "c", "FORGE", { need: 6 }),
      b("k9", 9.35, "hold", "c", "SEAL"),
    ],
  },
  {
    id: "dive",
    name: "Sight Dive",
    keeper: "Tal",
    line: "One minute through the living canyon",
    verb: "Plunge",
    still: "/films/dive.jpg",
    portraitStill: "/films/dive-p.jpg",
    local: "/films/dive.mp4",
    portrait: "/films/dive-p.mp4",
    origin: `${GH}/landrun-sight-dive.mp4`,
    chart: 59,
    hazards: true,
    beats: [
      b("v1", 0.95, "swipe", "l", "DODGE"),
      b("v2", 2.05, "swipe", "r", "DODGE"),
      b("v3", 3.15, "tap", "c", "TAP"),
      b("v4", 4.25, "mash", "c", "MASH", { need: 4 }),
      b("v5", 5.5, "swipe", "l", "DODGE"),
      b("v6", 6.6, "hold", "c", "HOLD"),
      b("v7", 7.7, "swipe", "r", "DODGE"),
      b("v8", 8.7, "relic", "c", "SIGHT", { relic: { x: 0.48, y: 0.52 } }),
      b("v9", 9.45, "tap", "c", "FIRE"),
    ],
  },
  {
    id: "hall",
    name: "Star Hall",
    keeper: "Iri",
    line: "Harvest light from the nave",
    verb: "Keep",
    still: "/films/hall.jpg",
    portraitStill: "/films/hall-p.jpg",
    local: "/films/hall.mp4",
    portrait: "/films/hall-p.mp4",
    origin: `${GH}/hall.mp4`,
    chart: 10,
    beats: [
      b("h1", 1.05, "relic", "c", "STAR", { relic: { x: 0.28, y: 0.42 } }),
      b("h2", 2.15, "relic", "c", "STAR", { relic: { x: 0.72, y: 0.36 } }),
      b("h3", 3.3, "tap", "c", "BIND"),
      b("h4", 4.4, "relic", "c", "STAR", { relic: { x: 0.5, y: 0.28 } }),
      b("h5", 5.5, "relic", "c", "STAR", { relic: { x: 0.22, y: 0.62 } }),
      b("h6", 6.55, "hold", "c", "KEEP"),
      b("h7", 7.6, "relic", "c", "STAR", { relic: { x: 0.78, y: 0.55 } }),
      b("h8", 8.55, "mash", "c", "HOWL", { need: 4 }),
      b("h9", 9.4, "relic", "c", "CORE", { relic: { x: 0.5, y: 0.48 } }),
    ],
  },
  {
    id: "sprint",
    name: "Forest Sprint",
    keeper: "StarBoltSprint",
    line: "The run is the story",
    verb: "Sprint",
    still: "/films/sprint.jpg",
    portraitStill: "/films/sprint-p.jpg",
    local: "/films/sprint.mp4",
    portrait: "/films/sprint-p.mp4",
    origin: "/films/sprint.mp4",
    chart: 54,
    takes: {
      hurt: "/films/sprint-hurt.mp4",
      hurtPortrait: "/films/sprint-hurt-p.mp4",
      endS: "/films/sprint-end-s.mp4",
      endSPortrait: "/films/sprint-end-s-p.mp4",
      endF: "/films/sprint-end-f.mp4",
      endFPortrait: "/films/sprint-end-f-p.mp4",
    },
    plates: {
      river: "/films/sprint-river.mp4",
      riverPortrait: "/films/sprint-river-p.mp4",
      thicket: "/films/sprint-thicket.mp4",
      thicketPortrait: "/films/sprint-thicket-p.mp4",
      dusk: "/films/sprint-dusk.mp4",
      duskPortrait: "/films/sprint-dusk-p.mp4",
      howl: "/films/sprint-howl.mp4",
      howlPortrait: "/films/sprint-howl-p.mp4",
      hunter: "/films/hunter.mp4",
      hunterPortrait: "/films/hunter-p.mp4",
    },
    beats: [
      b("s1", 2.45, "tap", "c", "TAP", { spot: { x: 0.5, y: 0.55 } }),
      b("s2", 4.5, "tap", "c", "VAULT", { spot: { x: 0.5, y: 0.58 } }),
      b("s3", 7.2, "swipe", "l", "DODGE", { spot: { x: 0.22, y: 0.38 } }),
      b("s4", 11.5, "tap", "c", "TAP", { spot: { x: 0.5, y: 0.52 } }),
      b("sFork", 13.15, "pick", "c", "PATH", { optional: true, holdMs: 320, spot: { x: 0.5, y: 0.55 } }),
      b("s5", 16.5, "hold", "c", "SLIDE", { spot: { x: 0.5, y: 0.58 } }),
      b("s6", 20.2, "tap", "c", "TAP", { spot: { x: 0.48, y: 0.55 } }),
      b("s7", 23.8, "swipe", "r", "DODGE", { spot: { x: 0.78, y: 0.32 } }),
      b("s8", 27.5, "tap", "c", "TAP", { spot: { x: 0.42, y: 0.52 } }),
      b("s9", 31.2, "relic", "c", "LIGHT", { relic: { x: 0.68, y: 0.46 }, spot: { x: 0.68, y: 0.46 }, optional: true }),
      b("s10", 35.0, "hold", "c", "HOLD", { spot: { x: 0.48, y: 0.55 } }),
      b("s11", 38.8, "mash", "c", "BREAK", { need: 4, spot: { x: 0.5, y: 0.52 } }),
      b("sHowl", 47.2, "hold", "c", "HOWL", { holdMs: 640, spot: { x: 0.5, y: 0.48 } }),
      b("s13", 52.4, "tap", "c", "FIRE", { spot: { x: 0.5, y: 0.52 } }),
    ],
  },
  {
    id: "lane",
    name: "Forest Lane",
    keeper: "StarBoltSprint",
    line: "One miss. The line is dead.",
    verb: "Cut",
    still: "/films/lane.jpg",
    portraitStill: "/films/lane-p.jpg",
    local: "/films/lane.mp4?v=6",
    portrait: "/films/lane-p.mp4?v=6",
    origin: "/films/lane.mp4?v=6",
    score: "/films/lane-score.m4a",
    chart: 56,
    pad: "arrows",
    lives: 1,
    beats: [
      b("l1", 3.2, "right", "r", "→"),
      b("l2", 6.8, "left", "l", "←"),
      b("l3", 12.8, "right", "r", "→"),
      b("l4", 16.4, "left", "l", "←"),
      b("l5", 22.4, "right", "r", "→"),
      b("l6", 26.0, "left", "l", "←"),
      b("l7", 32.0, "right", "r", "→"),
      b("l8", 35.6, "left", "l", "←"),
      b("l9", 41.6, "right", "r", "→"),
      b("l10", 45.2, "left", "l", "←"),
      b("l11", 51.2, "right", "r", "→"),
      b("l12", 54.8, "left", "l", "←"),
    ],
  },
  {
    id: "asteroid",
    name: "Asteroid Sprint",
    keeper: "StarBoltSprint",
    line: "The void lights because you run.",
    verb: "Sprint",
    still: "/films/asteroid.jpg",
    portraitStill: "/films/asteroid-p.jpg",
    local: "/films/asteroid.mp4",
    portrait: "/films/asteroid-p.mp4",
    origin: "/films/asteroid.mp4",
    score: "/films/asteroid-score.m4a",
    chart: 56,
    pad: "arrows",
    lives: 1,
    beats: [
      b("a1", 7.0, "right", "r", "→"),
      b("a2", 12.3, "left", "l", "←"),
      b("a3", 16.3, "right", "r", "→"),
      b("a4", 21.6, "left", "l", "←"),
      b("a5", 25.6, "right", "r", "→"),
      b("a6", 30.9, "left", "l", "←"),
      b("a7", 34.9, "right", "r", "→"),
      b("a8", 40.2, "right", "r", "→"),
      b("a9", 44.2, "left", "l", "←"),
      b("a10", 49.5, "right", "r", "→"),
      b("a11", 53.5, "left", "l", "←"),
    ],
  },
];

export const FILM_BY_ID = Object.fromEntries(FILMS.map((f) => [f.id, f])) as Record<
  FilmId,
  Film
>;

export type Grade = "S" | "A" | "B" | "C" | "D" | "F";

export function gradeOf(perfect: number, great: number, good: number, miss: number, total: number): Grade {
  if (total <= 0) return "F";
  const acc = (perfect + great * 0.85 + good * 0.6) / total;
  if (miss === 0 && acc >= 0.94) return "S";
  if (acc >= 0.84) return "A";
  if (acc >= 0.7) return "B";
  if (acc >= 0.52) return "C";
  if (acc >= 0.32) return "D";
  return "F";
}

export function shardsOf(perfect: number, great: number, good: number, relics: number, grade: Grade) {
  const base = perfect * 3 + great * 2 + good + relics * 4;
  const bonus = grade === "S" ? 20 : grade === "A" ? 10 : grade === "B" ? 4 : 0;
  return base + bonus;
}

export function snapSecs(duration: number): 6 | 10 | 15 {
  if (duration <= 7.5) return 6;
  if (duration <= 12.5) return 10;
  return 15;
}

/** The only turns in a cooked clip. Prompt + beat chart share this sheet. */
export function turnMarks(secs: number): { at: number; dir: "left" | "right" }[] {
  if (secs <= 6) {
    return [
      { at: 2.2, dir: "left" },
      { at: 4.4, dir: "right" },
    ];
  }
  if (secs <= 10) {
    return [
      { at: 2.4, dir: "left" },
      { at: 5.6, dir: "right" },
      { at: 8.3, dir: "left" },
    ];
  }
  return [
    { at: 2.5, dir: "left" },
    { at: 5.8, dir: "right" },
    { at: 9.2, dir: "left" },
    { at: 12.5, dir: "right" },
  ];
}

export function turnCue(secs: number, tailStraight = 0) {
  const marks = turnMarks(secs).filter((m) => m.at < secs - tailStraight);
  const hits = marks.map(
    (m) =>
      `${m.at.toFixed(1)}s he commits ${m.dir.toUpperCase()} into a brand-new aisle — old path leaves the shot and NEVER returns`,
  );
  const tail =
    tailStraight > 0
      ? ` Last ${tailStraight.toFixed(1)}s: NO TURNS. Straight sprint, dead-center behind him, last frame is his back running forward.`
      : "";
  return `TURN SHEET (only these): ${hits.join(". ")}. Camera stays dead-center behind him. Between turns he sprints STRAIGHT down the NEW aisle. No extra turns. No U-turns. No looping.${tail}`;
}

/** Mid-plate vault — one short in-picture vertical tick, not a HUD bar. */
export function jumpMarks(secs: number): number[] {
  if (secs <= 6) return [3.3];
  if (secs <= 10) return [4.0];
  return [7.6];
}

export function turnBeatsForRun(plateDurations: number[]): Beat[] {
  let acc = 0;
  const out: Beat[] = [];
  let n = 1;
  for (const raw of plateDurations) {
    const d = raw > 1 ? raw : 10;
    const secs = snapSecs(d);
    for (const m of turnMarks(secs)) {
      if (m.at >= d - 0.55) continue;
      const lane: Lane = m.dir === "left" ? "l" : "r";
      const x = m.dir === "left" ? 0.2 : 0.8;
      const y = 0.56 + ((n % 2) * 0.05);
      out.push(
        b(`t${n}`, Number((acc + m.at).toFixed(2)), m.dir, lane, m.dir === "left" ? "←" : "→", {
          win: 1.32,
          spot: { x, y },
        }),
      );
      n += 1;
    }
    for (const at of jumpMarks(secs)) {
      if (at >= d - 0.55) continue;
      out.push(
        b(`j${n}`, Number((acc + at).toFixed(2)), "tap", "c", "↑", {
          win: 1.2,
          spot: { x: 0.5, y: 0.58 },
        }),
      );
      n += 1;
    }
    acc += d;
  }
  return out.sort((p, q) => p.at - q.at);
}

export function scaleBeats(film: Film, duration: number): Beat[] {
  const s = duration > 0.8 ? duration / film.chart : 1;
  return film.beats.map((beat) => ({
    ...beat,
    at: beat.at * s,
    win: Math.min(Math.max(beat.win * Math.min(s, 1.35), 0.55), 2.1),
    holdMs: beat.holdMs ? Math.round(beat.holdMs * Math.min(Math.max(s, 0.75), 1.4)) : 0,
  }));
}

export function prepareBeats(film: Film, duration: number, seed: number, original = false): Beat[] {
  if (film.hazards && !original) {
    return buildCanyonChart(duration > 12 ? duration : film.chart, seed);
  }
  if (film.beats?.length) {
    return placeSpots(scaleBeats(film, duration), seed);
  }
  if (film.playlist?.length && !original) {
    const n = Math.max(1, film.playlist.length);
    const plate = duration > 1 && duration <= 16 ? duration : 15;
    return placeSpots(turnBeatsForRun(Array.from({ length: n }, () => plate)), seed);
  }
  return placeSpots(scaleBeats(film, duration), seed);
}

function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function spotOf(beat: Beat): Spot {
  return beat.spot ?? beat.relic ?? { x: 0.5, y: 0.5 };
}

export function cueSide(beat: Beat): "left" | "right" | "center" {
  if (beat.kind === "left") return "left";
  if (beat.kind === "right") return "right";
  if (beat.kind === "tap" && beat.lane === "c") return "center";
  if (/jump|vault|↑/i.test(beat.label)) return "center";
  if (beat.lane === "l") return "left";
  if (beat.lane === "r") return "right";
  return "center";
}

/** Picture-space tick at the turn lane / vault — never the Resonance HUD row. */
export function cuePictureSpot(beat: Beat): Spot {
  const side = cueSide(beat);
  const spot = spotOf(beat);
  const y = Math.min(0.66, Math.max(0.44, spot.y > 0.7 ? 0.58 : spot.y));
  if (side === "left") return { x: Math.min(spot.x, 0.26), y };
  if (side === "right") return { x: Math.max(spot.x, 0.74), y };
  return { x: 0.5, y };
}

/** Scatter hit marks across the picture. Relics keep authored positions. */
export function placeSpots(beats: Beat[], seed: number): Beat[] {
  const rand = mulberry32(seed || 1);
  const used: Spot[] = [];
  return beats.map((beat) => {
    if (beat.spot || beat.relic) {
      const spot = beat.spot ?? beat.relic!;
      used.push(spot);
      return { ...beat, spot };
    }
    let x = 0.5;
    let y = 0.5;
    for (let n = 0; n < 16; n++) {
      if (beat.kind === "swipe") {
        x = beat.lane === "l" ? 0.18 + rand() * 0.3 : 0.52 + rand() * 0.3;
        y = used.length % 2 === 0 ? 0.3 + rand() * 0.22 : 0.54 + rand() * 0.2;
      } else if (beat.kind === "left" || beat.lane === "l") {
        x = 0.18 + rand() * 0.08;
        y = 0.5 + rand() * 0.12;
      } else if (beat.kind === "right" || beat.lane === "r") {
        x = 0.74 + rand() * 0.08;
        y = 0.5 + rand() * 0.12;
      } else {
        x = 0.16 + rand() * 0.68;
        y = 0.26 + rand() * 0.52;
      }
      if (!used.some((u) => (u.x - x) ** 2 + (u.y - y) ** 2 < 0.05)) break;
    }
    const spot = { x, y };
    used.push(spot);
    if (used.length > 4) used.shift();
    return { ...beat, spot };
  });
}
