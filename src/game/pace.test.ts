import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PACE_MAX, PACE_MIN, PACE_MISS_STEP, paceAfterMiss } from "./pace.ts";

describe("pace · miss step + floor", () => {
  it("MISS drops pace by 0.1 and never below the 0.5 floor", () => {
    assert.equal(PACE_MISS_STEP, 0.1);
    assert.equal(PACE_MIN, 0.5);
    assert.ok(PACE_MIN >= 0.4 && PACE_MIN <= 0.5);
    assert.equal(paceAfterMiss(1), 0.9);
    assert.equal(paceAfterMiss(0.6), 0.5);
    assert.equal(paceAfterMiss(0.5), 0.5);
    assert.equal(paceAfterMiss(0.4), 0.5);
    assert.ok(paceAfterMiss(PACE_MAX) < PACE_MAX);
  });
});
