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

/** Human Forge keeps the live look pack. Bot forge uses sealed DEFAULT HALL + Bolt refs. */
export type LookForgeKind = "start" | "bot";

export function lookForgeStart(kind: LookForgeKind): { dataForge: LookForgeKind; sealed: boolean } {
  return kind === "bot" ? { dataForge: "bot", sealed: true } : { dataForge: "start", sealed: false };
}
