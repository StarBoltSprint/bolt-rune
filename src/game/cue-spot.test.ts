import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOLT_BODY_X0,
  BOLT_BODY_X1,
  CUE_AISLE_LEFT,
  CUE_AISLE_RIGHT,
  CUE_JUMP_X,
  CUE_JUMP_Y,
  CUE_PATH_Y_MAX,
  CUE_PATH_Y_MIN,
  cuePictureSpot,
  cueSide,
} from "./cue-spot.ts";

const left = { kind: "left" as const, lane: "l" as const, label: "←", spot: { x: 0.5, y: 0.5 } };
const right = { kind: "right" as const, lane: "r" as const, label: "→", spot: { x: 0.5, y: 0.5 } };
const jump = { kind: "tap" as const, lane: "c" as const, label: "↑", spot: { x: 0.5, y: 0.58 } };

describe("cue-spot · never over Bolt", () => {
  it("center-dog left / right spots push to the turn aisle, mid-path", () => {
    assert.equal(CUE_AISLE_LEFT, 0.22);
    assert.equal(CUE_AISLE_RIGHT, 0.78);
    assert.equal(cueSide(left), "left");
    assert.equal(cueSide(right), "right");
    const L = cuePictureSpot(left);
    const R = cuePictureSpot(right);
    assert.ok(L.x <= 0.22, `left aisle x=${L.x}`);
    assert.ok(R.x >= 0.78, `right aisle x=${R.x}`);
    assert.ok(L.x < BOLT_BODY_X0 && R.x > BOLT_BODY_X1);
    assert.ok(L.y >= CUE_PATH_Y_MIN && L.y <= CUE_PATH_Y_MAX);
    assert.ok(R.y >= CUE_PATH_Y_MIN && R.y <= CUE_PATH_Y_MAX);
    assert.notEqual(L.x, 0.5);
    assert.notEqual(R.x, 0.5);
  });

  it("jump tick sits in the vault gap above the path, never on Bolt", () => {
    assert.equal(cueSide(jump), "center");
    const j = cuePictureSpot(jump);
    assert.equal(j.x, CUE_JUMP_X);
    assert.equal(j.y, CUE_JUMP_Y);
    assert.ok(j.x < BOLT_BODY_X0, `jump x=${j.x} must leave his body`);
    assert.ok(j.y < CUE_PATH_Y_MIN, `jump y=${j.y} is above mid-path`);
    assert.notEqual(j.x, 0.5);
    assert.notEqual(j.y, 0.58);
  });

  it("authored aisle spots stay on their side and keep y off his back", () => {
    const deepLeft = cuePictureSpot({
      kind: "left",
      lane: "l",
      label: "←",
      spot: { x: 0.12, y: 0.8 },
    });
    assert.ok(deepLeft.x <= 0.22);
    assert.ok(deepLeft.y <= CUE_PATH_Y_MAX);
    const deepRight = cuePictureSpot({
      kind: "right",
      lane: "r",
      label: "→",
      spot: { x: 0.9, y: 0.2 },
    });
    assert.ok(deepRight.x >= 0.78);
    assert.ok(deepRight.y >= CUE_PATH_Y_MIN);
  });
});
