/**
 * Hang import — player-owned Imagine videos as hall room refs.
 * Human Hang wins stock. Continuity FAIL + KEEP is a flag, not a block.
 * Roles key the pose SM / plate graph (spawn | atA | atB). Asteroid HOLD.
 */

import type { HungArtifact, HungRoom } from "./artifacts.ts";
import type { CitadelPose, PoseClipId, PoseClipShelf } from "./pcg-pose.ts";
import { playableClipSrc } from "./play-clip.ts";
type HangSmoke = { smoke?: string; reasons?: string[] } | null | undefined;

function firstHungUrl(art: Pick<HungArtifact, "playlist" | "still" | "room">): string {
  for (const raw of [...(art.playlist || []), art.room?.trans, art.still]) {
    const u = String(raw || "").trim();
    if (!u) continue;
    if (u.startsWith("blob:") || u.startsWith("data:video")) return u;
    const play = hangMediaSrc(u);
    if (play) return play;
    if (isImaginePostUrl(u)) return u;
  }
  return "";
}

/** MVP roles. breath-A / breath-B come later — types already accept them. */
export const HANG_REF_ROLES = ["breath-spawn", "walk-A", "walk-B"] as const;
export const HANG_REF_LATER = ["breath-A", "breath-B"] as const;
export const HANG_REF_ALL = [...HANG_REF_ROLES, ...HANG_REF_LATER] as const;

export type HangRefRole = (typeof HANG_REF_ALL)[number];
export type HangRefPose = CitadelPose;
export type HangRefSource = "file" | "imagine-post" | "imagine-clip" | "url";

export type HangRefFlags = {
  continuity?: "PASS" | "FAIL";
  kept?: boolean;
  aspect?: "9:16" | "other";
};

export type HungRoomRef = {
  role: HangRefRole;
  pose: HangRefPose;
  url: string;
  source: HangRefSource;
  flags?: HangRefFlags;
};

