/**
 * SmiR prompt grammar — PCG for language.
 * Rails (terminals) + typed slots (nonterminals) + linter before Imagine.
 * Asteroid HOLD. Graph pins live in pcg-grammar.ts (rail 3). No Pack seats.
 */

import { plateSeed } from "./pcg-rail.ts";
import {
  actFromRole,
  beginOnline,
  collapsePlateCell,
  cookReadyCell,
  replayOnline,
  type OnlineStrip,
  type TapObserve,
} from "./pcg-wfc.ts";
import { stockBiomeLoop } from "./play-clip.ts";

/** Engine laws. Copied on every plate. Bolt, lens, chrome ban are terminals — never sampled. */
export const LOCK = [
  "LOCKED-OFF CAMERA: dead center behind this exact white German Shepherd StarBoltSprint. Same lens, height, distance, EVERY frame. Back only. Four legs and paws. NO cape. NO face. NO orbit. NO side view. NO overhead. NO handheld. NO human arms. He may lean L/R; after a lean the camera is still dead-center behind. Photoreal 9:16. No text, no UI, no labels, no words on the dog. One path language: gold-cyan, ahead of the paws. No orbs stuck on him.",
  "Crystal never chrome.",
].join(" ");

export const RAILS = LOCK;

/** NO-list for a negative/avoid field when the Imagine API grows one. */
export const RAILS_AVOID = [
  "cape",
  "face",
  "orbit",
  "side view",
  "overhead",
  "handheld",
  "human arms",
  "text",
  "UI",
  "labels",
  "words on the dog",
  "orbs stuck on him",
  "chrome",
  "new dog",
  "species change",
  "other characters",
].join(", ");

/** xAI grok-imagine has no negative/avoid field today. NO-list stays in RAILS. */
export const IMAGINE_AVOID_FIELD = null as "negative_prompt" | "avoid" | null;

export const RAILS_PHRASES = [
  "LOCKED-OFF CAMERA",
  "dead center behind",
  "white German Shepherd StarBoltSprint",
  "Same lens",
  "EVERY frame",
  "Four legs and paws",
  "NO cape",
  "NO face",
  "NO orbit",
  "NO side view",
  "NO overhead",
  "NO handheld",
  "NO human arms",
  "Photoreal 9:16",
  "No text",
  "gold-cyan",
  "No orbs",
  "Crystal never chrome",
] as const;

export const BIOME_IDS = [
  "asteroid",
  "forest",
  "dusk",
  "moss",
  "ember",
  "ember-stone",
  "void",
  "canyon",
  "city",
  "open",
  "ocean",
  "dune",
  "ruin",
  "peak",
  "rome",
  "greece",
  "persia",
  "egypt",
  "babylon",
] as const;

export const ACT_IDS = ["walk-A", "walk-B", "breath", "enter", "decay"] as const;
export const FORK_IDS = ["none", "L", "R", "L+R"] as const;
export const TRAIL_IDS = ["none", "thin", "full"] as const;
export const FLOOR_IDS = ["empty", "crystals-ahead"] as const;
export const LEFTOVER_IDS = ["none", "from-token"] as const;

export type GrammarBiomeId = (typeof BIOME_IDS)[number];
export type ActSlot = (typeof ACT_IDS)[number];
export type ForkSlot = (typeof FORK_IDS)[number];
export type TrailSlot = (typeof TRAIL_IDS)[number];
export type FloorSlot = (typeof FLOOR_IDS)[number];
export type LeftoverSlot = (typeof LEFTOVER_IDS)[number];

export type FromTo = { from: string; to: string };

export type PromptSlots = {
  biome: GrammarBiomeId;
  act: ActSlot;
  fork: ForkSlot;
  trail: TrailSlot;
  floor: FloorSlot;
  leftover: LeftoverSlot;
  fromTo: FromTo | null;
  still: string;
  destStill: string | null;
  seed: string;
  flavor?: string;
};

export type BiomeCatalogEntry = {
  id: GrammarBiomeId;
  name: string;
  worldLine: string;
  still: string;
};

