import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beginPose, landBreath, resetForNewHall, tapPose, type PoseClipShelf } from "./pcg-pose.ts";
import {
  PRELOAD_SLOTS,
  createPreloadPool,
  mayPreloadImagine,
  pickPreload,
  planPreload,
  syncPreload,
} from "./preload.ts";

const here = dirname(fileURLToPath(import.meta.url));

const SHELF: PoseClipShelf = {
  "breath-spawn": "/films/breath-spawn.mp4",
  "breath-A": "/films/breath-a.mp4",
  "breath-B": "/films/breath-b.mp4",
  "walk-spawn-A": "/films/walk-spawn-a.mp4",
  "walk-spawn-B": "/films/walk-spawn-b.mp4",
  "walk-A-B": "/films/walk-a-b.mp4",
  "walk-B-A": "/films/walk-b-a.mp4",
  "enter-A": "/films/enter-a.mp4",
  "enter-B": "/films/enter-b.mp4",
  decay: "/films/decay.mp4",
};

function lib(shelf: PoseClipShelf = SHELF, disk: Partial<Record<string, boolean>> = {}) {
  return {
    url: (id: keyof PoseClipShelf) => shelf[id] || "",
    onDisk: (id: keyof PoseClipShelf) => disk[id] ?? Boolean(shelf[id]),
  };
}

function stubVideo(src = "") {
  const listeners = new Map<string, Array<() => void>>();
  const el = {
    tagName: "VIDEO",
    src,
    currentSrc: src,
    readyState: 4,
    muted: true,
    loop: false,
    preload: "auto",
    style: { cssText: "" } as CSSStyleDeclaration,
    getAttribute(name: string) {
      return name === "src" ? el.src : null;
    },
    setAttribute() {},
    addEventListener(type: string, fn: () => void) {
      listeners.set(type, [...(listeners.get(type) || []), fn]);
    },
    removeEventListener() {},
    load() {},
    pause() {
      el.paused = true;
    },
    paused: false,
  };
  return el as unknown as HTMLVideoElement & { paused: boolean };
}

