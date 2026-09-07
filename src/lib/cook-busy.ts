/** Fail-fast Imagine slot retries. Do not babysit busy/cooldown for minutes. */
export const COOK_BUSY_TRIES = 3;
export const COOK_BUSY_WAIT_MS = 1800;
export const COOK_BUSY_FROST = "Imagine busy · tap retry";
export const COOK_START_ACCEPTED_PCT = 18;

export type CookBusyKind = "held" | "cooldown" | "capacity" | "busy";

export function cookBusyKind(error: string | undefined): CookBusyKind | null {
  if (error === "held" || error === "cooldown" || error === "capacity" || error === "busy") return error;
  return null;
}

export function isCookSlotBlock(error: string | undefined): boolean {
  return cookBusyKind(error) != null;
}

/** Local inflight leftover — free the slot, do not blame xAI. */
export function isLocalSlotHold(error: string | undefined): boolean {
  return error === "held" || error === "busy";
}

export function cookBusyWaitFrost(error?: string): string {
  if (error === "held") return "Slot held · waiting";
  if (error === "cooldown") return "Slot cooling · waiting";
  if (error === "capacity") return "Imagine capacity · waiting";
  return "Imagine busy · waiting";
}

export function cookBusyGiveUpFrost(error?: string): string {
  if (error === "held") return "Slot held · tap retry";
  if (error === "cooldown") return "Slot cooling · tap retry";
  if (error === "capacity") return "Imagine capacity · tap retry";
  return COOK_BUSY_FROST;
}

/** 1-based count of busy/cooldown start failures so far. */
export function cookBusyNext(failCount: number): "wait" | "give-up" {
  return failCount >= COOK_BUSY_TRIES ? "give-up" : "wait";
}