/** Authored once per biome — never generated per plate. */
export const BIOME_CATALOG: Record<GrammarBiomeId, BiomeCatalogEntry> = {
  asteroid: {
    id: "asteroid",
    name: "Asteroid",
    worldLine: "a sci-fi asteroid field in deep space, luminous gold-cyan path through the void",
    still: "/films/cook-asteroid.jpg",
  },
  forest: {
    id: "forest",
    name: "Forest",
    worldLine: "a living crystal-ice forest, purple-blue trees, luminous path on the moss",
    still: "/films/cook-forest.jpg",
  },
  dusk: {
    id: "dusk",
    name: "Dusk",
    worldLine: "a crystal-ice forest at dusk, purple-blue trees, last light, a luminous gold-cyan path on the moss",
    still: "/films/cook-forest.jpg",
  },
  moss: {
    id: "moss",
    name: "Moss",
    worldLine: "a living crystal-ice forest, thick moss, purple-blue trees, a luminous gold-cyan path",
    still: "/films/cook-forest.jpg",
  },
  ember: {
    id: "ember",
    name: "Ember",
    worldLine: "volcanic glass and ember cracks, dark magma light, ash, a luminous path",
    still: "/films/cook-ember.jpg",
  },
  "ember-stone": {
    id: "ember-stone",
    name: "Ember-stone",
    worldLine: "volcanic glass and ember-stone, dark magma cracks, ash, a luminous gold-cyan path",
    still: "/films/cook-ember.jpg",
  },
  void: {
    id: "void",
    name: "Void",
    worldLine: "a sci-fi void in deep space, luminous gold-cyan path through the dark",
    still: "/films/cook-asteroid.jpg",
  },
  canyon: {
    id: "canyon",
    name: "Canyon",
    worldLine: "a vast living ice canyon with crystal shards growing from the walls",
    still: "/films/cook-canyon.jpg",
  },
  city: {
    id: "city",
    name: "City",
    worldLine: "a night sci-fi city in a lightning storm, wet streets, neon ice light",
    still: "/films/cook-city.jpg",
  },
  open: {
    id: "open",
    name: "Seed",
    worldLine: "a cinematic corridor of light, gold-cyan path ahead of the paws, readable and still",
    still: "/films/cook-seed.jpg",
  },
  ocean: {
    id: "ocean",
    name: "Ocean",
    worldLine: "a black ice ocean, crystal reefs, dark waves, a luminous path on the water",
    still: "/films/cook-ocean.jpg",
  },
  dune: {
    id: "dune",
    name: "Dune",
    worldLine: "vast crystal dunes at night, gold sand, ice spires, a luminous path",
    still: "/films/cook-dune.jpg",
  },
  ruin: {
    id: "ruin",
    name: "Ruin",
    worldLine: "a fallen ice citadel, broken towers, moonlit ruins, a luminous path",
    still: "/films/cook-ruin.jpg",
  },
  peak: {
    id: "peak",
    name: "Peak",
    worldLine: "a high ice mountain peak, aurora, wind, sheer cliffs, a luminous path",
    still: "/films/cook-peak.jpg",
  },
  rome: {
    id: "rome",
    name: "Rome",
    worldLine: "ancient Rome at night, marble Forum, Corinthian columns, wet stone, lightning over the Palatine, a luminous gold-cyan path",
    still: "/films/cook-rome.jpg",
  },
  greece: {
    id: "greece",
    name: "Greece",
    worldLine: "ancient Greece at night, the Acropolis, Parthenon colonnade, olive trees, silver Aegean moonlight, a luminous gold-cyan path",
    still: "/films/cook-greece.jpg",
  },
  persia: {
    id: "persia",
    name: "Persia",
    worldLine: "ancient Persia at night, Persepolis columns, winged-bull gateways, gold fire bowls, desert wind, a luminous gold-cyan path",
    still: "/films/cook-persia.jpg",
  },
  egypt: {
    id: "egypt",
    name: "Egypt",
    worldLine: "ancient Egypt at night, Karnak pylons, obelisks, pyramids, Nile mist, star desert, a luminous gold-cyan path",
    still: "/films/cook-egypt.jpg",
  },
  babylon: {
    id: "babylon",
    name: "Babylon",
    worldLine: "ancient Babylon at night, Ishtar Gate of blue glazed bricks and golden lions, a ziggurat, hanging gardens, a luminous gold-cyan path",
    still: "/films/cook-babylon.jpg",
  },
};

/** Player voice → catalog biome. Never camera / body. */
export const PLAYER_VOICE_DICT: Record<string, GrammarBiomeId> = {
  rome: "ember",
  mars: "asteroid",
  space: "asteroid",
  void: "void",
  "ember-stone": "ember-stone",
};

