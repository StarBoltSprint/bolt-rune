import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cachedClipOf,
  clipCacheKey,
  doorToken,
  enterSeed,
  ensureRunSeed,
  idleAct,
  imagineSeedInt,
  isPcgCacheKey,
  isRunSeed,
  keepRunSeed,
  livingBiome,
  mintRunSeed,
  plateSeed,
  rememberCachedClip,
  sha256hex,
  walkAct,
} from "./pcg-seed.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("PCG rail 1 hash stability", () => {
  it("sha256hex matches Node crypto for the same UTF-8", () => {
    for (const s of ["", "abc", "smiR sealed PCG", "unicodé ✓", "a".repeat(200)]) {
      assert.equal(sha256hex(s), createHash("sha256").update(s, "utf8").digest("hex"));
    }
  });

  it("plate seed s_i = H(s, i, act, biome) is stable and Imagine-usable hex", () => {
    const s = "0123456789abcdef0123456789abcdef";
    const a = plateSeed(s, 1, "walk:spawn:m1", "hall");
    const b = plateSeed(s, 1, "walk:spawn:m1", "hall");
    const otherI = plateSeed(s, 2, "walk:spawn:m1", "hall");
    const otherAct = plateSeed(s, 1, "idle:m1", "hall");
    const otherBiome = plateSeed(s, 1, "walk:spawn:m1", "forest");
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{16}$/);
    assert.notEqual(a, otherI);
    assert.notEqual(a, otherAct);
    assert.notEqual(a, otherBiome);
    assert.equal(imagineSeedInt(a), Number.parseInt(a.slice(0, 8), 16) >>> 0);
  });

  it("enter seed s_enter = H(s, i, enter, biomeFrom, biomeTo, door) is stable", () => {
    const s = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const a = enterSeed(s, 3, "hall", "forest", "A");
    const b = enterSeed(s, 3, "hall", "forest", "m1");
    const otherDoor = enterSeed(s, 3, "hall", "forest", "B");
    const otherTo = enterSeed(s, 3, "hall", "ocean", "A");
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{16}$/);
    assert.notEqual(a, otherDoor);
    assert.notEqual(a, otherTo);
    assert.equal(doorToken("RIGHT"), "b");
    assert.equal(doorToken("m2"), "b");
  });

  it("clip cache key is keyed by s_i / s_enter and hits reuse the artifact", () => {
    const s = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const si = plateSeed(s, 1, walkAct("spawn", "m2"), "hall");
    const se = enterSeed(s, 1, "hall", "canyon", "B");
    const kWalk = clipCacheKey(si);
    const kEnter = clipCacheKey(se);
    assert.equal(kWalk, `pcg:${si}`);
    assert.equal(kEnter, `pcg:${se}`);
    assert.ok(isPcgCacheKey(kWalk));
    assert.ok(kWalk.length <= 40);
    assert.notEqual(kWalk, kEnter);

    const bank = rememberCachedClip([], si, { url: "/films/cached-walk.mp4", end: "/films/end.jpg", start: "/films/start.jpg" });
    const hit = cachedClipOf(bank, si);
    assert.ok(hit);
    assert.equal(hit.url, "/films/cached-walk.mp4");
    assert.equal(cachedClipOf(bank, se), null);
    assert.equal(cachedClipOf(new Map([[kWalk, { url: hit.url }]]), kWalk)?.url, hit.url);
  });

  it("mintRunSeed is crypto-random and keep/ensure do not remint a kept seed", () => {
    const a = mintRunSeed();
    const b = mintRunSeed();
    assert.ok(isRunSeed(a));
    assert.ok(isRunSeed(b));
    assert.notEqual(a, b);
    assert.equal(keepRunSeed("not-hex", a.toUpperCase()), a);
    assert.equal(ensureRunSeed(a), a);
    assert.equal(livingBiome(""), "hall");
    assert.equal(livingBiome("Forest"), "forest");
    assert.equal(idleAct("m1"), "idle:m1");
  });
});

describe("PCG rail 1 persist + cook/play wiring", () => {
  it("session Keep/cloud carry runSeed — extend, do not duplicate wish/start/guest", () => {
    const session = readFileSync(join(here, "./rune-session.ts"), "utf8");
    const cloud = readFileSync(join(here, "../lib/citadel-cloud.ts"), "utf8");
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    assert.match(session, /runSeed\?: string/);
    assert.match(session, /keepRunSeed/);
    assert.match(session, /runSeed: keepRunSeed/);
    assert.match(cloud, /runSeed: keepRunSeed/);
    assert.match(engine, /runSeedHold/);
    assert.match(engine, /ensureRunSeed/);
    assert.doesNotMatch(engine, /Connect Wallet/);
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    assert.match(readme, /Engine PCG rail 1/);
    assert.match(readme, /s_i = H\(s, i, act, biome\)/);
    assert.match(readme, /walk-toward-door/);
  });

  it("cook/play reuse pcg cache and never enqueue Imagine on walk-toward-door", () => {
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const pcg = readFileSync(join(here, "./pcg-seed.ts"), "utf8");
    assert.match(pcg, /Do not enqueue Imagine on walk-toward-door/);
    assert.match(engine, /cachedClipOf/);
    assert.match(engine, /clipCacheKey/);
    assert.match(engine, /plateSeed\(/);
    assert.match(engine, /enterSeed\(/);
    const prefetch = engine.slice(engine.indexOf("function prefetchFrom"), engine.indexOf("function notePaint"));
    assert.doesNotMatch(prefetch, /startRuneFilm|cookFilm|forgeWalkNow/);
    assert.match(prefetch, /warm existing clip URLs only/);
    const playWalk = engine.slice(engine.indexOf("async function playWalk"), engine.indexOf("async function saveFilms"));
    assert.match(playWalk, /cachedClipOf/);
    assert.match(playWalk, /confirmed walk cook/);
    const warm = engine.slice(engine.indexOf("function warmHungBiome"), engine.indexOf("async function goHungHall"));
    assert.doesNotMatch(warm, /startRuneFilm|cookFilm/);
  });
});
