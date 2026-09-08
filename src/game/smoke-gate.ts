/**
 * Smoke ship-gate — PASS | FAIL + reasons[] before Hang, cook cache, or last-frame handoff.
 * Local lint first even if SMOKE_WAKE_URL is down. Optional bot for glow readability.
 * Timeout / unparseable bot / doubt = FAIL (never PASS by default).
 * FAIL = empty WFC: no Hang, no bad stillEnd, decay/hold, no spinner.
 * Asteroid HOLD. No Pack seats. Door seat stays talk-only.
 */

import { hangArtifactOnDoor, type DoorLetter } from "./enter-graph.ts";
import type { HungArtifact } from "./artifacts.ts";
import { glowContractIssues, MIN_CUE_WINDOW_S, type Cue, type Plate } from "./pcg-play.ts";
import { lintPrompt, RAILS, type PromptSlots } from "./pcg-prompt.ts";
import { clipCachePut, commitHallPrime, replaceStockEnter, type ClipCacheKind, type HallCommit, type PaidEnterTicket } from "./pcg-rail.ts";
import { stockBiomeLoop } from "./play-clip.ts";

export const RAILS_VERSION = "bolt-1" as const;
export const SMOKE_BOT_TIMEOUT_MS = 4000;

export type SmokeVerdict = "PASS" | "FAIL";
export type SmokeKind = "walk" | "breath" | "enter" | "biome";
export type SmokeWhen = "stock" | "cook" | "hang" | "enter" | "keep" | "howl" | "pause";

export type SmokeResult = {
  smoke: SmokeVerdict;
  reasons: string[];
};

export type SmokeAttach = {
  clip: string;
  cues: Cue[];
  stillEnd: string;
  smoke: "PASS";
  railsVersion: typeof RAILS_VERSION;
};

export type SmokePass = SmokeResult & { smoke: "PASS"; attach: SmokeAttach };
export type SmokeFail = SmokeResult & { smoke: "FAIL" };
export type SmokeGateOut = SmokePass | SmokeFail;

export type SmokeFailForward = {
  hang: false;
  cache: false;
  stillEnd: "";
  commit: "hold";
  decay: true;
  stock: string;
};

export type SmokeSubject = {
  kind: SmokeKind;
  when?: SmokeWhen;
  clip?: string;
  still?: string;
  stillEnd?: string;
  stillStart?: string;
  cues?: Cue[];
  duration?: number;
  bytes?: number;
  width?: number;
  height?: number;
  aspect?: "9:16" | "16:9" | string;
  lastFrame?: string | boolean;
  prompt?: string;
  slots?: PromptSlots;
  biomeFrom?: string;
  biomeTo?: string;
  lastBiome?: string;
  lastRibs?: string;
  ribs?: string;
  cachedPass?: boolean;
  alreadyPassed?: SmokeAttach | boolean;
  /** Pixel/CV hint. Omitted = structural proxy only. `unknown` = doubt FAIL. */
  camera?: "behind" | "face-on" | "side" | "side-profile" | "overhead" | "handheld" | "unknown";
  doors?: { a?: boolean; b?: boolean };
  pathAhead?: boolean;
  orbsOnBolt?: boolean;
  chrome?: boolean;
  /** Readable L/R bias in [on,off]. Omitted = cue-math proxy. `unknown`/`equal` = FAIL. */
  pixelSide?: "A" | "B" | "equal" | "none" | "unknown";
  bodyOk?: boolean;
};

export type SmokeBotBrief = {
  seat: "smoke";
  source: "lint";
  text: SmokeKind;
  clip?: string;
  still?: string;
  cues?: Cue[];
  biome?: { from?: string; to?: string };
};

