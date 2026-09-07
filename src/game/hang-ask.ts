/** Hang A leftover click typically lands 300–400ms later. Confirm stays off that tap. */
export const HANG_CONFIRM_ARM_MS = 1100;
/** Swallow leftover Play Sprint / confirm taps for the same window. */
export const HANG_LEFTOVER_SWALLOW_MS = 1100;

const SWALLOW = ["click", "pointerup", "touchend", "mouseup"] as const;

/**
 * Eat leftover Hang A/B / Bot Hang taps so they cannot:
 * - retarget onto Play Sprint (card title uses pointerup)
 * - retarget onto the confirm button after the sheet mounts
 * Room picks still go through after the first leftover of each type.
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

export function swallowOpeningTap(ms = HANG_LEFTOVER_SWALLOW_MS, target?: TapTarget | null): () => void {
  const root = target ?? (typeof document !== "undefined" ? document : null);
  if (!root) return () => {};
  const seen = new Set<string>();
  const stop = (e: Event) => {
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
