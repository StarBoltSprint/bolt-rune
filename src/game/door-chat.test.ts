import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOOR_BOT_ID,
  DOOR_CHAT_HOP,
  HALL_SEATS,
  SMOKE_BOT_ID,
  cleanDoorLine,
  doorChatPayload,
  hopDoorChat,
  isHallSeat,
  isHttpWakeUrl,
  publicRoster,
  publicSeat,
  readWakeReply,
  resolveSeatWake,
  wakeFileOf,
} from "./door-chat.ts";

const here = dirname(fileURLToPath(import.meta.url));

function wakeJson(name: "door" | "smoke") {
  return JSON.parse(readFileSync(join(here, "../../public/seats", `${name}.wake.json`), "utf8")) as {
    seat: string;
    role: string;
    botId: string;
    wakeEnv: string;
    hop: string;
    label: string;
  };
}

describe("hall door-chat seats", () => {
  it("seats Door + Smoke with Citadel bot ids and one hop", () => {
    assert.equal(HALL_SEATS.door.botId, DOOR_BOT_ID);
    assert.equal(HALL_SEATS.smoke.botId, SMOKE_BOT_ID);
    assert.equal(DOOR_BOT_ID, "002bcd41-29f7-4cf0-9eba-d67fad9fa3f6");
    assert.equal(SMOKE_BOT_ID, "0d69dbc8-a28a-4bb6-b53b-2d50d0329af9");
    assert.equal(HALL_SEATS.door.role, "say");
    assert.equal(HALL_SEATS.smoke.role, "gate");
    assert.equal(DOOR_CHAT_HOP, "/api/door-chat");
    assert.deepEqual(publicSeat("door"), {
      id: "door",
      label: "Door",
      role: "say",
      botId: DOOR_BOT_ID,
      hop: DOOR_CHAT_HOP,
      wakeFile: "/seats/door.wake.json",
    });
    assert.equal(publicRoster().seats.length, 2);
    assert.ok(isHallSeat("door"));
    assert.ok(isHallSeat("smoke"));
    assert.equal(isHallSeat("cook"), false);
  });

  it("wake files match seat grammar and never hold a URL", () => {
    for (const id of ["door", "smoke"] as const) {
      const file = wakeJson(id);
      const expected = wakeFileOf(id);
      assert.equal(file.seat, expected.seat);
      assert.equal(file.role, expected.role);
      assert.equal(file.botId, expected.botId);
      assert.equal(file.wakeEnv, expected.wakeEnv);
      assert.equal(file.hop, expected.hop);
      assert.doesNotMatch(JSON.stringify(file), /https?:\/\//);
      assert.doesNotMatch(JSON.stringify(file), /XAI_API_KEY|wallet|private/i);
    }
  });

  it("resolves wake URLs server-side only; env can retarget bot ids", () => {
    const dry = resolveSeatWake("door", {});
    assert.equal(dry.wired, false);
    assert.equal(dry.wakeUrl, "");
    assert.equal(dry.botId, DOOR_BOT_ID);
    const live = resolveSeatWake("smoke", {
      SMOKE_WAKE_URL: "https://wake.example/smoke",
      SMOKE_BOT_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
    assert.equal(live.wired, true);
    assert.equal(live.wakeUrl, "https://wake.example/smoke");
    assert.equal(live.botId, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    assert.equal(isHttpWakeUrl("not-a-url"), false);
    assert.equal(isHttpWakeUrl("ftp://x"), false);
    assert.equal(isHttpWakeUrl("https://ok.example/w"), true);
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
});

describe("hall door-chat wiring", () => {
  it("Hang/play hall mounts in-picture Door + Smoke, not a wallet sheet", () => {
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
    assert.match(line, /hopDoorChat/);
    assert.doesNotMatch(line, /Connect Wallet|XAI_API_KEY|DOOR_WAKE_URL|wallet/i);
    assert.doesNotMatch(engine, /Connect Wallet/);
    assert.doesNotMatch(vault, /Connect Wallet/);
    assert.match(hop, /resolveSeatWake/);
    assert.match(hop, /wakeUrl/);
    assert.match(hop, /Authorization/);
    assert.doesNotMatch(hop, /Connect Wallet|wallet/i);
    assert.doesNotMatch(hop, /process\.env\.XAI_API_KEY/);
  });

  it("Door + Smoke live in a closed top seat sheet — no bottom row, no Room N header", () => {
    const line = readFileSync(join(here, "../components/door-chat-line.tsx"), "utf8");
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const stage = readFileSync(join(here, "../components/film-stage.tsx"), "utf8");
    assert.match(line, /const \[sheet, setSheet\] = useState\(false\)/);
    assert.match(line, /data-seat-sheet=\{sheet \? "open" : "closed"\}/);
    assert.match(line, /data-seat-handle/);
    assert.match(line, /data-seat-close/);
    assert.match(line, /data-seat-dismiss/);
    assert.match(line, /data-seat-panel/);
    assert.match(line, /safe-area-inset-top/);
    assert.doesNotMatch(line, /safe-area-inset-bottom/);
    assert.doesNotMatch(line, /bottom: top != null/);
    assert.match(line, /hopDoorChat/);
    assert.match(engine, /<DoorChatLine where="hall" box=\{picBox\}/);
    assert.doesNotMatch(engine, /livingChrome \? `\$\{livingChrome\.keeper\}/);
    assert.doesNotMatch(engine, /Room N • Door A Play Sprint/);
    assert.match(stage, /if \(holdHall \|\| holdDoor\) return null/);
    assert.match(stage, /Resonance/);
  });
});
