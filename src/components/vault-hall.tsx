import { useEffect, useRef, useState } from "react";
import { dropClipAt, dropRoom, familiesOf, familyHead, filmOf, hangArtifact, hangOnRoom, lastClip, mergeHall, readArtifacts, setPlaylist, uniqueClips, type HungArtifact } from "@/game/artifacts";
import { continuePrompt, cookFilm, readClipSpec, shiftPrompt, stockBiomeFilm, SHIFTS } from "@/game/cook";
import { bindHungRoom, doorLetterOf, hangThumbStill, hungPlayChrome, vaultHangCaption, walkHangHallHref, walkHungHref } from "@/game/enter-graph";
import {
  bindHangRefRoom,
  hangMediaSrc,
  hangRefFlags,
  hangRefKind,
  hallGraphArt,
  hangSlotPreview,
  hungOnRole,
  isContinuityOnlyFail,
  isHangGraphArt,
  isHangRefRole,
  isHangMediaUrl,
  isImaginePostUrl,
  isLegacyDoorHang,
  parseImaginePostUrl,
  rehomeHungGraph,
  slotsFromHung,
  slotWrites,
  type HangRefRole,
  type HangRefSlots,
  HANG_GRAPH_PROMPT,
  HANG_REF_GRAPH_HALL,
} from "@/game/hang-ref";
import { lintSmoke, mayHang, smokeForgeFrost } from "@/game/smoke-gate";
import { vaultHangRoom, vaultHangStart } from "@/game/path-entry";
import { ClipSpecBar } from "@/components/clip-spec";
import { grabRuneFrame, pollCookPlate, startRuneExtend, startRuneFilm } from "@/lib/cook";
import { CLIP_TOO_LARGE_FROST, clipRetryFrost, cookClipTooLarge, cookFrameHint, cookFrameLine, nextSmallerClipSpec } from "@/lib/cook-progress";
import { hangHall, listHall } from "@/lib/hall";
import { bindCitadel, defaultHangRoom, hallN, hangOpensSheet, holdHangRooms, listHangCitadels, listHangRooms, resolveHangRoom, type HangCitadelPick, type HangRoomPick } from "@/game/rooms";
import { hydrateSessions, lastPlay, listSessions, listStoredHallHints, LOAD_DROP_EVENT, stampPlay } from "@/game/rune-session";
import { HangAskSheet, HangRefSheet, StillCarousel, StillChip } from "@/components/hang-ask";
import { HANG_HALL_FLOOR, HANG_LEFTOVER_SWALLOW_MS, hangActEnters, hangBindHall, hangDoorAct, hangStillWrap, swallowOpeningTap, writeHangFloor, writeHangPending, type HangDoorAct } from "@/game/hang-ask";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { FilmStage } from "@/components/film-stage";
import { DoorChatLine } from "@/components/door-chat-line";
import { sfxForge } from "@/game/audio";
import { press } from "@/lib/press";

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
  const [hangCitadel, setHangCitadel] = useState("");
  const [hangCitadels, setHangCitadels] = useState<HangCitadelPick[]>([]);
  const [hangAsk, setHangAsk] = useState<{ a: HungArtifact; door: "A" | "B"; rooms: HangRoomPick[] } | null>(null);
  const [hangRef, setHangRef] = useState(true);
  const [refSlots, setRefSlots] = useState<HangRefSlots>({});
  const [refKeep, setRefKeep] = useState(false);
  const [refFlag, setRefFlag] = useState("");
  const [refHung, setRefHung] = useState(false);
  const [vaultAt, setVaultAt] = useState(0);
  const [seatChrome, setSeatChrome] = useState(false);
  const lock = useRef(false);
  const abort = useRef(false);
  const hungRef = useRef(hung);
  hungRef.current = hung;
  const hangHallRef = useRef(hangHallN);
  hangHallRef.current = hangHallN;
  const hangAskRef = useRef(hangAsk);
  hangAskRef.current = hangAsk;
  const hangRoomsRef = useRef(hangRooms);
  const hangCitadelRef = useRef(hangCitadel);
  hangCitadelRef.current = hangCitadel;
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

  function refreshHangRooms(arts = hungRef.current, release = false) {
    const last = lastPlay();
    const rows = listSessions();
    const cit = bindCitadel(rows, last, hangCitadelRef.current);
    hangCitadelRef.current = cit.citadel;
    setHangCitadel(cit.citadel);
    const citadels = listHangCitadels(rows, last, cit.citadel);
    setHangCitadels(citadels);
    const extra = listStoredHallHints(cit.citadel).map((h) => ({ ...h, living: false, citadel: cit.citadel || undefined }));
    const computed = listHangRooms(rows, last, arts, extra, release ? [] : hangRoomsRef.current, cit.citadel);
    const held = holdHangRooms(release ? [] : hangRoomsRef.current, computed, release);
    const bind = hangBindHall(hangHallRef.current);
    const rooms = held.map((r) => ({ ...r, living: bind ? r.hall === bind : r.living }));
    hangRoomsRef.current = rooms;
    writeHangFloor(rooms.length, release ? "set" : "hold");
    setHangRooms(rooms);
    setHangHallN((prev) => {
      if (hangAskRef.current && hallN(prev) && rooms.some((r) => r.hall === prev)) return prev;
      if (bind && rooms.some((r) => r.hall === bind)) return bind;
      return rooms.some((r) => r.hall === prev) ? prev : defaultHangRoom(rooms);
    });
    return rooms;
  }

  useEffect(() => {
    refreshHangRooms(hung);
    const from = slotsFromHung(hung, HANG_REF_GRAPH_HALL);
    if (Object.keys(from).length) setRefHung(true);
    setRefSlots((prev) => ({ ...from, ...prev }));
  }, [hung]);

  useEffect(() => {
    const kick = () => {
      void hydrateSessions((rows) => {
        if (rows.length) refreshHangRooms(hungRef.current);
      }).then(() => refreshHangRooms(hungRef.current));
    };
    const onDrop = () => {
      const arts = readArtifacts();
      setHung(arts);
      const next = refreshHangRooms(arts, true);
      setHangAsk((cur) => (cur ? { ...cur, rooms: next } : cur));
    };
    kick();
    const onVis = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") kick();
    };
    window.addEventListener("focus", kick);
    window.addEventListener("storage", kick);
    window.addEventListener(LOAD_DROP_EVENT, onDrop);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", kick);
      window.removeEventListener("storage", kick);
      window.removeEventListener(LOAD_DROP_EVENT, onDrop);
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

  function pickHangHall(n: number) {
    const hall = hangBindHall(n);
    if (!hall) return;
    hangHallRef.current = hall;
    setHangHallN(hall);
  }

  function pickHangCitadel(id: string) {
    if (!id || id === hangCitadelRef.current) return;
    hangCitadelRef.current = id;
    setHangCitadel(id);
    const kept = hangRoomsRef.current.filter((r) => r.citadel === id);
    hangRoomsRef.current = kept;
    hangHallRef.current = 0;
    const rooms = refreshHangRooms();
    setHangAsk((cur) => (cur ? { ...cur, rooms } : cur));
    const next = defaultHangRoom(rooms);
    hangHallRef.current = next;
    setHangHallN(next);
  }

  function hangDoor(a: HungArtifact, door: "A" | "B", from?: HungArtifact[], hallWant?: number | string | null, act?: HangDoorAct | string | null) {
    const cit = bindCitadel(listSessions(), lastPlay(), hangCitadelRef.current);
    const rooms = refreshHangRooms(from?.length ? from : hungRef.current);
    const bindHall = hangBindHall(hallWant);
    if (!bindHall) {
      setFrost("hang missed — pick the room on the sheet");
      window.setTimeout(() => setFrost(""), 2400);
      return;
    }
    const letter = doorLetterOf(door);
    const pick = rooms.find((r) => r.hall === bindHall);
    const citadel = pick?.citadel || hangCitadelRef.current || cit.citadel || undefined;
    const fromHall = a.room?.hall && hallN(a.room.hall) ? a.room.hall : HANG_REF_GRAPH_HALL;
    let hung = hangOnRoom(a.id, bindHungRoom(a, letter, { citadel, hall: bindHall }), from?.length ? from : hungRef.current);
    if (isHangGraphArt(a) || isHangRefRole(a.room?.role)) {
      hung = rehomeHungGraph(hung, fromHall, bindHall, citadel);
      for (const art of hung.filter((x) => x.id !== a.id && x.room?.hall === bindHall && x.room?.role)) {
        persistArt(art);
      }
    }
    setHung(hung);
    hangHallRef.current = bindHall;
    setHangHallN(bindHall);
    const live = hung.find((x) => x.id === a.id);
    if (!live?.room?.door || hangBindHall(live.room.hall) !== bindHall || live.room.door !== letter) {
      setFrost("hang missed — pick the room on the sheet");
      window.setTimeout(() => setFrost(""), 2400);
      return;
    }
    persistArt(live);
    hangGuard.current = (typeof performance !== "undefined" ? performance.now() : Date.now()) + HANG_LEFTOVER_SWALLOW_MS;
    swallowOpeningTap();
    setHangRooms((prev) => prev.map((r) => ({ ...r, living: r.hall === bindHall })));
    const roomsN = Math.max(
      bindHall,
      hangRoomsRef.current.filter((r) => !r.citadel || r.citadel === citadel).length,
      lastPlay()?.id === citadel ? lastPlay()?.rooms || 1 : 1,
    );
    if (citadel || cit.citadel) stampPlay(citadel || cit.citadel, cit.title, bindHall, roomsN);
    const chrome = hungPlayChrome(bindHall, letter);
    /* Hang A/B Bind stays on the card. Only Hang & enter walks the hall. */
    if (hangActEnters(act)) {
      sfxForge("enter");
      const href = walkHungHref(live.room, roomsN) || walkHangHallHref(citadel, bindHall, roomsN);
      if (href) {
        window.location.assign(href);
        return;
      }
    } else {
      sfxForge("page");
    }
    setFrost(
      hangActEnters(act)
        ? cit.citadel
          ? `${cit.title || "Citadel"} · ${chrome.keeper}`
          : `${chrome.keeper} · Play / Load to walk it`
        : `${chrome.keeper} · hung · Play to walk`,
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
    if (hangAskRef.current) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now < hangGuard.current) return;
    swallowOpeningTap();
    hangGuard.current = (typeof performance !== "undefined" ? performance.now() : Date.now()) + HANG_LEFTOVER_SWALLOW_MS;
    const rooms = refreshHangRooms();
    const hall = resolveHangRoom(rooms, hallWant ?? hangHallRef.current);
    hangHallRef.current = hall;
    setHangHallN(hall);
    const ask = { a, door, rooms };
    hangAskRef.current = ask;
    setHangAsk(ask);
    try {
      await hydrateSessions((rows) => {
        if (rows.length) refreshHangRooms(hungRef.current);
      });
    } catch {
      /* Load catalog may already be in memory */
    }
    if (!hangAskRef.current) return;
    const next = refreshHangRooms();
    hangAskRef.current = { ...hangAskRef.current, rooms: next };
    setHangAsk((cur) => (cur ? { ...cur, rooms: next } : cur));
  }

  function openHangRef() {
    if (busy) return;
    swallowOpeningTap();
    refreshHangRooms();
    setRefSlots((prev) => ({ ...slotsFromHung(hungRef.current, HANG_REF_GRAPH_HALL), ...prev }));
    setHangRef(true);
    setRefFlag("");
  }

  function takeRefFile(role: HangRefRole, file: File) {
    if (!file || !/^video\//i.test(file.type) && !/\.mp4$/i.test(file.name)) {
      setRefFlag("need an mp4");
      return;
    }
    const prev = refSlots[role] || "";
    if (prev.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(prev);
      } catch {
        /* */
      }
    }
    setRefSlots((cur) => ({ ...cur, [role]: URL.createObjectURL(file) }));
    setRefFlag("9:16 preferred");
  }

  function takeRefUrl(role: HangRefRole, raw: string) {
    const t = raw.trim();
    if (!t) {
      setRefSlots((cur) => {
        const next = { ...cur };
        delete next[role];
        return next;
      });
      return;
    }
    const post = parseImaginePostUrl(t);
    if (post.ok) {
      setRefSlots((cur) => ({ ...cur, [role]: post.url }));
      setRefFlag("Imagine post · hang then Play");
      return;
    }
    if (isHangMediaUrl(t)) {
      setRefSlots((cur) => ({ ...cur, [role]: t }));
      setRefFlag("9:16 preferred");
      return;
    }
    setRefSlots((cur) => ({ ...cur, [role]: t }));
    setRefFlag("mp4 or grok.com/imagine/post");
  }

  function playHungGraph() {
    const href = walkHangHallHref(undefined, HANG_REF_GRAPH_HALL, 1);
    if (!href) return;
    sfxForge("enter");
    window.location.assign(href);
  }

  function askHangGraph(door: "A" | "B") {
    const arts = hungRef.current.length ? hungRef.current : readArtifacts();
    const bundle =
      hallGraphArt(arts) ||
      hungOnRole(arts, "walk-A", HANG_REF_GRAPH_HALL) ||
      hungOnRole(arts, "walk-B", HANG_REF_GRAPH_HALL) ||
      hungOnRole(arts, "breath-spawn", HANG_REF_GRAPH_HALL) ||
      arts[0];
    if (!bundle) {
      setFrost("hang the slots first");
      window.setTimeout(() => setFrost(""), 2400);
      return;
    }
    void askHang(bundle, door, hangHallRef.current);
  }

  function hangPlayerRef(_hallWant?: number | string | null) {
    const writes = slotWrites(refSlots);
    const bindHall = HANG_REF_GRAPH_HALL;
    if (!writes.length) {
      setFrost("hang missed — paste a clip");
      window.setTimeout(() => setFrost(""), 2400);
      return;
    }
    const passed: Array<{ role: HangRefRole; url: string }> = [];
    const blocked: string[] = [];
    for (const { role, url } of writes) {
      const kind = hangRefKind(role);
      const play = hangMediaSrc(url) || (isImaginePostUrl(url) ? url : "");
      const smoke = lintSmoke({
        kind,
        when: "hang",
        clip: play || url,
        still: play || url,
      });
      if (mayHang(smoke, refKeep)) {
        passed.push({ role, url });
        continue;
      }
      if (isContinuityOnlyFail(smoke)) {
        setRefKeep(true);
        setRefFlag(`${role} · Continuity FAIL · KEEP to hang`);
        setFrost(`${role} · Continuity FAIL · KEEP to hang`);
        window.setTimeout(() => setFrost(""), 2800);
        return;
      }
      blocked.push(`${role} · ${smokeForgeFrost(smoke.reasons) || "smoke FAIL"}`);
    }
    if (!passed.length) {
      setRefFlag(blocked[0] || "hang missed — paste a clip");
      setFrost(blocked[0] || "hang missed — paste a clip");
      window.setTimeout(() => setFrost(""), 2800);
      return;
    }
    let arts = hungRef.current.length ? hungRef.current : readArtifacts();
    for (const { role, url } of passed) {
      const play = hangMediaSrc(url) || (isImaginePostUrl(url) ? url : url);
      const smoke = lintSmoke({
        kind: hangRefKind(role),
        when: "hang",
        clip: play,
        still: play,
      });
      const flags = hangRefFlags(smoke, refKeep);
      const existing = hungOnRole(arts, role, bindHall);
      if (existing) {
        arts = setPlaylist(existing.id, [url], { still: existing.still, name: role }, arts);
        arts = hangOnRoom(
          existing.id,
          bindHangRefRoom(role, {
            hall: bindHall,
            still: existing.still,
            trans: hangMediaSrc(url) || url,
            flags,
          }),
          arts,
        );
      } else {
        const film = cookFilm(role, "", [url], role);
        const hung = hangArtifact(film, true, undefined, smoke, undefined, refKeep);
        const art = hung[0];
        if (!art) continue;
        arts = hangOnRoom(
          art.id,
          bindHangRefRoom(role, {
            hall: bindHall,
            still: art.still,
            trans: hangMediaSrc(url) || url,
            flags,
          }),
          hung,
        );
      }
      const live = arts.find((x) => (existing ? x.id === existing.id : x.room?.role === role && x.room?.hall === bindHall));
      if (live) persistArt(live);
    }
    for (const a of arts.filter((x) => isLegacyDoorHang(x, bindHall))) {
      arts = dropRoom(a.id, arts);
      const live = arts.find((x) => x.id === a.id);
      if (live) persistArt({ ...live, room: null });
    }
    const urls = passed.map((p) => p.url);
    const pic = hangMediaSrc(urls[0] || "") || urls[0] || "";
    const have = hallGraphArt(arts);
    if (have) {
      arts = setPlaylist(have.id, urls, { still: have.still || pic, name: "Hall", prompt: HANG_GRAPH_PROMPT }, arts);
    } else {
      arts = hangArtifact(cookFilm("Hall", pic, urls, HANG_GRAPH_PROMPT), true, undefined, { smoke: "PASS", reasons: [] }, undefined, true);
    }
    const bundle = hallGraphArt(arts);
    if (bundle) persistArt(bundle);
    setHung(arts);
    hangHallRef.current = bindHall;
    setHangHallN(bindHall);
    setRefHung(true);
    setHangRef(true);
    sfxForge("page");
    if (blocked.length) setRefFlag(blocked[0]);
    setFrost(blocked.length ? `hall hung · ${blocked[0]}` : "hall hung · Play to walk");
    window.setTimeout(() => setFrost(""), 2400);
  }

  function playArt(a: HungArtifact) {
    if (hangAskRef.current) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (now < hangGuard.current) return;
    const live = hungRef.current.find((x) => x.id === a.id) || a;
    const roomsN = Math.max(hangBindHall(live.room?.hall) || 1, hangRoomsRef.current.length, lastPlay()?.rooms || 1);
    const href = walkHungHref(live.room, roomsN);
    if (href) {
      if (live.room?.citadel) stampPlay(live.room.citadel, undefined, hangBindHall(live.room.hall) || undefined, roomsN);
      window.location.assign(href);
      return;
    }
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
    let spec = readClipSpec();
    const pace = { n: 2, cap: 16 };
    let outcome: "ok" | "fail" | "abort" | "wait" = "fail";
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
      if (abort.current) {
        outcome = "abort";
        return;
      }
      for (let pass = 0; pass < 4; pass++) {
        if (abort.current) {
          outcome = "abort";
          return;
        }
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
        let sizeAtStart = false;
        for (let t = 0; t < 14; t++) {
          if (abort.current) {
            outcome = "abort";
            return;
          }
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
          if (started.error === "clip-too-large" || cookClipTooLarge(started.error)) {
            sizeAtStart = true;
            break;
          }
          if (extendUrl) {
            extendUrl = "";
            await grabEnd();
            if (abort.current) {
              outcome = "abort";
              return;
            }
            bump(12, 28, `Imagine continues · ${spec.secs}s ${spec.res}p`);
            continue;
          }
          bump(Math.max(12, pace.n), pace.n, started.error);
          await sleep(1600);
        }
        if (abort.current) {
          outcome = "abort";
          return;
        }
        function stepDownSize(): boolean {
          setFrameHint("");
          if (extendUrl) {
            extendUrl = "";
            bump(12, 28, "clip too large — continuing from last frame");
            return true;
          }
          const next = nextSmallerClipSpec(spec);
          if (!next) {
            bump(Math.max(12, pace.n), pace.n, CLIP_TOO_LARGE_FROST);
            return false;
          }
          spec = next;
          bump(12, 28, clipRetryFrost(next));
          return true;
        }
        if (sizeAtStart) {
          if (stepDownSize()) {
            if (!extendUrl && clip) await grabEnd();
            continue;
          }
          return;
        }
        if (!started?.ok) {
          bump(36, 36, "Imagine busy · Cancel, then Continue again");
          return;
        }
        const stretching = Boolean(extendUrl);
        bump(32, 99, stretching ? "Imagine continues the film" : "Imagine is forging clip " + (at + 2));
        const t0 = Date.now();
        const expect = spec.secs * (spec.res === "1080" ? 9000 : 4500);
        let sizeHit = false;
        let dropped = false;
        for (let p = 0; p < 200; p++) {
          if (abort.current) {
            outcome = "abort";
            return;
          }
          await sleep(2000);
          if (abort.current) {
            outcome = "abort";
            return;
          }
          let polled;
          try {
            polled = await pollCookPlate({ data: { requestId: started.requestId } });
          } catch {
            continue;
          }
          if (!polled.ok) continue;
          try {
            const timePct = 32 + Math.min(67, Math.round(((Date.now() - t0) / expect) * 67));
            const apiPct = typeof polled.pct === "number" && Number.isFinite(polled.pct) ? polled.pct : timePct;
            const livePct = Math.max(pace.n, apiPct);
            pace.n = Math.min(99, Number.isFinite(livePct) ? livePct : pace.n);
            setPct(pace.n);
            const hint = cookFrameHint(polled.frame);
            if (hint) setFrameHint(hint);
            else setFrameHint("");
            setFrost(
              cookClipTooLarge(polled.frame)
                ? CLIP_TOO_LARGE_FROST
                : cookFrameLine(
                    polled.frame,
                    stretching ? "Imagine continues the film" : `Imagine is forging clip ${at + 2}`,
                  ),
            );
          } catch {
            /* bad status coalesce must not freeze Continue at ~43% */
          }
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
            outcome = "ok";
            return;
          }
          if (polled.status === "failed") {
            if (cookClipTooLarge(polled.frame)) sizeHit = true;
            else dropped = true;
            break;
          }
        }
        if (abort.current) {
          outcome = "abort";
          return;
        }
        if (sizeHit) {
          if (stepDownSize()) {
            if (!extendUrl && clip) await grabEnd();
            continue;
          }
          return;
        }
        if (dropped) {
          setFrameHint("");
          bump(Math.max(12, pace.n), pace.n, "Imagine dropped the plate");
          return;
        }
        bump(99, 99, "Still forging · keep this open");
        outcome = "wait";
        return;
      }
      setFrameHint("");
      bump(Math.max(12, pace.n), pace.n, CLIP_TOO_LARGE_FROST);
    } finally {
      window.clearInterval(tick);
      lock.current = false;
      setBusy(false);
      if (abort.current || outcome === "abort") {
        setForge(false);
        setPct(0);
        setFrameHint("");
        setFrost("");
      } else if (outcome === "wait") {
        /* keep overlay — cook may still land if Imagine is slow */
      } else {
        window.setTimeout(() => {
          setForge(false);
          setPct(0);
          setFrameHint("");
          setFrost("");
        }, outcome === "ok" ? 2400 : 3600);
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
      <div className="relative min-h-dvh" data-hall-seats="play">
        <FilmStage
          id="sprint"
          original={false}
          custom={film}
          holdHall={hangBindHall(live.room?.hall) || undefined}
          holdDoor={live.room?.door === "B" ? "B" : live.room?.door === "A" ? "A" : undefined}
          onHallDoor={() => {
            /* hung biome stay — Leave exits */
          }}
          onExit={() => setPlay(null)}
          onDone={() => {
            /* stay on biome — Leave calls onExit */
          }}
          onPaused={setSeatChrome}
        />
        <DoorChatLine where="play" chrome={seatChrome} />
      </div>
    );
  }

  const vaultIdx = hangStillWrap(Math.max(1, packs.length), vaultAt, 0);
  const vaultPack = packs[vaultIdx];
  const head = vaultPack ? familyHead(vaultPack) : null;
  const vaultHead = head;
  const vaultHungOn = head?.room?.door === "B" ? "B" : head?.room?.door === "A" ? "A" : "";
  const vaultClips = vaultPack?.playlist.length || 0;
  const chosen = vaultPack ? (pick[vaultPack.id] ?? Math.max(0, vaultClips - 1)) : 0;
  const vaultRoomN = hangBindHall(head?.room?.hall);
  void clipCount;
  void when;

  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg" data-vault-hall="10" style={{ touchAction: "manipulation" }}>
      {packs.length && vaultHead && vaultPack ? (
        <StillCarousel
          kind="vault"
          still={hangThumbStill(vaultHead)}
          index={vaultIdx}
          count={packs.length}
          disabled={busy}
          title={vaultHungOn && vaultRoomN ? hungPlayChrome(vaultRoomN, vaultHungOn).keeper : vaultPack.name}
          onNext={() => setVaultAt((i) => hangStillWrap(packs.length, i, 1))}
          onPrev={() => setVaultAt((i) => hangStillWrap(packs.length, i, -1))}
          onLock={() => {
            if (busy) return;
            if (vaultHungOn) {
              sfxForge("enter");
              playArt(vaultHead);
              return;
            }
            void askHang(head, "A", hangHallRef.current);
          }}
          onBack={() => {
            window.location.assign("/");
          }}
          actions={
            <div data-vault-actions="" className="sticky bottom-0 flex w-full flex-col items-center gap-1.5">
              <p
                className={`font-mono text-[9px] uppercase tracking-[0.16em] ${vaultHungOn ? "text-[#9ef0e4]" : "text-white/40"}`}
                data-hang-bound={vaultHungOn || undefined}
              >
                {vaultHungOn
                  ? `${vaultHangCaption(head.room)}${vaultPack.name ? ` · ${vaultPack.name}` : ""}`
                  : "not on a door · Hang then Bind or Hang & enter"}
              </p>
              <ClipSpecBar compact disabled={busy} />
              <div className="flex flex-wrap justify-center gap-2">
                <StillChip
                  data-play-sprint=""
                  tone="quiet"
                  disabled={busy}
                  {...press(() => {
                    if (busy) return;
                    if (vaultClips < 1) {
                      setFrost("No clip yet. Howl again — Imagine never landed a video.");
                      return;
                    }
                    sfxForge("enter");
                    playArt(head);
                  })}
                >
                  Play
                </StillChip>
                <StillChip
                  tone="gold"
                  disabled={busy}
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
                </StillChip>
                <StillChip
                  tone="ice"
                  disabled={busy}
                  {...press(() => {
                    setSeed("");
                    setShift({ a: head, at: chosen });
                  })}
                >
                  Shift
                </StillChip>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {vaultHungOn ? (
                  <>
                    <StillChip
                      tone="ice"
                      disabled={busy}
                      {...press(() => {
                        if (busy) return;
                        unhangDoor(head);
                      })}
                    >
                      Unhang · {vaultRoomN ? hungPlayChrome(vaultRoomN, vaultHungOn).keeper : vaultHungOn}
                    </StillChip>
                    <StillChip
                      tone="quiet"
                      disabled={busy}
                      data-hang-ref-open=""
                      {...press(() => {
                        if (busy) return;
                        openHangRef();
                      })}
                    >
                      Hang ref
                    </StillChip>
                  </>
                ) : (
                  <>
                    <StillChip
                      tone="ice"
                      disabled={busy}
                      data-hang={vaultHangStart("A").dataHang}
                      {...vaultHangRoom(hangHallN)}
                      {...press(() => {
                        if (busy) return;
                        void askHang(head, "A", hangHallRef.current);
                      })}
                    >
                      Hang A
                      <span className="mt-0.5 block text-[8px] tracking-[0.12em] text-white/40">pick room</span>
                    </StillChip>
                    <StillChip
                      tone="gold"
                      disabled={busy}
                      data-hang={vaultHangStart("B").dataHang}
                      {...vaultHangRoom(hangHallN)}
                      {...press(() => {
                        if (busy) return;
                        void askHang(head, "B", hangHallRef.current);
                      })}
                    >
                      Hang B
                      <span className="mt-0.5 block text-[8px] tracking-[0.12em] text-white/40">pick room</span>
                    </StillChip>
                    <StillChip
                      tone="quiet"
                      disabled={busy}
                      data-hang-ref-open=""
                      {...press(() => {
                        if (busy) return;
                        openHangRef();
                      })}
                    >
                      Hang ref
                      <span className="mt-0.5 block text-[8px] tracking-[0.12em] text-white/40">mp4 / Imagine</span>
                    </StillChip>
                  </>
                )}
                {vaultClips > 0 ? (
                  <StillChip
                    tone="warn"
                    disabled={busy}
                    {...press(() => {
                      if (busy || vaultClips < 1) return;
                      const gone = dropClipAt(vaultPack.id, chosen, hung);
                      setHung(gone);
                      setPick((p) => ({
                        ...p,
                        [vaultPack.id]: Math.max(0, Math.min(chosen, Math.max(0, (gone.find((x) => x.id === vaultPack.id)?.playlist.length || 1) - 1))),
                      }));
                      setFrost(`Erased clip ${chosen + 1} · ${familiesOf(gone).length} artifact${familiesOf(gone).length === 1 ? "" : "s"} left`);
                      window.setTimeout(() => setFrost(""), 2200);
                    })}
                  >
                    Erase clip {chosen + 1}
                  </StillChip>
                ) : null}
              </div>
            </div>
          }
        />
      ) : null}
      <div className="sr-only sticky top-0">
        Hang on room
        <button
          type="button"
          data-hang-bot={vaultHangStart("bot").dataHang}
          {...vaultHangRoom(resolveHangRoom(hangRooms, hangHallN))}
          disabled={busy}
          {...press(() => {
            if (busy) return;
            botHang(hangHallRef.current);
          })}
        >
          Grok Bot Hang
          pick room
        </button>
      </div>
      {!packs.length ? (
        ready ? (
          <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-5">
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
            <button
              type="button"
              data-hang-ref-open=""
              className="font-display text-4xl text-[#9ef0e4] drop-shadow-[0_0_18px_rgba(158,240,228,0.45)]"
              style={{ touchAction: "manipulation" }}
              {...press(() => {
                if (busy) return;
                openHangRef();
              })}
            >
              Hang ref
            </button>
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
        )
      ) : null}
      {hangRef ? (
        <HangRefSheet
          slots={refSlots}
          still={hangThumbStill(hung.find((a) => a.room?.hall === HANG_REF_GRAPH_HALL && a.still) || hung[0]) || hangSlotPreview(refSlots)}
          keep={refKeep}
          flag={refFlag}
          hung={refHung || Boolean(hungOnRole(hung, "breath-spawn", HANG_REF_GRAPH_HALL) || hungOnRole(hung, "walk-A", HANG_REF_GRAPH_HALL))}
          advanced={hung.some((a) => isLegacyDoorHang(a))}
          onSlot={takeRefUrl}
          onFile={takeRefFile}
          onKeep={() => setRefKeep((v) => !v)}
          onHang={() => hangPlayerRef()}
          onPlay={playHungGraph}
          onHangDoor={askHangGraph}
          onAdvanced={() => setHangRef(false)}
          onClose={() => {
            setHangRef(false);
            if (!refHung && !hung.length) window.location.assign("/");
          }}
        />
      ) : null}
      {hangAsk ? (
        <HangAskSheet
          door={hangAsk.door}
          name={hangAsk.a.name}
          rooms={hangRooms.length >= hangAsk.rooms.length ? hangRooms : hangAsk.rooms}
          hall={hangHallN}
          onHall={pickHangHall}
          citadels={hangCitadels}
          citadel={hangCitadel}
          onCitadel={pickHangCitadel}
          onClose={() => setHangAsk(null)}
          onConfirm={(hall, act) => {
            const bindHall = hangBindHall(hall);
            const cit = hangCitadelRef.current || hangAsk.rooms.find((r) => r.hall === bindHall)?.citadel || hangCitadel;
            const choice = hangDoorAct(act);
            setHangAsk(null);
            setHangRef(false);
            /* Enter keeps today's pending walk. Bind writes the door and stays. */
            if (hangActEnters(choice)) {
              writeHangPending({ id: hangAsk.a.id, citadel: cit, hall: bindHall });
            }
            hangDoor(hangAsk.a, hangAsk.door, undefined, hangBindHall(hall), choice);
          }}
        />
      ) : null}
      {shift ? (
        <div className="fixed inset-0 z-[70] flex flex-col bg-black/90 px-5 pt-[max(1.6rem,env(safe-area-inset-top))] pb-[max(1.6rem,env(safe-area-inset-bottom))]">
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
            {cookFrameLine(frameHint, frost || "Imagine is forging")}
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
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[95] px-5 pb-[max(1.6rem,env(safe-area-inset-bottom))]">
          <p className="rounded-2xl border border-[#e4c37a]/30 bg-black/75 px-4 py-3 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-[#f0d48a]">
            {frost}
          </p>
        </div>
      ) : null}
    </div>
  );
}
