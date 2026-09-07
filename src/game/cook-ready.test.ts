import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootCookLoc,
  clearCookReady,
  cookOverlayForging,
  biomeReadySrc,
  cookUrlsReady,
  lookForgeAlreadyDone,
  markLookForgeDone,
  readCookReady,
  resetLookForgeDone,
  resolveCookStudioMount,
  shouldResumeForgePlay,
  writeCookReady,
} from "./cook-ready.ts";
import { playableClipSrc, stockBiomeLoop } from "./play-clip.ts";
import { parseBoltHash } from "../lib/bolt-history.ts";
import { claimLookForgeAuto, resetLookForgeAuto, shouldAutoStartBotForge } from "./path-entry.ts";

function mockStorage() {
  const mem = new Map<string, string>();
  const store = {
    getItem(k: string) {
      return mem.has(k) ? mem.get(k)! : null;
    },
    setItem(k: string, v: string) {
      mem.set(k, String(v));
    },
    removeItem(k: string) {
      mem.delete(k);
    },
    clear() {
      mem.clear();
    },
  };
  Object.defineProperty(globalThis, "sessionStorage", { value: store, configurable: true });
  return store;
}

describe("biome cook READY remount", () => {
  beforeEach(() => {
    mockStorage();
    resetLookForgeDone();
    resetLookForgeAuto();
  });

  it("empty #forge/cook remount is studio, not a 0% forging overlay", () => {
    assert.deepEqual(resolveCookStudioMount({ gate: "cook" }), { gate: "studio", forging: false, ready: false });
    assert.deepEqual(resolveCookStudioMount({ gate: "cook", readyUrls: [] }), { gate: "studio", forging: false, ready: false });
    assert.equal(cookOverlayForging({ busy: false, cookingIndex: -1, readyN: 0 }), false);
  });

  it("READY snap remounts cook playable, not forging", () => {
    const urls = [playableClipSrc("https://cdn.example/sprint.mp4")];
    assert.deepEqual(resolveCookStudioMount({ gate: "cook", readyUrls: urls }), {
      gate: "cook",
      forging: false,
      ready: true,
    });
    assert.equal(cookOverlayForging({ busy: false, cookingIndex: -1, readyN: 1 }), false);
    assert.equal(cookOverlayForging({ busy: true, cookingIndex: 0 }), true);
    assert.equal(cookOverlayForging({ cookingIndex: 0 }), true);
  });

  it("persists READY urls and restores them after remount", () => {
    assert.equal(readCookReady(), null);
    const remote = "https://cdn.example/asteroid.mp4";
    const playable = playableClipSrc(remote);
    const snap = writeCookReady({
      biome: "asteroid",
      urls: [remote, "/films/cook-asteroid.jpg"],
      watch: remote,
    });
    assert.ok(snap);
    assert.deepEqual(snap?.urls, [playable]);
    assert.equal(snap?.watch, playable);
    assert.match(playable, /^\/api\/clip\?u=/);
    const got = readCookReady();
    assert.equal(got?.biome, "asteroid");
    assert.deepEqual(got?.urls, [playable]);
    clearCookReady();
    assert.equal(readCookReady(), null);
  });

  it("filters stock stills out of ready urls", () => {
    assert.deepEqual(cookUrlsReady(["/films/cook-asteroid.jpg", "/films/forge-asteroid.mp4"]), [
      "/films/forge-asteroid.mp4",
    ]);
  });

  it("biome ready uses a playable src, never a bare Imagine URL", () => {
    const imagine = "https://imgen.x.ai/vid/asteroid-loop.mp4?sig=1";
    const src = biomeReadySrc([imagine], "asteroid");
    assert.match(src, /^\/api\/clip\?u=/);
    assert.doesNotMatch(src, /^https:\/\/imgen/);
    assert.equal(biomeReadySrc([], "asteroid"), stockBiomeLoop("asteroid"));
    assert.equal(biomeReadySrc(["/films/cook-asteroid.jpg"], "asteroid"), "/films/forge-asteroid.mp4");
    assert.equal(biomeReadySrc(["/films/forge-asteroid.mp4"], "asteroid"), "/films/forge-asteroid.mp4");
  });

  it("artifacts remount keeps #forge/cook instead of forcing rifts", () => {
    assert.deepEqual(
      bootCookLoc({
        bootScreen: "cook",
        hashed: { screen: "cook", gate: "cook", page: 0, biome: "asteroid" },
        stored: { screen: "cook", gate: "rifts", page: 0 },
      }),
      { screen: "cook", gate: "cook", page: 0, biome: "asteroid" },
    );
    assert.deepEqual(
      bootCookLoc({ bootScreen: "cook", hashed: { screen: "title" }, stored: null }),
      { screen: "cook", gate: "rifts", page: 0 },
    );
  });

  it("parseBoltHash keeps biome on forge/cook", () => {
    assert.deepEqual(parseBoltHash("forge/cook"), { screen: "cook", gate: "cook", page: 0, biome: undefined });
    assert.deepEqual(parseBoltHash("forge/cook/asteroid"), {
      screen: "cook",
      gate: "cook",
      page: 0,
      biome: "asteroid",
    });
  });
});

describe("forge=bot auto-start once", () => {
  beforeEach(() => {
    mockStorage();
    resetLookForgeDone();
    resetLookForgeAuto();
  });

  it("first look+forge=bot still auto-starts; remount / done does not", () => {
    assert.equal(shouldAutoStartBotForge({ phase: "look", forge: "bot" }), true);
    assert.equal(shouldResumeForgePlay({ done: false, liveId: "citadel-1" }), false);
    assert.equal(claimLookForgeAuto("unit"), true);
    assert.equal(claimLookForgeAuto("unit"), false);
    markLookForgeDone("unit");
    assert.equal(lookForgeAlreadyDone("unit"), true);
    assert.equal(shouldResumeForgePlay({ done: true, liveId: "citadel-1" }), true);
    assert.equal(shouldResumeForgePlay({ done: true, liveId: "" }), false);
    assert.equal(shouldResumeForgePlay({ done: true, liveId: "citadel-1", walks: false }), false);
    assert.equal(shouldResumeForgePlay({ done: true, liveId: "citadel-1", walks: 0 }), false);
  });

  it("kickAutoBotForge claims look-forge auto and skips after READY", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const kick = src.slice(src.indexOf("function kickAutoBotForge"), src.indexOf("kickAutoBotForgeRef.current = kickAutoBotForge"));
    assert.match(kick, /lookForgeAlreadyDone/);
    assert.match(kick, /claimLookForgeAuto/);
    assert.match(src, /markLookForgeDone\(\)/);
    assert.match(src, /shouldResumeForgePlay/);
    const cook = readFileSync(join(here, "../components/cook-studio.tsx"), "utf8");
    assert.match(cook, /writeCookReady/);
    assert.match(cook, /resolveCookStudioMount/);
    assert.match(cook, /cookOverlayForging/);
    assert.match(cook, /data-biome-cook="ready"/);
    assert.match(cook, /biomeReadySrc/);
    assert.match(cook, /data-biome-src/);
    assert.doesNotMatch(cook, /void cookAll\(\);\s*\n\s*void cookAll/);
    const cine = readFileSync(join(here, "../components/cine-app.tsx"), "utf8");
    assert.match(cine, /bootCookLoc/);
  });
});
