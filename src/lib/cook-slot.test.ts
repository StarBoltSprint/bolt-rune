import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SLOT_STALE_MS,
  bindCookSlot,
  classifyImagineRaw,
  emptyCookSlot,
  freeCookSlot,
  releaseCookSlot,
  slotStatus,
  sweepStale,
  takeCookSlot,
} from "./cook-slot.ts";

describe("cook slot — zombie busy vs xAI capacity", () => {
  it("a failed / released start does not block the next take", () => {
    const t0 = 1_000_000;
    const taken = takeCookSlot(emptyCookSlot(), t0);
    assert.equal(taken.error, undefined);
    assert.equal(taken.slot.inflight, 1);
    const released = releaseCookSlot(taken.slot);
    assert.equal(released.inflight, 0);
    const again = takeCookSlot(released, t0 + 200);
    assert.equal(again.error, undefined);
    assert.equal(again.slot.phase, "starting");
  });

  it("held is local inflight, not xAI capacity", () => {
    const t0 = 2_000_000;
    const a = takeCookSlot(emptyCookSlot(), t0);
    const b = takeCookSlot(a.slot, t0 + 50);
    assert.equal(b.error, "held");
    assert.ok((b.ageMs ?? 0) >= 50);
    assert.equal(classifyImagineRaw("429 rate limit capacity"), "capacity");
    assert.equal(classifyImagineRaw("model overloaded"), "capacity");
    assert.equal(classifyImagineRaw("VIDEO EXCEEDS MAXIMUM SIZE OF 52428800 BYTES"), "clip-too-large");
    assert.equal(classifyImagineRaw("ok request_id"), null);
    assert.notEqual(b.error, "capacity");
  });

  it("stale inflight after a partial cook clears so solo retry can start", () => {
    const t0 = 3_000_000;
    const taken = takeCookSlot(emptyCookSlot(), t0);
    const bound = bindCookSlot(taken.slot, "req-zombie");
    assert.equal(slotStatus(bound, t0 + 1000).reason, "polling");
    const stale = sweepStale(bound, t0 + SLOT_STALE_MS + 1);
    assert.equal(stale.inflight, 0);
    assert.equal(stale.requestId, null);
    const next = takeCookSlot(bound, t0 + SLOT_STALE_MS + 1);
    assert.equal(next.error, undefined);
  });

  it("freeCookSlot wipes a zombie so Director retry is not solo-busy", () => {
    const t0 = 4_000_000;
    const taken = takeCookSlot(emptyCookSlot(), t0);
    const bound = bindCookSlot(taken.slot, "req-partial");
    const freed = freeCookSlot();
    assert.deepEqual(freed, emptyCookSlot());
    const next = takeCookSlot(bound.inflight ? freed : freed, t0 + 10);
    assert.equal(next.error, undefined);
    assert.equal(slotStatus(freed, t0).busy, false);
    assert.equal(slotStatus(freed, t0).reason, "idle");
  });
});
