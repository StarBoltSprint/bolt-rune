/** Samsung + iframe tap: click and touchend. No preventDefault on pointer. */
export function press(fn: () => void) {
  let last = 0;
  const run = () => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now - last < 400) return;
    last = now;
    fn();
  };
  return {
    onClick: () => run(),
    onTouchEnd: (e: { preventDefault?: () => void }) => {
      e.preventDefault?.();
      run();
    },
  };
}

export function boltFull() {
  const doc = document as Document & {
    webkitFullscreenElement?: Element;
    webkitExitFullscreen?: () => void;
  };
  const root = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => void;
  };
  const on = document.fullscreenElement || doc.webkitFullscreenElement;
  if (on) {
    void (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
    return;
  }
  const go = root.requestFullscreen?.bind(root) ?? root.webkitRequestFullscreen?.bind(root);
  if (!go) return;
  try {
    const out = go({ navigationUI: "hide" } as FullscreenOptions);
    void Promise.resolve(out).catch(() => go());
  } catch {
    try {
      go();
    } catch {
      /* */
    }
  }
}
