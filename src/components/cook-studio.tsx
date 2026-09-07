import { useEffect, useRef, useState, type ReactNode } from "react";
import { Flame, Mic, PenLine } from "lucide-react";
import { ACTS, BIOMES, biomePlaylist, biomeSprintFilm, cookFilm, hasRuneFilm, readClipSpec, runeLoop, runeStill, stockBiomeFilm, worldOf, type BiomeId } from "@/game/cook";
import { biomeBotStart } from "@/game/path-entry";
import { biomeReadySrc, clearCookReady, cookOverlayForging, readCookReady, resolveCookStudioMount, writeCookReady } from "@/game/cook-ready";
import { playableClipSrc, stockBiomeLoop } from "@/game/play-clip";
import { ClipSpecBar } from "@/components/clip-spec";
import { ENGINE } from "@/game/laws";
import { startCookPlate, pollCookPlate, cookStatus, startCookStill, freeRuneSlot } from "@/lib/cook";
import { readArtifacts, type HungArtifact } from "@/game/artifacts";
import type { Film } from "@/game/films";
import { boltBack, locFromHash, pushBolt, readBolt } from "@/lib/bolt-history";
import { boltFull } from "@/lib/press";
import { sfxForge, startBed, unlockAudio } from "@/game/audio";
import { RuneEngine } from "@/components/rune-engine";

type Plate = { status: "wait" | "cook" | "ready" | "fail"; url?: string };
type Gate = "rifts" | "howl" | "world" | "studio" | "cook" | "rune";
type Tool = "mic" | "forge" | "write";

const STORE = "bolt-cook-v1";

const TEAR =
  "radial-gradient(ellipse 72% 80% at 50% 48%, #000 0%, #000 34%, rgba(0,0,0,0.5) 56%, transparent 76%)";

const HOWLS = ["/films/forge-howl-a.mp4", "/films/forge-howl-b.mp4", "/films/forge-howl-c.mp4"];

const RAIL: BiomeId[] = BIOMES.map((b) => b.id);

function wrap(n: number) {
  const len = RAIL.length;
  return ((n % len) + len) % len;
}

function shownAt(shift: number): BiomeId[] {
  return [0, 1, 2].map((i) => RAIL[wrap(shift + i)]);
}

function runeTint(word: string) {
  const w = word.toLowerCase();
  if (/(moss|reef|olive|garden|nile)/.test(w)) return "hue-rotate(68deg) saturate(1.3)";
  if (/(crystal|ice|marble|lapis|shard|void|star)/.test(w)) return "saturate(1.4) brightness(1.1) contrast(1.08)";
  if (/(dusk|ember|fire|gold|night|ash)/.test(w)) return "sepia(0.42) saturate(1.18) hue-rotate(-18deg)";
  if (/(storm|lightning|wind|tide)/.test(w)) return "hue-rotate(-24deg) contrast(1.12) saturate(1.2)";
  if (/(sand|dune|stone|ruin|forum)/.test(w)) return "sepia(0.25) saturate(1.15) brightness(1.05)";
  return "saturate(1.18) brightness(1.04)";
}

function asBiome(id: string | undefined): BiomeId | null {
  if (!id) return null;
  return BIOMES.some((b) => b.id === id) ? (id as BiomeId) : null;
}

function bootCook(): {
  gate: Gate;
  shift: number;
  biome: BiomeId;
  picked: BiomeId | null;
  plates: Plate[];
  watch: string | null;
  pct: number;
  frost: string;
  ready: boolean;
} {
  const empty = {
    gate: "rifts" as Gate,
    shift: 0,
    biome: "asteroid" as BiomeId,
    picked: "asteroid" as BiomeId | null,
    plates: emptyPlates(),
    watch: null as string | null,
    pct: 0,
    frost: "",
    ready: false,
  };
  if (typeof window === "undefined") return empty;
  const loc = locFromHash() ?? readBolt();
  const snap = readCookReady();
  const snapBiome = asBiome(snap?.biome);
  if (loc?.screen === "cook") {
    const rawGate = (loc.gate as Gate) ?? "rifts";
    const mount = resolveCookStudioMount({ gate: rawGate, readyUrls: snap?.urls });
    const biome = asBiome(loc.biome) ?? snapBiome ?? "asteroid";
    const i = RAIL.indexOf(biome);
    const shift = i > 0 ? i : 0;
    const gate = mount.gate as Gate;
    const picked =
      gate === "world" || gate === "studio" || gate === "cook" || gate === "rifts" ? biome : null;
    const urls = snap?.urls || [];
    const plates = emptyPlates();
    if (mount.ready && urls[0]) plates[0] = { status: "ready", url: urls[0] };
    const frost =
      mount.ready
        ? snap?.frost || "MP4 ready · touch the path to enter"
        : gate === "rifts"
          ? `${BIOMES.find((b) => b.id === (picked ?? biome))?.name ?? "rift"} fills the Forge. Touch it again to enter.`
          : "";
    return {
      gate,
      shift,
      biome,
      picked,
      plates,
      watch: mount.ready ? snap?.watch || urls[0] || null : null,
      pct: mount.ready ? 100 : 0,
      frost,
      ready: mount.ready,
    };
  }
  return empty;
}

function emptyPlates(): Plate[] {
  return ACTS.map(() => ({ status: "wait" }));
}

