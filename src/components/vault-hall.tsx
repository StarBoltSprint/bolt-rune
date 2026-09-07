import { useEffect, useRef, useState } from "react";
import { dropClipAt, dropRoom, familiesOf, familyHead, filmOf, hangArtifact, hangOnRoom, lastClip, mergeHall, readArtifacts, setPlaylist, uniqueClips, type HungArtifact } from "@/game/artifacts";
import { continuePrompt, readClipSpec, shiftPrompt, stockBiomeFilm, SHIFTS } from "@/game/cook";
import { bindHungRoom } from "@/game/enter-graph";
import { vaultHangRoom, vaultHangStart } from "@/game/path-entry";
import { ClipSpecBar } from "@/components/clip-spec";
import { grabRuneFrame, pollCookPlate, startRuneExtend, startRuneFilm } from "@/lib/cook";
import { hangHall, listHall } from "@/lib/hall";
import { bindCitadel, confirmHangHall, defaultHangRoom, hallN, hangOpensSheet, holdHangRooms, listHangRooms, resolveHangRoom, type HangRoomPick } from "@/game/rooms";
import { hydrateSessions, lastPlay, listSessions, listStoredHallHints } from "@/game/rune-session";
import { HangAskSheet, HangRoomStrip } from "@/components/hang-ask";
import { HANG_LEFTOVER_SWALLOW_MS, sheetConfirmHall, swallowOpeningTap } from "@/game/hang-ask";
import { HallMark } from "@/components/hall-mark";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { FilmStage } from "@/components/film-stage";
import { sfxForge } from "@/game/audio";
import { press } from "@/lib/press";

const HANG_HALL_FLOOR = "bolt-hang-halls-floor";

function readHangFloorPicks(): HangRoomPick[] {
  try {
    const n = Math.max(1, Math.min(8, Number(sessionStorage.getItem(HANG_HALL_FLOOR)) || 1));
    return Array.from({ length: n }, (_, i) => ({
      hall: i + 1,
      name: `Room ${i + 1}`,
      still: "",
      living: i === 0,
    }));
  } catch {
    return [{ hall: 1, name: "Room 1", still: "", living: true }];
  }
}

