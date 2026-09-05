import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/walk")({
  validateSearch: (s: Record<string, unknown>) => ({
    first: s.first === "m2" ? ("m2" as const) : s.first === "m1" ? ("m1" as const) : undefined,
    session: typeof s.session === "string" ? s.session : undefined,
    drive: s.drive === "pilot" ? ("pilot" as const) : ("engine" as const),
  }),
  component: WalkPage,
});

function WalkPage() {
  const { first, session, drive } = Route.useSearch();
  const q = new URLSearchParams();
  if (first) q.set("first", first);
  if (session) q.set("session", session);
  q.set("drive", drive);
  const href = `/rune?${q.toString()}`;
  if (typeof window !== "undefined") window.location.replace(href);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg">
      <a href={href} className="font-display text-2xl text-ice" style={{ touchAction: "manipulation" }}>
        Forge
      </a>
    </div>
  );
}
