/**
 * SmiR cheap still-pair matcher — ingest only (Hang / cook / library accept).
 * SmiR still-pair: match rig + back-silhouette, not skeletal dog.
 *
 * Compares stillEnd(A) vs stillStart(B). Not artwork identity. No skeletal dog,
 * T-pose, SMPL, optical-flow-as-turn, face landmarks, or auto-flip profile→back.
 * Play must not call this per frame.
 */

/** Local copies — do not import smoke-gate (ingest cycle). */
const VOID_LUMA = 0.04;
const RIG_JUMP = 0.05;

/** SmiR one-liner. Tests lock this line. */
export const SMIR_STILL_PAIR_MATCH = [
  "SmiR still-pair: match rig + back-silhouette, not skeletal dog.",
] as const;

/** Optional CLIP back-vs-profile. Off by default — no ML dep. */
export const STILL_PAIR_CLIP = false;

export const HALL_FRAC = 0.55;
export const DOG_BAND_Y0 = 0.62;
export const TAILLE_DELTA = 0.08;
export const TAILLE_DELTA_WALK = 0.12;
export const YAW_DELTA_DEG = 25;
export const YAW_PROFILE_DEG = 50;
export const PLACE_DELTA = 0.08;
export const PLACE_DELTA_WALK = 0.16;
export const PLACE_DELTA_ENTER = 0.22;
export const HALL_SSIM_HIGH = 0.7;
export const HALL_SSIM_MED = 0.5;
export const NCC_LOCK = 0.38;
export const NCC_SIDE = 0.22;

export type EdgeKind = "breath" | "breath-walk" | "walk-breath" | "enter" | "decay";

export type PixelBuf = {
  width: number;
  height: number;
  data: ArrayLike<number>;
};

export type CanvasLike = {
  width: number;
  height: number;
  getContext?: (id: "2d") => { getImageData: (x: number, y: number, w: number, h: number) => PixelBuf } | null;
};

export type StillSource = PixelBuf | CanvasLike;

/** Optional Forge marks — skip ROI survey when both sides provide them. */
export type ForgeMarks = {
  doorGapX?: number;
  doorWidth?: number;
  pawsY?: number;
  withersY?: number;
  bodyWidth?: number;
  boltCenterX?: number;
};

export type ClipBackHook = (a: StillSource, b: StillSource) => "back" | "profile" | null;

export type MatchPoseOpts = {
  marksA?: ForgeMarks;
  marksB?: ForgeMarks;
  /** Only consulted when survey + mask + NCC disagree. Ignored unless STILL_PAIR_CLIP. */
  clip?: ClipBackHook;
};

export type PoseMeasures = {
  hallSsim: number;
  hallL2: number;
  tailleA: number;
  tailleB: number;
  dTaille: number;
  yawA: number;
  yawB: number;
  dYaw: number;
  placeA: number;
  placeB: number;
  dPlace: number;
  nccPeak: number;
  nccX: number;
  rigL1: number;
  withersLuma: number;
  withersSat: number;
  backA: boolean;
  backB: boolean;
  dogA: boolean;
  dogB: boolean;
};

export type MatchPoseOut = {
  ok: boolean;
  why: string[];
  measures?: PoseMeasures;
};

export type StillPairPixels = {
  a: StillSource;
  b: StillSource;
  edge?: EdgeKind;
  marksA?: ForgeMarks;
  marksB?: ForgeMarks;
};

export type EdgeTol = {
  hallSsim: number;
  taille: number;
  yaw: number;
  place: number;
  skipHall: boolean;
  skipRig: boolean;
};

const WORK_W = 72;
const WORK_H = 128;

type Work = {
  w: number;
  h: number;
  rgba: Uint8ClampedArray;
  gray: Float64Array;
};

function num(n: number | null | undefined) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

