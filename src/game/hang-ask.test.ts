import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HANG_CONFIRM_ARM_MS, HANG_LEFTOVER_SWALLOW_MS, swallowOpeningTap } from "./hang-ask.ts";

describe("hang ask leftover tap", () => {
  it("confirm stays unarmed long enough that Hang A leftover click cannot bind", () => {
    assert.ok(HANG_CONFIRM_ARM_MS >= 700);
    assert.ok(HANG_LEFTOVER_SWALLOW_MS > HANG_CONFIRM_ARM_MS);
  });

  it("swallowOpeningTap eats the first leftover click, then lets a later click through", () => {
    const hits: string[] = [];
    const cap: Array<(e: Event) => void> = [];
    const bubble: Array<(e: Event) => void> = [];
    const target = {
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
    bubble.push((e) => hits.push(e.type));
    const release = swallowOpeningTap(40, target);
    target.dispatch(new Event("click", { bubbles: true, cancelable: true }));
    assert.deepEqual(hits, []);
    target.dispatch(new Event("click", { bubbles: true, cancelable: true }));
    assert.deepEqual(hits, ["click"]);
    release();
  });
});
