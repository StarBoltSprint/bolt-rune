import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HALL_LOOP, HALL_STILL, doorAtPoint, isHallFilm, stockDoorHits, stockRoomBank, stockStand } from "./stock-room.ts";
import {
  biomeBotStart,
  claimLookForgeAuto,
  createBotForgeHref,
  createPathHref,
  lookForgeStart,
  lookForgeWalkStyle,
  lookHallLocked,
  parseLookForge,
  pathEntry,
  resetLookForgeAuto,
  shouldAutoStartBotForge,
  vaultHangStart,
} from "./path-entry.ts";
import {
  BOLT_BODY,
  BOLT_FACE,
  BOLT_ID,
  CAM_LOCK,
  GAIT_LOCK,
  HALL_SHOT,
  SHOT_REJECT,
  SPAWN,
  STAND_LOCK,
  TRAVEL_FACE,
  boltKit,
  breathPrompt,
  faceRow,
  facingOf,
  gazeLaw,
  idlePrompt,
  isMoonwalk,
  placeBoltPrompt,
  poseBoltPrompt,
  seedHallPrompt,
  standFace,
  travelOf,
  walkCycleCol,
  walkPos,
  walkPrompt,
} from "./rune.ts";
import { genePrompt, retryLaw, stillLaws } from "./rune-brain.ts";
import { clipImaginePrompt, HALL_PROMPT_BUDGET, IMAGINE_PROMPT_MAX, runeFilmVariants, runeStillJobs } from "./imagine-payload.ts";

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

  it("stock stands stay on the hall floor, not inside the portal glow", () => {
    const a = stockStand("m1");
    const b = stockStand("m2");
    const spawn = stockStand("spawn");
    assert.ok(a.y > 0.54 && a.y < 0.72);
    assert.ok(b.y > 0.54 && b.y < 0.72);
    assert.ok(a.x < 0.5 && b.x > 0.5);
    assert.equal(spawn.x, 0.5);
    assert.equal(spawn.y, 0.78);
    const toA = Math.hypot(a.x - spawn.x, a.y - spawn.y);
    const toB = Math.hypot(b.x - spawn.x, b.y - spawn.y);
    assert.ok(toA > 0.16 && toB > 0.16);
  });
});

