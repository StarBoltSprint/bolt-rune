/** Fail-fast Imagine slot retries. Do not babysit busy/cooldown for minutes. */
export const COOK_BUSY_TRIES = 3;
export const COOK_BUSY_WAIT_MS = 1800;
export const COOK_BUSY_FROST = "Imagine busy · tap retry";
export const COOK_START_ACCEPTED_PCT = 18;

export function isCookSlotBlock(error: string | undefined): boolean {
  return error === "busy" || error === "cooldown";
}

/** 1-based count of busy/cooldown start failures so far. */
export function cookBusyNext(failCount: number): "wait" | "give-up" {
  return failCount >= COOK_BUSY_TRIES ? "give-up" : "wait";
}
