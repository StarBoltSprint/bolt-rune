import { hungBiomePlaylist, hungPlayChrome } from "./enter-graph";
import { playableClipSrc } from "./play-clip";
import { b, turnBeatsForRun, type Beat, type Film } from "./films";
import { ENGINE } from "./laws";
import { assembleCookPlate } from "./pcg-prompt.ts";

export { LOCK, RAILS, RAILS_AVOID } from "./pcg-prompt.ts";

export type ClipSecs = 6 | 10 | 15;
export type ClipRes = "720" | "1080";

const SPEC_KEY = "bolt-clip-spec-v1";
export const CLIP_SPEC_EVENT = "bolt-clip-spec";

export function readClipSpec(): { secs: ClipSecs; res: ClipRes } {
  try {
    if (typeof window === "undefined") return { secs: 10, res: "720" };
    const raw = window.localStorage.getItem(SPEC_KEY);
    if (!raw) return { secs: 10, res: "720" };
    const p = JSON.parse(raw) as { secs?: number; res?: string };
    return {
      secs: p.secs === 6 || p.secs === 15 ? p.secs : 10,
      res: p.res === "1080" ? "1080" : "720",
    };
  } catch {
    return { secs: 10, res: "720" };
  }
}

export function writeClipSpec(secs: ClipSecs, res: ClipRes) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SPEC_KEY, JSON.stringify({ secs, res }));
    window.dispatchEvent(new Event(CLIP_SPEC_EVENT));
  } catch {
    /* */
  }
}

export type BiomeId =
  | "asteroid"
  | "forest"
  | "canyon"
  | "city"
  | "open"
  | "ocean"
  | "dune"
  | "ruin"
  | "ember"
  | "peak"
  | "rome"
  | "greece"
  | "persia"
  | "egypt"
  | "babylon";

export type CookAct = {
  id: string;
  title: string;
  beat: string;
};

export const BIOMES: { id: BiomeId; name: string; tag: string; world: string; still: string; loop: string; runes: string[] }[] = [
  {
    id: "asteroid",
    name: "Asteroid",
    tag: "void · path",
    world: "a sci-fi asteroid field in deep space, luminous gold-cyan path through the void",
    still: "/films/cook-asteroid.jpg",
    loop: "/films/forge-asteroid.mp4",
    runes: ["void", "gold path", "shards"],
  },
  {
    id: "forest",
    name: "Forest",
    tag: "crystal · moss",
    world: "a living crystal-ice forest, purple-blue trees, luminous path on the moss",
    still: "/films/cook-forest.jpg",
    loop: "/films/forge-forest.mp4",
    runes: ["moss", "crystal", "dusk"],
  },
  {
    id: "canyon",
    name: "Canyon",
    tag: "ice · shard",
    world: "a vast living ice canyon with crystal shards growing from the walls",
    still: "/films/cook-canyon.jpg",
    loop: "/films/forge-canyon.mp4",
    runes: ["ice", "lean", "storm"],
  },
  {
    id: "city",
    name: "City",
    tag: "storm · night",
    world: "a night sci-fi city in a lightning storm, wet streets, neon ice light",
    still: "/films/cook-city.jpg",
    loop: "/films/forge-city.mp4",
    runes: ["night", "lightning", "wet"],
  },
  {
    id: "open",
    name: "Seed",
    tag: "your line",
    world: "whatever the one-line prompt describes, still cinematic and readable",
    still: "/films/cook-seed.jpg",
    loop: "/films/forge-seed.mp4",
    runes: [],
  },
  {
    id: "ocean",
    name: "Ocean",
    tag: "reef · black sea",
    world: "a black ice ocean, crystal reefs, dark waves, a luminous path on the water",
    still: "/films/cook-ocean.jpg",
    loop: "/films/forge-ocean.mp4",
    runes: ["reef", "tide", "storm"],
  },
  {
    id: "dune",
    name: "Dune",
    tag: "gold · wind",
    world: "vast crystal dunes at night, gold sand, ice spires, a luminous path",
    still: "/films/cook-dune.jpg",
    loop: "/films/forge-dune.mp4",
    runes: ["gold", "wind", "dune"],
  },
  {
    id: "ruin",
    name: "Ruin",
    tag: "citadel · moon",
    world: "a fallen ice citadel, broken towers, moonlit ruins, a luminous path",
    still: "/films/cook-ruin.jpg",
    loop: "/films/forge-ruin.mp4",
    runes: ["ruin", "moon", "stone"],
  },
  {
    id: "ember",
    name: "Ember",
    tag: "glass · ash",
    world: "volcanic glass and ember cracks, dark magma light, ash, a luminous path",
    still: "/films/cook-ember.jpg",
    loop: "/films/forge-ember.mp4",
    runes: ["ember", "ash", "glass"],
  },
  {
    id: "peak",
    name: "Peak",
    tag: "aurora · cliff",
    world: "a high ice mountain peak, aurora, wind, sheer cliffs, a luminous path",
    still: "/films/cook-peak.jpg",
    loop: "/films/forge-peak.mp4",
    runes: ["aurora", "wind", "cliff"],
  },
  {
    id: "rome",
    name: "Rome",
    tag: "marble · forum",
    world: "ancient Rome at night, marble Forum, Corinthian columns, wet stone, lightning over the Palatine, a luminous gold-cyan path",
    still: "/films/cook-rome.jpg",
    loop: "/films/forge-rome.mp4",
    runes: ["marble", "forum", "storm"],
  },
  {
    id: "greece",
    name: "Greece",
    tag: "olive · acropolis",
    world: "ancient Greece at night, the Acropolis, Parthenon colonnade, olive trees, silver Aegean moonlight, a luminous gold-cyan path",
    still: "/films/cook-greece.jpg",
    loop: "/films/forge-greece.mp4",
    runes: ["olive", "marble", "sea"],
  },
  {
    id: "persia",
    name: "Persia",
    tag: "fire · gold",
    world: "ancient Persia at night, Persepolis columns, winged-bull gateways, gold fire bowls, desert wind, a luminous gold-cyan path",
    still: "/films/cook-persia.jpg",
    loop: "/films/forge-persia.mp4",
    runes: ["fire", "gold", "wind"],
  },
  {
    id: "egypt",
    name: "Egypt",
    tag: "nile · stone",
    world: "ancient Egypt at night, Karnak pylons, obelisks, pyramids, Nile mist, star desert, a luminous gold-cyan path",
    still: "/films/cook-egypt.jpg",
    loop: "/films/forge-egypt.mp4",
    runes: ["nile", "sand", "star"],
  },
  {
    id: "babylon",
    name: "Babylon",
    tag: "gate · lapis",
    world: "ancient Babylon at night, Ishtar Gate of blue glazed bricks and golden lions, a ziggurat, hanging gardens, a luminous gold-cyan path",
    still: "/films/cook-babylon.jpg",
    loop: "/films/forge-babylon.mp4",
    runes: ["lapis", "gate", "garden"],
  },
];

