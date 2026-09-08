import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bagFromProcessEnv,
  isClientEnvKey,
  keyAliases,
  parseSecretDocument,
  pickSecret,
  seatSecretSlice,
  snapshotSeatSecrets,
} from "./grok-seat-secrets.mjs";
import { bakeSeatSecretsModule } from "./grok-seat-secrets-plugin.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);

describe("grok seat secrets", () => {
  it("never treats VITE_ keys as seat secrets", () => {
    assert.equal(isClientEnvKey("VITE_SMOKE_WAKE_URL"), true);
    assert.equal(isClientEnvKey("SMOKE_WAKE_URL"), false);
    const bag = parseSecretDocument({
      VITE_SMOKE_WAKE_URL: "https://leak.example/smoke",
      SMOKE_WAKE_URL: "https://wake.example/smoke",
    });
    assert.equal(bag.VITE_SMOKE_WAKE_URL, undefined);
    assert.equal(bag.SMOKE_WAKE_URL, "https://wake.example/smoke");
    assert.equal(pickSecret({ VITE_SMOKE_WAKE_URL: "https://leak.example/x" }, "SMOKE_WAKE_URL"), "");
  });

  it("reads Clés secrètes shapes and Grok aliases", () => {
    assert.deepEqual(parseSecretDocument({ GROK_SMOKE_WAKE_URL: "https://w.example/s" }), {
      GROK_SMOKE_WAKE_URL: "https://w.example/s",
    });
    assert.equal(pickSecret({ GROK_SMOKE_WAKE_URL: "https://w.example/s" }, "SMOKE_WAKE_URL"), "https://w.example/s");
    assert.equal(
      pickSecret(
        parseSecretDocument([{ name: "DOOR_WAKE_URL", value: "https://w.example/d" }]),
        "DOOR_WAKE_URL",
      ),
      "https://w.example/d",
    );
    assert.equal(
      pickSecret(parseSecretDocument({ secrets: { smokeWakeUrl: "https://w.example/s2" } }), "SMOKE_WAKE_URL"),
      "https://w.example/s2",
    );
    assert.ok(keyAliases("SMOKE_WAKE_URL").includes("GROK_SECRET_SMOKE_WAKE_URL"));
  });

  it("unwraps GROK_SECRETS JSON blobs from process env", () => {
    const bag = bagFromProcessEnv({
      GROK_SECRETS: JSON.stringify({ SMOKE_WAKE_URL: "https://blob.example/s" }),
      VITE_SMOKE_WAKE_URL: "https://leak.example/s",
    });
    assert.equal(pickSecret(bag, "SMOKE_WAKE_URL"), "https://blob.example/s");
    assert.equal(bag.VITE_SMOKE_WAKE_URL, undefined);
  });

  it("snapshots workspace files + builder env into the seat slice", () => {
    const files = {
      ".grok/app-env.json": JSON.stringify({
        VITE_AUTH_ENABLED: "true",
        SMOKE_WAKE_URL: "https://file.example/smoke",
      }),
    };
    const snap = snapshotSeatSecrets(
      "/workspace",
      { DOOR_WAKE_URL: "https://env.example/door" },
      (rel) => files[rel] || "",
    );
    assert.equal(snap.SMOKE_WAKE_URL, "https://file.example/smoke");
    assert.equal(snap.DOOR_WAKE_URL, "https://env.example/door");
    assert.equal(snap.VITE_AUTH_ENABLED, undefined);
    assert.deepEqual(seatSecretSlice({ SMOKE_WAKE_URL: "https://x.example/s", OTHER: "nope" }), {
      SMOKE_WAKE_URL: "https://x.example/s",
    });
  });

  it("bakes a server-only virtual module without VITE_ keys", () => {
    const js = bakeSeatSecretsModule(root, { SMOKE_WAKE_URL: "https://bake.example/s", VITE_SMOKE_WAKE_URL: "no" });
    assert.match(js, /BAKED_SEAT_SECRETS/);
    assert.match(js, /https:\/\/bake\.example\/s/);
    assert.doesNotMatch(js, /VITE_SMOKE_WAKE_URL/);
  });

  it("vite + hop use the server loader; client door-chat never reads process.env", () => {
    const vite = readFileSync(join(root, "vite.config.ts"), "utf8");
    const hop = readFileSync(join(root, "src/routes/api/door-chat.ts"), "utf8");
    const shared = readFileSync(join(root, "src/game/door-chat.ts"), "utf8");
    const server = readFileSync(join(root, "src/game/door-chat-env.server.ts"), "utf8");
    const line = readFileSync(join(root, "src/components/door-chat-line.tsx"), "utf8");
    assert.match(vite, /grokSeatSecretsPlugin/);
    assert.match(hop, /loadSeatSecretEnv/);
    assert.match(hop, /resolveSeatWake\(id, env\)/);
    assert.match(hop, /resolveHopWakeUrl/);
    assert.match(hop, /wakeDebug/);
    assert.match(hop, /inspectSeatWakeDebug/);
    assert.match(server, /virtual:seat-secrets/);
    assert.match(server, /inspectSeatWakeDebug/);
    assert.match(server, /globalThis/);
    assert.match(server, /process\.env\.SMOKE_WAKE_URL/);
    assert.doesNotMatch(server, /VITE_SMOKE_WAKE_URL|VITE_DOOR_WAKE_URL/);
    assert.doesNotMatch(shared, /process\.env[.\[]|=\s*process\.env\b/);
    assert.doesNotMatch(line, /process\.env|VITE_SMOKE|loadSeatSecretEnv/);
  });
});