const BODY_CAMERA_STEMS =
  /\b(face|cape|orbit|overhead|handheld|camera|lens|clothes|clothing|shirt|coat|dress|hat|species|morph|metamorph\w*|transform\w*|werewolf|human|arms?|hands?|character|person|people|man|woman|chrome|wolf|husky|poodle|labrador|side\s*view|portrait|close-?up|body|torso|muzzle|snout|eyes?|breed)\b/gi;

const BANNED_FLAVOR =
  /\b(face|cape|orbit|overhead|handheld|camera|lens|clothes|clothing|shirt|coat|dress|species|morph|metamorph\w*|werewolf|human|arms?|character|person|people|chrome|wolf|side\s*view)\b/i;

const MORPH_EXTRA =
  /\b(morph|metamorph\w*|new dog|another dog|other dog|species|werewolf|human|character|person|people|clothes|clothing|cape|face|chrome)\b/i;

function inEnum<T extends string>(ids: readonly T[], raw: unknown): T | "" {
  const v = String(raw ?? "").trim();
  return (ids as readonly string[]).includes(v) ? (v as T) : "";
}

export function isGrammarBiome(v?: string | null): v is GrammarBiomeId {
  return Boolean(inEnum(BIOME_IDS, v));
}

export function asGrammarBiome(raw?: string | null, fallback: GrammarBiomeId = "asteroid"): GrammarBiomeId {
  const id = String(raw || "").trim().toLowerCase();
  if (isGrammarBiome(id)) return id;
  return fallback;
}

export function biomeEntry(id?: string | null): BiomeCatalogEntry {
  return BIOME_CATALOG[asGrammarBiome(id)];
}

export function actLine(act: ActSlot): string {
  if (act === "walk-A") return "Bolt sprints to the left door; hall frozen; only the dog moves.";
  if (act === "walk-B") return "Bolt sprints to the right door; hall frozen; only the dog moves.";
  if (act === "breath") return "Bolt holds; hall breath only; body and lens unchanged.";
  if (act === "decay") return "Storm recedes; same body, same lens; world thins.";
  return "beat table start from / mid floor-crawl / end to-hall two doors.";
}

export function pathLine(fork: ForkSlot): string {
  if (fork === "L") return "Path forks left ahead of the paws.";
  if (fork === "R") return "Path forks right ahead of the paws.";
  if (fork === "L+R") return "Path forks left and right ahead of the paws.";
  return "Path stays one gold-cyan line ahead of the paws.";
}

export function trailLine(trail: TrailSlot): string {
  if (trail === "thin") return "Thin cyan lightning trail.";
  if (trail === "full") return "Full cyan lightning trail.";
  return "No lightning trail.";
}

export function floorLine(floor: FloorSlot): string {
  if (floor === "crystals-ahead") return "Crystals spawn ahead of the paws.";
  return "Floor empty ahead.";
}

export function enterLine(slots: Pick<PromptSlots, "act" | "fromTo" | "leftover">): string {
  if (slots.act !== "enter") return "";
  const bits: string[] = ["Enter: beat table start from / mid floor-crawl / end to-hall two doors."];
  if (slots.fromTo?.from && slots.fromTo?.to) {
    bits.push(`from ${slots.fromTo.from} to ${slots.fromTo.to}.`);
  }
  if (slots.leftover === "from-token") bits.push("Leftover: from-token.");
  return bits.join(" ");
}

/** Density stub — role-WFC (pcg-wfc) fills cook slots; this stays for tests / fallback. */
export function stubFork(density = 0): ForkSlot {
  if (density >= 0.85) return "L+R";
  if (density >= 0.55) return "R";
  if (density >= 0.35) return "L";
  return "none";
}

/** Trail from momentum + phase. */
export function stubTrail(momentum = 0, phase = 0): TrailSlot {
  const m = Number(momentum) + Number(phase);
  if (m >= 0.7) return "full";
  if (m >= 0.3) return "thin";
  return "none";
}

export function stubFloor(density = 0): FloorSlot {
  return density >= 0.5 ? "crystals-ahead" : "empty";
}

export function mapCookAct(act?: { id?: string } | string | number | null): ActSlot {
  const id = typeof act === "number"
    ? ["intro", "chain", "mid", "lean", "peak", "finale"][Math.max(0, Math.min(5, act | 0))]
    : typeof act === "string"
      ? act
      : String(act?.id || "");
  const key = id.trim().toLowerCase();
  if (key === "walk-a" || key === "l" || key === "left" || key === "intro" || key === "chain" || key === "mid") return "walk-A";
  if (key === "walk-b" || key === "r" || key === "right" || key === "lean") return "walk-B";
  if (key === "breath" || key === "hold" || key === "idle") return "breath";
  if (key === "enter") return "enter";
  if (key === "decay" || key === "finale" || key === "miss") return "decay";
  if (key === "peak") return "walk-A";
  return "walk-A";
}

