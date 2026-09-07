import { createFileRoute } from "@tanstack/react-router";
import { CitadelHub } from "@/components/citadel-hub";
import { RuneEngine } from "@/components/rune-engine";
import { parseLookForge } from "@/game/path-entry";
import { clearLivePlay } from "@/game/rune-session";

export const Route = createFileRoute("/rune")({
  validateSearch: (s: Record<string, unknown>) => {
    const roomsN = Number(s.rooms);
    const hallN = Number(s.hall);
    return {
      tour: s.tour === "1" || s.tour === 1 || s.tour === true,
      fresh: s.new === "1" || s.new === 1 || s.new === true,
      plan: s.plan === "1" || s.plan === 1 || s.plan === true,
      drive: s.drive === "pilot" ? ("pilot" as const) : ("engine" as const),
      first: s.first === "m2" ? ("m2" as const) : s.first === "m1" ? ("m1" as const) : undefined,
      session: typeof s.session === "string" ? s.session : undefined,
      art: typeof s.art === "string" && s.art ? s.art : undefined,
      do: s.do === "more" ? ("more" as const) : s.do === "room" ? ("room" as const) : s.do === "reset" ? ("reset" as const) : ("play" as const),
      stills:
        s.stills === "1" || s.stills === 1 || s.stills === true
          ? true
          : s.stills === "0" || s.stills === 0 || s.stills === false
            ? false
            : undefined,
      rooms: roomsN >= 1 && roomsN <= 8 ? roomsN : undefined,
      hall: hallN >= 1 && hallN <= 8 ? hallN : undefined,
      forge: parseLookForge(s),
    };
  },
  component: RunePage,
});

function RunePage() {
  const { tour, fresh, plan, drive, first, session, do: deed, rooms, hall, stills, art, forge } = Route.useSearch();
  if (art) {
    return (
      <RuneEngine
        boot={{ kind: "path", first: "m1", drive, rooms: 1, hall: 1, art }}
        onBack={() => {
          clearLivePlay();
          window.location.href = "/rune";
        }}
      />
    );
  }
  if (session) {
    return (
      <RuneEngine
        boot={{ kind: "session", id: session, do: deed, hall, drive }}
        onBack={() => {
          clearLivePlay();
          window.location.href = "/rune";
        }}
      />
    );
  }
  if (first && (!tour || plan)) {
    return (
      <RuneEngine
        boot={{ kind: "path", first, drive, rooms: rooms ?? 1, hall: hall ?? 1, stills, forge }}
        onBack={() => {
          clearLivePlay();
          window.location.href = `/rune?drive=${drive}`;
        }}
      />
    );
  }
  return <CitadelHub tour={tour || fresh} plan={plan} drive={drive} first={first} rooms={rooms} hall={hall} />;
}