export const ACTS: CookAct[] = [
  { id: "intro", title: "Quiet", beat: "Sparse world. Thin cyan lightning. Faint path forming. Calm sprint. Turns ONLY on the cue sheet." },
  { id: "chain", title: "Chain", beat: "Path brighter, lightning growing. Fast sprint. Turns ONLY on the cue sheet." },
  { id: "mid", title: "Density", beat: "World richer, orange paw sparks. Turns ONLY on the cue sheet." },
  { id: "lean", title: "Lean", beat: "He runs. Lightning builds. Turns ONLY on the cue sheet." },
  { id: "peak", title: "Peak", beat: "Full cyan lightning trail, blazing path. Turns ONLY on the cue sheet." },
  { id: "finale", title: "Answer", beat: "Densest field, corridor of light. Turns ONLY on the cue sheet." },
];

export function forkLock(clipN = 1) {
  const n = Math.max(1, clipN | 0);
  return [
    `PATH LAW CLIP ${n}: NEW GROUND ONLY. Never the same stretch of trail twice.`,
    "The last frame is a START pose, not the map. You MUST invent forks and aisles that are not drawn in that still.",
    "After every turn the camera (locked behind him) looks down a DIFFERENT corridor. Old trees leave the frame and do not return.",
    "The gold-cyan path never retraces. One-way. Always revealing unseen forest.",
  ].join(" ");
}

export function paceLock(clipN = 1) {
  const n = Math.max(1, Math.min(12, clipN | 0));
  if (n <= 1) {
    return "He is ALREADY sprinting from frame 1. Four-leg gallop. NEVER a walk, NEVER a trot, NEVER standing, NEVER slowing down.";
  }
  return [
    `This is clip ${n} of one continuous sprint. He is ALREADY at full gallop from the last frame of clip ${n - 1}.`,
    "NEVER walk. NEVER trot. NEVER slow down. NEVER reset to a standing or walking start.",
    `He runs FASTER than the previous clip: longer stride, lower body, heavier motion blur, more wind in the fur, paws hitting harder, denser orange sparks.`,
    `Cyan lightning is already strong and grows. The gold-cyan path rushes under him. Camera locked behind, matching his new speed. Gear ${n}/8.`,
  ].join(" ");
}

