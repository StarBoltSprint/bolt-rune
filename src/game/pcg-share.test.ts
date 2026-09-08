import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FILM_BY_ID } from "./films.ts";
import {
  clipCachePut,
  RAILS_VERSION,
} from "./pcg-rail.ts";
import {
  compactKeepShare,
  decodeKeepShare,
  encodeKeepShare,
  exportKeepShare,
  hostShareId,
  importKeepShare,
  resolveKeepShare,
  resolveSharePin,
  scrubKeepSecrets,
  shareHasSecrets,
  visitorAutoBill,
  visitorMayImagine,
  type KeepShare,
} from "./pcg-share.ts";

const here = dirname(fileURLToPath(import.meta.url));

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
  Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true });
  return store;
}

const sample = (): KeepShare =>
  exportKeepShare({
    runSeed: "sshare01aa",
    graph: {
      nodes: [
        { id: "spawn", name: "spawn" },
        { id: "m1", name: "door A" },
        { id: "m2", name: "door B" },
      ],
      edges: [
        { id: "m1>spawn:enter", from: "m1", to: "spawn", act: "enter" },
        { id: "m2>spawn:enter", from: "m2", to: "spawn", act: "enter" },
      ],
    },
    pins: {
      "m1>spawn:enter": "chunk-forest",
      "m2>spawn:enter": "missing-local-key",
    },
    transcript: ["hit", "late", "miss"],
  });

describe("Keep share recipe — export / import / visitor", () => {
  beforeEach(() => {
    mockStorage();
  });

  it("share roundtrip — gzip base64url, same graph + pins + grades", () => {
    const share = sample();
    assert.equal(share.v, 1);
    assert.equal(share.railsVersion, RAILS_VERSION);
    assert.equal(share.runSeed, "sshare01aa");
    assert.ok(share.graph.nodes.some((n) => n.id === "spawn"));
    assert.ok(share.graph.edges.some((e) => e.from === "m1" && e.to === "spawn"));
    const token = encodeKeepShare(share);
    assert.match(token, /^(g1|j1)\./);
    assert.equal(shareHasSecrets(token), false);
    const back = decodeKeepShare(token);
    assert.ok(back);
    assert.equal(back!.v, 1);
    assert.equal(back!.runSeed, share.runSeed);
    assert.equal(back!.railsVersion, "bolt-1");
    assert.deepEqual(back!.pins, share.pins);
    assert.deepEqual(back!.transcript, [{ grade: "hit" }, { grade: "late" }, { grade: "miss" }]);
    assert.deepEqual(importKeepShare(token)?.graph.edges.map((e) => e.id).sort(), share.graph.edges.map((e) => e.id).sort());
    assert.match(hostShareId(share), /^[0-9a-f]{12}$/);
    assert.equal(hostShareId(share), hostShareId(back!));
  });

  it("visitor resolve is catalog → cache → unlit/ticket — never auto-bill", () => {
    const share = sample();
    clipCachePut("cached-edge", "/films/forge-canyon.mp4", "enter");
    share.pins["m2>spawn:enter"] = "cached-edge";
    const catalog = resolveSharePin(share, "m1>spawn:enter", true);
    assert.equal(catalog.source, "catalog");
    assert.match(catalog.url, /\/films\//);
    assert.equal(catalog.bill, false);
    assert.equal(catalog.imagine, false);
    const cached = resolveSharePin(share, "m2>spawn:enter", true);
    assert.equal(cached.source, "cache");
    assert.equal(cached.url, "/films/forge-canyon.mp4");
    assert.equal(cached.bill, false);
    const missing = resolveSharePin(share, "ghost>spawn:enter", true);
    assert.equal(missing.source, "unlit");
    assert.equal(missing.url, "");
    assert.equal(missing.ticket, "forge");
    assert.equal(missing.bill, false);
    assert.equal(missing.imagine, false);
    const all = resolveKeepShare(share, true);
    assert.ok(all.every((r) => r.bill === false && r.imagine === false));
    assert.equal(visitorAutoBill(share), false);
    assert.equal(visitorMayImagine(share), false);
  });

  it("share never carries wake URLs, API keys, or SuperGrok tokens", () => {
    const dirty = compactKeepShare({
      v: 1,
      railsVersion: RAILS_VERSION,
      runSeed: "ssecret01aa",
      graph: { nodes: [{ id: "spawn", name: "XAI_API_KEY=sk-aaaaaaaa" }], edges: [] },
      pins: {
        "m1>spawn:enter": "chunk-forest",
        SMOKE_WAKE_URL: "https://hooks.grok.me/wake?k=1",
        leaked: "sk-live-secret-key",
      },
    } as KeepShare);
    assert.equal(dirty.pins["m1>spawn:enter"], "chunk-forest");
    assert.equal(dirty.pins.SMOKE_WAKE_URL, undefined);
    assert.equal(dirty.pins.leaked, undefined);
    assert.ok(!dirty.graph.nodes.some((n) => /XAI_API_KEY|sk-/.test(n.name || "")));
    const token = encodeKeepShare(
      exportKeepShare({
        runSeed: "ssecret01aa",
        pins: {
          "m1>spawn:enter": "chunk-forest",
          "DOOR_WAKE_URL": "https://example.com/wake",
        },
      }),
    );
    assert.doesNotMatch(token, /WAKE_URL|XAI_API_KEY|sk-|SuperGrok|Bearer/i);
    assert.equal(shareHasSecrets(token), false);
    const scrubbed = scrubKeepSecrets({
      wish: "XAI_API_KEY=sk-hidden",
      smokeWakeUrl: "https://hooks.grok.me/x",
      title: "Hall",
    });
    assert.ok(!scrubbed.wish);
    assert.equal((scrubbed as { smokeWakeUrl?: string }).smokeWakeUrl, undefined);
    assert.equal(scrubbed.title, "Hall");
  });

  it("Asteroid HOLD — seats and asteroid chart untouched", () => {
    const asteroid = FILM_BY_ID.asteroid.beats.map((beat) => beat.at);
    assert.deepEqual(asteroid, [7.0, 12.3, 16.3, 21.6, 25.6, 30.9, 34.9, 40.2, 44.2, 49.5, 53.5]);
    const share = readFileSync(join(here, "./pcg-share.ts"), "utf8");
    const rail = readFileSync(join(here, "./pcg-rail.ts"), "utf8");
    const seats = readFileSync(join(here, "../components/door-chat-line.tsx"), "utf8");
    assert.match(share, /Asteroid HOLD/);
    assert.match(share, /never auto-bill/);
    assert.match(share, /No wake URLs/);
    assert.doesNotMatch(share, /prepareHoldBeats/);
    assert.match(rail, /rich cache key/i);
    assert.doesNotMatch(seats, /richClipKey|encodeKeepShare|pinKeepFromSession/);
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    assert.match(readme, /PCG Keep share \/ rich clip cache/);
    assert.match(readme, /never auto-bill a visitor/);
  });
});
