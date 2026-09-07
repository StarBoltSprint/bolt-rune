import { hallN, type HangRoomPick } from "./rooms.ts";

/** Hang A leftover click typically lands 300–400ms later. Confirm stays off that tap. */
export const HANG_CONFIRM_ARM_MS = 1100;
/** Swallow leftover Play Sprint / confirm taps for the same window. */
export const HANG_LEFTOVER_SWALLOW_MS = 1100;

/** Pending Hang after citadel + room lock — door A/B is chosen in the living hall. */
export const HANG_PENDING_KEY = "bolt-hang-pending-v1";

export type HangPending = {
  id: string;
  citadel: string;
  hall: number;
};

export function writeHangPending(p: HangPending | null): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    if (!p?.id || !hallN(p.hall)) {
      sessionStorage.removeItem(HANG_PENDING_KEY);
      return;
    }
    sessionStorage.setItem(
      HANG_PENDING_KEY,
      JSON.stringify({
        id: String(p.id).slice(0, 80),
        citadel: String(p.citadel || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48),
        hall: hallN(p.hall),
      }),
    );
  } catch {
    /* */
  }
}

export function readHangPending(): HangPending | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(HANG_PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as HangPending;
    const hall = hallN(p?.hall);
    const id = String(p?.id || "").slice(0, 80);
    if (!id || !hall) return null;
    return {
      id,
      citadel: String(p.citadel || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48),
      hall,
    };
  } catch {
    return null;
  }
}

export function takeHangPending(): HangPending | null {
  const p = readHangPending();
  writeHangPending(null);
  return p;
}

/** Same-tab Hang floor. hold grows; set is the Load count after a drop. */
export const HANG_HALL_FLOOR = "bolt-hang-halls-floor";

export function writeHangFloor(n: number, mode: "hold" | "set" = "hold") {
  try {
    if (typeof sessionStorage === "undefined") return;
    const next = Math.max(1, Math.min(8, Math.round(Number(n) || 1)));
    if (mode === "set") {
      sessionStorage.setItem(HANG_HALL_FLOOR, String(next));
      return;
    }
    const cur = Number(sessionStorage.getItem(HANG_HALL_FLOOR) || 0);
    sessionStorage.setItem(HANG_HALL_FLOOR, String(Math.max(cur, next)));
  } catch {
    /* */
  }
}

/** Drop / remap a pending hang that pointed at a deleted Load room. */
export function dropHangPending(citadel: string, hall: number | "all", remap: Array<[number, number]> = []) {
  const p = readHangPending();
  if (!p) return;
  if (p.citadel && citadel && p.citadel !== citadel) return;
  if (hall === "all" || p.hall === hall) {
    writeHangPending(null);
    return;
  }
  const moved = remap.find(([from]) => from === p.hall)?.[1];
  if (moved && moved !== p.hall) writeHangPending({ ...p, hall: moved });
}

/** Wrap carousel index. Swipe left (+1) is next. */
export function hangStillWrap(count: number, index: number, delta: number): number {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n <= 0) return 0;
  const i = Math.floor(Number(index) || 0);
  const d = Math.trunc(Number(delta) || 0);
  return ((i + d) % n + n) % n;
}

/** Picture centre locks. Left/right edges are back — not next/prev. */
export function hangStillLane(nx: number): "back" | "lock" {
  if (!Number.isFinite(nx)) return "lock";
  if (nx < 0.22 || nx > 0.78) return "back";
  return "lock";
}

