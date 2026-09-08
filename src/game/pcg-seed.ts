/**
 * PCG film-tree rail 1 — run seed, plate/enter hashes, clip cache keys.
 *
 * Not WFC / grammar. Same inputs → same s_i / s_enter.
 *
 * Cook only on confirmed need (existing walk cook / future enter commit).
 * Do not enqueue Imagine on walk-toward-door.
 *
 * Hypothesis (non-binding): session `wish` is a player prompt, last-frame
 * `start` is an Imagine image seed, guest id is a Keep cookie — none of those
 * are the PCG run seed. This rail extends the session with `runSeed`.
 */

/** Imagine-usable hex (64-bit). Cloud bank keys stay under 40 chars as `pcg:` + this. */
export const IMAGINE_SEED_HEX = 16;

const PCG_PREFIX = "pcg:";

function rotr(n: number, x: number) {
  return (x >>> n) | (x << (32 - n));
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c2562, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** Sync SHA-256 — same bytes in Node tests and the hall bundle. */
export function sha256hex(text: string): string {
  const msg = new TextEncoder().encode(text);
  const bitLen = msg.length * 8;
  const withOne = msg.length + 1;
  const pad = (56 - (withOne % 64) + 64) % 64;
  const total = withOne + pad + 8;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[msg.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(total - 4, bitLen >>> 0);

  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < total; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15]!;
      const y = w[i - 2]!;
      const s0 = rotr(7, x) ^ rotr(18, x) ^ (x >>> 3);
      const s1 = rotr(17, y) ^ rotr(19, y) ^ (y >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let a = H[0]!;
    let b = H[1]!;
    let c = H[2]!;
    let d = H[3]!;
    let e = H[4]!;
    let f = H[5]!;
    let g = H[6]!;
    let h = H[7]!;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0]! + a) >>> 0;
    H[1] = (H[1]! + b) >>> 0;
    H[2] = (H[2]! + c) >>> 0;
    H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0;
    H[5] = (H[5]! + f) >>> 0;
    H[6] = (H[6]! + g) >>> 0;
    H[7] = (H[7]! + h) >>> 0;
  }
  let hex = "";
  for (let i = 0; i < 8; i++) hex += H[i]!.toString(16).padStart(8, "0");
  return hex;
}

function token(v: string | number, max = 48): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_\-→←]/g, "")
    .slice(0, max);
}

function plateIndex(i: string | number): string {
  const n = Number(i);
  if (Number.isFinite(n) && n >= 1) return String(Math.max(1, Math.min(8, Math.round(n))));
  return token(i, 12) || "1";
}

/** Living-hall default is `hall`. Never invent asteroid as a title. */
export function livingBiome(explicit?: string | null): string {
  const b = token(explicit || "", 24);
  return b || "hall";
}

export function doorToken(door?: string | null): "a" | "b" {
  const d = String(door || "")
    .trim()
    .toLowerCase();
  if (d === "b" || d === "m2" || d === "right" || d === "gold") return "b";
  return "a";
}

function digest(parts: Array<string | number>): string {
  return sha256hex(parts.map((p) => String(p)).join("\u001f")).slice(0, IMAGINE_SEED_HEX);
}

/** Crypto-random run seed `s`. Created once on New citadel / Play. */
export function mintRunSeed(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else {
    /* Node / test without WebCrypto — still 128 bits of platform entropy when available. */
    for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;
  }
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

export function isRunSeed(v?: string | null): v is string {
  return typeof v === "string" && /^[a-f0-9]{16,64}$/i.test(v.trim());
}

export function keepRunSeed(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    const s = String(c || "")
      .trim()
      .toLowerCase();
    if (isRunSeed(s)) return s;
  }
  return "";
}

export function ensureRunSeed(existing?: string | null): string {
  return keepRunSeed(existing) || mintRunSeed();
}

/** Plate seed `s_i = H(s, i, act, biome)` — Imagine-usable hex string. */
export function plateSeed(s: string, i: string | number, act: string, biome?: string | null): string {
  return digest([keepRunSeed(s) || token(s, 64), plateIndex(i), token(act, 32) || "walk", livingBiome(biome)]);
}

/** Enter seed `s_enter = H(s, i, "enter", biomeFrom, biomeTo, door)`. Ready for later enter cooks. */
export function enterSeed(
  s: string,
  i: string | number,
  biomeFrom?: string | null,
  biomeTo?: string | null,
  door?: string | null,
): string {
  return digest([
    keepRunSeed(s) || token(s, 64),
    plateIndex(i),
    "enter",
    livingBiome(biomeFrom),
    livingBiome(biomeTo),
    doorToken(door),
  ]);
}

export function clipCacheKey(seed: string): string {
  const hex = String(seed || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-f0-9]/g, "")
    .slice(0, IMAGINE_SEED_HEX);
  return hex ? `${PCG_PREFIX}${hex}` : "";
}

export function isPcgCacheKey(key?: string | null): boolean {
  return typeof key === "string" && key.startsWith(PCG_PREFIX) && key.length === PCG_PREFIX.length + IMAGINE_SEED_HEX;
}

export type PcgClip = { url: string; end?: string; start?: string };
export type PcgBank = Map<string, PcgClip> | Iterable<[string, PcgClip]> | Array<{ key: string; url: string; end?: string; start?: string }>;

function bankRows(bank?: PcgBank | null): Array<{ key: string; url: string; end?: string; start?: string }> {
  if (!bank) return [];
  if (Array.isArray(bank)) return bank.filter((b) => b?.key && b.url);
  const out: Array<{ key: string; url: string; end?: string; start?: string }> = [];
  for (const [key, v] of bank as Iterable<[string, PcgClip]>) {
    if (key && v?.url) out.push({ key, url: v.url, end: v.end, start: v.start });
  }
  return out;
}

/** If a cached artifact exists for this s_i / s_enter, play/reuse — do not recook. */
export function cachedClipOf(bank: PcgBank | null | undefined, seedOrKey: string): PcgClip | null {
  const key = seedOrKey.startsWith(PCG_PREFIX) ? seedOrKey : clipCacheKey(seedOrKey);
  if (!key) return null;
  for (const row of bankRows(bank)) {
    if (row.key === key && row.url) return { url: row.url, end: row.end, start: row.start };
  }
  return null;
}

export function rememberCachedClip<T extends { key: string; url: string; end?: string; start?: string }>(
  bank: T[],
  seedOrKey: string,
  clip: PcgClip,
): T[] {
  const key = seedOrKey.startsWith(PCG_PREFIX) ? seedOrKey : clipCacheKey(seedOrKey);
  if (!key || !clip?.url) return bank;
  const next = bank.filter((b) => b.key !== key);
  next.push({ ...(bank[0] || ({} as T)), key, url: clip.url, end: clip.end || "", start: clip.start } as T);
  return next;
}

export function walkAct(from: string, to: string): string {
  return `walk:${token(from, 12)}:${token(to, 12)}`;
}

export function idleAct(node: string): string {
  return `idle:${token(node, 12)}`;
}

/** uint32 for Imagine bodies that want a numeric seed. */
export function imagineSeedInt(seed: string): number {
  const hex = String(seed || "")
    .replace(/[^a-f0-9]/gi, "")
    .slice(0, 8);
  const n = Number.parseInt(hex || "0", 16);
  return Number.isFinite(n) ? n >>> 0 : 0;
}