function speechEngine() {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

type SpeechRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((ev?: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

export function CookStudio({
  onPlay,
  onHang,
  onExit,
}: {
  onPlay: (film: Film) => void;
  onHang?: (film: Film) => void;
  onExit: () => void;
}) {
  const boot = bootCook();
  const [gate, setGate] = useState<Gate>(boot.gate);
  const [shift, setShift] = useState(boot.shift);
  const [picked, setPicked] = useState<BiomeId | null>(boot.picked);
  const [biome, setBiome] = useState<BiomeId>(boot.biome);
  const [runes, setRunes] = useState<string[]>([]);
  const runeRef = useRef<string | null>(null);
  const [spoken, setSpoken] = useState("");
  const spokenRef = useRef("");
  const [seed, setSeed] = useState("");
  const seedRef = useRef("");
  const [customStill, setCustomStill] = useState<string | null>(null);
  const customWorldRef = useRef(boot.gate === "howl" || boot.gate === "rune");
  const [frost, setFrost] = useState<string>(() => {
    if (boot.frost) return boot.frost;
    if (boot.gate === "rifts") {
      const name = BIOMES.find((b) => b.id === (boot.picked ?? boot.biome))?.name ?? "rift";
      return `${name} fills the Forge. Touch it again to enter.`;
    }
    return "";
  });
  const [pct, setPct] = useState(boot.pct);
  const [frameHint, setFrameHint] = useState("");
  const [howl, setHowl] = useState(false);
  const [plates, setPlates] = useState<Plate[]>(boot.plates);
  const [busy, setBusy] = useState(false);
  const [watch, setWatch] = useState<string | null>(boot.watch);
  const watchI = useRef(-1);
  const lock = useRef(false);
  const platesRef = useRef(plates);
  platesRef.current = plates;
  const recRef = useRef<SpeechRec | null>(null);
  const howlRef = useRef(false);
  const earRef = useRef<HTMLInputElement | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const howlArmedAt = useRef(0);
  const howlStartedAt = useRef(0);
  const [earHint, setEarHint] = useState("howl any world…");
  const [armed, setArmed] = useState<Tool | null>(null);
  const armedRef = useRef<Tool | null>(null);
  const [writeOn, setWriteOn] = useState(false);
  const lastWorldTap = useRef(0);
  const lastFullTap = useRef(0);
  const holdAt = useRef(0);
  const holdTimer = useRef(0);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const lastGesture = useRef(0);
  const stepAt = useRef(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const autoCook = useRef(0);
  const shiftRef = useRef(shift);
  const pickedRef = useRef(picked);
  const gateRef = useRef(gate);
  shiftRef.current = shift;
  pickedRef.current = picked;
  gateRef.current = gate;

  const [vault, setVault] = useState<HungArtifact[]>(() =>
    typeof window === "undefined" ? [] : readArtifacts(),
  );
  const world = BIOMES.find((x) => x.id === biome) ?? BIOMES[0];
  const still = world.still;
  const urls = plates.map((p) => p.url).filter((u): u is string => Boolean(u));
  const readyN = urls.length;
  const cooking = plates.findIndex((p) => p.status === "cook");

  useEffect(() => {
    void cookStatus().catch(() => {});
    if (boot.gate === "howl") howlArmedAt.current = performance.now() + 400;
    setVault(readArtifacts());
  }, []);

  useEffect(() => {
    const onPop = () => {
      const loc = readBolt();
      if (!loc || loc.screen !== "cook") return;
      const rawGate = (loc.gate as Gate) ?? "rifts";
      const snap = readCookReady();
      const liveUrls = [
        ...(snap?.urls || []),
        ...platesRef.current.map((p) => p.url).filter((u): u is string => Boolean(u)),
      ];
      const mount = resolveCookStudioMount({ gate: rawGate, readyUrls: liveUrls });
      const nextGate = mount.gate as Gate;
      const nextBiome = asBiome(loc.biome) ?? asBiome(snap?.biome);
      lock.current = false;
      window.clearTimeout(autoCook.current);
      if (nextGate !== "howl") {
        try {
          recRef.current?.stop();
        } catch {
          /* */
        }
        recRef.current = null;
        howlRef.current = false;
        setHowl(false);
      }
      setGate(nextGate);
      if (nextGate === "rifts") {
        const stay = nextBiome ?? "asteroid";
        const i = RAIL.indexOf(stay);
        setShift(i > 0 ? i : 0);
        setBiome(stay);
        setPicked(stay);
        pickedRef.current = stay;
        const name = BIOMES.find((b) => b.id === stay)?.name ?? "rift";
        setFrost(`${name} fills the Forge. Touch it again to enter.`);
      } else if (nextBiome) {
        setBiome(nextBiome);
        if (nextGate === "world" || nextGate === "studio" || nextGate === "cook") setPicked(nextBiome);
        else setPicked(null);
      } else {
        setPicked(null);
      }
      if (nextGate !== "studio") {
        armedRef.current = null;
        setArmed(null);
        setWriteOn(false);
      }
      if (nextGate === "world" || nextGate === "studio") setFrost("");
      else if (nextGate === "cook" && mount.ready) {
        if (snap?.urls?.[0] && !platesRef.current.some((p) => p.status === "ready")) {
          const next = emptyPlates();
          next[0] = { status: "ready", url: snap.urls[0] };
          setPlates(next);
          setWatch(snap.watch || snap.urls[0]);
        }
        setPct(100);
        setFrost(snap?.frost || "MP4 ready · touch the path to enter");
      } else if (nextGate === "cook") setFrost("The path is lighting.");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    return () => {
      recRef.current?.stop();
      window.clearTimeout(holdTimer.current);
      window.clearTimeout(autoCook.current);
    };
  }, []);

  function mark(i: number, patch: Partial<Plate>) {
    setPlates((prev) => prev.map((p, n) => (n === i ? { ...p, ...patch } : p)));
  }

  function plateStill() {
    return customStill || world.still;
  }

  function makeFilm(live: string[]) {
    const line = [runeRef.current, seedRef.current || spokenRef.current].filter(Boolean).join(". ");
    const name = line.trim() || worldOf(biome, line);
    const urls = live.map((u) => playableClipSrc(u)).filter(Boolean);
    const playlist = urls.length ? urls : [stockBiomeLoop(biome)];
    return cookFilm(name.slice(0, 42), customStill || (playlist[0] ? "" : world.still), playlist);
  }

  function hangNow(live: string[]) {
    const film = makeFilm(live);
    if (!film.playlist?.length) return film;
    onHang?.(film);
    setVault(readArtifacts());
    return film;
  }

  function firePlay() {
    const live = platesRef.current.map((p) => p.url).filter((u): u is string => Boolean(playableClipSrc(u) || (u && /\.mp4(\?|$)/i.test(u))));
    const src = biomeReadySrc(live, biome);
    if (!src) {
      setFrost("No MP4 yet. Wait for 100%.");
      return;
    }
    const film = hangNow(live.length ? live : [src]);
    onPlay(film);
  }

  function openHowl() {
    stopHowl();
    setGate("howl");
    setFrost("");
    setSpoken("");
    spokenRef.current = "";
    setSeed("");
    seedRef.current = "";
    setCustomStill(null);
    customWorldRef.current = true;
    setEarHint("howl any world…");
    howlArmedAt.current = performance.now() + 500;
    pushBolt({ screen: "cook", gate: "howl", page: 0, biome: "open" });
    sfxForge("howl");
  }

  function stepBiome(dir: 1 | -1) {
    const now = performance.now();
    if (now - stepAt.current < 260) return;
    stepAt.current = now;
    const shown = shownAt(shiftRef.current);
    const current = pickedRef.current && shown.includes(pickedRef.current)
      ? pickedRef.current
      : (pickedRef.current ?? shown[0]);
    const from = RAIL.indexOf(current);
    const i = from < 0 ? shiftRef.current : from;
    const next = RAIL[wrap(i + dir)];
    if (!next) return;
    if (!shownAt(shiftRef.current).includes(next)) {
      setShift(dir === 1 ? wrap(i + dir - 2) : wrap(i + dir));
    }
    setRunes([]);
    runeRef.current = null;
    pickedRef.current = next;
    setPicked(next);
    setBiome(next);
    const name = BIOMES.find((b) => b.id === next)?.name ?? "rift";
    setFrost(`${name} fills the Forge. Touch it again to enter.`);
    sfxForge("page");
  }

  function touchRift(id: BiomeId) {
    if (picked === id) {
      sfxForge("enter");
      enterWorld(id);
      return;
    }
    setPicked(id);
    pickedRef.current = id;
    setBiome(id);
    const name = BIOMES.find((b) => b.id === id)?.name ?? "rift";
    setFrost(`${name} fills the Forge. Touch it again to enter.`);
    sfxForge("pick");
  }

  function enterWorld(id: BiomeId) {
    setBiome(id);
    setPicked(id);
    setRunes([]);
    runeRef.current = null;
    setSpoken("");
    spokenRef.current = "";
    setSeed("");
    seedRef.current = "";
    customWorldRef.current = false;
    setCustomStill(null);
    const hit = BIOMES.find((b) => b.id === id);
    if (hit) {
      onHang?.(biomeSprintFilm(hit.name, hit.still, biomePlaylist(hit.id), hit.world));
      setVault(readArtifacts());
    }
    setGate("world");
    setFrost("");
    pushBolt({ screen: "cook", gate: "world", page: 0, biome: id });
    window.clearTimeout(autoCook.current);
  }

  function enterStudio() {
    window.clearTimeout(autoCook.current);
    window.clearTimeout(holdTimer.current);
    setArmed(null);
    armedRef.current = null;
    setWriteOn(false);
    customWorldRef.current = false;
    setGate("studio");
    setFrost("");
    pushBolt({ screen: "cook", gate: "studio", page: 0, biome });
    sfxForge("enter");
  }

  function pickRune(word: string) {
    window.clearTimeout(autoCook.current);
    if (runeRef.current === word) {
      enterStudio();
      return;
    }
    runeRef.current = word;
    setRunes([word]);
    sfxForge("pick");
  }

  function draftLine(line: string) {
    const next = line.slice(0, 140);
    spokenRef.current = next;
    setSpoken(next);
  }

  function lockSeed(line?: string) {
    const next = (line ?? spokenRef.current ?? spoken).trim().slice(0, 140);
    if (!next) return false;
    spokenRef.current = next;
    seedRef.current = next;
    setSpoken(next);
    setSeed(next);
    setWriteOn(false);
    stopHowl();
    return true;
  }

  function tapTool(id: Tool) {
    if (armedRef.current === id) {
      armedRef.current = null;
      setArmed(null);
      if (id === "mic") {
        sfxForge("howl");
        if (howlRef.current) lockSeed();
        else void startHowl();
      } else if (id === "forge") {
        sfxForge("cook");
        if (spokenRef.current.trim() && !seedRef.current) lockSeed();
        void cookAll();
      } else if (writeOn) {
        sfxForge("pick");
        lockSeed();
      } else {
        sfxForge("pick");
        openWrite();
      }
      return;
    }
    sfxForge("pick");
    armedRef.current = id;
    setArmed(id);
  }

  function openWrite() {
    window.clearTimeout(autoCook.current);
    if (seedRef.current) draftLine(seedRef.current);
    setWriteOn(true);
    window.setTimeout(() => earRef.current?.focus(), 40);
  }

  function openEar(hint: string) {
    setEarHint(hint);
    setFrost(hint);
    if (gateRef.current === "studio") setWriteOn(true);
    window.setTimeout(() => earRef.current?.focus(), 40);
  }

  function wireRec(rec: SpeechRec) {
    rec.lang = navigator.language || "fr-FR";
    rec.interimResults = true;
    rec.continuous = !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    rec.onresult = (ev) => {
      const parts: string[] = [];
      for (let i = 0; i < ev.results.length; i++) {
        const alt = ev.results[i]?.[0]?.transcript;
        if (alt) parts.push(alt);
      }
      const line = parts.join(" ").trim().slice(0, 140);
      if (!line) return;
      draftLine(line);
      setFrost(line);
      setEarHint("");
    };
    rec.onerror = (ev) => {
      if (!howlRef.current) return;
      const err = ev?.error ?? "";
      if (err === "aborted" || err === "no-speech") return;
      if (err === "not-allowed" || err === "service-not-allowed" || err === "audio-capture") {
        setEarHint("howl any world…");
        setFrost("");
        return;
      }
      window.setTimeout(() => {
        if (howlRef.current) armRec();
      }, 280);
    };
    rec.onend = () => {
      if (!howlRef.current) return;
      window.setTimeout(() => {
        if (howlRef.current) armRec();
      }, 120);
    };
  }

  function armRec() {
    if (!howlRef.current) return;
    try {
      recRef.current?.stop();
    } catch {
      /* */
    }
    recRef.current = null;
    const rec = speechEngine();
    if (!rec) {
      openEar("howl any world…");
      return;
    }
    wireRec(rec);
    try {
      rec.start();
      recRef.current = rec;
    } catch {
      openEar("howl any world…");
    }
  }

  async function startHowl() {
    window.clearTimeout(autoCook.current);
    const now = performance.now();
    if (now < howlArmedAt.current) return;
    if (howlRef.current) {
      if (now - howlStartedAt.current < 800) return;
      const heard = spokenRef.current.trim();
      stopHowl();
      if (heard) lockSeed();
      return;
    }
    howlRef.current = true;
    howlStartedAt.current = now;
    setHowl(true);
    if (gateRef.current !== "studio") {
      setEarHint("the ear is open");
      setFrost("the ear is open");
    }

    let heard = false;
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!howlRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        micStream.current?.getTracks().forEach((t) => t.stop());
        micStream.current = stream;
        heard = true;
      }
    } catch {
      heard = false;
    }
    if (!howlRef.current) return;

    const rec = speechEngine();
    if (rec) {
      armRec();
      if (!heard) setEarHint("Speak, or type the howl.");
      return;
    }
    openEar(heard ? "howl any world…" : "howl any world…");
  }

  function stopHowl() {
    try {
      recRef.current?.stop();
    } catch {
      /* */
    }
    recRef.current = null;
    howlRef.current = false;
    setHowl(false);
    micStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null;
    setEarHint("howl any world…");
    if (gate === "world") {
      /* stay quiet — forge is a double tap now */
    }
  }

  async function cookAll(customWorld = customWorldRef.current) {
    const seedLine = [runeRef.current, seedRef.current || spokenRef.current].filter(Boolean).join(". ").slice(0, 140);
    if (customWorld && !seedLine) {
      setFrost("Howl a world first.");
      return;
    }
    if (lock.current) return;
    lock.current = true;
    clearCookReady();
    sfxForge("cook");
    window.clearTimeout(autoCook.current);
    stopHowl();
    setGate("cook");
    setBusy(true);
    const cookBiome = customWorld ? "open" : biome;
    if (customWorld) setBiome("open");
    pushBolt({ screen: "cook", gate: "cook", page: 0, biome: cookBiome });
    const next = emptyPlates();
    next[0] = { status: "cook" };
    setPlates(next);
    setWatch(null);
    watchI.current = -1;
    setPct(0);
    setFrameHint("");
    setFrost(customWorld ? "Your world is taking shape." : "The path is lighting.");
    const worldLine = customWorld ? seedLine : undefined;
    let stillUrl = customStill;
    const got: string[] = [];
    const spec = readClipSpec();
    const pace = { n: 0, cap: 16 };
    const tick = window.setInterval(() => {
      pace.n = Math.min(pace.cap, pace.n + 1);
      setPct(pace.n);
    }, 320);
    function bump(n: number, cap: number, line: string) {
      pace.n = Math.max(pace.n, n);
      pace.cap = cap;
      setPct(pace.n);
      setFrost(line);
    }
    try {
      if (customWorld && !stillUrl) {
        bump(2, 16, "Imagine is drawing your world.");
        let stillRes: { ok: true; url: string } | { ok: false; error: string } | null = null;
        try {
          stillRes = await Promise.race([
            startCookStill({ data: { world: seedLine } }),
            new Promise<null>((r) => window.setTimeout(() => r(null), 42000)),
          ]);
        } catch (err) {
          stillRes = { ok: false, error: err instanceof Error ? err.message : "net" };
        }
        if (stillRes?.ok) {
          stillUrl = stillRes.url;
          setCustomStill(stillRes.url);
          bump(18, 28, "World locked · forging the clip");
          setCustomStill(stillRes.url);
        } else {
          bump(14, 28, "Still skipped · forging the clip");
        }
      }
      mark(0, { status: "cook" });
      bump(Math.max(pace.n, 18), 32, "Imagine is forging");
      let started: { ok: true; requestId: string } | { ok: false; error: string } | null = null;
      for (let tryN = 0; tryN < 10; tryN++) {
        try {
          started = await startCookPlate({
            data: {
              biome: cookBiome,
              prompt: seedLine,
              act: 0,
              still: customWorld ? "" : still,
              prevUrl: got[got.length - 1],
              world: worldLine,
              stillUrl: stillUrl && !stillUrl.includes("/films/cook-") ? stillUrl : undefined,
              duration: spec.secs,
              res: spec.res,
            },
          });
        } catch (err) {
          started = { ok: false, error: err instanceof Error ? err.message : "net" };
        }
        if (started.ok) break;
        if (started.error === "echo-off") {
          setPct(0);
          setFrost("Imagine is dark. No MP4. Try again.");
          mark(0, { status: "fail" });
          return;
        }
        if (started.error === "busy" || started.error === "cooldown") {
          bump(pace.n, 36, "Imagine is busy · waiting");
          await new Promise((r) => setTimeout(r, 4000));
          continue;
        }
        bump(pace.n, pace.n, "Imagine refused the plate.");
        break;
      }
      if (!started?.ok) {
        mark(0, { status: "fail" });
      } else {
        bump(Math.max(pace.n, 32), 92, "Imagine is forging");
        const t0 = Date.now();
        const expect = spec.secs * (spec.res === "1080" ? 7000 : 3800);
        let landed = false;
        for (let p = 0; p < 120; p++) {
          await new Promise((r) => setTimeout(r, 1800));
          let polled;
          try {
            polled = await pollCookPlate({ data: { requestId: started.requestId } });
          } catch {
            continue;
          }
          if (!polled.ok) continue;
          const timePct = 32 + Math.min(60, Math.round(((Date.now() - t0) / expect) * 60));
          const live = Math.max(pace.n, polled.pct ?? timePct);
          pace.n = Math.min(92, live);
          setPct(pace.n);
          if (polled.frame) setFrameHint(polled.frame);
          setFrost(polled.frame ? `frame ${polled.frame}` : "Imagine is forging");
          if (polled.status === "done" && polled.url) {
            const playable = biomeReadySrc([polled.url, ...got], cookBiome);
            got.push(playable);
            mark(0, { status: "ready", url: playable });
            hangNow(got);
            watchI.current = 0;
            setWatch(playable);
            pace.n = 100;
            setPct(100);
            setFrost("MP4 ready · touch the path to enter");
            writeCookReady({
              biome: cookBiome,
              urls: got,
              watch: playable,
              still: stillUrl || still,
              frost: "MP4 ready · touch the path to enter",
            });
            landed = true;
            break;
          }
          if (polled.status === "failed") break;
        }
        if (!landed) {
          mark(0, { status: "fail" });
          setFrost("The path stayed dark.");
        }
      }
    } finally {
      window.clearInterval(tick);
      setBusy(false);
      lock.current = false;
      void freeRuneSlot({ data: {} }).catch(() => {});
    }
  }

  function hitRift(x: number, y: number): BiomeId | null {
    const root = rootRef.current;
    if (!root) return null;
    const nodes = root.querySelectorAll<HTMLElement>("[data-rift]");
    let found: BiomeId | null = null;
    nodes.forEach((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = (x - cx) / (r.width * 0.34);
      const dy = (y - cy) / (r.height * 0.38);
      if (dx * dx + dy * dy <= 1) {
        found = el.dataset.rift as BiomeId;
      }
    });
    return found;
  }

  function note(x: number, y: number) {
    swipe.current = { x, y };
    holdAt.current = performance.now();
  }

  function release(x: number, y: number) {
    window.clearTimeout(holdTimer.current);
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = x - start.x;
    const dy = y - start.y;
    const now = performance.now();
    const small = Math.abs(dx) <= 22 && Math.abs(dy) <= 22;
    if (small && now - lastFullTap.current < 420 && gate !== "howl" && gate !== "world") {
      const rift = gate === "rifts" ? hitRift(x, y) : null;
      if (!rift) {
        lastFullTap.current = 0;
        lastGesture.current = now;
        sfxForge("full");
        boltFull();
        return;
      }
    }
    if (now - lastGesture.current < 220) return;
    lastGesture.current = now;
    if (Math.abs(dy) > 90 && Math.abs(dy) >= Math.abs(dx) * 0.8) {
      if (dy > 0) {
        if (gate === "world" || gate === "studio" || gate === "rune") {
          boltBack();
          return;
        }
        if (gate === "howl") {
          boltBack();
          return;
        }
        openHowl();
        return;
      }
      if (gate === "howl") {
        boltBack();
      }
      return;
    }
    if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy)) {
      if (gate === "rifts") stepBiome(dx < 0 ? 1 : -1);
      return;
    }
    if (gate === "howl") {
      void startHowl();
      return;
    }
    const held = performance.now() - holdAt.current;
    if (held > 480) return;
    if (gate === "rifts") {
      const id = hitRift(x, y);
      if (id) touchRift(id);
      else lastFullTap.current = now;
      return;
    }
    if (gate !== "world") lastFullTap.current = now;
    const box = rootRef.current?.getBoundingClientRect();
    if (!box) return;
    const ny = (y - box.top) / box.height;
    if (gate === "world") {
      const now = performance.now();
      if (now - lastWorldTap.current < 480) {
        lastWorldTap.current = 0;
        enterStudio();
        return;
      }
      lastWorldTap.current = now;
      return;
    }
    if (gate === "cook" && watch && ny > 0.55) firePlay();
  }

  function onDown(e: React.PointerEvent) {
    const hit = e.target as HTMLElement | null;
    if (hit?.closest("button, input, textarea")) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* */
    }
    note(e.clientX, e.clientY);
    unlockAudio();
    startBed();
  }

  function onUp(e: React.PointerEvent) {
    release(e.clientX, e.clientY);
  }

  const liveRune = runes[0];
  const runeFilm = liveRune && hasRuneFilm(biome, liveRune);
  const pickedWorld = picked ? (BIOMES.find((b) => b.id === picked) ?? null) : null;
  const cookSrc = gate === "cook" ? biomeReadySrc([watch || "", ...urls], biome) : "";
  const filmSrc =
    gate === "cook" && cookSrc
      ? cookSrc
      : gate === "howl"
        ? HOWLS[0]
        : gate === "rune"
          ? "/films/forge-runes.mp4"
          : gate === "world" || gate === "studio"
          ? runeFilm && liveRune
            ? runeLoop(biome, liveRune)
            : world.loop
          : pickedWorld
            ? pickedWorld.loop
            : "";

  const filmPoster =
    gate === "cook" && customStill
      ? customStill
      : gate === "rune"
        ? "/films/cook-runes.jpg"
        : (gate === "world" || gate === "studio") && runeFilm && liveRune
      ? runeStill(biome, liveRune)
      : pickedWorld
        ? pickedWorld.still
        : gate === "cook"
          ? still
          : undefined;

  if (gate === "rune") {
    return <RuneEngine onBack={onExit} />;
  }

  return (
    <div
      ref={rootRef}
      className="relative min-h-dvh overflow-hidden bg-bg text-fg"
      style={{ touchAction: "none" }}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={() => {
        window.clearTimeout(holdTimer.current);
        swipe.current = null;
      }}
      onTouchStart={(e) => {
        const hit = e.target as HTMLElement | null;
        if (hit?.closest("button, input, textarea")) return;
        const t = e.changedTouches[0];
        if (t) note(t.clientX, t.clientY);
      }}
      onTouchEnd={(e) => {
        const t = e.changedTouches[0];
        if (t) release(t.clientX, t.clientY);
      }}
    >
      {filmSrc ? (
        <video
          key={`bg-${shift}-${filmSrc}`}
          src={filmSrc}
          poster={filmPoster}
          muted
          loop={gate !== "cook"}
          playsInline
          autoPlay
          preload="metadata"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain object-center"
          onEnded={() => {
            if (gate !== "cook") return;
            const nextI = watchI.current + 1;
            const u = platesRef.current[nextI]?.url;
            if (u) {
              watchI.current = nextI;
              setWatch(playableClipSrc(u) || u);
              setFrost(`${ACTS[nextI].title} is running.`);
            }
          }}
          onError={() => {
            if (gate !== "cook") return;
            const fallback = stockBiomeLoop(biome);
            if (watch === fallback) return;
            setWatch(fallback);
            setFrost("loop · stock path");
          }}
        />
      ) : customStill ? (
        <img
          key={`still-${customStill}`}
          src={customStill}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-contain object-center"
        />
      ) : (
        <div key={`void-${shift}`} className="pointer-events-none absolute inset-0 bg-bg" />
      )}
      <div
        className={
          gate === "world" || gate === "studio" || (gate === "rifts" && picked)
            ? "pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(7,8,12,0.06)_58%,rgba(7,8,12,0.32)_100%)]"
            : "pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,12,0.12)_0%,rgba(7,8,12,0.28)_48%,rgba(7,8,12,0.78)_100%)]"
        }
      />
      {gate === "howl" && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: howl
              ? "radial-gradient(ellipse 50% 42% at 50% 38%, rgba(158,201,212,0.28) 0%, rgba(232,180,80,0.08) 38%, transparent 70%)"
              : "radial-gradient(ellipse 40% 36% at 50% 40%, rgba(158,201,212,0.1) 0%, transparent 62%)",
            transition: "background 700ms ease",
          }}
        />
      )}

      {gate === "rifts" && (
        <>
          <button
            type="button"
            data-biome-bot={biomeBotStart().dataBiome}
            className="absolute left-1/2 bottom-[32%] z-[60] -translate-x-1/2 font-display text-2xl text-[#9ef0e4] drop-shadow-[0_0_18px_rgba(158,240,228,0.4)]"
            style={{ touchAction: "manipulation" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const id = picked || biome || "asteroid";
              onHang?.(stockBiomeFilm(id));
              setVault(readArtifacts());
              enterWorld(id);
            }}
          >
            Grok Bot Biome
          </button>
          <div className="absolute inset-x-0 bottom-[2%] z-30 flex items-center justify-center gap-[1vw] px-[1.5%]">
            <button
              type="button"
              aria-label="Previous biomes"
              className="relative z-40 flex h-12 w-8 shrink-0 items-center justify-center font-display text-3xl text-ice"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                stepBiome(-1);
              }}
            >
              ‹
            </button>
            {shownAt(shift).map((id) => {
              const b = BIOMES.find((x) => x.id === id);
              if (!b) return null;
              const on = picked === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  data-rift={b.id}
                  aria-label={b.name}
                  aria-pressed={on}
                  className="relative w-[28%] max-w-[10.4rem] shrink-0 bg-transparent p-0"
                  style={{
                    aspectRatio: "3 / 4",
                    zIndex: on ? 8 : 4,
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    touchRift(b.id);
                  }}
                >
                  <RuneTear loop={b.loop} still={b.still} mask={TEAR} picked={on} />
                </button>
              );
            })}
            <button
              type="button"
              aria-label="Next biomes"
              className="relative z-40 flex h-12 w-8 shrink-0 items-center justify-center font-display text-3xl text-ice"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                stepBiome(1);
              }}
            >
              ›
            </button>
          </div>
          <button
            type="button"
            aria-label="Howl"
            className="absolute bottom-[24%] left-0 right-0 z-40 mx-auto flex h-12 w-12 items-center justify-center font-display text-4xl text-ice"
            style={{ animation: "page-hint-y 1.6s ease-in-out infinite" }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              openHowl();
            }}
          >
            ⌄
          </button>
        </>
      )}

      {gate === "world" && world.runes.length > 0 && (
        <div className="absolute inset-x-0 bottom-[2.5%] z-30 flex items-end justify-center gap-[2.6vw] px-[5%]">
          {world.runes.map((word) => {
            const on = runes[0] === word;
            const film = hasRuneFilm(biome, word);
            return (
              <button
                key={word}
                type="button"
                aria-label={word}
                aria-pressed={on}
                className="relative w-[30%] max-w-[11.2rem] shrink-0 bg-transparent p-0"
                style={{
                  aspectRatio: "3 / 4",
                  zIndex: on ? 8 : 4,
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  pickRune(word);
                }}
              >
                <RuneTear
                  loop={film ? runeLoop(biome, word) : world.loop}
                  still={film ? runeStill(biome, word) : world.still}
                  mask={TEAR}
                  picked={on}
                  tint={film ? undefined : runeTint(word)}
                />
              </button>
            );
          })}
        </div>
      )}

      {gate === "studio" && (
        <>
          {writeOn ? (
            <input
              ref={earRef}
              value={spoken}
              maxLength={140}
              enterKeyHint="done"
              autoComplete="off"
              autoCorrect="off"
              placeholder=""
              className="absolute bottom-[18%] left-6 right-6 z-[45] border-0 bg-transparent text-center font-display text-2xl text-ice outline-none"
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onChange={(e) => draftLine(e.target.value.slice(0, 140))}
              onBlur={() => {
                if (spokenRef.current.trim()) lockSeed();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                  lockSeed();
                }
              }}
            />
          ) : seed || (howl && spoken) ? (
            <p className="pointer-events-none absolute bottom-[18%] left-6 right-6 z-20 text-center font-display text-2xl text-ice">
              {seed || spoken}
            </p>
          ) : null}
          <div className="absolute bottom-[max(1.1rem,env(safe-area-inset-bottom))] left-0 right-0 z-50 flex items-end justify-center gap-8 px-6">
            <StudioBtn
              label="Howl"
              on={howl}
              armed={armed === "mic"}
              onTap={() => tapTool("mic")}
            >
              <Mic className="h-6 w-6" strokeWidth={1.75} />
            </StudioBtn>
            <StudioBtn
              label="Forge"
              on={busy}
              armed={armed === "forge"}
              big
              onTap={() => tapTool("forge")}
            >
              <Flame className="h-7 w-7" strokeWidth={1.75} />
            </StudioBtn>
            <StudioBtn
              label="Write"
              on={writeOn || Boolean(seed)}
              armed={armed === "write"}
              onTap={() => tapTool("write")}
            >
              <PenLine className="h-6 w-6" strokeWidth={1.75} />
            </StudioBtn>
          </div>
        </>
      )}

      {gate === "cook" && cookOverlayForging({ busy, cookingIndex: cooking }) && (
        <div
          className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center"
          data-biome-cook="forging"
        >
          <p className="font-display text-[5.8rem] leading-none text-ice drop-shadow-[0_10px_28px_rgba(0,0,0,0.8)]">
            {pct}%
          </p>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.28em] text-ice/80">
            {frameHint ? `frame ${frameHint}` : frost || "Imagine is forging"}
          </p>
          <div className="mt-6 h-[2px] w-40 overflow-hidden bg-white/15">
            <div className="h-full bg-ice" style={{ width: `${Math.max(2, pct)}%` }} />
          </div>
        </div>
      )}
      {gate === "cook" && !cookOverlayForging({ busy, cookingIndex: cooking }) && readyN > 0 && (
        <div
          className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center"
          data-biome-cook="ready"
          data-cook-ready={readyN}
          data-biome-src={cookSrc || watch || undefined}
        >
          <p className="font-display text-[5.8rem] leading-none text-ice drop-shadow-[0_10px_28px_rgba(0,0,0,0.8)]">
            100%
          </p>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.28em] text-ice/80">
            {frost || "MP4 ready · touch the path to enter"}
          </p>
          <div className="mt-6 h-[2px] w-40 overflow-hidden bg-white/15">
            <div className="h-full bg-ice" style={{ width: "100%" }} />
          </div>
        </div>
      )}

      {gate !== "world" && gate !== "studio" && gate !== "cook" && (
        <p className="pointer-events-none absolute top-[max(1.2rem,env(safe-area-inset-top))] left-4 right-4 z-20 font-mono text-[11px] uppercase tracking-[0.22em] text-ice">
          {gate === "rifts"
            ? frost
            : gate === "howl"
              ? spoken || (howl ? "" : "")
              : howl
                ? "howling"
                : frost}
        </p>
      )}
      {(gate === "rifts" || gate === "howl" || gate === "studio") && (
        <div
          className={
            gate === "howl"
              ? "absolute inset-x-0 top-[max(5.4rem,calc(env(safe-area-inset-top)+4.4rem))] z-50 px-5"
              : gate === "studio"
                ? "absolute inset-x-0 bottom-[max(6.4rem,calc(env(safe-area-inset-bottom)+5.6rem))] z-50 px-5"
                : "absolute inset-x-0 top-[max(3.6rem,calc(env(safe-area-inset-top)+2.5rem))] z-50 px-5"
          }
        >
          <ClipSpecBar disabled={busy} />
        </div>
      )}
      {gate === "howl" && (
        <button
          type="button"
          aria-label="Howl"
          aria-pressed={howl}
          className="absolute bottom-[26%] left-0 right-0 z-50 mx-auto flex h-16 w-16 items-center justify-center rounded-full text-ice"
          style={{
            border: howl ? "1px solid rgba(158,201,212,0.95)" : "1px solid rgba(158,201,212,0.55)",
            background: howl ? "rgba(158,201,212,0.28)" : "rgba(7,8,12,0.45)",
            boxShadow: howl ? "0 0 22px rgba(158,201,212,0.55)" : "0 0 12px rgba(158,201,212,0.18)",
            animation: howl ? "cook-node 1.4s ease-out infinite" : "page-hint-y 1.8s ease-in-out infinite",
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => {
            e.stopPropagation();
            void startHowl();
          }}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => {
            e.stopPropagation();
            e.preventDefault();
            void startHowl();
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Mic className="h-7 w-7" strokeWidth={1.75} />
        </button>
      )}
      {gate === "howl" && (
        <input
          ref={earRef}
          value={spoken}
          maxLength={140}
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="off"
          placeholder={earHint || "howl any world…"}
          className="absolute bottom-[16%] left-6 right-6 z-[45] border-0 bg-transparent text-center font-display text-2xl text-ice outline-none placeholder:text-ice/40"
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onChange={(e) => {
            draftLine(e.target.value.slice(0, 140));
            setFrost(e.target.value.slice(0, 140));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
              if (lockSeed()) void cookAll(true);
            }
          }}
        />
      )}
      {gate === "howl" && Boolean((spoken || seed).trim()) && (
        <button
          type="button"
          aria-label="Forge this world"
          className="absolute bottom-[max(0.6rem,env(safe-area-inset-bottom))] left-0 right-0 z-50 mx-auto flex h-14 w-14 items-center justify-center rounded-full text-ice"
          style={{
            border: "1px solid rgba(158,201,212,0.9)",
            background: "rgba(158,201,212,0.22)",
            boxShadow: "0 0 18px rgba(158,201,212,0.4)",
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (lockSeed()) void cookAll(true);
          }}
        >
          <Flame className="h-7 w-7" strokeWidth={1.75} />
        </button>
      )}
      {gate === "howl" && (
        <button
          type="button"
          aria-label="Back to rifts"
          className="absolute top-[max(2.4rem,env(safe-area-inset-top))] left-0 right-0 z-50 mx-auto flex h-12 w-12 items-center justify-center font-display text-3xl text-ice"
          style={{ animation: "page-hint-y 1.6s ease-in-out infinite reverse" }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            stopHowl();
            boltBack();
          }}
        >
          ⌃
        </button>
      )}
      {gate === "howl" && howl && !spoken && (
        <p className="pointer-events-none absolute bottom-[36%] left-6 right-6 z-20 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-ice/80">
          the ear is open
        </p>
      )}
      {gate === "cook" && readyN > 0 && (
        <p className="pointer-events-none absolute bottom-[max(1.1rem,env(safe-area-inset-bottom))] left-4 right-4 z-20 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-ice">
          ready · touch the path to enter
        </p>
      )}
    </div>
  );
}

