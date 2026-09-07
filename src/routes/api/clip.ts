import { createFileRoute } from "@tanstack/react-router";
import { allowClipProxyHost, unwrapClipProxy } from "@/game/play-clip";

function deny(status: number, msg: string) {
  return new Response(msg, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

async function proxyClip(request: Request) {
  const href = new URL(request.url);
  const raw = href.searchParams.get("u") || "";
  const src = unwrapClipProxy(raw.startsWith("/api/clip") ? raw : `/api/clip?u=${encodeURIComponent(raw)}`);
  if (!src || !allowClipProxyHost(src)) return deny(400, "bad-url");
  const headers: Record<string, string> = { Accept: "video/mp4,video/*,*/*" };
  const range = request.headers.get("range");
  if (range) headers.Range = range;
  const key = process.env.XAI_API_KEY;
  if (key && /(?:^|\.)x\.ai$/i.test(new URL(src).hostname)) {
    headers.Authorization = `Bearer ${key}`;
  }
  try {
    const up = await fetch(src, { headers, redirect: "follow", signal: AbortSignal.timeout(28000) });
    if (!up.ok && up.status !== 206) return deny(up.status === 404 ? 404 : 502, `upstream ${up.status}`);
    const type = (up.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (type.startsWith("text/") || type.includes("json") || type.startsWith("image/")) {
      return deny(415, "not-video");
    }
    const out = new Headers();
    out.set("Content-Type", type && type.startsWith("video/") ? type : "video/mp4");
    const len = up.headers.get("content-length");
    if (len) out.set("Content-Length", len);
    const cr = up.headers.get("content-range");
    if (cr) out.set("Content-Range", cr);
    out.set("Accept-Ranges", up.headers.get("accept-ranges") || "bytes");
    out.set("Cache-Control", "public, max-age=3600");
    return new Response(up.body, { status: up.status, headers: out });
  } catch {
    return deny(502, "proxy");
  }
}

export const Route = createFileRoute("/api/clip")({
  server: {
    handlers: {
      GET: ({ request }) => proxyClip(request),
      HEAD: ({ request }) => proxyClip(request),
    },
  },
});