export function edgeKindOf(act?: string | null, from?: string | null): EdgeKind {
  const a = String(act || "").trim().toLowerCase();
  const f = String(from || "").trim().toLowerCase();
  if (a === "enter") return "enter";
  if (a === "decay") return "decay";
  if (a === "walk-breath") return "walk-breath";
  if (a === "breath-walk") return "breath-walk";
  if (a === "walk" && (f === "breath" || f === "spawn" || !f)) return "walk-breath";
  if (a === "breath" && f === "walk") return "walk-breath";
  if (a === "walk") return "breath-walk";
  return "breath";
}

export function edgeTol(edge: EdgeKind): EdgeTol {
  if (edge === "enter") {
    return { hallSsim: 0, taille: TAILLE_DELTA_WALK, yaw: YAW_DELTA_DEG, place: PLACE_DELTA_ENTER, skipHall: true, skipRig: true };
  }
  if (edge === "walk-breath") {
    return { hallSsim: HALL_SSIM_HIGH, taille: TAILLE_DELTA_WALK, yaw: YAW_DELTA_DEG, place: PLACE_DELTA_WALK, skipHall: false, skipRig: false };
  }
  if (edge === "decay") {
    return { hallSsim: HALL_SSIM_MED, taille: TAILLE_DELTA, yaw: YAW_DELTA_DEG, place: PLACE_DELTA, skipHall: false, skipRig: false };
  }
  return { hallSsim: HALL_SSIM_HIGH, taille: TAILLE_DELTA, yaw: YAW_DELTA_DEG, place: PLACE_DELTA, skipHall: false, skipRig: false };
}

export function stillPairOrUndef(
  a?: StillSource | null,
  b?: StillSource | null,
  edge?: EdgeKind,
): StillPairPixels | undefined {
  if (!a || !b) return undefined;
  return { a, b, edge };
}

function isPixelBuf(src: StillSource): src is PixelBuf {
  return Boolean(src && "data" in src && (src as PixelBuf).data && num((src as PixelBuf).width) > 0);
}

export function asPixels(src: StillSource): PixelBuf | null {
  if (!src) return null;
  if (isPixelBuf(src)) {
    const w = Math.max(0, Math.floor(num(src.width)));
    const h = Math.max(0, Math.floor(num(src.height)));
    if (!w || !h) return { width: 0, height: 0, data: new Uint8ClampedArray(0) };
    const data = src.data instanceof Uint8ClampedArray ? src.data : new Uint8ClampedArray(src.data as ArrayLike<number>);
    return { width: w, height: h, data };
  }
  const w = Math.max(0, Math.floor(num((src as CanvasLike).width)));
  const h = Math.max(0, Math.floor(num((src as CanvasLike).height)));
  if (!w || !h) return { width: 0, height: 0, data: new Uint8ClampedArray(0) };
  try {
    const ctx = (src as CanvasLike).getContext?.("2d");
    if (!ctx) return null;
    const im = ctx.getImageData(0, 0, w, h);
    const data = im.data instanceof Uint8ClampedArray ? im.data : new Uint8ClampedArray(im.data as ArrayLike<number>);
    return { width: w, height: h, data };
  } catch {
    return null;
  }
}

function luma01(r: number, g: number, b: number) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function sat01(r: number, g: number, b: number) {
  const mx = Math.max(r, g, b) / 255;
  const mn = Math.min(r, g, b) / 255;
  return mx <= 1e-6 ? 0 : (mx - mn) / mx;
}

function hueDeg(r: number, g: number, b: number) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const mx = Math.max(rr, gg, bb);
  const mn = Math.min(rr, gg, bb);
  const d = mx - mn;
  if (d <= 1e-6) return 0;
  let h = 0;
  if (mx === rr) h = ((gg - bb) / d) % 6;
  else if (mx === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
}

function meanLuma(px: PixelBuf) {
  const { width: w, height: h, data } = px;
  if (!w || !h || !data.length) return 0;
  let s = 0;
  const n = w * h;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    s += luma01(data[o] || 0, data[o + 1] || 0, data[o + 2] || 0);
  }
  return s / n;
}

