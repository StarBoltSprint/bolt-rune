import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  COOK_BUSY_FROST,
  COOK_BUSY_TRIES,
  COOK_BUSY_WAIT_MS,
  COOK_START_ACCEPTED_PCT,
  cookBusyGiveUpFrost,
  cookBusyNext,
  cookBusyWaitFrost,
  isCookSlotBlock,
  isLocalSlotHold,
} from "./cook-busy.ts";

describe("cook busy fail-fast", () => {
  it("caps busy/cooldown at 3 short waits, then give-up", () => {
    assert.equal(COOK_BUSY_TRIES, 3);
    assert.ok(COOK_BUSY_WAIT_MS <= 2000);
    assert.equal(cookBusyNext(1), "wait");
    assert.equal(cookBusyNext(2), "wait");
    assert.equal(cookBusyNext(3), "give-up");
    assert.equal(COOK_BUSY_FROST, "Imagine busy · tap retry");
    assert.equal(COOK_START_ACCEPTED_PCT, 18);
  });

  it("treats busy and cooldown as slot blocks", () => {
    assert.equal(isCookSlotBlock("busy"), true);
    assert.equal(isCookSlotBlock("cooldown"), true);
    assert.equal(isCookSlotBlock("held"), true);
    assert.equal(isCookSlotBlock("capacity"), true);
    assert.equal(isCookSlotBlock("net"), false);
    assert.equal(isCookSlotBlock("echo-off"), false);
    assert.equal(isLocalSlotHold("held"), true);
    assert.equal(isLocalSlotHold("busy"), true);
    assert.equal(isLocalSlotHold("capacity"), false);
    assert.equal(cookBusyWaitFrost("held"), "Slot held · waiting");
    assert.equal(cookBusyWaitFrost("capacity"), "Imagine capacity · waiting");
    assert.equal(cookBusyGiveUpFrost("held"), "Slot held · tap retry");
    assert.equal(cookBusyGiveUpFrost("capacity"), "Imagine capacity · tap retry");
    assert.equal(cookBusyGiveUpFrost("busy"), COOK_BUSY_FROST);
  });

  it("startRefs frees the rune slot before cookRefs (human + Grok Bot Forge)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const start = src.indexOf("function startRefs");
    assert.ok(start >= 0, "startRefs missing");
    const next = src.indexOf("\n  function ", start + 1);
    const body = src.slice(start, next > start ? next : start + 800);
    const freeAt = body.indexOf("freeRuneSlot");
    const cookAt = body.indexOf("cookRefs");
    assert.ok(freeAt >= 0, "startRefs must call freeRuneSlot");
    assert.ok(cookAt >= 0, "startRefs must call cookRefs");
    assert.ok(freeAt < cookAt, "freeRuneSlot must run before cookRefs");
    assert.match(body, /freeRuneSlot[\s\S]*\.then\([\s\S]*cookRefs/);
    assert.match(src, /isLocalSlotHold/);
    assert.match(src, /cookBusyWaitFrost/);
    assert.match(src, /data-slot-reason=/);
    const cookSrc = readFileSync(join(here, "cook.ts"), "utf8");
    assert.match(cookSrc, /takeCookSlot/);
    assert.match(cookSrc, /classifyImagineRaw/);
    assert.match(cookSrc, /error: next.error/);
    assert.doesNotMatch(cookSrc, /error: "busy"/);
    assert.match(cookSrc, /reason: st.reason/);
  });
});
