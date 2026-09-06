const KEY = "bolt-rune-brain-v1";
const DRIVE = "bolt-rune-drive";

export type Drive = "pilot" | "engine";

export type Grade = "good" | "stuck" | "camera" | "messy";

export type Gene = {
  cam: number;
  strides: number;
  morph: number;
  dest: number;
};

export type Brain = {
  gen: number;
  forged: number;
  retries: number;
  good: number;
  bad: number;
  stuck: number;
  camera: number;
  messy: number;
  gene: Gene;
  lessons: { kind: Grade | "player"; text: string; n: number }[];
  log: { grade: Grade; t: number }[];
};

const GENE: Gene = { cam: 1, strides: 8, morph: 1, dest: 1 };

const EMPTY: Brain = {
  gen: 0,
  forged: 0,
  retries: 0,
  good: 0,
  bad: 0,
  stuck: 0,
  camera: 0,
  messy: 0,
  gene: { ...GENE },
  lessons: [],
  log: [],
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function loadBrain(): Brain {
  try {
    if (typeof localStorage === "undefined") return { ...EMPTY, gene: { ...GENE }, lessons: [], log: [] };
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY, gene: { ...GENE }, lessons: [], log: [] };
    const b = JSON.parse(raw) as Brain;
    return {
      ...EMPTY,
      ...b,
      gene: { ...GENE, ...(b.gene ?? {}) },
      lessons: Array.isArray(b.lessons) ? b.lessons.slice(0, 16) : [],
      log: Array.isArray(b.log) ? b.log.slice(-40) : [],
    };
  } catch {
    return { ...EMPTY, gene: { ...GENE }, lessons: [], log: [] };
  }
}

export function saveBrain(b: Brain) {
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    /* */
  }
}

function evolve(g: Gene, grade: Grade): Gene {
  if (grade === "camera") return { ...g, cam: clamp(g.cam + 1, 1, 4) };
  if (grade === "stuck") return { ...g, strides: clamp(g.strides + 2, 6, 16), dest: clamp(g.dest + 1, 1, 3) };
  if (grade === "messy") return { ...g, morph: clamp(g.morph + 1, 1, 4) };
  if (grade === "good") {
    return {
      ...g,
      cam: clamp(g.cam - 0, 1, 4),
      strides: clamp(g.strides, 6, 16),
    };
  }
  return g;
}

export function genePrompt(g: Gene = loadBrain().gene): string {
  const cam =
    g.cam >= 3
      ? "TRIPOD WELDED. Pillars, door arches and floor vanishing point match the start image pixel-for-pixel. Zero camera move."
      : "LOCKED TRIPOD. Same framing as the start image. Architecture does not move.";
  const morph =
    g.morph >= 2
      ? "Same snow-white Swiss Shepherd, no cape, same doors, same stones. Zero morph. Never tan, beige, cream, ivory, grey, or saddle."
      : "Same snow-white Swiss Shepherd, no cape, same doors. No morph. Never tan.";
  const dest = g.dest > 1 ? "Last frame: he is already standing at the destination, not still walking." : "";
  return [cam, `The dog takes at least ${g.strides} full strides across the floor, facing the travel direction. NOSE points that way every walking frame. Never moonwalk. Paws plant — no foot-slide.`, morph, dest].filter(Boolean).join(" ");
}

export function loadDrive(): Drive {
  try {
    if (typeof localStorage === "undefined") return "engine";
    return localStorage.getItem(DRIVE) === "pilot" ? "pilot" : "engine";
  } catch {
    return "engine";
  }
}

export function saveDrive(d: Drive) {
  try {
    localStorage.setItem(DRIVE, d);
  } catch {
    /* */
  }
}

export function bump(kind: Grade | "retry" | "forge" | "gen" | "player-good" | "player-bad") {
  const b = loadBrain();
  if (kind === "retry") b.retries += 1;
  else if (kind === "forge") b.forged += 1;
  else if (kind === "gen") b.gen += 1;
  else if (kind === "player-good") b.good += 1;
  else if (kind === "player-bad") b.bad += 1;
  else b[kind] += 1;
  saveBrain(b);
  return b;
}

export function learn(kind: Grade | "player", text: string) {
  const b = loadBrain();
  const hit = b.lessons.find((l) => l.kind === kind && l.text === text);
  if (hit) hit.n += 1;
  else b.lessons.push({ kind, text, n: 1 });
  b.lessons.sort((a, c) => c.n - a.n);
  b.lessons = b.lessons.slice(0, 16);
  if (kind === "stuck") b.stuck += 1;
  else if (kind === "camera") b.camera += 1;
  else if (kind === "messy") b.messy += 1;
  else if (kind === "good") b.good += 1;
  saveBrain(b);
  return b;
}

