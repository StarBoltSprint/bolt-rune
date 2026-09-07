/** Ghost click after Hang A/B typically lands 300–400ms later. Keep confirm off that tap. */
export const HANG_CONFIRM_ARM_MS = 800;
/** Swallow outlasts confirm mount so a late leftover cannot bind the door. */
export const HANG_LEFTOVER_SWALLOW_MS = 1100;

const SWALLOW = ["click", "pointerup", "touchend", "mouseup"] as const;

/**
 * Eat the leftover click / pointerup from the Hang A tap so it cannot
 * retarget onto the confirm button after the sheet mounts.
 */
type TapTarget = {
  addEventListener: (type: string, fn: (e: Event) => void, cap?: boolean) => void;
  removeEventListener: (type: string, fn: (e: Event) => void, cap?: boolean) => void;
};

export function swallowOpeningTap(ms = HANG_LEFTOVER_SWALLOW_MS, target?: TapTarget | null): () => void {
  const root = target ?? (typeof document !== "undefined" ? document : null);
  if (!root) return () => {};
  const seen = new Set<string>();
  const stop = (e: Event) => {
    if (seen.has(e.type)) return;
    seen.add(e.type);
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