function downscale(src: PixelBuf, w: number, h: number): Work {
  const rgba = new Uint8ClampedArray(w * h * 4);
  const gray = new Float64Array(w * h);
  const sw = Math.max(1, src.width);
  const sh = Math.max(1, src.height);
  const sd = src.data;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * sh) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * sw) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let yy = y0; yy < y1 && yy < sh; yy++) {
        for (let xx = x0; xx < x1 && xx < sw; xx++) {
          const o = (yy * sw + xx) * 4;
          r += sd[o] || 0;
          g += sd[o + 1] || 0;
          b += sd[o + 2] || 0;
          a += sd[o + 3] || 0;
          n++;
        }
      }
      const i = (y * w + x) * 4;
      if (n) {
        rgba[i] = r / n;
        rgba[i + 1] = g / n;
        rgba[i + 2] = b / n;
        rgba[i + 3] = a / n;
      }
      gray[y * w + x] = luma01(rgba[i] || 0, rgba[i + 1] || 0, rgba[i + 2] || 0);
    }
  }
  return { w, h, rgba, gray };
}

function blur3(gray: Float64Array, w: number, h: number): Float64Array {
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          s += gray[yy * w + xx] || 0;
          n++;
        }
      }
      out[y * w + x] = n ? s / n : 0;
    }
  }
  return out;
}

function cropGray(gray: Float64Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number): { g: Float64Array; w: number; h: number } {
  const ww = Math.max(1, x1 - x0);
  const hh = Math.max(1, y1 - y0);
  const g = new Float64Array(ww * hh);
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < ww; x++) {
      g[y * ww + x] = gray[(y0 + y) * w + (x0 + x)] || 0;
    }
  }
  return { g, w: ww, h: hh };
}

function resizeGray(src: Float64Array, sw: number, sh: number, w: number, h: number): Float64Array {
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * sh) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * sw) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / w));
      let s = 0;
      let n = 0;
      for (let yy = y0; yy < y1 && yy < sh; yy++) {
        for (let xx = x0; xx < x1 && xx < sw; xx++) {
          s += src[yy * sw + xx] || 0;
          n++;
        }
      }
      out[y * w + x] = n ? s / n : 0;
    }
  }
  return out;
}

function ssimGray(a: Float64Array, b: Float64Array): number {
  const n = Math.min(a.length, b.length);
  if (n < 4) return 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += a[i] || 0;
    my += b[i] || 0;
  }
  mx /= n;
  my /= n;
  let vx = 0;
  let vy = 0;
  let cxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (a[i] || 0) - mx;
    const dy = (b[i] || 0) - my;
    vx += dx * dx;
    vy += dy * dy;
    cxy += dx * dy;
  }
  vx /= n;
  vy /= n;
  cxy /= n;
  const c1 = 0.01 * 0.01;
  const c2 = 0.03 * 0.03;
  return ((2 * mx * my + c1) * (2 * cxy + c2)) / ((mx * mx + my * my + c1) * (vx + vy + c2) + 1e-12);
}

function l2Gray(a: Float64Array, b: Float64Array): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 1;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    s += d * d;
  }
  return Math.sqrt(s / n);
}

function at(work: Work, x: number, y: number) {
  const o = (y * work.w + x) * 4;
  return { r: work.rgba[o] || 0, g: work.rgba[o + 1] || 0, b: work.rgba[o + 2] || 0 };
}

function isWhiteFur(r: number, g: number, b: number) {
  const y = luma01(r, g, b);
  const s = sat01(r, g, b);
  return y >= 0.48 && s <= 0.42;
}

function isTeal(r: number, g: number, b: number) {
  const h = hueDeg(r, g, b);
  const s = sat01(r, g, b);
  const y = luma01(r, g, b);
  return s >= 0.18 && y >= 0.15 && y <= 0.92 && h >= 145 && h <= 210;
}