export type SmokeHopOpts = {
  wakeUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

const passed = new Map<string, SmokeAttach>();
let lastFail: string[] = [];

const TRUSTED_STOCK =
  /\/(?:films|ui)\/(?:forge|cook)-[a-z0-9-]+\.(?:mp4|jpe?g)(?:\?|$)/i;

const CAMERA_BAN =
  /\b(face-on|side-profile|side view|overhead|handheld|orbit|truck|follow-through|follow through(?: the)? door|master shot|profile-hero)\b/i;

const BODY_BAN =
  /\b(cape|clothes|clothing|saddle|human arms|biped|second character|other character|muzzle hero|text on fur|shirt|coat|dress)\b/i;

const CHROME_BAN =
  /\b(TAP|watermark|watermarks|logo|logos|HUD|UI bar|words on the dog|letters on (?:the )?dog)\b/;

function num(n: number | null | undefined) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function clipOf(subject: SmokeSubject): string {
  return String(subject.clip || "").trim();
}

function stillEndOf(subject: SmokeSubject): string {
  return String(subject.stillEnd || subject.lastFrame || subject.still || subject.stillStart || "").trim();
}

function cuesOf(subject: SmokeSubject): Cue[] {
  return Array.isArray(subject.cues) ? subject.cues.slice() : [];
}

function isTrustedStock(url?: string | null): boolean {
  const u = String(url || "").trim();
  if (!u) return false;
  if (u === stockBiomeLoop()) return true;
  if (u === "/ui/forge.mp4") return true;
  return TRUSTED_STOCK.test(u.split("?")[0] || u);
}

function withoutRails(prompt: string): string {
  const text = String(prompt || "");
  if (text.startsWith(RAILS)) return text.slice(RAILS.length).trim();
  return text.replace(RAILS, "").trim();
}

/** Howl / Pause never gate. Keep replay of a cached PASS skips. Stock ingest once cached PASS. */
export function shouldSmoke(when?: SmokeWhen | null, cachedPass = false): boolean {
  if (when === "howl" || when === "pause") return false;
  if (when === "keep") return false;
  if (when === "stock" && cachedPass) return false;
  return true;
}

export function recallSmokePass(clip?: string | null): SmokeAttach | null {
  const key = String(clip || "").trim();
  if (!key) return null;
  return passed.get(key) || null;
}

export function rememberSmokePass(attach: SmokeAttach) {
  const key = String(attach.clip || "").trim();
  if (!key || attach.smoke !== "PASS") return;
  passed.set(key, attach);
}

export function clearSmokePass(clip?: string | null) {
  if (clip) passed.delete(String(clip));
  else passed.clear();
}

export function lastSmokeReasons(): string[] {
  return lastFail.slice();
}

export function noteSmokeFail(reasons: string[]) {
  lastFail = reasons.slice();
}

export function clearSmokeFail() {
  lastFail = [];
}

/** Paused forge UI only — never on the play picture. */
export function smokeForgeFrost(reasons: string[] = lastFail): string {
  const bits = reasons.filter(Boolean);
  if (!bits.length) return "";
  return `smoke FAIL · ${bits.join(" · ")}`;
}

export function smokeFailForward(biome?: string | null): SmokeFailForward {
  return {
    hang: false,
    cache: false,
    stillEnd: "",
    commit: "hold",
    decay: true,
    stock: stockBiomeLoop(biome),
  };
}

export function mayHang(smoke?: SmokeResult | null): boolean {
  return smoke?.smoke === "PASS";
}

export function mayCacheInsert(smoke?: SmokeResult | null): boolean {
  return smoke?.smoke === "PASS";
}

export function mayHandoffStillEnd(smoke?: SmokeResult | null): boolean {
  return smoke?.smoke === "PASS";
}

export function stillEndIfPass(smoke: SmokeResult | null | undefined, stillEnd?: string | null): string {
  if (!mayHandoffStillEnd(smoke)) return "";
  return String(stillEnd || "").trim();
}

export function attachSmokePass(subject: SmokeSubject): SmokeAttach {
  return {
    clip: clipOf(subject),
    cues: cuesOf(subject),
    stillEnd: stillEndOf(subject),
    smoke: "PASS",
    railsVersion: RAILS_VERSION,
  };
}

export function failSmoke(reasons: string[]): SmokeFail {
  const list = reasons.filter(Boolean);
  noteSmokeFail(list);
  return { smoke: "FAIL", reasons: list };
}

export function passSmoke(subject: SmokeSubject): SmokePass {
  const attach = attachSmokePass(subject);
  rememberSmokePass(attach);
  clearSmokeFail();
  return { smoke: "PASS", reasons: [], attach };
}

/* ── Local lint battery (order). First hard FAIL still collects later hard reasons. ── */

function lintContainer(subject: SmokeSubject): string[] {
  const reasons: string[] = [];
  const clip = clipOf(subject);
  const still = String(subject.still || subject.stillStart || "").trim();
  const trusted = isTrustedStock(clip) || isTrustedStock(still) || isTrustedStock(String(subject.stillEnd || ""));
  if (subject.bytes === 0) reasons.push("zero-byte");

  const w = num(subject.width);
  const h = num(subject.height);
  const tagged = String(subject.aspect || "").trim();
  if (tagged === "16:9" || /16\s*:\s*9/.test(tagged)) reasons.push("aspect-16:9");
  if (w > 0 && h > 0) {
    const ar = w / h;
    if (ar >= 1.2) reasons.push("aspect-16:9");
    else if (ar < 0.45 || ar > 0.72) reasons.push("aspect-not-9:16");
  }

  const dur = subject.duration;
  const needDur =
    Boolean(clip) &&
    !trusted &&
    (subject.when === "cook" || (subject.when === "enter" && subject.kind === "enter"));
  if (typeof dur === "number" && Number.isFinite(dur)) {
    if (dur <= 0) reasons.push("duration-empty");
    else if (subject.kind === "breath") {
      if (dur > 15) reasons.push("duration-band");
    } else if (dur < 6 || dur > 15) {
      reasons.push("duration-band");
    }
  } else if (needDur) {
    reasons.push("duration-unknown");
  }

  const last = stillEndOf(subject);
  if (clip && !last && subject.lastFrame === false) reasons.push("last-frame");
  if (clip && !last && subject.lastFrame !== true && !trusted && !still) reasons.push("last-frame");
  return reasons;
}

function lintCamera(subject: SmokeSubject): string[] {
  const reasons: string[] = [];
  if (subject.camera === "face-on" || subject.camera === "side" || subject.camera === "side-profile") {
    reasons.push("camera-lock");
  }
  if (subject.camera === "overhead" || subject.camera === "handheld") reasons.push("camera-lock");
  if (subject.camera === "unknown") reasons.push("camera-doubt");
  const rest = withoutRails(String(subject.prompt || ""));
  if (rest && CAMERA_BAN.test(rest)) reasons.push("camera-prompt");
  return reasons;
}

function lintBody(subject: SmokeSubject): string[] {
  const reasons: string[] = [];
  if (subject.bodyOk === false) reasons.push("body");
  const rest = withoutRails(String(subject.prompt || ""));
  if (rest && BODY_BAN.test(rest)) reasons.push("body-prompt");
  return reasons;
}

function hasTwoDoors(subject: SmokeSubject): boolean {
  if (subject.doors?.a && subject.doors?.b) return true;
  const cues = cuesOf(subject);
  const a = cues.some((c) => c.side === "A");
  const b = cues.some((c) => c.side === "B");
  if (a && b) return true;
  const blob = `${subject.prompt || ""} ${stillEndOf(subject)}`;
  if (/two doors/i.test(blob)) return true;
  if (/\bdoor a\b/i.test(blob) && /\bdoor b\b/i.test(blob)) return true;
  return false;
}

function lintDoors(subject: SmokeSubject): string[] {
  if (subject.kind === "biome") return [];
  if (subject.kind === "enter") {
    if (!stillEndOf(subject) && subject.lastFrame !== true) return ["enter-stillEnd"];
    if (subject.doors && (!subject.doors.a || !subject.doors.b)) return ["enter-doors"];
    if (!hasTwoDoors(subject) && subject.doors === undefined) {
      /* TODO(cv): two readable doors on the enter end still. Prompt / cue proxy. */
      const prompt = String(subject.prompt || "");
      if (prompt && !/two doors|door a|door b|to-hall/i.test(prompt)) return ["enter-doors"];
    }
    return [];
  }
  if (subject.doors && (!subject.doors.a || !subject.doors.b)) return ["doors-ab"];
  return [];
}

function lintChrome(subject: SmokeSubject): string[] {
  const reasons: string[] = [];
  if (subject.chrome === true) reasons.push("chrome");
  const rest = withoutRails(String(subject.prompt || ""));
  if (rest && CHROME_BAN.test(rest)) reasons.push("chrome-prompt");
  return reasons;
}

function lintPath(subject: SmokeSubject): string[] {
  const reasons: string[] = [];
  if (subject.orbsOnBolt === true) reasons.push("orbs-on-bolt");
  const forkCue = cuesOf(subject).some((c) => c.side === "A" || c.side === "B");
  const forkSlot = subject.slots?.fork && subject.slots.fork !== "none";
  const claimsFork = forkCue || Boolean(forkSlot);
  if (claimsFork && subject.pathAhead === false) reasons.push("path-missing");
  if (subject.kind === "walk" && claimsFork) {
    const prompt = String(subject.prompt || "");
    if (prompt && !/gold-cyan|gold cyan/i.test(prompt)) reasons.push("path-gold-cyan");
  }
  return reasons;
}

function lintCues(subject: SmokeSubject): string[] {
  const cues = cuesOf(subject);
  if (!cues.length) return [];
  const duration = num(subject.duration);
  const plate: Plate = {
    clip: clipOf(subject) || "clip",
    duration: duration || Infinity,
    cues,
    stillStart: String(subject.stillStart || subject.still || ""),
    stillEnd: stillEndOf(subject),
  };
  const reasons: string[] = [];
  for (const issue of glowContractIssues(plate)) {
    if (issue.reason === "on>=off") reasons.push("cue-window");
    else if (issue.reason === "off>duration") reasons.push("cue-off");
    else if (issue.reason === "window<0.35s") reasons.push("cue-window");
  }
  for (const cue of cues) {
    if (cue.side === "none") continue;
    const on = num(cue.on);
    const off = num(cue.off);
    if (off - on < MIN_CUE_WINDOW_S) reasons.push("cue-window");
    if (duration > 0 && off > duration) reasons.push("cue-off");
    if (subject.pixelSide === "equal") reasons.push("cue-bias-equal");
    if (subject.pixelSide === "unknown") reasons.push("cue-bias-doubt");
    if ((subject.pixelSide === "A" || subject.pixelSide === "B") && subject.pixelSide !== cue.side) {
      reasons.push("cue-side-mismatch");
    }
  }
  return [...new Set(reasons)];
}

function lintContinuity(subject: SmokeSubject): string[] {
  const reasons: string[] = [];
  const from = String(subject.biomeFrom || subject.lastBiome || "").trim().toLowerCase();
  const to = String(subject.biomeTo || "").trim().toLowerCase();
  const here = String(subject.slots?.biome || to || from).trim().toLowerCase();
  if (subject.kind === "walk" && from && here && from !== here) reasons.push("continuity-biome");
  if (subject.kind === "enter") {
    const start = String(subject.stillStart || "").trim();
    const end = String(subject.stillEnd || "").trim();
    if (from && to && start && end && start === end && from !== to) reasons.push("continuity-enter");
  }
  const ribs = String(subject.ribs || "").trim();
  const lastRibs = String(subject.lastRibs || "").trim();
  if (subject.kind === "walk" && ribs && lastRibs && ribs !== lastRibs) reasons.push("continuity-ribs");
  return reasons;
}

function lintPromptResidue(subject: SmokeSubject): string[] {
  const prompt = String(subject.prompt || "").trim();
  if (!prompt) return [];
  const reasons: string[] = [];
  if (/LOCKED-OFF CAMERA/i.test(prompt) || subject.slots) {
    const lint = lintPrompt(prompt, subject.slots);
    if (!lint.ok) reasons.push(`prompt-${lint.issue}`);
  }
  const rest = withoutRails(prompt);
  if (CAMERA_BAN.test(rest) || BODY_BAN.test(rest) || CHROME_BAN.test(rest)) {
    reasons.push("prompt-banned-stem");
  }
  return [...new Set(reasons)];
}

const BATTERY: Array<(s: SmokeSubject) => string[]> = [
  lintContainer,
  lintCamera,
  lintBody,
  lintDoors,
  lintChrome,
  lintPath,
  lintCues,
  lintContinuity,
  lintPromptResidue,
];

/** Deterministic local lint. No CV. Pixel-hard items: flags + prompt/cue/aspect proxies (TODO cv). */
export function lintSmoke(subject: SmokeSubject): SmokeGateOut {
  const cached = subject.alreadyPassed === true || subject.cachedPass || (typeof subject.alreadyPassed === "object" && subject.alreadyPassed?.smoke === "PASS");
  if (!shouldSmoke(subject.when, Boolean(cached))) {
    if (typeof subject.alreadyPassed === "object" && subject.alreadyPassed?.smoke === "PASS") {
      rememberSmokePass(subject.alreadyPassed);
      return { smoke: "PASS", reasons: [], attach: subject.alreadyPassed };
    }
    const recalled = recallSmokePass(clipOf(subject));
    if (recalled) return { smoke: "PASS", reasons: [], attach: recalled };
    return passSmoke(subject);
  }
  if (cached && (subject.when === "stock" || subject.when === "keep")) {
    if (typeof subject.alreadyPassed === "object" && subject.alreadyPassed?.smoke === "PASS") {
      return { smoke: "PASS", reasons: [], attach: subject.alreadyPassed };
    }
    const recalled = recallSmokePass(clipOf(subject));
    if (recalled) return { smoke: "PASS", reasons: [], attach: recalled };
  }

  const reasons: string[] = [];
  for (const step of BATTERY) {
    const hit = step(subject);
    if (hit.length) {
      reasons.push(...hit);
      break;
    }
  }
  if (reasons.length) return failSmoke([...new Set(reasons)]);
  return passSmoke(subject);
}

export function smokeBotBrief(subject: SmokeSubject): SmokeBotBrief {
  return {
    seat: "smoke",
    source: "lint",
    text: subject.kind,
    clip: clipOf(subject) || undefined,
    still: String(subject.still || subject.stillEnd || subject.stillStart || "").trim() || undefined,
    cues: cuesOf(subject).length ? cuesOf(subject) : undefined,
    biome: subject.biomeFrom || subject.biomeTo ? { from: subject.biomeFrom, to: subject.biomeTo } : undefined,
  };
}

export function parseSmokeBot(raw: unknown): { pass: boolean; reasons: string[] } | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t) return null;
    try {
      return parseSmokeBot(JSON.parse(t));
    } catch {
      if (/^PASS\b/i.test(t)) return { pass: true, reasons: [] };
      if (/^FAIL\b/i.test(t)) {
        const extra = t.replace(/^FAIL\b[:\s-]*/i, "").trim();
        return { pass: false, reasons: extra ? [extra] : ["bot-fail"] };
      }
      return null;
    }
  }
  if (typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const reasons = Array.isArray(o.reasons) ? o.reasons.map((r) => String(r || "").trim()).filter(Boolean) : [];
  if (o.smoke === "PASS" || o.pass === true || o.pass === "PASS") return { pass: true, reasons };
  if (o.smoke === "FAIL" || o.pass === false || o.pass === "FAIL") {
    return { pass: false, reasons: reasons.length ? reasons : ["bot-fail"] };
  }
  return null;
}

