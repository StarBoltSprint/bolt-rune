import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FILM_BY_ID } from "./films.ts";
import {
  ACT_IDS,
  assembleCookPlate,
  assemblePrompt,
  BIOME_CATALOG,
  fewShotRefs,
  lintPrompt,
  LOCK,
  PLAYER_VOICE_DICT,
  RAILS,
  RAILS_AVOID,
  RAILS_PHRASES,
  readPlayerVoice,
  slotsFromEngine,
  stockOnLintFail,
  stubFloor,
  stubFork,
  stubTrail,
  type PromptSlots,
} from "./pcg-prompt.ts";

const here = dirname(fileURLToPath(import.meta.url));

function goodSlots(over: Partial<PromptSlots> = {}): PromptSlots {
  return {
    biome: "forest",
    act: "walk-A",
    fork: "none",
    trail: "thin",
    floor: "empty",
    leftover: "none",
    fromTo: null,
    still: "/films/cook-forest.jpg",
    destStill: null,
    seed: "sforestwalka000",
    ...over,
  };
}

describe("PCG prompt grammar — assemble + lint", () => {
  it("passes a good assembled prompt", () => {
    const slots = goodSlots();
    const cooked = assemblePrompt(slots);
    const lint = lintPrompt(cooked.prompt, slots);
    assert.equal(lint.ok, true);
    assert.ok(cooked.prompt.startsWith(RAILS));
    assert.match(cooked.prompt, /Biome: Forest/);
    assert.match(cooked.prompt, /World: a living crystal-ice forest/);
    assert.match(cooked.prompt, /Act: Bolt sprints to the left door; hall frozen; only the dog moves\./);
    assert.match(cooked.prompt, /Path: Path stays one gold-cyan line ahead of the paws\./);
    assert.match(cooked.prompt, /Momentum: Thin cyan lightning trail\. Floor empty ahead\./);
    assert.match(cooked.prompt, /Continuity: match last frame exactly for body, lens, hall ribs\./);
    assert.match(cooked.prompt, /Seed: sforestwalka000/);
    for (const phrase of RAILS_PHRASES) assert.ok(cooked.prompt.includes(phrase), phrase);
    assert.match(cooked.avoid, /cape/);
    assert.doesNotMatch(cooked.prompt, /white wolf StarBoltSprint/);
  });

  it("fails morph / species-change extra sentences", () => {
    const cooked = assemblePrompt(goodSlots());
    const morph = `${cooked.prompt} Then he morphs into a new dog with another character.`;
    const lint = lintPrompt(morph, goodSlots());
    assert.equal(lint.ok, false);
    if (!lint.ok) assert.equal(lint.issue, "morph");
  });

  it("fails banned flavor stems", () => {
    const slots = goodSlots({ flavor: "show his face and a cape" });
    const cooked = assemblePrompt(slots);
    const lint = lintPrompt(cooked.prompt, slots);
    assert.equal(lint.ok, false);
    if (!lint.ok) assert.equal(lint.issue, "banned-flavor");
    assert.deepEqual(readPlayerVoice("show his face and orbit the camera"), {});
  });

  it("fails missing rails", () => {
    const cooked = assemblePrompt(goodSlots());
    const stripped = cooked.prompt.replace("LOCKED-OFF CAMERA", "CAMERA");
    const lint = lintPrompt(stripped, goodSlots());
    assert.equal(lint.ok, false);
    if (!lint.ok) assert.ok(lint.issue === "missing-rails" || lint.issue === "missing-lock");
    assert.equal(lintPrompt("Biome: Forest. Photoreal 9:16. No text.", goodSlots()).ok, false);
  });

  it("slot values outside the enums are a lint bug", () => {
    const bad = goodSlots({ fork: "Y" as PromptSlots["fork"] });
    const lint = lintPrompt(assemblePrompt(goodSlots()).prompt, bad);
    assert.equal(lint.ok, false);
    if (!lint.ok) {
      assert.equal(lint.issue, "slot-enum");
      assert.equal(lint.detail, "fork");
    }
  });
});