describe("Imagine prompt rails", () => {
  const m1 = { id: "m1", name: "teal", x: 0.34, y: 0.6 };
  const m2 = { id: "m2", name: "gold", x: 0.66, y: 0.6 };

  it("locks a full white coat and forbids tan / cream / saddle / mask", () => {
    const still = idlePrompt(gazeLaw("m1"));
    const walk = walkPrompt(SPAWN, m1, true, gazeLaw("m1"));
    const pose = poseBoltPrompt("LEFT");
    const place = placeBoltPrompt();
    const seed = seedHallPrompt();
    for (const p of [BOLT_ID, still, walk, pose, place, seed, genePrompt({ cam: 1, strides: 8, morph: 1, dest: 1 }), stillLaws()]) {
      assert.match(p, /WHITE|white|snow-white/);
      assert.doesNotMatch(p, /cream-ivory/i);
      assert.doesNotMatch(p, /\bPROFILE\b/);
      assert.doesNotMatch(p, /Copy the (white-coat )?dog 1:1/i);
      assert.doesNotMatch(p, /White German Shepherd/i);
    }
    assert.match(BOLT_ID, /zero tan/i);
    assert.match(BOLT_ID, /saddle/);
    assert.match(BOLT_ID, /TEXT COAT WINS/);
    assert.match(BOLT_ID, /Swiss Shepherd/);
    assert.match(CAM_LOCK, /profile-hero|REJECT LIST/);
    assert.match(place, /<IMAGE_0>/);
    assert.match(place, /<IMAGE_1>/);
    assert.match(genePrompt({ cam: 1, strides: 8, morph: 1, dest: 1 }), /Swiss Shepherd/);
  });

  it("uses the snow-white rear still and drops cream profile refs", () => {
    assert.equal(BOLT_BODY, "/refs/bolt-white.jpg");
    const kit = boltKit([BOLT_FACE, "/refs/bolt-body.jpg", "/refs/bolt.jpg", "/films/citadel-tour.jpg"]);
    assert.deepEqual(kit, ["/refs/bolt-white.jpg", "/films/citadel-tour.jpg"]);
    assert.ok(!kit.includes(BOLT_FACE));
    assert.ok(!kit.includes("/refs/bolt-body.jpg"));
  });

  it("keeps still / walk grammar on the locked whole hall, not a side crop", () => {
    const still = idlePrompt(gazeLaw("m1"));
    assert.match(still, /WHOLE hall/);
    assert.match(still, /Feet glued/);
    assert.match(still, /SMALL figure/);
    assert.match(still, /profile close-up|profile-hero/);
    assert.match(gazeLaw("m1"), /glance toward the RIGHT door/);
    assert.match(gazeLaw("m2"), /glance toward the LEFT door/);
    assert.match(gazeLaw("spawn"), /rear \/ back-to-camera|rear\/stand/);
    assert.doesNotMatch(gazeLaw("m1"), /PROFILE/);
    assert.match(HALL_SHOT, /SMALL figure/);
    assert.match(GAIT_LOCK, /foot-slide|skating/);
    assert.match(STAND_LOCK, /3\/4-from-behind/);
  });

  it("walk prompts head travel without FACE LEFT/RIGHT shot language", () => {
    const ab = walkPrompt(m1, m2, false, gazeLaw("m2"));
    const ba = walkPrompt(m2, m1, false, gazeLaw("m1"));
    assert.match(ab, /nose and chest point right/i);
    assert.match(ab, /RIGHT across the frame/);
    assert.match(ab, /glance toward the LEFT door/);
    assert.match(ab, /Never moonwalk/);
    assert.match(ab, /SMALL figure/);
    assert.match(ab, /foot-slide|Paws plant/);
    assert.match(TRAVEL_FACE, /Walk left → nose left/);
    assert.match(ba, /nose and chest point left/i);
    assert.match(ba, /LEFT across the frame/);
    assert.doesNotMatch(ab, /HEAD and BODY FACE/);
    assert.doesNotMatch(ab, /Ignore the/);
    assert.match(genePrompt({ cam: 1, strides: 8, morph: 1, dest: 1 }), /Body heading follows travel|facing the travel direction/);
    assert.match(genePrompt({ cam: 1, strides: 8, morph: 1, dest: 1 }), /foot-slide/);
    assert.doesNotMatch(ab, /The wolf /);
    assert.doesNotMatch(retryLaw("stuck"), /wolf/i);
  });

  it("walk / idle / breath / place all carry the explicit shot REJECT list", () => {
    const walk = walkPrompt(SPAWN, m1, true, gazeLaw("m1"));
    const idle = idlePrompt(gazeLaw("spawn"));
    const breath = breathPrompt(gazeLaw("m1"));
    const place = placeBoltPrompt();
    const seed = seedHallPrompt();
    const forbids = [
      /profile close-up/,
      /profile-hero/,
      /side hero/,
      /medium shot of the dog/,
      /tracking cam/,
      /orbit/,
      /wolf morph/,
      /fox morph/,
    ];
    for (const p of [walk, idle, breath, place, seed, SHOT_REJECT, HALL_SHOT, CAM_LOCK]) {
      for (const re of forbids) assert.match(p, re);
    }
    for (const p of [walk, idle, breath, place, seed, HALL_SHOT, CAM_LOCK]) {
      assert.match(p, /20%|≤20%/);
    }
    assert.match(place, /LOWER center/);
    assert.match(place, /back-to-camera|from behind|rear/);
    assert.match(idle, /LOWER center/);
    assert.match(breath, /3\/4-from-behind|back-to-camera/);
    assert.match(walk, /BOTH doors stay visible/);
    const clipped = clipImaginePrompt(`${walk} ${"pad ".repeat(800)}`);
    assert.ok(clipped.startsWith("REJECT LIST"));
    assert.ok(clipped.length <= HALL_PROMPT_BUDGET);
    assert.ok(HALL_PROMPT_BUDGET <= IMAGINE_PROMPT_MAX);
    for (const re of forbids) assert.match(clipped, re);
  });

  it("walk / idle / breath stay ≤ 2100 so the cook slice cannot drop rails", () => {
    const shipped = [
      idlePrompt(),
      idlePrompt(gazeLaw("m1")),
      idlePrompt([gazeLaw("m1"), stillLaws()].join(" ")),
      breathPrompt(),
      breathPrompt(gazeLaw("m1")),
      walkPrompt(SPAWN, m1, true),
      walkPrompt(SPAWN, m1, true, gazeLaw("m1")),
      walkPrompt(m1, m2, false, gazeLaw("m2")),
      walkPrompt(m1, m2, false, [gazeLaw("m2"), genePrompt({ cam: 1, strides: 8, morph: 1, dest: 1 })].join(" ")),
      walkPrompt(m1, m2, false, [gazeLaw("m2"), genePrompt({ cam: 1, strides: 8, morph: 1, dest: 1 })].join(" "), true),
      walkPrompt(m1, m2, false, `${gazeLaw("m2")} ${genePrompt({ cam: 4, strides: 16, morph: 4, dest: 3 })} ${"lesson ".repeat(80)}`, true),
      placeBoltPrompt(),
      seedHallPrompt(),
    ];
    for (const p of shipped) {
      assert.ok(p.length <= HALL_PROMPT_BUDGET, `prompt ${p.length} > ${HALL_PROMPT_BUDGET}`);
      assert.match(p.slice(0, 200), /REJECT LIST/);
      assert.match(p.slice(0, 400), /profile-hero/);
      assert.match(p.slice(0, 900), /snow-white|Swiss Shepherd/);
    }
  });

  it("create path look → Forge contract is unchanged", () => {
    assert.equal(pathEntry(undefined), "look");
    assert.ok(!createPathHref("m1").includes("stills="));
    assert.deepEqual(lookForgeStart("start"), { dataForge: "start", sealed: false, pack: "live" });
    assert.deepEqual(lookForgeStart("bot"), { dataForge: "bot", sealed: true, pack: "sealed" });
    assert.deepEqual(biomeBotStart(), { dataBiome: "bot", sealed: true });
    assert.deepEqual(vaultHangStart("bot"), { dataHang: "bot", sealed: true });
    assert.deepEqual(vaultHangStart("A"), { dataHang: "A", sealed: false });
  });

  it("Grok Bot Forge uses a LOCKed hall still/style, else sealed DEFAULT HALL", () => {
    assert.equal(lookHallLocked(), false);
    assert.equal(lookHallLocked({}), false);
    assert.equal(lookHallLocked({ style: "" }), false);
    assert.equal(lookHallLocked({ style: "   " }), false);
    assert.equal(lookHallLocked({ pack: [{ id: "same-hall", src: "/films/citadel-tour.jpg" }] }), false);
    assert.equal(lookHallLocked({ pack: [{ id: "door-a", src: "x" }, { id: "door-b", src: "y" }] }), false);
    assert.equal(lookHallLocked({ style: "crystal ferns" }), true);
    assert.equal(lookHallLocked({ still: "blob:hall" }), true);
    assert.equal(lookHallLocked({ pack: [{ id: "pic-1", src: "blob:custom" }] }), true);
    assert.deepEqual(lookForgeStart("bot"), { dataForge: "bot", sealed: true, pack: "sealed" });
    assert.deepEqual(lookForgeStart("bot", {}), { dataForge: "bot", sealed: true, pack: "sealed" });
    assert.deepEqual(lookForgeStart("bot", { style: "crystal ferns" }), { dataForge: "bot", sealed: false, pack: "hall" });
    assert.deepEqual(lookForgeStart("bot", { still: "blob:locked-hall" }), { dataForge: "bot", sealed: false, pack: "hall" });
    assert.deepEqual(lookForgeStart("bot", { pack: [{ id: "pic-1", src: "blob:custom" }] }), { dataForge: "bot", sealed: false, pack: "hall" });
    assert.deepEqual(lookForgeStart("bot", { pack: [{ id: "same-hall", src: "x" }] }), { dataForge: "bot", sealed: true, pack: "sealed" });
    assert.deepEqual(lookForgeStart("start", { style: "crystal ferns" }), { dataForge: "start", sealed: false, pack: "live" });
    assert.equal(lookForgeWalkStyle("bot", "crystal ferns"), "");
    assert.equal(lookForgeWalkStyle("start", "crystal ferns"), "crystal ferns");
  });

  it("look screen Bot Forge follows lock → hall style pack, unlocked → sealed", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    assert.match(src, /lookForgeStart\("bot", lookLock\)/);
    assert.match(src, /data-look-lock=/);
    assert.match(src, /data-forge-pack=\{botForge\.pack\}/);
    assert.match(src, /lookForgeWalkStyle\(hallStyleOnly/);
    const startAt = src.indexOf("function startBotForge");
    assert.ok(startAt >= 0, "startBotForge missing");
    const handler = src.slice(startAt, src.indexOf("startBotForgeRef.current", startAt) + 40);
    assert.match(handler, /lookForgeStart\("bot", \{/);
    assert.match(handler, /style: styleOn/);
    assert.match(handler, /if \(start\.sealed\)/);
    assert.match(handler, /startRefs\(false, "hall"\)/);
    assert.match(handler, /startRefs\(false, "sealed"\)/);
    assert.match(handler, /clearWish\(\)/);
    assert.doesNotMatch(handler, /startRefs\(false, "live"\)/);
  });

  it("forge=bot on look auto-starts the same Bot Forge pack once", () => {
    resetLookForgeAuto();
    assert.equal(parseLookForge("first=m1&drive=engine&rooms=1&hall=1&forge=bot"), "bot");
    assert.equal(parseLookForge("/rune?first=m1&drive=engine&rooms=1&hall=1&forge=bot"), "bot");
    assert.equal(parseLookForge({ forge: "bot" }), "bot");
    assert.equal(parseLookForge({ botForge: "1" }), "bot");
    assert.equal(parseLookForge({ botForge: 1 }), "bot");
    assert.equal(parseLookForge({ botForge: true }), "bot");
    assert.equal(parseLookForge({ forge: "start" }), undefined);
    assert.equal(parseLookForge({ first: "m1" }), undefined);
    assert.equal(parseLookForge(new URLSearchParams("forge=bot")), "bot");
    assert.equal(createBotForgeHref("m1"), "/rune?first=m1&drive=engine&rooms=1&hall=1&forge=bot");
    assert.equal(createBotForgeHref("m2"), "/rune?first=m2&drive=engine&rooms=1&hall=1&forge=bot");
    assert.equal(shouldAutoStartBotForge({ phase: "look", forge: "bot" }), true);
    assert.equal(shouldAutoStartBotForge({ phase: "look", forge: "bot", stills: true }), true);
    assert.equal(shouldAutoStartBotForge({ phase: "look", forge: "bot", stills: false }), false);
    assert.equal(shouldAutoStartBotForge({ phase: "play", forge: "bot" }), false);
    assert.equal(shouldAutoStartBotForge({ phase: "look", forge: undefined }), false);
    assert.equal(claimLookForgeAuto("unit"), true);
    assert.equal(claimLookForgeAuto("unit"), false);
    resetLookForgeAuto("unit");
    assert.equal(claimLookForgeAuto("unit"), true);
    resetLookForgeAuto();

    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const route = readFileSync(join(here, "../routes/rune.tsx"), "utf8");
    assert.match(route, /forge: parseLookForge\(s\)/);
    assert.match(route, /stills, forge/);
    assert.match(src, /shouldAutoStartBotForge/);
    assert.match(src, /kickAutoBotForge/);
    assert.match(src, /parseLookForge/);
    assert.match(src, /window\.__boltForge/);
    assert.match(src, /startBot:\s*\(\)\s*=>\s*startBotForgeRef\.current\(\)/);
    const botFn = src.slice(src.indexOf("function startBotForge"), src.indexOf("startBotForgeRef.current", src.indexOf("function startBotForge")));
    assert.doesNotMatch(botFn, /showOpenFilePicker|file\.current\?\.click|type="file"/);
  });

  it("Grok Bot Forge stays visible and both click and pointerup start cook", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const bot = src.slice(src.indexOf("data-forge={botForge.dataForge}"));
    const btn = bot.slice(0, bot.indexOf("Grok Bot Forge") + 20);
    assert.match(btn, /data-forge-start="bot"/);
    assert.match(btn, /onPointerUp=/);
    assert.match(btn, /onClick=/);
    assert.match(btn, /startBotForge\(\)/);
    assert.match(btn, /pointerEvents:\s*"auto"/);
    assert.match(btn, /z-40/);
    assert.doesNotMatch(btn, /type="file"/);
    assert.doesNotMatch(btn, /showOpenFilePicker/);
    assert.match(src, /Grok Bot Forge/);
  });
});

describe("Imagine still / film payloads", () => {
  const store = { filename: "bolt-test.jpg", public_url: true as const };

  it("place-bolt editOnly sends hall + identity as images, not hall-only image", () => {
    const jobs = runeStillJobs({
      prompt: placeBoltPrompt(),
      pics: [{ url: "data:hall" }, { url: "data:bolt" }],
      edit: true,
      editOnly: true,
      ratio: "9:16",
      resolution: "1k",
      store,
    });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.path, "/images/edits");
    assert.deepEqual(jobs[0]?.body.images, [{ url: "data:hall" }, { url: "data:bolt" }]);
    assert.equal(jobs[0]?.body.image, undefined);
    assert.match(String(jobs[0]?.body.prompt), /^REJECT LIST/);
    assert.match(String(jobs[0]?.body.prompt), /profile-hero/);
  });

  it("video variants never combine image with reference_images", () => {
    const variants = runeFilmVariants({
      prompt: idlePrompt(),
      imageUrl: "data:still",
      duration: 6,
      resolution: "720p",
      store: { filename: "bolt-test.mp4", public_url: true },
    });
    assert.ok(variants.length >= 1);
    for (const body of variants) {
      assert.deepEqual(body.image, { url: "data:still" });
      assert.equal(body.reference_images, undefined);
      assert.match(String(body.prompt), /^REJECT LIST/);
    }
  });
});

