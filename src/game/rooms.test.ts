import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bindCitadel, defaultHangRoom, listHangRooms, resolveHangRoom } from "./rooms.ts";
import type { RuneSessionMeta } from "./rune-session.ts";

function cit(rooms: number, hall = 1, id = "cit-1"): RuneSessionMeta {
  return {
    id,
    name: "Citadel",
    title: "Citadel",
    updated: 1,
    phase: "play",
    want: 2,
    walks: 0,
    thumb: "/refs/hall-doors.jpg",
    rooms,
    hall,
  };
}

describe("hang room pick", () => {
  it("lists session halls and defaults to the living hall", () => {
    const rooms = listHangRooms([cit(3, 2)], { id: "cit-1", hall: 2 });
    assert.deepEqual(
      rooms.map((r) => r.hall),
      [1, 2, 3],
    );
    assert.equal(rooms.find((r) => r.living)?.hall, 2);
    assert.equal(defaultHangRoom(rooms), 2);
    assert.equal(bindCitadel([cit(3, 2)], { id: "cit-1", hall: 2 }).hall, 2);
  });

  it("no session → hall 1", () => {
    const rooms = listHangRooms([], null);
    assert.equal(rooms.length, 1);
    assert.equal(rooms[0]?.hall, 1);
    assert.equal(defaultHangRoom(rooms), 1);
    assert.equal(bindCitadel([], null).hall, 1);
  });

  it("lists a hung hall even when the catalog only has room 1", () => {
    const rooms = listHangRooms([cit(1, 1)], { id: "cit-1", hall: 1 }, [
      { still: "/films/cook-forest.jpg", room: { hall: 2, still: "/films/cook-canyon.jpg" } },
    ]);
    assert.deepEqual(
      rooms.map((r) => r.hall),
      [1, 2],
    );
    assert.equal(rooms.find((r) => r.hall === 2)?.still, "/films/cook-canyon.jpg");
  });

  it("uses hung stills when a hall already has a picture", () => {
    const rooms = listHangRooms([cit(2, 1)], { id: "cit-1", hall: 1 }, [
      { still: "/films/cook-forest.jpg", room: { hall: 2, still: "/films/cook-canyon.jpg" } },
    ]);
    assert.equal(rooms.find((r) => r.hall === 2)?.still, "/films/cook-canyon.jpg");
  });

  it("bot: one room hangs there; many prefer data-hang-room then living", () => {
    const one = listHangRooms([cit(1)], { id: "cit-1", hall: 1 });
    assert.equal(resolveHangRoom(one, 8), 1);
    assert.equal(resolveHangRoom(one, "2"), 1);
    const many = listHangRooms([cit(3, 1)], { id: "cit-1", hall: 1 });
    assert.equal(resolveHangRoom(many, 2), 2);
    assert.equal(resolveHangRoom(many, "2"), 2);
    assert.equal(resolveHangRoom(many, null), 1);
    assert.equal(resolveHangRoom(many, undefined), 1);
    const living2 = listHangRooms([cit(3, 2)], { id: "cit-1", hall: 2 });
    assert.equal(resolveHangRoom(living2, undefined), 2);
    assert.equal(resolveHangRoom(living2, "9"), 2);
  });
});