const IMAGINE_POST =
  /^https:\/\/(?:www\.)?grok\.com\/imagine\/post\/([A-Za-z0-9_-]{4,80})(?:[/?#]|$)/i;
const IMAGINE_CLIP =
  /(?:imgen\.x\.ai|xai-vidgen|xai-video|grok-imagine|\.mp4(\?|$))/i;

export function isHangRefRole(v?: string | null): v is HangRefRole {
  return HANG_REF_ALL.includes(String(v || "") as HangRefRole);
}

export function hangRefRole(v?: string | null): HangRefRole {
  return isHangRefRole(v) ? v : "breath-spawn";
}

export function poseOfHangRole(role?: string | null): HangRefPose {
  const r = hangRefRole(role);
  if (r === "walk-A" || r === "breath-A") return "atA";
  if (r === "walk-B" || r === "breath-B") return "atB";
  return "spawn";
}

/** Pose SM clip the engine plays for this role. */
export function clipIdOfHangRole(role?: string | null): PoseClipId {
  const r = hangRefRole(role);
  if (r === "walk-A") return "walk-spawn-A";
  if (r === "walk-B") return "walk-spawn-B";
  if (r === "breath-A") return "breath-A";
  if (r === "breath-B") return "breath-B";
  return "breath-spawn";
}

/** Living-hall bank key. Hang overwrites stock here. */
export function bankKeyOfHangRole(role?: string | null): string {
  const r = hangRefRole(role);
  if (r === "walk-A") return "spawn→m1";
  if (r === "walk-B") return "spawn→m2";
  if (r === "breath-A") return "idle-m1";
  if (r === "breath-B") return "idle-m2";
  return "idle-spawn";
}

/** Door bind for Hang A/B. Spawn breath is hall-keyed, not a third door. */
export function doorOfHangRole(role?: string | null): "A" | "B" {
  const r = hangRefRole(role);
  if (r === "walk-B" || r === "breath-B") return "B";
  return "A";
}

/** Door-chunk hang — walk/breath-A/B only. breath-spawn must not steal door A. */
export function hangRoleOwnsDoor(role: string | null | undefined, door: "A" | "B"): boolean {
  if (!isHangRefRole(role)) return true;
  if (door === "A") return role === "walk-A" || role === "breath-A";
  return role === "walk-B" || role === "breath-B";
}

export function parseImaginePostUrl(raw?: string | null): { ok: true; url: string; postId: string } | { ok: false } {
  const t = String(raw || "").trim();
  if (!t) return { ok: false };
  try {
    const href = /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
    const m = IMAGINE_POST.exec(href);
    if (!m) return { ok: false };
    const id = m[1]!;
    return { ok: true, url: `https://grok.com/imagine/post/${id}`, postId: id };
  } catch {
    return { ok: false };
  }
}

export function isImaginePostUrl(raw?: string | null): boolean {
  return parseImaginePostUrl(raw).ok;
}

export function isHangMediaUrl(raw?: string | null): boolean {
  const u = String(raw || "").trim();
  if (!u) return false;
  if (u.startsWith("blob:") || u.startsWith("data:video")) return true;
  if (isImaginePostUrl(u)) return true;
  if (playableClipSrc(u)) return true;
  return IMAGINE_CLIP.test(u) || /\.mp4(\?|$)/i.test(u) || u.startsWith("/api/clip") || u.startsWith("/films/");
}

export function hangRefSourceOf(raw?: string | null): HangRefSource {
  const u = String(raw || "").trim();
  if (u.startsWith("blob:") || u.startsWith("data:video")) return "file";
  if (isImaginePostUrl(u)) return "imagine-post";
  if (IMAGINE_CLIP.test(u) || playableClipSrc(u)) return "imagine-clip";
  return "url";
}

/** Playable src for the SM. Imagine post pages are provenance until an mp4 lands. */
export function hangMediaSrc(raw?: string | null): string {
  const u = String(raw || "").trim();
  if (!u) return "";
  if (u.startsWith("blob:") || u.startsWith("data:video")) return u;
  const play = playableClipSrc(u);
  if (play) return play;
  if (/\.mp4(\?|$)/i.test(u) || u.includes("xai-vidgen") || u.startsWith("/api/clip")) return u;
  return "";
}

export function continuityReasons(reasons: string[] = []): string[] {
  return reasons.filter((r) => /^continuity[-:]/i.test(String(r || "")));
}

export function isContinuityOnlyFail(smoke?: HangSmoke): boolean {
  if (!smoke || smoke.smoke !== "FAIL") return false;
  const list = (smoke.reasons || []).map((r) => String(r || "").trim()).filter(Boolean);
  if (!list.length) return false;
  return list.every((r) => /^continuity[-:]/i.test(r));
}

/**
 * SmiR Hang wins: Continuity FAIL + player KEEP → hang, flag only.
 * Other FAIL (16:9 cinematic, zero-byte, camera) still blocks.
 */
export function mayHangPlayerRef(smoke?: HangSmoke, kept = false): boolean {
  if (!smoke) return true;
  if (smoke.smoke === "PASS") return true;
  return Boolean(kept) && isContinuityOnlyFail(smoke);
}

export function hangRefFlags(smoke?: HangSmoke, kept = false): HangRefFlags {
  const reasons = smoke?.reasons || [];
  const continuity = reasons.some((r) => /^continuity[-:]/i.test(r)) ? "FAIL" : smoke?.smoke === "PASS" ? "PASS" : undefined;
  const aspect = reasons.some((r) => /aspect/i.test(r)) ? "other" : smoke?.smoke === "PASS" ? "9:16" : undefined;
  return {
    continuity,
    kept: Boolean(kept) && continuity === "FAIL" ? true : kept || undefined,
    aspect,
  };
}

export function hallOfRoom(room?: { hall?: number | null } | null, fallback = 1): number {
  const n = Math.round(Number(room?.hall) || 0);
  if (n >= 1 && n <= 8) return n;
  return Math.max(1, Math.min(8, Math.round(Number(fallback) || 1)));
}

function citadelOf(room?: { citadel?: string | null } | null): string {
  return String(room?.citadel || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
}

function hallMatch(art: HungArtifact, hall: number, citadel?: string): boolean {
  const room = art.room;
  if (!room) return false;
  if (hallOfRoom(room, 0) !== hall) return false;
  const want = String(citadel || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const have = citadelOf(room);
  if (want && have && want !== have) return false;
  return true;
}

export function hungOnRole(
  arts: HungArtifact[] = [],
  role: HangRefRole,
  hall = 1,
  citadel?: string,
): HungArtifact | undefined {
  const n = hallOfRoom({ hall }, 1);
  return [...arts]
    .filter((a) => hallMatch(a, n, citadel) && hangRefRole(a.room?.role) === role && isHangRefRole(a.room?.role))
    .sort((p, q) => (q.hungAt || 0) - (p.hungAt || 0))[0];
}

export function hungRefsForHall(
  arts: HungArtifact[] = [],
  hall = 1,
  citadel?: string,
): Partial<Record<HangRefRole, HungRoomRef>> {
  const out: Partial<Record<HangRefRole, HungRoomRef>> = {};
  for (const role of HANG_REF_ALL) {
    const art = hungOnRole(arts, role, hall, citadel);
    if (!art) continue;
    const url = hangMediaSrc(firstHungUrl(art));
    if (!url) continue;
    out[role] = {
      role,
      pose: poseOfHangRole(role),
      url,
      source: hangRefSourceOf(art.playlist?.[0] || art.still),
      flags: art.room?.flags,
    };
  }
  return out;
}

/** Human Hang wins stock on the pose shelf. Missing roles stay stock. */
export function overlayHungShelf(
  stock: PoseClipShelf = {},
  arts: HungArtifact[] = [],
  hall = 1,
  citadel?: string,
): PoseClipShelf {
  const next: PoseClipShelf = { ...stock };
  const refs = hungRefsForHall(arts, hall, citadel);
  for (const role of HANG_REF_ALL) {
    const hit = refs[role];
    if (!hit?.url) continue;
    next[clipIdOfHangRole(role)] = hit.url;
  }
  return next;
}

export function bankPatchesFromHung(
  arts: HungArtifact[] = [],
  hall = 1,
  citadel?: string,
): Array<{ key: string; url: string; role: HangRefRole }> {
  const refs = hungRefsForHall(arts, hall, citadel);
  const out: Array<{ key: string; url: string; role: HangRefRole }> = [];
  for (const role of HANG_REF_ALL) {
    const hit = refs[role];
    if (!hit?.url) continue;
    out.push({ key: bankKeyOfHangRole(role), url: hit.url, role });
  }
  return out;
}

export function bindHangRefRoom(
  role: HangRefRole,
  opts: { hall: number; citadel?: string; still?: string; trans?: string; biome?: string; flags?: HangRefFlags },
): HungRoom {
  const hall = hallOfRoom(opts, 1);
  return {
    door: doorOfHangRole(role),
    still: opts.still || "",
    trans: opts.trans,
    citadel: opts.citadel,
    hall,
    biome: opts.biome,
    role,
    pose: poseOfHangRole(role),
    flags: opts.flags,
  };
}

export const HANG_REF_LAW = [
  "Hang import: local mp4 or grok.com/imagine/post URL as room refs.",
  "Roles: breath-spawn, walk-A, walk-B (later breath-A/B). Keyed spawn|atA|atB.",
  "Human Hang wins stock on the pose SM / plate graph.",
  "9:16 preferred. Continuity FAIL + KEEP = flag only — SmiR Hang wins.",
] as const;
