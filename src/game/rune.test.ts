import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HALL_LOOP, HALL_STILL, isHallFilm, stockRoomBank } from "./stock-room.ts";

describe("stock living room", () => {
  it("isHallFilm accepts the locked hall still and living loop, not landing chrome", () => {
    assert.equal(isHallFilm(HALL_STILL), true);
    assert.equal(isHallFilm(HALL_LOOP), true);
    assert.equal(isHallFilm("/ui/citadel.jpg?v=aaa"), false);
    assert.equal(isHallFilm("/refs/hall-doors.jpg"), false);
    assert.equal(isHallFilm(""), false);
  });

  it("stockRoomBank seeds breath plus both doors from spawn", () => {
    const keys = stockRoomBank("m1").map((b) => b.key);
    assert.ok(keys.includes("idle-spawn"));
    assert.ok(keys.includes("idle-m1"));
    assert.ok(keys.includes("idle-m2"));
    assert.ok(keys.includes("spawn→m1"));
    assert.ok(keys.includes("spawn→m2"));
    assert.ok(keys.includes("m1→m2"));
    assert.ok(keys.includes("m2→m1"));
    for (const row of stockRoomBank("m2")) {
      assert.equal(row.url, HALL_LOOP);
      assert.equal(row.end, HALL_STILL);
    }
  });
});
