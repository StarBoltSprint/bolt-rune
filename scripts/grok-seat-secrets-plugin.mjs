/**
 * Bake Grok Build seat secrets into a server-only virtual module.
 *
 * Clés secrètes often exist at `vite build` (workspace `.grok/*` + builder env)
 * but never land on the Vercel function as `process.env.SMOKE_WAKE_URL`.
 * Importing this module from a `.server.ts` file keeps the values off the client.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { snapshotSeatSecrets } from "./grok-seat-secrets.mjs";

export const SEAT_SECRETS_ID = "virtual:seat-secrets";

function readUtf8(rel, root) {
  return readFileSync(join(root, rel), "utf8");
}

export function bakeSeatSecretsModule(root, processEnv = process.env) {
  const baked = snapshotSeatSecrets(root, processEnv, readUtf8);
  return `export const BAKED_SEAT_SECRETS = ${JSON.stringify(baked)};\n`;
}

export function grokSeatSecretsPlugin() {
  let root = process.cwd();
  return {
    name: "bolt:grok-seat-secrets",
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      if (id === SEAT_SECRETS_ID) return `\0${SEAT_SECRETS_ID}`;
    },
    load(id) {
      if (id !== `\0${SEAT_SECRETS_ID}`) return;
      return bakeSeatSecretsModule(root);
    },
  };
}