describe("sprite walk facing", () => {
  it("maps sheet rows as front / left / right / rear — not swapped left-right", () => {
    assert.equal(faceRow("down"), 0);
    assert.equal(faceRow("left"), 1);
    assert.equal(faceRow("right"), 2);
    assert.equal(faceRow("up"), 3);
  });

  it("door-to-door travel faces the walk, stands look at the other door", () => {
    const a = { id: "m1", name: "teal", ...stockStand("m1") };
    const b = { id: "m2", name: "gold", ...stockStand("m2") };
    assert.equal(travelOf(a, b).face, "right");
    assert.equal(travelOf(b, a).face, "left");
    assert.equal(standFace("m1"), "right");
    assert.equal(standFace("m2"), "left");
    assert.equal(standFace("spawn"), "up");
    assert.equal(facingOf(0.32, 0), "right");
    assert.equal(facingOf(-0.32, 0), "left");
    assert.equal(isMoonwalk("right", -0.32, 0), true);
    assert.equal(isMoonwalk("left", -0.32, 0), false);
    assert.equal(isMoonwalk("left", 0.32, 0), true);
    assert.equal(isMoonwalk("right", 0.32, 0), false);
  });

  it("walk cycle columns track translation, not a free-running clock", () => {
    const a = { x: 0.34, y: 0.6 };
    const b = { x: 0.66, y: 0.6 };
    const mid = walkPos(a, b, 500, 1000);
    assert.equal(mid.k, 0.5);
    assert.ok(Math.abs(mid.x - 0.5) < 1e-9);
    assert.equal(mid.y, 0.6);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    assert.equal(walkCycleCol(0, dist), 0);
    const early = walkCycleCol(0.2, dist);
    const late = walkCycleCol(0.8, dist);
    assert.notEqual(early, late);
    assert.ok(late >= 0 && late <= 3);
  });
});

describe("create path entry", () => {
  it("omitted or stills=1 opens look / Forge, stills=0 keeps stock tap hall", () => {
    assert.equal(pathEntry(undefined), "look");
    assert.equal(pathEntry(true), "look");
    assert.equal(pathEntry(false), "stock");
    assert.equal(createPathHref("m1"), "/rune?first=m1&drive=engine&rooms=1&hall=1");
    assert.equal(createPathHref("m2", "drive=pilot&rooms=1&hall=1"), "/rune?first=m2&drive=pilot&rooms=1&hall=1");
    assert.ok(!createPathHref("m1").includes("stills="));
    assert.ok(createPathHref("m1", "drive=engine&rooms=1&hall=1", false).endsWith("&stills=0"));
    assert.equal(createBotForgeHref("m1"), `${createPathHref("m1")}&forge=bot`);
  });
});