describe("PCG prompt grammar — player voice + engine slots", () => {
  it("Rome → ember, Mars → asteroid, space → asteroid; unknown is one clean flavor", () => {
    assert.equal(PLAYER_VOICE_DICT.rome, "ember");
    assert.equal(PLAYER_VOICE_DICT.mars, "asteroid");
    assert.equal(PLAYER_VOICE_DICT.space, "asteroid");
    assert.equal(readPlayerVoice("Rome").biome, "ember");
    assert.equal(readPlayerVoice("Mars").biome, "asteroid");
    assert.equal(readPlayerVoice("space").biome, "asteroid");
    assert.equal(readPlayerVoice("soft violet mist").flavor, "soft violet mist");
    assert.equal(readPlayerVoice("moss").biome, "moss");
    const slots = slotsFromEngine({ biome: "forest", playerVoice: "Rome", act: "walk-A", seed: "sember01abcdef" });
    assert.equal(slots.biome, "ember");
    assert.equal(slots.flavor, undefined);
    assert.equal(BIOME_CATALOG.ember.worldLine.includes("ember"), true);
  });

  it("fills act / fork / trail / floor from tap and density stubs — never LLM", () => {
    assert.equal(slotsFromEngine({ biome: "forest", tap: "L", seed: "s1" }).act, "walk-A");
    assert.equal(slotsFromEngine({ biome: "forest", tap: "R", seed: "s1" }).act, "walk-B");
    assert.equal(slotsFromEngine({ biome: "forest", tap: "enter", from: "m1", to: "spawn", leftover: true, seed: "s1" }).act, "enter");
    assert.equal(stubFork(0), "none");
    assert.equal(stubFork(0.4), "L");
    assert.equal(stubFork(0.9), "L+R");
    assert.equal(stubTrail(0.2, 0), "none");
    assert.equal(stubTrail(0.4, 0), "thin");
    assert.equal(stubTrail(0.5, 0.3), "full");
    assert.equal(stubFloor(0.2), "empty");
    assert.equal(stubFloor(0.6), "crystals-ahead");
    const enter = slotsFromEngine({
      roomBiome: "dusk",
      tap: "enter",
      from: "m1",
      to: "spawn",
      leftover: true,
      still: "/films/last.jpg",
      destStill: "/films/cook-dusk.jpg",
      seed: "senter01",
    });
    assert.equal(enter.biome, "dusk");
    assert.deepEqual(enter.fromTo, { from: "m1", to: "spawn" });
    assert.equal(enter.leftover, "from-token");
    assert.deepEqual(fewShotRefs(enter), ["/films/last.jpg", "/films/cook-dusk.jpg"]);
    assert.deepEqual(fewShotRefs(goodSlots()), ["/films/cook-forest.jpg"]);
    assert.ok(ACT_IDS.includes(enter.act));
  });

  it("playedPlates feed picture-time — Date.now does not", () => {
    const realNow = Date.now;
    try {
      const quiet = slotsFromEngine({ biome: "forest", seed: "s1", momentum: 0.5, playedPlates: [4000] });
      Date.now = () => 9_999_999_999_000;
      const stillQuiet = slotsFromEngine({ biome: "forest", seed: "s1", momentum: 0.5, playedPlates: [4000] });
      const late = slotsFromEngine({
        biome: "forest",
        seed: "s1",
        momentum: 0.5,
        i: 4,
        taps: ["hit", "hit", "hit", "hit"],
        playedPlates: [12000, 12000, 12000, 12000, 12000],
      });
      assert.deepEqual(quiet, stillQuiet);
      assert.ok(quiet.wfcRole);
      assert.ok(late.wfcRole);
    } finally {
      Date.now = realNow;
    }
  });
});

describe("PCG prompt grammar — cook path + Asteroid HOLD", () => {
  it("plate / still / continue assemble through the grammar and pass the linter", () => {
    const plate = assembleCookPlate({ biome: "forest", cookAct: 0, seed: "splate01abcdef" });
    const still = assembleCookPlate({ biome: "open", playerVoice: "Rome", tap: "walk-A" });
    const cont = assembleCookPlate({ biome: "open", playerVoice: "forest", tap: "walk-A", i: 2 });
    assert.equal(plate.lint.ok, true);
    assert.equal(still.lint.ok, true);
    assert.equal(cont.lint.ok, true);
    assert.ok(plate.prompt.startsWith(LOCK));
    assert.match(still.prompt, /Biome: Ember/);
    assert.match(cont.prompt, /Biome: Forest/);
    assert.equal(stockOnLintFail("forest").clip, "/ui/forge.mp4");
  });

  it("cook.ts / lib/cook.ts wire assemble + linter before Imagine; seats untouched", () => {
    const cook = readFileSync(join(here, "./cook.ts"), "utf8");
    const lib = readFileSync(join(here, "../lib/cook.ts"), "utf8");
    const studio = readFileSync(join(here, "../components/cook-studio.tsx"), "utf8");
    const seats = readFileSync(join(here, "../components/door-chat-line.tsx"), "utf8");
    assert.match(cook, /from "\.\/pcg-prompt/);
    assert.match(cook, /assembleCookPlate|assemblePrompt/);
    assert.match(lib, /assembleCookPlate/);
    assert.match(lib, /lintPrompt|cooked\.lint/);
    assert.match(lib, /lint-stock/);
    assert.match(studio, /lint-stock/);
    assert.doesNotMatch(seats, /assemblePrompt|pcg-prompt|lint-stock/);
    const rail = readFileSync(join(here, "./pcg-rail.ts"), "utf8");
    const grammar = readFileSync(join(here, "./pcg-grammar.ts"), "utf8");
    assert.match(rail, /Asteroid HOLD/);
    assert.match(grammar, /PCG rail 3/);
    assert.match(grammar, /growPins/);
    const asteroid = FILM_BY_ID.asteroid.beats.map((beat) => beat.at);
    assert.deepEqual(asteroid, [7.0, 12.3, 16.3, 21.6, 25.6, 30.9, 34.9, 40.2, 44.2, 49.5, 53.5]);
    assert.match(RAILS_AVOID, /chrome/);
    assert.doesNotMatch(seats, /pcg-grammar|growPins/);
  });
});
