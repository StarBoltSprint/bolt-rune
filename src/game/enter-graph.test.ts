import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  biomeStill,
  bindHungRoom,
  doorIdOf,
  doorLetterOf,
  gateFromHung,
  hangArtifactOnDoor,
  hydrateRift,
  inferBiome,
  resolveDoorEnter,
  sprintHallDoor,
  stockBiomePlaylist,
  stockTransUrl,
} from "./enter-graph.ts";
import { biomeBotStart, createBotForgeHref, lookForgeStart, parseLookForge, vaultHangRoom, vaultHangStart } from "./path-entry.ts";
import { HALL_LOOP } from "./stock-room.ts";

function art(id: string, biome = "forest") {
  return {
    id,
    name: biome[0]!.toUpperCase() + biome.slice(1),
    still: biomeStill(biome as "forest"),
    playlist: stockBiomePlaylist(biome as "forest"),
    prompt: biome,
    hungAt: 1,
    grade: null,
  };
}

describe("enter graph · hang any artefact on any door", () => {
  it("hall trans in a sprint maps door taps to A/B, not a gesture miss", () => {
    assert.equal(sprintHallDoor(HALL_LOOP, 0.22, 0.42), "A");
    assert.equal(sprintHallDoor("/ui/citadel.mp4?v=aaa", 0.72, 0.4), "B");
    assert.equal(sprintHallDoor("/films/forge-forest.mp4", 0.22, 0.42), null);
    assert.equal(sprintHallDoor("/films/citadel-tour.jpg?v=sharp", 0.7, 0.4), "B");
  });

  it("maps A/B to living-hall m1/m2", () => {
    assert.equal(doorIdOf("A"), "m1");
    assert.equal(doorIdOf("B"), "m2");
    assert.equal(doorLetterOf("m1"), "A");
    assert.equal(doorLetterOf("m2"), "B");
  });

  it("infers biome from still / playlist, not a vault label", () => {
    assert.equal(inferBiome(art("a1", "canyon")), "canyon");
    assert.equal(
      inferBiome({
        name: "Seed",
        still: "/films/citadel-tour.jpg",
        playlist: [],
        prompt: "",
        room: { door: "A", still: "/films/cook-dune.jpg", biome: "dune" },
      }),
      "dune",
    );
  });

  it("hangs any id on door A or B of hall N and stores trans + biome still", () => {
    for (const door of ["A", "B"] as const) {
      for (const hall of [1, 3, 8]) {
        const id = `art-${door}-${hall}`;
        const hung = hangArtifactOnDoor(id, door, { hall, citadel: "cit-1" }, [art(id)]);
        const room = hung.find((a) => a.id === id)?.room;
        assert.ok(room, `${id} missing room`);
        assert.equal(room.door, door);
        assert.equal(room.hall, hall);
        assert.equal(room.citadel, "cit-1");
        assert.equal(room.biome, "forest");
        assert.equal(room.trans, stockTransUrl(door, "forest"));
        assert.match(room.still, /cook-forest/);
        assert.notEqual(room.still, "/films/citadel-tour.jpg");
        const bound = bindHungRoom(art(id), door, { hall, citadel: "cit-1" });
        assert.equal(bound.door, door);
        assert.equal(bound.hall, hall);
      }
    }
  });

  it("hang artifact on hall 2 door A → enter resolves for hall 2, not hall 1", () => {
    const id = "art-h2-a";
    const hung = hangArtifactOnDoor(id, "A", { hall: 2, citadel: "cit-2" }, [art(id, "canyon")]);
    const enter2 = resolveDoorEnter("A", 2, "cit-2", hung);
    assert.equal(enter2.kind, "biome");
    if (enter2.kind !== "biome") return;
    assert.equal(enter2.door, "A");
    assert.equal(enter2.hall, 2);
    assert.equal(enter2.art, id);
    assert.equal(enter2.biome, "canyon");
    assert.equal(enter2.trans, HALL_LOOP);
    assert.ok(enter2.clips[0] === enter2.trans);
    const enter1 = resolveDoorEnter("A", 1, "cit-2", hung);
    assert.deepEqual(enter1, { kind: "hall", door: "A", hall: 1 });
    const otherDoor = resolveDoorEnter("B", 2, "cit-2", hung);
    assert.deepEqual(otherDoor, { kind: "hall", door: "B", hall: 2 });
  });

  it("enter that door resolves to transition then biome play (stock trans, no XAI key)", () => {
    const id = "art-enter-b2";
    const hung = hangArtifactOnDoor(id, "B", { hall: 2, citadel: "cit-2" }, [art(id, "ocean")]);
    const enter = resolveDoorEnter("B", 2, "cit-2", hung);
    assert.equal(enter.kind, "biome");
    if (enter.kind !== "biome") return;
    assert.equal(enter.door, "B");
    assert.equal(enter.hall, 2);
    assert.equal(enter.art, id);
    assert.equal(enter.biome, "ocean");
    assert.equal(enter.trans, HALL_LOOP);
    assert.equal(enter.clips[0], enter.trans);
    assert.ok(enter.clips.length > 1);
    assert.ok(enter.playlist.some((u) => u.includes("ocean") || u.includes("forge-ocean")));
    assert.match(enter.still, /ocean|cook-/);
    assert.notEqual(enter.still, "/films/citadel-tour.jpg");
  });

  it("hydrateRift binds hung artefact onto the living-hall door for that hall", () => {
    const id = "art-hyd-a4";
    const hung = hangArtifactOnDoor(id, "A", { hall: 4, citadel: "cit-4" }, [art(id, "rome")]);
    const rift = hydrateRift("cit-4", 4, {}, hung);
    assert.equal(rift.m1?.art, id);
    assert.equal(rift.m1?.biome, "rome");
    assert.ok(rift.m1?.trans);
    assert.equal(rift.m2, undefined);
    const miss = hydrateRift("cit-4", 5, {}, hung);
    assert.equal(miss.m1, undefined);
    const otherCitadel = hydrateRift("cit-other", 4, {}, hung);
    assert.equal(otherCitadel.m1?.art, id);
  });

  it("gateFromHung is a biome gate, not biome:open with a citadel still", () => {
    const g = gateFromHung(art("art-gate", "egypt"));
    assert.equal(g.biome, "egypt");
    assert.match(g.still, /egypt|cook-/);
    assert.ok((g.playlist || []).length);
    assert.ok(g.trans);
  });

  it("empty door stays a hall walk", () => {
    const enter = resolveDoorEnter("A", 1, "cit-x", [art("loose")]);
    assert.deepEqual(enter, { kind: "hall", door: "A", hall: 1 });
  });

  it("stock biome playlist keeps forge loops", () => {
    assert.ok(stockBiomePlaylist("asteroid").includes("/films/forge-asteroid.mp4"));
    assert.equal(biomeStill("asteroid"), "/films/cook-asteroid.jpg");
    assert.deepEqual(stockBiomePlaylist("forest").slice(0, 1), ["/films/forge-forest.mp4"]);
    const hung = hangArtifactOnDoor("art-ast", "A", { hall: 1 }, [
      {
        id: "art-ast",
        name: "Asteroid",
        still: biomeStill("asteroid"),
        playlist: stockBiomePlaylist("asteroid"),
        prompt: "asteroid",
        hungAt: 1,
        grade: null,
      },
    ]);
    const enter = resolveDoorEnter("A", 1, "", hung);
    assert.equal(enter.kind, "biome");
    if (enter.kind !== "biome") return;
    assert.ok(enter.playlist.includes("/films/forge-asteroid.mp4"));
  });

  it("bot biome / vault hang hooks stay sealed like Grok Bot Forge", () => {
    assert.deepEqual(lookForgeStart("bot"), { dataForge: "bot", sealed: true, pack: "sealed" });
    assert.deepEqual(biomeBotStart(), { dataBiome: "bot", sealed: true });
    assert.deepEqual(vaultHangStart("bot"), { dataHang: "bot", sealed: true });
    assert.deepEqual(vaultHangStart("A"), { dataHang: "A", sealed: false });
    assert.deepEqual(vaultHangStart("B"), { dataHang: "B", sealed: false });
    assert.deepEqual(vaultHangRoom(2), { "data-hang-room": 2 });
    assert.deepEqual(vaultHangRoom("3"), { "data-hang-room": 3 });
    assert.deepEqual(vaultHangRoom(null), { "data-hang-room": 1 });
    assert.equal(parseLookForge(createBotForgeHref("m1")), "bot");
  });
});