function firstClause(raw: string): string {
  return String(raw || "").split(/[.!?;\n]/)[0] || "";
}

function stripBodyCamera(raw: string): string {
  return raw.replace(BODY_CAMERA_STEMS, " ").replace(/[^a-z0-9\s-]/gi, " ").replace(/\s+/g, " ").trim();
}

/**
 * Player voice fills biome or one flavor clause only — never camera / body.
 * Unknown phrase: ignore, or one trailing flavor after rails; drop if banned stems remain.
 */
export function readPlayerVoice(raw?: string | null): { biome?: GrammarBiomeId; flavor?: string } {
  const text = String(raw || "").trim();
  if (!text) return {};
  const lower = text.toLowerCase();
  for (const [phrase, biome] of Object.entries(PLAYER_VOICE_DICT)) {
    if (new RegExp(`\\b${phrase.replace(/-/g, "[-\\s]?")}\\b`, "i").test(lower)) {
      return { biome };
    }
  }
  for (const id of BIOME_IDS) {
    if (id === "open") continue;
    if (new RegExp(`\\b${id.replace(/-/g, "[-\\s]?")}\\b`, "i").test(lower)) return { biome: id };
  }
  const clause = firstClause(text);
  if (BANNED_FLAVOR.test(clause)) return {};
  const cleaned = stripBodyCamera(clause);
  if (!cleaned || cleaned.split(/\s+/).length > 8) return {};
  if (BANNED_FLAVOR.test(cleaned)) return {};
  return { flavor: cleaned };
}

export function slotsFromEngine(input: {
  biome?: string | null;
  roomBiome?: string | null;
  act?: { id?: string } | string | number | null;
  tap?: string | null;
  density?: number;
  momentum?: number;
  phase?: number;
  from?: string | null;
  to?: string | null;
  leftover?: boolean | LeftoverSlot | null;
  still?: string | null;
  destStill?: string | null;
  seed?: string | null;
  runSeed?: string | null;
  i?: number;
  miss?: boolean;
  idle?: boolean;
  doorCell?: number | null;
  tapObserve?: TapObserve | null;
  taps?: ReadonlyArray<TapObserve | null | undefined>;
  pictureTime?: number;
  pictureTimes?: ReadonlyArray<number | null | undefined>;
  online?: OnlineStrip | null;
  playerVoice?: string | null;
}): PromptSlots & { wfcStock?: boolean; wfcRole?: string; wfcRelic?: boolean } {
  const voice = readPlayerVoice(input.playerVoice);
  const biome = voice.biome || asGrammarBiome(input.roomBiome || input.biome);
  const tapRaw = String(input.tap || "").trim().toLowerCase();
  const tapAct = mapCookAct(input.tap || input.act);
  const i = Math.max(0, Math.round(Number(input.i) || 0));
  const run = String(input.runSeed || "").trim() || String(input.seed || "").trim() || "s0";
  const doorCell =
    Number.isFinite(Number(input.doorCell))
      ? Math.round(Number(input.doorCell))
      : tapAct === "enter"
        ? i
        : null;
  const momentum = Number(input.momentum) || 0;
  const taps = input.taps?.length
    ? input.taps
    : input.tapObserve
      ? Array.from({ length: Math.max(0, i) }, () => input.tapObserve)
      : input.miss
        ? Array.from({ length: Math.max(0, i) }, () => "miss" as const)
        : input.idle
          ? Array.from({ length: Math.max(0, i) }, () => "idle" as const)
          : [];
  const live =
    input.online ||
    (taps.length
      ? replayOnline({
          s: run,
          i,
          momentum,
          miss: Boolean(input.miss),
          idle: Boolean(input.idle),
          doorCell,
          taps,
          pictureTimes: input.pictureTimes,
        })
      : i === 0
        ? beginOnline({ s: run, i, momentum, miss: Boolean(input.miss), idle: Boolean(input.idle), doorCell })
        : null);
  const onlineCell = live ? cookReadyCell(live, i) || live.cells[i] : null;
  const { strip, cell } = onlineCell
    ? { strip: live!, cell: onlineCell }
    : collapsePlateCell({
        s: run,
        i,
        momentum,
        miss: Boolean(input.miss),
        idle: Boolean(input.idle),
        doorCell,
      });
  const tapWins =
    tapRaw === "l" ||
    tapRaw === "r" ||
    tapRaw === "left" ||
    tapRaw === "right" ||
    tapRaw === "enter" ||
    tapRaw === "walk-a" ||
    tapRaw === "walk-b";
  const act = tapWins ? tapAct : actFromRole(cell.role);
  const leftover: LeftoverSlot =
    act === "enter" && (input.leftover === "from-token" || input.leftover === true) ? "from-token" : "none";
  const fromTo =
    act === "enter" && input.from && input.to
      ? { from: String(input.from), to: String(input.to) }
      : null;
  const entry = biomeEntry(biome);
  const dest = input.destStill ? String(input.destStill) : act === "enter" ? entry.still : null;
  const seed =
    String(input.seed || "").trim() ||
    plateSeed(String(input.runSeed || "s0"), i, act, biome);
  return {
    biome,
    act,
    fork: cell.fork,
    trail: cell.trail,
    floor: cell.floor,
    leftover,
    fromTo,
    still: String(input.still || entry.still),
    destStill: dest,
    seed,
    flavor: voice.flavor,
    wfcStock: cell.stock || Boolean(live?.stock || ("stock" in strip && strip.stock)),
    wfcRole: cell.role,
    wfcRelic: cell.relic,
  };
}

