import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HALL_LOOP, HALL_STILL, doorAtPoint, isHallFilm, stockDoorHits, stockRoomBank } from "./stock-room.ts";

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

  it("every stock clip keeps the same locked hall still — no follow-cam crop", () => {
    const ends = new Set(stockRoomBank("m1").map((b) => b.end));
    assert.deepEqual([...ends], [HALL_STILL]);
    assert.equal(isHallFilm(HALL_STILL), true);
  });

  it("picture-space hit-test maps portal cores to Door A / Door B, not spawn", () => {
    const hits = stockDoorHits();
    assert.equal(doorAtPoint(0.26, 0.4, hits), "m1");
    assert.equal(doorAtPoint(0.72, 0.4, hits), "m2");
    assert.equal(doorAtPoint(0.3, 0.34, null), "m1");
    assert.equal(doorAtPoint(0.7, 0.55, null), "m2");
    assert.equal(doorAtPoint(0.12, 0.48, null), "m1");
    assert.equal(doorAtPoint(0.88, 0.48, null), "m2");
    assert.equal(doorAtPoint(0.5, 0.78, hits), "spawn");
    assert.equal(doorAtPoint(0.2, 0.65, hits), "m1");
    assert.equal(doorAtPoint(0.8, 0.65, hits), "m2");
    assert.notEqual(doorAtPoint(0.28, 0.58, hits), "spawn");
    assert.notEqual(doorAtPoint(0.7, 0.58, hits), "spawn");
    assert.equal(doorAtPoint(-0.1, 0.4, hits), null);
  });
});
