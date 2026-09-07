import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  biomeHoldPlays,
  biomeQteQuiet,
  biomeStill,
  bindHungRoom,
  doorIdOf,
  doorLetterOf,
  firstBiomePlate,
  gateFromHung,
  hallDoorTap,
  hangArtifactOnDoor,
  hungEnterBindHall,
  hungBiomePlaylist,
  hungHallForDoor,
  hydrateRift,
  inferBiome,
  latestHungHall,
  resolveDoorEnter,
  resolveHungEnter,
  shouldHoldBiome,
  sprintHallDoor,
  stayBiomePlay,
  hallPlateAt,
  hangThumbStill,
  holdDoorLoops,
  holdLoopSeam,
  hungDoorTap,
  hungDoorArm,
  hungHallLocksDoors,
  hungEnterNeedsWalk,
  hungFilmHold,
  hungPlayChrome,
  hungStayHall,
  hungStageChrome,
  riftGateMatchesHall,
  stockBiomePlaylist,
  stockTransUrl,
  vaultHangCaption,
  walkHangHallHref,
  walkHungHref,
} from "./enter-graph.ts";
import { biomeBotStart, createBotForgeHref, lookForgeStart, parseLookForge, vaultHangRoom, vaultHangStart } from "./path-entry.ts";
import { playableClipSrc, stockBiomeLoop } from "./play-clip.ts";
import { HALL_LOOP } from "./stock-room.ts";
import {
  PACE_MAX,
  PACE_MIN,
  PACE_MISS,
  b,
  cueFillShown,
  cueFillSide,
  cuePictureSpot,
  paceAfterMiss,
  prepareHoldBeats,
  scaleBeats,
  turnBeatsForRun,
} from "./films.ts";

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
    assert.equal(hallPlateAt([HALL_LOOP, "/films/forge-forest.mp4"], 0), true);
    assert.equal(hallPlateAt([HALL_LOOP, "/films/forge-forest.mp4"], 1), false);
    assert.equal(hallPlateAt(["blob:http://local/1"], 0, "/ui/citadel.mp4?v=aaa"), true);
    assert.equal(hallPlateAt(["/films/forge-forest.mp4"], 0, "blob:http://local/2"), false);
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

  it("hang hall 2 door A → enter stays biome play, not the living-hall still", () => {
    const id = "art-h2-stay";
    const hung = hangArtifactOnDoor(id, "A", { hall: 2, citadel: "cit-2" }, [art(id, "forest")]);
    const enter = stayBiomePlay(resolveDoorEnter("A", 2, "cit-2", hung));
    assert.equal(enter.kind, "biome");
    if (enter.kind !== "biome") return;
    assert.equal(enter.hall, 2);
    assert.equal(enter.door, "A");
    assert.equal(enter.art, id);
    assert.equal(enter.biome, "forest");
    assert.match(enter.still, /cook-forest/);
    assert.notEqual(enter.still, "/films/citadel-tour.jpg");
    assert.ok(!enter.still.includes("citadel-tour"));
    assert.ok(!enter.clips.some((u) => u.includes("citadel-tour") || u.includes("/ui/citadel")), enter.clips.join(","));
    assert.notEqual(enter.clips[0], HALL_LOOP);
    assert.deepEqual(enter.playlist, [stockBiomeLoop()]);
    assert.equal(enter.clips.length, 1);
    assert.ok(
      !enter.clips.some((u) => u.includes("/ui/citadel")),
      `hall citadel leaked into stay play: ${enter.clips.join(",")}`,
    );
    assert.equal(firstBiomePlate(enter.clips), 0);
    assert.equal(shouldHoldBiome(enter.clips, firstBiomePlate(enter.clips)), true);
    assert.equal(shouldHoldBiome(enter.clips, enter.clips.length - 1), true);
    assert.equal(hallDoorTap(0, 0, "A", "A"), "stay");
    assert.equal(hallDoorTap(200, 0, "B", "A"), "stay");
    assert.equal(hallDoorTap(1200, 0, "A", "A"), "stay");
    assert.equal(hallDoorTap(1200, 0, "B", "A"), "stay");
    assert.equal(hallDoorTap(1200, 0, "B"), "enter");
    const missHall = stayBiomePlay(resolveDoorEnter("A", 1, "cit-2", hung));
    assert.deepEqual(missHall, { kind: "hall", door: "A", hall: 1 });
    assert.equal(hungHallForDoor("A", 1, hung), 2);
    assert.equal(hungHallForDoor("A", 2, hung), 2);
    assert.equal(latestHungHall(hung), 2);
    const fromRoom1 = resolveHungEnter("A", 1, "cit-2", hung);
    assert.equal(fromRoom1.kind, "biome");
    if (fromRoom1.kind !== "biome") return;
    assert.equal(fromRoom1.hall, 2);
    assert.equal(fromRoom1.art, id);
    assert.equal(stayBiomePlay(fromRoom1).kind, "biome");
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
    const stale3 = {
      m1: {
        biome: "asteroid" as const,
        name: "Asteroid",
        still: biomeStill("asteroid"),
        loop: "/films/forge-asteroid.mp4",
        art: "art-last-hung-3",
      },
    };
    const replace = hydrateRift("cit-4", 4, stale3, hung);
    assert.equal(replace.m1?.art, id);
    assert.equal(replace.m1?.biome, "rome");
    assert.notEqual(replace.m1?.art, "art-last-hung-3");
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

  it("dropping a Load room clears the hang bind — door is a hall again", () => {
    const id = "art-drop-3";
    const hung = hangArtifactOnDoor(id, "A", { hall: 3, citadel: "cit-1" }, [art(id)]);
    assert.equal(resolveDoorEnter("A", 3, "cit-1", hung).kind, "biome");
    const cleared = hung.map((a) => (a.id === id ? { ...a, room: null } : a));
    const enter = resolveDoorEnter("A", 3, "cit-1", cleared);
    assert.equal(enter.kind, "hall");
    assert.equal(enter.hall, 3);
    assert.equal(latestHungHall(cleared), 0);
    assert.equal(hungHallForDoor("A", 3, cleared), 0);
    const jump = resolveHungEnter("A", 3, "cit-1", cleared);
    assert.equal(jump.kind, "hall");
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
    const enter = stayBiomePlay(resolveDoorEnter("A", 1, "", hung));
    assert.equal(enter.kind, "biome");
    if (enter.kind !== "biome") return;
    assert.deepEqual(enter.playlist, [stockBiomeLoop()]);
    assert.ok(!enter.playlist.some((u) => u.includes("/films/forge-asteroid.mp4")));
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

describe("hung biome play · Room N chrome and quiet QTE", () => {
  it("Hang Room 2 titles Room 2 • Door A Play Sprint, not Room 1", () => {
    assert.deepEqual(hungPlayChrome(2, "A"), { keeper: "Room 2 • Door A", name: "Play Sprint" });
    assert.deepEqual(hungPlayChrome(8, "A"), { keeper: "Room 8 • Door A", name: "Play Sprint" });
    assert.notDeepEqual(hungPlayChrome(8, "A"), hungPlayChrome(2, "A"));
    assert.deepEqual(hungPlayChrome(1, "B"), { keeper: "Room 1 • Door B", name: "Play Sprint" });
    assert.notDeepEqual(hungPlayChrome(2, "A"), hungPlayChrome(1, "A"));
    const here = dirname(fileURLToPath(import.meta.url));
    const cook = readFileSync(join(here, "./cook.ts"), "utf8");
    assert.match(cook, /hungPlayChrome\(n, door \|\| "A"\)/);
    assert.match(cook, /line: name && name !== chrome\.name \? name : chrome\.name/);
    assert.match(cook, /quietBiomeFilm/);
    assert.match(cook, /pad: film\.pad \?\? "arrows"/);
    assert.match(cook, /name: chrome\.name/);
    assert.match(cook, /keeper: chrome\.keeper/);
    assert.doesNotMatch(cook, /score: undefined/);
  });

  it("Hang Room 8 door A enter resolves hall 8, not living Room 2", () => {
    const id = "art-h8-a";
    const hung = hangArtifactOnDoor(id, "A", { hall: 8, citadel: "cit-8" }, [art(id, "forest")]);
    const enter8 = resolveDoorEnter("A", 8, "cit-8", hung);
    assert.equal(enter8.kind, "biome");
    if (enter8.kind !== "biome") return;
    assert.equal(enter8.hall, 8);
    assert.equal(enter8.door, "A");
    assert.equal(enter8.art, id);
    assert.deepEqual(hungPlayChrome(enter8.hall, enter8.door), { keeper: "Room 8 • Door A", name: "Play Sprint" });
    const miss2 = resolveDoorEnter("A", 2, "cit-8", hung);
    assert.deepEqual(miss2, { kind: "hall", door: "A", hall: 2 });
    const fromRoom2 = resolveHungEnter("A", 2, "cit-8", hung);
    assert.equal(fromRoom2.kind, "biome");
    if (fromRoom2.kind !== "biome") return;
    assert.equal(fromRoom2.hall, 8);
    assert.equal(fromRoom2.art, id);
  });

  it("Hang Room 3 pick sticks through hang+enter — not last-hung Room 8", () => {
    const id = "art-h3-a";
    let hung = hangArtifactOnDoor(id, "A", { hall: 8, citadel: "cit-8" }, [art(id, "forest")]);
    hung = hangArtifactOnDoor(id, "A", { hall: 3, citadel: "cit-8" }, hung);
    const enter3 = resolveDoorEnter("A", 3, "cit-8", hung);
    assert.equal(enter3.kind, "biome");
    if (enter3.kind !== "biome") return;
    assert.equal(enter3.hall, 3);
    assert.equal(enter3.door, "A");
    assert.deepEqual(hungPlayChrome(enter3.hall, enter3.door), { keeper: "Room 3 • Door A", name: "Play Sprint" });
    assert.notDeepEqual(hungPlayChrome(enter3.hall, enter3.door), hungPlayChrome(8, "A"));
    const fromRoom8 = resolveDoorEnter("A", 8, "cit-8", hung, {
      m1: { biome: "forest", name: "Forest", still: biomeStill("forest"), loop: "/films/forge-forest.mp4", art: id },
    });
    assert.equal(fromRoom8.kind, "biome");
    if (fromRoom8.kind !== "biome") return;
    assert.equal(fromRoom8.hall, 3);
    const jump = resolveHungEnter("A", 8, "cit-8", hung);
    assert.equal(jump.kind, "biome");
    if (jump.kind !== "biome") return;
    assert.equal(jump.hall, 3);
    assert.equal(latestHungHall(hung), 3);
    assert.equal(hungHallForDoor("A", 8, hung), 3);
  });

  it("stay play on hall 2 drops hall loops and keeps Room 2 chrome", () => {
    const hung = hangArtifactOnDoor("art-title-2", "A", { hall: 2, citadel: "cit-2" }, [art("art-title-2", "forest")]);
    const enter = stayBiomePlay(resolveDoorEnter("A", 2, "cit-2", hung));
    assert.equal(enter.kind, "biome");
    if (enter.kind !== "biome") return;
    const chrome = hungPlayChrome(enter.hall, enter.door);
    assert.equal(enter.hall, 2);
    assert.deepEqual(chrome, { keeper: "Room 2 • Door A", name: "Play Sprint" });
    assert.ok(!enter.clips.some((u) => u.includes("citadel-tour") || u.includes("/ui/citadel")));
    assert.deepEqual(enter.playlist, [stockBiomeLoop()]);
    assert.ok(!enter.still.includes("citadel-tour"));
    const here = dirname(fileURLToPath(import.meta.url));
    const arts = readFileSync(join(here, "./artifacts.ts"), "utf8");
    assert.match(arts, /hungPlayChrome\(hall, room\.door\)/);
    assert.match(arts, /quietBiomeFilm/);
    assert.match(arts, /isLivingHallLoop/);
  });

  it("after last-hung 8, Hang A pick Room 3 / 5 / 1 binds that hall Door A — chrome not biome", () => {
    for (const n of [3, 4, 5, 1] as const) {
      const id = `art-last8-to-${n}`;
      let hung = hangArtifactOnDoor(id, "A", { hall: 8, citadel: "cit-8" }, [art(id, "asteroid")]);
      hung = hangArtifactOnDoor(id, "A", { hall: n, citadel: "cit-8" }, hung);
      const room = hung.find((a) => a.id === id)?.room;
      assert.equal(room?.hall, n, `Room ${n} hall`);
      assert.equal(room?.door, "A", `Room ${n} door A`);
      assert.equal(vaultHangCaption(room), `Room ${n} • Door A Play Sprint`);
      assert.notEqual(vaultHangCaption(room), "Room 1 • Door B Play Sprint");
      assert.notEqual(vaultHangCaption(room), "Room 8 • Door A Play Sprint");
      const enter = resolveDoorEnter("A", n, "cit-8", hung);
      assert.equal(enter.kind, "biome");
      if (enter.kind !== "biome") continue;
      assert.equal(enter.hall, n);
      assert.equal(enter.door, "A");
      const chrome = hungPlayChrome(enter.hall, enter.door);
      assert.equal(chrome.keeper, `Room ${n} • Door A`);
      assert.equal(chrome.name, "Play Sprint");
      assert.match(chrome.keeper, /Door A$/);
      assert.notEqual(chrome.keeper, "Asteroid");
      assert.notEqual(chrome.name, "Asteroid");
      assert.notEqual(enter.name, chrome.name);
      const jump = resolveHungEnter("A", 8, "cit-8", hung);
      assert.equal(jump.kind, "biome");
      if (jump.kind !== "biome") continue;
      assert.equal(jump.hall, n);
      assert.equal(jump.door, "A");
      assert.equal(latestHungHall(hung), n);
    }
    assert.equal(vaultHangCaption({ hall: 7, door: "A" }), "Room 7 • Door A Play Sprint");
    assert.equal(vaultHangCaption({ door: "B" }), "not on a door");
    assert.equal(hungPlayChrome(7, undefined).keeper, "Room 7 • Door A");
    assert.deepEqual(hungStageChrome(3, "A", { name: "Asteroid", keeper: "StarBoltSprint", line: "Asteroid" }), {
      title: "Room 3 • Door A",
      play: "Play Sprint",
      biome: "Asteroid",
    });
    assert.notEqual(hungStageChrome(3, "A", { name: "Asteroid" }).title, "Asteroid");
    assert.deepEqual(hungStageChrome(undefined, undefined, { name: "Play Sprint", keeper: "Room 4 • Door A", line: "Forest" }), {
      title: "Room 4 • Door A",
      play: "Play Sprint",
      biome: "Forest",
    });
    assert.deepEqual(hungFilmHold({ keeper: "Room 4 • Door A" }), { hall: 4, door: "A" });
    assert.deepEqual(hungFilmHold({ keeper: "Room 1 • Door B" }), { hall: 1, door: "B" });
    assert.deepEqual(hungFilmHold({ keeper: "Asteroid" }), {});
    assert.equal(hangThumbStill({ still: "/films/cook-forest.jpg", name: "Luxuriant forest" }), "/films/cook-forest.jpg");
    assert.equal(hangThumbStill({ still: "/films/citadel-tour.jpg", name: "Luxuriant forest" }), biomeStill("forest"));
    assert.equal(hangThumbStill({ still: "", name: "Asteroid", room: { hall: 4, door: "A", still: "" } }), biomeStill("asteroid"));
    assert.match(walkHungHref({ hall: 3, door: "A" }, 8), /hall=3/);
    assert.match(walkHungHref({ hall: 3, door: "A" }, 8), /stills=0/);
    assert.match(walkHungHref({ hall: 4, door: "A", citadel: "cit-8" }), /session=cit-8/);
    assert.match(walkHungHref({ hall: 4, door: "A", citadel: "cit-8" }), /hall=4/);
    assert.equal(walkHungHref({ hall: 4 }), "");
    assert.match(walkHangHallHref("cit-8", 4), /session=cit-8/);
    assert.match(walkHangHallHref("cit-8", 4), /hall=4/);
    assert.ok(!walkHangHallHref("cit-8", 4).includes("first="));
    assert.equal(walkHangHallHref("cit-8", 0), "");
    assert.notEqual(walkHungHref({ hall: 3, door: "A" }), walkHungHref({ hall: 8, door: "A" }));
    const here = dirname(fileURLToPath(import.meta.url));
    const cook = readFileSync(join(here, "./cook.ts"), "utf8");
    assert.match(cook, /hungPlayChrome\(n, door \|\| "A"\)/);
    assert.match(cook, /line: name && name !== chrome\.name \? name : chrome\.name/);
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    assert.match(engine, /holdHall=\{sprint\.hall\}/);
    assert.match(engine, /hangBindHall\(boundArt\?\.room\?\.hall\)/);
    assert.match(engine, /data-hall-wired=/);
    assert.match(engine, /if \(now < hangGuard\.current\) return/);
    const vault = readFileSync(join(here, "../components/vault-hall.tsx"), "utf8");
    const ask = readFileSync(join(here, "../components/hang-ask.tsx"), "utf8");
    assert.match(vault, /vaultHangCaption\(head\.room\)/);
    assert.match(vault, /holdHall=\{hangBindHall\(live\.room\?\.hall\)/);
    assert.match(vault, /hangThumbStill\(vaultHead\)/);
    assert.match(vault, /walkHungHref\(live\.room/);
    assert.match(vault, /window\.location\.assign\(href\)/);
    assert.match(vault, /hangActEnters/);
    assert.match(vault, /data-hang-bound/);
    assert.match(ask, /Hang & enter/);
    assert.match(ask, /data-hang-act="bind"/);
    assert.match(engine, /if \(!hangActEnters\(choice\)\) return/);
    const cine = readFileSync(join(here, "../components/cine-app.tsx"), "utf8");
    assert.match(cine, /hungFilmHold\(custom\)/);
    assert.match(cine, /holdHall=\{hold\.hall\}/);
    assert.match(cine, /walkHungHref\(a\.room\)/);
    const arts = readFileSync(join(here, "./artifacts.ts"), "utf8");
    assert.match(arts, /isCitadelStill\(bound\.still\)/);
    assert.match(arts, /before\?\.still && !isCitadelStill\(before\.still\)/);
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    assert.match(stage, /holdHall/);
    assert.match(stage, /hungStageChrome\(holdHall, holdDoor, film\)/);
    assert.match(stage, /hungBiomePlaylist/);
    assert.match(stage, /playableClipSrc\(src\)/);
    assert.match(stage, /stockBiomeLoop\(\)/);
    assert.match(engine, /hungEnterBindHall\(/);
    assert.match(engine, /liveArt\?\.room\?\.hall/);
  });

  it("Hang Room 2 Door A biome chrome is Room 2, never living hallHold 1", () => {
    const id = "art-h2-chrome";
    const hung = hangArtifactOnDoor(id, "A", { hall: 2, citadel: "cit-2" }, [art(id, "forest")]);
    const fromDefault = resolveHungEnter("A", 1, "cit-2", hung);
    assert.equal(fromDefault.kind, "biome");
    if (fromDefault.kind !== "biome") return;
    assert.equal(fromDefault.hall, 2);
    assert.equal(hungEnterBindHall(2, 1, 1), 2);
    assert.equal(hungEnterBindHall(undefined, 1, 2), 2);
    assert.notEqual(hungEnterBindHall(2, 1, 1), 1);
    const chrome = hungPlayChrome(hungEnterBindHall(fromDefault.hall, 1, 1), fromDefault.door);
    assert.equal(chrome.keeper, "Room 2 • Door A");
    assert.notEqual(chrome.keeper, "Room 1 • Door A");
    assert.equal(hungStageChrome(1, "A", { keeper: "Room 2 • Door A", name: "Play Sprint" }).title, "Room 2 • Door A");
    assert.notEqual(hungStageChrome(1, "A", { keeper: "Room 2 • Door A" }).title, "Room 1 • Door A");
    assert.equal(hungStageChrome(2, "A", { keeper: "Room 1 • Door A" }).title, "Room 2 • Door A");
    assert.equal(hungEnterBindHall(3, 2, 2), 2);
    assert.equal(hungEnterBindHall(8, 2, 2), 2);
    assert.equal(hungEnterBindHall(3, 2, 0), 2);
    assert.notEqual(hungEnterBindHall(3, 2, 2), 3);
    const here = dirname(fileURLToPath(import.meta.url));
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    assert.match(engine, /data-biome-hall=\{sprint\.hall\}/);
    assert.match(engine, /holdHall=\{sprint\.hall\}/);
    assert.match(engine, /hungEnterBindHall\(/);
    const playRift = engine.slice(engine.indexOf("async function playRift"), engine.indexOf("function refreshHung"));
    assert.match(playRift, /liveArt\?\.room\?\.hall/);
    assert.match(playRift, /hangRoomRef\.current/);
    assert.doesNotMatch(playRift, /const hall = stay\.kind === "biome" \? stay\.hall : hangRoomRef\.current \|\| hallHold\.current/);
  });

  it("Hang Room 2 after last-hung Room 3 / 8 biome chrome is Room 2, never Room 3", () => {
    for (const last of [3, 8] as const) {
      const id = `art-last${last}-to-2`;
      let hung = hangArtifactOnDoor(id, "A", { hall: last, citadel: "cit-2" }, [art(id, "asteroid")]);
      hung = hangArtifactOnDoor(id, "A", { hall: 2, citadel: "cit-2" }, hung);
      const room = hung.find((a) => a.id === id)?.room;
      assert.equal(room?.hall, 2, `after last-hung ${last}, bind hall 2`);
      assert.equal(vaultHangCaption(room), "Room 2 • Door A Play Sprint");
      const enter = stayBiomePlay(resolveHungEnter("A", 2, "cit-2", hung));
      assert.equal(enter.kind, "biome");
      if (enter.kind !== "biome") continue;
      assert.equal(enter.hall, 2);
      assert.equal(enter.door, "A");
      assert.deepEqual(hungPlayChrome(enter.hall, enter.door), { keeper: "Room 2 • Door A", name: "Play Sprint" });
      assert.notEqual(hungPlayChrome(enter.hall, enter.door).keeper, `Room ${last} • Door A`);
      const leaked = hungEnterBindHall(last, 2, 2);
      assert.equal(leaked, 2);
      assert.notEqual(leaked, last);
      const stage = hungStageChrome(2, "A", {
        name: "Play Sprint",
        keeper: `Room ${last} • Door A`,
        line: "Asteroid",
      });
      assert.equal(stage.title, "Room 2 • Door A");
      assert.equal(stage.play, "Play Sprint");
      assert.notEqual(stage.title, `Room ${last} • Door A`);
      assert.notEqual(stage.title, "Asteroid");
      const fromHall1 = resolveHungEnter("A", 1, "cit-2", hung);
      assert.equal(fromHall1.kind, "biome");
      if (fromHall1.kind !== "biome") continue;
      assert.equal(fromHall1.hall, 2);
      const staleRift = hydrateRift(
        "cit-2",
        2,
        {
          m1: {
            biome: "asteroid",
            name: "Asteroid",
            still: biomeStill("asteroid"),
            loop: "/films/forge-asteroid.mp4",
            art: `art-stale-${last}`,
          },
        },
        hung,
      );
      assert.equal(staleRift.m1?.art, id);
      const viaStale = stayBiomePlay(resolveHungEnter("A", 2, "cit-2", hung, staleRift));
      assert.equal(viaStale.kind, "biome");
      if (viaStale.kind !== "biome") continue;
      assert.equal(viaStale.hall, 2);
      assert.deepEqual(hungPlayChrome(viaStale.hall, viaStale.door), { keeper: "Room 2 • Door A", name: "Play Sprint" });
    }
    assert.equal(hungStageChrome(2, "A", { keeper: "Room 3 • Door A", name: "Play Sprint", line: "Asteroid" }).title, "Room 2 • Door A");
    assert.notEqual(hungStageChrome(2, "A", { keeper: "Room 3 • Door A", line: "Asteroid" }).title, "Room 3 • Door A");
    const here = dirname(fileURLToPath(import.meta.url));
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    assert.match(engine, /hungEnterBindHall\(\s*liveArt\?\.room\?\.hall,\s*hangRoomRef\.current/);
    const stageSrc = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    assert.match(stageSrc, /hungStageChrome\(holdHall, holdDoor, film\)/);
  });

  it("biome enter plays hung artefact MP4s continuously — no still thrash", () => {
    const cooked = "https://imgen.x.ai/vid/bolt-stride.mp4?sig=1";
    const other = "https://imgen.x.ai/vid/bolt-stride-b.mp4?sig=2";
    const id = "art-h2-mp4";
    const hung = hangArtifactOnDoor(
      id,
      "A",
      { hall: 2, citadel: "cit-2" },
      [
        {
          ...art(id, "forest"),
          playlist: [cooked, other, "/films/cook-forest.jpg", "/films/forge-forest.mp4", "/films/forge-forest-moss.mp4"],
        },
      ],
    );
    const enter = stayBiomePlay(resolveHungEnter("A", 1, "cit-2", hung));
    assert.equal(enter.kind, "biome");
    if (enter.kind !== "biome") return;
    assert.equal(enter.hall, 2);
    const proxied = [playableClipSrc(cooked), playableClipSrc(other)];
    assert.deepEqual(enter.playlist, proxied);
    assert.deepEqual(hungBiomePlaylist([cooked, other, "/films/cook-forest.jpg", "/films/forge-forest.mp4"], "forest"), proxied);
    assert.ok(enter.playlist.every((u) => u.startsWith("/api/clip?u=")));
    assert.ok(!enter.clips.some((u) => /\.(jpe?g|png|webp)(\?|$)/i.test(u)));
    assert.ok(!enter.clips.some((u) => u.includes("/films/forge-forest")));
    assert.ok(!enter.clips.some((u) => u.includes("citadel-tour")));
    assert.equal(hungBiomePlaylist(["/films/cook-forest.jpg", "/films/forge-forest.mp4"], "forest")[0], stockBiomeLoop());
    assert.equal(hungBiomePlaylist(["/films/forge-forest.mp4", "/films/forge-forest.mp4"], "forest").length, 1);
    const here = dirname(fileURLToPath(import.meta.url));
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    assert.match(stage, /hungBiomePlaylist\(raw\)/);
    assert.match(stage, /a\.loop = Boolean\(holdDoor\)/);
    assert.match(stage, /if \(film\.score && phaseRef\.current === "run"\) syncScore\(t\)/);
    assert.match(stage, /if \(!hold && g\.rate > actual/);
    assert.match(stage, /if \(film\.score\) startScore/);
    assert.match(stage, /if \(holdDoorRef\.current\) \{\s*\n\s*const fallback = stockBiomeLoop\(\)/);
    assert.doesNotMatch(stage, /if \(holdDoorRef\.current\) \{\s*\n\s*setUsingStill\(true\)/);
    const cook = readFileSync(join(here, "./cook.ts"), "utf8");
    assert.match(cook, /hungBiomePlaylist\(urls\)/);
    assert.doesNotMatch(cook, /score: undefined/);
  });

  it("hung Door A native-loops the MP4 — plate end never Film-fractures stay", () => {
    assert.equal(holdDoorLoops("A"), true);
    assert.equal(holdDoorLoops("B"), true);
    assert.equal(holdDoorLoops(null), false);
    assert.equal(holdDoorLoops(undefined), false);
    assert.equal(holdLoopSeam(true, 6, 6), true);
    assert.equal(holdLoopSeam(false, 5.95, 6), true);
    assert.equal(holdLoopSeam(false, 3, 6), false);
    assert.equal(holdLoopSeam(true, 0, 6), false);
    assert.equal(holdLoopSeam(false, 0.04, 6), false);
    assert.equal(holdLoopSeam(false, 0, 0), false);
    const here = dirname(fileURLToPath(import.meta.url));
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    assert.match(stage, /loop=\{Boolean\(holdDoor\)\}/);
    assert.match(stage, /function keepHoldLoop/);
    assert.match(stage, /holdDoorLoops\(holdDoorRef\.current\)/);
    assert.match(stage, /holdLoopSeam\(/);
    assert.match(stage, /a\.loop = Boolean\(holdDoor\)/);
    assert.match(stage, /if \(holdDoorLoops\(holdDoorRef\.current\)\) \{\s*\n\s*keepHoldLoop\(videoRef\.current\);\s*\n\s*return/);
    assert.match(stage, /if \(holdDoorLoops\(holdDoorRef\.current\)\) \{\s*\n\s*keepHoldLoop\(aRef\.current\)/);
    assert.match(stage, /if \(holdDoorLoops\(holdDoorRef\.current\)\) \{\s*\n\s*keepHoldLoop\(bRef\.current\)/);
    assert.match(stage, /if \(holdDoorLoops\(holdDoorRef\.current\)\) \{\s*\n\s*restartHoldChart\(\)/);
    assert.match(stage, /if \(hold && t \+ 0\.45 < loopT\.current\) restartHoldChart\(\)/);
    assert.match(stage, /v\.currentTime = 0/);
    assert.match(stage, /prepareHoldBeats\(plate, seed\)/);
    assert.match(stage, /g\.streakMiss = 0/);
    assert.match(stage, /if \(holdDoorLoops\(holdDoorRef\.current\)\) \{\s*\n\s*restartHoldChart\(\)/);
    assert.doesNotMatch(stage, /if \(biomeQteQuiet\(holdDoorRef\.current\)\) return \[\]/);
  });

  it("hung stay chart is native to the ~6s plate — scaled 15s cook chart must not pack four CueFill misses", () => {
    const hold = prepareHoldBeats(6, 1);
    const cue = hold.filter((beat) => cueFillShown(beat));
    assert.equal(cue.length, 2);
    assert.ok(cue.every((beat) => beat.at < 5.5));
    const cooked = {
      id: "sprint" as const,
      name: "Play Sprint",
      keeper: "Room 2 • Door A",
      line: "Forest",
      verb: "Sprint",
      still: "/films/cook-forest.jpg",
      portraitStill: "/films/cook-forest.jpg",
      local: "/ui/forge.mp4",
      portrait: "/ui/forge.mp4",
      origin: "/ui/forge.mp4",
      chart: 15,
      pad: "arrows" as const,
      lives: 3,
      beats: turnBeatsForRun([15]),
      playlist: ["/ui/forge.mp4"],
    };
    const packed = scaleBeats(cooked, 6).filter((beat) => cueFillShown(beat));
    assert.ok(packed.length >= 4);
    assert.ok(cue.length < packed.length);
    const here = dirname(fileURLToPath(import.meta.url));
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    const chartFor = stage.slice(stage.indexOf("function chartFor"), stage.indexOf("function restartHoldChart"));
    assert.match(chartFor, /prepareHoldBeats\(plate, seed\)/);
    assert.doesNotMatch(chartFor, /prepareBeats\(one, plate/);
    const rewind = stage.slice(stage.indexOf("function rewind"), stage.indexOf("function onKey"));
    assert.match(rewind, /holdDoorLoops\(holdDoorRef\.current\)/);
    assert.match(rewind, /restartHoldChart\(\)/);
    assert.match(rewind, /v\.currentTime = 0/);
    assert.match(stage, /g\.streakMiss = 0/);
  });

  it("enter chrome is hung Room N — stale Room 1 Asteroid rift cannot win", () => {
    const id = "art-h2-forest";
    const hung = hangArtifactOnDoor(id, "A", { hall: 2, citadel: "cit-2" }, [art(id, "forest")]);
    const leak = {
      m1: {
        biome: "asteroid" as const,
        name: "Asteroid",
        still: biomeStill("asteroid"),
        loop: "/films/forge-asteroid.mp4",
        art: "art-stale-asteroid",
      },
    };
    assert.equal(riftGateMatchesHall(leak.m1, 2, hung), false);
    assert.equal(riftGateMatchesHall(leak.m1, 1, hung), false);
    const fromHall1 = stayBiomePlay(resolveHungEnter("A", 1, "cit-2", hung, leak));
    assert.equal(fromHall1.kind, "biome");
    if (fromHall1.kind !== "biome") return;
    assert.equal(fromHall1.hall, 2);
    assert.notEqual(fromHall1.name, "Asteroid");
    const chrome = hungPlayChrome(fromHall1.hall, fromHall1.door);
    assert.deepEqual(chrome, { keeper: "Room 2 • Door A", name: "Play Sprint" });
    assert.notEqual(chrome.keeper, "Room 1 • Door A");
    assert.equal(hungStayHall({ artHall: 1, enterHall: 1, hangRoom: 1, liveHall: 2 }), 2);
    assert.equal(hungStayHall({ artHall: 1, enterHall: 1, hangRoom: 1, doorHall: 2 }), 2);
    assert.notEqual(hungStayHall({ liveHall: 2, hangRoom: 1 }), 1);
    assert.equal(hungStageChrome(1, "A", { keeper: "Room 2 • Door A", name: "Play Sprint", line: "Asteroid" }).title, "Room 2 • Door A");
    assert.notEqual(hungStageChrome(2, "A", { name: "Asteroid Sprint", keeper: "StarBoltSprint", line: "asteroid" }).title, "Asteroid Sprint");
    const cleaned = hydrateRift("cit-2", 2, leak, hung);
    assert.equal(cleaned.m1?.art, id);
    assert.notEqual(cleaned.m1?.name, "Asteroid");
    const here = dirname(fileURLToPath(import.meta.url));
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const goEnterFn = engine.slice(engine.indexOf("async function goEnter"), engine.indexOf("function enterNext"));
    assert.match(goEnterFn, /hungStayHall/);
    assert.match(goEnterFn, /Never snap a living Room 2\+ hang down to Room 1/);
    assert.match(goEnterFn, /bindHall >= 2 && bindHall !== hallHold\.current/);
    const playRift = engine.slice(engine.indexOf("async function playRift"), engine.indexOf("function refreshHung"));
    assert.match(playRift, /hungStayHall/);
    assert.match(playRift, /liveHall: hallHold\.current/);
    assert.match(engine, /hangRoomRef\.current = hallHold\.current/);
    assert.match(engine, /hangRoomRef\.current = slice\.n/);
    const cine = readFileSync(join(here, "../components/cine-app.tsx"), "utf8");
    assert.match(cine, /hungStay \? "sprint" : "asteroid"/);
    assert.match(cine, /custom\?\.playlist\?\.length \|\| hungStay \? custom/);
    const arts = readFileSync(join(here, "./artifacts.ts"), "utf8");
    assert.match(arts, /hall: a\.room\.hall/);
  });

  it("hung Door A/B first tap walks in the hall — second tap same door enters", () => {
    assert.equal(hungDoorTap("spawn", "A"), "walk");
    assert.equal(hungDoorTap("spawn", "B"), "walk");
    assert.equal(hungDoorTap("m2", "A"), "walk");
    assert.equal(hungDoorTap("m1", "B"), "walk");
    assert.equal(hungDoorTap("m1", "A"), "enter");
    assert.equal(hungDoorTap("m2", "B"), "enter");
    assert.equal(hungEnterNeedsWalk("spawn", "A"), true);
    assert.equal(hungEnterNeedsWalk("m1", "A"), false);
    assert.equal(hungDoorTap(null, "A"), "walk");
    assert.equal(hungDoorTap("spawn", "x"), null);
    assert.equal(hungDoorArm("spawn", "A", true), "walk");
    assert.equal(hungDoorArm("m1", "A", true), "enter");
    assert.equal(hungDoorArm("m2", "B", true), "enter");
    assert.equal(hungDoorArm("m2", "B", false), "stay");
    assert.equal(hungDoorArm("m1", "B", true), "walk");
    assert.equal(hungHallLocksDoors({ hangRoom: 2 }), true);
    assert.equal(hungHallLocksDoors({ riftA: { art: "x" } }), true);
    assert.equal(hungHallLocksDoors({}), false);
    const here = dirname(fileURLToPath(import.meta.url));
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const goTo = engine.slice(engine.indexOf("function goTo"), engine.indexOf("function drainQueue"));
    assert.match(goTo, /hungDoorTap\(hereRef\.current, id\) === "enter"/);
    assert.match(goTo, /hungDoorReady\(id\)/);
    assert.doesNotMatch(goTo, /if \(now < hangGuard\.current\) return;\s*\n\s*void goEnter\(id\);/);
    assert.doesNotMatch(goTo, /destHall\(id\) > 0 \|\| !!riftRef\.current\[id\]/);
    assert.match(goTo, /void playWalk\(id\)/);
    assert.match(goTo, /walkingTo\.current === id/);
    const playWalk = engine.slice(engine.indexOf("async function playWalk"), engine.indexOf("async function saveFilms"));
    assert.match(playWalk, /if \(hungDoorReady\(id\)\) \{\s*\n\s*\/\* Breath \/ hold at hung door/);
    assert.match(playWalk, /stockDoorWalk\(at, id\)/);
    assert.match(playWalk, /persist\(\{ phase: "play", here: id/);
    assert.doesNotMatch(playWalk, /if \(hungDoorReady\(id\)\) \{\s*\n\s*void goEnter/);
    assert.doesNotMatch(playWalk, /if \(hungDoorReady\(id\)\) \{[^}]*setEnterAsk/);
    assert.doesNotMatch(playWalk, /destHall\(id\) > 0 \|\| riftRef\.current\[id\]/);
    assert.match(engine, /Leftover Hang A \/ Door A after confirm must stay on hall N/);
    const goEnterFn = engine.slice(engine.indexOf("async function goEnter"), engine.indexOf("function enterNext"));
    assert.match(goEnterFn, /Hung hall: never destHall \/ enter→spawn/);
    assert.match(goEnterFn, /if \(hangDoorHall\(\)\) return/);
    assert.match(engine, /keepDoor \? hereRef\.current : slice\.here/);
    assert.doesNotMatch(engine, /hereRef\.current = here;/);
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    assert.match(stage, /if \(holdDoorRef\.current\) return true/);
    assert.match(stage, /holdDoor \? hungBiomePlaylist\(raw\)/);
  });

  it("hall leftover stays and never MISS — hung biome sprint is still a QTE game", () => {
    assert.equal(biomeQteQuiet("A"), false);
    assert.equal(biomeQteQuiet("B"), false);
    assert.equal(biomeQteQuiet("A", true), true);
    assert.equal(biomeQteQuiet("B", true), true);
    assert.equal(biomeQteQuiet(null, true), false);
    assert.equal(biomeQteQuiet(undefined), false);
    assert.equal(biomeHoldPlays("A"), true);
    assert.equal(biomeHoldPlays("A", true), false);
    assert.equal(biomeHoldPlays(null), false);
    assert.equal(hallDoorTap(40000, 0, "A", "A"), "stay");
    assert.equal(hallDoorTap(40000, 0, "B", "A"), "stay");
    const here = dirname(fileURLToPath(import.meta.url));
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    assert.match(stage, /function chartFor\(duration: number, seed: number\)/);
    assert.match(stage, /return prepareBeats\(film, duration, seed, original\)/);
    assert.doesNotMatch(stage, /if \(biomeQteQuiet\(holdDoorRef\.current\)\) return \[\]/);
    assert.match(stage, /if \(biomeQteQuiet\(holdDoorRef\.current, hallQuiet\) \|\| hallQuiet\)/);
    assert.match(stage, /Hall leftover \/ door taps on a hung enter never MISS and never tank pace/);
    assert.match(stage, /if \(!hallPlateNow\(\)\) return false/);
    assert.match(stage, /if \(holdDoorRef\.current\) return true/);
    assert.doesNotMatch(stage, /g\.beats = prepareBeats\(film, a\.duration/);
  });

  it("hung biome play keeps beats, pad arrows, score/speed HUD — not empty quiet film", () => {
    const cooked = "https://imgen.x.ai/vid/bolt-stride.mp4?sig=1";
    const id = "art-h2-play";
    const hung = hangArtifactOnDoor(
      id,
      "A",
      { hall: 2, citadel: "cit-2" },
      [{ ...art(id, "forest"), playlist: [cooked] }],
    );
    const enter = stayBiomePlay(resolveHungEnter("A", 1, "cit-2", hung));
    assert.equal(enter.kind, "biome");
    if (enter.kind !== "biome") return;
    assert.equal(enter.hall, 2);
    assert.deepEqual(hungPlayChrome(enter.hall, enter.door), { keeper: "Room 2 • Door A", name: "Play Sprint" });
    assert.ok(enter.playlist.every((u) => u.startsWith("/api/clip?u=") || u === stockBiomeLoop()));
    assert.ok(!enter.clips.some((u) => /\.(jpe?g|png|webp)(\?|$)/i.test(u)));

    const here = dirname(fileURLToPath(import.meta.url));
    const films = readFileSync(join(here, "./films.ts"), "utf8");
    assert.match(films, /function turnBeatsForRun/);
    assert.match(films, /m\.dir, lane, m\.dir === "left" \? "←" : "→"/);
    assert.match(films, /if \(film\.beats\?\.length\)/);
    assert.match(films, /turnBeatsForRun\(Array\.from\(\{ length: n \}/);
    const cook = readFileSync(join(here, "./cook.ts"), "utf8");
    assert.match(cook, /beats = film\.beats\?\.length/);
    assert.match(cook, /pad: film\.pad \?\? "arrows"/);
    assert.match(cook, /turnBeatsForRun/);
    assert.doesNotMatch(cook, /beats: \[\],\s*\n\s*pad: undefined/);
    assert.doesNotMatch(cook, /score: undefined/);
    const arts = readFileSync(join(here, "./artifacts.ts"), "utf8");
    assert.match(arts, /quietBiomeFilm\(/);
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    assert.match(stage, /data-qte=\{holdDoor \? "play"/);
    assert.match(stage, /holdDoor && <CueFill/);
    assert.match(stage, /data-cue-fill=\{side\}/);
    assert.match(stage, /data-cue-axis="y"/);
    assert.match(stage, /width: 6/);
    assert.match(stage, /height: 34/);
    assert.match(stage, /height: `\$\{fill \* 100\}%`/);
    assert.match(stage, /const side = cueFillSide\(beat\)/);
    assert.match(stage, /if \(!side\) return null/);
    assert.match(stage, /cuePictureSpot\(beat\)/);
    assert.doesNotMatch(stage, /width: 52/);
    assert.doesNotMatch(stage, /height: 10/);
    assert.doesNotMatch(stage, /holdDoor \? <CueFill/);
    assert.match(stage, /<Resonance value=\{hud\.resonance\} score=\{hud\.score\} pace=\{hud\.pace\} \/>/);
    assert.match(stage, /film\.pad === "arrows" && !holdDoor && <CutWash/);
    assert.match(stage, /film\.pad !== "arrows" && !holdDoor/);
    assert.doesNotMatch(stage, /[^!]holdDoor && <CutWash/);
    assert.doesNotMatch(stage, /film\.pad !== "arrows" \|\| holdDoor/);
    assert.match(films, /function jumpMarks/);
    assert.match(films, /function cuePictureSpot/);
    assert.match(stage, /hud\.score/);
    assert.match(stage, /hud\.pace/);
  });

  it("SmiR cues are narrow vertical L/R ticks at the turn lane — never on Bolt, never Resonance HUD", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const films = readFileSync(join(here, "./films.ts"), "utf8");
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    assert.match(films, /export function cueSide/);
    assert.match(films, /export function cueFillSide/);
    assert.match(films, /export function cuePictureSpot/);
    assert.match(films, /x: Math.min\(spot.x, 0.26\)/);
    assert.match(films, /x: Math.max\(spot.x, 0.74\)/);
    assert.match(films, /spot\.y > 0.7 \? 0.58 : spot.y/);
    assert.match(films, /const x = m.dir === "left" \? 0.2 : 0.8/);
    assert.match(films, /spot: \{ x: 0.5, y: 0.58 \}/);
    assert.doesNotMatch(films, /spot: \{ x: 0.5, y: 0.78 \}/);
    const resonance = stage.slice(stage.indexOf("function Resonance"), stage.indexOf("function CueFill"));
    assert.doesNotMatch(resonance, /CueFill/);
    assert.match(stage, /data-cue-axis="y"/);
    assert.match(stage, /left: `\$\{spot\.x \* 100\}%`/);
    assert.match(stage, /top: `\$\{spot\.y \* 100\}%`/);
    assert.match(stage, /const side = cueFillSide\(beat\)/);
    assert.match(stage, /if \(!side\) return null/);
    assert.match(stage, /holdDoorRef\.current && !cueFillShown\(beat\)/);
    assert.doesNotMatch(stage, /mb-2 h-\[10px\]/);

    const left = b("t1", 2.5, "left", "l", "←", { spot: { x: 0.2, y: 0.56 } });
    const right = b("t2", 5.8, "right", "r", "→", { spot: { x: 0.8, y: 0.56 } });
    const jump = b("j1", 7.6, "tap", "c", "↑", { spot: { x: 0.5, y: 0.58 } });
    const vault = b("s2", 4.5, "tap", "c", "VAULT", { spot: { x: 0.5, y: 0.58 } });
    assert.equal(cueFillSide(left), "left");
    assert.equal(cueFillSide(right), "right");
    assert.equal(cueFillSide(jump), null);
    assert.equal(cueFillSide(vault), null);
    assert.equal(cueFillShown(jump), false);
    assert.equal(cueFillShown(left), true);
    const leftSpot = cuePictureSpot(left);
    const rightSpot = cuePictureSpot(right);
    assert.ok(leftSpot.x <= 0.26);
    assert.ok(rightSpot.x >= 0.74);
    assert.ok(leftSpot.x < 0.32, "left tick stays off the white GSD");
    assert.ok(rightSpot.x > 0.68, "right tick stays off the white GSD");

    const chart = turnBeatsForRun([15]);
    assert.ok(chart.some((beat) => beat.kind === "left"));
    assert.ok(chart.some((beat) => beat.kind === "right"));
    assert.ok(chart.some((beat) => beat.label === "↑"), "jump beats stay in the chart for later");
    assert.ok(chart.filter((beat) => cueFillShown(beat)).every((beat) => beat.kind === "left" || beat.kind === "right"));
    assert.ok(!chart.filter((beat) => cueFillShown(beat)).some((beat) => /jump|vault|↑/i.test(beat.label)));
  });

  it("MISS drops pace by 0.1 and clamps to the 0.4–0.5 floor — leftover never tanks pace", () => {
    assert.equal(PACE_MISS, 0.1);
    assert.ok(PACE_MIN >= 0.4 && PACE_MIN <= 0.5);
    assert.equal(PACE_MAX, 8);
    assert.equal(paceAfterMiss(1), 0.9);
    assert.equal(paceAfterMiss(0.55), PACE_MIN);
    assert.equal(paceAfterMiss(PACE_MIN), PACE_MIN);
    assert.equal(biomeQteQuiet("A", true), true);
    assert.equal(hallDoorTap(40000, 0, "A", "A"), "stay");
    const here = dirname(fileURLToPath(import.meta.url));
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    const films = readFileSync(join(here, "./films.ts"), "utf8");
    assert.match(films, /export const PACE_MISS = 0\.1/);
    assert.match(films, /export const PACE_MIN = 0\.5/);
    assert.match(stage, /g\.pace = paceAfterMiss\(g\.pace\)/);
    assert.doesNotMatch(stage, /g\.pace = Math\.max\(PACE_MIN, g\.pace - 0\.32\)/);
    assert.match(stage, /Hall leftover \/ door taps on a hung enter never MISS and never tank pace/);
  });
});
