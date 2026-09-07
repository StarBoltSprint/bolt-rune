/** Omit stills (or stills=1) → look / Forge. Explicit stills=0 → stock tap hall. */
export function pathEntry(stills?: boolean): "look" | "stock" {
  return stills === false ? "stock" : "look";
}

export function createPathHref(first: "m1" | "m2", q = "drive=engine&rooms=1&hall=1", stills?: boolean) {
  const href = `/rune?first=${first}&${q}`;
  if (stills === false) return `${href}&stills=0`;
  if (stills === true) return `${href}&stills=1`;
  return href;
}

/** New citadel Door A look + Grok Bot Forge. Cook opens this — no GUI click. */
export function createBotForgeHref(first: "m1" | "m2" = "m1", q = "drive=engine&rooms=1&hall=1") {
  return `${createPathHref(first, q)}&forge=bot`;
}

function lookSearchGet(search: unknown, key: string): unknown {
  if (search == null) return undefined;
  if (typeof search === "string") {
    const q = search.includes("?") ? search.slice(search.indexOf("?") + 1) : search.replace(/^\?/, "");
    return new URLSearchParams(q).get(key);
  }
  if (typeof URLSearchParams !== "undefined" && search instanceof URLSearchParams) return search.get(key);
  if (typeof search === "object") return (search as Record<string, unknown>)[key];
  return undefined;
}

function isBotForgeFlag(raw: unknown): boolean {
  if (raw === true || raw === 1) return true;
  if (raw == null || raw === false || raw === 0) return false;
  const v = String(raw).trim().toLowerCase();
  return v === "bot" || v === "1" || v === "true";
}

/** `forge=bot` (canonical) or `botForge=1` on a look/hall path. */
export function parseLookForge(search?: unknown): "bot" | undefined {
  const forge = lookSearchGet(search, "forge");
  if (forge != null && String(forge).trim().toLowerCase() === "start") return undefined;
  if (isBotForgeFlag(forge)) return "bot";
  if (isBotForgeFlag(lookSearchGet(search, "botForge"))) return "bot";
  return undefined;
}

export function shouldAutoStartBotForge(input: {
  phase?: string;
  forge?: "bot" | string | null;
  stills?: boolean;
}): boolean {
  if (input.phase !== "look") return false;
  if (pathEntry(input.stills) !== "look") return false;
  return input.forge === "bot";
}

const lookForgeAutoClaimed = new Set<string>();

/** Once per page load (and per test key). Prevents auto-start loops / Strict remounts. */
export function claimLookForgeAuto(key = "load"): boolean {
  if (lookForgeAutoClaimed.has(key)) return false;
  lookForgeAutoClaimed.add(key);
  return true;
}

export function resetLookForgeAuto(key?: string) {
  if (key) lookForgeAutoClaimed.delete(key);
  else lookForgeAutoClaimed.clear();
}

export type BoltForgeHook = {
  startBot: () => boolean;
};

declare global {
  interface Window {
    __boltForge?: BoltForgeHook;
  }
}

/**
 * Human Forge keeps the live look pack (hall + walks).
 * Bot custom is look-screen hall STYLE only (style → LOCK, mic, image).
 * Graph + walk/breath stay engine. Unlocked bot = sealed DEFAULT HALL.
 */
export type LookForgeKind = "start" | "bot";
export type LookForgePack = "live" | "sealed" | "hall";

export type LookHallLock = {
  style?: string | null;
  still?: string | null;
  pack?: { id: string; src?: string }[] | null;
};

const BRIDGE_PACK = new Set(["same-hall", "door-a", "door-b"]);

/** Look-screen style → LOCK (text / voice / image still). CLEAR or empty → unlocked. */
export function lookHallLocked(lock?: LookHallLock | null): boolean {
  if (!lock) return false;
  if (String(lock.style || "").trim()) return true;
  if (String(lock.still || "").trim()) return true;
  return (lock.pack || []).some((p) => p?.src && !BRIDGE_PACK.has(p.id));
}

/** Bot never rewrites walk/breath extras. Human live pack may carry hall style. */
export function lookForgeWalkStyle(kind: LookForgeKind, style?: string | null): string {
  if (kind === "bot") return "";
  return String(style || "").trim();
}

export function lookForgeStart(
  kind: LookForgeKind,
  lock?: LookHallLock | null,
): { dataForge: LookForgeKind; sealed: boolean; pack: LookForgePack } {
  if (kind !== "bot") return { dataForge: "start", sealed: false, pack: "live" };
  return lookHallLocked(lock)
    ? { dataForge: "bot", sealed: false, pack: "hall" }
    : { dataForge: "bot", sealed: true, pack: "sealed" };
}

/** Sealed biome cook — no OS filechooser. Mirrors lookForgeStart("bot"). */
export function biomeBotStart(): { dataBiome: "bot"; sealed: true } {
  return { dataBiome: "bot", sealed: true };
}

export type VaultHangKind = "A" | "B" | "bot";

export function vaultHangStart(kind: VaultHangKind): { dataHang: VaultHangKind; sealed: boolean } {
  return kind === "bot" ? { dataHang: "bot", sealed: true } : { dataHang: kind, sealed: false };
}
