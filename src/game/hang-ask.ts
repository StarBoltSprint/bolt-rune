/** Hang A leftover click typically lands 300–400ms later. Confirm stays off that tap. */
export const HANG_CONFIRM_ARM_MS = 1100;
/** Swallow confirm taps for the same window so a late leftover cannot bind. */
export const HANG_LEFTOVER_SWALLOW_MS = 1100;

const SWALLOW = ["click", "pointerup", "touchend", "mouseup"] as const;

/**
 * Eat leftover Hang A/B taps that retarget onto the confirm button
 * after the sheet mounts. Room picks still go through.
 */
type TapTarget = {
  addEventListener: (type: string, fn: (e: Event) => void, cap?: boolean) => void;
  removeEventListener: (type: string, fn: (e: Event) => void, cap?: boolean) => void;
};

function hitsConfirm(e: Event): boolean {
  const path = typeof e.composedPath === "function" ? e.composedPath() : [];
  for (const node of path) {
    if (node && typeof (node as Element).getAttribute === "function" && (node as Element).getAttribute("data-hang-confirm") != null) {
      return true;
    }
  }
  const t = e.target as Element | null;
  return Boolean(t && typeof t.closest === "function" && t.closest("[data-hang-confirm]"));
}

export function swallowOpeningTap(ms = HANG_LEFTOVER_SWALLOW_MS, target?: TapTarget | null): () => void {
  const root = target ?? (typeof document !== "undefined" ? document : null);
  if (!root) return () => {};
  const stop = (e: Event) => {
    if (!hitsConfirm(e)) return;
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
