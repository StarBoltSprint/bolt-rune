/**
 * Server-only seat-secret bag: Grok Build Clés secrètes, runtime env, and
 * `.grok` files. Never VITE_*. Shared by the Vite bake plugin and the hop.
 */
export const SEAT_SECRET_KEYS = [
  "DOOR_WAKE_URL",
  "SMOKE_WAKE_URL",
  "COOK_WAKE_URL",
  "CONTINUITY_WAKE_URL",
  "DOOR_BOT_ID",
  "SMOKE_BOT_ID",
  "COOK_BOT_ID",
  "CONTINUITY_BOT_ID",
  "DOOR_CHAT_WAKE_SECRET",
];

export const SEAT_SECRET_FILES = [
  ".grok/secrets.json",
  ".grok/app-secrets.json",
  ".grok/app-env.json",
  ".grok/cles.json",
  ".grok/keys.json",
  "data/secrets.json",
];

export const SEAT_SECRET_JSON_ENV = [
  "GROK_SECRETS",
  "GROK_APP_SECRETS",
  "GROK_SECRET_KEYS",
  "APP_SECRETS",
  "SEAT_SECRETS",
];

const VITE_PREFIX = "VITE_";

export function isClientEnvKey(key) {
  return String(key || "").startsWith(VITE_PREFIX);
}

export function keyAliases(key) {
  const k = String(key || "").trim();
  if (!k) return [];
  const camel = k.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return [k, `GROK_${k}`, `GROK_SECRET_${k}`, `SECRET_${k}`, camel, k.toLowerCase()];
}

function text(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function takeNested(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return text(value);
  return text(value.value ?? value.url ?? value.secret ?? value.key ?? "");
}

/** Flatten a Clés secrètes / secrets document into a bag. Drops VITE_*. */
export function parseSecretDocument(raw) {
  const bag = {};
  if (raw == null) return bag;
  let parsed = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return bag;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return bag;
    }
  }
  if (Array.isArray(parsed)) {
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const name = text(row.name ?? row.key ?? row.id);
      const value = takeNested(row);
      if (name && value && !isClientEnvKey(name)) bag[name] = value;
    }
    return bag;
  }
  if (!parsed || typeof parsed !== "object") return bag;
  const nested = parsed.secrets ?? parsed.keys ?? parsed.cles ?? parsed.env ?? parsed.values;
  if (nested && typeof nested === "object" && !Array.isArray(nested) && nested !== parsed) {
    Object.assign(bag, parseSecretDocument(nested));
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (isClientEnvKey(key)) continue;
    if (key === "secrets" || key === "keys" || key === "cles" || key === "env" || key === "values") continue;
    const v = takeNested(value);
    if (v) bag[key] = v;
  }
  return bag;
}

export function mergeSecretBags(...bags) {
  const out = {};
  for (const bag of bags) {
    if (!bag || typeof bag !== "object") continue;
    for (const [key, value] of Object.entries(bag)) {
      if (isClientEnvKey(key)) continue;
      const v = text(value);
      if (v) out[key] = v;
    }
  }
  return out;
}

export function pickSecret(bag, key) {
  if (!bag || typeof bag !== "object") return "";
  const aliases = keyAliases(key);
  for (const alias of aliases) {
    const v = text(bag[alias]);
    if (v && !isClientEnvKey(alias)) return v;
  }
  const want = new Set(aliases.map((a) => a.toLowerCase()));
  for (const [name, value] of Object.entries(bag)) {
    if (isClientEnvKey(name)) continue;
    if (want.has(String(name).toLowerCase())) {
      const v = text(value);
      if (v) return v;
    }
  }
  return "";
}

export function seatSecretSlice(bag) {
  const out = {};
  for (const key of SEAT_SECRET_KEYS) {
    const v = pickSecret(bag, key);
    if (v) out[key] = v;
  }
  return out;
}

export function bagFromProcessEnv(env) {
  if (!env || typeof env !== "object") return {};
  const bag = {};
  for (const [key, value] of Object.entries(env)) {
    if (isClientEnvKey(key)) continue;
    const v = text(value);
    if (v) bag[key] = v;
  }
  for (const blobKey of SEAT_SECRET_JSON_ENV) {
    Object.assign(bag, parseSecretDocument(env[blobKey]));
  }
  return bag;
}

export function readSecretFileText(root, rel, readFile) {
  try {
    return readFile(rel, root);
  } catch {
    return "";
  }
}

export function bagFromSecretFiles(root, readFile) {
  const bags = [];
  for (const rel of SEAT_SECRET_FILES) {
    const raw = readSecretFileText(root, rel, readFile);
    if (raw) bags.push(parseSecretDocument(raw));
  }
  return mergeSecretBags(...bags);
}

/**
 * Build-time snapshot: process.env as the Grok builder left it, plus any
 * `.grok` secret files on the workspace. Used to bake values into the server
 * bundle when Vercel runtime env never receives Clés secrètes.
 */
export function snapshotSeatSecrets(root, processEnv, readFile) {
  return seatSecretSlice(
    mergeSecretBags(bagFromSecretFiles(root, readFile), bagFromProcessEnv(processEnv)),
  );
}
