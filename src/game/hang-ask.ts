import { hallN } from "./rooms.ts";

/** Hang A leftover click typically lands 300–400ms later. Confirm stays off that tap. */
export const HANG_CONFIRM_ARM_MS = 1100;
/** Swallow leftover Play Sprint / confirm taps for the same window. */
export const HANG_LEFTOVER_SWALLOW_MS = 1100;

/** Hall N painted on a Hang sheet card — never an index or last-hung hall. */
export function hangCardHall(n?: number | string | null): number {
  return hallN(typeof n === "number" ? n : n == null || n === "" ? 0 : n);
}

/** Confirm uses the tapped card N, not the parent column / last hang. */
export function sheetConfirmHall(picked?: number | string | null, parentHall?: number | string | null): number {
  return hangCardHall(picked) || hangCardHall(parentHall) || 1;
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

export function swallowOpeningTap(ms = HANG_LEFTOVER_SWALLOW_MS, target?: TapTarget | null): () => void {
  const root = target ?? (typeof document !== "undefined" ? document : null);
  if (!root) return () => {};
  const seen = new Set<string>();
  const stop = (e: Event) => {
    /* Room cards must receive the first tap. Leftover Hang A is pointerup;
       the card uses click/touchend — swallowing first-of-type ate Room 3
       and confirm bound the last hall (8). */
    if (hitsHangPick(e)) return;
    const steal = hitsConfirm(e) || hitsPlaySprint(e);
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
