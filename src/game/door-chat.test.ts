import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTINUITY_BOT_ID,
  COOK_BOT_ID,
  DIRECTOR_FALLBACK,
  DOOR_BOT_ID,
  DOOR_CHAT_HOP,
  HALL_SEAT_IDS,
  HALL_SEATS,
  PACK_SKILL,
  SMOKE_BOT_ID,
  cleanDoorLine,
  doorChatPayload,
  hopDoorChat,
  isHallSeat,
  isHttpWakeUrl,
  ownerWakeStorageKey,
  publicRoster,
  publicSeat,
  readOwnerWakeUrl,
  readWakeReply,
  resolveHopWakeUrl,
  resolveSeatWake,
  seatWakeDebugFlags,
  unwiredDirectorFallback,
  unwiredFrost,
  wakeFileOf,
  wakeUrlKind,
  writeOwnerWakeUrl,
} from "./door-chat.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");

function wakeJson(name: (typeof HALL_SEAT_IDS)[number]) {
  return JSON.parse(readFileSync(join(here, "../../public/seats", `${name}.wake.json`), "utf8")) as {
    seat: string;
    role: string;
    botId: string;
    wakeEnv: string;
    hop: string;
    label: string;
    brief: string;
  };
}

describe("hall door-chat seats", () => {
  it("packs Door + Smoke + Cook + Continuity with Citadel bot ids and one hop", () => {
    assert.deepEqual([...HALL_SEAT_IDS], ["door", "smoke", "cook", "continuity"]);
    assert.equal(HALL_SEATS.door.botId, DOOR_BOT_ID);
    assert.equal(HALL_SEATS.smoke.botId, SMOKE_BOT_ID);
    assert.equal(HALL_SEATS.cook.botId, COOK_BOT_ID);
    assert.equal(HALL_SEATS.continuity.botId, CONTINUITY_BOT_ID);
    assert.equal(DOOR_BOT_ID, "002bcd41-29f7-4cf0-9eba-d67fad9fa3f6");
    assert.equal(SMOKE_BOT_ID, "0d69dbc8-a28a-4bb6-b53b-2d50d0329af9");
    assert.equal(COOK_BOT_ID, "2a8e88a2-3c88-41c3-b489-1c4a4a7c43d8");
    assert.equal(CONTINUITY_BOT_ID, "efba9930-f946-4caf-a7a7-b50580047c51");
    assert.equal(HALL_SEATS.door.role, "say");
    assert.equal(HALL_SEATS.smoke.role, "gate");
    assert.equal(HALL_SEATS.cook.role, "cook");
    assert.equal(HALL_SEATS.continuity.role, "continuity");
    assert.equal(DOOR_CHAT_HOP, "/api/door-chat");
    assert.equal(PACK_SKILL, "/pack/skill.md");
    assert.deepEqual(publicSeat("door"), {
      id: "door",
      label: "Door",
      role: "say",
      botId: DOOR_BOT_ID,
      hop: DOOR_CHAT_HOP,
      wakeFile: "/seats/door.wake.json",
      brief: "say",
    });
    const roster = publicRoster();
    assert.equal(roster.seats.length, 4);
    assert.equal(roster.owner, "smir");
    assert.equal(roster.mesh, false);
    assert.equal(roster.pack, PACK_SKILL);
    assert.deepEqual(
      roster.seats.map((s) => s.id),
      ["door", "smoke", "cook", "continuity"],
    );
    assert.ok(isHallSeat("door"));
    assert.ok(isHallSeat("smoke"));
    assert.ok(isHallSeat("cook"));
    assert.ok(isHallSeat("continuity"));
    assert.equal(isHallSeat("scenario"), false);
    assert.equal(isHallSeat("gamify"), false);
  });

  it("wake files match seat grammar and never hold a URL", () => {
    for (const id of HALL_SEAT_IDS) {
      const file = wakeJson(id);
      const expected = wakeFileOf(id);
      assert.equal(file.seat, expected.seat);
      assert.equal(file.role, expected.role);
      assert.equal(file.botId, expected.botId);
      assert.equal(file.wakeEnv, expected.wakeEnv);
      assert.equal(file.hop, expected.hop);
      assert.equal(file.brief, expected.brief);
      assert.doesNotMatch(JSON.stringify(file), /https?:\/\//);
      assert.doesNotMatch(JSON.stringify(file), /XAI_API_KEY|wallet|private|SuperGrok/i);
    }
  });

  it("resolves wake URLs server-side only; env can retarget bot ids", () => {
    const dry = resolveSeatWake("door", {});
    assert.equal(dry.wired, false);
    assert.equal(dry.wakeUrl, "");
    assert.equal(dry.botId, DOOR_BOT_ID);
    const live = resolveSeatWake("cook", {
      COOK_WAKE_URL: "https://wake.example/cook",
      COOK_BOT_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
    assert.equal(live.wired, true);
    assert.equal(live.wakeUrl, "https://wake.example/cook");
    assert.equal(live.botId, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    assert.equal(isHttpWakeUrl("not-a-url"), false);
    assert.equal(isHttpWakeUrl("ftp://x"), false);
    assert.equal(isHttpWakeUrl("https://ok.example/w"), true);
    assert.equal(wakeUrlKind(""), "empty");
    assert.equal(wakeUrlKind("   "), "empty");
    assert.equal(wakeUrlKind("grok://bot/smoke"), "non-http");
    assert.equal(wakeUrlKind("https://ok.example/w"), "http");
  });

  it("owner paste stores http wake URLs per seat and never a VITE_ key", () => {
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k: string, v: string) => {
        mem.set(k, String(v));
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
    };
    assert.equal(ownerWakeStorageKey("smoke"), "SMOKE_WAKE_URL");
    assert.equal(ownerWakeStorageKey("door"), "DOOR_WAKE_URL");
    assert.equal(ownerWakeStorageKey("cook"), "COOK_WAKE_URL");
    assert.equal(ownerWakeStorageKey("continuity"), "CONTINUITY_WAKE_URL");
    assert.equal(writeOwnerWakeUrl("continuity", "grok://sidebar", store), "");
    assert.equal(readOwnerWakeUrl("continuity", store), "");
    assert.equal(writeOwnerWakeUrl("cook", "https://wake.example/cook", store), "https://wake.example/cook");
    assert.equal(readOwnerWakeUrl("cook", store), "https://wake.example/cook");
    assert.equal(mem.get("COOK_WAKE_URL"), "https://wake.example/cook");
    assert.equal(writeOwnerWakeUrl("cook", "", store), "");
    assert.equal(mem.has("COOK_WAKE_URL"), false);
    for (const id of HALL_SEAT_IDS) assert.doesNotMatch(ownerWakeStorageKey(id), /^VITE_/);
  });

  it("hop uses owner paste only when server has no http wake URL", () => {
    assert.deepEqual(resolveHopWakeUrl("https://env.example/s", "https://owner.example/s"), {
      wakeUrl: "https://env.example/s",
      wired: true,
      from: "server",
    });
    assert.deepEqual(resolveHopWakeUrl("", "https://owner.example/s"), {
      wakeUrl: "https://owner.example/s",
      wired: true,
      from: "owner",
    });
    assert.deepEqual(resolveHopWakeUrl("grok://sidebar", "https://owner.example/s"), {
      wakeUrl: "https://owner.example/s",
      wired: true,
      from: "owner",
    });
    assert.deepEqual(resolveHopWakeUrl("", "not-a-url"), { wakeUrl: "", wired: false, from: "none" });
    assert.deepEqual(resolveHopWakeUrl("", ""), { wakeUrl: "", wired: false, from: "none" });
  });

  it("unwired hop points at Director SendToAgent — never demands a paste", () => {
    const dry = unwiredDirectorFallback("smoke");
    assert.equal(dry.ok, false);
    assert.equal(dry.error, "wake-unwired");
    assert.equal(dry.wired, false);
    assert.equal(dry.fallback, DIRECTOR_FALLBACK);
    assert.match(dry.fallback || "", /Exécution de test/);
    assert.match(dry.fallback || "", /SendToAgent/);
    assert.equal(unwiredFrost("smoke"), `Smoke · ${DIRECTOR_FALLBACK}`);
    assert.doesNotMatch(unwiredFrost("smoke"), /point wake URL|paste required/i);
  });

  it("wakeDebug flags never include a URL", () => {
    const flags = seatWakeDebugFlags({
      resolved: "grok://sidebar",
      live: "",
      inlined: "",
      baked: "",
      disk: "grok://sidebar",
    });
    assert.deepEqual(flags, {
      wired: false,
      hasLive: false,
      hasInlined: false,
      hasBaked: false,
      hasDisk: true,
      urlKind: "non-http",
    });
    assert.doesNotMatch(JSON.stringify(flags), /https?:\/\/|grok:\/\//);
    assert.deepEqual(
      seatWakeDebugFlags({
        resolved: "https://wake.example/s",
        live: "https://wake.example/s",
        inlined: "",
        baked: "",
        disk: "",
      }),
      { wired: true, hasLive: true, hasInlined: false, hasBaked: false, hasDisk: false, urlKind: "http" },
    );
  });

  it("packs one hop line and reads PASS/FAIL replies", () => {
    assert.equal(cleanDoorLine("  walk  gate  "), "walk gate");
    assert.deepEqual(doorChatPayload({ seat: "door", text: "   " }), { ok: false, error: "empty" });
    const packed = doorChatPayload({ seat: "smoke", text: "walk / breath / biome", source: "director" });
    assert.equal(packed.ok, true);
    if (!packed.ok) return;
    assert.equal(packed.body.seat, "smoke");
    assert.equal(packed.body.source, "director");
    assert.equal(packed.body.botId, SMOKE_BOT_ID);
    assert.equal(packed.body.wakeUrl, undefined);
    const cook = doorChatPayload({ seat: "cook", text: HALL_SEATS.cook.brief, source: "hall" });
    assert.equal(cook.ok, true);
    if (!cook.ok) return;
    assert.equal(cook.body.botId, COOK_BOT_ID);
    const owner = doorChatPayload({
      seat: "continuity",
      text: "hold the cut",
      wakeUrl: "https://owner.example/c",
    });
    assert.equal(owner.ok, true);
    if (!owner.ok) return;
    assert.equal(owner.body.wakeUrl, "https://owner.example/c");
    const junk = doorChatPayload({ seat: "smoke", text: "walk", wakeUrl: "grok://sidebar" });
    assert.equal(junk.ok, true);
    if (!junk.ok) return;
    assert.equal(junk.body.wakeUrl, undefined);
    assert.equal(readWakeReply({ reply: "PASS · walk" }), "PASS · walk");
    assert.equal(readWakeReply({ result: "FAIL · breath" }), "FAIL · breath");
    assert.equal(readWakeReply("  ok  "), "ok");
  });

  it("client hop posts only seat + text — no key, no wallet", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      return new Response(JSON.stringify({ ok: true, seat: "door", wired: true, reply: "heard" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const got = await hopDoorChat("door", "hello hall", "hall", fake);
    assert.deepEqual(got, { ok: true, seat: "door", wired: true, reply: "heard" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, DOOR_CHAT_HOP);
    const body = String(calls[0].init.body || "");
    assert.match(body, /"seat":"door"/);
    assert.match(body, /"text":"hello hall"/);
    assert.doesNotMatch(body, /XAI_API_KEY|WAKE_URL|wallet/i);
  });

  it("client hop sends owner wakeUrl only when held", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      return new Response(JSON.stringify({ ok: true, seat: "smoke", wired: true, reply: "PASS" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const got = await hopDoorChat("smoke", "walk / breath / biome", "hall", fake, "https://owner.example/s");
    assert.equal(got.ok, true);
    const body = String(calls[0].init.body || "");
    assert.match(body, /"seat":"smoke"/);
    assert.match(body, /"wakeUrl":"https:\/\/owner.example\/s"/);
    const dry = await hopDoorChat("smoke", "walk / breath / biome", "hall", fake, "");
    assert.doesNotMatch(String(calls[1].init.body || ""), /wakeUrl/);
    assert.equal(dry.ok, true);
  });

  it("client hop surfaces Director fallback when the server is unwired", async () => {
    const fake: typeof fetch = async () =>
      new Response(JSON.stringify(unwiredDirectorFallback("smoke")), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    const got = await hopDoorChat("smoke", "walk / breath / biome", "director", fake, "");
    assert.equal(got.ok, false);
    if (got.ok) return;
    assert.equal(got.error, "wake-unwired");
    assert.equal(got.fallback, DIRECTOR_FALLBACK);
  });
});

describe("hall door-chat wiring", () => {
  it("Hang/play hall mounts in-picture SmiR pack, not a wallet sheet", () => {
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const vault = readFileSync(join(here, "../components/vault-hall.tsx"), "utf8");
    const line = readFileSync(join(here, "../components/door-chat-line.tsx"), "utf8");
    const hop = readFileSync(join(here, "../routes/api/door-chat.ts"), "utf8");
    assert.match(engine, /<DoorChatLine where="hall"/);
    assert.match(engine, /<DoorChatLine where="play"/);
    assert.match(engine, /data-hall-seats/);
    assert.match(vault, /<DoorChatLine where="play"/);
    assert.match(line, /data-seat=\{id\}/);
    assert.match(line, /data-seat-open=/);
    assert.match(line, /data-seat-director/);
    assert.match(line, /hopDoorChat/);
    assert.match(line, /HALL_SEATS\[next\]\.brief/);
    assert.doesNotMatch(line, /Connect Wallet|XAI_API_KEY|wallet|freebots/i);
    assert.doesNotMatch(line, /VITE_SMOKE_WAKE_URL|VITE_DOOR_WAKE_URL|process\.env/);
    assert.doesNotMatch(engine, /Connect Wallet/);
    assert.doesNotMatch(vault, /Connect Wallet/);
    assert.match(hop, /loadSeatSecretEnv/);
    assert.match(hop, /resolveSeatWake/);
    assert.match(hop, /resolveHopWakeUrl/);
    assert.match(hop, /inspectSeatWakeDebug/);
    assert.match(hop, /wakeDebug/);
    assert.match(hop, /unwiredDirectorFallback/);
    assert.match(hop, /PACK_SKILL/);
    assert.match(hop, /rec\.wakeUrl/);
    assert.match(hop, /Authorization/);
    assert.doesNotMatch(hop, /Connect Wallet|wallet/i);
    assert.doesNotMatch(hop, /process\.env\.XAI_API_KEY/);
    assert.doesNotMatch(hop, /VITE_SMOKE_WAKE_URL|VITE_DOOR_WAKE_URL/);
  });

  it("four seats live in a closed top seat sheet — tap wakes, paste is optional, no bottom row", () => {
    const line = readFileSync(join(here, "../components/door-chat-line.tsx"), "utf8");
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    assert.match(line, /const \[sheet, setSheet\] = useState\(false\)/);
    assert.match(line, /data-seat-sheet=\{sheet \? "open" : "closed"\}/);
    assert.match(line, /data-seat-handle/);
    assert.match(line, /data-seat-close/);
    assert.match(line, /data-seat-dismiss/);
    assert.match(line, /data-seat-panel/);
    assert.match(line, /data-seat-roster/);
    assert.match(line, /data-seat-director/);
    assert.match(line, /optional https/);
    assert.match(line, /DIRECTOR_FALLBACK/);
    assert.match(line, /unwiredFrost/);
    assert.match(line, /safe-area-inset-top/);
    assert.doesNotMatch(line, /safe-area-inset-bottom/);
    assert.doesNotMatch(line, /bottom: top != null/);
    assert.doesNotMatch(line, /point wake URL/);
    assert.match(engine, /<DoorChatLine where="hall" box=\{picBox\}/);
    assert.doesNotMatch(engine, /livingChrome \? `\$\{livingChrome\.keeper\}/);
    assert.doesNotMatch(engine, /Room N • Door A Play Sprint/);
    assert.match(stage, /if \(holdHall \|\| holdDoor\) return null/);
    assert.match(stage, /Resonance/);
  });
});

describe("SmiR pack skill", () => {
  it("public pack skill names the four seats, no foreign SuperGrok, Asteroid HOLD", () => {
    const skill = readFileSync(join(root, "public/pack/skill.md"), "utf8");
    const alias = readFileSync(join(root, "public/pack-skill.md"), "utf8");
    const readme = readFileSync(join(root, "README.md"), "utf8");
    for (const body of [skill, alias, readme]) {
      assert.match(body, /Door/);
      assert.match(body, /Smoke/);
      assert.match(body, /Cook/);
      assert.match(body, /Continuity/);
      assert.match(body, /002bcd41-29f7-4cf0-9eba-d67fad9fa3f6/);
      assert.match(body, /0d69dbc8-a28a-4bb6-b53b-2d50d0329af9/);
      assert.match(body, /2a8e88a2-3c88-41c3-b489-1c4a4a7c43d8/);
      assert.match(body, /efba9930-f946-4caf-a7a7-b50580047c51/);
      assert.match(body, /Asteroid HOLD/);
      assert.match(body, /SendToAgent/);
      assert.match(body, /Exécution de test/);
    }
    assert.match(skill, /freebots-style/);
    assert.match(skill, /do \*\*not\*\* join freebots\.lol/);
    assert.match(skill, /Other humans and other bots must never/);
    assert.match(skill, /hall stills/);
    assert.match(skill, /classic/);
    assert.match(skill, /1\.5 later/);
    assert.match(skill, /Do \*\*not\*\* require a paste|Do \*\*not\*\* wait on a paste/);
    assert.match(skill, /No Connect Wallet/);
    assert.match(alias, /\/pack\/skill\.md/);
  });
});