function isGold(r: number, g: number, b: number) {
  const h = hueDeg(r, g, b);
  const s = sat01(r, g, b);
  const y = luma01(r, g, b);
  return s >= 0.2 && y >= 0.18 && y <= 0.95 && h >= 22 && h <= 62;
}

type Mask = {
  bits: Uint8Array;
  count: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
};

function emptyMask(w: number, h: number): Mask {
  return { bits: new Uint8Array(w * h), count: 0, x0: 0, y0: 0, x1: 0, y1: 0, cx: 0, cy: 0 };
}

function dogMask(work: Work): Mask {
  const { w, h } = work;
  const bits = new Uint8Array(w * h);
  const y0 = Math.floor(h * DOG_BAND_Y0);
  for (let y = y0; y < h; y++) {
    for (let x = Math.floor(w * 0.06); x < Math.floor(w * 0.94); x++) {
      const p = at(work, x, y);
      if (isWhiteFur(p.r, p.g, p.b)) bits[y * w + x] = 1;
    }
  }
  type Comp = { x0: number; y0: number; x1: number; y1: number; sx: number; sy: number; n: number; cells: number[] };
  const seen = new Uint8Array(w * h);
  let best: Comp | null = null;
  const qx: number[] = [];
  const qy: number[] = [];
  for (let y = y0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!bits[i] || seen[i]) continue;
      qx.length = 0;
      qy.length = 0;
      qx.push(x);
      qy.push(y);
      seen[i] = 1;
      const c: Comp = { x0: x, y0: y, x1: x, y1: y, sx: 0, sy: 0, n: 0, cells: [] };
      for (let q = 0; q < qx.length; q++) {
        const cx = qx[q]!;
        const cy = qy[q]!;
        c.cells.push(cy * w + cx);
        c.sx += cx;
        c.sy += cy;
        c.n++;
        if (cx < c.x0) c.x0 = cx;
        if (cy < c.y0) c.y0 = cy;
        if (cx > c.x1) c.x1 = cx;
        if (cy > c.y1) c.y1 = cy;
        const nbs = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];
        for (const [nx, ny] of nbs) {
          if (nx < 0 || ny < y0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!bits[ni] || seen[ni]) continue;
          seen[ni] = 1;
          qx.push(nx);
          qy.push(ny);
        }
      }
      if (!best || c.n > best.n) best = c;
    }
  }
  if (!best || best.n < 8) return emptyMask(w, h);
  const keep = new Uint8Array(w * h);
  for (const i of best.cells) keep[i] = 1;
  return {
    bits: keep,
    count: best.n,
    x0: best.x0,
    y0: best.y0,
    x1: best.x1 + 1,
    y1: best.y1 + 1,
    cx: best.sx / best.n,
    cy: best.sy / best.n,
  };
}

function yawFromVertical(mask: Mask, w: number): number {
  if (mask.count < 8) return 90;
  let cxx = 0;
  let cyy = 0;
  let cxy = 0;
  const mx = mask.cx;
  const my = mask.cy;
  for (let i = 0; i < mask.bits.length; i++) {
    if (!mask.bits[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    const dx = x - mx;
    const dy = y - my;
    cxx += dx * dx;
    cyy += dy * dy;
    cxy += dx * dy;
  }
  const n = mask.count;
  cxx /= n;
  cyy /= n;
  cxy /= n;
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const fromX = (theta * 180) / Math.PI;
  return Math.min(90, Math.abs(90 - Math.abs(fromX)));
}

function isBackYaw(yaw: number) {
  return yaw <= YAW_PROFILE_DEG - 5;
}

function roiCentroid(
  work: Work,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  hit: (r: number, g: number, b: number) => boolean,
): { x: number; y: number; n: number } {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = at(work, x, y);
      if (!hit(p.r, p.g, p.b)) continue;
      sx += x;
      sy += y;
      n++;
    }
  }
  return { x: n ? sx / n : (x0 + x1) / 2, y: n ? sy / n : (y0 + y1) / 2, n };
}

