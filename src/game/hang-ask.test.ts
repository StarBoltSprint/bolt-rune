import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HANG_CONFIRM_ARM_MS, HANG_LEFTOVER_SWALLOW_MS, swallowOpeningTap } from "./hang-ask.ts";

function clickOn(target: { closest?: (sel: string) => unknown; getAttribute: (k: string) => string | null }) {
  const e = new Event("click", { bubbles: true, cancelable: true });
  Object.defineProperty(e, "target", { value: target });
  Object.defineProperty(e, "composedPath", { value: () => [target] });
  return e;
}

describe("hang ask leftover tap", () => {
  it("confirm stays unarmed long enough that Hang A leftover click cannot bind", () => {
    assert.ok(HANG_CONFIRM_ARM_MS >= 1000);
    assert.ok(HANG_LEFTOVER_SWALLOW_MS >= HANG_CONFIRM_ARM_MS);
  });

  it("swallowOpeningTap eats leftover Play Sprint and confirm taps", () => {
    const hits: string[] = [];
    const cap: Array<(e: Event) => void> = [];
    const bubble: Array<(e: Event) => void> = [];
    const root = {
      addEventListener(type: string, fn: (e: Event) => void, capture?: boolean) {
        (capture ? cap : bubble).push(fn);
      },
      removeEventListener(type: string, fn: (e: Event) => void, capture?: boolean) {
        const list = capture ? cap : bubble;
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      },
      dispatch(e: Event) {
        for (const fn of cap) fn(e);
        if (!e.defaultPrevented) for (const fn of bubble) fn(e);
      },
    };
    bubble.push((e) => hits.push((e.target as { kind?: string }).kind || e.type));
    const confirm = {
      kind: "confirm",
      getAttribute: (k: string) => (k === "data-hang-confirm" ? "A" : null),
    };
    const play = {
      kind: "play",
      getAttribute: (k: string) => (k === "data-play-sprint" ? "" : null),
    };
    const room = {
      kind: "room",
      getAttribute: () => null,
    };
    const release = swallowOpeningTap(80, root);
    root.dispatch(clickOn(play));
    root.dispatch(clickOn(play));
    root.dispatch(clickOn(confirm));
    root.dispatch(clickOn(room));
    assert.deepEqual(hits, ["room"]);
    release();
    root.dispatch(clickOn(confirm));
    assert.deepEqual(hits, ["room", "confirm"]);
  });
});