export function runeSlug(word: string) {
  return word.trim().toLowerCase().replace(/\s+/g, "-");
}

export function runeKey(biome: BiomeId, word: string) {
  return `${biome}-${runeSlug(word)}`;
}

export function runeStill(biome: BiomeId, word: string) {
  return `/films/cook-${runeKey(biome, word)}.jpg`;
}

export function runeLoop(biome: BiomeId, word: string) {
  return `/films/forge-${runeKey(biome, word)}.mp4`;
}

const RUNE_FILMS = new Set(["forest-moss", "forest-crystal", "forest-dusk"]);

export function hasRuneFilm(biome: BiomeId, word: string) {
  return RUNE_FILMS.has(runeKey(biome, word));
}

export function worldOf(biome: BiomeId, prompt: string) {
  const seed = prompt.trim();
  if (!seed) return BIOMES.find((b) => b.id === biome)?.world ?? BIOMES[0].world;
  return seed;
}

export function forkStillPrompt() {
  return [
    "EDIT THE TRAIL ONLY. Same white German Shepherd from behind, same sprint pose, same locked camera, same biome.",
    "AHEAD of the paws the gold-cyan path is now a clear Y-junction, like a road split: LEFT aisle, CENTER, RIGHT aisle.",
    "LEFT aisle: a NEW darker corridor of different trees. RIGHT aisle: a NEW brighter corridor of different trees.",
    "Both side aisles are already open in this still, obvious, wide enough to sprint into. The wolf has NOT turned yet.",
    "Do not rotate the wolf. Do not show his face. Photoreal 9:16. No text.",
  ].join(" ");
}

export function continuePrompt(world: string, _secs: 6 | 10 | 15 = 10, clipN = 2) {
  return assembleCookPlate({
    biome: "open",
    playerVoice: world,
    tap: "walk-A",
    i: Math.max(1, clipN | 0),
    momentum: 0.35,
  }).prompt;
}

export const SHIFTS: { id: string; name: string; world: string }[] = [
  { id: "ember", name: "Lava", world: "volcanic glass, ember cracks, rivers of magma, ash sky, a luminous gold-cyan path over black rock" },
  { id: "crystal", name: "Crystals", world: "living crystal caverns, giant prism trunks, violet-cyan facets, moss of ice-crystal, a luminous path" },
  { id: "canyon", name: "Canyon", world: "a vast living ice canyon with crystal shards growing from the walls" },
  { id: "ocean", name: "Ocean", world: "a black ice ocean, crystal reefs, dark waves, a luminous path on the water" },
  { id: "dune", name: "Dune", world: "vast crystal dunes at night, gold sand, ice spires, a luminous path" },
  { id: "city", name: "City", world: "a night sci-fi city in a lightning storm, wet streets, neon ice light" },
  { id: "peak", name: "Peak", world: "a high ice mountain peak, aurora, wind, sheer cliffs, a luminous path" },
  { id: "ruin", name: "Ruin", world: "a fallen ice citadel, broken towers, moonlit ruins, a luminous path" },
  { id: "asteroid", name: "Void", world: "a sci-fi asteroid field in deep space, luminous gold-cyan path through the void" },
];

export function shiftPrompt(fromWorld: string, toWorld: string, _secs: 6 | 10 | 15 = 10, clipN = 2) {
  return assembleCookPlate({
    biome: "open",
    playerVoice: toWorld,
    tap: "enter",
    from: fromWorld.trim() || "hall",
    to: toWorld.trim() || "biome",
    leftover: true,
    i: Math.max(1, clipN | 0),
    momentum: 0.4,
  }).prompt;
}

export function stillPrompt(world: string) {
  return assembleCookPlate({
    biome: "open",
    playerVoice: world,
    tap: "walk-A",
    momentum: 0.3,
  }).prompt;
}

export function platePrompt(biome: BiomeId, prompt: string, act: CookAct, world?: string, _secs: 6 | 10 | 15 = 10) {
  return assembleCookPlate({
    biome,
    playerVoice: prompt || world,
    world,
    cookAct: act,
    momentum: 0.3,
  }).prompt;
}

export function cookBeats(until = 10): Beat[] {
  const n = Math.max(1, Math.round(until / 10));
  return turnBeatsForRun(Array.from({ length: n }, () => (until / n)));
}

