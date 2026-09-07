import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("Load hydrate keeps cooked bank start", () => {
  it("session persist and cloud pack keep clip.start", () => {
    const session = readFileSync(join(here, "./rune-session.ts"), "utf8");
    const cloud = readFileSync(join(here, "../lib/citadel-cloud.ts"), "utf8");
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    assert.match(session, /export function packBankClips/);
    assert.match(session, /start \? \{ start \}/);
    assert.match(cloud, /start: httpUrl\(b\.start\)/);
    assert.match(engine, /slimClip\(b\.start\)/);
    assert.match(engine, /mergeBankClips/);
  });
});

describe("Load drop? cannot no-op", () => {
  it("tombstone, guest cloud, and empty catalog actually purge", () => {
    const session = readFileSync(join(here, "./rune-session.ts"), "utf8");
    assert.match(session, /Tombstone wins/);
    assert.match(session, /do not resurrect/);
    assert.match(session, /export async function dropLoadCitadel/);
    assert.match(session, /export async function dropLoadRoom/);
    assert.match(session, /dropGuestCitadel/);
    assert.match(session, /function clearCatalog/);
    assert.match(session, /if \(!tiny\.length\) \{\s*clearCatalog\(\)/);
    assert.match(session, /if \(loadCitadelGone\(session\.id\)/);
    assert.match(session, /if \(loadCitadelGone\(id\)\) return null/);
    assert.match(session, /hall === "all"/);
    assert.doesNotMatch(session, /if \(\(s\.updated \|\| 0\) > d\.at\) \{\s*clearDropMark/);
  });

  it("Load card erase-all and per-room drop stay distinct", () => {
    const hub = readFileSync(join(here, "../components/citadel-hub.tsx"), "utf8");
    const ask = readFileSync(join(here, "../components/hang-ask.tsx"), "utf8");
    const rooms = readFileSync(join(here, "./rooms.ts"), "utf8");
    const cloud = readFileSync(join(here, "../lib/citadel-cloud.ts"), "utf8");
    assert.match(hub, /dropShown\(pack, "all"\)/);
    assert.match(hub, /dropKind="citadel"/);
    assert.match(hub, /dropKind="room"/);
    assert.match(hub, /data-load-rooms/);
    assert.match(hub, /dropArmRef/);
    assert.match(ask, /erase all\?/);
    assert.match(ask, /drop citadel/);
    assert.match(ask, /data-load-drop-kind/);
    assert.match(rooms, /export function dropCitadelAll/);
    assert.match(rooms, /packCitadels\(rows\)/);
    assert.match(cloud, /export const dropGuestCitadel/);
  });
});
