export type BoltScreen = "title" | "how" | "play" | "result" | "cook";
export type BoltGate = "rifts" | "howl" | "world" | "studio" | "cook" | "rune";

export type BoltLoc = {
  screen: BoltScreen;
  gate?: BoltGate;
  page?: number;
  biome?: string;
};

const KEY = "boltLoc";
const DEPTH = "boltDepth";
const STORE = "bolt-loc-v2";

function bag(state: unknown): Record<string, unknown> {
  return state && typeof state === "object" ? { ...(state as Record<string, unknown>) } : {};
}

function persist(loc: BoltLoc) {
  try {
    sessionStorage.setItem(STORE, JSON.stringify(loc));
  } catch {
    /* */
  }
}

function storedBolt(): BoltLoc | null {
  try {
    const raw = sessionStorage.getItem(STORE);
    if (!raw) return null;
    const loc = JSON.parse(raw) as BoltLoc;
    if (!loc || typeof loc !== "object") return null;
    const screen = loc.screen;
    if (screen !== "title" && screen !== "how" && screen !== "play" && screen !== "result" && screen !== "cook") {
      return null;
    }
    return loc;
  } catch {
    return null;
  }
}

export function readBolt(state: unknown = typeof window === "undefined" ? null : window.history.state): BoltLoc | null {
  const loc = bag(state)[KEY];
  if (loc && typeof loc === "object") {
    const screen = (loc as BoltLoc).screen;
    if (screen === "title" || screen === "how" || screen === "play" || screen === "result" || screen === "cook") {
      return loc as BoltLoc;
    }
  }
  return storedBolt();
}

export function boltDepth(state: unknown = typeof window === "undefined" ? null : window.history.state): number {
  const n = bag(state)[DEPTH];
  return typeof n === "number" && n > 0 ? n : 0;
}

function hrefFor(loc: BoltLoc): string {
  const u = new URL(window.location.href);
  if (loc.screen === "title") {
    if (loc.page === 0) u.hash = "artifacts";
    else if (loc.page === 1) u.hash = "runes";
    else u.hash = "";
  }
  else if (loc.screen === "how") u.hash = "how";
  else if (loc.screen === "play") u.hash = "play";
  else if (loc.screen === "result") u.hash = "result";
  else if (loc.gate === "rifts") u.hash = "forge";
  else if (loc.gate === "world") u.hash = loc.biome ? `forge/world/${loc.biome}` : "forge/world";
  else if (loc.gate === "studio") u.hash = loc.biome ? `forge/studio/${loc.biome}` : "forge/studio";
  else if (loc.gate === "cook") u.hash = loc.biome ? `forge/cook/${loc.biome}` : "forge/cook";
  else if (loc.gate) u.hash = `forge/${loc.gate}`;
  else u.hash = "forge";
  return `${u.pathname}${u.search}${u.hash}`;
}

export function parseBoltHash(h: string): BoltLoc | null {
  const raw = String(h || "").replace(/^#/, "");
  if (!raw) return { screen: "title" };
  if (raw === "artifacts") return { screen: "title", page: 0 };
  if (raw === "runes") return { screen: "title", page: 1 };
  if (raw === "how") return { screen: "how" };
  if (raw === "play") return { screen: "play" };
  if (raw === "result") return { screen: "result" };
  if (raw === "forge" || raw === "forge/0" || /^forge\/\d+$/.test(raw)) return { screen: "cook", gate: "rifts", page: 0 };
  const world = /^forge\/world(?:\/([\w-]+))?$/.exec(raw);
  if (world) return { screen: "cook", gate: "world", page: 0, biome: world[1] };
  const studio = /^forge\/studio(?:\/([\w-]+))?$/.exec(raw);
  if (studio) return { screen: "cook", gate: "studio", page: 0, biome: studio[1] };
  const cook = /^forge\/cook(?:\/([\w-]+))?$/.exec(raw);
  if (cook) return { screen: "cook", gate: "cook", page: 0, biome: cook[1] };
  if (raw === "forge/howl") return { screen: "cook", gate: "howl", page: 0 };
  if (raw === "forge/rune") return { screen: "cook", gate: "rune", page: 1 };
  return null;
}

export function locFromHash(): BoltLoc | null {
  if (typeof window === "undefined") return null;
  return parseBoltHash(window.location.hash.replace(/^#/, ""));
}

export function sameBolt(a: BoltLoc | null, b: BoltLoc | null): boolean {
  if (!a || !b) return a === b;
  return a.screen === b.screen && a.gate === b.gate && (a.page ?? -1) === (b.page ?? -1) && (a.biome ?? "") === (b.biome ?? "");
}

export function replaceBolt(loc: BoltLoc) {
  persist(loc);
  const href = hrefFor(loc);
  const now = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const data = { ...bag(window.history.state), [KEY]: loc, [DEPTH]: boltDepth() };
  if (now === href || now === href.replace(/#$/, "")) {
    window.history.replaceState(data, "", now);
    return;
  }
  window.history.replaceState(data, "", href);
}

export function pushBolt(loc: BoltLoc) {
  if (sameBolt(readBolt(), loc)) return;
  persist(loc);
  const data = { ...bag(window.history.state), [KEY]: loc, [DEPTH]: boltDepth() + 1 };
  window.history.pushState(data, "", hrefFor(loc));
}

export function boltBack() {
  if (boltDepth() > 0) window.history.back();
}

export function boltHome() {
  const d = boltDepth();
  if (d > 0) window.history.go(-d);
  else replaceBolt({ screen: "title" });
}
