import { TOUR_PLATE } from "@/game/rune";
import { listSessions, hydrateSessions, dumpRooms, dumpRoom, takeRooms, renameSession, lastPlay, type RuneSessionMeta } from "@/game/rune-session";
import { packCitadels } from "@/game/rooms";
import { saveDrive, type Drive } from "@/game/rune-brain";
import { boltFull } from "@/lib/press";
import { sfxForge } from "@/game/audio";
import { HallMark } from "@/components/hall-mark";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

const A = { x: 22, y: 48 };
const B = { x: 78, y: 48 };
const A_HEAD = { x: 21, y: 29 };
const B_HEAD = { x: 79, y: 29 };

export function BootScreen({ pct = 8, label = "opening", plate }: { pct?: number; label?: string; plate?: string }) {
  const n = Math.max(1, Math.min(100, Math.round(pct)));
  const art = plate && !plate.includes("citadel") && !plate.includes("hall-doors") ? plate : "";
  return (
    <div className="absolute inset-0 z-[90] overflow-hidden bg-[#07080c]">
      {art ? (
        <img src={art} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,12,0.35)_0%,transparent_40%,rgba(7,8,12,0.72)_100%)]" />
      <div className="absolute bottom-[12%] left-1/2 w-[72%] max-w-sm -translate-x-1/2">
        <p className="mb-3 text-center font-mono text-[10px] uppercase tracking-[0.34em] text-white/70">
          {label} · {n}%
        </p>
        <div className="h-[3px] overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-[#9ef0e4] transition-[width] duration-200" style={{ width: `${n}%` }} />
        </div>
      </div>
    </div>
  );
}

function groupCitadels(list: RuneSessionMeta[]) {
  return packCitadels(list);
}

function PathArrows({ first }: { first: "m1" | "m2" }) {
  return (
    <img
      src={first === "m1" ? "/ui/path-a.png" : "/ui/path-b.png"}
      alt=""
      className="pointer-events-none absolute inset-0 h-full w-full object-contain object-center opacity-80"
    />
  );
}

function DoorMark({
  at,
  letter,
  href,
  on,
  tone,
  painted,
}: {
  at: { x: number; y: number };
  letter: string;
  href: string;
  on: boolean;
  tone: "teal" | "gold";
  painted?: boolean;
}) {
  const ring = tone === "teal" ? "#7ee0d2" : "#e4c37a";
  return (
    <a
      href={href}
      aria-label={letter}
      className="absolute z-40 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center font-display"
      style={{
        left: `${at.x}%`,
        top: `${at.y}%`,
        width: painted ? "22%" : "26%",
        height: painted ? "18%" : "36%",
        touchAction: "manipulation",
        color: painted ? "transparent" : ring,
        fontSize: painted ? 0 : "2.6rem",
        textShadow: painted ? "none" : `0 0 22px ${ring}`,
        background: "transparent",
        border: "none",
        boxShadow: "none",
        opacity: on && painted ? 1 : 1,
      }}
    >
      {painted ? "" : letter}
    </a>
  );
}