/** Horizontal swipe: −1 prev, +1 next, 0 tap. */
export function hangStillSwipe(dx: number, dy: number, slop = 56): -1 | 0 | 1 {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  if (Math.abs(dx) < slop || Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

/** Hall N painted on a Hang sheet card — never an index or last-hung hall. */
export function hangCardHall(n?: number | string | null): number {
  return hallN(typeof n === "number" ? n : n == null || n === "" ? 0 : n);
}

/** Confirm uses the tapped card N, not the parent column / last hang. */
export function sheetConfirmHall(picked?: number | string | null, parentHall?: number | string | null): number {
  return hangCardHall(picked) || hangCardHall(parentHall) || 1;
}

/** Bind / confirm N — tapped card only. Never last-hung, parent, or list length. */
export function hangBindHall(picked?: number | string | null): number {
  return hangCardHall(picked);
}

export type HangStripCard = {
  index: number;
  hall: number;
  bindHall?: number;
};

/**
 * Strip cards: painted Room N is `r.hall`, never index+1, never bindHall, never list length.
 * Cook-box Room 8 can pass (index 7 ≡ hall 8) while Room 3 (index 2) must still bind 3.
 */
export function hangStripCards(rooms: HangRoomPick[] = []): HangStripCard[] {
  return rooms.flatMap((r, index) => {
    const hall = hangCardHall(r.hall);
    if (!hall) return [];
    return [{ index, hall, bindHall: hangCardHall(r.bindHall) || undefined }];
  });
}

/** Tap the card at `index` → that card's hall N. Never index+1, length, or bindHall. */
export function hangStripPick(rooms: HangRoomPick[] = [], index: number): number {
  const card = hangStripCards(rooms)[index];
  return card?.hall || 0;
}

const SWALLOW = ["click", "pointerup", "touchend", "mouseup"] as const;

/**
 * Eat leftover Hang A/B / Bot Hang taps so they cannot:
 * - retarget onto Play Sprint (card title uses pointerup)
 * - retarget onto the confirm button after the sheet mounts
 * Room cards (`data-hang-pick`) are never swallowed — leftover Hang A is
 * pointerup (click/touchend on the card used to be first-of-type and died).
 */
type TapTarget = {
  addEventListener: (type: string, fn: (e: Event) => void, cap?: boolean) => void;
  removeEventListener: (type: string, fn: (e: Event) => void, cap?: boolean) => void;
};

function attrOf(node: EventTarget | null, name: string): string | null {
  if (!node || typeof (node as Element).getAttribute !== "function") return null;
  return (node as Element).getAttribute(name);
}

function pathOf(e: Event): EventTarget[] {
  return typeof e.composedPath === "function" ? e.composedPath() : e.target ? [e.target] : [];
}

function hitsConfirm(e: Event): boolean {
  return pathOf(e).some((node) => attrOf(node, "data-hang-confirm") != null);
}

function hitsPlaySprint(e: Event): boolean {
  return pathOf(e).some((node) => attrOf(node, "data-play-sprint") != null);
}

function hitsHangPick(e: Event): boolean {
  return pathOf(e).some((node) => attrOf(node, "data-hang-pick") != null);
}

function hitsHangOpen(e: Event): boolean {
  return pathOf(e).some((node) => attrOf(node, "data-hang") != null || attrOf(node, "data-hang-bot") != null);
}

export function swallowOpeningTap(ms = HANG_LEFTOVER_SWALLOW_MS, target?: TapTarget | null): () => void {
  const root = target ?? (typeof document !== "undefined" ? document : null);
  if (!root) return () => {};
  const seen = new Set<string>();
  const stop = (e: Event) => {
    /* Room cards must receive the first tap. Leftover Hang A is pointerup;
       the card uses click/touchend — swallowing first-of-type ate Room 3
       and confirm bound the last hall (8). */
    if (hitsHangPick(e)) return;
    const steal = hitsConfirm(e) || hitsPlaySprint(e) || hitsHangOpen(e);
    const first = !seen.has(e.type);
    if (first) seen.add(e.type);
    if (!first && !steal) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  };
  for (const t of SWALLOW) root.addEventListener(t, stop, true);
  const timer = typeof window !== "undefined" ? window : globalThis;
  const id = timer.setTimeout(() => {
    for (const t of SWALLOW) root.removeEventListener(t, stop, true);
  }, ms);
  return () => {
    timer.clearTimeout(id);
    for (const t of SWALLOW) root.removeEventListener(t, stop, true);
  };
}
