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
      <img src="/ui/forge.jpg?v=sci" alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
      <video
        src="/ui/forge.mp4?v=sci"
        poster="/ui/forge.jpg?v=sci"
        autoPlay
        muted
        loop
        playsInline
        preload="none"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-black/20 to-black/70" />
      <div className="pointer-events-none absolute left-0 right-0 top-[max(1.4rem,env(safe-area-inset-top))] px-6 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.42em] text-ice/80">Bolt Engine</p>
        <h1 className="mt-2 font-display text-6xl leading-none text-fg drop-shadow-[0_8px_24px_rgba(0,0,0,0.8)]">Forge</h1>
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
        <span className="absolute bottom-[max(2.2rem,env(safe-area-inset-bottom))] left-0 right-0 px-5">
          <span className="block font-display text-4xl leading-none text-[#9ef0e4] drop-shadow-[0_0_18px_rgba(126,224,210,0.55)]">Runes</span>
          <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-ice/70">citadel walks</span>
        </span>
      </a>

      <div
        className="absolute bottom-0 left-[34%] right-[34%] top-[42%] z-50 flex flex-col items-center justify-end px-2 pb-[max(2.2rem,env(safe-area-inset-bottom))]"
        data-vault="1"
      >
        {hung.length ? (
          <div className="mb-3 flex max-w-full gap-2 overflow-x-auto">
            {hung.slice(0, 6).map((a) => (
              <a
                key={a.id}
                href="/vault"
                aria-label={a.name}
                className="shrink-0 overflow-hidden rounded-xl border border-[#e4c37a]/55 bg-black/70 shadow-[0_8px_24px_rgba(0,0,0,0.65)]"
                style={{ width: "4.8rem", touchAction: "manipulation" }}
              >
                {a.still ? <img src={a.still} alt="" className="h-[5.2rem] w-full object-cover" /> : null}
                <p className="truncate px-1 py-1 text-center font-mono text-[8px] uppercase tracking-[0.1em] text-[#f0d48a]">
                  {a.name}
                </p>
              </a>
            ))}
          </div>
        ) : null}
        <a href="/vault" className="block text-center" style={{ touchAction: "manipulation" }}>
          <span className="block font-display text-4xl leading-none text-[#e8eef2] drop-shadow-[0_0_18px_rgba(232,238,242,0.45)]">
            Vault
          </span>
          <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-white/55">
            {hung.length ? `${hung.length} hung` : "your artefacts"}
          </span>
        </a>
      </div>

      <a
        href="/artifacts"
        data-go="artifacts"
        className="absolute bottom-0 right-0 top-0 z-20 w-[34%]"
        style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
      >
        <span className="absolute bottom-[max(2.2rem,env(safe-area-inset-bottom))] left-0 right-0 px-5 text-right">
          <span className="block font-display text-4xl leading-none text-[#f0d48a] drop-shadow-[0_0_18px_rgba(228,195,122,0.5)]">Artifacts</span>
          <span className="mt-2 block font-mono text-[10px] uppercase tracking-[0.22em] text-[#e4c37a]/70">biomes · stills</span>
        </span>
      </a>
    </div>
  );
}