export function biomePlaylist(id: BiomeId): string[] {
  if (id === "forest") {
    return [
      "/films/forge-forest.mp4",
      "/films/forge-forest-moss.mp4",
      "/films/forge-forest-crystal.mp4",
      "/films/forge-forest-dusk.mp4",
    ];
  }
  const hit = BIOMES.find((b) => b.id === id);
  const loop = hit?.loop || "/films/forge-asteroid.mp4";
  return [loop, loop, loop, loop];
}

export function riftPrompt(world: string, door: "teal" | "gold") {
  return [
    "LOCKED CAMERA, dead center, 9:16. MATCH THIS FRAME: same citadel hall, same floor, same wolf StarBoltSprint seen from behind at this exact closed door.",
    `The ${door} door opens inward. He walks through without a cut.`,
    `The hall becomes: ${world}. Same wolf, white coat, never morphs.`,
    "He starts to run. Photoreal. No text, no UI, no other animals.",
  ].join(" ");
}

export function riftBeats(): Beat[] {
  return [
    b("r1", 5.8, "right", "r", "→", { win: 1.25 }),
    b("r2", 9.6, "left", "l", "←", { win: 1.2 }),
    b("r3", 13.4, "right", "r", "→", { win: 1.15 }),
    b("r4", 17.0, "left", "l", "←", { win: 1.12 }),
    b("r5", 20.4, "right", "r", "→", { win: 1.08 }),
    b("r6", 23.8, "left", "l", "←", { win: 1.05 }),
    b("r7", 27.2, "right", "r", "→", { win: 1.02 }),
    b("r8", 30.4, "left", "l", "←", { win: 1.0 }),
    b("r9", 33.6, "right", "r", "→", { win: 0.95 }),
    b("r10", 36.6, "left", "l", "←", { win: 0.92 }),
  ];
}

/** Hung biome stay: Room N chrome + sprint QTE. Hall leftover MISS is hallPlateNow, not an empty chart. */
export function quietBiomeFilm(film: Film): Film {
  const each = 15;
  const plates = film.playlist?.length ? film.playlist : [];
  const beats = film.beats?.length
    ? film.beats
    : turnBeatsForRun(plates.length ? plates.map(() => each) : [each]);
  return {
    ...film,
    beats,
    pad: film.pad ?? "arrows",
    lives: film.lives && film.lives > 0 ? film.lives : 3,
  };
}

function filmFromPlates(name: string, still: string, plates: string[], prompt?: string): Film {
  const src = plates[0] ?? "";
  const each = 15;
  const dur = Math.max(each, Math.max(1, plates.length) * each);
  return {
    id: "sprint",
    name: name || "Cooked sprint",
    keeper: "StarBoltSprint",
    line: prompt || name || ENGINE.bone,
    verb: "Sprint",
    still,
    portraitStill: still,
    local: src || still,
    portrait: src || still,
    origin: src || still,
    chart: dur,
    pad: "arrows",
    lives: 3,
    beats: turnBeatsForRun(plates.length ? plates.map(() => each) : [each]),
    playlist: plates,
  };
}

function asPlates(urls: string[], keepStock: boolean) {
  if (keepStock) return hungBiomePlaylist(urls);
  const plates: string[] = [];
  for (const raw of urls.filter(Boolean)) {
    const u = playableClipSrc(raw);
    if (!u) continue;
    if (/\/films\/forge-[a-z0-9-]+\.mp4$/i.test(u.split("?")[0] || u)) continue;
    if (!plates.includes(u)) plates.push(u);
  }
  return plates;
}

/** Vault / door enter: keep stock biome loops so play is a sprint, not a citadel still. */
export function biomeSprintFilm(name: string, still: string, urls: string[], prompt?: string): Film {
  return filmFromPlates(name, still, asPlates(urls, true), prompt);
}

export function stockBiomeFilm(id: BiomeId): Film {
  const hit = BIOMES.find((b) => b.id === id) ?? BIOMES[0];
  return biomeSprintFilm(hit.name, hit.still, biomePlaylist(hit.id), hit.world);
}

export function riftFilm(
  name: string,
  still: string,
  urls: string[],
  hall?: number,
  door?: "A" | "B" | "m1" | "m2",
): Film {
  const film = biomeSprintFilm(name, still, urls, name);
  const n = typeof hall === "number" && hall >= 1 && hall <= 8 ? Math.round(hall) : 0;
  if (!n) return film;
  const chrome = hungPlayChrome(n, door || "A");
  return quietBiomeFilm({
    ...film,
    name: chrome.name,
    keeper: chrome.keeper,
    line: name && name !== chrome.name ? name : chrome.name,
  });
}

export function cookFilm(name: string, still: string, urls: string[], prompt?: string): Film {
  return filmFromPlates(name, still, asPlates(urls, false), prompt);
}