export type AssembledPrompt = {
  prompt: string;
  avoid: string;
  slots: PromptSlots;
};

/**
 * Assembly template — not chat.
 * {RAILS} [Flavor?] Biome / World / Act / Path / Momentum / Floor / enter? / Continuity / Seed
 */
export function assemblePrompt(slots: PromptSlots): AssembledPrompt {
  const biome = biomeEntry(slots.biome);
  const flavor = slots.flavor ? `Flavor: ${slots.flavor}.` : "";
  const enter = enterLine(slots);
  const prompt = [
    RAILS,
    flavor,
    `Biome: ${biome.name}. World: ${biome.worldLine}. Act: ${actLine(slots.act)}. Path: ${pathLine(slots.fork)}. Momentum: ${trailLine(slots.trail)} ${floorLine(slots.floor)}.`,
    enter,
    `Continuity: match last frame exactly for body, lens, hall ribs. Seed: ${slots.seed}.`,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return { prompt, avoid: RAILS_AVOID, slots };
}

export type LintIssue =
  | "missing-rails"
  | "missing-lock"
  | "missing-9:16"
  | "missing-no-text"
  | "slot-enum"
  | "morph"
  | "banned-flavor"
  | "flavor-length";

export type LintResult = { ok: true } | { ok: false; issue: LintIssue; detail?: string };

function withoutRails(prompt: string): string {
  const text = String(prompt || "");
  if (text.startsWith(RAILS)) return text.slice(RAILS.length).trim();
  return text.replace(RAILS, "").trim();
}

function flavorClause(rest: string): string {
  const m = rest.match(/Flavor:\s*([^.]*)/i);
  return m?.[1]?.trim() || "";
}

export function lintPrompt(prompt: string, slots?: PromptSlots): LintResult {
  const text = String(prompt || "").replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, issue: "missing-rails" };
  if (!/LOCKED-OFF CAMERA/i.test(text)) return { ok: false, issue: "missing-lock" };
  for (const phrase of RAILS_PHRASES) {
    if (!text.includes(phrase)) return { ok: false, issue: "missing-rails", detail: phrase };
  }
  if (!/9:16/.test(text)) return { ok: false, issue: "missing-9:16" };
  if (!/no text/i.test(text)) return { ok: false, issue: "missing-no-text" };
  if (slots) {
    if (!inEnum(BIOME_IDS, slots.biome)) return { ok: false, issue: "slot-enum", detail: "biome" };
    if (!inEnum(ACT_IDS, slots.act)) return { ok: false, issue: "slot-enum", detail: "act" };
    if (!inEnum(FORK_IDS, slots.fork)) return { ok: false, issue: "slot-enum", detail: "fork" };
    if (!inEnum(TRAIL_IDS, slots.trail)) return { ok: false, issue: "slot-enum", detail: "trail" };
    if (!inEnum(FLOOR_IDS, slots.floor)) return { ok: false, issue: "slot-enum", detail: "floor" };
    if (!inEnum(LEFTOVER_IDS, slots.leftover)) return { ok: false, issue: "slot-enum", detail: "leftover" };
    if (!slots.seed) return { ok: false, issue: "slot-enum", detail: "seed" };
    if (slots.flavor) {
      const clause = firstClause(slots.flavor);
      if (clause.split(/\s+/).filter(Boolean).length > 8) return { ok: false, issue: "flavor-length" };
      if (BANNED_FLAVOR.test(clause)) return { ok: false, issue: "banned-flavor", detail: clause };
    }
  }
  const rest = withoutRails(text);
  const flavors = rest.match(/Flavor:/gi) || [];
  if (flavors.length > 1) return { ok: false, issue: "flavor-length" };
  const flavor = slots?.flavor || flavorClause(rest);
  if (flavor) {
    if (flavor.split(/\s+/).filter(Boolean).length > 8) return { ok: false, issue: "flavor-length" };
    if (BANNED_FLAVOR.test(flavor)) return { ok: false, issue: "banned-flavor", detail: flavor };
  }
  const extra = rest.replace(/Flavor:\s*[^.]+\.\s*/i, "");
  if (MORPH_EXTRA.test(extra)) return { ok: false, issue: "morph", detail: extra.slice(0, 80) };
  return { ok: true };
}

