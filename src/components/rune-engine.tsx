import { useEffect, useRef, useState } from "react";
import { Flame, ImagePlus, Mic, PenLine } from "lucide-react";
import {
  SPAWN,
  SHOT_MS,
  clipCount,
  clipLabel,
  compileCitadel,
  forgeQueue,
  theaterMs,
  walkMs,
  walkPrompt,
  plannedObjects,
  boltKit,
  dropTaintedBolt,
  forgeTrayRefs,
  BOLT_BODY,
  emptyHallPrompt,
  hallDoorsPrompt,
  sameHallPrompt,
  enterHallPrompt,
  seedHallPrompt,
  poseBoltPrompt,
  placeBoltPrompt,
  lockDoorsPrompt,
  cleanWish,
  planWalks,
  pathWalks,
  otherDoor,
  idlePrompt,
  breathPrompt,
  gazeLaw,
  TOUR_PLATE,
  HALL_STILL,
  isHallFilm,
  stockRoomBank,
  stockDoorWalk,
  pathEntry,
  stockDoorHits,
  stockStand,
  doorAtPoint,
  facingOf,
  faceRow,
  standFace,
  walkPos,
  walkCycleCol,
  withSpawn,
  type RuneClip,
  type RuneGraph,
  type RuneNode,
  type WalkSecs,
} from "@/game/rune";
import {
  biomeBotStart,
  claimLookForgeAuto,
  lookForgeStart,
  lookForgeWalkStyle,
  lookHallLocked,
  parseLookForge,
  shouldAutoStartBotForge,
  type BoltForgeHook,
} from "@/game/path-entry";
import { lookForgeAlreadyDone, markLookForgeDone, shouldResumeForgePlay } from "@/game/cook-ready";
import { freeRuneSlot, grabRuneFrame, pollCookPlate, startCookStill, startRuneExtend, startRuneFilm, startRuneStill, cacheClip, cacheStill } from "@/lib/cook";
import { COOK_BUSY_WAIT_MS, COOK_START_ACCEPTED_PCT, cookBusyGiveUpFrost, cookBusyNext, cookBusyWaitFrost, isCookSlotBlock, isLocalSlotHold } from "@/lib/cook-busy";
import { BIOMES, biomePlaylist, riftFilm, riftPrompt, type BiomeId } from "@/game/cook";
import { FilmStage } from "@/components/film-stage";
import { dropRoom, hangArtifact, hangOnRoom, isClip, mergeHall, readArtifacts, uniqueClips, ROOM_ONE_STILL, type HungArtifact } from "@/game/artifacts";
import {
  biomeStill,
  doorLetterOf,
  bindHungRoom,
  gateFromHung,
  hydrateRift,
  latestHungHall,
  resolveDoorEnter,
  resolveHungEnter,
  hungPlayChrome,
  hungEnterBindHall,
  hungHallForDoor,
  hungStayHall,
  stayBiomePlay,
  stockTransUrl,
  hungDoorTap,
  hungHallLocksDoors,
  walkHangHallHref,
  walkHungHref,
  type BiomeName,
} from "@/game/enter-graph";
import { hangHall, listHall } from "@/lib/hall";
import { boltFull } from "@/lib/press";
import { sfxForge, startBed, unlockAudio, setLiving } from "@/game/audio";
import {
  dropSession,
  listSessions,
  loadSession,
  newSessionId,
  saveSession,
  sessionName,
  markLivePlay,
  peekLivePlay,
  clearLivePlay,
  listStoredHallHints,
  stampPlay,
  type RuneSession,
  type RuneSessionMeta,
  type CitadelStart,
  type RiftGate,
} from "@/game/rune-session";
import { BootScreen } from "@/components/citadel-hub";
import { HangAskSheet, HangCitadelStrip, HangRoomStrip } from "@/components/hang-ask";
import { HANG_LEFTOVER_SWALLOW_MS, hangActEnters, hangBindHall, hangDoorAct, readHangPending, swallowOpeningTap, takeHangPending, writeHangPending } from "@/game/hang-ask";
import { bindCitadel, defaultHangRoom, hallN, listHangCitadels, listHangRooms, liveSlice, livingHangHall, putSlice, seedHalls, type HangCitadelPick, type HangRoomPick } from "@/game/rooms";
import type { HallSlice } from "@/game/rune-session";
import { brainLaws, brainLine, bump, digest, gradeFrames, learn, retryLaw, stillLaws, type Drive } from "@/game/rune-brain";
import { playableClipSrc } from "@/game/play-clip";
import {
  arrivalEndStill,
  cookHasWalks,
  hallStillOf,
  isBoltSilhouette,
  isHallPlayStill,
  isStockHallClip,
  livingPlayFrame,
  packIdentityStill,
  playCoverStill,
  playStillOrHall,
  seedMayBankIdle,
  doorBreathPlayable,
  walkClipHoldsSeed,
  walkLastFrameSeed,
  type LivingPlayFrame,
  type PlayFrameKind,
} from "@/game/play-frame";

const FADE_MS = 1100;

function armFilm(el: HTMLVideoElement, url: string, _loop = false) {
  const src = playableClipSrc(url) || url;
  if (!src) return;
  el.muted = true;
  el.defaultMuted = true;
  el.playsInline = true;
  try {
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    el.setAttribute("muted", "true");
  } catch {
    /* */
  }
  el.loop = false;
  const now = (el.getAttribute("src") || el.currentSrc || "").trim();
  if (now === src) return;
  try {
    el.src = src;
  } catch {
    /* */
  }
}

function durableStill(u?: string | null) {
  if (!u) return null;
  if (u.startsWith("blob:")) return null;
  if (isBoltSilhouette(u) || isStockArt(u)) return null;
  if (u.startsWith("/refs/")) return null;
  if (u.startsWith("data:") || u.startsWith("/films/") || u.startsWith("http")) return u;
  return null;
}

function firstStill(urls: (string | undefined | null)[]) {
  const local: string[] = [];
  const remote: string[] = [];
  for (const u of urls) {
    const d = durableStill(u);
    if (!d) continue;
    if (d.startsWith("/") || d.startsWith("data:")) local.push(d);
    else remote.push(d);
  }
  return local[0] || remote[0] || null;
}

function usableStill(u?: string | null) {
  return durableStill(u);
}

function stillOk(u?: string | null): u is string {
  return !!u && (u.startsWith("http") || u.startsWith("/") || u.startsWith("data:") || u.startsWith("blob:"));
}

function isStockArt(u?: string | null) {
  if (!u) return true;
  if (isHallFilm(u)) return false;
  const s = u.toLowerCase();
  return (
    s.includes("/ui/citadel.jpg") ||
    s.includes("hall-doors") ||
    s.includes("/films/cook-") ||
    s.includes("/films/hall.jpg") ||
    s.includes("/films/hall-p")
  );
}

const HALL_FALLBACK = "/films/citadel-tour.jpg?v=sharp";

const hallRam = new Map<string, string>();

function recallHall(id?: string) {
  if (!id || typeof window === "undefined") return "";
  const ram = durableStill(hallRam.get(id));
  if (ram) return ram;
  try {
    const u = sessionStorage.getItem(`bolt-hall:${id}`) || localStorage.getItem(`bolt-hall:${id}`) || "";
    return durableStill(u) || "";
  } catch {
    return "";
  }
}

function rememberHall(id: string, u?: string | null) {
  const d = durableStill(u);
  if (!id || !d) return;
  hallRam.set(id, d);
  if (d.startsWith("data:") && d.length > 220000) return;
  try {
    sessionStorage.setItem(`bolt-hall:${id}`, d);
    localStorage.setItem(`bolt-hall:${id}`, d);
  } catch {
    /* */
  }
}

function hallStillFrom(s: {
  start?: string;
  plate?: string;
  thumb?: string;
  refs?: { id: string; name?: string; src: string }[];
  bank?: { key: string; end?: string }[];
}) {
  const refs = s.refs || [];
  const find = (id: string) => refs.find((r) => r.id === id)?.src;
  const named = (n: string) => refs.find((r) => (r.name || "").toLowerCase() === n)?.src;
  return firstStill([
    find("hall"),
    named("hall"),
    find("empty"),
    find("placed"),
    find("bolt in"),
    s.start,
    find("room"),
    find("seed"),
    find("pose-spawn"),
    s.plate,
    s.thumb,
    ...(s.bank || []).map((b) => b.end),
  ]);
}

function idleSkip(d: number) {
  if (!Number.isFinite(d) || d < 1.2) return 0.08;
  // Walk + extend stitch: loop only the last ~6s of breath, never replay the walk.
  if (d > 8.8) return Math.max(0.2, d - 6.15);
  return Math.min(0.16, Math.max(0.08, d * 0.03));
}

function clampWalk(n?: number): 6 | 10 {
  return n === 6 ? 6 : 10;
}

const PLATES = [
  { id: "runes", src: "/films/cook-runes.jpg", name: "hall" },
  { id: "cave", src: "/films/cook-artifacts.jpg", name: "cave" },
  { id: "rome", src: "/films/cook-rome.jpg", name: "rome" },
  { id: "greece", src: "/films/cook-greece.jpg", name: "greece" },
  { id: "persia", src: "/films/cook-persia.jpg", name: "persia" },
  { id: "egypt", src: "/films/cook-egypt.jpg", name: "egypt" },
  { id: "babylon", src: "/films/cook-babylon.jpg", name: "babylon" },
  { id: "ember", src: "/films/cook-ember.jpg", name: "ember" },
  { id: "ruin", src: "/films/cook-ruin.jpg", name: "ruin" },
  { id: "forest", src: "/films/cook-forest.jpg", name: "forest" },
];

type Phase = "count" | "look" | "refs" | "mark" | "time" | "forge" | "play" | "gate";
type Beat = "idle" | "walk" | "shot" | "cook" | "playvid";

type Walk = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  dur: number;
  to: string;
};

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((ev?: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

function loadPic(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("img"));
    im.src = src;
  });
}