describe("preload law — plan", () => {
  it("never launches Imagine; max 4 next-probable PASS films", () => {
    assert.equal(mayPreloadImagine(), false);
    assert.equal(PRELOAD_SLOTS, 4);
    const src = readFileSync(join(here, "./preload.ts"), "utf8");
    assert.doesNotMatch(src, /mayImagine\s*\(|startRuneFilm\s*\(/);
    assert.match(src, /rel=preload as=video|rel = "preload"/);
    assert.match(src, /not a 5th decode/);
  });

  it("walk toward A warms breath-atA first", () => {
    const walk = tapPose(beginPose(), "A", { shelf: SHELF }).state;
    assert.equal(walk.mode, "walk");
    const plan = planPreload(walk);
    assert.equal(plan[0]?.id, "breath-A");
    assert.equal(plan[0]?.priority, 0);
    assert.equal(plan[0]?.loop, true);
  });

  it("breath at spawn warms walk-spawn-A and walk-spawn-B", () => {
    const ids = planPreload(beginPose()).map((w) => w.id);
    assert.ok(ids.includes("walk-spawn-A"));
    assert.ok(ids.includes("walk-spawn-B"));
    assert.ok(ids.includes("decay"));
    assert.ok(ids.includes("breath-spawn"));
  });

  it("enter warms only when already on disk — otherwise ticket + cook, no warm", () => {
    const atA = { ...landBreath("atA"), armed: { A: true, B: false } };
    const withFile = pickPreload(atA, lib(SHELF, { "enter-A": true }));
    assert.ok(withFile.some((f) => f.id === "enter-A"));
    const noFile = pickPreload(atA, lib({ ...SHELF, "enter-A": "" }, { "enter-A": false }));
    assert.ok(!noFile.some((f) => f.id === "enter-A"));
  });

  it("enter PASS drops old-hall walks; keeps decay + new spawn breath", () => {
    const after = resetForNewHall(landBreath("atA"));
    const ids = planPreload(after).map((w) => w.id);
    assert.ok(!ids.includes("walk-A-B"));
    assert.ok(!ids.includes("walk-B-A"));
    assert.ok(!ids.includes("breath-A"));
    assert.ok(!ids.includes("breath-B"));
    assert.ok(ids.includes("decay"));
    assert.ok(ids.includes("breath-spawn"));
    assert.ok(ids.includes("walk-spawn-A"));
  });

  it("pickPreload keeps at most 4 PASS urls and always prefers decay then breath-spawn", () => {
    const fill = pickPreload(beginPose(), lib());
    assert.ok(fill.length <= 4);
    assert.ok(fill.some((f) => f.id === "walk-spawn-A"));
    assert.ok(fill.some((f) => f.id === "decay"));
  });
});

describe("preload law — pool", () => {
  it("take steals a ready buffer; pauseAll pauses; pose change ignores old generation", () => {
    const videos: HTMLVideoElement[] = [];
    const links: HTMLLinkElement[] = [];
    const pre = createPreloadPool({
      createVideo: () => {
        const v = stubVideo();
        videos.push(v);
        return v;
      },
      createLink: () => {
        const l = { rel: "", as: "", href: "" } as HTMLLinkElement;
        links.push(l);
        return l;
      },
    });
    const sm = beginPose();
    const first = syncPreload(sm, lib(), pre);
    assert.ok(first.length > 0);
    assert.equal(pre.gen, 1);
    assert.ok(links.length > 0);
    assert.ok(links.every((l) => l.rel === "preload" && l.as === "video"));
    assert.ok(videos.length <= PRELOAD_SLOTS);

    const stolen = pre.take("walk-spawn-A");
    assert.ok(stolen);
    assert.equal(pre.take("walk-spawn-A"), null);

    pre.pauseAll();
    assert.ok(videos.some((v) => (v as HTMLVideoElement & { paused?: boolean }).paused));

    const walking = tapPose(sm, "A", { shelf: SHELF }).state;
    const staleGen = pre.gen;
    syncPreload(walking, lib(), pre);
    assert.ok(pre.gen > staleGen);
    assert.ok(pre.slots().every((s) => !s.id || s.gen === pre.gen));
  });

  it("paused SM pauseAlls and does not warm", () => {
    const pre = createPreloadPool({ createVideo: () => stubVideo(), createLink: () => ({ rel: "", as: "", href: "" }) as HTMLLinkElement });
    const paused = { ...beginPose(), mode: "paused" as const, pausedFrom: "breath" as const };
    const fill = syncPreload(paused, lib(), pre);
    assert.deepEqual(fill, []);
  });
});

describe("preload law — engine hook", () => {
  it("syncPreload after startHall / onTap / onEnded; prepare tries take first", () => {
    const law = readFileSync(join(here, "./preload.ts"), "utf8");
    const trans = readFileSync(join(here, "./transition.ts"), "utf8");
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    const docs = readFileSync(join(here, "../../docs/pcg-anti-3d.md"), "utf8");

    assert.match(law, /export function syncPreload/);
    assert.match(law, /export function createPreloadPool/);
    assert.match(law, /take\(/);
    assert.match(law, /pauseAll/);
    assert.doesNotMatch(law, /Date\.now\s*\(/);

    assert.match(trans, /pre\.take|els\.pre \? els\.pre\.take/);
    assert.match(trans, /prepare\(url\) tries pre\.take|tries pre\.take\(plateId\)/);

    const goTo = engine.slice(engine.indexOf("function goTo"), engine.indexOf("function drainQueue"));
    assert.match(goTo, /syncPreload\(/);
    assert.match(engine, /function startHall/);
    assert.match(engine, /syncPreload\(sm, lib, pre\)/);
    assert.match(engine, /onEndedPose/);
    const playWalk = engine.slice(engine.indexOf("async function playWalk"), engine.indexOf("async function enterDoorBreath"));
    assert.match(playWalk, /syncPreload\(/);

    assert.match(stage, /syncPreload\(/);
    assert.match(stage, /pauseAll\(/);
    assert.match(readme, /preload/i);
    assert.match(docs, /preload\.ts/);
  });
});
