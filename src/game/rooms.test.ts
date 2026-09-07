import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bindCitadel, citadelRoomCount, defaultHangRoom, hangOpensSheet, listHangRooms, resolveHangRoom } from "./rooms.ts";
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

  it("lastPlay.rooms keeps hall 2 when hydrate dropped catalog rooms", () => {
    const rooms = listHangRooms([cit(1, 1)], { id: "cit-1", hall: 1, rooms: 2 });
    assert.deepEqual(
      rooms.map((r) => r.hall),
      [1, 2],
    );
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

  it("empty halls[] slots still count as rooms — never collapse to Room 1", () => {
    const rooms = listHangRooms([cit(1, 1)], { id: "cit-1", hall: 1 }, [], [
      { hall: 1, name: "Room 1", still: "", living: true },
      { hall: 2, name: "Room 2", still: "", living: false },
    ]);
    assert.deepEqual(
      rooms.map((r) => r.hall),
      [1, 2],
    );
    assert.equal(citadelRoomCount({ rooms: 1, halls: [{ n: 1 }, { n: 2 }] }), 2);
    assert.equal(citadelRoomCount({ rooms: 2, halls: [{ n: 1 }] }), 2);
    assert.equal(citadelRoomCount({ rooms: 1, hall: 2 }), 2);
    assert.equal(citadelRoomCount({ rooms: 1, halls: [{}, {}, {}] }), 3);
  });

  it("rooms=3 or halls length 3 → three picks; living marked here", () => {
    const byRooms = listHangRooms([cit(3, 2)], { id: "cit-1", hall: 2 });
    assert.deepEqual(
      byRooms.map((r) => r.hall),
      [1, 2, 3],
    );
    assert.equal(byRooms.find((r) => r.living)?.hall, 2);
    const byHalls = listHangRooms([{ ...cit(1, 2), hallHints: [{ n: 1 }, { n: 2 }, { n: 3 }] }], { id: "cit-1", hall: 2 });
    assert.deepEqual(
      byHalls.map((r) => r.hall),
      [1, 2, 3],
    );
    assert.equal(byHalls.find((r) => r.living)?.hall, 2);
  });

  it("Door A/B child sessions appear as hang rooms of the living citadel", () => {
    const parent = cit(1, 1, "cit-1");
    const child = { ...cit(1, 2, "cit-1-b"), from: "cit-1", name: "Room 2" };
    const rooms = listHangRooms([parent, child], { id: "cit-1", hall: 1 });
    assert.deepEqual(
      rooms.map((r) => r.hall),
      [1, 2],
    );
  });

  it("last-play rooms=1 does not collapse a 3-room catalog", () => {
    const rooms = listHangRooms([cit(3, 1)], { id: "cit-1", hall: 1, rooms: 1 });
    assert.deepEqual(
      rooms.map((r) => r.hall),
      [1, 2, 3],
    );
  });

  it("Hang A/B and Grok Bot Hang always open the sheet before binding", () => {
    assert.equal(hangOpensSheet("A", 1), true);
    assert.equal(hangOpensSheet("B", 1), true);
    assert.equal(hangOpensSheet("A", 3), true);
    assert.equal(hangOpensSheet("bot", 1), true);
    assert.equal(hangOpensSheet("bot", 2), true);
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
