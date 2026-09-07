/**
 * Shared Imagine video slot. Module-level inflight is the local lock —
 * not xAI capacity. Failed / abandoned cooks must release or the next
 * start looks "busy" while nobody is on the key.
 */

export const SLOT_STALE_MS = 90_000;

export type SlotPhase = "idle" | "starting" | "polling";
export type SlotBlock = "held" | "cooldown";
export type SlotReason = "idle" | "starting" | "polling" | "held";

export type CookSlot = {
  inflight: number;
  lastStart: number;
  requestId: string | null;
  phase: SlotPhase;
};

export function emptyCookSlot(): CookSlot {
  return { inflight: 0, lastStart: 0, requestId: null, phase: "idle" };
}

export function sweepStale(slot: CookSlot, now: number, staleMs = SLOT_STALE_MS): CookSlot {
  if (slot.inflight > 0 && slot.lastStart > 0 && now - slot.lastStart > staleMs) return emptyCookSlot();
  return slot;
}

/** Take the local video slot. No post-release cooldown — that painted solo cooks as busy. */
export function takeCookSlot(slot: CookSlot, now: number): { slot: CookSlot; error?: "held"; ageMs?: number } {
  const swept = sweepStale(slot, now);
  if (swept.inflight > 0) {
    return { slot: swept, error: "held", ageMs: swept.lastStart ? now - swept.lastStart : 0 };
  }
  return { slot: { inflight: 1, lastStart: now, requestId: null, phase: "starting" } };
}

export function bindCookSlot(slot: CookSlot, requestId: string): CookSlot {
  return { ...slot, requestId, phase: "polling", inflight: Math.max(1, slot.inflight) };
}

/** Drop the lock. lastStart stays only as telemetry — it does not block the next take. */
export function releaseCookSlot(slot: CookSlot): CookSlot {
  return { inflight: 0, lastStart: slot.lastStart, requestId: null, phase: "idle" };
}

/** Hard clear, including lastStart. Use after abandon / Director retry. */
export function freeCookSlot(): CookSlot {
  return emptyCookSlot();
}

export function slotStatus(slot: CookSlot, now: number) {
  const swept = sweepStale(slot, now);
  const ageMs = swept.lastStart ? now - swept.lastStart : 0;
  if (swept.inflight <= 0) {
    return { busy: false, reason: "idle" as const, ageMs, hasJob: false, stale: slot.inflight > 0 && swept.inflight <= 0 };
  }
  const reason: SlotReason = swept.phase === "polling" ? "polling" : swept.phase === "starting" ? "starting" : "held";
  return { busy: true, reason, ageMs, hasJob: Boolean(swept.requestId), stale: false };
}

/** xAI body → capacity. Local inflight is "held", never this. */
export function classifyImagineRaw(raw: string): "capacity" | "timeout" | "echo-off" | "clip-too-large" | null {
  const t = String(raw || "").toLowerCase();
  if (t.includes("52428800") || t.includes("clip-too-large") || t.includes("clip too large") || /exceeds?\s+maximum\s+size/.test(t) || /video.{0,40}too large/.test(t)) {
    return "clip-too-large";
  }
  if (t.includes("overload") || t.includes("unavailable") || t.includes("429") || t.includes("capacity") || t.includes("rate limit")) {
    return "capacity";
  }
  if (t.includes("timeout") || t.includes("abort")) return "timeout";
  if (t.includes("echo-off") || t.includes("unauthorized") || t.includes("401")) return "echo-off";
  return null;
}