function surveyRig(work: Work, mask: Mask, marks?: ForgeMarks) {
  const { w, h } = work;
  if (
    marks &&
    [marks.doorGapX, marks.doorWidth, marks.pawsY, marks.withersY, marks.bodyWidth, marks.boltCenterX].every(
      (v) => typeof v === "number" && Number.isFinite(v),
    )
  ) {
    return {
      doorGapX: num(marks.doorGapX),
      doorWidth: num(marks.doorWidth),
      pawsY: num(marks.pawsY),
      withersY: num(marks.withersY),
      bodyWidth: num(marks.bodyWidth),
      boltCenterX: num(marks.boltCenterX),
    };
  }
  const doorY0 = Math.floor(h * 0.14);
  const doorY1 = Math.floor(h * 0.48);
  const L = roiCentroid(work, Math.floor(w * 0.05), doorY0, Math.floor(w * 0.4), doorY1, isTeal);
  const R = roiCentroid(work, Math.floor(w * 0.6), doorY0, Math.floor(w * 0.95), doorY1, isGold);
  const lx = L.n ? L.x : w * 0.22;
  const rx = R.n ? R.x : w * 0.78;
  const doorGapX = (lx + rx) / 2 / w;
  const doorWidth = Math.abs(rx - lx) / w;
  const hasDog = mask.count >= 8;
  const pawsY = hasDog ? mask.y1 / h : 0.92;
  const withersY = hasDog ? (mask.y0 + 0.22 * (mask.y1 - mask.y0)) / h : 0.72;
  const bodyWidth = hasDog ? (mask.x1 - mask.x0) / w : 0;
  const boltCenterX = hasDog ? mask.cx / w : 0.5;
  return { doorGapX, doorWidth, pawsY, withersY, bodyWidth, boltCenterX };
}

function rigL1(
  a: ReturnType<typeof surveyRig>,
  b: ReturnType<typeof surveyRig>,
): number {
  const keys = ["doorGapX", "doorWidth", "pawsY", "withersY", "bodyWidth", "boltCenterX"] as const;
  let s = 0;
  for (const k of keys) s += Math.abs(a[k] - b[k]);
  return s / keys.length;
}

function withersSample(work: Work, mask: Mask): { luma: number; sat: number; teal: boolean; gold: boolean } {
  if (mask.count < 8) return { luma: 0, sat: 0, teal: false, gold: false };
  const { w } = work;
  const x0 = Math.max(mask.x0, Math.floor(mask.cx - (mask.x1 - mask.x0) * 0.22));
  const x1 = Math.min(mask.x1, Math.ceil(mask.cx + (mask.x1 - mask.x0) * 0.22));
  const y0 = mask.y0;
  const y1 = Math.max(y0 + 1, Math.floor(mask.y0 + (mask.y1 - mask.y0) * 0.32));
  let luma = 0;
  let sat = 0;
  let n = 0;
  let teal = 0;
  let gold = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (!mask.bits[y * w + x]) continue;
      const p = at(work, x, y);
      luma += luma01(p.r, p.g, p.b);
      sat += sat01(p.r, p.g, p.b);
      if (isTeal(p.r, p.g, p.b)) teal++;
      if (isGold(p.r, p.g, p.b)) gold++;
      n++;
    }
  }
  if (!n) return { luma: 0, sat: 0, teal: false, gold: false };
  return { luma: luma / n, sat: sat / n, teal: teal / n > 0.35, gold: gold / n > 0.35 };
}