export function digest(grade: Grade) {
  const b = loadBrain();
  b.gene = evolve(b.gene, grade);
  b.log = [...b.log, { grade, t: Date.now() }].slice(-40);
  if (grade === "stuck") b.stuck += 1;
  else if (grade === "camera") b.camera += 1;
  else if (grade === "messy") b.messy += 1;
  else b.good += 1;
  const text = retryLaw(grade);
  if (text) {
    const hit = b.lessons.find((l) => l.kind === grade && l.text === text);
    if (hit) hit.n += 1;
    else b.lessons.push({ kind: grade, text, n: 1 });
    b.lessons.sort((a, c) => c.n - a.n);
    b.lessons = b.lessons.slice(0, 16);
  }
  saveBrain(b);
  return b;
}

export function stillLaws(): string {
  const b = loadBrain();
  const bits = ["No walking. No strides. The dog stays on the same floor tiles. Feet glued. FULL snow-white coat — no tan, beige, cream, ivory, saddle, or mask."];
  if (b.camera >= 2) bits.push("Pillars, floor vanishing point and door arches match the start image pixel-for-pixel.");
  if (b.messy >= 2) bits.push("Do not morph the dog or the doors. Same snow-white Swiss Shepherd, no cape, no tan, same stone.");
  return bits.join(" ");
}

export function brainLaws(): string {
  const b = loadBrain();
  const bits = [genePrompt(b.gene)];
  if (b.camera >= 2) bits.push("Past shots drifted. Pillars, floor vanishing point and door arches must match the start image pixel-for-pixel.");
  if (b.stuck >= 2) bits.push("Past dogs froze in place. This dog MUST take many full strides and finish at the destination, not the start.");
  if (b.messy >= 2) bits.push("Do not morph the dog or the doors. Same snow-white Swiss Shepherd, no cape, no tan, same stone.");
  for (const l of b.lessons.slice(0, 4)) {
    if (l.n >= 2 && l.kind !== "good") bits.push(l.text);
  }
  return bits.join(" ");
}

export function retryLaw(grade: Grade): string {
  if (grade === "camera") return "REJECT any camera move. Architecture is welded. Only the dog translates inside the locked whole hall.";
  if (grade === "stuck") return "The dog MUST walk. At least eight planted strides. Face the travel direction. Never moonwalk. Last frame is a different place than frame one.";
  if (grade === "messy") return "No morph. Same snow-white dog, same doors, same hall. Only position changes. Never tan.";
  return "";
}

export function brainLine() {
  const b = loadBrain();
  const last = b.log[b.log.length - 1]?.grade;
  return `engine · gen ${b.gen} · cam×${b.gene.cam} · ${b.gene.strides} strides · ${b.forged} films${last ? ` · last ${last}` : ""}`;
}

function sample(src: string): Promise<Uint8ClampedArray | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const im = new Image();
    im.crossOrigin = "anonymous";
    let done = false;
    const finish = (v: Uint8ClampedArray | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    im.onload = () => {
      const c = document.createElement("canvas");
      c.width = 48;
      c.height = 80;
      const ctx = c.getContext("2d");
      if (!ctx) {
        finish(null);
        return;
      }
      try {
        ctx.drawImage(im, 0, 0, 48, 80);
        finish(ctx.getImageData(0, 0, 48, 80).data);
      } catch {
        finish(null);
      }
    };
    im.onerror = () => finish(null);
    im.src = src;
    window.setTimeout(() => finish(null), 1200);
  });
}

function mad(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  test: (x: number, y: number) => boolean,
): number {
  let s = 0;
  let n = 0;
  for (let y = 0; y < 80; y++) {
    for (let x = 0; x < 48; x++) {
      if (!test(x, y)) continue;
      const i = (y * 48 + x) * 4;
      const ga = (a[i]! + a[i + 1]! + a[i + 2]!) / 3;
      const gb = (b[i]! + b[i + 1]! + b[i + 2]!) / 3;
      s += Math.abs(ga - gb);
      n += 1;
    }
  }
  return n ? s / n : 0;
}

export async function gradeFrames(start: string, end: string): Promise<{ grade: Grade; wolf: number; cam: number }> {
  const a = await sample(start);
  const b = await sample(end);
  if (!a || !b) return { grade: "messy", wolf: 0, cam: 0 };
  const wolf = mad(a, b, (x, y) => y > 36 && x > 8 && x < 40);
  const cam = mad(a, b, (x, y) => y < 22 || x < 6 || x > 42);
  let grade: Grade = "good";
  if (cam > 26 && cam > wolf * 0.9) grade = "camera";
  else if (wolf < 7) grade = "stuck";
  else if (wolf > 40 && cam > 24) grade = "messy";
  else if (wolf >= 7 && cam < 26) grade = "good";
  else grade = "messy";
  return { grade, wolf, cam };
}