function writeHangFloor(n: number) {
  try {
    const cur = Number(sessionStorage.getItem(HANG_HALL_FLOOR) || 0);
    sessionStorage.setItem(HANG_HALL_FLOOR, String(Math.max(cur, Math.min(8, n))));
  } catch {
    /* */
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function when(ms: number) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function VaultHall() {
  const [hung, setHung] = useState<HungArtifact[]>([]);
  const [ready, setReady] = useState(false);
  const [play, setPlay] = useState<HungArtifact | null>(null);
  const [frost, setFrost] = useState("");
  const [pct, setPct] = useState(0);
  const [frameHint, setFrameHint] = useState("");
  const [forge, setForge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<Record<string, number>>({});
  const [shift, setShift] = useState<{ a: HungArtifact; at: number } | null>(null);
  const [seed, setSeed] = useState("");
  const [hangRooms, setHangRooms] = useState<HangRoomPick[]>(() => (typeof window === "undefined" ? [{ hall: 1, name: "Room 1", still: "", living: true }] : readHangFloorPicks()));
  const [hangHallN, setHangHallN] = useState(1);
  const [hangAsk, setHangAsk] = useState<{ a: HungArtifact; door: "A" | "B"; rooms: HangRoomPick[] } | null>(null);
  const lock = useRef(false);
  const abort = useRef(false);
  const hungRef = useRef(hung);
  hungRef.current = hung;
  const hangHallRef = useRef(hangHallN);
  hangHallRef.current = hangHallN;
  const hangAskRef = useRef(hangAsk);
  hangAskRef.current = hangAsk;
  const hangRoomsRef = useRef(hangRooms);
  const hangGuard = useRef(0);
  const { user, isPending: authPending } = useCurrentUserState();
  const owned = Boolean(user);

  useEffect(() => {
    const local = readArtifacts();
    if (local.length) setHung(local);
    setReady(true);
    void listHall()
      .then((hall) => {
        const next = mergeHall(hall || [], readArtifacts()).map((a) => ({
          ...a,
          playlist: uniqueClips(a.playlist || []),
        }));
        setHung((prev) => {
          const local = prev.length ? prev : readArtifacts();
          return mergeHall(next, local);
        });
      })
      .catch(() => {
        setHung((prev) => (prev.length ? prev : readArtifacts()));
      });
  }, []);

  function refreshHangRooms(arts = hungRef.current) {
    const extra = listStoredHallHints().map((h) => ({ ...h, living: false }));
    const computed = listHangRooms(listSessions(), lastPlay(), arts, extra, hangRoomsRef.current);
    const rooms = holdHangRooms(hangRoomsRef.current, computed);
    hangRoomsRef.current = rooms;
    writeHangFloor(rooms.length);
    setHangRooms(rooms);
    setHangHallN((prev) => {
      if (hangAskRef.current && hallN(prev)) return prev;
      return rooms.some((r) => r.hall === prev) ? prev : defaultHangRoom(rooms);
    });
    return rooms;
  }

  useEffect(() => {
    refreshHangRooms(hung);
  }, [hung]);

  useEffect(() => {
    const kick = () => {
      void hydrateSessions((rows) => {
        if (rows.length) refreshHangRooms(hungRef.current);
      }).then(() => refreshHangRooms(hungRef.current));
    };
    kick();
    const onVis = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") kick();
    };
    window.addEventListener("focus", kick);
    window.addEventListener("storage", kick);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", kick);
      window.removeEventListener("storage", kick);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  function persistArt(a: HungArtifact) {
    void hangHall({
      data: {
        id: a.id,
        name: a.name,
        still: a.still,
        playlist: a.playlist,
        prompt: a.prompt || "",
        room: a.room === undefined ? null : a.room,
      },
    }).catch(() => {});
  }

  function hangDoor(a: HungArtifact, door: "A" | "B", from?: HungArtifact[], hallWant?: number | string | null) {
    const cit = bindCitadel(listSessions(), lastPlay());
    const rooms = refreshHangRooms(from?.length ? from : hungRef.current);
    const hall = sheetConfirmHall(hallWant, hangHallRef.current) || confirmHangHall(rooms, hallWant ?? hangHallRef.current);
    const pick = rooms.find((r) => r.hall === hall);
    const citadel = pick?.citadel || cit.citadel || undefined;
    const bindHall = hall;
    const hung = hangOnRoom(a.id, bindHungRoom(a, door, { citadel, hall: bindHall }), from?.length ? from : hungRef.current);
    setHung(hung);
    setHangHallN(hall);
    const live = hung.find((x) => x.id === a.id);
    if (!live?.room?.door) {
      setFrost("hang missed — pick the room on the sheet");
      window.setTimeout(() => setFrost(""), 2400);
      return;
    }
    persistArt(live);
    sfxForge("enter");
    setFrost(
      cit.citadel
        ? `${cit.title || "Citadel"} · room ${hall} · door ${door}`
        : `Room ${hall} · door ${door} · Play / Load to walk it`,
    );
    window.setTimeout(() => setFrost(""), 2400);
  }

  function botHang(hallWant?: number | string | null) {
    let list = hungRef.current.length ? hungRef.current : readArtifacts();
    if (!list.length) {
      list = hangArtifact(stockBiomeFilm("asteroid"), true);
      setHung(list);
    }
    const head = list[0];
    if (!head) return;
    const rooms = refreshHangRooms(list);
    if (!hangOpensSheet("bot", rooms.length)) return;
    void askHang(head, "A", hallWant);
  }

  async function askHang(a: HungArtifact, door: "A" | "B", hallWant?: number | string | null) {
    swallowOpeningTap();
    hangGuard.current = (typeof performance !== "undefined" ? performance.now() : Date.now()) + HANG_LEFTOVER_SWALLOW_MS;
    try {
      await hydrateSessions((rows) => {
        if (rows.length) refreshHangRooms(hungRef.current);
      });
    } catch {
      /* Load catalog may already be in memory */
    }
    const rooms = refreshHangRooms();
    const hall = resolveHangRoom(rooms, hallWant ?? hangHallRef.current);
    setHangHallN(hall);
    setHangAsk({ a, door, rooms });
  }

  function playArt(a: HungArtifact) {
    if (hangAskRef.current) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now < hangGuard.current) return;
    const live = hungRef.current.find((x) => x.id === a.id) || a;
    setPlay(live);
  }

  function unhangDoor(a: HungArtifact) {
    const hung = dropRoom(a.id, hungRef.current);
    setHung(hung);
    const live = hung.find((x) => x.id === a.id);
    if (live) persistArt({ ...live, room: null });
    sfxForge("page");
    setFrost("door is a hall again");
    window.setTimeout(() => setFrost(""), 2200);
  }

  async function continueArt(a: HungArtifact, afterIndex?: number, dest?: string) {
    abort.current = false;
    lock.current = true;
    setBusy(true);
    setForge(true);
    setPct(3);
    setFrameHint("");
    setFrost("Imagine is forging");
    sfxForge("cook");
    const spec = readClipSpec();
    const pace = { n: 2, cap: 16 };
    const tick = window.setInterval(() => {
      if (abort.current) return;
      pace.n = Math.min(pace.cap, pace.n + 1);
      setPct(pace.n);
    }, 320);
    function bump(n: number, cap: number, line: string) {
      if (abort.current) return;
      pace.n = Math.max(pace.n, n);
      pace.cap = cap;
      setPct(pace.n);
      setFrost(line);
    }
    try {
      const live = hungRef.current.find((x) => x.id === a.id) || a;
      const family = uniqueClips(live.playlist || []);
      const at = family.length - 1;
      const clip = family[at] || lastClip(live);
      let extendUrl =
        !dest && clip && /^https:\/\//i.test(clip) && !/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(clip) ? clip : "";
      let still = a.still;
      async function grabEnd() {
        if (!clip) return;
        bump(4, 18, "Grabbing the last frame");
        try {
          const grab = await Promise.race([
            grabRuneFrame({ data: { url: clip, at: "end", res: spec.res } }),
            new Promise<null>((r) => window.setTimeout(() => r(null), 14000)),
          ]);
          if (grab?.ok) still = grab.url;
        } catch {
          /* keep still */
        }
      }
      if (!extendUrl && clip) await grabEnd();
      if (abort.current) return;
      bump(
        12,
        28,
        dest
          ? `Imagine shifts · ${spec.secs}s ${spec.res}p`
          : extendUrl
            ? `Imagine continues the film · ${spec.secs === 10 ? 10 : 6}s`
            : `Imagine continues · ${spec.secs}s ${spec.res}p`,
      );
      const prompt = dest
        ? shiftPrompt(a.prompt || a.name, dest, spec.secs, family.length + 1)
        : continuePrompt(a.prompt || a.name, spec.secs, family.length + 1);
      let started: { ok: true; requestId: string } | { ok: false; error: string } | null = null;
      for (let t = 0; t < 14; t++) {
        if (abort.current) return;
        try {
          started = await Promise.race([
            extendUrl
              ? startRuneExtend({
                  data: {
                    video: extendUrl,
                    prompt,
                    duration: spec.secs,
                  },
                })
              : startRuneFilm({
                  data: {
                    still,
                    prompt,
                    duration: spec.secs,
                    res: spec.res,
                  },
                }),
            new Promise<{ ok: false; error: string }>((r) => window.setTimeout(() => r({ ok: false, error: "timeout" }), 55000)),
          ]);
        } catch (err) {
          started = { ok: false, error: err instanceof Error ? err.message : "net" };
        }
        if (started.ok) break;
        if (started.error === "echo-off") {
          bump(36, 36, "Imagine is dark · Cancel then try again");
          return;
        }
        if (started.error === "busy" || started.error === "cooldown") {
          bump(Math.max(12, pace.n), 40, "Imagine finishing the last clip · waiting");
          await sleep(6000 + t * 1500);
          continue;
        }
        if (extendUrl) {
          extendUrl = "";
          await grabEnd();
          if (abort.current) return;
          bump(12, 28, `Imagine continues · ${spec.secs}s ${spec.res}p`);
          continue;
        }
        bump(Math.max(12, pace.n), pace.n, started.error);
        await sleep(1600);
      }
      if (abort.current) return;
      if (!started?.ok) {
        bump(36, 36, "Imagine busy · Cancel, then Continue again");
        return;
      }
      const stretching = Boolean(extendUrl);
      bump(32, 99, stretching ? "Imagine continues the film" : "Imagine is forging clip " + (at + 2));
      const t0 = Date.now();
      const expect = spec.secs * (spec.res === "1080" ? 9000 : 4500);
      for (let p = 0; p < 200; p++) {
        if (abort.current) return;
        await sleep(2000);
        if (abort.current) return;
        let polled;
        try {
          polled = await pollCookPlate({ data: { requestId: started.requestId } });
        } catch {
          continue;
        }
        if (!polled.ok) continue;
        const timePct = 32 + Math.min(67, Math.round(((Date.now() - t0) / expect) * 67));
        const livePct = Math.max(pace.n, polled.pct ?? timePct);
        pace.n = Math.min(99, livePct);
        setPct(pace.n);
        if (polled.frame) setFrameHint(polled.frame);
        setFrost(polled.frame ? `frame ${polled.frame}` : stretching ? "Imagine continues the film" : `Imagine is forging clip ${at + 2}`);
        if (polled.status === "done" && polled.url) {
          const chain = uniqueClips(stretching ? [...family.slice(0, Math.max(0, family.length - 1)), polled.url] : [...family, polled.url]);
          const next = setPlaylist(
            a.id,
            chain,
            {
              still,
              prompt: dest || a.prompt || a.name,
            },
            hungRef.current,
          );
          if (next.length) setHung(next);
          void hangHall({
            data: {
              id: a.id,
              name: a.name,
              still,
              playlist: chain,
              prompt: dest || a.prompt || a.name,
            },
          }).catch(() => {});
          pace.n = 100;
          setPct(100);
          setFrameHint("");
          setFrost(stretching ? "same film · continued" : `Clip ${at + 2} hung · ${spec.secs}s MP4`);
          return;
        }
        if (polled.status === "failed") {
          bump(0, 0, "Imagine dropped the plate");
          return;
        }
      }
      bump(99, 99, "Still forging · keep this open");
    } finally {
      window.clearInterval(tick);
      lock.current = false;
      setBusy(false);
      if (abort.current) {
        setForge(false);
        setPct(0);
        setFrameHint("");
        setFrost("");
      } else if (pace.n >= 100 || pace.n <= 0) {
        window.setTimeout(() => {
          setForge(false);
          setPct(0);
          setFrameHint("");
          setFrost("");
        }, 2400);
      }
    }
  }

  function cancelForge() {
    abort.current = true;
    lock.current = false;
    setBusy(false);
    setForge(false);
    setPct(0);
    setFrameHint("");
    setFrost("Cancelled");
    window.setTimeout(() => setFrost(""), 1600);
  }

  const packs = familiesOf(hung);
  const clipCount = packs.reduce((n, f) => n + f.playlist.length, 0);

  if (play) {
    const live = hung.find((x) => x.id === play.id) || play;
    const film = filmOf(live, hung);
    return (
      <FilmStage
        id="sprint"
        original={false}
        custom={film}
        holdDoor={live.room?.door === "B" ? "B" : live.room?.door === "A" ? "A" : undefined}
        onHallDoor={() => {
          /* hung biome stay — Leave exits */
        }}
        onExit={() => setPlay(null)}
        onDone={() => {
          /* stay on biome — Leave calls onExit */
        }}
      />
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg" data-vault-hall="10" style={{ touchAction: "manipulation" }}>
      <img src="/ui/forge.jpg?v=aaa" alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-50" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,12,0.72)_0%,rgba(7,8,12,0.45)_36%,rgba(7,8,12,0.82)_100%)]" />
      <div className="relative z-10 flex min-h-dvh flex-col px-5 pt-[max(1.4rem,env(safe-area-inset-top))] pb-[max(1.4rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-3">
          <a
            href="/"
            className="self-start font-mono text-[10px] uppercase tracking-[0.42em] text-white/55"
            style={{ touchAction: "manipulation" }}
          >
            Back
          </a>
          <HallMark />
        </div>
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.48em] text-white/45">Forge</p>
        <h1 className="mt-1 font-display text-[2.6rem] leading-none text-white/90 drop-shadow-[0_10px_28px_rgba(0,0,0,0.9)]">
          Vault
        </h1>
        <p className="mt-3 max-w-xs font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
          {!ready || authPending
            ? "opening the coffre"
            : packs.length
              ? owned
                ? `${packs.length} run${packs.length > 1 ? "s" : ""} · ${clipCount} clip${clipCount > 1 ? "s" : ""} chained`
                : `${packs.length} on this device · keep to carry the hall`
              : owned
                ? "this is the store · cook on the right, they land here"
                : "this device · keep the hall so nobody else can overwrite it"}
        </p>
        <div className="mt-4">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-white/40">Next continue / shift</p>
          <ClipSpecBar disabled={busy} />
          <button
            type="button"
            data-hang-bot={vaultHangStart("bot").dataHang}
            {...vaultHangRoom(resolveHangRoom(hangRooms, hangHallN))}
            disabled={busy}
            className="mt-3 w-full rounded-2xl border border-[#9ef0e4]/35 bg-black/40 px-3 py-3 text-left font-display text-xl text-[#9ef0e4] disabled:opacity-40"
            style={{ touchAction: "manipulation" }}
            {...press(() => {
              if (busy) return;
              botHang(hangHallRef.current);
            })}
          >
            Grok Bot Hang
            <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">
              pick room · then door A · {hangRooms.length} hall{hangRooms.length === 1 ? "" : "s"}
            </span>
          </button>
        </div>

        {packs.length ? (
          <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto pb-4">
            <div className="sticky top-0 z-20 -mx-1 mb-3 rounded-2xl border border-[#9ef0e4]/25 bg-black/80 px-3 py-3 backdrop-blur-sm">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#9ef0e4]">
                Hang on room{hangRooms.length > 1 ? ` · ${hangRooms.length} halls` : " · Room 1"}
              </p>
              <HangRoomStrip rooms={hangRooms} hall={hangHallN} onHall={setHangHallN} disabled={busy} />
              <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/45">
                then Hang A or Hang B on a pack — pick the room on the sheet
              </p>
            </div>
            <div className={`grid min-h-0 gap-3 ${packs.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
            {packs.map((f) => {
              const head = familyHead(f);
              const n = f.playlist.length;
              const chosen = pick[f.id] ?? Math.max(0, n - 1);
              const hungOn = head.room?.door;
              const roomN = head.room?.hall || 1;
                  const thumbs = (f.stamps?.length ? f.stamps : f.playlist.map((url, i) => ({
                    url,
                    still: f.stills[i] || f.stills[f.stills.length - 1] || f.still,
                    at: f.members[Math.min(i, f.members.length - 1)]?.hungAt || f.hungAt,
                  })));
              return (
                <div key={f.id} className="overflow-hidden rounded-2xl border border-[#e4c37a]/35 bg-black/50">
                  <div className={`flex ${packs.length === 1 ? "h-52" : "h-40"}`}>
                    {hungOn ? (
                      <div className="relative min-w-[22%] flex-1 ring-2 ring-inset ring-[#9ef0e4]">
                        <img src="/films/citadel-tour.jpg" alt="" className="h-full w-full object-cover" />
                        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#9ef0e4]">
                          room {roomN}
                        </span>
                      </div>
                    ) : null}
                    {thumbs.map((clip, i) => (
                      <button
                        key={`${f.id}-c${i}`}
                        type="button"
                        className={`relative min-w-0 flex-1 ${chosen === i ? "ring-2 ring-inset ring-[#e4c37a]" : "opacity-70"}`}
                        style={{ touchAction: "manipulation" }}
                        onPointerUp={() => setPick((p) => ({ ...p, [f.id]: i }))}
                      >
                        {clip.still ? <img src={clip.still} alt="" className="h-full w-full object-cover" /> : <div className="h-full bg-black/40" />}
                        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#f0d48a]">
                          {i + 1}
                          {n <= 2 && clip.at ? ` · ${when(clip.at)}` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    data-play-sprint=""
                    className="block w-full px-3 pt-2 pb-2 text-left"
                    style={{ touchAction: "manipulation" }}
                    {...press(() => {
                      if (busy) return;
                      if (n < 1) {
                        setFrost("No clip yet. Howl again — Imagine never landed a video.");
                        return;
                      }
                      sfxForge("enter");
                      playArt(head);
                    })}
                  >
                    <p className="font-display text-xl text-ice">{f.name}</p>
                    <p className={`mt-1 font-mono text-[9px] uppercase tracking-[0.16em] ${hungOn ? "text-[#9ef0e4]" : "text-white/35"}`}>
                      {hungOn ? `Room ${roomN} • Door ${hungOn} Play Sprint` : "not on a door"}
                    </p>
                    <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/40">
                      {n > 1 ? `play all · ${n} clips` : n === 1 ? "play sprint" : "still only · no video yet"}
                    </p>
                  </button>
                  <div className="grid grid-cols-2 border-t border-white/10">
                    <button
                      type="button"
                      className="border-r border-white/10 px-2 py-3 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-[#f0d48a]"
                      style={{ touchAction: "manipulation" }}
                      {...press(() => {
                        abort.current = false;
                        lock.current = false;
                        setBusy(true);
                        setForge(true);
                        setPct(1);
                        setFrost("Continue");
                        void continueArt(head, chosen);
                      })}
                    >
                      Continue
                      <span className="mt-0.5 block text-[8px] tracking-[0.12em] text-white/35">add clip {n + 1} · last frame</span>
                    </button>
                    <button
                      type="button"
                      className="px-2 py-3 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-[#9ef0e4]"
                      style={{ touchAction: "manipulation" }}
                      {...press(() => {
                        setSeed("");
                        setShift({ a: head, at: chosen });
                      })}
                    >
                      Shift
                      <span className="mt-0.5 block text-[8px] tracking-[0.12em] text-white/35">biome from clip {chosen + 1}</span>
                    </button>
                  </div>
                  <div className="flex border-t border-white/10">
                    <button
                      type="button"
                      disabled={busy || n < 1}
                      className={`flex-1 px-3 py-2.5 text-left font-mono text-[9px] uppercase tracking-[0.14em] text-[#f0b4a8] disabled:opacity-30 ${n < 1 ? "invisible" : ""}`}
                      style={{ touchAction: "manipulation" }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (busy || n < 1) return;
                        const gone = dropClipAt(f.id, chosen, hung);
                        setHung(gone);
                        setPick((p) => ({ ...p, [f.id]: Math.max(0, Math.min(chosen, Math.max(0, (gone.find((x) => x.id === f.id)?.playlist.length || 1) - 1))) }));
                        setFrost(`Erased clip ${chosen + 1} · ${familiesOf(gone).length} artifact${familiesOf(gone).length === 1 ? "" : "s"} left`);
                        window.setTimeout(() => setFrost(""), 2200);
                      }}
                    >
                      Erase clip {chosen + 1}
                    </button>
                    {hungOn ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="flex-1 px-3 py-2.5 text-right font-mono text-[9px] uppercase tracking-[0.14em] text-[#9ef0e4] disabled:opacity-30"
                        style={{ touchAction: "manipulation" }}
                        onPointerUp={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (busy) return;
                          unhangDoor(head);
                        }}
                      >
                        Unhang · room {roomN} {hungOn}
                      </button>
                    ) : (
                      <span className="flex flex-1">
                        <button
                          type="button"
                          disabled={busy}
                          data-hang={vaultHangStart("A").dataHang}
                          {...vaultHangRoom(hangHallN)}
                          className="flex-1 px-2 py-2.5 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-[#9ef0e4] disabled:opacity-30"
                          style={{ touchAction: "manipulation" }}
                          {...press(() => {
                            if (busy) return;
                            void askHang(head, "A", hangHallRef.current);
                          })}
                        >
                          Hang A
                          <span className="mt-0.5 block text-[8px] tracking-[0.12em] text-white/40">pick room</span>
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          data-hang={vaultHangStart("B").dataHang}
                          {...vaultHangRoom(hangHallN)}
                          className="flex-1 px-2 py-2.5 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-[#f0d48a] disabled:opacity-30"
                          style={{ touchAction: "manipulation" }}
                          {...press(() => {
                            if (busy) return;
                            void askHang(head, "B", hangHallRef.current);
                          })}
                        >
                          Hang B
                          <span className="mt-0.5 block text-[8px] tracking-[0.12em] text-white/40">pick room</span>
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        ) : ready ? (
          <div className="mt-auto mb-6 flex flex-col items-center gap-6">
            <p className="text-center font-display text-3xl text-white/70">Empty</p>
            <p className="max-w-xs text-center font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
              hung films land here after a cook. citadel plays live under Runes.
              {authPending || owned ? "" : " this coffre is this device until you keep it."}
            </p>
            {authPending || owned ? null : (
              <a
                href="/login"
                className="font-display text-4xl text-[#f0d48a] drop-shadow-[0_0_18px_rgba(228,195,122,0.5)]"
                style={{ touchAction: "manipulation" }}
              >
                Keep
              </a>
            )}
            <a
              href="/rune"
              className="font-display text-4xl text-[#9ef0e4] drop-shadow-[0_0_18px_rgba(158,240,228,0.45)]"
              style={{ touchAction: "manipulation" }}
            >
              Play / Load
            </a>
            <a
              href="/artifacts"
              className="font-display text-4xl text-[#f0d48a] drop-shadow-[0_0_18px_rgba(228,195,122,0.5)]"
              style={{ touchAction: "manipulation" }}
            >
              Cook in Artifacts
            </a>
          </div>
        ) : (
          <p className="mt-auto mb-10 text-center font-mono text-[10px] uppercase tracking-[0.28em] text-white/30">
            opening
          </p>
        )}
      </div>
      {hangAsk ? (
        <HangAskSheet
          door={hangAsk.door}
          name={hangAsk.a.name}
          rooms={hangRooms.length >= hangAsk.rooms.length ? hangRooms : hangAsk.rooms}
          hall={hangHallN}
          onHall={setHangHallN}
          onClose={() => setHangAsk(null)}
          onConfirm={(hall) => {
            hangDoor(hangAsk.a, hangAsk.door, undefined, hall);
            setHangAsk(null);
          }}
        />
      ) : null}
      {shift ? (
        <div className="absolute inset-0 z-50 flex flex-col bg-black/82 px-5 pt-[max(1.6rem,env(safe-area-inset-top))] pb-[max(1.6rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            className="self-start font-mono text-[10px] uppercase tracking-[0.42em] text-white/55"
            style={{ touchAction: "manipulation" }}
            onPointerUp={() => setShift(null)}
          >
            Close
          </button>
          <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.28em] text-white/45">From clip {shift.at + 1} last frame</p>
          <h2 className="mt-1 font-display text-4xl text-white/90">Shift biome</h2>
          <p className="mt-2 max-w-xs font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
            The world transforms in-camera. Same wolf, no cut. Uses the length and picture you set in the Vault.
          </p>
          <div className="mt-4">
            <ClipSpecBar disabled={busy} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {SHIFTS.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy}
                className="rounded-full border border-[#e4c37a]/35 bg-black/50 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#f0d48a] disabled:opacity-40"
                style={{ touchAction: "manipulation" }}
                onPointerUp={() => {
                  setShift(null);
                  void continueArt(shift.a, shift.at, s.world);
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="or type your world"
            className="mt-5 w-full rounded-2xl border border-white/15 bg-black/50 px-4 py-3 font-mono text-sm text-ice outline-none placeholder:text-white/30"
          />
          <button
            type="button"
            disabled={busy || !seed.trim()}
            className="mt-3 rounded-2xl border border-[#9ef0e4]/40 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[#9ef0e4] disabled:opacity-40"
            style={{ touchAction: "manipulation" }}
            onPointerUp={() => {
              const line = seed.trim();
              if (!line) return;
              setShift(null);
              void continueArt(shift.a, shift.at, line);
            }}
          >
            Cook this world
          </button>
        </div>
      ) : null}
      {forge || busy ? (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/80">
          <p className="font-display text-[5.8rem] leading-none text-ice drop-shadow-[0_10px_28px_rgba(0,0,0,0.8)]">
            {Math.max(1, pct)}%
          </p>
          <p className="mt-3 px-6 text-center font-mono text-[11px] uppercase tracking-[0.28em] text-ice">
            {frameHint ? `frame ${frameHint}` : frost || "Imagine is forging"}
          </p>
          <div className="mt-6 h-[2px] w-40 overflow-hidden bg-white/15">
            <div className="h-full bg-ice" style={{ width: `${Math.max(2, pct)}%` }} />
          </div>
          <button
            type="button"
            className="mt-12 min-h-12 rounded-full border border-white/45 px-8 font-mono text-[11px] uppercase tracking-[0.22em] text-white"
            style={{ touchAction: "manipulation" }}
            {...press(cancelForge)}
          >
            Cancel
          </button>
        </div>
      ) : frost ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 px-5 pb-[max(1.6rem,env(safe-area-inset-bottom))]">
          <p className="rounded-2xl border border-[#e4c37a]/30 bg-black/75 px-4 py-3 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-[#f0d48a]">
            {frost}
          </p>
        </div>
      ) : null}
    </div>
  );
}