function nccSearch(templ: Work, mask: Mask, ib: Work): { peak: number; x: number; y: number } {
  const tw = Math.max(4, mask.x1 - mask.x0);
  const th = Math.max(4, mask.y1 - mask.y0);
  if (mask.count < 8) return { peak: 0, x: 0.5 * ib.w, y: 0.82 * ib.h };
  const t: number[] = [];
  let mt = 0;
  for (let y = mask.y0; y < mask.y1; y++) {
    for (let x = mask.x0; x < mask.x1; x++) {
      const v = templ.gray[y * templ.w + x] || 0;
      t.push(v);
      mt += v;
    }
  }
  const tn = t.length;
  mt /= tn;
  let vt = 0;
  for (const v of t) vt += (v - mt) * (v - mt);
  vt = Math.sqrt(vt / tn) || 1e-6;
  const yBand0 = Math.floor(ib.h * DOG_BAND_Y0);
  const maxX = ib.w - tw;
  const maxY = ib.h - th;
  let best = -2;
  let bx = ib.w * 0.5;
  let by = ib.h * 0.82;
  if (maxX < 0 || maxY < yBand0) return { peak: 0, x: bx, y: by };
  const step = tw > 18 || th > 28 ? 2 : 1;
  for (let y = yBand0; y <= maxY; y += step) {
    for (let x = 0; x <= maxX; x += step) {
      let mi = 0;
      const patch: number[] = [];
      for (let yy = 0; yy < th; yy++) {
        for (let xx = 0; xx < tw; xx++) {
          const v = ib.gray[(y + yy) * ib.w + (x + xx)] || 0;
          patch.push(v);
          mi += v;
        }
      }
      mi /= tn;
      let vi = 0;
      let c = 0;
      for (let i = 0; i < tn; i++) {
        const dt = (t[i] || 0) - mt;
        const di = (patch[i] || 0) - mi;
        vi += di * di;
        c += dt * di;
      }
      vi = Math.sqrt(vi / tn) || 1e-6;
      const ncc = c / tn / (vt * vi);
      if (ncc > best) {
        best = ncc;
        bx = x + tw / 2;
        by = y + th / 2;
      }
    }
  }
  return { peak: best, x: bx, y: by };
}

function hallStats(a: Work, b: Work): { ssim: number; l2: number } {
  const y1 = Math.max(8, Math.floor(a.h * HALL_FRAC));
  const ca = cropGray(blur3(a.gray, a.w, a.h), a.w, a.h, 0, 0, a.w, y1);
  const cb = cropGray(blur3(b.gray, b.w, b.h), b.w, b.h, 0, 0, b.w, y1);
  const ha = resizeGray(ca.g, ca.w, ca.h, 32, 18);
  const hb = resizeGray(cb.g, cb.w, cb.h, 32, 18);
  return { ssim: ssimGray(ha, hb), l2: l2Gray(ha, hb) };
}

function uniqueWhy(list: string[]) {
  return [...new Set(list.filter(Boolean))];
}

/**
 * Cheap still-pair pose match. Ingest only.
 * why codes map onto smoke-gate: rig-jump, hall-drift, taille-pair,
 * spawn-profile / not-back, no-dog, void-frame, grade-withers.
 */