export function stockOnLintFail(biome?: string | null): { clip: string; still: string } {
  const entry = biomeEntry(biome);
  return { clip: stockBiomeLoop(biome), still: entry.still };
}

/** Last frame wins if one image; last + dest for enter. */
export function fewShotRefs(slots: PromptSlots): string[] {
  const last = String(slots.still || "").trim();
  const dest = String(slots.destStill || "").trim();
  if (slots.act === "enter" && last && dest && dest !== last) return [last, dest];
  if (last) return [last];
  if (dest) return [dest];
  return [];
}

export function isSprintGrammarPrompt(prompt: string): boolean {
  const text = String(prompt || "");
  if (/WHOLE hall|REJECT LIST|profile-hero|STATIC CCTV/i.test(text)) return false;
  return /LOCKED-OFF CAMERA/i.test(text);
}

export type CookAssemble = AssembledPrompt & {
  lint: LintResult;
  stock: { clip: string; still: string };
  wfc?: { role: string; stock: boolean; relic: boolean };
};

export function assembleCookPlate(input: {
  biome?: string | null;
  playerVoice?: string | null;
  world?: string | null;
  cookAct?: { id?: string } | string | number | null;
  tap?: string | null;
  still?: string | null;
  destStill?: string | null;
  seed?: string | null;
  runSeed?: string | null;
  i?: number;
  from?: string | null;
  to?: string | null;
  leftover?: boolean | LeftoverSlot | null;
  density?: number;
  momentum?: number;
  phase?: number;
  miss?: boolean;
  idle?: boolean;
  doorCell?: number | null;
  tapObserve?: TapObserve | null;
  taps?: ReadonlyArray<TapObserve | null | undefined>;
  pictureTime?: number;
  pictureTimes?: ReadonlyArray<number | null | undefined>;
  online?: OnlineStrip | null;
}): CookAssemble {
  const filled = slotsFromEngine({
    biome: input.biome,
    playerVoice: input.playerVoice || input.world,
    act: input.cookAct,
    tap: input.tap,
    still: input.still,
    destStill: input.destStill,
    seed: input.seed,
    runSeed: input.runSeed,
    i: input.i,
    from: input.from,
    to: input.to,
    leftover: input.leftover,
    density: input.density,
    momentum: input.momentum ?? 0.3,
    phase: input.phase,
    miss: input.miss,
    idle: input.idle,
    doorCell: input.doorCell,
    tapObserve: input.tapObserve,
    taps: input.taps,
    pictureTime: input.pictureTime,
    pictureTimes: input.pictureTimes,
    online: input.online,
  });
  const { wfcStock, wfcRole, wfcRelic, ...slots } = filled;
  const assembled = assemblePrompt(slots);
  return {
    ...assembled,
    lint: lintPrompt(assembled.prompt, slots),
    stock: stockOnLintFail(slots.biome),
    wfc: { role: String(wfcRole || ""), stock: Boolean(wfcStock), relic: Boolean(wfcRelic) },
  };
}

export function applyImagineAvoid(payload: Record<string, unknown>, avoid: string) {
  if (IMAGINE_AVOID_FIELD && avoid) payload[IMAGINE_AVOID_FIELD] = avoid;
  return payload;
}