export async function hopSmokeBot(brief: SmokeBotBrief, opts: SmokeHopOpts = {}): Promise<SmokeResult> {
  const wakeUrl = String(opts.wakeUrl || "").trim();
  if (!wakeUrl) return { smoke: "PASS", reasons: [] };
  const timeoutMs = Math.max(20, num(opts.timeoutMs) || SMOKE_BOT_TIMEOUT_MS);
  const fetchImpl = opts.fetch || fetch;
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const hop = Promise.resolve(
      fetchImpl(wakeUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(brief),
        signal: ctrl?.signal,
      }),
    );
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        try {
          ctrl?.abort();
        } catch {
          /* */
        }
        const err = new Error("timeout");
        err.name = "TimeoutError";
        reject(err);
      }, timeoutMs);
    });
    const res = await Promise.race([hop, timeout]);
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    const bot = parseSmokeBot(parsed);
    if (!bot) return failSmoke(["unparseable-bot"]);
    if (!bot.pass) return failSmoke(bot.reasons.length ? bot.reasons : ["bot-fail"]);
    return { smoke: "PASS", reasons: [] };
  } catch {
    return failSmoke(["timeout"]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * clip|still → local lint → optional Smoke bot → PASS attach | FAIL drop.
 * Bot does not rewrite the graph or cook.
 */
export async function runSmokeGate(subject: SmokeSubject, hop: SmokeHopOpts = {}): Promise<SmokeGateOut> {
  const local = lintSmoke(subject);
  if (local.smoke === "FAIL") return local;
  if (!String(hop.wakeUrl || "").trim()) return local;
  const bot = await hopSmokeBot(smokeBotBrief(subject), hop);
  if (bot.smoke === "FAIL") return { smoke: "FAIL", reasons: bot.reasons };
  return local;
}

export function clipCachePutIfPass(
  key: string,
  url: string,
  kind: ClipCacheKind,
  smoke?: SmokeResult | SmokeAttach | null,
): string {
  if (smoke && smoke.smoke !== "PASS") return "";
  return clipCachePut(key, url, kind, smoke);
}

export function replaceStockEnterIfPass(
  key: string,
  cookedUrl: string,
  ticket: PaidEnterTicket,
  smoke?: SmokeResult | null,
): string {
  if (smoke && smoke.smoke !== "PASS") return "";
  return replaceStockEnter(key, cookedUrl, ticket);
}

export function commitHallPrimeIfPass(clip?: string | null, smoke?: SmokeResult | null): HallCommit {
  if (smoke && smoke.smoke !== "PASS") return "hold";
  return commitHallPrime(clip);
}

export function hangOnDoorIfPass(
  id: string,
  door: DoorLetter,
  opts: { hall: number; citadel?: string; still?: string; trans?: string; biome?: import("./enter-graph.ts").BiomeName; smoke?: SmokeResult },
  from: HungArtifact[],
): HungArtifact[] {
  const smoke = opts.smoke;
  if (smoke && !mayHang(smoke)) return from;
  return hangArtifactOnDoor(id, door, opts, from);
}

export function subjectFromPlate(plate: Plate, kind: SmokeKind = "walk", when: SmokeWhen = "cook"): SmokeSubject {
  return {
    kind,
    when,
    clip: plate.clip,
    duration: plate.duration,
    cues: plate.cues,
    stillStart: plate.stillStart,
    stillEnd: plate.stillEnd,
    still: plate.stillStart,
  };
}

export function lintEnterClip(
  clip: string,
  stillEnd?: string | null,
  prompt?: string | null,
  duration = 6,
): SmokeGateOut {
  return lintSmoke({
    kind: "enter",
    when: "enter",
    clip,
    stillEnd: String(stillEnd || "").trim(),
    still: String(stillEnd || "").trim(),
    duration,
    prompt: String(prompt || ""),
    alreadyPassed: recallSmokePass(clip) || undefined,
    cachedPass: Boolean(recallSmokePass(clip)),
  });
}

export function subjectFromFilm(
  film: { still?: string; local?: string; playlist?: string[]; line?: string; name?: string },
  kind: SmokeKind = "walk",
  when: SmokeWhen = "hang",
): SmokeSubject {
  const clip = String(film.playlist?.[0] || film.local || "").trim();
  const still = String(film.still || "").trim();
  return {
    kind,
    when,
    clip,
    still,
    stillEnd: still,
    stillStart: still,
    prompt: String(film.line || film.name || ""),
  };
}