function punchBlack(im: HTMLImageElement, cut = 36) {
  const c = document.createElement("canvas");
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.drawImage(im, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const m = Math.max(px[i]!, px[i + 1]!, px[i + 2]!);
    if (m < cut) px[i + 3] = 0;
    else if (m < cut + 28) px[i + 3] = Math.round(((m - cut) / 28) * 255);
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

async function pasteRoom(
  hall: string,
  doors: { src: string; x: number; y: number }[],
  bolt: string,
) {
  const base = await loadPic(hall);
  const w = base.naturalWidth || 720;
  const h = base.naturalHeight || 1280;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("ctx");
  ctx.drawImage(base, 0, 0, w, h);
  for (const d of doors) {
    const cut = punchBlack(await loadPic(d.src));
    const dw = w * 0.3;
    const dh = dw * (cut.height / Math.max(1, cut.width));
    ctx.drawImage(cut, d.x * w - dw / 2, d.y * h - dh / 2, dw, dh);
  }
  const wolf = punchBlack(await loadPic(bolt));
  const bw = w * 0.24;
  const bh = bw * (wolf.height / Math.max(1, wolf.width));
  ctx.drawImage(wolf, w * 0.5 - bw / 2, h * 0.8 - bh * 0.88, bw, bh);
  return out.toDataURL("image/jpeg", 0.92);
}

function speechEngine() {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

function filmBox(rect: DOMRect, ar: number) {
  let fw = rect.width;
  let fh = rect.width / ar;
  if (fh > rect.height) {
    fh = rect.height;
    fw = rect.height * ar;
  }
  return { x: (rect.width - fw) / 2, y: (rect.height - fh) / 2, w: fw, h: fh };
}

type DoorHit = { x: number; y: number; w: number; h: number };
const STOCK_HITS = stockDoorHits();
const BOLT_WALK = "/sprites/bolt/walk.png";
const BOLT_IDLE = "/sprites/bolt/idle.png";

const boltSheets: { walk: HTMLImageElement | null; idle: HTMLImageElement | null } = { walk: null, idle: null };
function sheetOf(kind: "walk" | "idle") {
  if (typeof Image === "undefined") return null;
  if (boltSheets[kind]) return boltSheets[kind];
  const im = new Image();
  im.src = kind === "walk" ? BOLT_WALK : BOLT_IDLE;
  boltSheets[kind] = im;
  return im;
}

function hideBakedBolt(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const x = SPAWN.x * w;
  const floor = ctx.createLinearGradient(0, h * 0.62, 0, h);
  floor.addColorStop(0, "rgba(6,8,12,0)");
  floor.addColorStop(0.16, "rgba(6,8,12,0.9)");
  floor.addColorStop(0.4, "rgba(6,8,12,0.98)");
  floor.addColorStop(1, "rgba(6,8,12,1)");
  ctx.fillStyle = floor;
  ctx.fillRect(w * 0.16, h * 0.62, w * 0.68, h * 0.38);
  const g = ctx.createRadialGradient(x, h * 0.76, w * 0.02, x, h * 0.78, w * 0.36);
  g.addColorStop(0, "rgba(6,8,12,1)");
  g.addColorStop(0.55, "rgba(6,8,12,0.96)");
  g.addColorStop(1, "rgba(6,8,12,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, h * 0.78, w * 0.36, h * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBoltSprite(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pos: { x: number; y: number },
  walking: boolean,
  now: number,
  face: ReturnType<typeof facingOf>,
  gaitCol = 0,
) {
  const sheet = sheetOf("walk");
  const x = pos.x * w;
  const y = pos.y * h;
  const near = 0.78;
  const far = 0.56;
  const depth = Math.max(0, Math.min(1, (near - pos.y) / (near - far)));
  const scale = 1 - depth * 0.42;
  const bw = w * 0.16 * scale;
  const bh = bw * 1.12;
  if (sheet && sheet.naturalWidth > 8) {
    const cols = 4;
    const rows = 4;
    const row = faceRow(face);
    const col = walking ? gaitCol % cols : 0;
    const cw = sheet.naturalWidth / cols;
    const ch = sheet.naturalHeight / rows;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sheet, col * cw, row * ch, cw, ch, x - bw / 2, y - bh, bw, bh);
    ctx.restore();
    return;
  }
  drawTravel(ctx, w, h, pos, walking, now, !walking);
}

const doorScan = typeof document !== "undefined" ? document.createElement("canvas") : null;

function lumAt(d: Uint8ClampedArray, w: number, x: number, y: number) {
  const i = (y * w + x) * 4;
  return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
}

function mixDoor(a: DoorHit, b: DoorHit, t: number): DoorHit {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    w: a.w + (b.w - a.w) * t,
    h: a.h + (b.h - a.h) * t,
  };
}

function okDoor(b: DoorHit, left: boolean) {
  if (b.w < 0.1 || b.w > 0.22 || b.h < 0.3 || b.h > 0.55) return false;
  if (b.y < 0.06 || b.y + b.h > 0.88) return false;
  const cx = b.x + b.w / 2;
  return left ? cx < 0.48 : cx > 0.52;
}

function argmaxRange(sm: number[], a: number, b: number) {
  let i = Math.max(1, Math.min(a, b));
  const end = Math.max(1, Math.max(a, b));
  let best = i;
  let s = -1;
  for (let x = i; x <= end && x < sm.length - 1; x++) {
    if (sm[x] > s) {
      s = sm[x];
      best = x;
    }
  }
  return best;
}

function findDoorAtPin(
  d: Uint8ClampedArray,
  W: number,
  H: number,
  pinX: number,
  pinY: number,
  left: boolean,
): DoorHit | null {
  const px = Math.round(pinX * W);
  const py = Math.round(pinY * H);
  const y0 = Math.max(2, Math.floor(py - H * 0.32));
  const y1 = Math.min(H - 2, Math.floor(py + H * 0.18));
  const x0 = Math.max(2, Math.floor(left ? px - W * 0.07 : px - W * 0.22));
  const x1 = Math.min(W - 2, Math.floor(left ? px + W * 0.22 : px + W * 0.07));
  const col = new Array<number>(W).fill(0);
  for (let x = x0; x <= x1; x++) {
    let s = 0;
    for (let y = y0; y < y1; y++) s += Math.abs(lumAt(d, W, x, y) - lumAt(d, W, x - 1, y));
    col[x] = s;
  }
  const sm = col.slice();
  for (let x = x0 + 1; x < x1; x++) sm[x] = (col[x - 1] + col[x] * 2 + col[x + 1]) / 4;
  const minGap = Math.max(8, Math.floor(W * 0.12));
  const maxGap = Math.floor(W * 0.2);
  let L: number;
  let R: number;
  if (left) {
    L = argmaxRange(sm, Math.floor(px - W * 0.05), Math.floor(px + W * 0.03));
    R = argmaxRange(sm, L + minGap, Math.min(x1, L + maxGap));
  } else {
    R = argmaxRange(sm, Math.floor(px - W * 0.03), Math.floor(px + W * 0.05));
    L = argmaxRange(sm, Math.max(x0, R - maxGap), R - minGap);
  }
  if (R - L < minGap || R - L > maxGap) return null;
  const row = new Array<number>(H).fill(0);
  for (let y = 3; y < H - 3; y++) {
    let e = 0;
    for (let x = L; x <= R; x++) e += Math.abs(lumAt(d, W, x, y) - lumAt(d, W, x, y - 1));
    row[y] = e / (R - L + 1);
  }
  const top = argmaxRange(row, Math.floor(py - H * 0.36), Math.floor(py - H * 0.14));
  const bot = argmaxRange(row, Math.floor(py + H * 0.08), Math.floor(py + H * 0.22));
  const hit = {
    x: (L + 0.5) / W,
    y: (top + 0.5) / H,
    w: (R - L) / W,
    h: Math.max(0.32, (bot - top) / H),
  };
  return okDoor(hit, left) ? hit : null;
}

function readDoors(
  src: CanvasImageSource,
  pins?: { m1: { x: number; y: number }; m2: { x: number; y: number } },
): { m1: DoorHit; m2: DoorHit } | null {
  if (!doorScan) return null;
  const W = 120;
  const H = 213;
  doorScan.width = W;
  doorScan.height = H;
  const ctx = doorScan.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const a = pins?.m1 || { x: 0.22, y: 0.48 };
  const b = pins?.m2 || { x: 0.78, y: 0.48 };
  try {
    ctx.drawImage(src, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;
    const m1 = findDoorAtPin(data, W, H, a.x, a.y, true) || pinDoor("m1", a);
    const m2 = findDoorAtPin(data, W, H, b.x, b.y, false) || pinDoor("m2", b);
    return { m1, m2 };
  } catch {
    return { m1: pinDoor("m1", a), m2: pinDoor("m2", b) };
  }
}

function pinDoor(id: "m1" | "m2", pin: { x: number; y: number }): DoorHit {
  const w = 0.175;
  const h = 0.44;
  const y = Math.max(0.12, pin.y - 0.27);
  if (id === "m1") return { x: Math.max(0.04, pin.x - 0.012), y, w, h };
  return { x: Math.min(0.8, pin.x - w + 0.012), y, w, h };
}

export function RuneEngine({ onBack, boot }: { onBack: () => void; boot?: CitadelStart }) {
  const hangArt = useRef(boot && "art" in boot ? boot.art : undefined);
  const [plate, setPlate] = useState(() => {
    if (hangArt.current) return TOUR_PLATE;
    if (typeof window === "undefined") return "";
    if (boot?.kind === "session") {
      const live = peekLivePlay(boot.id);
      const hit = listSessions().find((s) => s.id === boot.id);
      return firstStill([live?.plate, recallHall(boot.id), (hit as { plate?: string } | undefined)?.plate, hit?.thumb]) || TOUR_PLATE;
    }
    return TOUR_PLATE;
  });
  const [want, setWant] = useState(2);
  const [filmCap, setFilmCap] = useState(3);
  const [pins, setPins] = useState<RuneNode[]>([]);
  const [phase, setPhase] = useState<Phase>(() => {
    if (hangArt.current) return "play";
    if (boot?.kind === "session") return "play";
    if (boot?.kind === "path") {
      if (pathEntry(boot.stills) === "stock") return "play";
      if (typeof window !== "undefined") {
        const live = peekLivePlay();
        if (shouldResumeForgePlay({ done: lookForgeAlreadyDone(), liveId: live?.id })) return "play";
      }
      return "look";
    }
    return "count";
  });
  const [walkSecs, setWalkSecs] = useState<WalkSecs>(10);
  const [graph, setGraph] = useState<RuneGraph | null>(null);
  const [here, setHere] = useState(SPAWN.id);
  const [lit, setLit] = useState<string | null>(null);
  const [forged, setForged] = useState(0);
  const [nowClip, setNowClip] = useState<RuneClip | null>(null);
  const [beat, setBeat] = useState<Beat>("idle");
  const [pose, setPose] = useState<string | null>(null);
  const [shots, setShots] = useState<string[]>([]);
  const [pick, setPick] = useState(false);
  const [wish, setWish] = useState("");
  const wishRef = useRef("");
  const [styleOn, setStyleOn] = useState("");
  const [howl, setHowl] = useState(false);
  const [cook, setCook] = useState(false);
  const [frost, setFrost] = useState("");
  const [slotReason, setSlotReason] = useState("");
  const [bootOn, setBootOn] = useState(() => {
    if (boot?.kind !== "session") return false;
    return !firstStill([peekLivePlay(boot.id)?.plate, recallHall(boot.id)]);
  });
  const [bootPct, setBootPct] = useState(0);
  const [bootLine, setBootLine] = useState("opening");
  const booted = useRef(false);
  const coverHold = useRef<string | null>(null);
  const bolt = useRef({ x: SPAWN.x, y: SPAWN.y });
  const walk = useRef<Walk | null>(null);
  const queued = useRef<string | null>(null);
  const layer = useRef<HTMLDivElement | null>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  const ear = useRef<HTMLInputElement | null>(null);
  const rec = useRef<SpeechRec | null>(null);
  const lastTap = useRef(0);
  const lastPt = useRef({ x: 0.5, y: 0.5 });
  const pendingTap = useRef(0);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const raf = useRef(0);
  const hereRef = useRef(here);
  const pinsRef = useRef(pins);
  const phaseRef = useRef(phase);
  const graphRef = useRef(graph);
  const forgedRef = useRef(forged);
  const litRef = useRef(lit);
  const nowClipRef = useRef(nowClip);
  const wantRef = useRef(want);
  const filmCapRef = useRef(filmCap);
  const pathFirst = useRef<"m1" | "m2" | null>(boot?.kind === "path" ? boot.first : null);
  const extraPath = useRef(false);
  const [needOther, setNeedOther] = useState(false);
  const [needStill, setNeedStill] = useState(false);
  const [editOn, setEditOn] = useState(false);
  const [walksUI, setWalksUI] = useState<{ key: string; from: string; to: string }[]>([]);
  const [clipsUI, setClipsUI] = useState<{ key: string; label: string; kind: "walk" | "breathe" | "still"; url: string; end: string }[]>([]);
  const [reelOn, setReelOn] = useState(false);
  const [hallsOn, setHallsOn] = useState(false);
  const [graphOn, setGraphOn] = useState(true);
  const trayAt = useRef(0);
  const [tray, setTray] = useState(false);
  const [lockCover, setLockCover] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    if (boot?.kind !== "session") return null;
    const live = peekLivePlay(boot.id);
    return firstStill([live?.plate, recallHall(boot.id)]) || null;
  });
  const [coverFade, setCoverFade] = useState(false);
  const pickRef = useRef(pick);
  const beatRef = useRef<Beat>("idle");
  const walkSecsRef = useRef(walkSecs);
  const forgeClock = useRef(0);
  const lastPose = useRef<string | null>(null);
  const plateShot = useRef(false);
  const wantIdle = useRef(false);
  const liveForge = useRef(false);
  const quietCook = useRef(false);
  const stockSprite = useRef(false);
  const walkWait = useRef<(() => void) | null>(null);
  const walkFace = useRef<ReturnType<typeof facingOf>>("up");
  const runId = useRef(0);
  const armed = useRef(false);
  const playing = useRef(false);
  const playTok = useRef(0);
  const loadGen = useRef(0);
  const filmLoop = useRef(false);
  const wrapping = useRef(false);
  const idleArmed = useRef(false);
  const skipIn = useRef(false);
  const entering = useRef(false);
  const lastLive = useRef<string | null>(null);
  const cameFrom = useRef("start");
  const bank = useRef(new Map<string, { url: string; end: string; start?: string }>());
  const film = useRef<HTMLVideoElement | null>(null);
  const filmB = useRef<HTMLVideoElement | null>(null);
  const useBRef = useRef(false);
  const [useB, setUseB] = useState(false);
  const [filmUrl, setFilmUrl] = useState<string | null>(null);
  const [filmOn, setFilmOn] = useState(false);
  const [paintA, setPaintA] = useState(false);
  const [paintB, setPaintB] = useState(false);
  const [loopOn, setLoopOn] = useState(false);
  const [refs, setRefs] = useState<{ id: string; name: string; src: string }[]>([]);
  const [look, setLook] = useState<{ id: string; name: string; src: string; url?: string } | null>(null);
  const stripEl = useRef<HTMLDivElement | null>(null);
  const stripDrag = useRef({ x: 0, scroll: 0, moved: false });
  const [stripOn, setStripOn] = useState(true);
  const [loadPct, setLoadPct] = useState(0);
  const [loadName, setLoadName] = useState("");
  const [late, setLate] = useState(false);
  const [stageSrc, setStageSrc] = useState<string | null>(null);
  const [lookPack, setLookPack] = useState<{ id: string; name: string; src: string }[]>([]);
  const lookPackRef = useRef(lookPack);
  lookPackRef.current = lookPack;
  const lookHall = useRef<string | null>(null);
  const worldHold = useRef("");
  const [forgePack, setForgePack] = useState<"live" | "sealed" | "hall">("live");
  const [forgeWish, setForgeWish] = useState("");
  const [forgeAutoOn, setForgeAutoOn] = useState(false);
  const [playFrameKind, setPlayFrameKind] = useState<PlayFrameKind | "">("");
  const [playWalksOn, setPlayWalksOn] = useState(false);
  const hallStyleOnly = useRef(false);
  const [lookRes, setLookRes] = useState<"720" | "1080">("720");
  const lookResRef = useRef<"720" | "1080">("720");
  lookResRef.current = lookRes;
  const [needBolt, setNeedBolt] = useState(true);
  const [needRoom, setNeedRoom] = useState(true);
  const needBoltRef = useRef(true);
  const needRoomRef = useRef(true);
  const refsMap = useRef(new Map<string, string>());
  const sid = useRef(newSessionId());
  const startHold = useRef("");
  const hallKeep = useRef(
    boot?.kind === "session" ? firstStill([peekLivePlay(boot.id)?.plate, recallHall(boot.id)]) : "",
  );
  const roomsHold = useRef(boot?.kind === "path" ? boot.rooms || 1 : 1);
  const hallHold = useRef(boot?.kind === "path" ? boot.hall || 1 : 1);
  const fromHold = useRef("");
  const titleHold = useRef("");
  const viaHold = useRef("");
  const nextHold = useRef<{ m1?: string; m2?: string }>({});
  const hallsHold = useRef<HallSlice[]>([]);
  const skipAsk = useRef("");
  const [enterAsk, setEnterAsk] = useState<"m1" | "m2" | null>(null);
  const [rift, setRift] = useState<{ m1?: RiftGate; m2?: RiftGate }>({});
  const riftRef = useRef(rift);
  riftRef.current = rift;
  const [riftPick, setRiftPick] = useState<"ask" | "m1" | "m2" | null>(null);
  const riftPickRef = useRef(riftPick);
  riftPickRef.current = riftPick;
  const [riftDraft, setRiftDraft] = useState<{
    door: "m1" | "m2";
    gate: RiftGate;
    cook: "ask" | "cook" | "fail";
  } | null>(null);
  const riftDraftRef = useRef(riftDraft);
  riftDraftRef.current = riftDraft;
  const riftCookTok = useRef(0);
  const [riftBloom, setRiftBloom] = useState<{ still: string; name: string; door: "m1" | "m2"; open: boolean } | null>(null);
  const [sprint, setSprint] = useState<{ film: ReturnType<typeof riftFilm>; door: "m1" | "m2"; name: string; hall: number } | null>(null);
  const sprintHold = useRef(false);
  const [hangRoomN, setHangRoomN] = useState(1);
  const hangRoomRef = useRef(1);
  const hangGuard = useRef(0);
  const walkingTo = useRef("");
  const [liveHall, setLiveHall] = useState(() => (boot?.kind === "path" ? boot.hall || 1 : 1));
  function pickHangHall(n: number) {
    const hall = Math.max(1, Math.min(8, n || 1));
    hangRoomRef.current = hall;
    setHangRoomN(hall);
  }
  const [hangAsk, setHangAsk] = useState<{ a: HungArtifact; door: "A" | "B" } | null>(null);
  const [liveHangRooms, setLiveHangRooms] = useState<HangRoomPick[]>([{ hall: 1, name: "Room 1", still: "", living: true }]);
  const [hangCitadel, setHangCitadel] = useState("");
  const hangCitadelRef = useRef("");
  const [hangCitadels, setHangCitadels] = useState<HangCitadelPick[]>([]);
  const [hungArts, setHungArts] = useState<HungArtifact[]>(() => (typeof window === "undefined" ? [] : readArtifacts()));
  const [doorHit, setDoorHit] = useState<{ m1: DoorHit; m2: DoorHit } | null>(() => STOCK_HITS);
  const doorHitRef = useRef<{ m1: DoorHit; m2: DoorHit } | null>(STOCK_HITS);
  const [picBox, setPicBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [bridge, setBridge] = useState<{ hall: string; a: string; b: string }>({ hall: "", a: "", b: "" });
  const [bridgeOn, setBridgeOn] = useState({ hall: true, a: true, b: true });
  const [enterDoor, setEnterDoor] = useState<"a" | "b">("a");
  const enterDoorRef = useRef<"a" | "b">("a");
  const enterHold = useRef({ hall: "", a: "", b: "", pick: "a" as "a" | "b" });
  const skipEnter = useRef(false);
  const begin = useRef<() => void>(() => {});
  const dead = useRef(false);
  const cooking = useRef(false);
  const botKick = useRef(false);
  const botForgeAuto = useRef(false);
  const startBotForgeRef = useRef<() => boolean>(() => false);
  const kickAutoBotForgeRef = useRef<() => boolean>(() => false);
  const [hub, setHub] = useState<RuneSessionMeta[]>(() =>
    typeof window === "undefined" ? [] : listSessions(),
  );
  const [iq, setIq] = useState(() => (typeof window === "undefined" ? "engine" : brainLine()));
  const [drive] = useState<Drive>(() => {
    if (boot?.kind === "path") return boot.drive;
    if (boot?.kind === "session" && boot.drive) return boot.drive;
    return "engine";
  });
  const [pilotOn, setPilotOn] = useState(false);
  const driveRef = useRef<Drive>(drive);
  const pilotWait = useRef<((v: "go" | "retry" | "stop") => void) | null>(null);
  driveRef.current = drive;
  const refsHold = useRef(refs);
  const plateRef = useRef(plate);
  refsHold.current = refs;
  plateRef.current = plate;
  pinsRef.current = pins;
  phaseRef.current = phase;
  graphRef.current = graph;
  forgedRef.current = forged;
  litRef.current = lit;
  nowClipRef.current = nowClip;
  wantRef.current = want;
  filmCapRef.current = filmCap;
  needBoltRef.current = needBolt;
  needRoomRef.current = needRoom;
  pickRef.current = pick;
  beatRef.current = beat;
  walkSecsRef.current = walkSecs;

  useEffect(() => {
    if (phase !== "play") return;
    if (sprintHold.current) return;
    if (playing.current || beatRef.current === "playvid" || beatRef.current === "walk") return;
    const t = window.setTimeout(() => {
      if (phaseRef.current !== "play") return;
      if (sprintHold.current || playing.current || beatRef.current === "playvid") return;
      if (!film.current && !filmB.current) return;
      holdIdle();
    }, 80);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    const bind = (el: HTMLVideoElement | null) => {
      if (!el) return () => {};
      const onTime = () => stampLoop(el);
      const onEnd = () => againLoop(el);
      el.addEventListener("timeupdate", onTime);
      el.addEventListener("ended", onEnd);
      return () => {
        el.removeEventListener("timeupdate", onTime);
        el.removeEventListener("ended", onEnd);
      };
    };
    const a = bind(film.current);
    const b = bind(filmB.current);
    return () => {
      a();
      b();
    };
  }, [phase, filmUrl]);

  const counts = clipCount(want, filmCap);
  const ready = pins.length >= want;
  const queue = graph ? forgeQueue(graph) : [];

  useEffect(() => {
    const id = ++runId.current;
    dead.current = false;
    cooking.current = false;
    const t = window.setTimeout(() => {
      armed.current = true;
    }, 480);
    if (boot?.kind === "path") {
      pathFirst.current = boot.first;
      roomsHold.current = boot.rooms || 1;
      hallHold.current = boot.hall || 1;
      hangRoomRef.current = hallHold.current;
      setHangRoomN(hallHold.current);
      setLiveHall(hallHold.current);
      wantIdle.current = boot.stills === true;
      setWant(2);
      setFilmCap(6);
      if (hangArt.current) {
        lockHall(TOUR_PLATE);
        setPhase("play");
        phaseRef.current = "play";
        setRiftPick("ask");
        setFrost("hang your artefact on a door");
      } else if (pathEntry(boot.stills) === "stock") {
        enterLivingRoom(boot.first);
      } else if (shouldResumeForgePlay({ done: lookForgeAlreadyDone(), liveId: peekLivePlay()?.id })) {
        const liveId = peekLivePlay()?.id;
        if (liveId) void openSession(liveId, true);
      } else {
        setPhase("look");
        phaseRef.current = "look";
        window.setTimeout(() => kickAutoBotForgeRef.current(), 0);
      }
    }
    return () => {
      if (runId.current === id) dead.current = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!bootOn) return;
    const t = window.setInterval(() => {
      setBootPct((n) => (n < 90 ? n + 1 : n));
    }, 110);
    return () => window.clearInterval(t);
  }, [bootOn]);

  useEffect(() => {
    if (phase !== "refs" && !(phase === "forge" && beat === "cook")) {
      setLate(false);
      return;
    }
    setLate(false);
    const t = window.setTimeout(() => setLate(true), 10000);
    return () => window.clearTimeout(t);
  }, [phase, beat, loadName, frost]);

  function persist(extra?: Partial<RuneSession>) {
    const ph = extra?.phase ?? phaseRef.current;
    if (ph === "count") return;
    markLivePlay(sid.current, extra?.here ?? hereRef.current, hallKeep.current || durableStill(extra?.plate ?? plateRef.current) || "");
    if (hallHold.current >= 1 && (bank.current.size || plateRef.current || startHold.current)) {
      rememberSlice(snapHall());
    }
    const snap: RuneSession = {
      id: sid.current,
      name: sessionName(wantRef.current, ph),
      updated: Date.now(),
      phase: ph,
      want: wantRef.current,
      walks: bank.current.size,
      thumb: extra?.plate || extra?.thumb || "",
      walkSecs: walkSecsRef.current,
      pins: pinsRef.current,
      plate: extra?.plate ?? plateRef.current,
      start: extra?.start ?? startHold.current,
      rooms: extra?.rooms ?? roomsHold.current,
      hall: extra?.hall ?? hallHold.current,
      from: extra?.from ?? (fromHold.current || undefined),
      title: extra?.title ?? (titleHold.current || undefined),
      via: extra?.via ?? (viaHold.current || undefined),
      next: extra?.next ?? (Object.keys(nextHold.current).length ? nextHold.current : undefined),
      halls: extra?.halls ?? (hallsHold.current.length ? hallsHold.current : undefined),
      rift: extra?.rift ?? (riftRef.current.m1 || riftRef.current.m2 ? riftRef.current : undefined),
      here: extra?.here ?? hereRef.current,
      cameFrom: extra?.cameFrom ?? cameFrom.current,
      forged: extra?.forged ?? forgedRef.current,
      refs: extra?.refs ?? refsHold.current,
      wish: worldHold.current.slice(0, 280),
      bank: extra?.bank ?? [...bank.current].map(([key, v]) => ({ key, url: v.url, end: v.end, start: v.start })),
      ...extra,
    };
    if (!snap.id) snap.id = newSessionId();
    const parent = extra?.from ?? fromHold.current;
    snap.from = parent && parent !== snap.id ? parent : undefined;
    const hasFilm = (snap.bank || []).some((b) => b?.url) || (snap.halls || []).some((h) => (h.bank || []).some((b) => b?.url));
    const isRoom = !!(snap.from || extra?.from || (snap.hall && snap.hall > 1) || (snap.halls && snap.halls.length > 1));
    const living = ph === "play" || hasFilm || isHallFilm(snap.plate) || isHallFilm(snap.start);
    if (!living && !hasFilm && !snap.plate && !(snap.refs || []).length && !isRoom) return;
    const slimU = (u?: string) => {
      if (!u || u.startsWith("data:") || u.startsWith("blob:")) return "";
      return u;
    };
    snap.plate = slimU(snap.plate) || slimU(snap.start) || slimU(hallKeep.current || undefined);
    if (isBoltSilhouette(snap.plate)) snap.plate = slimU(hallKeep.current || undefined) || slimU(HALL_STILL) || "";
    snap.start = slimU(snap.start) || snap.plate;
    if (isBoltSilhouette(snap.start)) snap.start = snap.plate;
    snap.thumb = slimU(snap.thumb) || snap.plate;
    if (isBoltSilhouette(snap.thumb)) snap.thumb = snap.plate;
    snap.refs = (snap.refs || [])
      .map((r) => ({ ...r, src: slimU(r.src) }))
      .filter((r) => r.src)
      .slice(0, 12);
    snap.bank = (snap.bank || [])
      .map((b) => ({ key: b.key, url: slimU(b.url), end: slimU(b.end) }))
      .filter((b) => b.url)
      .slice(0, 24);
    if (snap.halls) {
      snap.halls = snap.halls.slice(0, 8).map((h) => ({
        ...h,
        still: slimU(h.still),
        plate: slimU(h.plate),
        start: slimU(h.start),
        bank: (h.bank || [])
          .map((b) => ({ ...b, url: slimU(b.url), end: slimU(b.end) }))
          .filter((b) => b.url)
          .slice(0, 16),
        refs: (h.refs || [])
          .map((r) => ({ ...r, src: slimU(r.src) }))
          .filter((r) => r.src)
          .slice(0, 8),
      }));
    }
    if ((extra?.phase ?? phaseRef.current) === "play") {
      markLivePlay(snap.id, snap.here, hallKeep.current || durableStill(snap.plate) || "");
    }
    void saveSession(snap).catch(() => {});
  }

  function goBack() {
    persist({ phase: phaseRef.current === "count" ? "play" : phaseRef.current });
    clearLivePlay();
    onBack();
  }

  const persistRef = useRef(persist);
  persistRef.current = persist;

  useEffect(() => {
    refreshHung();
    const flush = () => {
      persistRef.current();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    const stay = () => {
      if (phaseRef.current !== "play") return;
      freezeVis(true);
    };
    window.addEventListener("unhandledrejection", stay);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("unhandledrejection", stay);
    };
  }, []);

  function failStay(msg: string) {
    setFrost(msg);
    setLoadPct(0);
    setBeat("idle");
    beatRef.current = "idle";
    liveForge.current = false;
    if (phaseRef.current === "count") {
      setPhase("refs");
      phaseRef.current = "refs";
    }
  }

  function retryForge() {
    cooking.current = false;
    dead.current = false;
    liveForge.current = true;
    setLate(false);
    setLoadPct(8);
    setBeat("cook");
    beatRef.current = "cook";
    void freeRuneSlot({ data: {} })
      .catch(() => {})
      .then(() => {
        retryForgeAfterFree();
      });
  }

  function retryForgeAfterFree() {
    let g = graphRef.current;
    if (!g && pinsRef.current.length) {
      g = compileCitadel(plateRef.current || plate, pinsRef.current, walkSecsRef.current);
      graphRef.current = g;
      setGraph(g);
    }
    const hasSeed = !!(refsMap.current.get("seed") || refsMap.current.get("pose-spawn"));
    if (g && hasSeed) {
      setFrost("retry walks");
      setPhase("forge");
      phaseRef.current = "forge";
      void cookWalks(g, true).catch(() => failStay("forge paused · tap retry"));
      return;
    }
    setFrost(hasSeed ? "retry poses" : "retry seed");
    setPhase("refs");
    phaseRef.current = "refs";
    void cookRefs().catch(() => failStay("forge paused · tap retry"));
  }

  function waitPilot(): Promise<"go" | "retry" | "stop"> {
    if (driveRef.current !== "pilot") return Promise.resolve("go");
    setPilotOn(true);
    return new Promise((resolve) => {
      const t = window.setTimeout(() => {
        setPilotOn(false);
        pilotWait.current = null;
        resolve("go");
      }, 12000);
      pilotWait.current = (v) => {
        window.clearTimeout(t);
        setPilotOn(false);
        pilotWait.current = null;
        resolve(v);
      };
    });
  }

  function answerPilot(v: "go" | "retry" | "stop") {
    pilotWait.current?.(v);
  }

  function scanDoors() {
    if (phaseRef.current !== "play") return;
    const vid = film.current;
    const pic = img.current;
    const pinsNow = pinsRef.current;
    const a = pinsNow.find((p) => p.id === "m1") || { x: 0.22, y: 0.48 };
    const b = pinsNow.find((p) => p.id === "m2") || { x: 0.78, y: 0.48 };
    const kit = { m1: { x: a.x, y: a.y }, m2: { x: b.x, y: b.y } };
    const fromVid =
      vid && !vid.paused && vid.readyState >= 2 && vid.videoWidth > 8 ? readDoors(vid, kit) : null;
    const fromPic = pic && pic.naturalWidth > 8 ? readDoors(pic, kit) : null;
    const found = fromVid || fromPic;
    if (!found) return;
    const prev = doorHitRef.current;
    const jump =
      !prev ||
      Math.abs(prev.m1.w - found.m1.w) > 0.04 ||
      Math.abs(prev.m1.x - found.m1.x) > 0.05;
    const next = jump
      ? found
      : { m1: mixDoor(prev.m1, found.m1, 0.55), m2: mixDoor(prev.m2, found.m2, 0.55) };
    doorHitRef.current = next;
    setDoorHit(next);
  }

  function measurePic() {
    const root = layer.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const pic = img.current;
    const vid = visFilm();
    const ratio =
      pic && pic.naturalWidth > 8
        ? pic.naturalWidth / pic.naturalHeight
        : vid && vid.videoWidth > 8
          ? vid.videoWidth / vid.videoHeight
          : 9 / 16;
    setPicBox(filmBox(rect, ratio));
  }

  useEffect(() => {
    if (phase !== "play") return;
    measurePic();
    scanDoors();
    const onResize = () => measurePic();
    window.addEventListener("resize", onResize);
    const t = window.setInterval(() => {
      measurePic();
      scanDoors();
    }, 900);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, filmUrl, plate, beat]);

  useEffect(() => {
    const el = canvas.current;
    const root = layer.current;
    if (!el || !root) return;

    function fit() {
      const pic = img.current;
      const box = filmBox(
        root!.getBoundingClientRect(),
        (pic?.naturalWidth || 9) / (pic?.naturalHeight || 16),
      );
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el!.width = Math.max(1, Math.round(box.w * dpr));
      el!.height = Math.max(1, Math.round(box.h * dpr));
      el!.style.left = `${box.x}px`;
      el!.style.top = `${box.y}px`;
      el!.style.width = `${box.w}px`;
      el!.style.height = `${box.h}px`;
    }

    function snapPose() {
      const pic = img.current;
      const cv = canvas.current;
      if (!pic?.naturalWidth) return lastPose.current;
      const w = cv?.width || 720;
      const h = cv?.height || 1280;
      const out = document.createElement("canvas");
      out.width = w;
      out.height = h;
      const c = out.getContext("2d");
      if (!c) return lastPose.current;
      c.drawImage(pic, 0, 0, w, h);
      const x = bolt.current.x * w;
      const y = bolt.current.y * h;
      const r = Math.max(8, w * 0.016);
      c.save();
      c.shadowColor = "rgba(232,238,242,0.95)";
      c.shadowBlur = 22;
      c.beginPath();
      c.arc(x, y, r * 2.2, 0, Math.PI * 2);
      c.strokeStyle = "rgba(232,238,242,0.45)";
      c.lineWidth = 3;
      c.stroke();
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = "rgba(232,238,242,0.96)";
      c.fill();
      c.restore();
      const url = out.toDataURL("image/jpeg", 0.86);
      lastPose.current = url;
      return url;
    }

    function beginShot() {
      const url = snapPose();
      if (!url) return;
      setPose(url);
      setShots((s) => (s[s.length - 1] === url ? s : [...s, url]));
      beatRef.current = "shot";
      setBeat("shot");
      forgeClock.current = 0;
      sfxForge("enter");
    }

    function advanceForge() {
      const g = graphRef.current;
      if (!g) return;
      const q = forgeQueue(g);
      const next = forgedRef.current + 1;
      if (next >= q.length) {
        forgedRef.current = q.length;
        setForged(q.length);
        setNowClip(null);
        setPose(null);
        setBeat("idle");
        beatRef.current = "idle";
        if (!cookHasWalks(bank.current)) {
          setPhase("forge");
          phaseRef.current = "forge";
          setPlayFrameKind("fail");
          setFrost("walks failed · tap retry");
          return;
        }
        setPhase("play");
        phaseRef.current = "play";
        sfxForge("cook");
        return;
      }
      forgedRef.current = next;
      setForged(next);
      startClip(q[next]!);
    }

    function startClip(clip: RuneClip) {
      const g = graphRef.current;
      const list = g?.nodes ?? withSpawn(pinsRef.current);
      setNowClip(clip);
      nowClipRef.current = clip;
      setPose(null);
      forgeClock.current = 0;
      if (clip.kind === "idle") {
        const n = list.find((p) => p.id === clip.node);
        if (n) bolt.current = { x: n.x, y: n.y };
        setHere(clip.node);
        hereRef.current = clip.node;
        beatRef.current = "idle";
        setBeat("idle");
        walk.current = null;
        return;
      }
      const from = list.find((p) => p.id === clip.from);
      const to = list.find((p) => p.id === clip.to);
      if (from) {
        const d = Math.hypot(bolt.current.x - from.x, bolt.current.y - from.y);
        if (d > 0.03) bolt.current = { x: from.x, y: from.y };
      }
      if (from && to) {
        walk.current = {
          x0: bolt.current.x,
          y0: bolt.current.y,
          x1: to.x,
          y1: to.y,
          t: 0,
          dur: theaterMs(clip, walkSecsRef.current),
          to: clip.to,
        };
      }
      beatRef.current = "walk";
      setBeat("walk");
    }

    function stepWalk() {
      const moving = walk.current;
      if (!moving) return;
      const stepped = walkPos({ x: moving.x0, y: moving.y0 }, { x: moving.x1, y: moving.y1 }, moving.t, moving.dur);
      bolt.current = { x: stepped.x, y: stepped.y };
      if (stepped.k < 1) return;
      walk.current = null;
      setHere(moving.to);
      hereRef.current = moving.to;
      bolt.current = { x: moving.x1, y: moving.y1 };
      walkFace.current = standFace(moving.to);
      if (walkWait.current) {
        const done = walkWait.current;
        walkWait.current = null;
        done();
        return;
      }
      if (phaseRef.current === "forge") {
        beginShot();
        return;
      }
      const url = snapPose();
      if (url) {
        setPose(url);
        setShots((s) => [...s, url]);
        window.setTimeout(() => setPose(null), 420);
      }
      const q = queued.current;
      queued.current = null;
      if (q && q !== moving.to) goTo(q);
    }

    function stepForge(dt: number) {
      if (liveForge.current) return;
      if (phaseRef.current !== "forge") return;
      const g = graphRef.current;
      if (!g) return;
      if (walk.current) return;
      if (plateShot.current) {
        if (!lastPose.current) {
          const url = snapPose();
          if (url) {
            setPose(url);
            setShots([url]);
          }
        }
        forgeClock.current += dt * 1000;
        if (forgeClock.current >= SHOT_MS) {
          plateShot.current = false;
          const first = forgeQueue(g)[0];
          if (first) startClip(first);
          else if (!cookHasWalks(bank.current)) {
            setPhase("forge");
            phaseRef.current = "forge";
            setPlayFrameKind("fail");
            setFrost("walks failed · tap retry");
          } else {
            setPhase("play");
            phaseRef.current = "play";
          }
        }
        return;
      }
      const q = forgeQueue(g);
      const i = forgedRef.current;
      const clip = q[i];
      if (!clip) {
        setForged(q.length);
        setNowClip(null);
        setBeat("idle");
        beatRef.current = "idle";
        if (!cookHasWalks(bank.current)) {
          setPhase("forge");
          phaseRef.current = "forge";
          setPlayFrameKind("fail");
          setFrost("walks failed · tap retry");
          return;
        }
        setPhase("play");
        phaseRef.current = "play";
        sfxForge("cook");
        return;
      }
      forgeClock.current += dt * 1000;
      const beatNow = beatRef.current;
      if (beatNow === "walk") return;
      if (beatNow === "idle") {
        if (forgeClock.current >= theaterMs(clip, walkSecsRef.current)) advanceForge();
        return;
      }
      if (beatNow === "shot" && forgeClock.current >= SHOT_MS) advanceForge();
    }

    let last = performance.now();
    function draw(now: number) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const ctx = el!.getContext("2d");
      if (!ctx) {
        raf.current = window.requestAnimationFrame(draw);
        return;
      }
      if (walk.current) walk.current.t += dt * 1000;
      stepWalk();
      stepForge(dt);
      const w = el!.width;
      const h = el!.height;
      ctx.clearRect(0, 0, w, h);
      el!.dataset.bolt = `${bolt.current.x.toFixed(3)},${bolt.current.y.toFixed(3)}`;
      el!.dataset.face = walkFace.current;
      const root = el!.closest("[data-rune=engine]");
      if (root instanceof HTMLElement) root.dataset.face = walkFace.current;
      const ph = phaseRef.current;
      if (ph === "count" || ph === "refs") {
        raf.current = window.requestAnimationFrame(draw);
        return;
      }
      const list = withSpawn(pinsRef.current);
      if (ph === "play" && stockSprite.current) {
        if (walk.current || hereRef.current !== "spawn") hideBakedBolt(ctx, w, h);
        const moving = walk.current;
        const dist = moving ? Math.hypot(moving.x1 - moving.x0, moving.y1 - moving.y0) : 0;
        const gait = moving ? walkCycleCol(walkPos({ x: moving.x0, y: moving.y0 }, { x: moving.x1, y: moving.y1 }, moving.t, moving.dur).k, dist) : 0;
        drawBoltSprite(ctx, w, h, bolt.current, !!moving, now, walkFace.current, gait);
      } else if (beatRef.current !== "shot" && beatRef.current !== "playvid" && beatRef.current !== "cook") {
        if (ph !== "play") {
          drawGraph(ctx, w, h, list, graphRef.current, ph, nowClipRef.current, forgedRef.current, now);
          drawTravel(ctx, w, h, bolt.current, !!walk.current, now, beatRef.current === "idle");
        }
        for (const n of list) {
          if (n.id === "spawn") continue;
          drawMark(ctx, w, h, n, n.id === hereRef.current, n.id === litRef.current, ph);
        }
      }
      raf.current = window.requestAnimationFrame(draw);
    }

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    raf.current = window.requestAnimationFrame(draw);
    return () => {
      ro.disconnect();
      window.cancelAnimationFrame(raf.current);
    };
    // Restart when play mounts the canvas (path boot used to first-paint look).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === "play"]);

  function stockHallNow() {
    const idle = idleFor(hereRef.current);
    if (isHallFilm(idle?.url) || isHallFilm(plateRef.current) || isHallFilm(hallKeep.current)) return true;
    for (const clip of bank.current.values()) {
      if (isHallFilm(clip.url)) return true;
    }
    return false;
  }

  function stopStockWalk() {
    playTok.current += 1;
    const done = walkWait.current;
    walkWait.current = null;
    walk.current = null;
    playing.current = false;
    wrapping.current = false;
    if (done) done();
  }

  function hangDoorHall() {
    return hungHallLocksDoors({
      riftA: riftRef.current.m1,
      riftB: riftRef.current.m2,
      hungA: hungDoorReady("m1"),
      hungB: hungDoorReady("m2"),
      hangRoom: hangRoomRef.current,
    });
  }

  function goTo(id: string) {
    if (riftPickRef.current || riftDraftRef.current) return;
    if (entering.current) return;
    /* Leftover pointerup during the first-tap walk must not restart or enter. */
    if (
      (id === "m1" || id === "m2") &&
      walkingTo.current === id &&
      (playing.current || walk.current || beatRef.current === "playvid" || beatRef.current === "walk")
    ) {
      return;
    }
    if ((id === "m1" || id === "m2")) {
      const pending = readHangPending();
      const bind = hangBindHall(pending?.hall);
      const here = hangBindHall(hallHold.current);
      const sameCit = !pending?.citadel || pending.citadel === sid.current;
      if (pending?.id && bind && bind === here && sameCit) {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (now < hangGuard.current) return;
        const arts = hungArts.length ? hungArts : readArtifacts();
        const a = arts.find((x) => x.id === pending.id);
        if (a) {
          takeHangPending();
          beginRift(id, gateFromHung(a), bind);
          return;
        }
        writeHangPending(null);
      }
    }
    if ((id === "m1" || id === "m2") && hungDoorReady(id)) {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      /* Leftover Hang A / Door A after confirm must stay on hall N — not jump to FilmStage. */
      if (now < hangGuard.current) return;
      /* First tap walks. Second tap SAME door while breathing enters. Other door walks. */
      if (hungDoorTap(hereRef.current, id) === "enter") {
        void goEnter(id);
        return;
      }
    }
    if (phaseRef.current === "play") {
      const stock = stockHallNow();
      if (!stock && (playing.current || beatRef.current === "playvid" || beatRef.current === "walk")) {
        queued.current = id;
        return;
      }
      if (stock && (playing.current || walk.current || beatRef.current === "playvid" || beatRef.current === "walk")) {
        if (walkingTo.current === id) return;
        stopStockWalk();
      }
      liveForge.current = false;
      playing.current = false;
      wrapping.current = false;
      if ((id === "m1" || id === "m2") && hereRef.current === id) {
        /* destHall must not win — same unhung door stays in breath, never spawn snap. */
        if (hungDoorReady(id)) {
          void goEnter(id);
          return;
        }
        setLit(id);
        window.setTimeout(() => setLit(null), 280);
        holdIdle();
        return;
      }
      setEnterAsk(null);
      void playWalk(id);
      return;
    }
    if (
      liveForge.current ||
      phaseRef.current === "forge" ||
      playing.current ||
      beatRef.current === "playvid" ||
      beatRef.current === "cook"
    ) {
      queued.current = id;
      setFrost(`next · ${id}`);
      return;
    }
    wrapping.current = false;
    if ((id === "m1" || id === "m2") && hereRef.current === id && beatRef.current === "idle") {
      if (hungDoorReady(id)) {
        void goEnter(id);
        return;
      }
    }
    setEnterAsk(null);
    setFrost(`tap · ${id}`);
    void playWalk(id);
  }

  function drainQueue() {
    const next = queued.current;
    queued.current = null;
    if (next && next !== hereRef.current) void playWalk(next);
  }

  function outsFrom(from: string) {
    const ids = new Set<string>();
    for (const k of bank.current.keys()) {
      const full = /^(.+)←(.+)→(.+)$/.exec(k);
      if (full && full[1] === from) ids.add(full[3]!);
      const simple = /^([^←]+)→([^←]+)$/.exec(k);
      if (simple && simple[1] === from) ids.add(simple[2]!);
    }
    return [...ids];
  }

  function clipFor(from: string, to: string) {
    const via = cameFrom.current;
    const pick = (c: { url: string; end: string; start?: string } | undefined) => (c?.url ? c : null);
    return (
      pick(bank.current.get(`${from}←${via}→${to}`)) ??
      pick(bank.current.get(`${from}→${to}`)) ??
      pick([...bank.current.entries()].find(([k, v]) => v.url && k.startsWith(`${from}←`) && k.endsWith(`→${to}`))?.[1]) ??
      null
    );
  }

  function doorAt(nx: number, ny: number): string | null {
    return doorAtPoint(nx, ny, doorHitRef.current || STOCK_HITS, SPAWN);
  }

  function visFilm() {
    return useBRef.current ? filmB.current : film.current;
  }

  function hidFilm() {
    return useBRef.current ? film.current : filmB.current;
  }

  function cueSlot() {
    return hidFilm() || visFilm() || film.current;
  }

  function visSrc() {
    return slotSrc(visFilm());
  }

  function slotSrc(el: HTMLVideoElement | null) {
    return (el?.getAttribute("src") || el?.currentSrc || "").trim();
  }

  function warmUrl(url?: string | null) {
    if (!url) return;
    try {
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      v.playsInline = true;
      v.src = url;
    } catch {
      /* */
    }
  }

  function otherFrom(from: string) {
    if (from === "m1") return "m2";
    if (from === "m2") return "m1";
    return pathFirst.current || "m1";
  }

  function prefetchFrom(from: string, prefer?: string | null) {
    const hid = hidFilm();
    const vis = visFilm();
    const next = prefer || otherFrom(from);
    const targets = [next, ...outsFrom(from).filter((t) => t !== next)];
    for (const t of targets) warmUrl(clipFor(from, t)?.url);
    warmUrl(idleFor(from)?.url);
    const clip = targets.map((t) => clipFor(from, t)).find((c) => c?.url);
    if (!hid || !clip?.url) return;
    const hidNow = slotSrc(hid);
    const visNow = slotSrc(vis);
    if (hidNow === clip.url || visNow === clip.url) return;
    armSlot(hid, clip.url, false);
  }

  function notePaint(el: HTMLVideoElement) {
    if (el.videoWidth < 8 || el.readyState < 2) return;
    if (el === film.current) setPaintA(true);
    else if (el === filmB.current) setPaintB(true);
  }

  function armSlot(el: HTMLVideoElement | null, url: string, loop = false) {
    if (!el || !url) return;
    const now = (el.getAttribute("src") || el.currentSrc || "").trim();
    if (now !== url) {
      if (el === film.current) setPaintA(false);
      else if (el === filmB.current) setPaintB(false);
    }
    armFilm(el, url, loop);
  }

  function seekBreath(el: HTMLVideoElement | null) {
    if (!el) return;
    const d = el.duration;
    if (!Number.isFinite(d) || d < 1.2) return;
    const skip = idleSkip(d);
    try {
      if (Math.abs(el.currentTime - skip) > 0.12) el.currentTime = skip;
    } catch {
      /* */
    }
  }

  function cueBreath(el: HTMLVideoElement | null, url: string) {
    if (!el || !url) return;
    armSlot(el, url, true);
    const go = () => {
      seekBreath(el);
      void el.play().catch(() => {});
    };
    if (el.readyState >= 1 && Number.isFinite(el.duration) && el.duration > 0.6) go();
    else el.addEventListener("loadedmetadata", go, { once: true });
  }

  function filmHasPaint(el: HTMLVideoElement | null) {
    return !!(el && el.videoWidth > 8 && el.readyState >= 2);
  }

  function idleTrusted(clip?: { url: string; end: string } | null) {
    if (!clip?.url) return null;
    if (isBoltSilhouette(clip.url) || isBoltSilhouette(clip.end)) return null;
    if (isHallFilm(clip.url) || isHallFilm(clip.end)) return clip;
    if (isStockArt(clip.end) || isStockArt(clip.url)) return null;
    const hall = startHold.current || plateRef.current || "";
    if (hall && clip.end && isStockArt(clip.end)) return null;
    if (clip.url.includes("/ui/") || clip.end.includes("/refs/hall-doors")) return null;
    return clip;
  }

  function idleFor(node: string, via?: string) {
    const from = via || cameFrom.current;
    const fit = (k: string, v: { url: string; end: string }, keyed: boolean) => {
      if (!idleTrusted(v)) return false;
      if (keyed) return k === `idle-${node}←${from}` || k.startsWith(`idle-${node}←${from}#`);
      return k === `idle-${node}` || (/^idle-[A-Za-z0-9]+#\d+$/.test(k) && k.startsWith(`idle-${node}#`));
    };
    if (from) {
      const keyed = bank.current.get(`idle-${node}←${from}`);
      if (keyed && fit(`idle-${node}←${from}`, keyed, true)) return keyed;
      for (const [k, v] of bank.current) {
        if (fit(k, v, true)) return v;
      }
    }
    const direct = bank.current.get(`idle-${node}`);
    if (direct && fit(`idle-${node}`, direct, false)) return direct;
    for (const [k, v] of bank.current) {
      if (fit(k, v, false)) return v;
    }
    return null;
  }

  function breathStill(node: string, via?: string) {
    const from = via || cameFrom.current;
    const end = (c?: { url: string; end: string } | null) => walkLastFrameSeed(c?.end || "");
    return (
      (from ? end(bank.current.get(`idle-${node}←${from}`)) : "") ||
      end(bank.current.get(`idle-${node}`)) ||
      walkLastFrameSeed(refsMap.current.get(`pose-${node}`), lastLanded(node)) ||
      ""
    );
  }

  function stopFilm() {
    loadGen.current += 1;
    filmLoop.current = false;
    setFilmOn(false);
    setCoverFade(false);
    const vis = visFilm();
    if (vis) {
      vis.loop = false;
      try {
        vis.pause();
      } catch {
        /* */
      }
    }
  }

  function showIncoming() {
    const outgoing = visFilm();
    useBRef.current = !useBRef.current;
    setUseB(useBRef.current);
    if (outgoing) {
      outgoing.loop = false;
      try {
        outgoing.pause();
      } catch {
        /* */
      }
    }
  }

  function freezeVis(keep = false) {
    const el = visFilm();
    if (!el) return;
    try {
      el.pause();
      if (keep) return;
      const d = el.duration;
      if (Number.isFinite(d) && d > 0.2) {
        const t = Math.max(0, d - 0.05);
        if (el.currentTime < t - 0.02) el.currentTime = t;
      }
    } catch {
      try {
        el.pause();
      } catch {
        /* */
      }
    }
  }

  function stickCover(src?: string | null) {
    const u = usableStill(src);
    if (!u || isStockArt(u) || isBoltSilhouette(u)) return false;
    coverHold.current = u;
    lastLive.current = u;
    setLockCover(u);
    if (!filmHasPaint(visFilm())) setCoverFade(false);
    return true;
  }

  function lockHall(src?: string | null) {
    const u =
      firstStill([
        src,
        hallKeep.current,
        refsMap.current.get("hall"),
        refsMap.current.get("empty"),
        refsMap.current.get("room"),
        startHold.current,
        plateRef.current,
      ]) || hallKeep.current;
    if (!u) return "";
    hallKeep.current = durableStill(u) || hallKeep.current || u;
    startHold.current = hallKeep.current || u;
    plateRef.current = hallKeep.current || u;
    coverHold.current = hallKeep.current || u;
    lastLive.current = durableStill(src) || hallKeep.current || lastLive.current;
    setPlate(hallKeep.current || u);
    setCoverFade(false);
    setLockCover(hallKeep.current || u);
    if (sid.current) rememberHall(sid.current, hallKeep.current);
    return hallKeep.current || u;
  }

  function holdNow(extra?: string | null, keep = false) {
    freezeVis(keep);
    if (stickCover(extra)) return true;
    if (stickCover(refsMap.current.get("hall") || refsMap.current.get("empty") || startHold.current)) return true;
    if (stickCover(coverHold.current)) return true;
    if (stickCover(plateRef.current)) return true;
    const u = lockHall(extra);
    return !!u;
  }

  function liftCover(gen: number) {
    const t0 = Date.now();
    const wait = () => {
      if (playTok.current !== gen) return;
      const el = visFilm();
      if (filmHasPaint(el) && el && !el.paused) {
        wrapping.current = false;
        setFilmOn(true);
        setCoverFade(true);
        return;
      }
      if (Date.now() - t0 > 8000) {
        wrapping.current = false;
        if (filmHasPaint(visFilm())) {
          setFilmOn(true);
          setCoverFade(true);
        }
        return;
      }
      window.setTimeout(wait, 40);
    };
    window.setTimeout(wait, 20);
  }

  function stampLoop(el: HTMLVideoElement) {
    notePaint(el);
    if (el !== visFilm() || !filmLoop.current) return;
    const d = el.duration;
    if (!Number.isFinite(d) || d < 1.2) return;
    const t = el.currentTime;
    const skip = idleSkip(d);
    const hid = hidFilm();
    if (!wrapping.current && t > d - 0.55 && t < d - 0.08 && hid) {
      wrapping.current = true;
      const url = visSrc();
      if (url) armSlot(hid, url, true);
      const cue = () => {
        if (!filmLoop.current) return;
        try {
          if (Number.isFinite(hid.duration) && skip > 0 && Math.abs(hid.currentTime - skip) > 0.04) hid.currentTime = skip;
        } catch {
          /* */
        }
        void hid.play().catch(() => {});
      };
      if (hid.readyState >= 2 && (hid.getAttribute("src") || "").trim() === url) cue();
      else hid.addEventListener("loadeddata", cue, { once: true });
    }
    if (wrapping.current && hid && filmHasPaint(hid) && !hid.paused && hid.currentTime >= skip) {
      showIncoming();
      wrapping.current = false;
      setFilmOn(true);
      setCoverFade(true);
    }
  }

  function wrapLoop(_el: HTMLVideoElement) {
    /* stampLoop owns the idle seam */
  }

  function againLoop(el: HTMLVideoElement) {
    notePaint(el);
    if (el !== visFilm()) return;
    if (!filmLoop.current) {
      freezeVis(true);
      return;
    }
    const hid = hidFilm();
    const url = visSrc();
    if (hid && url) {
      wrapping.current = true;
      armSlot(hid, url, true);
      const skip = idleSkip(el.duration);
      const go = () => {
        try {
          hid.currentTime = skip;
        } catch {
          /* */
        }
        void hid.play().catch(() => {});
        const wait = () => {
          if (filmHasPaint(hid) && !hid.paused) {
            showIncoming();
            wrapping.current = false;
            setFilmOn(true);
            setCoverFade(true);
            return;
          }
          window.setTimeout(wait, 40);
        };
        window.setTimeout(wait, 30);
      };
      if (hid.readyState >= 2) go();
      else hid.addEventListener("loadeddata", go, { once: true });
      return;
    }
    try {
      el.currentTime = idleSkip(el.duration);
      void el.play().catch(() => {});
    } catch {
      /* */
    }
  }

  function startAtSkip(el: HTMLVideoElement, then: () => void) {
    const d = el.duration;
    if (filmLoop.current && !Number.isFinite(d)) {
      el.addEventListener("loadedmetadata", () => startAtSkip(el, then), { once: true });
      return;
    }
    const skipTo = filmLoop.current ? idleSkip(d) : 0;
    const play = () => {
      void el.play().catch(() => {});
      let n = 0;
      const tick = () => {
        if (filmHasPaint(el) && !el.paused) {
          then();
          return;
        }
        if (++n > 40) {
          then();
          return;
        }
        window.setTimeout(tick, 32);
      };
      window.setTimeout(tick, 16);
    };
    if (!skipTo || skipTo < 0.12 || !Number.isFinite(d)) {
      play();
      return;
    }
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      el.removeEventListener("seeked", go);
      play();
    };
    el.addEventListener("seeked", go);
    try {
      el.currentTime = skipTo;
    } catch {
      play();
      return;
    }
    window.setTimeout(go, 90);
  }

  function kickPlay(url: string, loop: boolean, skip = false) {
    const playUrl = playableClipSrc(url) || url;
    if (!playUrl) return;
    url = playUrl;
    const vis = visFilm();
    const hid = hidFilm();
    if (loop && visSrc() === url && filmHasPaint(vis) && filmLoop.current && vis && !vis.paused) {
      setFilmOn(true);
      setCoverFade(true);
      prefetchFrom(hereRef.current);
      return;
    }
    setLiving(loop ? "idle" : "walk", walkSecsRef.current);
    if (hid && slotSrc(hid) === url && filmHasPaint(hid)) {
      filmLoop.current = loop;
      skipIn.current = skip;
      setFilmUrl(url);
      setLoopOn(loop);
      hid.loop = false;
      if (loop) seekBreath(hid);
      void hid.play().catch(() => {});
      if (hid !== vis) showIncoming();
      setFilmOn(true);
      setCoverFade(true);
      prefetchFrom(hereRef.current);
      return;
    }
    if (vis && slotSrc(vis) === url && filmHasPaint(vis)) {
      filmLoop.current = loop;
      skipIn.current = skip;
      setFilmUrl(url);
      setLoopOn(loop);
      if (loop) seekBreath(vis);
      void vis.play().catch(() => {});
      setFilmOn(true);
      setCoverFade(true);
      prefetchFrom(hereRef.current);
      return;
    }
    const el = cueSlot();
    if (!el) return;
    const gen = playTok.current;
    const mine = ++loadGen.current;
    filmLoop.current = loop;
    skipIn.current = skip;
    setFilmUrl(url);
    setLoopOn(loop);
    const go = () => {
      if (loadGen.current !== mine) return;
      startAtSkip(el, () => {
        if (loadGen.current !== mine) return;
        if (!filmHasPaint(el)) return;
        if (el !== visFilm()) showIncoming();
        setFilmOn(true);
        setCoverFade(true);
        liftCover(gen);
        prefetchFrom(hereRef.current);
      });
    };
    armSlot(el, url, loop);
    const have = slotSrc(el) === url;
    if (have && el.readyState >= 2) {
      go();
      return;
    }
    el.addEventListener("loadeddata", go, { once: true });
  }

  function playStockWalk(from: string, to: string, dest: { x: number; y: number }) {
    return new Promise<void>((resolve) => {
      const at = bolt.current;
      const myTok = playTok.current;
      walkFace.current = facingOf(dest.x - at.x, dest.y - at.y);
      const dur = Math.max(1400, Math.min(2400, walkMs({ id: from, name: from, x: at.x, y: at.y }, { id: to, name: to, x: dest.x, y: dest.y }) + 400));
      stockSprite.current = true;
      filmLoop.current = true;
      walk.current = { x0: at.x, y0: at.y, x1: dest.x, y1: dest.y, t: 0, dur, to };
      walkWait.current = () => resolve();
      sheetOf("walk");
      sheetOf("idle");
      setLiving("walk", Math.max(6, Math.round(dur / 1000) as 6 | 10 | 15));
      window.setTimeout(() => {
        if (playTok.current !== myTok) return;
        if (walkWait.current) {
          walk.current = null;
          bolt.current = { x: dest.x, y: dest.y };
          walkFace.current = standFace(to);
          const done = walkWait.current;
          walkWait.current = null;
          done();
        }
      }, dur + 80);
    });
  }

  function replayWalk(url: string, maxMs: number) {
    return new Promise<void>((resolve) => {
      const vis = visFilm();
      if (!vis || !url) {
        resolve();
        return;
      }
      setLiving("walk", walkSecsRef.current);
      filmLoop.current = false;
      skipIn.current = false;
      vis.loop = false;
      const gen = playTok.current;
      const mine = ++loadGen.current;
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        vis.removeEventListener("ended", done);
        vis.removeEventListener("timeupdate", onTime);
        window.clearTimeout(t);
        resolve();
      };
      const onTime = () => {
        if (loadGen.current !== mine || playTok.current !== gen) return;
        const d = vis.duration;
        if (Number.isFinite(d) && d - vis.currentTime <= 0.14) done();
      };
      vis.addEventListener("ended", done);
      vis.addEventListener("timeupdate", onTime);
      try {
        if (vis.currentTime > 0.04) vis.currentTime = 0;
      } catch {
        /* */
      }
      void vis.play().catch(() => {});
      setFilmUrl(url);
      setLoopOn(false);
      setFilmOn(true);
      setCoverFade(true);
      const t = window.setTimeout(done, maxMs);
    });
  }

  function livingNow(): LivingPlayFrame {
    return livingPlayFrame({
      bank: bank.current,
      hall: lookHall.current || refsMap.current.get("hall") || hallKeep.current,
      empty: refsMap.current.get("empty"),
      start: startHold.current,
      plate: plateRef.current,
      placed: refsMap.current.get("placed"),
      seed: refsMap.current.get("seed"),
      room: refsMap.current.get("room"),
    });
  }

  function holdIdle() {
    if (sprintHold.current) return;
    wrapping.current = false;
    playing.current = false;
    setBeat("idle");
    beatRef.current = "idle";
    setFrost(phaseRef.current === "play" ? "" : "tap a door");
    idleArmed.current = true;
    const frame = livingNow();
    const seedBolt = isBoltSilhouette(refsMap.current.get("seed")) || isBoltSilhouette(refsMap.current.get("placed"));
    const idle = seedBolt ? null : idleFor(hereRef.current);
    walkFace.current = standFace(hereRef.current);
    if (isHallFilm(idle?.url) && hereRef.current !== "spawn") stockSprite.current = true;
    else if (hereRef.current === "spawn") stockSprite.current = false;
    if (hereRef.current === "spawn" && frame.still && !isBoltSilhouette(frame.still)) {
      lockHall(frame.still);
    }
    const walkHere = clipFor(cameFrom.current, hereRef.current)?.url || "";
    const breathUrl = doorBreathPlayable(idle, walkHere)
      ? idle!.url
      : hereRef.current === "spawn"
        ? idle?.url || frame.url || ""
        : "";
    /* Arrival breath must loop a real idle-* clip (not the walk, not stock HALL_LOOP). */
    if (breathUrl) {
      if (isHallFilm(breathUrl) && hereRef.current !== "spawn") stockSprite.current = true;
      setPose(null);
      filmLoop.current = true;
      setLoopOn(true);
      setPlayFrameKind("breath");
      kickPlay(breathUrl, true, true);
      return;
    }
    if (hereRef.current === "spawn" && frame.url && frame.playFrame === "breath") {
      filmLoop.current = true;
      setLoopOn(true);
      setPlayFrameKind("breath");
      kickPlay(frame.url, true, true);
      return;
    }
    if (hereRef.current === "spawn" && frame.playFrame === "walk") {
      setPlayFrameKind("hall");
    } else if (phaseRef.current === "play") {
      setPlayFrameKind(frame.playFrame === "fail" ? "hall" : frame.playFrame || "hall");
    }
    freezeVis(true);
    filmLoop.current = false;
    setLoopOn(false);
    if (filmHasPaint(visFilm()) && filmUrl && !isBoltSilhouette(filmUrl)) {
      setFilmOn(true);
      setCoverFade(true);
    }
    prefetchFrom(hereRef.current);
    setLiving("idle");
  }

  async function playEnterThenIdle() {
    const clip = bank.current.get("enter→spawn");
    if (!clip?.url) {
      holdIdle();
      return;
    }
    wrapping.current = false;
    playing.current = true;
    setLoopOn(false);
    setBeat("playvid");
    beatRef.current = "playvid";
    setFrost("enter");
    setFilmUrl(clip.url);
    await sleep(60);
    await Promise.race([playFilm(clip.url, 7200, startHold.current || plateRef.current || clip.end, clip.end, false), sleep(7200)]);
    playing.current = false;
    setHere("spawn");
    hereRef.current = "spawn";
    holdNow();
    if (clip.end) {
      setPlate(clip.end);
      plateRef.current = clip.end;
    }
    holdIdle();
  }

  async function playWalk(id: string) {
    const list = withSpawn(pinsRef.current);
    const at = hereRef.current;
    if (id === at) {
      if ((id === "m1" || id === "m2") && beatRef.current === "idle" && hungDoorReady(id)) {
        void goEnter(id);
        return;
      }
      setLit(id);
      window.setTimeout(() => setLit(null), 280);
      holdIdle();
      return;
    }
    const pin =
      list.find((n) => n.id === id) ||
      (id === "m1" ? { id: "m1", name: "teal", x: 0.22, y: 0.48 } : id === "m2" ? { id: "m2", name: "gold", x: 0.78, y: 0.48 } : null);
    if (!pin) {
      setFrost("no door");
      return;
    }
    walkingTo.current = id;
    const idleNow = idleFor(at);
    if (doorBreathPlayable(idleNow)) {
      const breathEnd = await shotEnd(idleNow!.url, breathStill(at) || lastLive.current || "");
      const keep = walkLastFrameSeed(breathEnd) || breathEnd;
      if (keep) {
        refsMap.current.set(`pose-${at}`, keep);
        lastLive.current = keep;
        lastPose.current = keep;
        bank.current.set(`idle-${at}`, { url: idleNow!.url, end: keep, start: idleNow!.end });
        const viaIdle = cameFrom.current && cameFrom.current !== at ? cameFrom.current : "start";
        bank.current.set(`idle-${at}←${viaIdle}`, { url: idleNow!.url, end: keep, start: idleNow!.end });
      }
    }
    const seed = walkLastFrameSeed(
      breathStill(at),
      startFromPrev(at),
      refsMap.current.get(`pose-${at}`),
      lastLive.current,
      lastPose.current,
    );
    let clip = clipFor(at, id);
    if (!clip || !walkClipHoldsSeed(clip, seed)) {
      const stock = stockDoorWalk(at, id);
      if (stock && !seed) {
        clip = clip || stock;
        bank.current.set(`${at}→${id}`, stock);
      } else {
        setFrost(`cook · ${at} → ${id}`);
        clip = (await forgeWalkNow(at, id)) || clip;
      }
    }
    if (!clip) {
      walkingTo.current = "";
      setFrost("no film that way");
      setLit(id);
      window.setTimeout(() => setLit(null), 700);
      holdIdle();
      return;
    }
    const stock = isHallFilm(clip.url);
    const stand = stock ? stockStand(id) : { x: pin.x, y: pin.y };
    const to = { id: pin.id, name: pin.name, x: stand.x, y: stand.y };
    const token = ++playTok.current;
    wrapping.current = false;
    filmLoop.current = false;
    playing.current = true;
    queued.current = null;
    setLoopOn(false);
    setLit(id);
    setBeat("playvid");
    beatRef.current = "playvid";
    setFilmUrl(clip.url);
    setFrost(phaseRef.current === "play" ? "" : `walk · ${at} → ${id}`);
    markLivePlay(sid.current, at, plateRef.current || lastLive.current || clip.end || "");
    sfxForge("page");
    const nextIdle = idleFor(id, at);
    const breathUrl = doorBreathPlayable(nextIdle, clip.url) ? nextIdle!.url : null;
    const wait = (clampWalk(walkSecsRef.current) + 4) * 1000;
    if (stock) {
      stockSprite.current = true;
      walkFace.current = facingOf(to.x - bolt.current.x, to.y - bolt.current.y);
      await playStockWalk(at, id, to);
    } else {
      stockSprite.current = false;
      const vis = visFilm();
      const sameLoop = !!(vis && slotSrc(vis) === clip.url && filmHasPaint(vis));
      await Promise.race([
        sameLoop
          ? replayWalk(clip.url, wait)
          : playFilm(clip.url, wait, seed || lastLive.current || plateRef.current, clip.end, true, breathUrl),
        sleep(wait),
      ]);
    }
    if (token !== playTok.current) {
      if (walkingTo.current === id) walkingTo.current = "";
      return;
    }
    setHere(id);
    hereRef.current = id;
    cameFrom.current = at;
    bolt.current = { x: to.x, y: to.y };
    walkFace.current = standFace(id);
    const stampDoorEnd = (end: string) => {
      const keep = walkLastFrameSeed(end, lastPose.current, refsMap.current.get(`pose-${id}`)) || end;
      if (!keep) return;
      bank.current.set(`${at}→${id}`, { url: clip.url, end: keep, start: clip.start || seed });
      const via = at === "spawn" ? "start" : at;
      bank.current.set(`${at}←${via}→${id}`, { url: clip.url, end: keep, start: clip.start || seed });
      refsMap.current.set(`pose-${id}`, keep);
      if (walkLastFrameSeed(keep)) {
        lastLive.current = keep;
        lastPose.current = keep;
      }
      const idleHave = bank.current.get(`idle-${id}`);
      if (idleHave?.url) {
        bank.current.set(`idle-${id}←${at}`, { url: idleHave.url, end: walkLastFrameSeed(keep, idleHave.end) || idleHave.end });
        if (isStockHallClip(idleHave) && walkLastFrameSeed(keep)) {
          bank.current.set(`idle-${id}`, { url: idleHave.url, end: keep });
        }
      }
    };
    stampDoorEnd(clip.end || lastLive.current || plateRef.current || "");
    let landed = walkLastFrameSeed(clip.end, lastLive.current, refsMap.current.get(`pose-${id}`), lastPose.current) || clip.end || lastLive.current || plateRef.current || "";
    const haveBreath = doorBreathPlayable(idleFor(id, at), clip.url);
    if (!haveBreath && !isHallFilm(clip.url)) {
      landed = await shotEnd(clip.url, landed || lastLive.current || plateRef.current || "");
      stampDoorEnd(landed);
    } else if (!isHallFilm(clip.url)) {
      void shotEnd(clip.url, clip.end || lastLive.current || plateRef.current || "").then((got) => {
        if (hereRef.current !== id) return;
        stampDoorEnd(got);
      });
    }
    setPose(null);
    setLit(null);
    playing.current = false;
    idleArmed.current = true;
    walkingTo.current = "";
    markLivePlay(sid.current, id, hallKeep.current || undefined);
    persist({ phase: "play", here: id, cameFrom: at, plate: walkLastFrameSeed(lastLive.current, plateRef.current) || plateRef.current });
    const next = queued.current;
    queued.current = null;
    if (id === "m1" || id === "m2") {
      if (skipAsk.current !== id) {
        skipAsk.current = "";
        if (hungDoorReady(id)) {
          /* Breath / hold at hung door. No chrome Enter. Second tap same door enters. */
          void prefetchExit(id);
        }
      }
    } else {
      skipAsk.current = "";
      setEnterAsk(null);
    }
    if (next && next !== id) {
      playTok.current += 1;
      void playWalk(next);
      return;
    }
    playTok.current += 1;
    setBeat("idle");
    beatRef.current = "idle";
    setFrost("tap a door");
    const shown = await enterDoorBreath(id, at, clip.url, landed);
    if (!shown) holdIdle();
  }

  /** Cook idle-* from landed still when bank has no visible door breath, then kickPlay loop. */
  async function enterDoorBreath(node: string, via: string, walkUrl: string, landed: string) {
    let idle = idleFor(node, via) || bank.current.get(`idle-${node}`);
    if (!doorBreathPlayable(idle, walkUrl)) {
      const seed = walkLastFrameSeed(landed, lastLive.current, refsMap.current.get(`pose-${node}`)) || landed;
      if (!seed) return false;
      await cookIdleAt(node, seed, walkUrl, via, true);
      idle = idleFor(node, via) || bank.current.get(`idle-${node}`);
    }
    if (!doorBreathPlayable(idle, walkUrl) || !idle?.url) return false;
    filmLoop.current = true;
    setLoopOn(true);
    setPlayFrameKind("breath");
    setPose(null);
    const hid = hidFilm();
    if (hid && slotSrc(hid) === idle.url && filmHasPaint(hid)) {
      cueBreath(hid, idle.url);
      if (hid !== visFilm()) showIncoming();
      setFilmOn(true);
      setCoverFade(true);
      prefetchFrom(node);
      return true;
    }
    kickPlay(idle.url, true, true);
    return true;
  }

  async function saveFilms() {
    persist({ phase: "play", plate: plateRef.current, here: hereRef.current, cameFrom: cameFrom.current });
    const href = `${window.location.origin}/rune?session=${encodeURIComponent(sid.current)}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Bolt citadel", text: "Play this citadel", url: href });
        setFrost("shared");
        return;
      } catch {
        setFrost("tap a door · you are in the game");
        return;
      }
    }
    setFrost("tap a door · you are in the game");
  }

  async function saveMp4() {
    const seen = new Set<string>();
    const clips: { name: string; url: string }[] = [];
    for (const [k, v] of bank.current) {
      if (!v.url || seen.has(v.url)) continue;
      if (k.startsWith("idle-")) {
        seen.add(v.url);
        clips.push({ name: `bolt-breathe-${k.slice(5)}.mp4`, url: v.url });
        continue;
      }
      const m = /^([^←]+)→([^←]+)$/.exec(k);
      if (!m) continue;
      seen.add(v.url);
      clips.push({ name: `bolt-${m[1]}-${m[2]}.mp4`, url: v.url });
    }
    if (!clips.length) {
      setFrost("no films");
      return;
    }
    setFrost(`mp4 · ${clips.length}`);
    for (const c of clips) {
      try {
        const res = await fetch(c.url);
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = c.name;
        a.click();
        await sleep(450);
      } catch {
        window.open(c.url, "_blank");
      }
    }
    setFrost("mp4 saved");
  }

  function lastLanded(id: string) {
    let hit = "";
    for (const [k, v] of bank.current) {
      if (!v.end || k.includes("←") || k.startsWith("idle-")) continue;
      if (k.endsWith(`→${id}`)) hit = v.end;
    }
    return hit;
  }

  function nodeStill(id: string) {
    const breath = breathStill(id) || bank.current.get(`idle-${id}`)?.end || "";
    if (id === "spawn") {
      return breath || lastLanded("spawn") || refsMap.current.get("pose-spawn") || startHold.current || refsMap.current.get("seed") || plateRef.current;
    }
    return breath || lastLanded(id) || refsMap.current.get(`pose-${id}`) || refsMap.current.get("seed") || plateRef.current;
  }

  function clipLabel(k: string) {
    const take = k.match(/#(\d+)$/);
    const core = k.replace(/#\d+$/, "");
    let label = core;
    if (core.startsWith("still-")) label = `still ${core.slice(6).replace("m1", "A").replace("m2", "B").replace("spawn", "start")}`;
    else if (core.startsWith("idle-")) label = `breathe ${core.slice(5).replace("m1", "A").replace("m2", "B").replace("spawn", "start")}`;
    else label = core.replace("spawn", "start").replace("m1", "A").replace("m2", "B");
    return take ? `${label} · ${take[1]}` : label;
  }

  function baseKey(k: string) {
    return k.replace(/#\d+$/, "");
  }

  function nextAlt(base: string) {
    const live = bank.current.get(base);
    if (live?.url && !bank.current.get(`${base}#1`)) bank.current.set(`${base}#1`, { url: live.url, end: live.end });
    let n = 2;
    while (bank.current.has(`${base}#${n}`)) n += 1;
    return `${base}#${n}`;
  }

  function useTake(k: string) {
    const base = baseKey(k);
    const hit = bank.current.get(k);
    if (!hit?.url) return;
    bank.current.set(base, { url: hit.url, end: hit.end });
    if (base.includes("→") && !base.startsWith("enter") && !base.includes("←")) {
      const [from, to] = base.split("→");
      bank.current.set(`${from}←${from === "spawn" ? "start" : from}→${to}`, { url: hit.url, end: hit.end });
      if (hit.end && to) refsMap.current.set(`pose-${to}`, hit.end);
    }
    sfxForge("enter");
    setFrost("using this take");
    syncWalks();
    persist({ phase: "play" });
  }

  function takeNo(k: string) {
    const m = k.match(/#(\d+)$/);
    return m ? Number(m[1]) : 1;
  }

  function startFromPrev(from: string) {
    let pick: { n: number; end: string } | null = null;
    for (const [k, v] of bank.current) {
      if (!v.end) continue;
      const core = baseKey(k);
      if (!core.includes("→") || core.includes("←") || core.startsWith("enter")) continue;
      if ((core.split("→")[1] || "") !== from) continue;
      const n = takeNo(k);
      if (!pick || n >= pick.n) pick = { n, end: v.end };
    }
    return pick?.end || nodeStill(from);
  }

  function syncWalks() {
    const list = [...bank.current.keys()]
      .filter((k) => k.includes("→") && !k.includes("←") && !k.includes("#") && !k.startsWith("enter"))
      .map((k) => {
        const [from, to] = k.split("→");
        return { key: k, from: from || "", to: to || "" };
      });
    setWalksUI(list);
    setNeedStill(!(bank.current.has("idle-spawn") && bank.current.has("idle-m1") && bank.current.has("idle-m2")));
    const seen = new Set<string>();
    const clips: { key: string; label: string; kind: "walk" | "breathe" | "still"; url: string; end: string }[] = [];
    for (const id of ["spawn", "m1", "m2"] as const) {
      const src = nodeStill(id);
      if (!src || seen.has(src)) continue;
      seen.add(`still:${id}`);
      clips.push({ key: `still-${id}`, label: clipLabel(`still-${id}`), kind: "still", url: "", end: src });
    }
    for (const [k, v] of bank.current) {
      if (!v.url || seen.has(v.url)) continue;
      if (k.startsWith("idle-")) {
        seen.add(v.url);
        clips.push({ key: k, label: clipLabel(k), kind: "breathe", url: v.url, end: v.end });
        continue;
      }
      if (k.includes("→") && !k.includes("←")) {
        seen.add(v.url);
        clips.push({ key: k, label: clipLabel(k), kind: "walk", url: v.url, end: v.end });
      }
    }
    setClipsUI(clips);
  }

  async function saveOne(url: string, name: string) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name.endsWith(".mp4") ? name : `${name.replace(/\s+/g, "-")}.mp4`;
      a.rel = "noopener";
      a.click();
      setFrost("saved");
    } catch {
      window.open(url, "_blank");
    }
  }

  function playOne(url: string, end: string, name = "clip") {
    setLook({
      id: name,
      name,
      src: end || "",
      url: url || undefined,
    });
  }

  function hungDoorReady(door: "m1" | "m2"): boolean {
    const enter = resolveHungEnter(doorLetterOf(door), hallHold.current, sid.current, readArtifacts(), riftRef.current);
    return enter.kind === "biome";
  }

  async function goHungHall(n: number, idle = true) {
    if (n < 1 || n > 8) return;
    const bind = hangBindHall(n);
    if (!bind) return;
    if (bind === hallHold.current && phaseRef.current === "play" && (bank.current.size || hallsHold.current.find((h) => h.n === bind)?.bank?.length)) {
      setLiveHall(bind);
      hangRoomRef.current = bind;
      setHangRoomN(bind);
      return;
    }
    rememberSlice(snapHall());
    /* Hall N is h.n === N — never hallsHold[n-1] (last-hung 8 at index 2). */
    let slice = hallsHold.current.find((h) => h.n === bind);
    const live = hallsHold.current.find((h) => h.n === hallHold.current);
    const hintStill =
      (liveHangRooms.find((r) => r.hall === bind)?.still || "") ||
      listStoredHallHints(sid.current).find((h) => h.hall === bind)?.still ||
      "";
    if (!slice) {
      const first = pathFirst.current || "m1";
      const walks = (live?.bank || []).length ? live!.bank : stockRoomBank(first).map((b) => ({ key: b.key, url: b.url, end: b.end }));
      const still = hintStill || live?.still || live?.plate || plateRef.current || startHold.current || HALL_STILL;
      slice = {
        n: bind,
        still,
        start: still,
        plate: still,
        bank: walks.map((b) => ({ ...b })),
        refs: live?.refs || refsHold.current,
        pins: live?.pins || pinsRef.current,
        via: live?.via,
      };
    }
    const filled =
      hintStill ||
      slice.still ||
      live?.still ||
      live?.plate ||
      plateRef.current ||
      startHold.current ||
      HALL_STILL;
    if (!slice.still || (hintStill && /citadel-tour|\/ui\/citadel/i.test(slice.still))) {
      slice = { ...slice, n: bind, still: filled, start: slice.start || filled, plate: slice.plate || filled };
    }
    if (!(slice.bank || []).length) {
      const first = pathFirst.current || "m1";
      slice = {
        ...slice,
        n: bind,
        bank: stockRoomBank(first).map((b) => ({ key: b.key, url: b.url, end: b.end })),
      };
    }
    hallsHold.current = putSlice(hallsHold.current, { ...slice, n: bind });
    applyHall({ ...slice, n: bind }, false);
    hangRoomRef.current = bind;
    setHangRoomN(bind);
    setLiveHall(bind);
    roomsHold.current = Math.max(roomsHold.current, bind, hallsHold.current.length);
    persist({
      hall: bind,
      rooms: roomsHold.current,
      halls: hallsHold.current,
      plate: plateRef.current,
      start: startHold.current,
      phase: "play",
    });
    setPhase("play");
    phaseRef.current = "play";
    armed.current = true;
    if (idle && !sprintHold.current) holdIdle();
  }

  function destHall(door: "m1" | "m2"): number {
    const n = hallN(nextHold.current[door]);
    if (n && n !== hallHold.current) return n;
    const slice = hallsHold.current[hallHold.current - 1];
    const mapped = slice?.next?.[door];
    if (mapped && mapped !== hallHold.current) return mapped;
    if (riftRef.current[door]) return 0;
    const nxt = hallsHold.current[hallHold.current];
    if (nxt && (nxt.via === door || !nxt.via)) return nxt.n;
    if (hallHold.current > 1 && (viaHold.current === door || !viaHold.current)) return hallHold.current - 1;
    return 0;
  }

  function snapHall(n = hallHold.current): HallSlice {
    return liveSlice(
      {
        hall: n,
        start: startHold.current,
        plate: plateRef.current,
        thumb: hallKeep.current || "",
        here: hereRef.current,
        cameFrom: cameFrom.current,
        bank: [...bank.current].map(([key, v]) => ({ key, url: v.url, end: v.end, start: v.start })),
        refs: refsHold.current,
        pins: pinsRef.current,
        forged: forgedRef.current,
        walkSecs: walkSecsRef.current,
        rift: riftRef.current.m1 || riftRef.current.m2 ? { ...riftRef.current } : undefined,
        via: viaHold.current || undefined,
        next: nextHold.current,
      },
      n,
    );
  }

  function rememberSlice(slice: HallSlice) {
    hallsHold.current = putSlice(hallsHold.current, slice);
    roomsHold.current = Math.max(1, hallsHold.current.length);
  }

  function applyHall(slice: HallSlice, playEnter = false) {
    hallHold.current = slice.n;
    hangRoomRef.current = slice.n;
    setHangRoomN(slice.n);
    setLiveHall(slice.n);
    viaHold.current = slice.via || "";
    const m1 = slice.next?.m1 ? String(slice.next.m1) : undefined;
    const m2 = slice.next?.m2 ? String(slice.next.m2) : undefined;
    nextHold.current = { ...(m1 ? { m1 } : {}), ...(m2 ? { m2 } : {}) };
    fromHold.current = slice.n > 1 ? sid.current : "";
    const still = slice.start || slice.plate || slice.still || hallKeep.current || HALL_FALLBACK;
    startHold.current = slice.start || still;
    plateRef.current = slice.plate || still;
    setPlate(plateRef.current);
    hallKeep.current = plateRef.current;
    lockHall(plateRef.current);
    rememberHall(sid.current, plateRef.current);
    bank.current = new Map((slice.bank || []).filter((b) => b?.key && b.url).map((b) => [b.key, { url: b.url, end: b.end || "", start: b.start }]));
    refsHold.current = forgeTrayRefs(slice.refs || []);
    refsMap.current = new Map(refsHold.current.map((r) => [r.id, r.src]));
    setRefs(refsHold.current);
    pinsRef.current = slice.pins || [];
    setPins(pinsRef.current);
    forgedRef.current = slice.forged || 0;
    setForged(forgedRef.current);
    if (slice.walkSecs) {
      const dur = clampWalk(slice.walkSecs);
      walkSecsRef.current = dur;
      setWalkSecs(dur);
    }
    const restored = hydrateRift(sid.current, slice.n, slice.rift || {}, readArtifacts());
    riftRef.current = restored;
    setRift(restored);
    const g = compileCitadel(plateRef.current || HALL_FALLBACK, pinsRef.current, walkSecsRef.current);
    setGraph(g);
    graphRef.current = g;
    const keepDoor = !playEnter && phaseRef.current === "play" && (hereRef.current === "m1" || hereRef.current === "m2");
    const hereNow = playEnter ? SPAWN.id : keepDoor ? hereRef.current : slice.here || SPAWN.id;
    setHere(hereNow);
    hereRef.current = hereNow;
    cameFrom.current = playEnter ? "enter" : slice.cameFrom || "start";
    const node = withSpawn(pinsRef.current).find((p) => p.id === hereNow);
    bolt.current = node ? { x: node.x, y: node.y } : { x: SPAWN.x, y: SPAWN.y };
    skipEnter.current = !playEnter;
    setEnterAsk(null);
    setHallsOn(false);
    syncWalks();
  }

  async function switchHall(n: number, playEnter = false) {
    if (n < 1 || n > 8 || n === hallHold.current) {
      if (n === hallHold.current) holdIdle();
      return;
    }
    rememberSlice(snapHall());
    const slice = hallsHold.current[n - 1];
    if (!slice) return;
    stopFilm();
    setFilmUrl(null);
    playing.current = false;
    applyHall(slice, playEnter);
    persist({
      phase: "play",
      hall: n,
      rooms: hallsHold.current.length,
      halls: hallsHold.current,
      plate: plateRef.current,
      start: startHold.current,
    });
    setPhase("play");
    phaseRef.current = "play";
    armed.current = true;
    setFrost(playEnter ? "enter" : "tap a door");
    sfxForge("enter");
    if (playEnter) await playEnterThenIdle();
    else holdIdle();
  }

  function hallLine() {
    const halls = hallsHold.current.length ? hallsHold.current : [{ n: hallHold.current || 1, still: "", bank: [], refs: [], pins: [] }];
    const line: { kind: "room" | "gate"; id: string; n: number; from?: string }[] = [];
    for (const h of halls) {
      if (h.n > 1) line.push({ kind: "gate", id: String(h.n), n: h.n - 1, from: String(h.n - 1) });
      line.push({ kind: "room", id: String(h.n), n: h.n });
    }
    return line;
  }

  async function goHall(id: string) {
    setHallsOn(false);
    const n = hallN(id);
    if (n) {
      await switchHall(n, false);
      return;
    }
    if (id === sid.current) return;
    persist({ phase: "play" });
    await openSession(id, true);
  }

  async function goGate(childId: string, parentId?: string) {
    setHallsOn(false);
    const n = hallN(childId);
    if (n) {
      await switchHall(n, true);
      return;
    }
    let url = "";
    let end = "";
    const local =
      bank.current.get("exit-m1") ||
      bank.current.get("exit-m2") ||
      bank.current.get("enter→spawn");
    if (sid.current === parentId && local?.url) {
      url = local.url;
      end = local.end || "";
    }
    if (url) {
      playOne(url, end, "transition");
      return;
    }
    setFrost("tap door twice to enter");
  }

  async function playAll() {
    if (liveForge.current || playing.current) return;
    playing.current = true;
    setReelOn(false);
    setTray(false);
    setEditOn(false);
    const seq: { label: string; url: string; end: string }[] = [];
    const spawnIdle = bank.current.get("idle-spawn");
    if (spawnIdle?.url) seq.push({ label: "breathe start", url: spawnIdle.url, end: spawnIdle.end });
    for (const w of walksUI) {
      const walk = bank.current.get(w.key);
      if (walk?.url) seq.push({ label: clipLabel(w.key), url: walk.url, end: walk.end });
      const idle = bank.current.get(`idle-${w.to}`);
      if (idle?.url) seq.push({ label: clipLabel(`idle-${w.to}`), url: idle.url, end: idle.end });
    }
    for (const s of seq) {
      if (dead.current) break;
      setFrost(s.label);
      setBeat("playvid");
      beatRef.current = "playvid";
      setFilmUrl(s.url);
      await playFilm(s.url, 14000, s.end);
    }
    setFilmUrl(null);
    setBeat("idle");
    beatRef.current = "idle";
    setFrost("tap a door");
    playing.current = false;
    holdIdle();
  }

  function forgeOther() {
    const now = pathFirst.current;
    if (!now) return;
    const next = otherDoor(now);
    extraPath.current = true;
    pathFirst.current = next;
    const g = graphRef.current;
    if (!g) return;
    setNeedOther(false);
    setPhase("forge");
    phaseRef.current = "forge";
    liveForge.current = true;
    sfxForge("cook");
    void cookWalks(g, true).catch(() => failStay("forge paused · tap retry"));
  }

  async function cookIdles() {
    setNeedStill(false);
    setEditOn(false);
    setPhase("forge");
    phaseRef.current = "forge";
    liveForge.current = true;
    sfxForge("cook");
    const spots = ["spawn", "m1", "m2"] as const;
    for (const n of spots) {
      if (!liveForge.current) return;
      const still = nodeStill(n);
      if (!still) continue;
      await cookIdleAt(n, still);
    }
    liveForge.current = false;
    setPhase("play");
    phaseRef.current = "play";
    setBeat("idle");
    beatRef.current = "idle";
    setFilmUrl(null);
    setFrost("tap a door");
    syncWalks();
    persist({ phase: "play", plate: plateRef.current });
    holdIdle();
  }

  async function forgeWalkNow(from: string, to: string): Promise<{ url: string; end: string } | null> {
    const list = withSpawn(pinsRef.current);
    const a = list.find((n) => n.id === from) || (from === "spawn" ? SPAWN : null);
    const b = list.find((n) => n.id === to);
    if (!a || !b || from === to) return null;
    liveForge.current = true;
    setBeat("cook");
    beatRef.current = "cook";
    setLoadName(`${from} → ${to}`);
    setLoadPct(8);
    setFrost(`cook · ${from} → ${to}`);
    sfxForge("cook");
    const fromStill =
      walkLastFrameSeed(breathStill(from), startFromPrev(from), nodeStill(from), lastLive.current, lastPose.current) ||
      breathStill(from) ||
      startFromPrev(from) ||
      nodeStill(from) ||
      hallKeep.current ||
      startHold.current;
    if (!fromStill) {
      liveForge.current = false;
      setBeat("idle");
      beatRef.current = "idle";
      return null;
    }
    const home = breathStill(to) || bank.current.get(`idle-${to}`)?.end || "";
    const kit = home && home !== fromStill ? [home] : [];
    const url = await cookFilm(
      fromStill,
      walkPrompt(a, b, from === "spawn", [gazeLaw(to), brainLaws()].filter(Boolean).join(" "), Boolean(home)),
      kit,
      `${from}→${to}`,
    );
    if (!url || !liveForge.current) {
      liveForge.current = false;
      setBeat("idle");
      beatRef.current = "idle";
      setPhase("play");
      phaseRef.current = "play";
      return null;
    }
    let landed = fromStill;
    try {
      const got = await Promise.race([
        grabRuneFrame({ data: { url, at: "end", res: lookResRef.current } }),
        sleep(7000).then(() => ({ ok: false as const })),
      ]);
      if (got.ok) landed = got.url;
    } catch {
      /* */
    }
    const via = from === "spawn" ? "start" : from;
    bank.current.set(`${from}→${to}`, { url, end: landed, start: fromStill });
    bank.current.set(`${from}←${via}→${to}`, { url, end: landed, start: fromStill });
    refsMap.current.set(`pose-${to}`, landed);
    liveForge.current = false;
    setPhase("play");
    phaseRef.current = "play";
    setBeat("idle");
    beatRef.current = "idle";
    syncWalks();
    persist({ phase: "play", plate: hallKeep.current || startHold.current || fromStill });
    return { url, end: landed };
  }

  async function recookWalk(from: string, to: string) {
    const list = withSpawn(pinsRef.current);
    const a = list.find((n) => n.id === from);
    const b = list.find((n) => n.id === to);
    if (!a || !b) return;
    setEditOn(false);
    setReelOn(true);
    setPhase("forge");
    phaseRef.current = "forge";
    liveForge.current = true;
    setBeat("cook");
    beatRef.current = "cook";
    setLoadName(`${from} → ${to}`);
    setLoadPct(8);
    setFrost(`new take · ${from} → ${to}`);
    sfxForge("cook");
    const fromStill = breathStill(from) || startFromPrev(from);
    const home = breathStill(to) || bank.current.get(`idle-${to}`)?.end || "";
    const kit = home && home !== fromStill ? [home] : [];
    const url = await cookFilm(
      fromStill,
      walkPrompt(a, b, from === "spawn", [gazeLaw(to), brainLaws()].filter(Boolean).join(" "), Boolean(home)),
      kit,
      `edit ${from}→${to}`,
    );
    if (!url || !liveForge.current) {
      failStay("edit failed · tap retry");
      return;
    }
    setFilmUrl(url);
    setBeat("playvid");
    beatRef.current = "playvid";
    const played = playFilm(url, clampWalk(walkSecsRef.current) * 1000 + 400, fromStill);
    const snapped = shotEnd(url, fromStill);
    await played;
    const landed = (await snapped) || fromStill;
    const slot = nextAlt(`${from}→${to}`);
    bank.current.set(slot, { url, end: landed });
    liveForge.current = false;
    setPhase("play");
    phaseRef.current = "play";
    setBeat("idle");
    beatRef.current = "idle";
    setFilmUrl(null);
    setFrost("new take · tap Use to keep");
    syncWalks();
    persist({ phase: "play" });
    holdIdle();
    drainQueue();
  }

  async function recookIdle(node: string) {
    const still = nodeStill(node);
    if (!still) return;
    setEditOn(false);
    setReelOn(true);
    setPhase("forge");
    phaseRef.current = "forge";
    liveForge.current = true;
    setBeat("cook");
    beatRef.current = "cook";
    setLoadName(`breathe ${node}`);
    setLoadPct(8);
    setFrost(`new take · breathe ${node}`);
    sfxForge("cook");
    const extra = gazeLaw(node);
    const idleUrl = idleFor(node)?.url || bank.current.get(`idle-${node}`)?.url || "";
    let url: string | null = null;
    let fromExtend = false;
    if (idleUrl) {
      setFrost(`breath continues · ${node}`);
      url = await cookExtend(idleUrl, breathPrompt(extra), `edit breath ${node}`);
      fromExtend = Boolean(url);
    }
    if (!url) url = await cookFilm(still, idlePrompt(extra), [], `edit still ${node}`, 6);
    if (!url) url = await cookFilm(still, idlePrompt(extra), [], `retry still ${node}`, 6);
    if (!url || !liveForge.current) {
      failStay("edit failed · tap retry");
      return;
    }
    setFilmUrl(url);
    setBeat("playvid");
    beatRef.current = "playvid";
    const played = playFilm(url, 6400, still, null, false, undefined, fromExtend);
    const snapped = shotEnd(url, still);
    await played;
    const frame = (await snapped) || still;
    const slot = nextAlt(`idle-${node}`);
    bank.current.set(slot, { url, end: frame });
    liveForge.current = false;
    setPhase("play");
    phaseRef.current = "play";
    setBeat("idle");
    beatRef.current = "idle";
    setFrost("new take · tap Use to keep");
    syncWalks();
    persist({ phase: "play" });
    idleArmed.current = true;
    holdIdle();
    drainQueue();
  }

  function recookClip(key: string) {
    const base = baseKey(key);
    if (base.startsWith("idle-")) {
      void recookIdle(base.slice(5));
      return;
    }
    if (base.includes("→") && !base.startsWith("enter") && !base.includes("←")) {
      const [from, to] = base.split("→");
      if (from && to) void recookWalk(from, to);
    }
  }

  function norm(e: { clientX: number; clientY: number }) {
    const root = layer.current;
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    const pic = img.current;
    const ratio = pic && pic.naturalWidth > 8 ? pic.naturalWidth / pic.naturalHeight : 9 / 16;
    const box = filmBox(rect, ratio);
    const nx = (e.clientX - rect.left - box.x) / box.w;
    const ny = (e.clientY - rect.top - box.y) / box.h;
    return { nx, ny, inside: nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1 };
  }

  function onDown(e: React.PointerEvent) {
    armed.current = true;
    if (bootOn) setBootOn(false);
    unlockAudio();
    startBed();
    swipe.current = { x: e.clientX, y: e.clientY };
    if (phaseRef.current !== "play") return;
    if (riftPickRef.current || riftDraftRef.current || entering.current) return;
    const hit = norm(e);
    const door = hit?.inside ? doorAt(hit.nx, hit.ny) : null;
    if (door && door !== "spawn") goTo(door);
  }

  function onUp(e: React.PointerEvent) {
    if (!armed.current) {
      swipe.current = null;
      return;
    }
    if (pickRef.current) {
      const start = swipe.current;
      swipe.current = null;
      if (!start) return;
      const hit = norm(e);
      if (hit?.inside && hit.ny < 0.68) {
        setPick(false);
        pickRef.current = false;
      }
      return;
    }
    const hit = norm(e);
    if (phaseRef.current === "play") {
      if (riftPickRef.current || riftDraftRef.current) {
        swipe.current = null;
        return;
      }
      const door = hit?.inside ? doorAt(hit.nx, hit.ny) : null;
      if (door && door !== "spawn") {
        window.clearTimeout(pendingTap.current);
        lastTap.current = performance.now();
        setTray(false);
        setEditOn(false);
        setReelOn(false);
        goTo(door);
        swipe.current = null;
        return;
      }
      swipe.current = null;
      if (!hit?.inside) return;
      const now = performance.now();
      if (now - lastTap.current < 420) {
        window.clearTimeout(pendingTap.current);
        lastTap.current = 0;
        sfxForge("full");
        boltFull();
        return;
      }
      lastTap.current = now;
      return;
    }
    const start = swipe.current;
    swipe.current = null;
    const dx = start ? e.clientX - start.x : 0;
    const dy = start ? e.clientY - start.y : 0;
    if (Math.abs(dx) > 56 || Math.abs(dy) > 56) return;
    if (!hit) return;
    if (!hit.inside) return;
    const now = performance.now();
    lastPt.current = { x: hit.nx, y: hit.ny };
    if (now - lastTap.current < 420) {
      window.clearTimeout(pendingTap.current);
      lastTap.current = 0;
      sfxForge("full");
      boltFull();
      return;
    }
    lastTap.current = now;
    if (
      phaseRef.current === "forge" ||
      phaseRef.current === "time" ||
      phaseRef.current === "refs" ||
      phaseRef.current === "count"
    )
      return;
    if (pinsRef.current.length >= wantRef.current) return;
    const spec = plannedObjects(wantRef.current)[pinsRef.current.length];
    sfxForge("page");
    setPins((p) => [
      ...p,
      { id: spec?.id ?? `m${p.length + 1}`, name: spec?.name ?? `mark ${p.length + 1}`, x: hit.nx, y: hit.ny },
    ]);
  }

  function recast() {
    setPhase("mark");
    phaseRef.current = "mark";
    setGraph(null);
    graphRef.current = null;
    setNowClip(null);
    setForged(0);
    forgedRef.current = 0;
    setBeat("idle");
    beatRef.current = "idle";
    setPose(null);
    lastPose.current = null;
    setShots([]);
    plateShot.current = false;
    liveForge.current = false;
    setFilmUrl(null);
    setFrost("");
    const el = film.current;
    if (el) {
      try {
        el.pause();
      } catch {
        /* */
      }
    }
    const elB = filmB.current;
    if (elB) {
      try {
        elB.pause();
      } catch {
        /* */
      }
    }
    setHere(SPAWN.id);
    hereRef.current = SPAWN.id;
    bolt.current = { x: SPAWN.x, y: SPAWN.y };
    walk.current = null;
    queued.current = null;
  }

  function usePlate(src: string) {
    setPlate(src);
    setPins([]);
    recast();
    setPick(false);
    pickRef.current = false;
    setRefs([]);
    setLook(null);
    refsMap.current = new Map();
    sfxForge("page");
  }

  function lockTime() {
    if (pins.length < want) return;
    setPhase("time");
    phaseRef.current = "time";
    sfxForge("page");
  }

  function sleep(ms: number) {
    return new Promise<void>((r) => window.setTimeout(r, ms));
  }

  function cropAt(src: string, x: number, y: number, fracW = 0.48, fracH = 0.42, mark = true) {
    return new Promise<string>((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => {
        const w = im.naturalWidth;
        const h = im.naturalHeight;
        if (w < 8 || h < 8) {
          reject(new Error("tiny"));
          return;
        }
        const cw = Math.max(120, Math.floor(w * fracW));
        const ch = Math.max(120, Math.floor(h * fracH));
        const sx = Math.max(0, Math.min(w - cw, Math.floor(x * w - cw / 2)));
        const sy = Math.max(0, Math.min(h - ch, Math.floor(y * h - ch / 2)));
        const c = document.createElement("canvas");
        c.width = cw;
        c.height = ch;
        const ctx = c.getContext("2d");
        if (!ctx) {
          reject(new Error("ctx"));
          return;
        }
        ctx.drawImage(im, sx, sy, cw, ch, 0, 0, cw, ch);
        if (mark) {
          const px = x * w - sx;
          const py = y * h - sy;
          ctx.strokeStyle = "rgba(158,201,212,0.95)";
          ctx.lineWidth = Math.max(4, cw / 36);
          ctx.beginPath();
          ctx.arc(px, py, Math.max(14, cw * 0.07), 0, Math.PI * 2);
          ctx.stroke();
        }
        resolve(c.toDataURL("image/jpeg", 0.88));
      };
      im.onerror = () => reject(new Error("img"));
      im.src = src;
    });
  }

  async function stillPayload(src: string) {
    return src || "";
  }

  async function grabFilmAt(t: number) {
    const el = film.current;
    if (!el || el.videoWidth < 2) return lastPose.current;
    await new Promise<void>((res) => {
      const on = () => {
        el.removeEventListener("seeked", on);
        res();
      };
      el.addEventListener("seeked", on);
      try {
        const d = el.duration;
        const at = Number.isFinite(d) && d > 0.2 ? Math.min(Math.max(0.04, t), d - 0.08) : 0;
        el.currentTime = at;
      } catch {
        res();
      }
      window.setTimeout(res, 500);
    });
    const out = document.createElement("canvas");
    out.width = el.videoWidth;
    out.height = el.videoHeight;
    const c = out.getContext("2d");
    if (!c) return lastPose.current;
    try {
      c.drawImage(el, 0, 0);
      const url = out.toDataURL("image/jpeg", 0.9);
      lastPose.current = url;
      return url;
    } catch {
      return lastPose.current;
    }
  }

  function grabFilmFrame(_force = false) {
    return lastLive.current || hallKeep.current || lastPose.current;
  }

  function grabFilmAtEnd() {
    return new Promise<string | null>((resolve) => {
      holdNow();
      const el = visFilm();
      if (!el || el.videoWidth < 2) {
        resolve(lastLive.current || lastPose.current);
        return;
      }
      const d = el.duration;
      const t = Number.isFinite(d) && d > 0.25 ? Math.max(0, d - 0.06) : el.currentTime;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.removeEventListener("seeked", finish);
        resolve(grabFilmFrame(true) || lastLive.current || lastPose.current);
      };
      el.addEventListener("seeked", finish);
      try {
        el.pause();
        if (Math.abs(el.currentTime - t) > 0.03) el.currentTime = t;
        else finish();
      } catch {
        finish();
        return;
      }
      window.setTimeout(finish, 500);
    });
  }

  function playFilm(url: string, maxMs = 0, cover?: string | null, freeze?: string | null, skip = true, prefetch?: string | null, breath = false) {
    return new Promise<void>((resolve) => {
      const el = cueSlot();
      if (!el || !url) {
        resolve();
        return;
      }
      setLiving(breath ? "idle" : "walk", walkSecsRef.current);
      const gen = playTok.current;
      const mine = ++loadGen.current;
      let settled = false;
      const wait = maxMs > 0 ? maxMs : (clampWalk(walkSecsRef.current) + 8) * 1000;
      filmLoop.current = breath;
      skipIn.current = skip;
      if (filmHasPaint(visFilm())) {
        setCoverFade(true);
        setFilmOn(true);
      } else if (cover) {
        stickCover(cover);
      }
      const stamp = () => {
        if (loadGen.current !== mine) return;
        const live = visFilm();
        if (!live) return;
        notePaint(live);
        const d = live.duration;
        if (!Number.isFinite(d) || d < 0.6) return;
        const left = d - live.currentTime;
        if (prefetch && left <= 0.9) {
          const hid = hidFilm();
          if (hid) {
            if (slotSrc(hid) !== prefetch) cueBreath(hid, prefetch);
            else {
              seekBreath(hid);
              void hid.play().catch(() => {});
            }
          }
        }
        if (left <= 0.14 || live.ended) {
          const hid = hidFilm();
          if (prefetch && hid && slotSrc(hid) === prefetch && filmHasPaint(hid)) {
            void hid.play().catch(() => {});
            filmLoop.current = true;
            if (hid !== visFilm()) showIncoming();
            setFilmOn(true);
            setCoverFade(true);
            done(false);
            return;
          }
          done(true);
        }
      };
      let t = 0;
      const done = (freeze = true) => {
        if (settled) return;
        settled = true;
        const mineStill = loadGen.current === mine && playTok.current === gen;
        if (mineStill) {
          if (freeze && !filmLoop.current) freezeVis(true);
          else if (freeze && breath) {
            filmLoop.current = false;
            freezeVis(true);
          }
          el.removeEventListener("ended", fail);
          el.removeEventListener("error", fail);
          visFilm()?.removeEventListener("timeupdate", stamp);
        }
        window.clearTimeout(t);
        resolve();
      };
      const fail = () => {
        freezeVis(true);
        done(true);
      };
      el.addEventListener("ended", fail);
      el.addEventListener("error", fail);
      const kick = () => {
        if (loadGen.current !== mine) return;
        startAtSkip(el, () => {
          if (loadGen.current !== mine) return;
          if (!filmHasPaint(el)) return;
          if (el !== visFilm()) showIncoming();
          visFilm()?.addEventListener("timeupdate", stamp);
          setFilmOn(true);
          setCoverFade(true);
          liftCover(gen);
          if (prefetch) {
            const hid = hidFilm();
            if (hid && slotSrc(hid) !== prefetch) cueBreath(hid, prefetch);
          }
        });
      };
      armSlot(el, url);
      if (slotSrc(el) === url && (el.readyState >= 2 || filmHasPaint(el))) kick();
      else el.addEventListener("loadeddata", kick, { once: true });
      t = window.setTimeout(() => done(true), wait);
    });
  }

  async function cookFilm(still: string, prompt: string, kit: string[], label: string, secs?: 6 | 10 | 15, quiet = false): Promise<string | null> {
    let started: { ok: true; requestId: string } | { ok: false; error: string } | null = null;
    let url: string | null = null;
    let slotBusy = false;
    let busyFails = 0;
    let lastBlock = "";
    const blocked = () => (quiet ? dead.current : !liveForge.current);
    try {
    for (let tryN = 0; tryN < 12; tryN++) {
      if (blocked()) return null;
      try {
        started = await startRuneFilm({
          data: {
            still,
            prompt,
            duration: secs === 6 ? 6 : secs === 10 ? 10 : clampWalk(walkSecsRef.current),
            refs: boltKit([lookHall.current, refsMap.current.get("hall"), hallKeep.current, ...kit]),
            res: lookResRef.current,
          },
        });
      } catch (err) {
        started = { ok: false, error: err instanceof Error ? err.message : "net" };
      }
      if (started.ok) {
        slotBusy = false;
        setSlotReason("");
        if (!quiet) setLoadPct((p) => Math.max(p, COOK_START_ACCEPTED_PCT));
        break;
      }
      if (started.error === "echo-off") {
        if (!quiet) setFrost("Imagine is dark");
        return null;
      }
      if (isCookSlotBlock(started.error)) {
        slotBusy = true;
        lastBlock = started.error;
        setSlotReason(started.error);
        if (isLocalSlotHold(started.error)) await freeRuneSlot({ data: {} }).catch(() => {});
        busyFails += 1;
        if (cookBusyNext(busyFails) === "give-up") break;
        if (!quiet) setFrost(cookBusyWaitFrost(started.error));
        await sleep(COOK_BUSY_WAIT_MS);
        continue;
      }
      slotBusy = false;
      if (!quiet) setFrost(started.error);
      await sleep(1200);
    }
    if (!started?.ok) {
      if (slotBusy) {
        if (!quiet) setFrost(cookBusyGiveUpFrost(lastBlock));
      }
      return null;
    }
    for (let p = 0; p < 140; p++) {
      if (blocked()) return null;
      if (p) await sleep(1200);
      let polled;
      try {
        polled = await pollCookPlate({ data: { requestId: started.requestId } });
      } catch {
        continue;
      }
      if (!polled.ok) continue;
      if (polled.status === "done" && polled.url) {
        url = polled.url;
        break;
      }
      if (polled.status === "failed") break;
      if (!quiet) {
        if (typeof polled.pct === "number") setLoadPct(Math.max(COOK_START_ACCEPTED_PCT, Math.min(90, polled.pct)));
        setFrost(`Imagine is drawing ${label} · ${p + 1}`);
      }
    }
    return url;
    } finally {
      if (!url) void freeRuneSlot({ data: {} }).catch(() => {});
    }
  }

  function filmInto(node: string) {
    for (const [k, v] of bank.current) {
      if (!v?.url || !/^https:\/\//i.test(v.url)) continue;
      if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(v.url)) continue;
      if (k.startsWith("idle-")) continue;
      const core = k.includes("#") ? k.slice(0, k.indexOf("#")) : k;
      if (core.endsWith(`→${node}`)) return v.url;
    }
    return "";
  }

  async function cookExtend(video: string, prompt: string, label: string): Promise<string | null> {
    if (!/^https:\/\//i.test(video) || /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(video)) return null;
    let started: { ok: true; requestId: string } | { ok: false; error: string } | null = null;
    let url: string | null = null;
    let slotBusy = false;
    let busyFails = 0;
    let lastBlock = "";
    try {
    for (let tryN = 0; tryN < 10; tryN++) {
      if (!liveForge.current) return null;
      try {
        started = await startRuneExtend({
          data: { video, prompt, duration: 6 },
        });
      } catch (err) {
        started = { ok: false, error: err instanceof Error ? err.message : "net" };
      }
      if (started.ok) {
        slotBusy = false;
        setSlotReason("");
        setLoadPct((p) => Math.max(p, COOK_START_ACCEPTED_PCT));
        break;
      }
      if (started.error === "echo-off") {
        setFrost("Imagine is dark · hall kept");
        return null;
      }
      if (started.error === "no-extend") return null;
      if (isCookSlotBlock(started.error)) {
        slotBusy = true;
        lastBlock = started.error;
        setSlotReason(started.error);
        if (isLocalSlotHold(started.error)) await freeRuneSlot({ data: {} }).catch(() => {});
        busyFails += 1;
        if (cookBusyNext(busyFails) === "give-up") break;
        setFrost(cookBusyWaitFrost(started.error));
        await sleep(COOK_BUSY_WAIT_MS);
        continue;
      }
      slotBusy = false;
      setFrost(started.error);
      await sleep(1200);
    }
    if (!started?.ok) {
      if (slotBusy) setFrost(cookBusyGiveUpFrost(lastBlock));
      return null;
    }
    for (let p = 0; p < 140; p++) {
      if (!liveForge.current) return null;
      if (p) await sleep(1200);
      let polled;
      try {
        polled = await pollCookPlate({ data: { requestId: started.requestId } });
      } catch {
        continue;
      }
      if (!polled.ok) continue;
      if (polled.status === "done" && polled.url) {
        url = polled.url;
        break;
      }
      if (polled.status === "failed") {
        setFrost(`breath dropped · ${label}`);
        break;
      }
      if (typeof polled.pct === "number") setLoadPct(Math.max(COOK_START_ACCEPTED_PCT, Math.min(90, polled.pct)));
      setFrost(`breath continues · ${label} · ${p + 1}`);
    }
    return url;
    } finally {
      if (!url) void freeRuneSlot({ data: {} }).catch(() => {});
    }
  }

  async function shotEnd(url: string, fallback: string) {
    try {
      const got = await Promise.race([
        grabRuneFrame({ data: { url, at: "end", res: lookResRef.current } }),
        sleep(7000).then(() => ({ ok: false as const, error: "slow" })),
      ]);
      if (got.ok) return got.url;
    } catch {
      /* */
    }
    return lastLive.current || lastPose.current || fallback;
  }

  async function fillEnds() {
    let hit = false;
    for (const [k, v] of [...bank.current.entries()]) {
      if (!v.url || v.end) continue;
      try {
        const got = await grabRuneFrame({ data: { url: v.url, at: "end", res: lookResRef.current } });
        if (!got.ok) continue;
        bank.current.set(k, { url: v.url, end: got.url });
        hit = true;
      } catch {
        /* */
      }
    }
    if (hit) persist({ phase: phaseRef.current === "count" ? "look" : phaseRef.current });
  }

  async function buildRefs(g: RuneGraph) {
    const out: { id: string; name: string; src: string }[] = [];
    const room = await stillPayload(plate);
    out.push({ id: "room", name: "room", src: room });
    for (const n of g.nodes) {
      if (n.id === "spawn") continue;
      try {
        const src = await cropAt(plate, n.x, n.y);
        out.push({ id: n.id, name: n.name, src });
      } catch {
        /* */
      }
    }
    refsMap.current = new Map(out.map((r) => [r.id, r.src]));
    setRefs(out);
    return out;
  }

  function refKit(extra?: string | null) {
    return boltKit([extra, refsMap.current.get("bolt"), refsMap.current.get("m1"), refsMap.current.get("m2")]);
  }

  async function cookIdleAt(node: string, still: string, fromFilm?: string, via?: string, playArrival = false) {
    const key = via ? `idle-${node}←${via}` : `idle-${node}`;
    if (!liveForge.current && !playArrival) return still;
    const have = bank.current.get(key);
    if (have && doorBreathPlayable(have, fromFilm)) return have.end || still;
    const owned = !liveForge.current && playArrival;
    if (owned) liveForge.current = true;
    try {
    if (playArrival) {
      setFrost(`breath · ${node}`);
    } else {
      setNowClip({ kind: "idle", id: key, node, camera: "lock", morph: false });
      setBeat("cook");
      beatRef.current = "cook";
      setFilmUrl(null);
      setLoadName(`still · ${node}`);
      setLoadPct(8);
      setFrost(`still · ${node} breathes`);
    }
    sfxForge("cook");
    const extra = `${gazeLaw(node)} ${stillLaws()}`.trim();
    const idleUrl = bank.current.get(`idle-${node}`)?.url || idleFor(node)?.url || "";
    let url: string | null = null;
    let fromExtend = false;
    // Never extend a walk. Imagine moonwalks. Breath is cookFilm from landed
    // still, or extend only from an existing idleUrl (not hall loop, not the walk).
    const canExtend = Boolean(idleUrl) && !isHallFilm(idleUrl) && idleUrl !== fromFilm && doorBreathPlayable({ url: idleUrl }, fromFilm);
    if (canExtend && (!fromFilm || fromFilm === idleUrl)) {
      setFrost(`breath continues · ${node}`);
      url = await cookExtend(idleUrl, breathPrompt(extra), `breath ${node}`);
      fromExtend = Boolean(url);
    }
    if (!url) url = await cookFilm(still, idlePrompt(extra), [], `still ${node}`, 6, playArrival);
    if (!url) url = await cookFilm(still, idlePrompt(extra), [], `retry still ${node}`, 6, playArrival);
    if (!url || (!liveForge.current && !playArrival)) return still;
    setLoadPct(100);
    if (playArrival) {
      bank.current.set(key, { url, end: still });
      bank.current.set(`idle-${node}`, { url, end: still });
      persist({ phase: "play", plate: still });
      syncWalks();
      const snapped = shotEnd(url, still);
      void snapped.then((frame) => {
        if (!frame) return;
        bank.current.set(key, { url, end: frame });
        bank.current.set(`idle-${node}`, { url, end: frame });
      });
      return still;
    }
    setFilmUrl(url);
    setBeat("playvid");
    beatRef.current = "playvid";
    const played = playFilm(url, 6400, still, null, false, undefined, fromExtend);
    const snapped = shotEnd(url, still);
    await played;
    if (!liveForge.current) return still;
    const frame = await snapped;
    bank.current.set(key, { url, end: frame });
    bank.current.set(`idle-${node}`, { url, end: frame });
    persist({ phase: "forge", plate: frame });
    syncWalks();
    setPose(frame);
    setBeat("shot");
    beatRef.current = "shot";
    setFrost(fromExtend ? "shot · breath continues" : "shot · still");
    sfxForge("enter");
    await sleep(SHOT_MS);
    return frame;
    } finally {
      if (owned) liveForge.current = false;
    }
  }

  async function cookWalks(g: RuneGraph, resume = false) {
    liveForge.current = true;
    if (!resume) {
      const keep = [...bank.current].filter(([k]) => k.startsWith("idle-") || k.startsWith("enter"));
      bank.current = new Map(keep);
      cameFrom.current = "start";
    }
    setBeat("idle");
    beatRef.current = "idle";
    setPose(null);
    setFrost("");
    const q =
      extraPath.current && pathFirst.current
        ? [{ from: "spawn", to: pathFirst.current, via: "start" }]
        : pathFirst.current
          ? pathWalks(pathFirst.current)
          : planWalks(g.nodes.map((n) => n.id), filmCapRef.current);
    extraPath.current = false;
    const latest = new Map<string, string>();
    const pose = new Map<string, string>();
    const goal = new Map<string, string>();
    const hallStill = lookHall.current || refsMap.current.get("hall") || hallKeep.current || HALL_STILL;
    const boltStill = refsMap.current.get("bolt") || "";
    let still = playStillOrHall(
      refsMap.current.get("seed") || refsMap.current.get("pose-spawn") || plateRef.current || plate || "",
      hallStill,
    );
    const pick = enterHold.current.pick;
    const enterSrc = pick === "b" ? enterHold.current.b || enterHold.current.a : enterHold.current.a || enterHold.current.b;
    const enterSide: "LEFT" | "RIGHT" = pick === "b" && enterHold.current.b ? "RIGHT" : "LEFT";
    if (enterSrc && hallStill && !bank.current.get("enter→spawn")?.url) {
      setNowClip({
        kind: "walk",
        id: "walk-enter-spawn",
        from: "enter",
        to: "spawn",
        startPose: "enter",
        endPose: "spawn",
        camera: "lock",
        morph: false,
      });
      setLoadName("enter");
      setLoadPct(6);
      setStageSrc(enterSrc);
      setBeat("cook");
      beatRef.current = "cook";
      setFrost("enter · last frame room 1 → room 2");
      sfxForge("cook");
      let enterUrl = await cookFilm(enterSrc, enterHallPrompt(enterSide, worldHold.current), [hallStill], "enter", 6);
      if (!enterUrl) enterUrl = await cookFilm(enterSrc, enterHallPrompt(enterSide, worldHold.current), [hallStill], "enter retry", 6);
      if (!enterUrl) {
        setFrost("enter failed · tap retry");
        setLoadPct(0);
        return;
      }
      setFilmUrl(enterUrl);
      setBeat("playvid");
      beatRef.current = "playvid";
      setFrost("play · enter");
      const played = playFilm(enterUrl, 6400, enterSrc, null, false);
      const snapped = shotEnd(enterUrl, hallStill);
      await played;
      if (!liveForge.current) return;
      const frame = await snapped;
      bank.current.set("enter→spawn", { url: enterUrl, end: frame });
      bank.current.set(`${viaHold.current || (enterSide === "RIGHT" ? "m2" : "m1")}→spawn`, { url: enterUrl, end: frame });
      still = frame;
      refsMap.current.set("seed", frame);
      refsMap.current.set("pose-spawn", frame);
      refsMap.current.set("room", frame);
      plateRef.current = frame;
      setPlate(frame);
      setStageSrc(frame);
      persist({ phase: "forge", plate: frame, start: frame });
      syncWalks();
      sfxForge("enter");
      await sleep(SHOT_MS);
      void stampParentExit(enterUrl, frame);
    }
    const poseSpawn = still;
    latest.set(SPAWN.id, poseSpawn);
    pose.set(`${SPAWN.id}←start`, poseSpawn);
    goal.set(SPAWN.id, poseSpawn);
    const taintedIdle =
      isBoltSilhouette(refsMap.current.get("seed")) ||
      isBoltSilhouette(refsMap.current.get("placed")) ||
      (isBoltSilhouette(boltStill) && refsMap.current.get("seed") === boltStill) ||
      isBoltSilhouette(bank.current.get("idle-spawn")?.end) ||
      isBoltSilhouette(bank.current.get("idle-spawn")?.url);
    if (taintedIdle) bank.current.delete("idle-spawn");
    if (!bank.current.get("idle-spawn")?.url && poseSpawn) {
      await cookIdleAt("spawn", poseSpawn, bank.current.get("enter→spawn")?.url);
    }
    const breath = bank.current.get("idle-spawn");
    if (breath?.end) {
      still = breath.end;
      latest.set(SPAWN.id, breath.end);
      pose.set(`${SPAWN.id}←start`, breath.end);
      plateRef.current = breath.end;
      setPlate(breath.end);
    }
    for (const [key, val] of bank.current) {
      const m = /^(.+)←(.+)→(.+)$/.exec(key);
      if (!m) continue;
      pose.set(`${m[3]}←${m[1]}`, val.end);
      latest.set(m[3]!, val.end);
    }
    const walks = q;
    for (let i = 0; i < walks.length; i++) {
      if (!liveForge.current) return;
      const clip = walks[i]!;
      const bankKey = `${clip.from}←${clip.via}→${clip.to}`;
      if (bank.current.has(bankKey)) {
        const hit = bank.current.get(bankKey)!;
        pose.set(`${clip.to}←${clip.from}`, hit.end);
        latest.set(clip.to, hit.end);
        still = hit.end;
        continue;
      }
      setNowClip({
        kind: "walk",
        id: `walk-${clip.from}-${clip.to}`,
        from: clip.from,
        to: clip.to,
        startPose: clip.from,
        endPose: clip.to,
        camera: "lock",
        morph: false,
      });
      setForged(i);
      forgedRef.current = i;
      setBeat("cook");
      beatRef.current = "cook";
      setFilmUrl(null);
      setLoadName(`${clip.from} → ${clip.to}`);
      setLoadPct(6);
      const from = g.nodes.find((n) => n.id === clip.from) ?? SPAWN;
      const to = g.nodes.find((n) => n.id === clip.to) ?? SPAWN;
      const fromStill =
        walkLastFrameSeed(
          latest.get(clip.from),
          pose.get(`${clip.from}←${clip.via}`),
          breathStill(clip.from, clip.via === "start" ? undefined : clip.via),
          still,
        ) ||
        latest.get(clip.from) ||
        pose.get(`${clip.from}←${clip.via}`) ||
        still;
      const homeClip = bank.current.get(`idle-${clip.to}`);
      const home = walkLastFrameSeed(breathStill(clip.to), homeClip?.end);
      const kit = home && home !== fromStill ? [home] : [];
      setFrost(`video ${i + 1}/${walks.length} · ${clip.from} → ${clip.to}`);
      sfxForge("cook");
      const label = `${clip.from} → ${clip.to}`;
      const style = lookForgeWalkStyle(hallStyleOnly.current ? "bot" : "start", cleanWish(worldHold.current));
      const extra = [style ? `Hall style from the still: ${style}.` : "", gazeLaw(to.id), brainLaws()].filter(Boolean).join(" ");
      let prompt = walkPrompt(from, to, clip.via === "start", extra, Boolean(home));
      let url = await cookFilm(fromStill, prompt, kit, label);
      if (!url) {
        setFrost(`retry · ${label}`);
        url = await cookFilm(fromStill, prompt, kit, `retry ${label}`);
      }
      if (!url) {
        setFrost(`video failed · ${label}`);
        setLoadPct(0);
        continue;
      }
      bank.current.set(`${clip.from}←${clip.via}→${clip.to}`, { url, end: fromStill, start: fromStill });
      bank.current.set(`${clip.from}→${clip.to}`, { url, end: fromStill, start: fromStill });
      setLoadPct(100);
      setFilmUrl(url);
      setBeat("playvid");
      beatRef.current = "playvid";
      setPose(null);
      setFrost(`video · ${label}`);
      const playMs = clampWalk(walkSecsRef.current) * 1000 + 400;
      const played = playFilm(url, playMs, fromStill);
      const snapped = shotEnd(url, fromStill);
      await played;
      if (!liveForge.current) return;
      let frame = await snapped;
      let judged = await gradeFrames(fromStill, frame);
      digest(judged.grade);
      setIq(brainLine());
      let doRetry = false;
      if (driveRef.current === "pilot") {
        setFrost(`pilot · ${judged.grade}`);
        const choice = await waitPilot();
        if (choice === "stop") break;
        doRetry = choice === "retry";
      }
      if (doRetry) {
        bump("retry");
        setFrost(`engine learned ${judged.grade} · retry`);
        setBeat("cook");
        beatRef.current = "cook";
        setFilmUrl(null);
        setLoadPct(8);
        const again = await cookFilm(
          fromStill,
          walkPrompt(from, to, clip.via === "start", `${gazeLaw(to.id)} ${brainLaws()} ${retryLaw(judged.grade)}`, Boolean(home)),
          kit,
          `retry ${label}`,
        );
        if (again) {
          url = again;
          setLoadPct(100);
          setFilmUrl(url);
          setBeat("playvid");
          beatRef.current = "playvid";
          const againPlay = playFilm(url, clampWalk(walkSecsRef.current) * 1000 + 400, fromStill);
          const againShot = shotEnd(url, fromStill);
          await againPlay;
          if (!liveForge.current) return;
          frame = await againShot;
          judged = await gradeFrames(fromStill, frame);
          digest(judged.grade);
          setIq(brainLine());
        }
      }
      bump("forge");
      setFrost(`engine · ${judged.grade}`);
      const landed = frame;
      still = landed;
      latest.set(clip.to, landed);
      pose.set(`${clip.to}←${clip.from}`, landed);
      bank.current.set(`${clip.from}←${clip.via}→${clip.to}`, { url, end: landed, start: fromStill });
      bank.current.set(`${clip.from}→${clip.to}`, { url, end: landed, start: fromStill });
      refsMap.current.set(`pose-${clip.to}`, landed);
      syncWalks();
      setHere(clip.to);
      hereRef.current = clip.to;
      cameFrom.current = clip.from;
      bolt.current = { x: to.x, y: to.y };
      setPose(landed);
      setShots((s) => [...s, landed]);
      setBeat("shot");
      beatRef.current = "shot";
      setFrost("shot · last frame");
      sfxForge("enter");
      await sleep(SHOT_MS);
      const hadHome = Boolean(homeClip?.url) && !isStockHallClip(homeClip);
      if (hadHome) {
        const homeEnd = arrivalEndStill(landed, homeClip);
        latest.set(clip.to, homeEnd);
        pose.set(`${clip.to}←${clip.from}`, homeEnd);
        still = homeEnd;
      } else {
        const breathEnd = await cookIdleAt(clip.to, landed, url, clip.from);
        latest.set(clip.to, breathEnd);
        pose.set(`${clip.to}←${clip.from}`, breathEnd);
        still = breathEnd;
        persist({ phase: "forge", plate: breathEnd, forged: i + 1 });
      }
    }
    if (!liveForge.current) return;
    for (const n of ["m1", "m2"] as const) {
      if (!liveForge.current) break;
      const landed = latest.get(n) || pose.get(`${n}←spawn`) || nodeStill(n);
      if (landed) await cookIdleAt(n, landed);
    }
    if (!liveForge.current) return;
    liveForge.current = false;
    const frame = livingNow();
    if (frame.playFrame === "fail") {
      setPhase("forge");
      phaseRef.current = "forge";
      setBeat("idle");
      beatRef.current = "idle";
      setFilmUrl(null);
      setPose(null);
      setLoadPct(0);
      setPlayFrameKind("fail");
      setPlayWalksOn(false);
      setFrost(frame.frost);
      persist({ phase: "forge", plate: frame.still });
      syncWalks();
      return;
    }
    if (isBoltSilhouette(refsMap.current.get("seed")) || isBoltSilhouette(refsMap.current.get("room"))) {
      refsMap.current.set("seed", frame.still);
      refsMap.current.set("pose-spawn", frame.still);
      refsMap.current.set("room", frame.still);
    }
    lockHall(frame.still);
    setPlate(frame.still);
    plateRef.current = frame.still;
    startHold.current = frame.still;
    setPlayFrameKind(frame.playFrame);
    setPlayWalksOn(true);
    setPose(null);
    if (frame.url) setFilmUrl(frame.url);
    else setFilmUrl(null);
    armed.current = true;
    setPhase("play");
    phaseRef.current = "play";
    setBeat("idle");
    beatRef.current = "idle";
    sfxForge("cook");
    bump("gen");
    setIq(brainLine());
    const lastTo = walks.at(-1)?.to || SPAWN.id;
    const lastFrom = walks.at(-1)?.from || "start";
    const next = queued.current;
    queued.current = null;
    if (next) {
      setHere(lastTo);
      hereRef.current = lastTo;
      cameFrom.current = lastFrom;
      persist({ phase: "play", plate: frame.still, here: lastTo, cameFrom: lastFrom, start: frame.still });
      markLookForgeDone();
      if (next === lastTo) holdIdle();
      else void playWalk(next);
      prefetchFrom(hereRef.current);
      const firstDoor = pathFirst.current || "m1";
      const other = otherDoor(firstDoor);
      setNeedOther(!(bank.current.get(`spawn→${other}`) || bank.current.get(`spawn←start→${other}`)));
      syncWalks();
      return;
    }
    setHere(SPAWN.id);
    hereRef.current = SPAWN.id;
    cameFrom.current = "start";
    bolt.current = { x: SPAWN.x, y: SPAWN.y };
    persist({ phase: "play", plate: frame.still, here: SPAWN.id, cameFrom: "start", start: frame.still, thumb: frame.still });
    markLookForgeDone();
    setReelOn(false);
    setHallsOn(false);
    setTray(false);
    setEditOn(false);
    setGraphOn(false);
    holdIdle();
    prefetchFrom("spawn");
    for (const [k, v] of bank.current) {
      if (v.url && k.includes("→") && !k.startsWith("enter")) warmUrl(v.url);
    }
    const firstDoor = pathFirst.current || "m1";
    const other = otherDoor(firstDoor);
    setNeedOther(!(bank.current.get(`spawn→${other}`) || bank.current.get(`spawn←start→${other}`)));
    syncWalks();
  }

  function packStill(label: string): string | null {
    const packed = packIdentityStill(label);
    if (packed) return packed;
    const n = label.toLowerCase();
    if (n.includes("teal")) return "/refs/teal-door.jpg";
    if (n.includes("gold")) return "/refs/gold-door.jpg";
    return null;
  }

  async function mintStill(label: string, prompt: string, ratio: "9:16" | "1:1", extra?: string[], edit = false, editOnly = false) {
    const wish = worldHold.current.trim();
    if (label === "bolt" || label === "bolt-face" || label === "bolt-body" || label === "face") {
      const packed = packStill(label);
      if (packed) {
        setLoadPct(100);
        return packed;
      }
    }
    const pack = wish ? null : packStill(label);
    if (dead.current) return pack;
    setLoadName(label);
    setLoadPct(8);
    setFrost(wish ? `ref · ${wish.slice(0, 32)}` : `ref · ${label}`);
    if (!wish && pack && (label === "hall" || label === "bolt")) {
      if (label === "hall") setStageSrc(pack);
      setLoadPct(100);
      await sleep(120);
      return pack;
    }
    const tick = window.setInterval(() => {
      setLoadPct((p) => (p >= 92 ? 92 : p + Math.floor(1 + Math.random() * 3)));
    }, 800);
    let got: { ok: true; url: string } | { ok: false; error: string } | null = null;
    try {
      for (let t = 0; t < 4; t++) {
        if (dead.current) return null;
        try {
          got = (await Promise.race([
            startRuneStill({ data: { prompt, ratio, refs: dropTaintedBolt(extra), edit, editOnly, res: lookResRef.current } }),
            sleep(55000).then(() => ({ ok: false as const, error: "timeout" })),
          ])) as { ok: true; url: string } | { ok: false; error: string };
        } catch (err) {
          got = { ok: false, error: err instanceof Error ? err.message.slice(0, 80) : "net" };
        }
        if (got.ok) break;
        if (got.error === "echo-off") break;
        setFrost(isCookSlotBlock(got.error) ? `${cookBusyWaitFrost(got.error)} · ${label}` : `Imagine · ${label} ${got.error}`);
        await sleep(got.error === "busy" ? 4000 * (t + 1) : 900);
      }
    } finally {
      window.clearInterval(tick);
    }
    if (got?.ok) {
      setLoadPct(100);
      if (ratio !== "1:1") setStageSrc(got.url);
      sfxForge("enter");
      await sleep(180);
      return got.url;
    }
    if (!wish && pack) {
      setLoadPct(100);
      if (label === "hall") setStageSrc(pack);
      setFrost(`pack · ${label}`);
      return pack;
    }
    setLoadPct(0);
    setFrost(`${label} failed · tap retry`);
    return null;
  }

  async function cookSeed(hallUrl: string, kit: string[]): Promise<string | null> {
    if (!isHallPlayStill(hallUrl) || isBoltSilhouette(hallUrl)) {
      hallUrl = kit.find((u) => isHallPlayStill(u) && !isBoltSilhouette(u)) || hallStillOf({ hall: lookHall.current || refsMap.current.get("hall") }) || HALL_STILL;
    }
    setLoadName("seed video");
    setLoadPct(10);
    setFrost("seed video");
    setStageSrc(hallUrl);
    setBeat("cook");
    beatRef.current = "cook";
    setPhase("refs");
    phaseRef.current = "refs";
    let started: { ok: true; requestId: string } | { ok: false; error: string } | null = null;
    let busyFails = 0;
    let lastBlock = "";
    for (let t = 0; t < 16; t++) {
      if (dead.current) return hallUrl;
      try {
        started = await startRuneFilm({
          data: { still: hallUrl, prompt: seedHallPrompt(worldHold.current, !!lookPackRef.current.find((p) => p.id === "same-hall")), duration: 6, refs: boltKit(kit.filter((u) => u.startsWith("http") || u.startsWith("/") || (u.startsWith("data:") && u.length < 350000))), res: "720" },
        });
      } catch {
        started = { ok: false, error: "net" };
      }
      if (started.ok) {
        setSlotReason("");
        setLoadPct((p) => Math.max(p, COOK_START_ACCEPTED_PCT));
        break;
      }
      if (started.error === "echo-off") {
        setFrost("Imagine is dark · hall kept");
        return hallUrl;
      }
      if (isCookSlotBlock(started.error)) {
        lastBlock = started.error;
        setSlotReason(started.error);
        if (isLocalSlotHold(started.error)) await freeRuneSlot({ data: {} }).catch(() => {});
        busyFails += 1;
        if (cookBusyNext(busyFails) === "give-up") break;
        setFrost(cookBusyWaitFrost(started.error));
        await sleep(COOK_BUSY_WAIT_MS);
        continue;
      }
      setFrost(`seed · ${started.error}`);
      await sleep(1200);
    }
    if (!started?.ok) {
      void freeRuneSlot({ data: {} }).catch(() => {});
      setFrost(busyFails ? cookBusyGiveUpFrost(lastBlock) : "seed film dropped · hall kept");
      setLoadPct(0);
      return hallUrl;
    }
    let filmUrl: string | null = null;
    for (let p = 0; p < 160; p++) {
      if (dead.current) return hallUrl;
      if (p) await sleep(p < 40 ? 1000 : 1400);
      let polled;
      try {
        polled = await pollCookPlate({ data: { requestId: started.requestId } });
      } catch {
        setFrost(`seed · wait ${p + 1}`);
        continue;
      }
      if (!polled.ok) {
        setFrost(`seed · ${polled.error}`);
        continue;
      }
      if (typeof polled.pct === "number") setLoadPct(Math.max(COOK_START_ACCEPTED_PCT, Math.min(90, polled.pct)));
      if (polled.status === "done" && polled.url) {
        filmUrl = polled.url;
        break;
      }
      if (polled.status === "failed") {
        setFrost(polled.frame ? `seed dropped · ${polled.frame}` : "seed film dropped · hall kept");
        break;
      }
      setFrost(`seed video · ${p + 1}`);
    }
    if (!filmUrl) {
      void freeRuneSlot({ data: {} }).catch(() => {});
      setFrost("seed film dropped · hall kept");
      setLoadPct(100);
      return hallUrl;
    }
    setLoadPct(100);
    setBeat("playvid");
    beatRef.current = "playvid";
    setFilmUrl(filmUrl);
    setFrost("play · seed");
    const seedPlay = Promise.race([playFilm(filmUrl, 6200, hallUrl, null, true, undefined, true), sleep(6200)]);
    const snappedEnd = shotEnd(filmUrl, hallUrl);
    let shot: string | null = null;
    try {
      const got = await grabRuneFrame({ data: { url: filmUrl, at: "start", res: lookResRef.current } });
      if (got.ok) shot = got.url;
    } catch {
      /* */
    }
    await seedPlay;
    if (!shot) {
      try {
        shot = (await grabFilmAt(0.4)) ?? (await grabFilmFrame());
      } catch {
        shot = null;
      }
    }
    shot = shot || hallUrl;
    let landed = shot;
    try {
      landed = (await snappedEnd) || shot;
    } catch {
      landed = shot;
    }
    setBeat("shot");
    beatRef.current = "shot";
    setFilmUrl(null);
    const seedStill = isHallPlayStill(shot) && !isBoltSilhouette(shot) ? shot : hallUrl;
    setStageSrc(seedStill);
    setPose(seedStill);
    if (seedMayBankIdle(hallUrl) && !isBoltSilhouette(landed) && !isBoltSilhouette(filmUrl)) {
      bank.current.set("idle-spawn", { url: filmUrl, end: isHallPlayStill(landed) ? landed : hallUrl });
    }
    persist({ phase: "refs", plate: seedStill, start: seedStill, thumb: seedStill });
    setFrost("shot · seed");
    sfxForge("enter");
    await sleep(360);
    return seedStill;
  }

  async function cookEnter(start: string, hall: string, bolt: string, side: "LEFT" | "RIGHT") {
    setLoadName("enter");
    setLoadPct(8);
    setFrost("enter · room 1 → 2");
    setStageSrc(start);
    setBeat("cook");
    beatRef.current = "cook";
    setPhase("refs");
    phaseRef.current = "refs";
    const kit = [hall, bolt, start].filter(Boolean);
    let url = await cookFilm(start, enterHallPrompt(side, worldHold.current), kit, "enter", 6);
    if (!url) url = await cookFilm(start, enterHallPrompt(side, worldHold.current), kit, "enter retry", 6);
    if (!url) return null;
    setFilmUrl(url);
    setBeat("playvid");
    beatRef.current = "playvid";
    setFrost("play · enter");
    const played = playFilm(url, 6400, start, null, false);
    const snapped = shotEnd(url, hall);
    await played;
    if (!liveForge.current && dead.current) return null;
    const frame = await snapped;
    bank.current.set("enter→spawn", { url, end: frame });
    bank.current.set(`${viaHold.current || (side === "RIGHT" ? "m2" : "m1")}→spawn`, { url, end: frame });
    persist({ phase: "forge", plate: frame, start: frame });
    syncWalks();
    setPose(frame);
    setStageSrc(frame);
    setBeat("shot");
    beatRef.current = "shot";
    setFrost("shot · enter");
    sfxForge("enter");
    await sleep(SHOT_MS);
    return frame;
  }

  async function cookRefs() {
    if (cooking.current) return;
    cooking.current = true;
    const mine = runId.current;
    try {
    if (runId.current !== mine) return;
    const plan = plannedObjects(wantRef.current || 2);
    const list: { id: string; name: string; src: string }[] = [];
    let boltUrl = BOLT_BODY;
    let hallUrl = null as string | null;
    setLoadPct(8);
    setLoadName("hall");
    setFrost(worldHold.current.trim() ? `ref · ${worldHold.current.trim().slice(0, 32)}` : "ref · hall + doors");
    refsMap.current.set("bolt", BOLT_BODY);
    refsMap.current.set("spawn", BOLT_BODY);
    list.push({ id: "bolt", name: "bolt", src: BOLT_BODY });
    const same = enterHold.current.hall || lookPackRef.current.find((p) => p.id === "same-hall")?.src || "";
    const packA = enterHold.current.a || lookPackRef.current.find((p) => p.id === "door-a")?.src || "";
    const packB = enterHold.current.b || lookPackRef.current.find((p) => p.id === "door-b")?.src || "";
    const pick = enterHold.current.pick || enterDoorRef.current;
    const extras = lookPackRef.current.map((p) => p.src).slice(0, 3);
    if (same) list.push({ id: "same", name: "same", src: same });
    if (packA) list.push({ id: "enter-a", name: "A", src: packA });
    if (packB) list.push({ id: "enter-b", name: "B", src: packB });
    setRefs(forgeTrayRefs([...list]));
    if (same && !worldHold.current.trim()) {
      hallUrl = same;
      setStageSrc(same);
      setLoadPct(100);
      setFrost("same hall");
      await sleep(120);
    } else if (same) {
      hallUrl = await mintStill("hall", sameHallPrompt(worldHold.current), "9:16", [same], true, false);
    } else {
      hallUrl = await mintStill(
        "hall",
        hallDoorsPrompt(worldHold.current) +
          (packA || packB
            ? " Extra refs are LAST FRAMES of the previous hall at LEFT door A and RIGHT door B. Keep those two doorways as the same passages. New room continues through them."
            : ""),
        "9:16",
        extras,
      );
    }
    if (!hallUrl) {
      setFrost("hall failed · tap retry");
      setLoadPct(0);
      setBeat("idle");
      beatRef.current = "idle";
      return;
    }
    const wishHall = worldHold.current.trim();
    if (!wishHall) {
      const sealed = await mintStill("doors", lockDoorsPrompt(), "9:16", [hallUrl]);
      if (sealed) hallUrl = sealed;
    }
    lookHall.current = hallUrl;
    list.unshift({ id: "hall", name: "hall", src: hallUrl });
    refsMap.current.set("hall", hallUrl);
    refsMap.current.set("empty", hallUrl);
    for (const obj of plan) refsMap.current.set(obj.id, hallUrl);
    setRefs(forgeTrayRefs([...list]));
    persist({ phase: "refs", plate: hallUrl, refs: forgeTrayRefs(list), start: hallUrl, thumb: hallUrl });
    const enterSrc = pick === "b" ? packB || packA : packA || packB;
    setStageSrc(enterSrc || hallUrl);
    if (dead.current) return;
    let seedShot = refsMap.current.get("seed") || null;
    if (enterSrc) {
      seedShot = enterSrc;
      setPlate(enterSrc);
      plateRef.current = enterSrc;
      refsMap.current.set("seed", enterSrc);
      refsMap.current.set("pose-spawn", enterSrc);
      refsMap.current.set("room", enterSrc);
    }
    if (!seedShot) {
      setFrost("place · bolt");
      const rawPlaced = await mintStill("place-bolt", placeBoltPrompt(), "9:16", [hallUrl, BOLT_BODY], true, true);
      const placed = rawPlaced && isHallPlayStill(rawPlaced) && !isBoltSilhouette(rawPlaced) ? rawPlaced : null;
      const start = placed || hallUrl;
      if (placed) {
        list.unshift({ id: "placed", name: "bolt in", src: placed });
        refsMap.current.set("placed", placed);
        setRefs(forgeTrayRefs([...list]));
      }
      setStageSrc(start);
      seedShot = await cookSeed(start, boltKit([hallUrl, placed]));
      if (!seedShot || isBoltSilhouette(seedShot)) seedShot = placed || hallUrl;
    }
    if (!seedShot || isBoltSilhouette(seedShot)) {
      seedShot = hallUrl;
    }
    if (!seedShot) {
      setBeat("idle");
      beatRef.current = "idle";
      return;
    }
    list.unshift({ id: "seed", name: "seed", src: seedShot });
    refsMap.current.set("seed", seedShot);
    refsMap.current.set("pose-spawn", seedShot);
    refsMap.current.set("room", seedShot);
    setPlate(seedShot);
    plateRef.current = seedShot;
    setRefs(forgeTrayRefs([...list]));
    persist({ phase: "time", plate: seedShot, refs: forgeTrayRefs(list), start: seedShot });
    const doors = plan.map((o) => ({ id: o.id, name: o.name, x: o.x, y: o.y }));
    setPins(doors);
    pinsRef.current = doors;
    const g = compileCitadel(seedShot, doors, walkSecsRef.current);
    setGraph(g);
    graphRef.current = g;
    setBeat("cook");
    beatRef.current = "cook";
    setLoadPct(8);
    setLoadName("walk");
    setFrost("walks");
    if (pathFirst.current) {
      setWalkSecs(walkSecsRef.current);
      setPhase("forge");
      phaseRef.current = "forge";
      sfxForge("cook");
      void cookWalks(g).catch(() => failStay("forge paused · tap retry"));
      return;
    }
    setPhase("time");
    phaseRef.current = "time";
    sfxForge("page");
    } finally {
      cooking.current = false;
    }
  }

  function startRefs(keepSid = false, pack: "live" | "sealed" | "hall" = "live") {
    runId.current += 1;
    dead.current = false;
    cooking.current = false;
    liveForge.current = true;
    hallStyleOnly.current = pack === "hall";
    if (pack === "sealed") {
      lookPackRef.current = [];
      setLookPack([]);
      lookHall.current = null;
      enterHold.current = { hall: "", a: "", b: "", pick: enterDoorRef.current };
    } else if (pack === "hall") {
      enterHold.current = { hall: "", a: "", b: "", pick: enterDoorRef.current };
    } else {
      enterHold.current = {
        hall: bridgeOn.hall ? lookPackRef.current.find((p) => p.id === "same-hall")?.src || bridge.hall : "",
        a: bridgeOn.a ? lookPackRef.current.find((p) => p.id === "door-a")?.src || bridge.a : "",
        b: bridgeOn.b ? lookPackRef.current.find((p) => p.id === "door-b")?.src || bridge.b : "",
        pick: enterDoorRef.current,
      };
    }
    if (!keepSid && hallHold.current <= 1) sid.current = newSessionId();
    setPlate("");
    plateRef.current = "";
    setStageSrc(null);
    lookHall.current = null;
    setGraph(null);
    graphRef.current = null;
    setPins([]);
    setNeedBolt(true);
    setNeedRoom(true);
    setPhase("refs");
    phaseRef.current = "refs";
    setRefs([]);
    setLook(null);
    setStageSrc(null);
    setLoadName("hall");
    setLoadPct(8);
    setFrost("ref · hall");
    refsMap.current = new Map();
    bank.current = new Map();
    cameFrom.current = "start";
    setForgePack(pack);
    setForgeWish(worldHold.current.trim());
    setFrost(worldHold.current.trim() ? `ref · ${worldHold.current.trim().slice(0, 32)}` : "ref · hall");
    sfxForge("cook");
    void freeRuneSlot({ data: {} })
      .catch(() => {})
      .then(() => {
        void cookRefs().catch(() => failStay("forge paused · tap retry"));
      });
  }

  function stayHere() {
    if (enterAsk) skipAsk.current = enterAsk;
    setEnterAsk(null);
    sfxForge("page");
  }

  function lastAt(id: string) {
    const ok = (u?: string | null) =>
      !!u && (u.startsWith("http") || u.startsWith("/") || u.startsWith("data:") || u.startsWith("blob:"));
    const pose = refsHold.current.find((r) => r.id === `pose-${id}`)?.src;
    if (ok(pose)) return pose as string;
    const idle = bank.current.get(`idle-${id}`)?.end;
    if (ok(idle)) return idle;
    let walkEnd = "";
    for (const [k, v] of bank.current) {
      if (!ok(v.end)) continue;
      if (k === `idle-${id}` || k.endsWith(`→${id}`)) walkEnd = v.end;
    }
    if (walkEnd) return walkEnd;
    if (hereRef.current === id) {
      if (ok(lastLive.current)) return lastLive.current as string;
      if (ok(coverHold.current)) return coverHold.current as string;
      if (ok(plateRef.current)) return plateRef.current;
    }
    const pin = refsHold.current.find((r) => r.id === id)?.src;
    if (ok(pin)) return pin as string;
    return "";
  }

  function packBridge(
    hallSrc: string,
    aSrc: string,
    bSrc: string,
    onHall: boolean,
    onA: boolean,
    onB: boolean,
    extra?: { id: string; name: string; src: string }[],
  ) {
    const rest = (extra || lookPackRef.current).filter((p) => p.id !== "same-hall" && p.id !== "door-a" && p.id !== "door-b");
    const head: { id: string; name: string; src: string }[] = [];
    if (onHall && hallSrc) head.push({ id: "same-hall", name: "hall", src: hallSrc });
    if (onA && aSrc) head.push({ id: "door-a", name: "A", src: aSrc });
    if (onB && bSrc) head.push({ id: "door-b", name: "B", src: bSrc });
    return [...head, ...rest];
  }

  async function fillBridgeFrom(_parentId?: string) {
    const ok = (u?: string) =>
      !!u && (u.startsWith("http") || u.startsWith("/") || u.startsWith("data:") || u.startsWith("blob:"));
    const prev = hallsHold.current[hallHold.current - 2];
    let hall = plateRef.current || startHold.current || refsMap.current.get("hall") || refsMap.current.get("seed") || "";
    let a = lastAt("m1");
    let b = lastAt("m2");
    if (prev) {
      const lastFrom = (id: string) => {
        const pose = prev.refs?.find((r) => r.id === `pose-${id}`)?.src;
        if (ok(pose)) return pose as string;
        const idle = prev.bank?.find((x) => x.key === `idle-${id}`)?.end;
        if (ok(idle)) return idle as string;
        const walk = prev.bank?.find((x) => x.end && x.key.endsWith(`→${id}`));
        return ok(walk?.end) ? (walk!.end as string) : "";
      };
      a = lastFrom("m1") || a;
      b = lastFrom("m2") || b;
      hall = [prev.start, prev.plate, prev.still, prev.refs?.find((r) => r.id === "hall")?.src, prev.refs?.find((r) => r.id === "seed")?.src].find(ok) || hall;
      if (!hall) hall = a || b || "";
      if (!a) a = hall || "";
      if (!b) b = hall || "";
    }
    const door: "a" | "b" = viaHold.current === "m2" && b ? "b" : a ? "a" : b ? "b" : "a";
    enterDoorRef.current = door;
    setEnterDoor(door);
    if (!hall) hall = a || b || "";
    if (!a) a = hall;
    if (!b) b = hall;
    setBridge({ hall, a, b });
    setBridgeOn({ hall: !!hall, a: door === "a" && !!a, b: door === "b" && !!b });
    setLookPack(packBridge(hall, a, b, !!hall, door === "a" && !!a, door === "b" && !!b, []));
    if (hall) {
      setPlate(hall);
      plateRef.current = hall;
    }
  }

  function doorPick(): "m1" | "m2" {
    if (hereRef.current === "m2") return "m2";
    if (viaHold.current === "m2") return "m2";
    return "m1";
  }

  function linkForward(pick: "m1" | "m2", dest: number) {
    nextHold.current = { ...nextHold.current, [pick]: String(dest) };
    const cur = hallsHold.current[hallHold.current - 1];
    if (cur) {
      hallsHold.current = putSlice(hallsHold.current, {
        ...cur,
        next: { ...(cur.next || {}), [pick]: dest },
      });
    }
  }

  function spawnChild(pick: "m1" | "m2") {
    if (hallHold.current >= 8) return String(hallHold.current);
    rememberSlice(snapHall());
    const roomsN = Math.min(8, Math.max(roomsHold.current, hallHold.current + 1));
    const childN = hallHold.current + 1;
    linkForward(pick, childN);
    const cleared = { ...riftRef.current };
    delete cleared[pick];
    riftRef.current = cleared;
    setRift(cleared);
    persist({ next: nextHold.current, rift: cleared, rooms: roomsN, halls: hallsHold.current, phase: "play" });
    fromHold.current = sid.current;
    viaHold.current = pick;
    hallHold.current = childN;
    roomsHold.current = roomsN;
    nextHold.current = {};
    skipAsk.current = "";
    pathFirst.current = pick;
    rememberSlice({
      n: childN,
      still: plateRef.current || startHold.current || "",
      start: startHold.current || plateRef.current || "",
      plate: plateRef.current || startHold.current || "",
      bank: [],
      refs: [],
      pins: [],
      via: pick,
    });
    persist({
      hall: childN,
      rooms: roomsN,
      halls: hallsHold.current,
      title: titleHold.current || undefined,
      plate: plateRef.current || startHold.current || "",
      start: startHold.current || plateRef.current || "",
      bank: [],
      next: undefined,
      from: undefined,
      via: pick,
      phase: "look",
    });
    return String(childN);
  }

  async function stampParentExit(url: string, end: string) {
    const via = viaHold.current === "m2" ? "m2" : "m1";
    if (!url || hallHold.current < 2) return;
    const prev = hallsHold.current[hallHold.current - 2];
    if (!prev) return;
    const key = `exit-${via}`;
    const nextBank = (prev.bank || []).filter((b) => b.key !== key);
    nextBank.push({ key, url, end: end || "" });
    hallsHold.current = putSlice(hallsHold.current, { ...prev, bank: nextBank });
    persist({ halls: hallsHold.current, phase: "play" });
  }

  async function prefetchExit(door: "m1" | "m2") {
    if (bank.current.get(`exit-${door}`)?.url) return;
    const dest = destHall(door);
    if (!dest) return;
    const child = hallsHold.current[dest - 1];
    const hit =
      child?.bank?.find((b) => b.key === "enter→spawn") ||
      child?.bank?.find((b) => b.key === `${door}→spawn`);
    if (!hit?.url) return;
    bank.current.set(`exit-${door}`, { url: hit.url, end: hit.end || "" });
    persist({ phase: "play" });
  }

  async function goEnter(door?: "m1" | "m2") {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    /* After Hang Room N, leftover Door A must not open FilmStage. */
    const pick: "m1" | "m2" = door === "m1" || door === "m2" ? door : enterAsk === "m2" ? "m2" : "m1";
    /* Leftover Hang A must not FilmStage. Breath at this door may enter. */
    if (hereRef.current !== pick) {
      if (now < hangGuard.current) return;
    }
    viaHold.current = pick;
    setEnterAsk(null);
    setTray(false);
    const dest = destHall(pick);
    const arts = readArtifacts();
    const enter = resolveHungEnter(doorLetterOf(pick), hallHold.current, sid.current, arts, riftRef.current);
    entering.current = true;
    playing.current = true;
    playTok.current += 1;
    try {
      if (enter.kind === "biome") {
        const bindHall =
          hungStayHall({
            artHall: arts.find((a) => a.id === enter.art)?.room?.hall,
            enterHall: enter.hall,
            hangRoom: hangRoomRef.current,
            liveHall: hallHold.current,
            doorHall: hungHallForDoor(doorLetterOf(pick), hallHold.current, arts),
          }) || enter.hall;
        /* Never snap a living Room 2+ hang down to Room 1 / Asteroid. */
        if (bindHall >= 2 && bindHall !== hallHold.current) await goHungHall(bindHall, false);
        const restored = hydrateRift(sid.current, hallHold.current, riftRef.current, arts);
        riftRef.current = restored;
        setRift(restored);
        await playRift(pick, restored[pick] || {
          biome: enter.biome,
          name: enter.name,
          still: enter.still,
          loop: enter.playlist[0] || enter.still,
          playlist: enter.playlist,
          trans: enter.trans,
          art: enter.art,
        });
        return;
      }
      /* Hung hall: never destHall / enter→spawn — stay in breath at this door. */
      if (hangDoorHall()) return;
      if (dest && dest < hallHold.current) {
        persist({ phase: "play", halls: putSlice(hallsHold.current, snapHall()) });
        await switchHall(dest, false);
        return;
      }
      if (!bank.current.get(`exit-${pick}`)?.url && dest) await prefetchExit(pick);
      const clip = bank.current.get(`exit-${pick}`) || (dest ? bank.current.get("enter→spawn") : null);
      if (clip?.url) {
        wrapping.current = false;
        setLoopOn(false);
        setBeat("playvid");
        beatRef.current = "playvid";
        setFrost("enter");
        setFilmUrl(clip.url);
        sfxForge("enter");
        holdNow(plateRef.current);
        await sleep(80);
        await Promise.race([playFilm(clip.url, 7200, plateRef.current, clip.end, false), sleep(7200)]);
        playing.current = false;
        holdNow(clip.end || lastLive.current);
        skipEnter.current = true;
      }
      if (dest && dest !== hallHold.current) {
        persist({ phase: "play", halls: putSlice(hallsHold.current, snapHall()) });
        await switchHall(dest, true);
        return;
      }
      enterNext(pick);
    } finally {
      entering.current = false;
      if (!sprintHold.current) playing.current = false;
    }
  }

  function enterNext(door?: "m1" | "m2") {
    if (door === "m1" || door === "m2") viaHold.current = door;
    setEnterAsk(null);
    setTray(false);
    setEditOn(false);
    setReelOn(false);
    setPhase("gate");
    phaseRef.current = "gate";
    setFrost("room");
    sfxForge("page");
  }

  function leaveSprint() {
    sprintHold.current = false;
    setSprint(null);
    setRiftBloom(null);
    setPhase("play");
    phaseRef.current = "play";
    armed.current = true;
    playing.current = false;
    entering.current = false;
    holdNow();
    holdIdle();
    setFrost("tap a door");
    sfxForge("page");
  }

  async function playRift(door: "m1" | "m2", gate: RiftGate) {
    setEnterAsk(null);
    setTray(false);
    setEditOn(false);
    setReelOn(false);
    stopFilm();
    setFilmOn(false);
    sfxForge("enter");
    riftCookTok.current += 1;
    swallowOpeningTap();
    const arts = readArtifacts();
    const liveArt = gate.art ? arts.find((x) => x.id === gate.art) : null;
    const liveGate = liveArt ? { ...gate, ...gateFromHung(liveArt), trans: gate.trans || liveArt.room?.trans } : gate;
    const restored = { ...riftRef.current, [door]: liveGate };
    riftRef.current = restored;
    setRift(restored);
    const enter = stayBiomePlay(
      resolveHungEnter(doorLetterOf(door), hallHold.current, sid.current, arts, restored),
    );
    const stay =
      enter.kind === "biome"
        ? enter
        : stayBiomePlay({
            kind: "biome",
            door: doorLetterOf(door),
            hall: hungEnterBindHall(liveArt?.room?.hall, hangRoomRef.current, hallHold.current) || hangRoomRef.current || hallHold.current,
            art: liveGate.art || "",
            biome: (liveGate.biome as BiomeName) || "open",
            name: liveGate.name,
            still: liveGate.still,
            trans: liveGate.trans || stockTransUrl(door, liveGate.biome as BiomeId),
            playlist: liveGate.playlist || [],
            clips: uniqueClips([liveGate.trans || "", ...(liveGate.playlist || []), liveGate.loop].filter(Boolean)),
          });
    const hall =
      hungStayHall({
        artHall: liveArt?.room?.hall,
        enterHall: stay.kind === "biome" ? stay.hall : hallHold.current,
        hangRoom: hangRoomRef.current,
        liveHall: hallHold.current,
        doorHall: hungHallForDoor(doorLetterOf(door), hallHold.current, arts),
      }) ||
      hungEnterBindHall(
        liveArt?.room?.hall,
        hangRoomRef.current,
        stay.kind === "biome" ? stay.hall : hallHold.current,
      ) ||
      hangBindHall(hangRoomRef.current) ||
      hangBindHall(stay.kind === "biome" ? stay.hall : 0) ||
      hangBindHall(hallHold.current) ||
      1;
    hangRoomRef.current = hall;
    setHangRoomN(hall);
    setLiveHall(hall);
    sprintHold.current = true;
    playing.current = true;
    setRiftBloom(null);
    const letter = door === "m2" ? "B" : "A";
    setSprint({
      film: riftFilm(stay.name, stay.still, stay.clips, hall, letter),
      door,
      name: stay.name,
      hall,
    });
  }

  function refreshHung() {
    const local = readArtifacts();
    setHungArts(local);
    void listHall()
      .then((hall) => setHungArts(mergeHall(hall || [], readArtifacts())))
      .catch(() => setHungArts(readArtifacts()));
  }

  function attachRift(door: "m1" | "m2", gate: RiftGate, hallWant?: number) {
    const bindHall = hangBindHall(hallWant);
    if (!bindHall) return;
    hangRoomRef.current = bindHall;
    setHangRoomN(bindHall);
    const hereHall = bindHall === hallHold.current;
    const next = { ...riftRef.current, [door]: gate };
    riftRef.current = next;
    setRift(next);
    if (nextHold.current[door]) {
      const rooms = { ...nextHold.current };
      delete rooms[door];
      nextHold.current = rooms;
    }
    const here = hallsHold.current.find((h) => h.n === bindHall);
    if (here) hallsHold.current = putSlice(hallsHold.current, { ...here, n: bindHall, rift: next });
    persist({
      phase: "play",
      rift: next,
      hall: bindHall,
      rooms: roomsHold.current,
      halls: hallsHold.current,
      next: Object.keys(nextHold.current).length ? nextHold.current : undefined,
    });
    try {
      const film = riftFilm(gate.name, gate.still, (gate.playlist?.length ? gate.playlist : [gate.loop]).filter(Boolean), bindHall, door === "m2" ? "B" : "A");
      let from = hungArts.length ? hungArts : readArtifacts();
      let artId = gate.art;
      if (!artId) {
        from = hangArtifact(film);
        artId = from[0]?.id || "";
      }
      if (artId) {
        const letter = door === "m2" ? "B" : "A";
        const head = from.find((x) => x.id === artId) || { id: artId, name: gate.name, still: gate.still, playlist: gate.playlist || [], prompt: gate.name, hungAt: Date.now(), grade: null };
        const wired = hangOnRoom(
          artId,
          bindHungRoom(head, letter, {
            citadel: hangCitadelRef.current || sid.current,
            hall: bindHall,
            still: gate.still && !isHallFilm(gate.still) ? gate.still : biomeStill((gate.biome as BiomeName) || "open"),
            trans: gate.trans || stockTransUrl(door),
            biome: (gate.biome as BiomeName) || "open",
          }),
          from,
        );
        if (wired.length) {
          setHungArts(wired);
          const a = wired.find((x) => x.id === artId);
          if (a) {
            void hangHall({
              data: {
                id: a.id,
                name: a.name,
                still: a.still,
                playlist: a.playlist,
                prompt: a.prompt || "",
                room: a.room,
              },
            }).catch(() => {});
          }
        }
      }
    } catch {
      /* vault still holds the door */
    }
    setRiftPick(null);
    setRiftDraft(null);
    setPhase("play");
    phaseRef.current = "play";
    /* Stay on the hall after hang — leftover must not pop enter → FilmStage. */
    const letter = door === "m2" ? "B" : "A";
    const chrome = hungPlayChrome(bindHall, letter);
    setFrost(
      hereHall
        ? gate.trans
          ? `${chrome.keeper} · opens`
          : `${chrome.keeper} · tap to enter`
        : `${chrome.keeper} · hung`,
    );
    sfxForge("enter");
    if (!sprintHold.current) holdIdle();
  }

  function dropRift(door: "m1" | "m2") {
    const gone = riftRef.current[door];
    const next = { ...riftRef.current };
    delete next[door];
    riftRef.current = next;
    setRift(next);
    persist({ phase: "play", rift: next });
    if (enterAsk === door) setEnterAsk(null);
    if (gone?.art) {
      const arts = dropRoom(gone.art, hungArts.length ? hungArts : undefined);
      setHungArts(arts);
      const a = arts.find((x) => x.id === gone.art);
      if (a) {
        void hangHall({
          data: {
            id: a.id,
            name: a.name,
            still: a.still,
            playlist: a.playlist,
            prompt: a.prompt || "",
            room: null,
          },
        }).catch(() => {});
      }
    }
    setFrost(`door ${door === "m2" ? "B" : "A"} is a hall again`);
    sfxForge("page");
  }

  function hallBg(door?: "m1" | "m2" | null) {
    return firstStill([
      door ? lastAt(door) : "",
      refsMap.current.get("hall"),
      refsMap.current.get("room"),
      plate,
      startHold.current,
      plateRef.current,
      lastLive.current,
    ]);
  }

  function thumbSrc(u?: string | null) {
    if (u && !u.startsWith("blob:") && !isStockArt(u) && !(u.startsWith("data:") && u.length > 480000)) return u;
    return firstStill([refsMap.current.get("hall"), startHold.current, plateRef.current]) || "";
  }

  function openArtefact(pick: "ask" | "m1" | "m2") {
    stopFilm();
    holdNow();
    playing.current = false;
    entering.current = false;
    wrapping.current = false;
    setTray(false);
    setEditOn(false);
    setReelOn(false);
    setEnterAsk(null);
    refreshHung();
    window.setTimeout(() => setRiftPick(pick), 60);
  }

  function beginRift(door: "m1" | "m2", gate: RiftGate, hall?: number) {
    const bindHall = hangBindHall(hall);
    if (!bindHall) return;
    hangRoomRef.current = bindHall;
    setHangRoomN(bindHall);
    setLiveHall(bindHall);
    setRiftPick(null);
    setHangAsk(null);
    riftCookTok.current += 1;
    /* Write the artefact bind first so applyHall / hydrateRift see hall N. */
    sprintHold.current = false;
    setSprint(null);
    setEnterAsk(null);
    attachRift(door, gate, bindHall);
    hangGuard.current = (typeof performance !== "undefined" ? performance.now() : Date.now()) + HANG_LEFTOVER_SWALLOW_MS;
    swallowOpeningTap();
    void goHungHall(bindHall, true).then(() => {
      if (hallHold.current !== bindHall) return goHungHall(bindHall, false);
    }).then(() => {
      attachRift(door, gate, bindHall);
      const letter = door === "m2" ? "B" : "A";
      const chrome = hungPlayChrome(bindHall, letter);
      setFrost(`${chrome.keeper} · ${gate.name}`);
    });
    void cookRiftTrans(door, gate, riftCookTok.current).then((url) => {
      if (!url) return;
      const live = riftRef.current[door];
      if (!live) return;
      attachRift(door, { ...live, trans: url }, bindHall);
      const letter = door === "m2" ? "B" : "A";
      setFrost(`${hungPlayChrome(bindHall, letter).keeper} · door opens`);
    });
  }

  function pickBiome(door: "m1" | "m2", biome: BiomeId) {
    const hit = BIOMES.find((b) => b.id === biome);
    if (!hit) return;
    beginRift(
      door,
      {
        biome: hit.id,
        name: hit.name,
        still: hit.still,
        loop: hit.loop,
        playlist: biomePlaylist(hit.id),
      },
      hangRoomRef.current,
    );
  }

  async function stillForCook(url?: string | null): Promise<string> {
    if (!url) return "";
    if (url.startsWith("http") || url.startsWith("/") || url.startsWith("data:")) return url;
    if (!url.startsWith("blob:")) return "";
    try {
      const r = await fetch(url);
      const blob = await r.blob();
      if (!blob.size || blob.size > 3_500_000) return "";
      return await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ""));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
    } catch {
      return "";
    }
  }

  async function cookRiftTrans(door: "m1" | "m2", gate: RiftGate, tok: number): Promise<string | null> {
    if (gate.trans) return gate.trans;
    const raw = lastAt(door) || plateRef.current || startHold.current || gate.still;
    const still = await stillForCook(raw);
    if (!still) return null;
    const world = BIOMES.find((b) => b.id === gate.biome)?.world || gate.name;
    const biomeStill = await stillForCook(gate.still);
    try {
      let started: { ok: true; requestId: string } | { ok: false; error: string } | null = null;
      for (let t = 0; t < 4; t++) {
        if (riftCookTok.current !== tok) return null;
        try {
          started = await startRuneFilm({
            data: {
              still,
              prompt: riftPrompt(world, door === "m2" ? "gold" : "teal"),
              duration: 6,
              refs: [still, biomeStill || gate.still].filter(Boolean),
              res: "720",
            },
          });
        } catch {
          started = { ok: false, error: "net" };
        }
        if (started?.ok) break;
        if (started?.error === "echo-off") {
          setFrost("Imagine is dark");
          return null;
        }
        if (isCookSlotBlock(started?.error)) {
          setSlotReason(started?.error || "busy");
          if (isLocalSlotHold(started?.error)) await freeRuneSlot({ data: {} }).catch(() => {});
          setFrost(cookBusyWaitFrost(started?.error));
          await sleep(4000 + t * 2000);
          continue;
        }
        setFrost(started?.error || "opening failed");
        await sleep(900);
      }
      if (!started?.ok) {
        void freeRuneSlot({ data: {} }).catch(() => {});
        return null;
      }
      let landed: string | null = null;
      try {
      for (let p = 0; p < 80; p++) {
        if (riftCookTok.current !== tok) return null;
        if (p) await sleep(1200);
        let polled;
        try {
          polled = await pollCookPlate({ data: { requestId: started.requestId } });
        } catch {
          continue;
        }
        if (!polled.ok) continue;
        if (polled.status === "done" && polled.url) {
          if (riftCookTok.current !== tok) return null;
          const cur = riftRef.current[door];
          if (cur && cur.biome === gate.biome) {
            const next = { ...riftRef.current, [door]: { ...cur, trans: polled.url } };
            riftRef.current = next;
            setRift(next);
            persist({ phase: "play", rift: next });
          }
          landed = polled.url;
          return polled.url;
        }
        if (polled.status === "failed") return null;
        setFrost(`Imagine is drawing the opening · ${p + 1}`);
      }
      } finally {
        if (!landed) void freeRuneSlot({ data: {} }).catch(() => {});
      }
    } catch {
      void freeRuneSlot({ data: {} }).catch(() => {});
      return null;
    }
    return null;
  }

  async function forgeOpening() {
    const draft = riftDraftRef.current;
    if (!draft || draft.cook === "cook") return;
    const tok = ++riftCookTok.current;
    setRiftDraft({ ...draft, cook: "cook" });
    setFrost("Imagine is drawing the opening");
    sfxForge("cook");
    const url = await cookRiftTrans(draft.door, draft.gate, tok);
    if (riftCookTok.current !== tok) return;
    if (url) {
      attachRift(draft.door, { ...draft.gate, trans: url });
      return;
    }
    setRiftDraft({ ...draft, cook: "fail" });
    setFrost("opening failed · skip or retry");
  }

  function skipOpening() {
    const draft = riftDraftRef.current;
    if (!draft) return;
    riftCookTok.current += 1;
    attachRift(draft.door, draft.gate);
  }

  function keepHall() {
    if (hallHold.current >= 8) {
      skipEnter.current = true;
      setPhase("play");
      phaseRef.current = "play";
      holdIdle();
      setFrost("tap a door");
      return;
    }
    const pick = doorPick();
    const n = Math.min(8, hallHold.current + 1);
    skipEnter.current = true;
    setHallsOn(false);
    setRiftPick(null);
    setRiftDraft(null);
    setEnterAsk(null);
    setFilmUrl(null);
    setFilmOn(false);
    rememberSlice(snapHall());
    linkForward(pick, n);
    const copy: HallSlice = {
      ...snapHall(),
      n,
      via: pick,
      rift: undefined,
      next: {},
    };
    rememberSlice(copy);
    applyHall(copy, true);
    persist({
      phase: "play",
      hall: n,
      rooms: hallsHold.current.length,
      halls: hallsHold.current,
      plate: plateRef.current,
      start: startHold.current,
      from: undefined,
      via: pick,
    });
    setPhase("play");
    phaseRef.current = "play";
    armed.current = true;
    playing.current = false;
    playTok.current += 1;
    lockHall(startHold.current || plateRef.current);
    holdIdle();
    setFrost("tap a door");
    sfxForge("enter");
  }

  function newHall() {
    const pick = doorPick();
    const a0 = lastAt("m1") || (hereRef.current === "m1" ? plateRef.current : "") || lastLive.current || "";
    const b0 = lastAt("m2") || (hereRef.current === "m2" ? plateRef.current : "") || "";
    const hallKeepStill =
      plateRef.current ||
      startHold.current ||
      lastAt("spawn") ||
      refsMap.current.get("hall") ||
      refsMap.current.get("seed") ||
      refsMap.current.get("room") ||
      lastLive.current ||
      a0 ||
      b0 ||
      "";
    const a = a0 || hallKeepStill;
    const b = b0 || hallKeepStill;
    const boltKeep = refsMap.current.get("bolt") || "";
    spawnChild(pick);
    setFilmUrl(null);
    setLockCover(null);
    setForged(0);
    forgedRef.current = 0;
    bank.current = new Map();
    setPins([]);
    pinsRef.current = [];
    setGraph(null);
    graphRef.current = null;
    setRefs([]);
    refsHold.current = [];
    refsMap.current = new Map();
    if (boltKeep) refsMap.current.set("bolt", boltKeep);
    lookHall.current = null;
    setStageSrc(null);
    const door: "a" | "b" = pick === "m2" ? "b" : "a";
    enterDoorRef.current = door;
    setEnterDoor(door);
    enterHold.current = { hall: hallKeepStill, a, b, pick: door };
    setBridge({ hall: hallKeepStill, a, b });
    setBridgeOn({ hall: !!hallKeepStill, a: door === "a" && !!a, b: door === "b" && !!b });
    setLookPack(packBridge(hallKeepStill, a, b, !!hallKeepStill, door === "a" && !!a, door === "b" && !!b, []));
    if (hallKeepStill) {
      setPlate(hallKeepStill);
      plateRef.current = hallKeepStill;
      startHold.current = hallKeepStill;
    }
    clearWish();
    setPhase("look");
    phaseRef.current = "look";
    sfxForge("page");
    persist({
      phase: "look",
      hall: hallHold.current,
      rooms: roomsHold.current,
      halls: hallsHold.current,
      plate: hallKeepStill,
      start: hallKeepStill,
      bank: [],
      next: undefined,
      from: undefined,
      via: pick,
    });
    void fillBridgeFrom();
  }

  async function resetHall() {
    liveForge.current = false;
    cooking.current = false;
    runId.current += 1;
    dead.current = false;
    playing.current = false;
    stopFilm();
    setFilmUrl(null);
    setLockCover(null);
    setForged(0);
    forgedRef.current = 0;
    bank.current = new Map();
    setPins([]);
    pinsRef.current = [];
    setGraph(null);
    graphRef.current = null;
    setRefs([]);
    refsHold.current = [];
    refsMap.current = new Map();
    lookHall.current = null;
    setPlate("");
    plateRef.current = "";
    startHold.current = "";
    setStageSrc(null);
    extraPath.current = false;
    enterHold.current = { hall: "", a: "", b: "", pick: enterDoorRef.current };
    await fillBridgeFrom();
    persist({ phase: "look", bank: [], forged: 0, plate: "", start: "", refs: [] });
    setPhase("look");
    phaseRef.current = "look";
    sfxForge("page");
  }

  function doneBoot() {
    booted.current = true;
    setBootPct(100);
    setBootLine("ready");
    window.setTimeout(() => setBootOn(false), 160);
  }

  async function openSession(id: string, quiet = false) {
    const live = peekLivePlay(id);
    if (sid.current === id && phaseRef.current === "play" && bank.current.size > 0) {
      setBootOn(false);
      return;
    }
    if (!quiet && !hallKeep.current && !plateRef.current) {
      setBootOn(true);
      setBootPct((n) => Math.max(n, 8));
      setBootLine("opening");
      setFrost("opening");
    }
    let s = await loadSession(id);
    if (!s) {
      const last = listSessions()[0];
      if (last) s = await loadSession(last.id);
    }
    if (!s) {
      setFrost("session missing");
      setBootOn(false);
      return;
    }
    setBootPct((n) => Math.max(n, 42));
    setBootLine("room");
    const hallStill = hallStillFrom(s);
    playTok.current += 1;
    loadGen.current += 1;
    stopFilm();
    sid.current = s.id;
    playing.current = false;
    queued.current = null;
    liveForge.current = false;
    armed.current = true;
    setTray(false);
    setEditOn(false);
    setReelOn(false);
    setWant(s.want);
    wantRef.current = s.want;
    setWalkSecs(clampWalk(s.walkSecs));
    walkSecsRef.current = clampWalk(s.walkSecs);
    setPins(s.pins?.length >= 2 ? s.pins : plannedObjects(2).map((o) => ({ id: o.id, name: o.name, x: o.x, y: o.y })));
    pinsRef.current = s.pins?.length >= 2 ? s.pins : plannedObjects(2).map((o) => ({ id: o.id, name: o.name, x: o.x, y: o.y }));
    const startStill = hallStill || hallKeep.current;
    if (startStill) startHold.current = startStill;
    roomsHold.current = s.rooms || 1;
    hallHold.current = s.hall || 1;
    fromHold.current = "";
    titleHold.current = s.title || "";
    viaHold.current = s.via || "";
    nextHold.current = s.next || {};
    const kids = listSessions().filter((x) => x.from === s.id && x.id !== s.id);
    let folded = seedHalls(s);
    if ((s.halls?.length || 0) < 2 && kids.length) {
      for (const k of kids) {
        try {
          const full = await loadSession(k.id);
          if (full?.id) folded = putSlice(folded, liveSlice(full, folded.length + 1));
        } catch {
          /* */
        }
      }
    }
    hallsHold.current = folded;
    roomsHold.current = Math.max(s.rooms || 1, hallsHold.current.length, s.hall || 1);
    const artsNow = readArtifacts();
    let wantHall = Math.max(1, Math.min(roomsHold.current, (boot?.kind === "session" && boot.hall) || s.hall || 1));
    const hungN = latestHungHall(artsNow);
    if (hungN) {
      roomsHold.current = Math.max(roomsHold.current, hungN);
      const hereHung = resolveHungEnter("A", wantHall, s.id, artsNow, s.rift).kind === "biome" || resolveHungEnter("B", wantHall, s.id, artsNow, s.rift).kind === "biome";
      if (!hereHung) wantHall = hungN;
    }
    hallHold.current = wantHall;
    hangRoomRef.current = wantHall;
    setHangRoomN(wantHall);
    setLiveHall(wantHall);
    const restored = hydrateRift(s.id, wantHall, s.rift || {}, artsNow);
    riftRef.current = restored;
    setRift(restored);
    if (artsNow.length) setHungArts(artsNow);
    skipAsk.current = "";
    setEnterAsk(null);
    if (boot?.kind === "session" && boot.do === "reset") {
      await resetHall();
      return;
    }
    const resume = live || peekLivePlay(s.id);
    const playNow = !(boot?.kind === "session" && (boot.do === "more" || boot.do === "room" || boot.do === "reset"));
    const hereNow = playNow ? SPAWN.id : resume?.here || s.here || SPAWN.id;
    const herePic = hallStill || firstStill([s.refs.find((r) => r.id === `pose-${hereNow}`)?.src, resume?.plate, s.plate]);
    refsHold.current = forgeTrayRefs(s.refs);
    refsMap.current = new Map(refsHold.current.map((r) => [r.id, r.src]));
    lockHall(herePic);
    setHere(hereNow);
    hereRef.current = hereNow;
    cameFrom.current = playNow ? "start" : s.cameFrom;
    const node = withSpawn(s.pins).find((n) => n.id === hereNow);
    bolt.current = node ? { x: node.x, y: node.y } : { x: SPAWN.x, y: SPAWN.y };
    setRefs(refsHold.current);
    if (s.wish) {
      const kept = cleanWish(s.wish);
      worldHold.current = kept;
      wishRef.current = kept;
      setWish(kept);
    }
    bank.current = new Map(
      (s.bank || [])
        .filter((b) => b?.key && b.url)
        .map((b) => [b.key, { url: b.url, end: b.end }]),
    );
    const slice = hallsHold.current[wantHall - 1];
    if (slice && (wantHall > 1 || (slice.bank || []).length > (s.bank || []).length)) {
      applyHall(slice, false);
    }
    if (hallsHold.current.length > 1) {
      persist({ halls: hallsHold.current, rooms: hallsHold.current.length, hall: wantHall, from: undefined });
    }
    const localEnd = [...bank.current.values()].map((v) => v.end).find((u) => u && u.startsWith("/films/") && !u.includes("hall-doors")) || "";
    if (!hangArt.current) {
    void (async () => {
      const remote = [s.plate, s.start, hallStill].filter((u): u is string => !!u && /^https?:\/\//.test(u));
      for (const u of remote) {
        try {
          const got = await cacheStill({ data: { url: u } });
          if (got.ok && got.url.startsWith("/")) {
            lockHall(got.url);
            persist({ plate: got.url, start: got.url });
            break;
          }
        } catch {
          /* */
        }
      }
    })();
    }
    for (const v of bank.current.values()) {
      if (!v.url) continue;
      try {
        const el = document.createElement("video");
        el.preload = "auto";
        el.muted = true;
        el.src = v.url;
      } catch {
        /* */
      }
    }
    setBootPct((n) => Math.max(n, 68));
    setBootLine("films");
    void fillEnds();
    if (!plateRef.current) {
      const fromBank = [...bank.current.values()].map((v) => v.end).find((u) => stillOk(u) && !isStockArt(u)) || "";
      if (fromBank) {
        setPlate(fromBank);
        plateRef.current = fromBank;
        if (!startHold.current) startHold.current = fromBank;
      }
    }
    if (!refsMap.current.get("seed")) refsMap.current.set("seed", plateRef.current);
    if (!refsMap.current.get("room")) refsMap.current.set("room", plateRef.current);
    setForged(s.forged);
    forgedRef.current = s.forged;
    const g = compileCitadel(hallStill || plateRef.current || HALL_FALLBACK, pinsRef.current, s.walkSecs);
    setGraph(g);
    graphRef.current = g;
    setBeat("idle");
    beatRef.current = "idle";
    lockHall(firstStill([hallStill, plateRef.current, startHold.current]) || TOUR_PLATE);
    setLook(null);
    syncWalks();
    setBootPct((n) => Math.max(n, 88));
    const need = planWalks(g.nodes.map((n) => n.id), filmCapRef.current).length;
    const have = [...bank.current.entries()].filter(([k, v]) => v.url && (k.includes("→") || k.includes("←"))).length;
    const askedPlay = !(boot?.kind === "session" && (boot.do === "more" || boot.do === "room" || boot.do === "reset"));
    setStripOn(false);
    if (askedPlay) {
      setPhase("play");
      phaseRef.current = "play";
      armed.current = true;
      playing.current = false;
      skipEnter.current = false;
      idleArmed.current = true;
      if (hangArt.current) {
        stopFilm();
        filmLoop.current = false;
        setLoopOn(false);
        setFilmOn(false);
        setCoverFade(false);
        lockHall(TOUR_PLATE);
        rememberHall(s.id, TOUR_PLATE);
        setFrost("hang your artefact on a door");
        sfxForge("enter");
        const art = hangArt.current;
        hangArt.current = undefined;
        refreshHung();
        setRiftPick("ask");
        const hit = readArtifacts().find((a) => a.id === art);
        if (hit) setFrost(`${hit.name} · hang on A or B`);
        doneBoot();
        markLivePlay(s.id, hereRef.current, TOUR_PLATE);
        return;
      }
      const frame = livingNow();
      if (frame.playFrame === "fail") {
        lockHall(frame.still);
        setPhase("forge");
        phaseRef.current = "forge";
        setPlayFrameKind("fail");
        setPlayWalksOn(false);
        setFrost(frame.frost);
        doneBoot();
        return;
      }
      lockHall(frame.still);
      rememberHall(s.id, hallKeep.current || frame.still);
      setPlate(frame.still);
      plateRef.current = frame.still;
      setPlayFrameKind(frame.playFrame);
      setPlayWalksOn(true);
      setFrost("tap a door");
      sfxForge("enter");
      holdIdle();
      doneBoot();
      markLivePlay(s.id, hereRef.current, hallKeep.current || frame.still);
      return;
    }
    if (s.phase === "gate" && !skipEnter.current) {
      setPhase("gate");
      phaseRef.current = "gate";
      setFrost("room 2");
      sfxForge("page");
      doneBoot();
      return;
    }
    if (have === 0) {
      await fillBridgeFrom();
      setPhase("look");
      phaseRef.current = "look";
      sfxForge("page");
      doneBoot();
      return;
    }
    if ((s.phase === "forge" || s.phase === "time") && have < need && s.pins.length) {
      setPhase("forge");
      phaseRef.current = "forge";
      sfxForge("cook");
      doneBoot();
      void cookWalks(g, true).catch(() => failStay("forge paused · tap retry"));
      return;
    }
    const hasA = !!(bank.current.get("spawn→m1") || bank.current.get("spawn←start→m1"));
    const hasB = !!(bank.current.get("spawn→m2") || bank.current.get("spawn←start→m2"));
    pathFirst.current = hasA && !hasB ? "m1" : hasB && !hasA ? "m2" : pathFirst.current ?? "m1";
    setNeedOther(!(hasA && hasB));
    if (boot?.kind === "session" && boot.do === "more" && !(hasA && hasB)) {
      extraPath.current = true;
      pathFirst.current = hasA ? "m2" : "m1";
      setPhase("forge");
      phaseRef.current = "forge";
      sfxForge("cook");
      doneBoot();
      void cookWalks(g, true).catch(() => failStay("forge paused · tap retry"));
      return;
    }
    if (boot?.kind === "session" && boot.do === "room") {
      doneBoot();
      enterNext();
      return;
    }
    setPhase("play");
    phaseRef.current = "play";
    armed.current = true;
    playing.current = false;
    lockHall(hallStill);
    rememberHall(s.id, hallStill || hallKeep.current);
    setFrost("tap a door");
    sfxForge("enter");
    doneBoot();
    markLivePlay(s.id, hereRef.current, hallKeep.current || plateRef.current);
  }

  function wipeSession(id: string) {
    void dropSession(id).then(() => setHub(listSessions()));
  }

  /** Background Imagine recook of the 6 room clips. Never steals beat — stock stays tapable. */
  async function cookRoomQuiet() {
    if (quietCook.current || dead.current) return;
    quietCook.current = true;
    const first = pathFirst.current || "m1";
    const walks = pathWalks(first);
    const still = hallKeep.current || HALL_STILL;
    const list = withSpawn(pinsRef.current);
    try {
      for (const w of walks) {
        if (dead.current) return;
        const key = `${w.from}←${w.via}→${w.to}`;
        const have = bank.current.get(key) || bank.current.get(`${w.from}→${w.to}`);
        if (have?.url && !isHallFilm(have.url)) continue;
        const from = list.find((n) => n.id === w.from) ?? SPAWN;
        const to = list.find((n) => n.id === w.to) ?? SPAWN;
        const url = await cookFilm(
          still,
          walkPrompt(from, to, w.from === "spawn", [gazeLaw(to.id), brainLaws()].filter(Boolean).join(" "), false),
          [],
          `${w.from}→${w.to}`,
          6,
          true,
        );
        if (!url) return;
        bank.current.set(key, { url, end: still });
        bank.current.set(`${w.from}→${w.to}`, { url, end: still });
        syncWalks();
      }
      for (const n of ["spawn", "m1", "m2"] as const) {
        if (dead.current) return;
        const have = bank.current.get(`idle-${n}`);
        if (have?.url && !isHallFilm(have.url)) continue;
        const url = await cookFilm(still, idlePrompt(gazeLaw(n)), [], `still ${n}`, 6, true);
        if (!url) return;
        bank.current.set(`idle-${n}`, { url, end: still });
        syncWalks();
      }
    } finally {
      quietCook.current = false;
    }
  }

  /** New citadel play: locked hall camera, living breath/walks inside that frame. */
  function enterLivingRoom(first: "m1" | "m2") {
    pathFirst.current = first;
    roomsHold.current = Math.max(1, roomsHold.current || 1);
    hallHold.current = Math.max(1, hallHold.current || 1);
    const hungLive = latestHungHall(readArtifacts());
    if (hungLive) {
      roomsHold.current = Math.max(roomsHold.current, hungLive);
      hallHold.current = hungLive;
      hangRoomRef.current = hungLive;
      setHangRoomN(hungLive);
      setLiveHall(hungLive);
    }
    titleHold.current = titleHold.current || "Citadel";
    const doors = plannedObjects(2).map((o) => ({ id: o.id, name: o.name, x: o.x, y: o.y }));
    setWant(2);
    wantRef.current = 2;
    setFilmCap(6);
    filmCapRef.current = 6;
    setPins(doors);
    pinsRef.current = doors;
    doorHitRef.current = STOCK_HITS;
    setDoorHit(STOCK_HITS);
    lockHall(HALL_STILL);
    hallKeep.current = HALL_STILL;
    startHold.current = HALL_STILL;
    plateRef.current = HALL_STILL;
    setPlate(HALL_STILL);
    rememberHall(sid.current, HALL_STILL);
    bank.current = new Map(stockRoomBank(first).map((b) => [b.key, { url: b.url, end: b.end }]));
    refsMap.current.set("hall", HALL_STILL);
    refsMap.current.set("seed", HALL_STILL);
    refsMap.current.set("room", HALL_STILL);
    refsMap.current.set("empty", HALL_STILL);
    const refs = [
      { id: "hall", name: "hall", src: HALL_STILL },
      { id: "seed", name: "seed", src: HALL_STILL },
    ];
    refsHold.current = refs;
    setRefs(refs);
    const g = compileCitadel(HALL_STILL, doors, walkSecsRef.current);
    setGraph(g);
    graphRef.current = g;
    setHere(SPAWN.id);
    hereRef.current = SPAWN.id;
    cameFrom.current = "start";
    bolt.current = { x: SPAWN.x, y: SPAWN.y };
    setPhase("play");
    phaseRef.current = "play";
    armed.current = true;
    playing.current = false;
    liveForge.current = false;
    setBeat("idle");
    beatRef.current = "idle";
    setPlayFrameKind("breath");
    setPlayWalksOn(true);
    setNeedOther(false);
    setNeedStill(false);
    setFrost("");
    syncWalks();
    const restored = hydrateRift(sid.current, hallHold.current, riftRef.current, readArtifacts());
    riftRef.current = restored;
    setRift(restored);
    persist({
      phase: "play",
      plate: HALL_STILL,
      start: HALL_STILL,
      thumb: HALL_STILL,
      title: titleHold.current,
      name: titleHold.current,
      here: SPAWN.id,
      cameFrom: "start",
      rooms: roomsHold.current,
      hall: hallHold.current,
      rift: restored.m1 || restored.m2 ? restored : undefined,
      refs,
    });
    markLivePlay(sid.current, SPAWN.id, HALL_STILL);
    holdIdle();
    window.setTimeout(() => {
      measurePic();
      scanDoors();
      if (phaseRef.current === "play" && !playing.current && !sprintHold.current) holdIdle();
    }, 160);
    sfxForge("enter");
    sheetOf("walk");
    sheetOf("idle");
    for (const v of bank.current.values()) warmUrl(v.url);
    void cookRoomQuiet();
  }

  begin.current = () => {
    if (boot?.kind === "path") {
      pathFirst.current = boot.first;
      roomsHold.current = boot.rooms || 1;
      hallHold.current = boot.hall || 1;
      hangRoomRef.current = hallHold.current;
      setHangRoomN(hallHold.current);
      setLiveHall(hallHold.current);
      wantIdle.current = boot.stills === true;
      setWant(2);
      setFilmCap(6);
      if (hangArt.current) {
        lockHall(TOUR_PLATE);
        setPhase("play");
        phaseRef.current = "play";
        setRiftPick("ask");
        setFrost("hang your artefact on a door");
      } else if (pathEntry(boot.stills) === "stock") {
        enterLivingRoom(boot.first);
      } else if (shouldResumeForgePlay({ done: lookForgeAlreadyDone(), liveId: peekLivePlay()?.id })) {
        const liveId = peekLivePlay()?.id;
        if (liveId) void openSession(liveId, true);
      } else {
        setPhase("look");
        phaseRef.current = "look";
        window.setTimeout(() => kickAutoBotForgeRef.current(), 0);
      }
    }
  };

  useEffect(() => {
    if (boot?.kind !== "session") return;
    if (booted.current) return;
    void openSession(boot.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot?.kind, boot && boot.kind === "session" ? boot.id : ""]);

  function forge(secs?: WalkSecs) {
    if (pins.length < want) return;
    const dur = clampWalk(secs ?? walkSecsRef.current);
    setWalkSecs(dur);
    walkSecsRef.current = dur;
    const g = compileCitadel(plate, pins, dur);
    setGraph(g);
    graphRef.current = g;
    setForged(0);
    forgedRef.current = 0;
    setNowClip(null);
    setPhase("forge");
    phaseRef.current = "forge";
    setBeat("shot");
    beatRef.current = "shot";
    setPose(plate);
    lastPose.current = null;
    setShots([plate]);
    plateShot.current = false;
    liveForge.current = true;
    forgeClock.current = 0;
    setHere(SPAWN.id);
    hereRef.current = SPAWN.id;
    bolt.current = { x: SPAWN.x, y: SPAWN.y };
    walk.current = null;
    queued.current = null;
    sfxForge("cook");
    void cookWalks(g).catch(() => failStay("forge paused · tap retry"));
  }

  function pickSecs(n: WalkSecs) {
    const dur = clampWalk(n);
    setWalkSecs(dur);
    walkSecsRef.current = dur;
    sfxForge("page");
    forge(dur);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])].slice(0, 6);
    e.target.value = "";
    if (!files.length) return;
    if (phaseRef.current === "look") {
      for (const f of files) {
        const url = URL.createObjectURL(f);
        if (!lookHall.current) lookHall.current = url;
        setLookPack((p) => [...p, { id: `pic-${Date.now()}-${p.length}`, name: "photo", src: url }]);
      }
      return;
    }
    usePlate(URL.createObjectURL(files[0]!));
  }

  async function cookPlate(line: string) {
    const world = line.trim().slice(0, 140);
    if (!world || cook) return;
    setCook(true);
    setFrost("forging the plate");
    sfxForge("cook");
    try {
      const res = await startCookStill({ data: { world, kind: "citadel" } });
      if (res.ok && res.url) {
        usePlate(res.url);
        setFrost("");
      } else {
        setFrost(res.ok ? "" : res.error === "echo-off" ? "forge is quiet" : "plate failed");
      }
    } catch {
      setFrost("plate failed");
    }
    setCook(false);
    setHowl(false);
  }

  function startHowl() {
    unlockAudio();
    if (howl && rec.current) {
      try {
        rec.current.stop();
      } catch {
        /* */
      }
      setHowl(false);
      setFrost("");
      return;
    }
    const recEngine = speechEngine();
    if (!recEngine) {
      setHowl(false);
      ear.current?.focus();
      return;
    }
    try {
      rec.current?.abort?.();
    } catch {
      /* */
    }
    recEngine.lang = navigator.language || "fr-FR";
    recEngine.interimResults = true;
    recEngine.continuous = true;
    recEngine.onresult = (ev) => {
      let line = "";
      for (let i = 0; i < ev.results.length; i++) line += ev.results[i]?.[0]?.transcript ?? "";
      wishRef.current = line;
      worldHold.current = cleanWish(line);
      setWish(line);
    };
    recEngine.onerror = () => {
      setHowl(false);
      setFrost("mic off · type the room");
      ear.current?.focus();
    };
    recEngine.onend = () => {
      setHowl(false);
      const line = wishRef.current.trim();
      if (phaseRef.current === "look") {
        worldHold.current = cleanWish(line);
        return;
      }
      if (line) void cookPlate(line);
    };
    rec.current = recEngine;
    setHowl(true);
    setFrost("listening…");
    try {
      recEngine.start();
    } catch {
      setHowl(false);
      setFrost("mic off · type the room");
      ear.current?.focus();
    }
  }

  const status =
    cook || frost
      ? frost
      : phase === "look"
        ? "this room"
        : phase === "count"
        ? "citadel refs"
        : phase === "mark"
        ? pins.length < want
          ? `tap the ${plannedObjects(want)[pins.length]?.name ?? "object"}`
          : `${pins.length}/${want} · tap the flame`
        : phase === "time"
          ? `${counts.total} videos · ${counts.idles} idle · ${counts.walks} walks`
      : phase === "refs"
        ? frost || `ref · ${loadName}`
        : phase === "forge" && graph
            ? beat === "cook"
              ? frost || `forging video · ${walkSecs}s`
              : beat === "playvid"
                ? `video · ${nowClip ? clipLabel(nowClip.id) : "walk"}`
                : beat === "shot"
                  ? shots.length <= 1
                    ? "shot · whole room"
                    : "shot · last frame"
                  : beat === "idle"
                    ? `${nowClip ? clipLabel(nowClip.id) : "idle"} · breathing`
                    : `video · ${nowClip ? clipLabel(nowClip.id) : "walk"} · ${walkSecs}s`
            : graph
              ? `${graph.idles.length} idle · ${graph.walks.length} walks · pose locked`
              : "";

  const planLine =
    phase === "time"
      ? `${counts.walks} walks ${walkSecs}s · ${counts.generate} videos to forge · idle = breathe · never stops`
      : phase === "mark" && ready
        ? `${counts.idles} idle · ${counts.walks} walks · ${counts.generate} to forge`
        : "";

  const uiBlock = phase === "count" || phase === "look" || phase === "time" || phase === "refs";

  function takeLookWish() {
    const raw = (ear.current?.value ?? wishRef.current ?? "").trim();
    const kept = cleanWish(raw);
    wishRef.current = raw;
    setWish(raw);
    worldHold.current = kept;
    setStyleOn(kept);
    return kept;
  }

  function lockWish() {
    const kept = takeLookWish();
    if (!kept) {
      setStyleOn("");
      setFrost(wishRef.current.trim() ? "style blocked · two doors + bolt" : "type a style first");
      return;
    }
    setFrost(`locked · ${kept.slice(0, 36)}`);
  }

  function clearWish() {
    wishRef.current = "";
    worldHold.current = "";
    setWish("");
    setStyleOn("");
    setFrost("");
    if (ear.current) ear.current.value = "";
  }

  function startBotForge() {
    if (botKick.current) return false;
    if (phaseRef.current !== "look") return false;
    botKick.current = true;
    const start = lookForgeStart("bot", {
      style: styleOn,
      still: lookHall.current,
      pack: lookPackRef.current,
    });
    if (start.sealed) {
      clearWish();
      startRefs(false, "sealed");
      return true;
    }
    startRefs(false, "hall");
    return true;
  }
  startBotForgeRef.current = startBotForge;

  function kickAutoBotForge() {
    if (lookForgeAlreadyDone()) return false;
    if (botForgeAuto.current) return false;
    const stills = boot?.kind === "path" ? boot.stills : undefined;
    const forge = (boot?.kind === "path" ? boot.forge : undefined) || parseLookForge(typeof window !== "undefined" ? window.location.search : undefined);
    if (!shouldAutoStartBotForge({ phase: "look", forge, stills })) return false;
    if (!claimLookForgeAuto()) return false;
    botForgeAuto.current = true;
    setForgeAutoOn(true);
    return startBotForge();
  }
  kickAutoBotForgeRef.current = kickAutoBotForge;

  useEffect(() => {
    if (phase !== "look") return;
    botKick.current = false;
    kickAutoBotForge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function computeHangRooms(arts = hungArts): { rooms: HangRoomPick[]; citadels: HangCitadelPick[]; citadel: string } {
    const rows = listSessions();
    const last = { id: hangCitadelRef.current || sid.current, hall: hallHold.current, rooms: roomsHold.current };
    const cit = bindCitadel(rows, last, hangCitadelRef.current || sid.current);
    const extra = [
      ...listStoredHallHints(cit.citadel).map((h) => ({
        ...h,
        living: h.hall === hallHold.current && cit.citadel === sid.current,
        citadel: cit.citadel || undefined,
      })),
      ...(cit.citadel === sid.current
        ? hallsHold.current.map((h) => ({
            hall: h.n,
            name: `Room ${h.n}`,
            still: h.still || h.plate || "",
            living: h.n === hallHold.current,
            citadel: sid.current,
          }))
        : []),
    ];
    return {
      rooms: listHangRooms(rows, last, arts, extra, liveHangRooms, cit.citadel),
      citadels: listHangCitadels(rows, last, cit.citadel),
      citadel: cit.citadel,
    };
  }

  function livingHangRooms(arts = hungArts): HangRoomPick[] {
    return computeHangRooms(arts).rooms;
  }

  function refreshLiveHang(arts = hungArts): HangRoomPick[] {
    const next = computeHangRooms(arts);
    hangCitadelRef.current = next.citadel;
    setHangCitadel(next.citadel);
    setHangCitadels(next.citadels);
    setLiveHangRooms(next.rooms);
    return next.rooms;
  }

  function pickHangCitadel(id: string) {
    if (!id || id === hangCitadelRef.current) return;
    hangCitadelRef.current = id;
    setHangCitadel(id);
    const rooms = refreshLiveHang();
    pickHangHall(defaultHangRoom(rooms));
  }

  function askLiveHang(a: HungArtifact, door: "A" | "B") {
    if (hangAsk) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now < hangGuard.current) return;
    swallowOpeningTap();
    hangGuard.current = now + HANG_LEFTOVER_SWALLOW_MS;
    const rooms = refreshLiveHang();
    const next = livingHangHall(rooms, hangRoomRef.current) || defaultHangRoom(rooms);
    pickHangHall(next);
    setHangAsk({ a, door });
  }

  useEffect(() => {
    if (!riftPick && !hangAsk) return;
    const rooms = refreshLiveHang();
    /* Sheet pick is the source of truth — a late hydrate must not snap
       Room 3 back to last-hung / living hall 8. */
    if (hangAsk) return;
    const next = livingHangHall(rooms, hangRoomRef.current) || defaultHangRoom(rooms);
    pickHangHall(next);
  }, [riftPick, hungArts, hangAsk]);

  useEffect(() => {
    const api: BoltForgeHook = {
      startBot: () => startBotForgeRef.current(),
    };
    window.__boltForge = api;
    return () => {
      if (window.__boltForge === api) delete window.__boltForge;
    };
  }, []);

  if (sprint) {
    return (
      <div data-biome-play="1" data-biome-stay="1" data-biome-door={sprint.door} data-biome-name={sprint.name} data-biome-hall={sprint.hall}>
        <FilmStage
          id={sprint.film.id}
          original={false}
          custom={sprint.film}
          ramp={false}
          holdHall={sprint.hall}
          holdDoor={sprint.door === "m2" ? "B" : "A"}
          onHallDoor={() => {
            /* hung enter stays on biome — Leave exits */
          }}
          onExit={() => leaveSprint()}
          onDone={() => {
            /* stay on biome — Leave calls onExit */
          }}
        />
      </div>
    );
  }

  function riftOverlay() {
    if (riftDraft) {
      const door = riftDraft.door;
      const gate = riftDraft.gate;
      const fromStill = hallBg(door);
      const forging = riftDraft.cook === "cook";
      const failed = riftDraft.cook === "fail";
      return (
        <div
          className="absolute inset-0 z-[80] flex flex-col overflow-hidden bg-black/55 px-5 pt-[max(1.4rem,env(safe-area-inset-top))] pb-[max(1.1rem,env(safe-area-inset-bottom))]"
          data-rift-open="1"
          style={{ touchAction: "manipulation" }}
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
          }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,12,0.72)_0%,rgba(7,8,12,0.38)_28%,rgba(7,8,12,0.7)_100%)]" />
          <button
            type="button"
            className="relative z-10 self-start font-mono text-[10px] uppercase tracking-[0.42em] text-white/55"
            style={{ touchAction: "manipulation" }}
            onPointerUp={() => {
              if (forging) return;
              riftCookTok.current += 1;
              setRiftDraft(null);
              setRiftPick(door);
            }}
          >
            Back
          </button>
          <p className="relative z-10 mt-6 font-mono text-[10px] uppercase tracking-[0.48em] text-white/45">Opening</p>
          <h1 className="relative z-10 mt-1 font-display text-[2.6rem] leading-none text-white/90 drop-shadow-[0_10px_28px_rgba(0,0,0,0.9)]">
            {gate.name}
          </h1>
          <p className="relative z-10 mt-3 max-w-xs font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
            door {door === "m2" ? "B" : "A"} · 6s film from this hall into the artefact
          </p>
          <div className="relative z-10 mt-6 grid grid-cols-2 gap-3">
            <div className="overflow-hidden rounded-2xl border border-white/15 bg-black/40">
              <img src={fromStill || ""} alt="" className="h-36 w-full object-cover" />
              <p className="px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">this room</p>
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/15 bg-black/40">
              <img src={thumbSrc(gate.still)} alt="" className="h-36 w-full object-cover" />
              <p className="px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#9ef0e4]">{gate.name}</p>
            </div>
          </div>
          <p className="relative z-10 mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/50">
            {forging ? frost || "Imagine is drawing the opening" : failed ? frost || "opening failed · skip or retry" : "forge a 6s transition, or skip"}
          </p>
          <div className="relative z-10 mt-auto mb-4 flex w-full max-w-xs flex-col items-center gap-5 self-center">
            <button
              type="button"
              disabled={forging}
              className="flex h-16 w-full items-center justify-center font-display text-4xl text-[#f0d48a] drop-shadow-[0_0_22px_rgba(228,195,122,0.55)] disabled:opacity-40"
              style={{ touchAction: "manipulation" }}
              onPointerUp={() => {
                if (forging) return;
                void forgeOpening();
              }}
            >
              {forging ? "Forging" : failed ? "Retry" : "Forge opening"}
            </button>
            <button
              type="button"
              className="flex h-16 w-full items-center justify-center font-display text-4xl text-ice drop-shadow-[0_0_22px_rgba(158,240,228,0.35)]"
              style={{ touchAction: "manipulation" }}
              onPointerUp={() => skipOpening()}
            >
              Skip
            </button>
          </div>
        </div>
      );
    }
    if (!riftPick) return null;
    const hung = hungArts;
    const door = riftPick === "ask" ? null : riftPick;
    const onDoor = door ? rift[door] : null;
    const doors: { id: "m1" | "m2"; letter: string; gate?: RiftGate }[] = [
      { id: "m1", letter: "A", gate: rift.m1 },
      { id: "m2", letter: "B", gate: rift.m2 },
    ];
    const hungBlock = hung.length ? (
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#f0d48a]">your artefacts</p>
        {hung.slice(0, 8).map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-3 overflow-hidden rounded-2xl border border-[#e4c37a]/30 bg-black/45 pr-2"
          >
            <img src={thumbSrc(a.still)} alt="" className="h-16 w-12 shrink-0 object-cover" />
            <span className="min-w-0 flex-1 py-2 font-display text-xl text-ice">{a.name}</span>
            {door ? (
              <button
                type="button"
                data-hang={door === "m2" ? "B" : "A"}
                className="shrink-0 px-3 font-mono text-[9px] uppercase tracking-[0.16em] text-[#f0d48a]"
                style={{ touchAction: "manipulation" }}
                onPointerUp={() => askLiveHang(a, door === "m2" ? "B" : "A")}
              >
                Hang
              </button>
            ) : (
              <>
                <button
                  type="button"
                  data-hang="A"
                  className="shrink-0 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#9ef0e4]"
                  style={{ touchAction: "manipulation" }}
                  onPointerUp={() => askLiveHang(a, "A")}
                >
                  A
                </button>
                <button
                  type="button"
                  data-hang="B"
                  className="shrink-0 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#f0d48a]"
                  style={{ touchAction: "manipulation" }}
                  onPointerUp={() => askLiveHang(a, "B")}
                >
                  B
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    ) : (
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35">no hung artefact yet · cook one in Artifacts</p>
    );
    return (
      <div
        className="absolute inset-0 z-[80] flex flex-col overflow-hidden bg-black/55 px-5 pt-[max(1.4rem,env(safe-area-inset-top))] pb-[max(1.1rem,env(safe-area-inset-bottom))]"
        data-rift="1"
        style={{ touchAction: "manipulation" }}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,12,0.7)_0%,rgba(7,8,12,0.4)_28%,rgba(7,8,12,0.72)_100%)]" />
        <button
          type="button"
          className="relative z-10 self-start font-mono text-[10px] uppercase tracking-[0.42em] text-white/55"
          style={{ touchAction: "manipulation" }}
          onPointerUp={() => {
            if (door) setRiftPick("ask");
            else {
              setRiftPick(null);
              if (phaseRef.current === "play") holdIdle();
            }
          }}
        >
          Back
        </button>
        <p className="relative z-10 mt-6 font-mono text-[10px] uppercase tracking-[0.48em] text-white/45">Artefact</p>
        <h1 className="relative z-10 mt-1 font-display text-[2.6rem] leading-none text-white/90 drop-shadow-[0_10px_28px_rgba(0,0,0,0.9)]">
          {door ? `Door ${door === "m2" ? "B" : "A"}` : "Vault"}
        </h1>
        <p className="relative z-10 mt-3 max-w-xs font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
          {door
            ? onDoor
              ? `${onDoor.name} lives behind this door`
              : "hang your artefact · then forge a 6s opening"
            : `room ${hangRoomN} · hang on A or B, then a transition film`}
        </p>
        <div className="relative z-10 mt-4 sr-only">
          <HangCitadelStrip citadels={hangCitadels} citadel={hangCitadel} onCitadel={pickHangCitadel} />
          <HangRoomStrip
            rooms={(liveHangRooms.length ? liveHangRooms : livingHangRooms(hung)).map((r) => ({
              ...r,
              still: thumbSrc(r.still),
            }))}
            hall={hangRoomN}
            onHall={pickHangHall}
          />
        </div>
        <div className="relative z-10 mt-6 mb-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {hungBlock}
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#9ef0e4]">this room</p>
            {doors.map((d) => (
              <div
                key={d.id}
                className="flex h-16 items-center gap-3 overflow-hidden rounded-2xl border border-white/15 bg-black/45 pr-2"
              >
                {d.gate ? (
                  <img src={thumbSrc(d.gate.still)} alt="" className="h-16 w-12 shrink-0 object-cover" />
                ) : (
                  <span className="flex h-16 w-12 shrink-0 items-center justify-center font-display text-2xl text-white/25">
                    {d.letter}
                  </span>
                )}
                <button
                  type="button"
                  className="min-w-0 flex-1 py-2 text-left"
                  style={{ touchAction: "manipulation" }}
                  onPointerUp={() => setRiftPick(d.id)}
                >
                  <span className="block font-display text-xl text-ice">
                    {d.gate ? d.gate.name : `Door ${d.letter}`}
                  </span>
                  <span className="block font-mono text-[9px] uppercase tracking-[0.16em] text-white/40">
                    {d.gate ? `door ${d.letter} · hung` : "empty"}
                  </span>
                </button>
                {d.gate ? (
                  <button
                    type="button"
                    className="shrink-0 px-3 font-mono text-[9px] uppercase tracking-[0.16em] text-white/45"
                    style={{ touchAction: "manipulation" }}
                    onPointerUp={() => dropRift(d.id)}
                  >
                    Drop
                  </button>
                ) : (
                  <button
                    type="button"
                    className="shrink-0 px-3 font-mono text-[9px] uppercase tracking-[0.16em] text-[#9ef0e4]"
                    style={{ touchAction: "manipulation" }}
                    onPointerUp={() => setRiftPick(d.id)}
                  >
                    Add
                  </button>
                )}
              </div>
            ))}
          </div>
          {door ? (
            <>
              <button
                type="button"
                data-biome-bot={biomeBotStart().dataBiome}
                className="rounded-2xl border border-[#9ef0e4]/35 bg-black/45 px-3 py-3 text-left font-display text-xl text-[#9ef0e4]"
                style={{ touchAction: "manipulation" }}
                onPointerUp={() => pickBiome(door, "asteroid")}
              >
                Grok Bot Biome
                <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">
                  sealed asteroid · no picker
                </span>
              </button>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#9ef0e4]">biome</p>
              <div className="grid grid-cols-2 gap-3">
                {BIOMES.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className="overflow-hidden rounded-2xl border border-white/15 bg-black/40 text-left"
                    style={{ touchAction: "manipulation" }}
                    onPointerUp={() => pickBiome(door, b.id)}
                  >
                    <img src={b.still} alt="" loading="lazy" className="h-28 w-full object-cover" />
                    <p className="px-3 py-2 font-display text-lg text-white/90">{b.name}</p>
                    <p className="px-3 pb-3 font-mono text-[9px] uppercase tracking-[0.16em] text-white/40">{b.tag}</p>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  function hangAskOverlay() {
    if (!hangAsk) return null;
    const rooms = (liveHangRooms.length ? liveHangRooms : livingHangRooms()).map((r) => ({
      ...r,
      still: thumbSrc(r.still),
    }));
    return (
      <HangAskSheet
        door={hangAsk.door}
        name={hangAsk.a.name}
        rooms={rooms}
        hall={hangRoomN}
        onHall={pickHangHall}
        citadels={hangCitadels}
        citadel={hangCitadel}
        onCitadel={pickHangCitadel}
        onClose={() => setHangAsk(null)}
        onConfirm={(hall, act) => {
          const dest = hangCitadelRef.current || sid.current;
          const bindHall = hangBindHall(hall);
          const choice = hangDoorAct(act);
          hangGuard.current = (typeof performance !== "undefined" ? performance.now() : Date.now()) + HANG_LEFTOVER_SWALLOW_MS;
          swallowOpeningTap();
          setHangAsk(null);
          const door = hangAsk.door === "B" ? "m2" : "m1";
          /* Bind writes the door and stays on Hang UI. Enter walks as today. */
          attachRift(door, gateFromHung(hangAsk.a), bindHall);
          if (!hangActEnters(choice)) return;
          writeHangPending({ id: hangAsk.a.id, citadel: dest || "", hall: bindHall });
          if (dest && dest !== sid.current && bindHall) {
            const roomsN = Math.max(bindHall, rooms.filter((r) => !r.citadel || r.citadel === dest).length, 1);
            stampPlay(dest, hangCitadels.find((c) => c.id === dest)?.title, bindHall, roomsN);
            const href = walkHangHallHref(dest, bindHall, roomsN) || walkHungHref({ hall: bindHall, door: hangAsk.door, citadel: dest }, roomsN);
            if (href) window.location.assign(href);
            return;
          }
          void goHungHall(bindHall, true);
        }}
      />
    );
  }

  if (phase === "gate") {
    const hall = plate || startHold.current || TOUR_PLATE;
    return (
      <div
        className="relative flex min-h-dvh flex-col overflow-hidden bg-bg px-5 pt-[max(1.4rem,env(safe-area-inset-top))] pb-[max(1.1rem,env(safe-area-inset-bottom))]"
        data-gate="1"
        data-hall={liveHall}
        style={{ touchAction: "manipulation" }}
      >
        <img src={hall} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,12,0.62)_0%,rgba(7,8,12,0.18)_28%,transparent_48%,transparent_58%,rgba(7,8,12,0.7)_100%)]" />
        <button
          type="button"
          className="relative z-10 self-start font-mono text-[10px] uppercase tracking-[0.42em] text-white/55"
          style={{ touchAction: "manipulation" }}
          onPointerUp={() => {
            if (hallHold.current > 1) {
              void switchHall(hallHold.current - 1, false);
              return;
            }
            goBack();
          }}
        >
          Back
        </button>
        <p className="relative z-10 mt-6 font-mono text-[10px] uppercase tracking-[0.48em] text-white/45">Citadel</p>
        <h1 className="relative z-10 mt-1 font-display text-[2.6rem] leading-none text-white/90 drop-shadow-[0_10px_28px_rgba(0,0,0,0.9)]">
          Room {liveHall}
        </h1>
        <p className="relative z-10 mt-3 max-w-xs font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
          same films · new hall · or a biome
        </p>
        <div className="relative z-10 mt-auto mb-4 flex w-full max-w-xs flex-col items-center gap-5 self-center">
          <button
            type="button"
            className="flex h-16 w-full items-center justify-center font-display text-4xl text-[#9ef0e4] drop-shadow-[0_0_22px_rgba(158,240,228,0.45)]"
            style={{ touchAction: "manipulation" }}
            onPointerUp={() => keepHall()}
          >
            Continue
          </button>
          <button
            type="button"
            className="flex h-16 w-full items-center justify-center font-display text-4xl text-[#f0d48a] drop-shadow-[0_0_22px_rgba(228,195,122,0.55)]"
            style={{ touchAction: "manipulation" }}
            onPointerUp={() => newHall()}
          >
            New room
          </button>
          <button
            type="button"
            className="flex h-16 w-full items-center justify-center font-display text-4xl text-ice drop-shadow-[0_0_22px_rgba(158,240,228,0.35)]"
            style={{ touchAction: "manipulation" }}
            onPointerUp={() => openArtefact(doorPick())}
          >
            Artefact
          </button>
        </div>
        {riftOverlay()}
        {hangAskOverlay()}
      </div>
    );
  }

  if (phase === "look") {
    const lookLock = {
      style: styleOn,
      still: lookHall.current,
      pack: lookPack,
    };
    const botForge = lookForgeStart("bot", lookLock);
    return (
      <div
        className="relative flex min-h-dvh flex-col overflow-hidden bg-bg px-5 pt-[max(1.4rem,env(safe-area-inset-top))] pb-[max(1.1rem,env(safe-area-inset-bottom))]"
        data-look="1"
        data-look-lock={lookHallLocked(lookLock) ? "1" : "0"}
        data-forge-auto={boot?.kind === "path" && boot.forge === "bot" ? "1" : undefined}
        style={{ touchAction: "manipulation" }}
      >
        <img src={bridge.hall || plate || HALL_FALLBACK} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,12,0.55)_0%,rgba(7,8,12,0.08)_22%,transparent_42%,transparent_62%,rgba(7,8,12,0.55)_100%)]" />
        <div className="relative z-10 flex items-center justify-between">
          <button
            type="button"
            className="font-mono text-[10px] uppercase tracking-[0.42em] text-white/55"
            style={{ touchAction: "manipulation" }}
            onPointerUp={() => {
              if (hallHold.current > 1) {
                void switchHall(hallHold.current - 1, false);
                return;
              }
              goBack();
            }}
          >
            Back
          </button>
          {hallHold.current > 1 ? (
            <button
              type="button"
              className="font-mono text-[10px] uppercase tracking-[0.42em] text-[#f0d48a]"
              style={{ touchAction: "manipulation" }}
              onPointerUp={() => void resetHall()}
            >
              Reset
            </button>
          ) : null}
        </div>
        <p className="relative z-10 mt-6 font-mono text-[10px] uppercase tracking-[0.48em] text-white/45">Citadel</p>
        <h1 className="relative z-10 mt-1 font-display text-[2.6rem] leading-none tracking-[0.04em] text-white/90 drop-shadow-[0_10px_28px_rgba(0,0,0,0.9)]">
          Hall{hallHold.current > 1 ? ` ${hallHold.current}` : ""}
        </h1>
        <input
          ref={ear}
          value={wish}
          maxLength={180}
          enterKeyHint="done"
          autoComplete="off"
          placeholder={bridgeOn.hall && bridge.hall ? "add a table…" : "style… then lock"}
          className="relative z-10 mt-4 w-full border-0 bg-transparent font-display text-xl text-[#9ef0e4] outline-none placeholder:text-white/30"
          onChange={(e) => {
            wishRef.current = e.target.value;
            setWish(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              lockWish();
              ear.current?.blur();
            }
          }}
        />
        <div className="relative z-10 mt-2 flex items-center gap-5">
          <button
            type="button"
            className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#f0d48a]"
            style={{ touchAction: "manipulation" }}
            onClick={() => {
              lockWish();
              ear.current?.blur();
            }}
          >
            Lock
          </button>
          <button
            type="button"
            className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/40"
            style={{ touchAction: "manipulation" }}
            onClick={() => clearWish()}
          >
            Clear
          </button>
          {styleOn ? (
            <span className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[#9ef0e4]/80">
              {styleOn}
            </span>
          ) : null}
        </div>
        <div className="relative z-50 mt-4 flex items-center gap-3">
          <button
            type="button"
            aria-label="Mic"
            className={`h-[4.4rem] w-[4.4rem] overflow-hidden rounded-full shadow-[0_0_22px_rgba(80,220,230,0.55)] ${howl ? "ring-2 ring-[#9ef0e4]" : "ring-1 ring-[#7ee0d2]/70"}`}
            style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            onClick={(e) => {
              e.stopPropagation();
              startHowl();
            }}
          >
            <img src="/ui/glyph-mic.jpg" alt="" className="h-full w-full scale-110 object-cover" />
          </button>
          <label
            aria-label="Photos"
            className="h-[4.4rem] w-[4.4rem] overflow-hidden rounded-full shadow-[0_0_22px_rgba(228,195,122,0.5)] ring-1 ring-[#e4c37a]/70"
            style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
          >
            <img src="/ui/glyph-photo.jpg" alt="" className="h-full w-full scale-110 object-cover" />
            <input type="file" accept="image/*" multiple className="hidden" onChange={onFile} />
          </label>
          <div className="ml-auto flex items-center gap-4">
            {(["720", "1080"] as const).map((r) => (
              <button
                key={r}
                type="button"
                className={
                  lookRes === r
                    ? "font-display text-2xl text-[#f0d48a] drop-shadow-[0_0_12px_rgba(228,195,122,0.8)]"
                    : "font-mono text-[11px] uppercase tracking-[0.2em] text-white/35"
                }
                style={{ touchAction: "manipulation" }}
                onClick={() => {
                  setLookRes(r);
                  lookResRef.current = r;
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        {howl ? (
          <p className="relative z-50 mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#9ef0e4]">listening</p>
        ) : null}
        {fromHold.current || bridge.hall || bridge.a || bridge.b ? (
          <div className="relative z-10 mt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
              last frames of room 1 · tap same + A or B
            </p>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                className={`relative h-28 w-[4.4rem] overflow-hidden rounded-xl ${bridgeOn.hall ? "ring-[3px] ring-white" : "ring-1 ring-white/20 opacity-40"}`}
                style={{ touchAction: "manipulation" }}
                onPointerUp={() => {
                  const on = { ...bridgeOn, hall: !bridgeOn.hall };
                  setBridgeOn(on);
                  setLookPack(packBridge(bridge.hall || plate, bridge.a, bridge.b, on.hall, on.a, on.b));
                  if (on.hall) window.setTimeout(() => ear.current?.focus(), 30);
                }}
              >
                {bridge.hall || plate ? (
                  <img src={bridge.hall || plate} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-black/50" />
                )}
                <span className="absolute left-1 top-1 rounded bg-black/70 px-1 font-mono text-[8px] uppercase tracking-[0.12em] text-white">
                  {bridgeOn.hall ? "on" : "off"}
                </span>
                <span className="absolute bottom-1 left-0 right-0 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                  same
                </span>
              </button>
              <button
                type="button"
                className={`relative h-28 w-[4.4rem] overflow-hidden rounded-xl ${bridgeOn.a ? "ring-[3px] ring-[#9ef0e4]" : "ring-1 ring-white/20 opacity-40"}`}
                style={{ touchAction: "manipulation" }}
                onPointerUp={() => {
                  const on = { ...bridgeOn, a: !bridgeOn.a, b: bridgeOn.a ? bridgeOn.b : bridgeOn.b };
                  if (!bridgeOn.a) {
                    on.a = true;
                    enterDoorRef.current = "a";
                    setEnterDoor("a");
                  } else {
                    on.a = false;
                  }
                  setBridgeOn(on);
                  setLookPack(packBridge(bridge.hall, bridge.a || plate, bridge.b, on.hall, on.a, on.b));
                }}
              >
                {bridge.a || plate ? (
                  <img src={bridge.a || plate} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-black/50" />
                )}
                <span className="absolute left-1 top-1 rounded bg-black/70 px-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#9ef0e4]">
                  {bridgeOn.a ? (enterDoor === "a" ? "enter" : "on") : "off"}
                </span>
                <span className="absolute bottom-1 left-0 right-0 text-center font-display text-lg text-[#9ef0e4] drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">A</span>
              </button>
              <button
                type="button"
                className={`relative h-28 w-[4.4rem] overflow-hidden rounded-xl ${bridgeOn.b ? "ring-[3px] ring-[#e4c37a]" : "ring-1 ring-white/20 opacity-40"}`}
                style={{ touchAction: "manipulation" }}
                onPointerUp={() => {
                  const on = { ...bridgeOn };
                  if (!bridgeOn.b) {
                    on.b = true;
                    enterDoorRef.current = "b";
                    setEnterDoor("b");
                  } else {
                    on.b = false;
                  }
                  setBridgeOn(on);
                  setLookPack(packBridge(bridge.hall, bridge.a, bridge.b || plate, on.hall, on.a, on.b));
                }}
              >
                {bridge.b || plate ? (
                  <img src={bridge.b || plate} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-black/50" />
                )}
                <span className="absolute left-1 top-1 rounded bg-black/70 px-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[#e4c37a]">
                  {bridgeOn.b ? (enterDoor === "b" ? "enter" : "on") : "off"}
                </span>
                <span className="absolute bottom-1 left-0 right-0 text-center font-display text-lg text-[#f0d48a] drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">B</span>
              </button>
            </div>
          </div>
        ) : null}
        {lookPack.filter((p) => p.id !== "same-hall" && p.id !== "door-a" && p.id !== "door-b").length ? (
          <div className="relative z-10 mt-3 flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {lookPack
              .filter((p) => p.id !== "same-hall" && p.id !== "door-a" && p.id !== "door-b")
              .map((p) => (
                <img key={p.id} src={p.src} alt="" className="h-14 w-10 shrink-0 rounded-lg object-cover ring-1 ring-white/30" />
              ))}
          </div>
        ) : null}
        <div className="relative z-30 mt-auto flex flex-col items-center gap-3">
          <button
            type="button"
            data-forge={lookForgeStart("start").dataForge}
            className="flex h-16 w-full max-w-xs items-center justify-center font-display text-4xl text-[#f0d48a] drop-shadow-[0_0_22px_rgba(228,195,122,0.55)]"
            style={{ touchAction: "manipulation" }}
            onPointerUp={() => {
              const kept = takeLookWish();
              if (wishRef.current.trim() && !kept) setFrost("style blocked · two doors + bolt");
              startRefs();
            }}
          >
            Forge
          </button>
          <button
            type="button"
            data-forge={botForge.dataForge}
            data-forge-start="bot"
            data-forge-pack={botForge.pack}
            className="relative z-40 isolate flex min-h-[4.5rem] w-full max-w-xs items-center justify-center px-5 py-4 font-display text-2xl text-[#9ef0e4] drop-shadow-[0_0_18px_rgba(158,240,228,0.4)]"
            style={{ touchAction: "manipulation", pointerEvents: "auto", WebkitTapHighlightColor: "transparent" }}
            onPointerUp={(e) => {
              e.preventDefault();
              e.stopPropagation();
              startBotForge();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              startBotForge();
            }}
          >
            Grok Bot Forge
          </button>
          <button
            type="button"
            className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/40"
            style={{ touchAction: "manipulation" }}
            onPointerUp={() => {
              clearWish();
              lookHall.current = null;
              setLookPack(packBridge(bridge.hall, bridge.a, bridge.b, bridgeOn.hall, bridgeOn.a, bridgeOn.b, []));
              startRefs();
            }}
          >
            default hall
          </button>
        </div>
      </div>
    );
  }

  if (phase === "count") {
    return (
      <div className="relative min-h-dvh overflow-hidden bg-bg">
        <BootScreen pct={bootPct || 12} label={bootLine} />
      </div>
    );
  }

  const playCover = playCoverStill({
    hall: lookHall.current || refsMap.current.get("hall") || hallKeep.current,
    empty: refsMap.current.get("empty"),
    start: startHold.current,
    plate,
    placed: refsMap.current.get("placed"),
    seed: refsMap.current.get("seed"),
    room: refsMap.current.get("room"),
  });
  const hungDoor = rift.m1 ? "A" : rift.m2 ? "B" : null;
  const boundArt = [...hungArts]
    .filter((a) => a.room?.door === hungDoor && hangBindHall(a.room?.hall))
    .sort((p, q) => (q.hungAt || 0) - (p.hungAt || 0))[0];
  const chromeHall =
    hangBindHall(boundArt?.room?.hall) || hangBindHall(hangRoomN) || hangBindHall(liveHall) || 1;
  const chromeDoor = doorLetterOf(boundArt?.room?.door || hungDoor || "A");
  const livingChrome = hungDoor ? hungPlayChrome(chromeHall, chromeDoor) : null;

  return (
    <div
      className="relative min-h-dvh overflow-hidden bg-bg"
      data-rune="engine"
      data-forge-pack={forgePack}
      data-forge-wish={forgeWish}
      data-forge-auto={forgeAutoOn ? "1" : undefined}
      data-camera="lock"
      data-living={phase === "play" && (filmOn || Boolean(idleFor(here))) ? "1" : "0"}
      data-play-frame={phase === "play" ? playFrameKind || "hall" : phase === "forge" && playFrameKind === "fail" ? "fail" : undefined}
      data-play-still={phase === "play" ? (isBoltSilhouette(playCover) ? "bolt" : "hall") : undefined}
      data-play-walks={phase === "play" && playWalksOn ? "1" : "0"}
      data-phase={phase}
      data-clips={counts.total}
      data-idles={counts.idles}
      data-walks={counts.walks}
      data-generate={counts.generate}
      data-walksecs={walkSecs}
      data-beat={beat}
      data-shots={shots.length}
      data-forged={forged}
      data-here={here}
      data-hall={liveHall}
      data-door-hit={doorHit ? "1" : "0"}
      data-stock-walk={phase === "play" && (beat === "playvid" || beat === "walk") ? "1" : "0"}
      data-marks={pins.length}
      data-rift={rift.m1 || rift.m2 ? "1" : "0"}
      data-hall-wired={phase === "play" && (rift.m1 || rift.m2) ? "1" : undefined}
      data-pick={pick ? "1" : "0"}
      data-cook={cook ? "1" : "0"}
      data-slot-reason={slotReason || undefined}
      style={{ touchAction: "manipulation" }}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={() => {
        swipe.current = null;
      }}
    >
      <div ref={layer} className="absolute inset-0 bg-bg">
        {phase !== "refs" ? (
        <img
          ref={img}
          src={playCover || HALL_FALLBACK}
          alt=""
          draggable={false}
          onError={(e) => {
            const cur = e.currentTarget.src;
            if (isStockArt(cur) || cur.endsWith("empty")) return;
            e.currentTarget.removeAttribute("src");
          }}
          onLoad={() => {
            const el = canvas.current;
            const root = layer.current;
            const pic = img.current;
            if (!el || !root || !pic) return;
            const box = filmBox(
              root.getBoundingClientRect(),
              (pic.naturalWidth || 9) / (pic.naturalHeight || 16),
            );
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            el.width = Math.max(1, Math.round(box.w * dpr));
            el.height = Math.max(1, Math.round(box.h * dpr));
            el.style.left = `${box.x}px`;
            el.style.top = `${box.y}px`;
            el.style.width = `${box.w}px`;
            el.style.height = `${box.h}px`;
            setPicBox(box);
            scanDoors();
          }}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain object-center"
        />
        ) : null}
        <canvas ref={canvas} className={`pointer-events-none absolute ${phase === "play" ? "z-50" : ""}`} />
        <video
          ref={film}
          muted
          playsInline
          preload="auto"
          onLoadedData={(e) => notePaint(e.currentTarget)}
          onPlaying={(e) => notePaint(e.currentTarget)}
          onTimeUpdate={(e) => stampLoop(e.currentTarget)}
          onEnded={(e) => againLoop(e.currentTarget)}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain object-center"
          style={{
            opacity: filmOn && paintA && filmUrl && (beat === "playvid" || beat === "walk" || (phase === "play" && beat === "idle")) && !uiBlock ? 1 : 0,
            zIndex: useB ? 28 : 32,
          }}
        />
        <video
          ref={filmB}
          muted
          playsInline
          preload="auto"
          onLoadedData={(e) => notePaint(e.currentTarget)}
          onPlaying={(e) => notePaint(e.currentTarget)}
          onTimeUpdate={(e) => stampLoop(e.currentTarget)}
          onEnded={(e) => againLoop(e.currentTarget)}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain object-center"
          style={{
            opacity: filmOn && paintB && filmUrl && (beat === "playvid" || beat === "walk" || (phase === "play" && beat === "idle")) && !uiBlock ? 1 : 0,
            zIndex: useB ? 32 : 28,
          }}
        />
        {(lockCover || hallKeep.current || plate) && !isStockArt(lockCover || hallKeep.current || plate) && !isBoltSilhouette(lockCover || hallKeep.current || plate) ? (
          <img
            src={durableStill(lockCover) || hallKeep.current || (plate && !isBoltSilhouette(plate) && !/\.mp4(\?|$)/i.test(plate) && !plate.includes("imgen.x.ai") ? plate : "") || HALL_FALLBACK}
            alt=""
            draggable={false}
            onError={(e) => {
              e.currentTarget.removeAttribute("src");
            }}
            className={`pointer-events-none absolute inset-0 z-[26] h-full w-full object-contain object-center ${coverFade && filmOn && (paintA || paintB) ? "opacity-0" : "opacity-100"}`}
          />
        ) : null}
        {phase === "forge" && beat === "shot" && pose ? (
          <img
            src={pose}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain object-center"
          />
        ) : null}
        {beat === "shot" && phase === "forge" ? (
          <div className="pointer-events-none absolute inset-0 bg-ice/12" />
        ) : null}
        {false && phase === "play" && graphOn && pins.length && (beat === "idle" || beat === "playvid") ? (
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 z-[35] -translate-x-1/2 -translate-y-1/2"
            style={{
              width: "min(100%, calc(100dvh * 9 / 16))",
              height: "min(100%, calc(100dvw * 16 / 9))",
            }}
          >
            <svg viewBox="0 0 90 160" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              <defs>
                <filter id="nav-glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="0.55" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {(() => {
                const nodes = [{ ...SPAWN }, ...pins];
                const at = (id: string) => nodes.find((n) => n.id === id);
                const px = (n: RuneNode) => n.x * 90;
                const py = (n: RuneNode) => n.y * 160;
                const edges: [string, string][] = [
                  ["spawn", "m1"],
                  ["spawn", "m2"],
                  ["m1", "m2"],
                ];
                return (
                  <>
                    {edges.map(([a, b]) => {
                      const A = at(a);
                      const B = at(b);
                      if (!A || !B) return null;
                      const live = a === here || b === here;
                      const x1 = px(A);
                      const y1 = py(A);
                      const x2 = px(B);
                      const y2 = py(B);
                      return (
                        <g key={`${a}-${b}`}>
                          <line
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke={live ? "rgba(186,255,244,0.22)" : "rgba(228,195,122,0.1)"}
                            strokeWidth={live ? 1.15 : 0.7}
                          />
                          <line
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke={live ? "rgba(186,255,244,0.95)" : "rgba(228,195,122,0.55)"}
                            strokeWidth={live ? 0.38 : 0.22}
                            strokeDasharray={live ? "0" : "1.1 1.4"}
                            strokeLinecap="round"
                          />
                        </g>
                      );
                    })}
                    {nodes.map((n) => {
                      const on = n.id === here;
                      const ring = n.id === "m1" ? "#8ef0e2" : n.id === "m2" ? "#e8c882" : "#d9fff8";
                      const x = px(n);
                      const y = py(n);
                      const s = on ? 2.35 : 1.85;
                      const tag = n.id === "m1" ? "A" : n.id === "m2" ? "B" : "S";
                      const hung = n.id === "m1" || n.id === "m2" ? rift[n.id] : undefined;
                      return (
                        <g key={n.id} filter={on ? "url(#nav-glow)" : undefined}>
                          {on ? (
                            <polygon
                              points={`${x},${y - s * 1.85} ${x + s * 1.85},${y} ${x},${y + s * 1.85} ${x - s * 1.85},${y}`}
                              fill="none"
                              stroke={ring}
                              strokeWidth={0.18}
                              opacity={0.35}
                            />
                          ) : null}
                          <polygon
                            points={`${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`}
                            fill={on ? `${ring}22` : "rgba(4,10,14,0.55)"}
                            stroke={ring}
                            strokeWidth={on ? 0.42 : 0.28}
                          />
                          <circle cx={x} cy={y} r={on ? 0.55 : 0.38} fill={on ? ring : "rgba(255,255,255,0.9)"} />
                          <text
                            x={x}
                            y={y - s - 1.6}
                            textAnchor="middle"
                            fill={ring}
                            fontSize="2.35"
                            fontFamily="IBM Plex Mono, ui-monospace, monospace"
                            letterSpacing="0.18"
                            opacity={0.92}
                          >
                            {tag}
                          </text>
                          {hung ? (
                            <text
                              x={x}
                              y={y + s + 2.6}
                              textAnchor="middle"
                              fill={ring}
                              fontSize="1.55"
                              fontFamily="IBM Plex Mono, ui-monospace, monospace"
                              letterSpacing="0.12"
                              opacity={0.82}
                            >
                              {hung.name.slice(0, 10)}
                            </text>
                          ) : null}
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </svg>
          </div>
        ) : null}
      </div>
      {phase === "play" && (rift.m1 || rift.m2) ? (
        <p
          className="pointer-events-none absolute left-4 right-4 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] text-center font-mono text-[11px] uppercase tracking-[0.22em] text-white/70"
          data-living-hall={chromeHall}
          data-living-door={chromeDoor}
        >
          {livingChrome ? `${livingChrome.keeper} ${livingChrome.name}` : ""}
        </p>
      ) : null}
      {phase === "play" || beat === "cook" || beat === "playvid" ? null : (
      <button
        type="button"
        className="absolute left-4 top-[max(0.7rem,env(safe-area-inset-top))] z-50 flex h-11 items-center rounded-full border border-white/20 bg-black/50 px-4 font-mono text-[11px] uppercase tracking-[0.18em] text-ice"
        style={{ touchAction: "manipulation" }}
        onPointerUp={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (hallHold.current > 1) {
            skipEnter.current = true;
            void switchHall(hallHold.current - 1, false);
            return;
          }
          goBack();
        }}
      >
        Back
      </button>
      )}
      {phase === "play" ? null : hallHold.current > 1 ? (
        <button
          type="button"
          className="absolute right-4 top-[max(0.7rem,env(safe-area-inset-top))] z-50 flex h-11 items-center rounded-full border border-white/20 bg-black/50 px-4 font-mono text-[11px] uppercase tracking-[0.18em] text-[#f0d48a]"
          style={{ touchAction: "manipulation" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            void resetHall();
          }}
        >
          Reset
        </button>
      ) : null}
      {phase === "play" ? (
        <div className="pointer-events-none absolute inset-0 z-[80]" data-doors="1">
          {(["m1", "m2"] as const).map((id) => {
            const hit = (doorHit || STOCK_HITS)[id];
            const layerRect = layer.current?.getBoundingClientRect();
            const box =
              picBox ||
              (layerRect
                ? filmBox(layerRect, 9 / 16)
                : typeof window !== "undefined"
                  ? filmBox({ width: window.innerWidth, height: window.innerHeight, left: 0, top: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }, 9 / 16)
                  : null);
            const left = box ? box.x + hit.x * box.w : id === "m1" ? "8%" : "54%";
            const top = box ? box.y + hit.y * box.h : "24%";
            const width = box ? hit.w * box.w : "38%";
            const height = box ? hit.h * box.h : "44%";
            return (
              <button
                key={id}
                type="button"
                aria-label={id}
                data-door={id}
                className="pointer-events-auto absolute"
                style={{
                  left,
                  top,
                  width,
                  height,
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  background: "rgba(0,0,0,0.01)",
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  goTo(id);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
              />
            );
          })}
        </div>
      ) : null}
      {phase === "play" ? null : (
      <p className="pointer-events-none absolute left-4 right-4 top-[max(2.6rem,calc(env(safe-area-inset-top)+1.6rem))] text-center font-display text-lg tracking-wide text-fg/80">
        {status}
      </p>
      )}
      {clipsUI.length && phase === "forge" ? (
        <>
          {reelOn ? null : (
          <button
            type="button"
            aria-label="films"
            className="absolute left-0 top-[42%] z-50 flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-r-2xl border border-white/20 bg-black/50"
            style={{ touchAction: "manipulation" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setReelOn(true);
              trayAt.current = Date.now();
            }}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#f0d48a]" style={{ writingMode: "vertical-rl" }}>
              films
            </span>
          </button>
          )}
          {reelOn ? (
            <div
              className="absolute bottom-[max(5rem,env(safe-area-inset-bottom))] left-0 top-[max(4.2rem,calc(env(safe-area-inset-top)+3.2rem))] z-50 w-[46%] max-w-48 overflow-visible"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                aria-label="close films"
                className="absolute top-1/2 left-full z-50 flex h-24 w-10 -translate-y-1/2 items-center justify-center rounded-r-2xl border border-white/25 bg-black/70"
                style={{ touchAction: "manipulation" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setReelOn(false);
                }}
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#f0d48a]" style={{ writingMode: "vertical-rl" }}>
                  close
                </span>
              </button>
              <div className="flex h-full flex-col gap-2 overflow-y-auto bg-black/55 px-2 py-3">
              <p className="px-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#f0d48a]">clips</p>
              {(["still", "breathe", "walk"] as const).map((kind) => {
                const rows = clipsUI.filter((c) => c.kind === kind);
                if (!rows.length) return null;
                return (
                  <div key={kind} className="flex flex-col gap-2">
                    <p className="px-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#f0d48a]">{kind}</p>
                    {rows.map((c) => {
                      const live = bank.current.get(baseKey(c.key));
                      const on = !!live?.url && live.url === c.url;
                      const canRedo = c.kind === "walk" || c.kind === "breathe";
                      return (
                      <div key={c.key} className="overflow-hidden rounded-2xl border border-white/15 bg-black/40">
                        <button
                          type="button"
                          className="block w-full"
                          style={{ touchAction: "manipulation" }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                          }}
                          onPointerUp={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            if (Date.now() - trayAt.current < 500) return;
                            void playOne(c.url, c.end, c.label);
                          }}
                        >
                          {c.end ? (
                            <img src={c.end} alt="" className="h-24 w-full object-cover" />
                          ) : (
                            <div className="h-24 w-full bg-black/40" />
                          )}
                          <p className="px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ice">
                            {c.label}
                            {on ? " · on" : ""}
                          </p>
                        </button>
                        <div className="flex border-t border-white/10">
                          {canRedo ? (
                            <button
                              type="button"
                              className="flex h-9 flex-1 items-center justify-center font-mono text-[9px] uppercase tracking-[0.14em] text-[#9ef0e4]"
                              style={{ touchAction: "manipulation" }}
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                              }}
                              onPointerUp={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                if (Date.now() - trayAt.current < 500) return;
                                recookClip(c.key);
                              }}
                            >
                              Redo
                            </button>
                          ) : null}
                          {canRedo && !on ? (
                            <button
                              type="button"
                              className="flex h-9 flex-1 items-center justify-center border-l border-white/10 font-mono text-[9px] uppercase tracking-[0.14em] text-[#f0d48a]"
                              style={{ touchAction: "manipulation" }}
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                              }}
                              onPointerUp={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                if (Date.now() - trayAt.current < 500) return;
                                useTake(c.key);
                              }}
                            >
                              Use
                            </button>
                          ) : null}
                          {c.url ? (
                            <button
                              type="button"
                              className="flex h-9 flex-1 items-center justify-center border-l border-white/10 font-mono text-[9px] uppercase tracking-[0.14em] text-[#f0d48a]"
                              style={{ touchAction: "manipulation" }}
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                              }}
                              onPointerUp={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                if (Date.now() - trayAt.current < 500) return;
                                void saveOne(c.url, `bolt-${c.label}`);
                              }}
                            >
                              Save
                            </button>
                          ) : null}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                );
              })}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      {phase === "forge" ? (
        <>
          {hallsOn ? null : (
            <button
              type="button"
              aria-label="rooms"
              className="absolute right-0 top-[42%] z-50 flex h-16 w-7 -translate-y-1/2 items-center justify-center rounded-l-2xl border border-white/20 bg-black/50"
              style={{ touchAction: "manipulation" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setHallsOn(true);
                trayAt.current = Date.now();
              }}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#f0d48a]" style={{ writingMode: "vertical-rl" }}>
                rooms
              </span>
            </button>
          )}
          {hallsOn ? (
            <div
              className="absolute bottom-[max(5rem,env(safe-area-inset-bottom))] right-0 top-[max(4.2rem,calc(env(safe-area-inset-top)+3.2rem))] z-50 w-[46%] max-w-48 overflow-visible"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                aria-label="close rooms"
                className="absolute top-1/2 right-full z-50 flex h-24 w-10 -translate-y-1/2 items-center justify-center rounded-l-2xl border border-white/25 bg-black/70"
                style={{ touchAction: "manipulation" }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setHallsOn(false);
                }}
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#f0d48a]" style={{ writingMode: "vertical-rl" }}>
                  close
                </span>
              </button>
              <div className="flex h-full flex-col gap-2 overflow-y-auto rounded-l-2xl border border-white/15 bg-black/70 px-3 py-3 backdrop-blur-md">
                {hallLine().map((h) =>
                  h.kind === "room" ? (
                    <button
                      key={`room-${h.id}`}
                      type="button"
                      className={`flex min-h-12 items-center font-display text-xl ${
                        h.n === hallHold.current ? "text-[#9ef0e4]" : "text-white/80"
                      }`}
                      style={{ touchAction: "manipulation" }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (Date.now() - trayAt.current < 400) return;
                        void goHall(h.id);
                      }}
                    >
                      Room {h.n}
                    </button>
                  ) : (
                    <button
                      key={`gate-${h.id}`}
                      type="button"
                      className="flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.16em] text-[#f0d48a]"
                      style={{ touchAction: "manipulation" }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (Date.now() - trayAt.current < 400) return;
                        void goGate(h.id, h.from);
                      }}
                    >
                      Transition
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      {false && phase === "play" && beat === "idle" && editOn ? (
        <div className="absolute bottom-[max(4.6rem,calc(env(safe-area-inset-bottom)+3.6rem))] left-4 right-16 z-40 flex flex-col gap-2">
          {walksUI.map((w) => (
            <button
              key={w.key}
              type="button"
              className="flex h-12 items-center justify-between rounded-full border border-white/20 bg-black/55 px-5 font-mono text-[11px] uppercase tracking-[0.14em] text-ice"
              style={{ touchAction: "manipulation" }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                void recookWalk(w.from, w.to);
              }}
            >
              <span>
                {w.from} → {w.to}
              </span>
              <span className="text-[#f0d48a]">Redo</span>
            </button>
          ))}
        </div>
      ) : null}
      {phase === "play" && beat === "idle" ? (
        <div
          className="absolute bottom-[max(1.1rem,env(safe-area-inset-bottom))] right-4 z-40 flex flex-col items-end gap-2"
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
          }}
        >
          {tray ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="flex h-11 min-w-28 items-center justify-center rounded-full border border-white/20 bg-black/55 px-4 font-display text-base text-ice"
                style={{ touchAction: "manipulation" }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (Date.now() - trayAt.current < 500) return;
                  setTray(false);
                  if (hallHold.current > 1) {
                    skipEnter.current = true;
                    void switchHall(hallHold.current - 1, false);
                    return;
                  }
                  goBack();
                }}
              >
                Back
              </button>
              <button
                type="button"
                className="flex h-11 min-w-28 items-center justify-center rounded-full border border-white/20 bg-black/55 px-4 font-display text-base text-ice"
                style={{ touchAction: "manipulation" }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (Date.now() - trayAt.current < 500) return;
                  setTray(false);
                  void saveFilms();
                }}
              >
                Link
              </button>
              <button
                type="button"
                className="flex h-11 min-w-28 items-center justify-center rounded-full border border-white/15 bg-black/55 px-4 font-display text-base text-fg/85"
                style={{ touchAction: "manipulation" }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (Date.now() - trayAt.current < 500) return;
                  setTray(false);
                  void saveMp4();
                }}
              >
                Film
              </button>
              {needStill ? (
                <button
                  type="button"
                  className="flex h-11 min-w-28 items-center justify-center rounded-full border border-[#9ef0e4]/50 bg-[#9ef0e4]/12 px-4 font-display text-base text-[#9ef0e4]"
                  style={{ touchAction: "manipulation" }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (Date.now() - trayAt.current < 500) return;
                    setTray(false);
                    void cookIdles();
                  }}
                >
                  Breathe
                </button>
              ) : null}
              {walksUI.length ? (
                <button
                  type="button"
                  className="flex h-11 min-w-28 items-center justify-center rounded-full border border-white/20 bg-black/55 px-4 font-display text-base text-fg/90"
                  style={{ touchAction: "manipulation" }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (Date.now() - trayAt.current < 500) return;
                    setTray(false);
                    setEditOn((v) => !v);
                  }}
                >
                  Edit
                </button>
              ) : null}
              <button
                type="button"
                className={`flex h-11 min-w-28 items-center justify-center rounded-full border px-4 font-display text-base ${
                  graphOn
                    ? "border-[#9ef0e4]/50 bg-[#9ef0e4]/12 text-[#9ef0e4]"
                    : "border-white/20 bg-black/55 text-fg/85"
                }`}
                style={{ touchAction: "manipulation" }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (Date.now() - trayAt.current < 500) return;
                  setGraphOn((v) => !v);
                }}
              >
                {graphOn ? "Path on" : "Path off"}
              </button>
              {needOther ? (
                <button
                  type="button"
                  className="flex h-11 min-w-28 items-center justify-center rounded-full bg-[#e4c37a] px-4 font-display text-base text-bg shadow-[0_0_18px_rgba(228,195,122,0.35)]"
                  style={{ touchAction: "manipulation" }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (Date.now() - trayAt.current < 500) return;
                    setTray(false);
                    forgeOther();
                  }}
                >
                  {pathFirst.current === "m2" ? "Forge A" : "Forge B"}
                </button>
              ) : null}
              {hallHold.current < 8 || destHall("m1") > 0 || destHall("m2") > 0 ? (
                <button
                  type="button"
                  className="flex h-11 min-w-28 items-center justify-center rounded-full border border-[#e4c37a]/70 bg-[#e4c37a]/18 px-4 font-display text-base text-[#f0d48a]"
                  style={{ touchAction: "manipulation" }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (Date.now() - trayAt.current < 500) return;
                    setTray(false);
                    const dest = destHall(doorPick()) || destHall("m1") || destHall("m2");
                    if (dest && dest !== hallHold.current && hallsHold.current[dest - 1]?.bank?.length) void switchHall(dest, true);
                    else enterNext();
                  }}
                >
                  {destHall(doorPick()) > hallHold.current || destHall("m1") > hallHold.current || destHall("m2") > hallHold.current
                    ? `Room ${Math.max(destHall(doorPick()), destHall("m1"), destHall("m2"))}`
                    : "Add room"}
                </button>
              ) : null}
              <button
                type="button"
                className="flex h-11 min-w-28 items-center justify-center rounded-full border border-[#9ef0e4]/55 bg-[#9ef0e4]/12 px-4 font-display text-base text-[#9ef0e4]"
                style={{ touchAction: "manipulation" }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (Date.now() - trayAt.current < 500) return;
                  setTray(false);
                  openArtefact("ask");
                }}
              >
                {rift.m1 || rift.m2 ? "Artefacts" : "Add artefact"}
              </button>
            </div>
          ) : null}
          <button
            type="button"
            aria-label="menu"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/40"
            style={{ touchAction: "manipulation" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setTray((v) => !v);
              trayAt.current = Date.now();
            }}
          >
            <span className="flex flex-col gap-[3px]">
              <span className="block h-[3px] w-[3px] rounded-full bg-[#f0d48a]" />
              <span className="block h-[3px] w-[3px] rounded-full bg-[#f0d48a]" />
              <span className="block h-[3px] w-[3px] rounded-full bg-[#f0d48a]" />
            </span>
          </button>
        </div>
      ) : null}
      {pilotOn && drive === "pilot" && phase === "forge" ? (
        <div className="absolute inset-x-0 bottom-[max(1.2rem,env(safe-area-inset-bottom))] z-50 flex items-center justify-center gap-3 px-4">
          <button
            type="button"
            className="flex h-14 min-w-16 items-center justify-center rounded-2xl bg-ice px-5 font-mono text-[11px] uppercase tracking-[0.16em] text-bg"
            style={{ touchAction: "manipulation" }}
            onPointerUp={(e) => {
              e.stopPropagation();
              answerPilot("go");
            }}
          >
            keep
          </button>
          <button
            type="button"
            className="flex h-14 min-w-16 items-center justify-center rounded-2xl border border-ice bg-ice/15 px-5 font-mono text-[11px] uppercase tracking-[0.16em] text-ice"
            style={{ touchAction: "manipulation" }}
            onPointerUp={(e) => {
              e.stopPropagation();
              answerPilot("retry");
            }}
          >
            retry
          </button>
          <button
            type="button"
            className="flex h-14 min-w-16 items-center justify-center rounded-2xl border border-line bg-surface px-5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted"
            style={{ touchAction: "manipulation" }}
            onPointerUp={(e) => {
              e.stopPropagation();
              answerPilot("stop");
            }}
          >
            play
          </button>
        </div>
      ) : null}
      {planLine ? (
        <p className="pointer-events-none absolute left-4 right-4 top-[4.6rem] text-center font-mono text-[11px] uppercase tracking-[0.16em] text-ice/80">
          {planLine}
        </p>
      ) : null}
      {((phase === "refs" && beat !== "playvid") || beat === "cook") && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center"
          data-forge-pct={Math.min(100, loadPct)}
        >
          {stageSrc ? (
            <img src={stageSrc} alt="" className="absolute inset-0 h-full w-full object-contain object-center" />
          ) : null}
          <p className="relative font-mono text-[11px] uppercase tracking-[0.28em] text-ice">
            {frost || (phase === "forge" ? `video · ${loadName || "walk"}` : `ref · ${loadName || "imagine"}`)}
          </p>
          <p className="relative mt-3 font-display text-6xl tabular-nums text-fg">{Math.min(100, loadPct)}%</p>
        </div>
      )}
      {/failed|paused|dark|tap retry|timeout/i.test(frost) || (phase === "refs" && loadPct < 5 && late) ? (
        <button
          type="button"
          className="absolute left-5 right-5 top-[42%] z-50 flex h-16 items-center justify-center rounded-full border border-[#e4c37a]/70 bg-[#e4c37a]/35 font-display text-2xl text-[#f0d48a]"
          style={{ touchAction: "manipulation" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            retryForge();
          }}
          onClick={(e) => {
            e.stopPropagation();
            retryForge();
          }}
        >
          Retry
        </button>
      ) : null}
      {phase === "mark" && !pick && (
        <p className="pointer-events-none absolute inset-x-8 top-[42%] text-center font-mono text-[11px] uppercase tracking-[0.22em] text-ice/80">
          {pins.length < want
            ? `tap the ${plannedObjects(want)[pins.length]?.name ?? "object"} · then the next`
            : "tap the flame when the path is set"}
        </p>
      )}
      {look ? (
        <div
          className="absolute inset-0 z-[60] flex items-center justify-center bg-black/40"
          style={{ touchAction: "manipulation" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            setLook(null);
          }}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <div
            className="relative flex max-h-[78%] w-[82%] max-w-[28rem] flex-col items-center"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            {look.url ? (
              <video
                src={look.url}
                poster={look.src || undefined}
                autoPlay
                muted
                loop
                playsInline
                className="max-h-[72dvh] w-full rounded-2xl object-contain"
              />
            ) : (
              <img src={look.src} alt="" className="max-h-[72dvh] w-full rounded-2xl object-contain" />
            )}
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[#f0d48a]">{look.name}</p>
          </div>
        </div>
      ) : null}
      {refs.length > 0 && phase !== "play" ? (
        stripOn ? (
        <div
          className="absolute inset-x-0 bottom-0 z-50 overflow-visible"
          style={{ background: "linear-gradient(180deg, transparent, rgba(7,8,12,0.82) 45%)" }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            aria-label="close refs"
            className="absolute left-1/2 top-0 z-40 flex h-8 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/70"
            style={{ touchAction: "manipulation" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setStripOn(false);
            }}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#f0d48a]">close</span>
          </button>
          <div
            ref={stripEl}
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden px-3 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-8"
            style={{
              scrollbarWidth: "none",
              touchAction: "pan-x",
              WebkitOverflowScrolling: "touch",
              overscrollBehaviorX: "contain",
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              stripDrag.current = {
                x: e.clientX,
                scroll: stripEl.current?.scrollLeft ?? 0,
                moved: false,
              };
              try {
                (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
              } catch {
                /* */
              }
            }}
            onPointerMove={(e) => {
              const dx = e.clientX - stripDrag.current.x;
              if (Math.abs(dx) > 8) stripDrag.current.moved = true;
              if (stripEl.current) stripEl.current.scrollLeft = stripDrag.current.scroll - dx;
            }}
            onPointerUp={(e) => e.stopPropagation()}
          >
            {forgeTrayRefs(refs).map((r) => (
              <button
                key={r.id}
                type="button"
                className={`flex w-[4.6rem] shrink-0 snap-start flex-col gap-1 ${
                  nowClip && nowClip.kind === "walk" && nowClip.to === r.id ? "text-ice" : "text-muted"
                }`}
                style={{ touchAction: "pan-x" }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  if (!stripDrag.current.moved) setLook(r);
                }}
                aria-label={r.name}
              >
                <span
                  className={`block h-[5.2rem] w-full overflow-hidden rounded-xl border ${
                    nowClip && nowClip.kind === "walk" && nowClip.to === r.id ? "border-ice" : "border-line"
                  }`}
                >
                  <img src={r.src} alt="" className="pointer-events-none h-full w-full object-cover" />
                </span>
                <span className="truncate text-center font-mono text-[8px] uppercase tracking-[0.12em]">{r.name}</span>
              </button>
            ))}
          </div>
        </div>
        ) : (
          <button
            type="button"
            aria-label="refs"
            className="absolute bottom-[max(0.4rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex h-8 w-24 -translate-x-1/2 items-center justify-center rounded-full border border-white/20 bg-black/50"
            style={{ touchAction: "manipulation" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setStripOn(true);
            }}
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#f0d48a]">refs</span>
          </button>
        )
      ) : null}
      {phase === "mark" && false && (
        <p className="pointer-events-none absolute inset-x-8 top-[42%] text-center font-mono text-[11px] uppercase tracking-[0.22em] text-ice/80">
          tap each object
        </p>
      )}
      {pick && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4"
          style={{ background: "linear-gradient(180deg, transparent, rgba(7,8,12,0.88) 28%)" }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          {wish !== undefined && (
            <input
              ref={ear}
              value={wish}
              maxLength={140}
              enterKeyHint="done"
              autoComplete="off"
              placeholder="describe a room"
              className="mb-3 w-full border-0 bg-transparent px-6 text-center font-display text-xl text-ice outline-none"
              onChange={(e) => {
                wishRef.current = e.target.value;
                setWish(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                  void cookPlate(wish);
                }
              }}
            />
          )}
          <div className="flex gap-3 overflow-x-auto px-4 pb-3" style={{ scrollbarWidth: "none" }}>
            <button
              type="button"
              className="flex h-24 w-20 shrink-0 flex-col items-center justify-center rounded-2xl border border-ice/40 bg-surface/80 text-ice"
              onPointerUp={(e) => {
                e.stopPropagation();
                file.current?.click();
              }}
              aria-label="Your photo"
            >
              <ImagePlus className="h-5 w-5" />
            </button>
            <button
              type="button"
              className={`flex h-24 w-20 shrink-0 flex-col items-center justify-center rounded-2xl border ${howl ? "border-ice bg-ice/25 text-ice" : "border-line bg-surface/80 text-muted"}`}
              onClick={startHowl}
              aria-label="Howl a room"
            >
              <Mic className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="flex h-24 w-20 shrink-0 flex-col items-center justify-center rounded-2xl border border-line bg-surface/80 text-muted"
              onClick={() => ear.current?.focus()}
              aria-label="Write a room"
            >
              <PenLine className="h-5 w-5" />
            </button>
            {PLATES.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`h-24 w-16 shrink-0 overflow-hidden rounded-2xl border ${plate === p.src ? "border-ice" : "border-line"}`}
                onClick={() => usePlate(p.src)}
                aria-label={p.name}
              >
                <img src={p.src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
      {phase === "time" && (
        <p className="pointer-events-none absolute inset-x-8 top-[40%] text-center font-mono text-[11px] uppercase tracking-[0.22em] text-ice/80">
          walk length · tap 6 or 10
        </p>
      )}
      {!pick && phase === "time" && (
        <div className="absolute inset-x-0 bottom-[max(1.2rem,env(safe-area-inset-bottom))] z-50 flex items-end justify-center gap-6 px-4" style={{ touchAction: "manipulation" }}>
          {([6, 10] as WalkSecs[]).map((n) => (
            <button
              key={n}
              type="button"
              className={`flex h-16 w-16 flex-col items-center justify-center rounded-full border ${walkSecs === n ? "border-ice bg-ice/20 text-ice" : "border-line bg-surface/70 text-muted"}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                pickSecs(n);
              }}
              aria-label={`${n} seconds`}
            >
              <span className="font-display text-2xl leading-none">{n}</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.16em]">sec</span>
            </button>
          ))}
        </div>
      )}
      {!pick && phase === "mark" && (
        <div className="absolute inset-x-0 bottom-[max(1.2rem,env(safe-area-inset-bottom))] z-10 flex items-end justify-center px-4">
          <button
            type="button"
            className={`flex h-16 w-16 items-center justify-center rounded-full border ${ready || phase !== "mark" ? "border-ice bg-ice/20 text-ice" : "border-line bg-surface/70 text-faint"}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              lockTime();
            }}
            aria-label="Forge"
          >
            <Flame className="h-5 w-5" />
          </button>
        </div>
      )}
      <input ref={file} type="file" accept="image/*" multiple className="pointer-events-none hidden" tabIndex={-1} onChange={onFile} />
      {riftBloom ? (
        <div className="pointer-events-none absolute inset-0 z-[80]" data-rift-bloom="1">
          <img
            src={plate && !isStockArt(plate) ? plate : startHold.current || ""}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <img
            src={riftBloom.still}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              clipPath: riftBloom.open ? "inset(0% 0% 0% 0%)" : "inset(0% 48% 0% 48%)",
              transition: "clip-path 1.35s cubic-bezier(0.22, 1, 0.36, 1)",
              filter: riftBloom.door === "m2" ? "saturate(1.12)" : "saturate(1.08)",
            }}
          />
          <div
            className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
            style={{
              opacity: riftBloom.open ? 0 : 1,
              transition: "opacity 0.8s ease",
              boxShadow:
                riftBloom.door === "m2"
                  ? "0 0 28px 6px rgba(228,195,122,0.85)"
                  : "0 0 28px 6px rgba(158,240,228,0.8)",
              background: riftBloom.door === "m2" ? "#f0d48a" : "#9ef0e4",
            }}
          />
          <p className="absolute bottom-[max(4.4rem,env(safe-area-inset-bottom))] left-0 right-0 text-center font-display text-4xl text-[#f0d48a] drop-shadow-[0_8px_22px_rgba(0,0,0,0.9)]">
            {riftBloom.name}
          </p>
        </div>
      ) : null}
      {bootOn ? <BootScreen pct={bootPct} label={bootLine} plate={durableStill(plate) || hallKeep.current || ""} /> : null}
      {riftOverlay()}
      {hangAskOverlay()}
    </div>
  );
}

function drawGraph(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  nodes: RuneNode[],
  graph: RuneGraph | null,
  phase: Phase,
  clip: RuneClip | null,
  forged: number,
  now: number,
) {
  if (nodes.length < 2) return;
  const q = graph ? forgeQueue(graph) : [];
  const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(now / 420));
  ctx.save();
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const id = `walk-${a.id}-${b.id}`;
      const hot =
        (clip?.kind === "walk" &&
          ((clip.from === a.id && clip.to === b.id) || (clip.from === b.id && clip.to === a.id))) ||
        (phase === "forge" &&
          q.slice(0, forged).some((c) => c.kind === "walk" && (c.id === id || c.reverseOf === id)));
      const x0 = a.x * w;
      const y0 = a.y * h;
      const x1 = b.x * w;
      const y1 = b.y * h;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.strokeStyle = hot ? "rgba(232,238,242,0.95)" : `rgba(158,201,212,${0.42 + pulse * 0.38})`;
      ctx.lineWidth = hot ? Math.max(5, w * 0.01) : Math.max(3.4, w * 0.0075);
      ctx.shadowColor = hot ? "rgba(212,196,168,0.9)" : "rgba(158,201,212,0.85)";
      ctx.shadowBlur = hot ? 18 : 12;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawMark(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  n: RuneNode,
  here: boolean,
  lit: boolean,
  phase: Phase,
) {
  const x = n.x * w;
  const y = n.y * h;
  const r = Math.max(16, w * 0.042);
  ctx.save();
  ctx.shadowColor = here || lit ? "rgba(232,238,242,0.95)" : "rgba(158,201,212,0.75)";
  ctx.shadowBlur = here || lit ? 22 : 12;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = lit ? "rgba(232,238,242,0.98)" : here ? "rgba(212,196,168,0.95)" : "rgba(158,201,212,0.88)";
  ctx.lineWidth = lit || here ? 4 : 2.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = lit ? "rgba(232,238,242,0.95)" : here ? "rgba(212,196,168,0.9)" : "rgba(158,201,212,0.7)";
  ctx.fill();
  if (phase !== "play") {
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(232,238,242,0.92)";
    ctx.font = `${Math.max(12, w * 0.022)}px "IBM Plex Mono", monospace`;
    ctx.textAlign = "center";
    ctx.fillText(n.id, x, y - r - 8);
  }
  ctx.restore();
}

function drawTravel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pos: { x: number; y: number },
  walking: boolean,
  now: number,
  breath: boolean,
) {
  const x = pos.x * w;
  const y = pos.y * h;
  const pulse = 0.5 + 0.5 * Math.sin(now / (walking ? 160 : 520));
  const r = Math.max(7, w * 0.016) * (walking ? 1 : 0.82 + pulse * 0.32);
  ctx.save();
  if (breath || !walking) {
    ctx.beginPath();
    ctx.arc(x, y, r * (2.2 + pulse * 0.7), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(232,238,242,${0.16 + pulse * 0.28})`;
    ctx.lineWidth = Math.max(2, w * 0.004);
    ctx.stroke();
  }
  ctx.shadowColor = "rgba(212,196,168,1)";
  ctx.shadowBlur = walking ? 18 : 14 + pulse * 10;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(232,238,242,0.95)";
  ctx.fill();
  ctx.restore();
}
