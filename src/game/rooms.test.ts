import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bindCitadel, citadelRoomCount, confirmHangHall, defaultHangRoom, dropCitadelAll, dropCitadelHall, hangOpensSheet, holdHangRooms, isBiomeArtefactMeta, listHangCitadels, listHangRooms, livingHangHall, livingLoadPacks, loadHangHallCount, packCitadels, resolveHangRoom, unbindDroppedHalls } from "./rooms.ts";
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
    assert.equal(livingHangHall(rooms, 2), 2);
    assert.equal(livingHangHall(rooms, 1), 1);
    assert.equal(livingHangHall([{ hall: 1, name: "Room 1", still: "", living: true }], 2), 2);
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

  it("explicit pick N wins even on a 1-card list; missing want uses the only room", () => {
    const one = listHangRooms([cit(1)], { id: "cit-1", hall: 1 });
    assert.equal(resolveHangRoom(one, 8), 8);
    assert.equal(resolveHangRoom(one, "2"), 2);
    assert.equal(resolveHangRoom(one, undefined), 1);
    const many = listHangRooms([cit(3, 1)], { id: "cit-1", hall: 1 });
    assert.equal(resolveHangRoom(many, 2), 2);
    assert.equal(resolveHangRoom(many, "2"), 2);
    assert.equal(resolveHangRoom(many, null), 1);
    assert.equal(resolveHangRoom(many, undefined), 1);
    const living2 = listHangRooms([cit(3, 2)], { id: "cit-1", hall: 2 });
    assert.equal(resolveHangRoom(living2, undefined), 2);
    assert.equal(resolveHangRoom(living2, "9"), 2);
  });

  it("Hang confirm pick N ≠ living default binds N (Room 8, not Room 2)", () => {
    const eight = listHangRooms([cit(8, 2)], { id: "cit-1", hall: 2 });
    assert.equal(defaultHangRoom(eight), 2);
    assert.equal(resolveHangRoom(eight, 8), 8);
    assert.equal(livingHangHall(eight, 8), 8);
    assert.equal(confirmHangHall(eight, 8), 8);
    assert.equal(confirmHangHall(eight, "8"), 8);
    assert.notEqual(confirmHangHall(eight, 8), defaultHangRoom(eight));
    const short = listHangRooms([cit(2, 2)], { id: "cit-1", hall: 2, rooms: 2 });
    assert.equal(defaultHangRoom(short), 2);
    assert.equal(livingHangHall(short, 8), 8);
    assert.equal(confirmHangHall(short, 8), 8);
    assert.equal(resolveHangRoom(short, 8), 8);
    const living2 = listHangRooms([cit(3, 2)], { id: "cit-1", hall: 2 });
    assert.equal(defaultHangRoom(living2), 2);
    assert.equal(resolveHangRoom(living2, 8), 8);
    assert.equal(confirmHangHall(living2, 8), 8);
  });

  it("8-room citadel living 8 still lists card index 2 as hall 3", () => {
    const eight = listHangRooms([cit(8, 8)], { id: "cit-1", hall: 8 });
    assert.deepEqual(
      eight.map((r) => r.hall),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    assert.equal(eight[2]?.hall, 3);
    assert.notEqual(eight[2]?.hall, 8);
    assert.notEqual(eight[2]?.hall, eight.length);
    assert.equal(defaultHangRoom(eight), 8);
  });

  it("Hang confirm pick Room 3 binds 3, not last hall 8", () => {
    const eight = listHangRooms([cit(8, 8)], { id: "cit-1", hall: 8 });
    assert.equal(defaultHangRoom(eight), 8);
    assert.equal(confirmHangHall(eight, 3), 3);
    assert.equal(confirmHangHall(eight, "3"), 3);
    assert.equal(livingHangHall(eight, 3), 3);
    assert.notEqual(confirmHangHall(eight, 3), 8);
    assert.notEqual(confirmHangHall(eight, 3), defaultHangRoom(eight));
    const short = listHangRooms([cit(2, 8)], { id: "cit-1", hall: 8, rooms: 2 });
    assert.equal(confirmHangHall(short, 3), 3);
    assert.equal(livingHangHall(short, 3), 3);
  });

  it("leftover Hang B after Hang Room 4 does not collapse a 1-card hydrate to Room 1", () => {
    const one = [{ hall: 1, name: "Room 1", still: "", living: true }];
    assert.equal(resolveHangRoom(one, 4), 4);
    assert.equal(livingHangHall(one, 4), 4);
    assert.equal(confirmHangHall(one, 4), 4);
    assert.notEqual(resolveHangRoom(one, 4), 1);
  });

  it("holdHangRooms does not keep Room 1 · HERE after Hang Room 4", () => {
    const older = [1, 2, 3, 4].map((hall) => ({
      hall,
      name: `Room ${hall}`,
      still: hall === 4 ? "/films/cook-forest.jpg" : "",
      living: hall === 1,
    }));
    const newer = older.map((r) => ({ ...r, living: r.hall === 4 }));
    const held = holdHangRooms(older, newer);
    assert.equal(held.find((r) => r.living)?.hall, 4);
    assert.equal(held.find((r) => r.hall === 1)?.living, false);
    assert.equal(held.find((r) => r.hall === 4)?.still, "/films/cook-forest.jpg");
  });

  it("Room 4 still from a hung artefact fills an empty padded hall", () => {
    const rooms = listHangRooms([cit(8, 8)], { id: "cit-1", hall: 8 }, [
      { still: "/films/cook-forest.jpg", room: { hall: 4, still: "/films/cook-forest.jpg" } },
    ]);
    assert.equal(rooms.find((r) => r.hall === 4)?.still, "/films/cook-forest.jpg");
  });

  it("after last-hung 8, pick Room 3 / 5 / 1 still bind that N", () => {
    const eight = listHangRooms([cit(8, 8)], { id: "cit-1", hall: 8 });
    assert.equal(defaultHangRoom(eight), 8);
    for (const n of [3, 4, 5, 1]) {
      assert.equal(confirmHangHall(eight, n), n);
      assert.equal(livingHangHall(eight, n), n);
      assert.notEqual(confirmHangHall(eight, n), 8);
    }
  });

  it("skips biome artefacts so Hang matches Load’s saved citadel halls", () => {
    const hall = cit(3, 2);
    const forest: RuneSessionMeta = {
      id: "art-lux",
      name: "Luxuriant forest",
      title: "Luxuriant forest",
      updated: 99,
      phase: "play",
      want: 2,
      walks: 0,
      thumb: "/films/cook-forest.jpg",
      rooms: 1,
      hall: 1,
    };
    assert.equal(isBiomeArtefactMeta(forest), true);
    assert.equal(isBiomeArtefactMeta(hall), false);
    assert.equal(isBiomeArtefactMeta({ ...cit(1, 1, "art-cook"), title: "Citadel", name: "Citadel" }), true);
    const rooms = listHangRooms([forest, hall], { id: forest.id, hall: 1, rooms: 1 });
    assert.deepEqual(
      rooms.map((r) => r.hall),
      [1, 2, 3],
    );
    assert.deepEqual(
      rooms.map((r) => r.name),
      ["Room 1", "Room 2", "Room 3"],
    );
    assert.equal(
      rooms.some((r) => /forest|luxuriant/i.test(r.name)),
      false,
    );
    const bound = bindCitadel([forest, hall], { id: forest.id, hall: 1, rooms: 1 });
    assert.equal(bound.citadel, "cit-1");
    assert.notEqual(bound.title.toLowerCase().includes("forest"), true);
    const load = packCitadels([forest, hall]);
    assert.equal(load.some((p) => /forest/i.test(p.title)), true);
    assert.equal(load.find((p) => p.root.id === "cit-1")?.rooms.length, 3);
  });

  it("lists each 1-room Load save as a Hang citadel when lastPlay is a biome artefact", () => {
    const forest: RuneSessionMeta = {
      id: "art-lux",
      name: "Luxuriant forest",
      title: "Luxuriant forest",
      updated: 99,
      phase: "play",
      want: 2,
      walks: 0,
      thumb: "/films/cook-forest.jpg",
      rooms: 1,
      hall: 1,
    };
    const a = { ...cit(1, 1, "cit-a"), updated: 3, title: "Keep", name: "Keep" };
    const b = { ...cit(1, 1, "cit-b"), updated: 2, title: "North", name: "North" };
    const c = { ...cit(1, 1, "cit-c"), updated: 1, title: "South", name: "South" };
    const rows = [forest, a, b, c];
    const last = { id: forest.id, hall: 1, rooms: 1 };
    const picks = listHangCitadels(rows, last);
    assert.deepEqual(
      picks.map((p) => p.id).sort(),
      ["cit-a", "cit-b", "cit-c"],
    );
    assert.equal(
      picks.some((p) => /forest|luxuriant/i.test(p.title)),
      false,
    );
    const rooms = listHangRooms(rows, last);
    assert.equal(rooms.length, 1);
    assert.equal(rooms[0]?.hall, 1);
    assert.ok(rooms[0]?.citadel && rooms[0].citadel !== forest.id);
    const north = listHangRooms(rows, last, [], [], [], "cit-b");
    assert.deepEqual(
      north.map((r) => r.citadel),
      ["cit-b"],
    );
    assert.equal(north.length, 1);
  });

  it("a rooms>1 citadel titled after a biome still lists its halls", () => {
    const named = { ...cit(3, 1), title: "Luxuriant forest", name: "Luxuriant forest" };
    assert.equal(isBiomeArtefactMeta(named), false);
    const rooms = listHangRooms([named], { id: "cit-1", hall: 1 });
    assert.deepEqual(
      rooms.map((r) => r.hall),
      [1, 2, 3],
    );
  });

  it("lastPlay rooms=2 still exposes Load’s 8-room citadel on the picker", () => {
    const eight = cit(8, 2);
    const two = { ...cit(2, 2, "cit-two"), updated: 99, title: "Keep", name: "Keep" };
    const forest: RuneSessionMeta = {
      id: "art-lux",
      name: "Luxuriant forest",
      title: "Luxuriant forest",
      updated: 120,
      phase: "play",
      want: 2,
      walks: 0,
      thumb: "/films/cook-forest.jpg",
      rooms: 1,
      hall: 1,
    };
    const last = { id: two.id, hall: 2, rooms: 2 };
    const rows = [two, forest, eight];
    const before = listHangRooms([two, forest], last);
    assert.deepEqual(
      before.map((r) => r.hall),
      [1, 2],
    );
    const picks = listHangCitadels(rows, last);
    assert.equal(
      picks.some((p) => p.id === "cit-1" && p.rooms === 8),
      true,
    );
    assert.equal(
      picks.some((p) => p.id === "cit-two" && p.rooms === 2),
      true,
    );
    const living = listHangRooms(rows, last);
    assert.deepEqual(
      living.map((r) => r.hall),
      [1, 2],
    );
    assert.equal(living.every((r) => r.citadel === "cit-two"), true);
    assert.equal(bindCitadel(rows, last).citadel, "cit-two");
    const eightRooms = listHangRooms(rows, last, [], [], [], "cit-1");
    assert.deepEqual(
      eightRooms.map((r) => r.hall),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    assert.equal(eightRooms.every((r) => r.citadel === "cit-1"), true);
    assert.equal(bindCitadel(rows, last, "cit-1").citadel, "cit-1");
    const load = packCitadels(rows);
    assert.equal(load.find((p) => p.root.id === "cit-1")?.rooms.length, 8);
    assert.equal(loadHangHallCount(livingLoadPacks(rows)), 8);
  });

  it("same citadel lastPlay rooms=2 still lists all 8 saved halls", () => {
    const rooms = listHangRooms([cit(8, 2)], { id: "cit-1", hall: 2, rooms: 2 });
    assert.deepEqual(
      rooms.map((r) => r.hall),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
  });

  it("lastPlay.hall=8 does not invent rooms Load does not have", () => {
    const rooms = listHangRooms([cit(2, 2)], { id: "cit-1", hall: 8, rooms: 2 });
    assert.deepEqual(
      rooms.map((r) => r.hall),
      [1, 2],
    );
  });

  it("six 1-room Load saves plus a 2-room lastPlay pack stay pickable as citadels", () => {
    const two = cit(2, 2);
    const extras = [1, 2, 3, 4, 5, 6].map((i) => ({
      ...cit(1, 1, `cit-n${i}`),
      updated: i,
      title: `Keep ${i}`,
      name: `Keep ${i}`,
    }));
    const rows = [two, ...extras];
    const last = { id: "cit-1", hall: 2, rooms: 2 };
    const rooms = listHangRooms(rows, last);
    assert.deepEqual(
      rooms.map((r) => r.hall),
      [1, 2],
    );
    assert.equal(rooms.every((r) => r.citadel === "cit-1"), true);
    const picks = listHangCitadels(rows, last);
    assert.equal(picks.length, 7);
    assert.equal(picks.filter((p) => p.id !== "cit-1").length, 6);
    const other = listHangRooms(rows, last, [], [], [], "cit-n3");
    assert.equal(other.length, 1);
    assert.equal(other[0]?.citadel, "cit-n3");
    assert.equal(other[0]?.hall, 1);
  });

  it("late 2-room hydrate pass does not overwrite an 8-room Hang list", () => {
    const full = listHangRooms([cit(8, 2)], { id: "cit-1", hall: 2 });
    assert.deepEqual(
      full.map((r) => r.hall),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    const narrow = listHangRooms([cit(2, 2)], { id: "cit-1", hall: 2, rooms: 2 });
    assert.deepEqual(
      narrow.map((r) => r.hall),
      [1, 2],
    );
    const held = holdHangRooms(full, narrow);
    assert.deepEqual(
      held.map((r) => r.hall),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    const again = listHangRooms([cit(2, 2)], { id: "cit-1", hall: 2, rooms: 2 }, [], [], full);
    assert.deepEqual(
      again.map((r) => r.hall),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    assert.equal(
      again.some((r) => /forest|luxuriant/i.test(r.name)),
      false,
    );
  });

  it("a new 1-room Load save appears on the Hang citadel picker without replacing older halls", () => {
    const hall = cit(2, 1);
    const first = listHangRooms([hall], { id: "cit-1", hall: 1 });
    assert.deepEqual(
      first.map((r) => r.hall),
      [1, 2],
    );
    const added = { ...cit(1, 1, "cit-new"), updated: 5, title: "North", name: "North" };
    const next = listHangRooms([hall, added], { id: "cit-1", hall: 1 });
    assert.deepEqual(
      next.map((r) => r.hall),
      [1, 2],
    );
    assert.equal(next.every((r) => r.citadel === "cit-1"), true);
    const picks = listHangCitadels([hall, added], { id: "cit-1", hall: 1 });
    assert.equal(picks.length, 2);
    assert.equal(
      picks.some((p) => p.id === "cit-new"),
      true,
    );
    const north = listHangRooms([hall, added], { id: "cit-1", hall: 1 }, [], [], [], "cit-new");
    assert.equal(north.length, 1);
    assert.equal(north[0]?.citadel, "cit-new");
    const load = packCitadels([hall, added]).filter((p) => !isBiomeArtefactMeta(p.root));
    assert.equal(load.length, 2);
    assert.equal(loadHangHallCount(livingLoadPacks([hall, added])), 3);
  });

  it("Hang never raises one citadel above 8 rooms when many Loads exist", () => {
    const eight = cit(8, 3);
    const more = { ...cit(8, 1, "cit-west"), updated: 9, title: "West", name: "West" };
    const rooms = listHangRooms([eight, more], { id: "cit-1", hall: 3 }, [], [], [], "cit-1");
    assert.deepEqual(
      rooms.map((r) => r.hall),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
    assert.equal(rooms.length, 8);
    const west = listHangRooms([eight, more], { id: "cit-1", hall: 3 }, [], [], [], "cit-west");
    assert.equal(west.length, 8);
    assert.equal(west.every((r) => r.citadel === "cit-west"), true);
    const held = holdHangRooms(rooms, west);
    assert.equal(held.every((r) => r.citadel === "cit-west"), true);
    assert.equal(held.length, 8);
  });

  it("dropping a Load room shrinks Hang to the same halls and frees a slot", () => {
    const rows = [cit(3, 2)];
    const { rows: next, drop } = dropCitadelHall(rows, "cit-1", 3);
    assert.equal(drop.gone, false);
    assert.equal(drop.remaining, 2);
    assert.equal(next[0]?.rooms, 2);
    const hang = listHangRooms(next, { id: "cit-1", hall: 2, rooms: 2 });
    assert.deepEqual(
      hang.map((r) => r.hall),
      [1, 2],
    );
    assert.equal(hang.some((r) => r.hall === 3), false);
    const again = dropCitadelHall(next, "cit-1", 2);
    assert.equal(again.drop.remaining, 1);
    const one = listHangRooms(again.rows, { id: "cit-1", hall: 1, rooms: 1 });
    assert.deepEqual(
      one.map((r) => r.hall),
      [1],
    );
  });

  it("dropping the last room of a Load citadel removes it from the Hang picker", () => {
    const a = cit(1, 1, "cit-a");
    const b = { ...cit(2, 1, "cit-b"), updated: 9, title: "Keep", name: "Keep" };
    const { rows, drop } = dropCitadelHall([a, b], "cit-a", 1);
    assert.equal(drop.gone, true);
    assert.equal(
      rows.some((s) => s.id === "cit-a"),
      false,
    );
    const picks = listHangCitadels(rows, { id: "cit-b", hall: 1, rooms: 2 });
    assert.equal(
      picks.some((p) => p.id === "cit-a"),
      false,
    );
    assert.equal(
      picks.some((p) => p.id === "cit-b"),
      true,
    );
    const hang = listHangRooms(rows, { id: "cit-b", hall: 1, rooms: 2 }, [], [], [], "cit-b");
    assert.deepEqual(
      hang.map((r) => r.hall),
      [1, 2],
    );
  });

  it("holdHangRooms release re-reads Load — no orphan Hang halls", () => {
    const full = listHangRooms([cit(8, 2)], { id: "cit-1", hall: 2 });
    const { rows } = dropCitadelHall([cit(8, 2)], "cit-1", 8);
    const next = listHangRooms(rows, { id: "cit-1", hall: 2, rooms: 7 }, [], [], []);
    assert.deepEqual(
      next.map((r) => r.hall),
      [1, 2, 3, 4, 5, 6, 7],
    );
    const held = holdHangRooms(full, next, true);
    assert.deepEqual(
      held.map((r) => r.hall),
      [1, 2, 3, 4, 5, 6, 7],
    );
    assert.equal(
      held.some((r) => r.hall === 8),
      false,
    );
    const hydrate = holdHangRooms(full, next, false);
    assert.deepEqual(
      hydrate.map((r) => r.hall),
      [1, 2, 3, 4, 5, 6, 7, 8],
    );
  });

  it("dropping a hung hall unbinds the door — no ghost Room N", () => {
    const art = (hall: number) => ({
      id: `art-${hall}`,
      room: { door: "A" as const, still: "/films/cook-forest.jpg", citadel: "cit-1", hall },
    });
    const gone = unbindDroppedHalls([art(3)], "cit-1", 3);
    assert.equal(gone[0]?.room, null);
    const moved = unbindDroppedHalls([art(5)], "cit-1", 3, [[5, 4]]);
    assert.equal(moved[0]?.room?.hall, 4);
    const other = unbindDroppedHalls([art(2)], "cit-west", 2);
    assert.equal(other[0]?.room?.hall, 2);
    const all = unbindDroppedHalls([art(1), art(2)], "cit-1", "all");
    assert.equal(all.every((a) => a.room == null), true);
  });

  it("erase-all drops every hall of a multi-room citadel in one shot", () => {
    const keep = { ...cit(2, 1, "cit-keep"), updated: 9, title: "Keep", name: "Keep" };
    const { rows, drop } = dropCitadelAll([cit(3, 2), keep], "cit-1");
    assert.equal(drop.gone, true);
    assert.equal(drop.remaining, 0);
    assert.equal(
      rows.some((s) => s.id === "cit-1"),
      false,
    );
    assert.equal(
      rows.some((s) => s.id === "cit-keep"),
      true,
    );
    const picks = listHangCitadels(rows, { id: "cit-keep", hall: 1, rooms: 2 });
    assert.equal(
      picks.some((p) => p.id === "cit-1"),
      false,
    );
    assert.equal(
      picks.some((p) => p.id === "cit-keep"),
      true,
    );
    const hang = listHangRooms(rows, { id: "cit-keep", hall: 1, rooms: 2 }, [], [], [], "cit-keep");
    assert.deepEqual(
      hang.map((r) => r.hall),
      [1, 2],
    );
  });

  it("drop? on a missing / biome-titled Load card still purges — confirm cannot no-op", () => {
    const junk = { ...cit(1, 1, "cit-forest"), title: "Forest", name: "Forest" };
    const { rows, drop } = dropCitadelHall([junk], "cit-forest", "all");
    assert.equal(drop.gone, true);
    assert.equal(drop.citadel, "cit-forest");
    assert.equal(rows.length, 0);
    const ghost = dropCitadelAll([], "cit-ghost");
    assert.equal(ghost.drop.gone, true);
    assert.equal(ghost.drop.citadel, "cit-ghost");
    const binds = unbindDroppedHalls(
      [{ id: "art-1", room: { door: "A" as const, still: "/films/cook-forest.jpg", citadel: "cit-forest", hall: 1 } }],
      drop.citadel,
      "all",
    );
    assert.equal(binds[0]?.room, null);
  });

  it("per-room drop still compacts a multi-room citadel after whole-citadel erase exists", () => {
    const { rows, drop } = dropCitadelHall([cit(8, 3)], "cit-1", 4);
    assert.equal(drop.gone, false);
    assert.equal(drop.remaining, 7);
    assert.equal(rows[0]?.rooms, 7);
    const hang = listHangRooms(rows, { id: "cit-1", hall: 3, rooms: 7 });
    assert.equal(hang.length, 7);
    assert.equal(hang.some((r) => r.hall === 8), false);
  });
});
