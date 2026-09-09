/**
 * Local Hang mp4s — keep File bytes past document unload.
 * Slot fields still show blob: URLs; persist rewrites artefacts to hangblob: keys
 * that hydrate back into live object URLs for /rune play.
 */

import type { HungArtifact } from "./artifacts.ts";

export const HANG_BLOB_PREFIX = "hangblob:";

const DB = "bolt-hang-blobs-v1";
const STORE = "clips";
const VER = 1;

const files = new Map<string, Blob>();
const live = new Map<string, string>();
const fromBlob = new Map<string, string>();

export function isHangBlobKey(u?: string | null): boolean {
  return String(u || "").startsWith(HANG_BLOB_PREFIX);
}

function newId(): string {
  return `hb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function keyId(key: string): string {
  return key.startsWith(HANG_BLOB_PREFIX) ? key.slice(HANG_BLOB_PREFIX.length) : key;
}

/** Remember the File behind a slot blob: URL so Hang can persist it. */
export function rememberHangFile(blobUrl: string, file: Blob): string {
  const url = String(blobUrl || "").trim();
  if (!url.startsWith("blob:")) return "";
  const have = fromBlob.get(url);
  if (have) {
    files.set(have, file);
    live.set(have, url);
    return have;
  }
  const key = `${HANG_BLOB_PREFIX}${newId()}`;
  files.set(key, file);
  live.set(key, url);
  fromBlob.set(url, key);
  return key;
}

/** Live <video> src for a hangblob: key. Empty until hydrated. */
export function hangBlobSrc(u?: string | null): string {
  const raw = String(u || "").trim();
  if (!raw) return "";
  if (raw.startsWith(HANG_BLOB_PREFIX)) return live.get(raw) || "";
  return raw;
}

export function hangBlobKeyOf(u?: string | null): string {
  const raw = String(u || "").trim();
  if (!raw) return "";
  if (raw.startsWith(HANG_BLOB_PREFIX)) return raw;
  return fromBlob.get(raw) || "";
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  try {
    db.close();
  } catch {
    /* */
  }
}

async function idbGet(id: string): Promise<Blob | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  const blob = await new Promise<Blob | undefined>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
  try {
    db.close();
  } catch {
    /* */
  }
  return blob;
}

async function blobOf(url: string): Promise<Blob | undefined> {
  const key = hangBlobKeyOf(url) || (url.startsWith(HANG_BLOB_PREFIX) ? url : "");
  if (key && files.has(key)) return files.get(key);
  if (!url.startsWith("blob:")) return undefined;
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    return await res.blob();
  } catch {
    return undefined;
  }
}

/** Write bytes to IDB. Returns a stable hangblob: key for blob: URLs. */
export async function persistHangUrl(url: string): Promise<string> {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith(HANG_BLOB_PREFIX)) {
    const blob = files.get(raw);
    if (blob) await idbPut(keyId(raw), blob);
    return raw;
  }
  if (!raw.startsWith("blob:")) return raw;
  let key = fromBlob.get(raw);
  const blob = await blobOf(raw);
  if (!blob) return raw;
  if (!key) {
    key = `${HANG_BLOB_PREFIX}${newId()}`;
    fromBlob.set(raw, key);
  }
  files.set(key, blob);
  if (!live.get(key)) live.set(key, raw);
  await idbPut(keyId(key), blob);
  return key;
}

export async function persistHangUrls(urls: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const u of urls) {
    const next = await persistHangUrl(u);
    if (next) map.set(u, next);
  }
  return map;
}

function rewriteOne(u: string, map: Map<string, string>): string {
  if (map.has(u)) return map.get(u) || u;
  if (u.startsWith("blob:")) return hangBlobKeyOf(u) || u;
  return u;
}

export function collectHungUrls(arts: HungArtifact[] = []): string[] {
  const out: string[] = [];
  for (const a of arts) {
    for (const u of [a.still, a.room?.still, a.room?.trans, ...(a.playlist || [])]) {
      if (u) out.push(u);
    }
  }
  return out;
}

export function rewriteHungBlobKeys(arts: HungArtifact[] = [], map: Map<string, string> = new Map()): HungArtifact[] {
  let changed = false;
  const next = arts.map((a) => {
    const playlist = (a.playlist || []).map((u) => rewriteOne(u, map));
    const still = a.still ? rewriteOne(a.still, map) : a.still;
    const trans = a.room?.trans ? rewriteOne(a.room.trans, map) : a.room?.trans;
    const roomStill = a.room?.still ? rewriteOne(a.room.still, map) : a.room?.still;
    const playDiff = playlist.some((u, i) => u !== (a.playlist || [])[i]);
    if (!playDiff && still === a.still && trans === a.room?.trans && roomStill === a.room?.still) return a;
    changed = true;
    return {
      ...a,
      playlist,
      still,
      room: a.room ? { ...a.room, trans, still: roomStill || a.room.still } : a.room,
    };
  });
  return changed ? next : arts;
}

export async function persistAndRewriteHung(arts: HungArtifact[] = []): Promise<HungArtifact[]> {
  const urls = collectHungUrls(arts).filter((u) => u.startsWith("blob:") || isHangBlobKey(u));
  if (!urls.length) return arts;
  const map = await persistHangUrls(urls);
  return rewriteHungBlobKeys(arts, map);
}

export async function hydrateHangBlobs(urls: string[] = []): Promise<void> {
  const keys = [...new Set(urls.filter(isHangBlobKey))];
  for (const key of keys) {
    if (live.get(key)) continue;
    let blob = files.get(key);
    if (!blob) blob = await idbGet(keyId(key));
    if (!blob) continue;
    files.set(key, blob);
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") continue;
    const url = URL.createObjectURL(blob);
    live.set(key, url);
    fromBlob.set(url, key);
  }
}

export async function hydrateHungArtifacts(arts: HungArtifact[] = []): Promise<HungArtifact[]> {
  await hydrateHangBlobs(collectHungUrls(arts));
  return arts;
}

/** Tests / unmount — drop in-memory maps. IDB stays. */
export function resetHangBlobs(): void {
  files.clear();
  live.clear();
  fromBlob.clear();
}
