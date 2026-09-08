import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HallMark } from "@/components/hall-mark";
import { mergeHall, readArtifacts, type HungArtifact } from "@/game/artifacts";
import { listHall } from "@/lib/hall";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const [hung, setHung] = useState<HungArtifact[]>([]);
  useEffect(() => {
    function pull() {
      const local = readArtifacts();
      setHung(local);
      void listHall()
        .then((hall) => setHung(mergeHall(hall || [], readArtifacts())))
        .catch(() => setHung(readArtifacts()));
    }
    pull();
    window.addEventListener("focus", pull);
    document.addEventListener("visibilitychange", pull);
    return () => {
      window.removeEventListener("focus", pull);
      document.removeEventListener("visibilitychange", pull);
    };
  }, []);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg" data-home="13" style={{ touchAction: "manipulation" }}>
      <img src="/ui/forge.jpg?v=aaa" alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
      <video
        src="/ui/forge.mp4?v=aaa"
        poster="/ui/forge.jpg?v=aaa"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-bg/50 via-transparent to-bg/80" />
      <div className="pointer-events-none absolute left-0 right-0 top-[max(1.4rem,env(safe-area-inset-top))] px-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.42em] text-ice/80">Bolt Engine</p>
        <h1 className="mt-2 font-display text-6xl leading-none text-fg">Forge</h1>
      </div>
      <div className="absolute right-5 top-[max(1.4rem,env(safe-area-inset-top))] z-[60]">
        <HallMark />
      </div>

      <a
        href="/rune"
        data-go="runes"
        className="absolute bottom-0 left-0 top-0 z-20 w-[34%]"
        style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
      >
        <span className="absolute bottom-[max(2.2rem,env(safe-area-inset-bottom))] left-4 right-2">
          <span className="crystal crystal-ice block rounded-2xl px-4 py-3">
            <span className="block font-display text-3xl leading-none">Runes</span>
            <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.22em] text-ice/70">citadel walks</span>
          </span>
        </span>
      </a>

      <div
        className="absolute bottom-0 left-[34%] right-[34%] top-[42%] z-50 flex flex-col items-center justify-end px-1 pb-[max(2.2rem,env(safe-area-inset-bottom))]"
        data-vault="1"
      >
        {hung.length ? (
          <div className="mb-3 flex max-w-full gap-2 overflow-x-auto">
            {hung.slice(0, 6).map((a) => (
              <a
                key={a.id}
                href="/vault"
                aria-label={a.name}
                className="crystal shrink-0 overflow-hidden rounded-xl"
                style={{ width: "4.8rem", touchAction: "manipulation" }}
              >
                {a.still ? <img src={a.still} alt="" className="h-[5.2rem] w-full object-cover" /> : null}
                <p className="truncate px-1 py-1 text-center font-mono text-[8px] uppercase tracking-[0.1em] text-hold">
                  {a.name}
                </p>
              </a>
            ))}
          </div>
        ) : null}
        <a href="/vault" data-vault-bot="bot" className="block text-center" style={{ touchAction: "manipulation" }}>
          <span className="crystal crystal-quiet block rounded-2xl px-4 py-3">
            <span className="block font-display text-3xl leading-none text-fg">Hang</span>
            <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
              {hung.length ? `${hung.length} hung` : "breath · walk · spawn"}
            </span>
          </span>
        </a>
      </div>

      <a
        href="/artifacts"
        data-go="artifacts"
        className="absolute bottom-0 right-0 top-0 z-20 w-[34%]"
        style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
      >
        <span className="absolute bottom-[max(2.2rem,env(safe-area-inset-bottom))] left-2 right-4 text-right">
          <span className="crystal crystal-gold block rounded-2xl px-4 py-3">
            <span className="block font-display text-3xl leading-none">Artifacts</span>
            <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.22em] text-hold/70">biomes · stills</span>
          </span>
        </span>
      </a>
    </div>
  );
}