function RuneTear({
  loop,
  still,
  mask,
  picked,
  tint,
}: {
  loop: string;
  still: string;
  mask: string;
  picked: boolean;
  tint?: string;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        WebkitMaskImage: mask,
        maskImage: mask,
        background: "#07080c",
        transform: picked ? "scale(1.08)" : "scale(1)",
        filter: picked ? "saturate(1.12) brightness(1.1)" : undefined,
        animation: picked ? "rift-pulse 3.2s ease-in-out infinite" : undefined,
        boxShadow: picked ? "0 0 28px rgba(158,201,212,0.35)" : undefined,
      }}
    >
      <img
        src={still}
        alt=""
        className="absolute inset-0 h-full w-full object-contain object-center"
      />
      {picked ? (
      <video
        key={loop}
        src={loop}
        poster={still}
        muted
        loop
        playsInline
        autoPlay
        preload="metadata"
        className="absolute inset-0 h-full w-full object-contain object-center"
      />
      ) : null}
    </div>
  );
}

function StudioBtn({
  label,
  on,
  armed,
  big,
  onTap,
  children,
}: {
  label: string;
  on: boolean;
  armed: boolean;
  big?: boolean;
  onTap: () => void;
  children: ReactNode;
}) {
  const lit = on || armed;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      className={`flex items-center justify-center rounded-full text-ice ${big ? "h-16 w-16" : "h-14 w-14"}`}
      style={{
        border: lit ? "1px solid rgba(158,201,212,0.95)" : "1px solid rgba(158,201,212,0.55)",
        background: on ? "rgba(158,201,212,0.28)" : "rgba(7,8,12,0.45)",
        boxShadow: lit ? "0 0 22px rgba(158,201,212,0.55)" : "0 0 12px rgba(158,201,212,0.18)",
        animation: on ? "cook-node 1.4s ease-out infinite" : undefined,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onTap();
      }}
    >
      {children}
    </button>
  );
}
