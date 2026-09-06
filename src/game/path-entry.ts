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
