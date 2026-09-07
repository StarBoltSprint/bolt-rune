/** Same-origin / blob / proxy clip URLs the <video> element can actually play. */

const CLIP_PROXY = "/api/clip";

const IMAGINE_HOST =
  /(?:^|\.)(?:x\.ai|imgen\.x\.ai|api\.x\.ai)$/i;

const IMAGINE_HINT = /imgen|xai-vidgen|xai-video|vidgen|grok-imagine/i;

export function isRemoteHttp(u?: string | null): boolean {
  return !!u && /^https?:\/\//i.test(u);
}

export function isSameOriginClip(u?: string | null): boolean {
  if (!u) return false;
  if (u.startsWith("blob:") || u.startsWith("data:video")) return true;
  if (u.startsWith(CLIP_PROXY)) return true;
  return u.startsWith("/films/") || u.startsWith("/ui/") || u.startsWith("/sprites/");
}

export function isImagineRemote(u?: string | null): boolean {
  if (!u || !isRemoteHttp(u)) return false;
  try {
    const host = new URL(u).hostname;
    if (IMAGINE_HOST.test(host)) return true;
  } catch {
    /* */
  }
  return IMAGINE_HINT.test(u);
}

/** Browser-playable mp4 — not a bare Imagine CDN/API URL. */
export function isPlayableClipSrc(u?: string | null): boolean {
  if (!u) return false;
  if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)) return false;
  if (isSameOriginClip(u)) return /(?:\.mp4(\?|$)|\/api\/clip\?|\/ui\/|\/films\/|blob:|data:video)/i.test(u) || u.startsWith("blob:") || u.startsWith("data:video");
  return false;
}

export function clipProxyHref(url: string): string {
  if (!url) return "";
  if (url.startsWith(CLIP_PROXY)) return url;
  return `${CLIP_PROXY}?u=${encodeURIComponent(url)}`;
}

export function unwrapClipProxy(url: string): string {
  if (!url.startsWith(CLIP_PROXY)) return url;
  try {
    const q = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
    return new URLSearchParams(q).get("u") || url;
  } catch {
    return url;
  }
}

/**
 * Map a cook/Imagine result to a src <video> can load.
 * Remote Imagine / xai-vidgen URLs become a same-origin `/api/clip` proxy.
 * Already-local clips stay as-is. Non-clips return "".
 */
export function playableClipSrc(u?: string | null): string {
  if (!u) return "";
  if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u) && !u.includes(".mp4")) return "";
  if (isSameOriginClip(u)) return u;
  if (!isRemoteHttp(u)) {
    if (/\.mp4(\?|$)/i.test(u) || u.includes("xai-vidgen")) return u;
    return "";
  }
  if (/\.mp4(\?|$)/i.test(u) || u.includes("xai-vidgen") || isImagineRemote(u)) {
    return allowClipProxyHost(u) ? clipProxyHref(u) : "";
  }
  return "";
}

/** Same-origin loop that is actually shipped (sprint `forge-*.mp4` are not in this tree). */
export const STOCK_PLAYABLE_LOOP = "/ui/forge.mp4";

export function stockBiomeLoop(_biome?: string | null): string {
  return STOCK_PLAYABLE_LOOP;
}

/**
 * READY / play handoff: first playable clip, else the stock biome loop.
 * Never hands the player a bare Imagine URL.
 */
export function biomePlaySrc(urls?: string[] | null, biome?: string | null): string {
  for (const raw of urls || []) {
    const u = playableClipSrc(raw);
    if (u) return u;
  }
  return stockBiomeLoop(biome);
}

export function allowClipProxyHost(url: string): boolean {
  if (!isRemoteHttp(url)) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost")) return false;
    if (host === "0.0.0.0" || host === "[::1]") return false;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
      const [a, b] = host.split(".").map(Number);
      if (a === 10 || a === 127 || a === 0 || a === 255) return false;
      if (a === 192 && b === 168) return false;
      if (a === 169 && b === 254) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
    }
    return true;
  } catch {
    return false;
  }
}