export function matchPose(a: StillSource, b: StillSource, edge: EdgeKind, opts: MatchPoseOpts = {}): MatchPoseOut {
  const why: string[] = [];
  const pa = asPixels(a);
  const pb = asPixels(b);
  if (!pa || !pb || !pa.width || !pa.height || !pb.width || !pb.height || !pa.data.length || !pb.data.length) {
    return { ok: false, why: ["void-frame", "no-dog"] };
  }
  if (meanLuma(pa) <= VOID_LUMA * 1.6 || meanLuma(pb) <= VOID_LUMA * 1.6) {
    return { ok: false, why: ["void-frame", "no-dog"] };
  }

  const wa = downscale(pa, WORK_W, WORK_H);
  const wb = downscale(pb, WORK_W, WORK_H);
  const ma = dogMask(wa);
  const mb = dogMask(wb);
  const dogA = ma.count >= 8;
  const dogB = mb.count >= 8;
  if (!dogA || !dogB) why.push("no-dog");

  const tailleA = dogA ? (ma.y1 - ma.y0) / wa.h : 0;
  const tailleB = dogB ? (mb.y1 - mb.y0) / wb.h : 0;
  const placeA = dogA ? ma.cx / wa.w : 0.5;
  const placeB = dogB ? mb.cx / wb.w : 0.5;
  const yawA = dogA ? yawFromVertical(ma, wa.w) : 90;
  const yawB = dogB ? yawFromVertical(mb, wb.w) : 90;
  const backA = dogA && isBackYaw(yawA);
  const backB = dogB && isBackYaw(yawB);
  const dTaille = Math.abs(tailleA - tailleB);
  const dYaw = Math.abs(yawA - yawB);
  const dPlace = Math.abs(placeA - placeB);

  const rigA = surveyRig(wa, ma, opts.marksA);
  const rigB = surveyRig(wb, mb, opts.marksB);
  const dRig = rigL1(rigA, rigB);
  const hall = hallStats(wa, wb);
  const ncc = dogA ? nccSearch(wa, ma, wb) : { peak: 0, x: wb.w * 0.5, y: wb.h * 0.82 };
  const nccX = ncc.x / wb.w;
  const withA = withersSample(wa, ma);
  const withB = withersSample(wb, mb);
  const withersLuma = Math.min(withA.luma, withB.luma);
  const withersSat = Math.max(withA.sat, withB.sat);

  const tol = edgeTol(edge);

  if (!backA || !backB) {
    why.push("not-back");
    why.push("spawn-profile");
  }
  if (dYaw > tol.yaw) why.push("spawn-profile");
  if (dTaille > tol.taille) why.push("taille-pair");
  if (dPlace > tol.place) why.push("still-pair-dest");
  if (!tol.skipRig && dRig > Math.max(RIG_JUMP, 0.055)) why.push("rig-jump");
  if (!tol.skipHall && hall.ssim < tol.hallSsim) why.push("hall-drift");

  const sidePeak = ncc.peak >= NCC_LOCK * 0.72 && (nccX < NCC_SIDE || nccX > 1 - NCC_SIDE);
  if (dogA && ncc.peak < NCC_LOCK) why.push("no-dog");
  if (sidePeak) why.push("spawn-profile");

  if (withersLuma <= VOID_LUMA * 2 && (dogA || dogB)) why.push("void-frame");
  if (withA.teal || withA.gold || withB.teal || withB.gold) why.push("grade-withers");
  if (withersSat > 0.55 && withersLuma < 0.45) why.push("grade-withers");

  const surveyFail = why.includes("rig-jump") || why.includes("hall-drift");
  const maskFail = why.includes("taille-pair") || why.includes("spawn-profile") || why.includes("not-back") || why.includes("still-pair-dest");
  const nccFail = sidePeak || (dogA && ncc.peak < NCC_LOCK);
  const disagree = Number(surveyFail) + Number(maskFail) + Number(nccFail) === 1;
  if (disagree && STILL_PAIR_CLIP && opts.clip) {
    const clip = opts.clip(a, b);
    if (clip === "profile") {
      why.push("spawn-profile");
      why.push("not-back");
    }
  }

  const measures: PoseMeasures = {
    hallSsim: hall.ssim,
    hallL2: hall.l2,
    tailleA,
    tailleB,
    dTaille,
    yawA,
    yawB,
    dYaw,
    placeA,
    placeB,
    dPlace,
    nccPeak: ncc.peak,
    nccX,
    rigL1: dRig,
    withersLuma,
    withersSat,
    backA,
    backB,
    dogA,
    dogB,
  };
  const list = uniqueWhy(why);
  return { ok: list.length === 0, why: list, measures };
}