export function CitadelHub({
  tour,
  plan,
  drive,
  first,
  rooms,
  hall,
}: {
  tour?: boolean;
  plan?: boolean;
  drive?: Drive;
  first?: "m1" | "m2";
  rooms?: number;
  hall?: number;
}) {
  const mode: Drive = drive === "pilot" ? "pilot" : "engine";
  const nav = useNavigate();
  const [hub, setHub] = useState<RuneSessionMeta[]>(() => (typeof window === "undefined" ? [] : listSessions()));
  const [hubReady, setHubReady] = useState(false);
  const [hunt, setHunt] = useState(true);
  useEffect(() => {
    setHub(listSessions());
    setHubReady(true);
    void hydrateSessions((rows) => {
      if (rows.length) setHub(rows);
    }).then(async (rows) => {
      if (rows.length) setHub(rows);
      const last = lastPlay();
      if (last?.id && !listSessions().some((s) => s.id === last.id)) {
        try {
          const { loadSession } = await import("@/game/rune-session");
          const got = await loadSession(last.id);
          if (got?.id) setHub(listSessions());
        } catch {
          /* */
        }
      }
      setHunt(false);
    });
  }, []);
  useEffect(() => {
    saveDrive(mode);
  }, [mode]);
  const hallN = hall && hall >= 1 ? hall : 1;
  const roomsN = rooms && rooms >= 1 ? rooms : 1;
  const q = `drive=${mode}&rooms=${roomsN}&hall=${hallN}`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [packMsg, setPackMsg] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [loadOn, setLoadOn] = useState(false);
  const [draft, setDraft] = useState("");
  const [naming, setNaming] = useState(false);
  const lastFull = useRef(0);
  const loadAt = useRef(0);
  const { user, isPending: authPending } = useCurrentUserState();
  const owned = Boolean(user);

  async function keepOne(id: string, name: string) {
    try {
      const raw = await dumpRoom(id);
      const blob = new Blob([raw], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `bolt-${id.slice(0, 18)}.json`;
      a.click();
      URL.revokeObjectURL(href);
      setPackMsg(`file · ${name}`);
    } catch {
      setPackMsg("keep failed");
    }
  }

  async function keepRooms() {
    try {
      const raw = await dumpRooms();
      const blob = new Blob([raw], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `bolt-citadel-rooms.json`;
      a.click();
      URL.revokeObjectURL(href);
      setPackMsg("all rooms · new link → Load file");
    } catch {
      setPackMsg("keep failed");
    }
  }

  async function loadRooms(file: File) {
    try {
      const raw = await file.text();
      const rows = await takeRooms(raw);
      setHub(rows);
      setHubReady(true);
      setPackMsg(rows.length ? `${rows.length} room${rows.length > 1 ? "s" : ""} loaded` : "no rooms in file");
    } catch {
      setPackMsg("load failed");
    }
  }
  function tapFull(e: React.PointerEvent) {
    const el = e.target as HTMLElement;
    if (el.closest("a,button")) return;
    const now = performance.now();
    if (now - lastFull.current < 420) {
      lastFull.current = 0;
      sfxForge("full");
      boltFull();
      return;
    }
    lastFull.current = now;
  }

  if (tour && plan && first) {
    const playHref = `/rune?first=${first}&${q}&stills=0`;
    if (typeof window !== "undefined") {
      window.location.replace(playHref);
    }
    return (
      <div className="relative min-h-dvh overflow-hidden bg-bg" data-plan="play">
        <BootScreen pct={16} label="opening" plate={TOUR_PLATE} />
        <a href={playHref} className="sr-only">
          Play
        </a>
      </div>
    );
  }

  if (tour) {
    return (
      <div className="relative min-h-dvh overflow-hidden bg-bg" data-tour="3" style={{ touchAction: "manipulation" }} onPointerUp={tapFull}>
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "min(100%, calc(100dvh * 9 / 16))",
            height: "min(100%, calc(100dvw * 16 / 9))",
          }}
        >
          <img src={TOUR_PLATE} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
          {first ? <PathArrows first={first} /> : null}
          <DoorMark at={first ? A_HEAD : A} letter="A" href={`/rune?tour=1&${q}&first=m1`} on={first === "m1"} tone="teal" painted={!!first} />
          <DoorMark at={first ? B_HEAD : B} letter="B" href={`/rune?tour=1&${q}&first=m2`} on={first === "m2"} tone="gold" painted={!!first} />
        </div>
        <div className="pointer-events-none absolute left-0 right-0 top-[max(0.8rem,env(safe-area-inset-top))] px-5">
          <a href="/rune" className="pointer-events-auto font-mono text-[10px] uppercase tracking-[0.42em] text-white/55" style={{ touchAction: "manipulation" }}>
            Back
          </a>
          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.48em] text-white/45">Citadel</p>
          <p className="mt-1 font-display text-[2.6rem] leading-none text-white/90 drop-shadow-[0_10px_28px_rgba(0,0,0,0.9)]">
            {first ? "Path" : roomsN > 1 ? `Room ${hallN}` : "Doors"}
          </p>
        </div>
        {first ? (
          <a
            href={`/rune?first=${first}&${q}&stills=0`}
            className="absolute bottom-[max(1.2rem,env(safe-area-inset-bottom))] left-5 right-5 flex h-16 items-center justify-center font-display text-4xl text-[#f0d48a] drop-shadow-[0_0_22px_rgba(228,195,122,0.55)]"
            style={{ touchAction: "manipulation" }}
          >
            Next
          </a>
        ) : (
          <p className="pointer-events-none absolute bottom-[max(1.4rem,env(safe-area-inset-bottom))] left-5 right-5 text-center font-mono text-[10px] uppercase tracking-[0.28em] text-white/40">
            tap a door
          </p>
        )}
      </div>
    );
  }

  const packs = groupCitadels(hub);
  const last = typeof window !== "undefined" ? lastPlay() : null;
  const shown =
    packs.length > 0
      ? packs
      : hub.length
        ? hub.map((s) => ({
            root: s,
            rooms: [s],
            updated: s.updated || 0,
            title: (s.title || s.name || "").trim() || "Citadel",
          }))
        : last?.id
          ? [
              {
                root: {
                  id: last.id,
                  name: last.title || "Citadel",
                  title: last.title,
                  updated: Date.now(),
                  phase: "play" as const,
                  want: 2,
                  walks: 0,
                  thumb: "",
                },
                rooms: [],
                updated: Date.now(),
                title: last.title || "Citadel",
              },
            ]
          : [];
  const now = shown[0] || null;
  const nowTitle = now?.title || "Citadel";

  async function saveName(id: string, raw: string) {
    const t = await renameSession(id, raw);
    setHub(listSessions());
    setDraft(t);
    setNaming(false);
    sfxForge("page");
  }

  function go(path: string) {
    sfxForge("page");
    window.location.assign(path);
  }

  function playSession(id: string, deed: "play" | "more" | "room" = "play", hall?: number) {
    sfxForge("page");
    void nav({
      to: "/rune",
      search: {
        session: id,
        drive: mode,
        do: deed,
        art: undefined,
        tour: false,
        fresh: false,
        plan: false,
        first: undefined,
        stills: false,
        rooms: undefined,
        hall: hall && hall >= 1 ? hall : undefined,
      },
    });
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg" data-count="7" style={{ touchAction: "manipulation" }}>
      <img src="/ui/citadel.jpg?v=aaa" alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
      <video
        src="/ui/citadel.mp4?v=aaa"
        poster="/ui/citadel.jpg?v=aaa"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-bg/40 via-transparent to-bg/75" />
      <div className="absolute right-5 top-[max(1.4rem,env(safe-area-inset-top))] z-[60]">
        <HallMark />
      </div>
      <a
        href={`/rune?drive=pilot`}
        className={`absolute z-50 -translate-x-1/2 font-mono text-[11px] uppercase tracking-[0.28em] ${
          mode === "pilot" ? "text-ice" : "text-ice/40"
        }`}
        style={{ left: "22%", top: "34%", touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
        onPointerUp={() => sfxForge("page")}
      >
        Pilot
      </a>
      <a
        href={`/rune?drive=engine`}
        className={`absolute z-50 -translate-x-1/2 font-mono text-[11px] uppercase tracking-[0.28em] ${
          mode === "engine" ? "text-hold" : "text-hold/40"
        }`}
        style={{ left: "78%", top: "34%", touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
        onPointerUp={() => sfxForge("page")}
      >
        Engine
      </a>
      <div className="pointer-events-none relative z-10 flex min-h-dvh flex-col px-5 pt-[max(1.4rem,env(safe-area-inset-top))] pb-[max(1.4rem,env(safe-area-inset-bottom))]">
        <div className="flex-1" />
        <div className="pointer-events-auto relative z-50 flex flex-col items-center gap-3 pb-2">
          {now?.root.id ? (
            <a
              href={`/rune?session=${encodeURIComponent(now.root.id)}&drive=${mode}`}
              className="crystal crystal-ice flex min-h-14 min-w-[12.5rem] items-center justify-center rounded-2xl px-8 font-display text-3xl"
              style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
              onClick={(e) => {
                e.preventDefault();
                playSession(now.root.id);
              }}
            >
              Play
            </a>
          ) : (
            <button
              type="button"
              className="crystal crystal-ice flex min-h-14 min-w-[12.5rem] items-center justify-center rounded-2xl px-8 font-display text-3xl"
              style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
              onPointerUp={(e) => {
                e.stopPropagation();
                loadAt.current = Date.now();
                setLoadOn(true);
                sfxForge("page");
              }}
            >
              Play
            </button>
          )}
          <a
            href={`/rune?tour=1&drive=${mode}&rooms=1&hall=1`}
            className="crystal crystal-gold flex min-h-14 min-w-[12.5rem] items-center justify-center rounded-2xl px-8 font-display text-3xl"
            style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            onPointerUp={() => sfxForge("page")}
          >
            New citadel
          </a>
          <button
            type="button"
            className="crystal crystal-quiet relative z-50 flex min-h-12 min-w-[10rem] items-center justify-center rounded-2xl px-8 font-display text-2xl"
            style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
            onPointerUp={(e) => {
              e.stopPropagation();
              loadAt.current = Date.now();
              setHub(listSessions());
              setHunt(false);
              setHubReady(true);
              setLoadOn(true);
              sfxForge("page");
              void hydrateSessions((rows) => {
                if (rows.length) setHub(rows);
              }).then((rows) => {
                if (rows.length) setHub(rows);
              });
            }}
          >
            Load
          </button>
        </div>
        {packMsg ? <p className="pointer-events-none text-center font-mono text-[10px] uppercase tracking-[0.14em] text-[#f0d48a]">{packMsg}</p> : null}
      </div>
      {loadOn ? (
        <div
          className="fixed inset-0 z-[200] flex flex-col bg-[#07080c] px-5 pt-[max(1.4rem,env(safe-area-inset-top))] pb-[max(1.1rem,env(safe-area-inset-bottom))]"
          onPointerUp={(e) => {
            if (e.target !== e.currentTarget) return;
            if (Date.now() - loadAt.current < 450) return;
            setLoadOn(false);
          }}
        >
          <button
            type="button"
            className="self-start font-mono text-[10px] uppercase tracking-[0.42em] text-white/55"
            style={{ touchAction: "manipulation" }}
            onPointerUp={() => setLoadOn(false)}
          >
            Back
          </button>
          <h2 className="mt-5 font-display text-[2.2rem] leading-none text-white/90">Load</h2>
          <div className="mt-6 flex flex-1 flex-col gap-5 overflow-auto">
            {shown.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-6 px-2">
                <p className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-white/45">
                  {hunt && !hub.length
                    ? "looking for rooms…"
                    : owned
                      ? "no rooms in this hall yet. new citadel, or load a json."
                      : "rooms live on this phone. keep the hall to carry them. or load the json you downloaded."}
                </p>
                {authPending || owned ? null : (
                  <a
                    href="/login"
                    className="font-display text-3xl text-[#f0d48a]"
                    style={{ touchAction: "manipulation" }}
                  >
                    Keep
                  </a>
                )}
                <label
                  className="relative flex h-16 w-full max-w-xs items-center justify-center font-display text-3xl text-[#f0d48a]"
                  style={{ touchAction: "manipulation" }}
                >
                  Load file
                  <input
                    type="file"
                    accept=".json,application/json,text/plain,*/*"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void loadRooms(file);
                    }}
                  />
                </label>
              </div>
            ) : null}
            {shown.map((p) => (
              <div key={p.root.id} className="relative flex flex-col gap-2">
                <div className="flex items-end justify-between gap-3">
                <button
                  type="button"
                  className="min-w-0 text-left"
                  style={{ touchAction: "manipulation" }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    setOpenId(openId === p.root.id ? null : p.root.id);
                  }}
                >
                  <p className="font-display text-2xl leading-none text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)]">
                    {naming && openId === p.root.id ? (
                      <input
                        autoFocus
                        value={draft}
                        maxLength={40}
                        className="w-full bg-transparent font-display text-2xl text-white outline-none"
                        onChange={(e) => setDraft(e.target.value)}
                        onPointerDown={(e) => e.stopPropagation()}
                        onBlur={() => void saveName(p.root.id, draft)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                      />
                    ) : (
                      p.title
                    )}
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                    {p.rooms.length} room{p.rooms.length > 1 ? "s" : ""}
                  </p>
                </button>
                <div className="flex items-center gap-3">
                  <a
                    href={`/rune?session=${encodeURIComponent(p.root.id)}&drive=${mode}`}
                    className="font-display text-xl text-[#9ef0e4]"
                    style={{ touchAction: "manipulation" }}
                    onClick={(e) => {
                      e.preventDefault();
                      playSession(p.root.id);
                    }}
                  >
                    Play
                  </a>
                  <button
                    type="button"
                    aria-label="menu"
                    className="flex h-11 w-11 items-center justify-center"
                    style={{ touchAction: "manipulation" }}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      setOpenId(openId === p.root.id ? null : p.root.id);
                    }}
                  >
                    <span className="flex flex-col gap-[3px]">
                      <span className="block h-[3px] w-[3px] rounded-full bg-[#f0d48a]" />
                      <span className="block h-[3px] w-[3px] rounded-full bg-[#f0d48a]" />
                      <span className="block h-[3px] w-[3px] rounded-full bg-[#f0d48a]" />
                    </span>
                  </button>
                </div>
                {openId === p.root.id ? (
                  <div className="absolute right-0 top-full z-50 mt-2 flex min-w-36 flex-col gap-1 rounded-2xl border border-white/15 bg-black/70 px-3 py-2 backdrop-blur-md">
                    <a
                      href={`/rune?session=${encodeURIComponent(p.root.id)}&do=more&drive=${mode}`}
                      className="flex h-11 items-center font-display text-lg text-[#f0d48a]"
                      style={{ touchAction: "manipulation" }}
                      onClick={(e) => {
                        e.preventDefault();
                        playSession(p.root.id, "more");
                      }}
                    >
                      Continue
                    </a>
                    <a
                      href={`/rune?session=${encodeURIComponent(p.root.id)}&do=room&drive=${mode}`}
                      className="flex h-11 items-center font-display text-lg text-[#9ef0e4]"
                      style={{ touchAction: "manipulation" }}
                      onClick={(e) => {
                        e.preventDefault();
                        playSession(p.root.id, "room");
                      }}
                    >
                      Add room
                    </a>
                    <button
                      type="button"
                      className="flex h-11 items-center font-display text-lg text-white/80"
                      style={{ touchAction: "manipulation" }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        setOpenId(p.root.id);
                        setDraft(p.title);
                        setNaming(true);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="flex h-11 items-center font-display text-lg text-white/80"
                      style={{ touchAction: "manipulation" }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setOpenId(null);
                        void keepOne(p.root.id, p.title);
                      }}
                    >
                      File
                    </button>
                  </div>
                ) : null}
                </div>
                {p.rooms.length > 1
                  ? p.rooms.map((r, i) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 pl-1">
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/55">
                          Room {r.hall || i + 1}
                          {r.id === p.root.id ? " · start" : ""}
                        </p>
                        <a
                          href={`/rune?session=${encodeURIComponent(p.root.id)}&drive=${mode}&hall=${r.hall || i + 1}`}
                          className="font-display text-lg text-[#9ef0e4]"
                          style={{ touchAction: "manipulation" }}
                          onClick={(e) => {
                            e.preventDefault();
                            playSession(p.root.id, "play", r.hall || i + 1);
                          }}
                        >
                          Play
                        </a>
                      </div>
                    ))
                  : null}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-center gap-6">
            <button
              type="button"
              className="min-h-11 px-3 font-mono text-[10px] uppercase tracking-[0.22em] text-white/70"
              style={{ touchAction: "manipulation" }}
              onPointerUp={(e) => {
                e.stopPropagation();
                e.preventDefault();
                void keepRooms();
              }}
            >
              Keep all
            </button>
            <button
              type="button"
              className="min-h-11 px-3 font-mono text-[10px] uppercase tracking-[0.22em] text-white/55"
              style={{ touchAction: "manipulation" }}
              onPointerUp={(e) => {
                e.stopPropagation();
                e.preventDefault();
                fileRef.current?.click();
              }}
            >
              Load file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json,text/plain"
              className="hidden"
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void loadRooms(file);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
