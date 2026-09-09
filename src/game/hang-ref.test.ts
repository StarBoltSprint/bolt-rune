import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HungArtifact } from "./artifacts.ts";
import { hangArtifactOnDoor, walkHangHallHref } from "./enter-graph.ts";
import { hangBlobSrc, persistHangUrl, rememberHangFile, resetHangBlobs, rewriteHungBlobKeys } from "./hang-blob.ts";
import { hungOnDoor } from "./pcg-chunk.ts";
import { mayHang } from "./smoke-gate.ts";
import {
  bankKeysOfHangRole,
  bankPatchesFromHung,
  bindHangRefRoom,
  filledHungPlayRoles,
  hangPlaySrc,
  hungRefsForPlay,
  clipIdOfHangRole,
  continuityReasons,
  doorOfHangRole,
  filledHangSlots,
  hangMediaSrc,
  hangRefKind,
  hangRefLabel,
  hangRefRole,
  hangRoleOwnsDoor,
  hangSlotPreview,
  hallGraphArt,
  hungOnRole,
  hungRefsForHall,
  isContinuityOnlyFail,
  isHangGraphArt,
  isHangMediaUrl,
  isImaginePostUrl,
  isLegacyDoorHang,
  mayHangPlayerRef,
  overlayHungShelf,
  parseHangSlot,
  parseImaginePostUrl,
  poseOfHangRole,
  rehomeHungGraph,
  slotsFromHung,
  slotWrites,
  HANG_GRAPH_PROMPT,
  HANG_REF_GRAPH_HALL,
  HANG_REF_LAW,
  HANG_REF_PRIMARY,
  HANG_REF_ROLES,
} from "./hang-ref.ts";

const here = dirname(fileURLToPath(import.meta.url));

function art(partial: Partial<HungArtifact> & Pick<HungArtifact, "id">): HungArtifact {
  return {
    name: "ref",
    still: "",
    playlist: [],
    prompt: "",
    hungAt: 1,
    grade: null,
    ...partial,
  };
}

describe("Hang ref import — roles + Imagine URLs", () => {
  it("maps roles onto spawn|atA|atB and pose SM clip ids", () => {
    assert.deepEqual([...HANG_REF_ROLES], [
      "breath-spawn",
      "breath-A",
      "breath-B",
      "walk-A",
      "walk-B",
      "walk-A-B",
      "walk-B-A",
    ]);
    assert.equal(hangRefRole("walk-A"), "walk-A");
    assert.equal(hangRefRole("A→B"), "walk-A-B");
    assert.equal(hangRefRole("walk-ba"), "walk-B-A");
    assert.equal(hangRefRole("idle-m1"), "breath-A");
    assert.equal(hangRefRole("nope"), "breath-spawn");
    assert.equal(hangRefKind("breath-A"), "breath");
    assert.equal(hangRefKind("walk-A-B"), "walk");
    assert.equal(hangRefLabel("walk-B-A"), "walk B→A");
    assert.equal(poseOfHangRole("breath-spawn"), "spawn");
    assert.equal(poseOfHangRole("walk-A"), "atA");
    assert.equal(poseOfHangRole("walk-B"), "atB");
    assert.equal(poseOfHangRole("breath-A"), "atA");
    assert.equal(poseOfHangRole("breath-B"), "atB");
    assert.equal(poseOfHangRole("walk-A-B"), "atB");
    assert.equal(poseOfHangRole("walk-B-A"), "atA");
    assert.equal(clipIdOfHangRole("breath-spawn"), "breath-spawn");
    assert.equal(clipIdOfHangRole("walk-A"), "walk-spawn-A");
    assert.equal(clipIdOfHangRole("walk-B"), "walk-spawn-B");
    assert.equal(clipIdOfHangRole("breath-A"), "breath-A");
    assert.equal(clipIdOfHangRole("breath-B"), "breath-B");
    assert.equal(clipIdOfHangRole("walk-A-B"), "walk-A-B");
    assert.equal(clipIdOfHangRole("walk-B-A"), "walk-B-A");
    assert.equal(doorOfHangRole("walk-B"), "B");
    assert.equal(doorOfHangRole("breath-spawn"), "A");
    assert.equal(hangRoleOwnsDoor("breath-spawn", "A"), false);
    assert.equal(hangRoleOwnsDoor("walk-A", "A"), true);
    assert.equal(hangRoleOwnsDoor("breath-A", "A"), true);
    assert.equal(hangRoleOwnsDoor("breath-B", "B"), true);
    assert.equal(hangRoleOwnsDoor("walk-A-B", "A"), false);
    assert.equal(hangRoleOwnsDoor("walk-A-B", "B"), false);
    assert.equal(hangRoleOwnsDoor("walk-B-A", "A"), false);
    assert.equal(hangRoleOwnsDoor(undefined, "A"), true);
    assert.ok(bankKeysOfHangRole("walk-A-B").includes("m1→m2"));
    assert.ok(bankKeysOfHangRole("walk-B-A").includes("m2←m1→m1"));
    assert.deepEqual([...HANG_REF_PRIMARY], ["breath-spawn", "walk-A", "walk-B", "breath-A", "breath-B"]);
    assert.equal(HANG_REF_GRAPH_HALL, 1);
    assert.equal(parseHangSlot("https://grok.com/imagine/post/abc123xyz").ok, true);
    assert.equal(parseHangSlot("/films/walk-a.mp4").ok, true);
    assert.equal(parseHangSlot("not-a-clip").ok, false);
    assert.deepEqual(slotWrites({ "walk-A": "/films/walk-a.mp4", "walk-B": "" }), [{ role: "walk-A", url: "/films/walk-a.mp4" }]);
    assert.equal(hangSlotPreview({ "breath-spawn": "/films/breath-mine.mp4" }), "/films/breath-mine.mp4");
    assert.deepEqual(filledHangSlots({ "walk-A": "  ", "breath-A": "https://grok.com/imagine/post/abc123xyz" }), {
      "breath-A": "https://grok.com/imagine/post/abc123xyz",
    });
  });

  it("accepts grok.com/imagine/post URLs and local/Imagine mp4s", () => {
    const post = parseImaginePostUrl("https://grok.com/imagine/post/abc123xyz");
    assert.equal(post.ok, true);
    if (post.ok) assert.equal(post.postId, "abc123xyz");
    assert.equal(isImaginePostUrl("https://www.grok.com/imagine/post/abc123xyz?x=1"), true);
    assert.equal(isImaginePostUrl("https://evil.example/imagine/post/abc"), false);
    assert.equal(isHangMediaUrl("https://grok.com/imagine/post/abc123xyz"), true);
    assert.equal(isHangMediaUrl("https://imgen.x.ai/vid/walk.mp4?tok=1"), true);
    assert.equal(isHangMediaUrl("blob:http://localhost/1"), true);
    assert.equal(isHangMediaUrl("data:video/mp4;base64,aaa"), true);
    assert.equal(hangMediaSrc("/films/forge-forest.mp4"), "/films/forge-forest.mp4");
    assert.equal(hangMediaSrc("blob:http://localhost/2"), "blob:http://localhost/2");
    assert.equal(hangMediaSrc("https://grok.com/imagine/post/abc123xyz"), "");
    assert.match(walkHangHallHref(undefined, 1, 1), /first=m1/);
  });
});

describe("Hang ref — local mp4 blob persist", () => {
  it("rewrites blob: urls to hangblob keys and hangMediaSrc resolves the live src", async () => {
    resetHangBlobs();
    const blobUrl = "blob:http://localhost/hang-clip";
    const file = new Blob(["mp4-bytes"], { type: "video/mp4" });
    const key = rememberHangFile(blobUrl, file);
    assert.equal(key.startsWith("hangblob:"), true);
    assert.equal(await persistHangUrl(blobUrl), key);
    const hung = [
      art({
        id: "art-blob",
        playlist: [blobUrl],
        room: bindHangRefRoom("breath-spawn", { hall: 1, trans: blobUrl }),
      }),
    ];
    const rewritten = rewriteHungBlobKeys(hung, new Map([[blobUrl, key]]));
    assert.equal(rewritten[0]?.playlist[0], key);
    assert.equal(rewritten[0]?.room?.trans, key);
    assert.equal(hangBlobSrc(key), blobUrl);
    assert.equal(hangMediaSrc(key), blobUrl);
    assert.equal(isHangMediaUrl(key), true);
    resetHangBlobs();
  });
});

describe("Hang ref — Continuity FAIL + KEEP", () => {
  it("does not block Hang when player KEPT a continuity-only FAIL", () => {
    const cont = { smoke: "FAIL" as const, reasons: ["continuity-land"] };
    const wide = { smoke: "FAIL" as const, reasons: ["aspect-16:9"] };
    const pass = { smoke: "PASS" as const, reasons: [] };
    assert.equal(isContinuityOnlyFail(cont), true);
    assert.equal(isContinuityOnlyFail(wide), false);
    assert.deepEqual(continuityReasons(["continuity-land", "aspect-16:9"]), ["continuity-land"]);
    assert.equal(mayHangPlayerRef(cont, true), true);
    assert.equal(mayHangPlayerRef(cont, false), false);
    assert.equal(mayHangPlayerRef(wide, true), false);
    assert.equal(mayHang(cont, true), true);
    assert.equal(mayHang(cont), false);
    assert.equal(mayHang(wide, true), false);
    assert.equal(mayHang(pass), true);
    const from = [art({ id: "art-keep", playlist: ["/films/walk-a.mp4"] })];
    const blocked = hangArtifactOnDoor("art-keep", "A", { hall: 2, smoke: cont }, from);
    assert.equal(blocked[0]?.room, undefined);
    const kept = hangArtifactOnDoor("art-keep", "A", { hall: 2, smoke: cont, keep: true, role: "walk-A" }, from);
    assert.equal(kept[0]?.room?.hall, 2);
    assert.equal(kept[0]?.room?.role, "walk-A");
  });
});

describe("Hang ref — Human Hang wins stock shelf", () => {
  it("overlays hung clips on pose shelf and does not steal door A with breath-spawn", () => {
    const hung = [
      art({
        id: "art-breath",
        playlist: ["/films/breath-mine.mp4"],
        hungAt: 3,
        room: bindHangRefRoom("breath-spawn", { hall: 2, citadel: "cit-1" }),
      }),
      art({
        id: "art-walk-a",
        playlist: ["/films/walk-mine.mp4"],
        hungAt: 4,
        room: bindHangRefRoom("walk-A", { hall: 2, citadel: "cit-1" }),
      }),
      art({
        id: "art-breath-a",
        playlist: ["/films/breath-a-mine.mp4"],
        hungAt: 5,
        room: bindHangRefRoom("breath-A", { hall: 2, citadel: "cit-1" }),
      }),
      art({
        id: "art-breath-b",
        playlist: ["/films/breath-b-mine.mp4"],
        hungAt: 6,
        room: bindHangRefRoom("breath-B", { hall: 2, citadel: "cit-1" }),
      }),
      art({
        id: "art-cross-ab",
        playlist: ["/films/walk-ab-mine.mp4"],
        hungAt: 7,
        room: bindHangRefRoom("walk-A-B", { hall: 2, citadel: "cit-1" }),
      }),
      art({
        id: "art-cross-ba",
        playlist: ["/films/walk-ba-mine.mp4"],
        hungAt: 8,
        room: bindHangRefRoom("walk-B-A", { hall: 2, citadel: "cit-1" }),
      }),
    ];
    const stock = {
      "breath-spawn": "/ui/citadel.mp4?v=aaa",
      "breath-A": "/ui/citadel.mp4?v=aaa",
      "breath-B": "/ui/citadel.mp4?v=aaa",
      "walk-spawn-A": "/ui/citadel.mp4?v=aaa",
      "walk-spawn-B": "/ui/citadel.mp4?v=aaa",
      "walk-A-B": "/ui/citadel.mp4?v=aaa",
      "walk-B-A": "/ui/citadel.mp4?v=aaa",
    };
    const shelf = overlayHungShelf(stock, hung, 2, "cit-1");
    assert.equal(shelf["breath-spawn"], "/films/breath-mine.mp4");
    assert.equal(shelf["walk-spawn-A"], "/films/walk-mine.mp4");
    assert.equal(shelf["walk-spawn-B"], "/ui/citadel.mp4?v=aaa");
    assert.equal(shelf["breath-A"], "/films/breath-a-mine.mp4");
    assert.equal(shelf["breath-B"], "/films/breath-b-mine.mp4");
    assert.equal(shelf["walk-A-B"], "/films/walk-ab-mine.mp4");
    assert.equal(shelf["walk-B-A"], "/films/walk-ba-mine.mp4");
    const miss = overlayHungShelf(stock, hung, 1, "cit-1");
    assert.equal(miss["breath-spawn"], "/ui/citadel.mp4?v=aaa");
    assert.equal(hungOnRole(hung, "walk-A", 2, "cit-1")?.id, "art-walk-a");
    assert.equal(hungOnDoor(hung, "A", 2)?.id, "art-breath-a");
    assert.notEqual(hungOnDoor(hung, "A", 2)?.id, "art-breath");
    assert.notEqual(hungOnDoor(hung, "A", 2)?.id, "art-cross-ba");
    assert.notEqual(hungOnDoor(hung, "B", 2)?.id, "art-cross-ab");
    assert.equal(hungOnDoor(hung, "B", 2)?.id, "art-breath-b");
    const refs = hungRefsForHall(hung, 2, "cit-1");
    assert.equal(refs["breath-spawn"]?.pose, "spawn");
    assert.equal(refs["walk-A"]?.pose, "atA");
    assert.equal(refs["breath-A"]?.pose, "atA");
    assert.equal(refs["walk-A-B"]?.pose, "atB");
    assert.equal(refs["walk-B-A"]?.pose, "atA");
    const patches = bankPatchesFromHung(hung, 2, "cit-1");
    assert.ok(patches.some((p) => p.key === "idle-spawn" && p.url === "/films/breath-mine.mp4"));
    assert.ok(patches.some((p) => p.key === "spawn→m1" && p.url === "/films/walk-mine.mp4"));
    assert.ok(patches.some((p) => p.key === "idle-m1" && p.url === "/films/breath-a-mine.mp4"));
    assert.ok(patches.some((p) => p.key === "idle-m2" && p.url === "/films/breath-b-mine.mp4"));
    assert.ok(patches.some((p) => p.key === "m1→m2" && p.url === "/films/walk-ab-mine.mp4"));
    assert.ok(patches.some((p) => p.key === "m2→m1" && p.url === "/films/walk-ba-mine.mp4"));
    assert.ok(patches.some((p) => p.key === "m1←spawn→m2" && p.url === "/films/walk-ab-mine.mp4"));
    const slots = slotsFromHung(hung, 2, "cit-1");
    assert.equal(slots["breath-spawn"], "/films/breath-mine.mp4");
    assert.equal(slots["walk-A"], "/films/walk-mine.mp4");
    assert.equal(slots["walk-A-B"], "/films/walk-ab-mine.mp4");
    assert.equal(isLegacyDoorHang({ room: { door: "A", still: "/films/forest.jpg", hall: 1 } }, 1), true);
    assert.equal(isLegacyDoorHang(hung[0], 2), false);
    const bundle = art({ id: "art-hall", prompt: HANG_GRAPH_PROMPT, playlist: ["/films/walk-mine.mp4"] });
    assert.equal(isHangGraphArt(bundle), true);
    assert.equal(hallGraphArt([...hung, bundle])?.id, "art-hall");
    const moved = rehomeHungGraph(hung, 2, 1, "cit-2");
    assert.equal(moved.find((a) => a.id === "art-walk-a")?.room?.hall, 1);
    assert.equal(moved.find((a) => a.id === "art-walk-a")?.room?.citadel, "cit-2");
    assert.equal(moved.find((a) => a.id === "art-walk-a")?.room?.role, "walk-A");
    assert.equal(overlayHungShelf(stock, moved, 1, "cit-2")["walk-spawn-A"], "/films/walk-mine.mp4");
  });

  it("PLAY overlay finds hall-1 Hang when living hall / citadel drifted", () => {
    const hung = [
      art({
        id: "art-spawn",
        playlist: ["blob:http://localhost/breath-spawn"],
        room: bindHangRefRoom("breath-spawn", { hall: 1 }),
      }),
      art({
        id: "art-walk-a",
        playlist: ["blob:http://localhost/walk-a"],
        room: bindHangRefRoom("walk-A", { hall: 1 }),
      }),
      art({
        id: "art-breath-a",
        playlist: ["blob:http://localhost/breath-a"],
        room: bindHangRefRoom("breath-A", { hall: 1 }),
      }),
      art({
        id: "art-walk-b",
        playlist: ["blob:http://localhost/walk-b"],
        room: bindHangRefRoom("walk-B", { hall: 1 }),
      }),
      art({
        id: "art-breath-b",
        playlist: ["blob:http://localhost/breath-b"],
        room: bindHangRefRoom("breath-B", { hall: 1 }),
      }),
    ];
    const stock = {
      "breath-spawn": "/ui/citadel.mp4?v=aaa",
      "breath-A": "/ui/citadel.mp4?v=aaa",
      "breath-B": "/ui/citadel.mp4?v=aaa",
      "walk-spawn-A": "/ui/citadel.mp4?v=aaa",
      "walk-spawn-B": "/ui/citadel.mp4?v=aaa",
    };
    const drifted = overlayHungShelf(stock, hung, 3, "citadel-new");
    assert.equal(drifted["breath-spawn"], "blob:http://localhost/breath-spawn");
    assert.equal(drifted["walk-spawn-A"], "blob:http://localhost/walk-a");
    assert.equal(drifted["walk-spawn-B"], "blob:http://localhost/walk-b");
    assert.equal(drifted["breath-A"], "blob:http://localhost/breath-a");
    assert.equal(drifted["breath-B"], "blob:http://localhost/breath-b");
    const refs = hungRefsForPlay(hung, 3, "citadel-new");
    assert.equal(refs["breath-spawn"]?.url, "blob:http://localhost/breath-spawn");
    assert.deepEqual(filledHungPlayRoles(hung, 3, "citadel-new").sort(), [
      "breath-A",
      "breath-B",
      "breath-spawn",
      "walk-A",
      "walk-B",
    ]);
    const patches = bankPatchesFromHung(hung, 3, "citadel-new");
    assert.ok(patches.some((p) => p.key === "idle-spawn" && p.url.startsWith("blob:")));
    assert.ok(patches.some((p) => p.key === "spawn→m1" && p.url.startsWith("blob:")));
    assert.equal(hangPlaySrc("blob:http://localhost/x"), "blob:http://localhost/x");
  });
});

describe("Hang ref — UI + engine wire + README", () => {
  it("Vault Hang ref sheet and pose overlay are wired; laws in README", () => {
    const vault = readFileSync(join(here, "../components/vault-hall.tsx"), "utf8");
    const ask = readFileSync(join(here, "../components/hang-ask.tsx"), "utf8");
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    const readme = readFileSync(join(here, "../../README.md"), "utf8");
    assert.match(ask, /export function HangRefSheet/);
    assert.match(ask, /data-hang-ref/);
    assert.match(ask, /data-hang-role=\{id\}/);
    assert.match(ask, /data-hang-slot=\{id\}/);
    assert.match(ask, /data-hang-role-row="breath"/);
    assert.match(ask, /data-hang-role-row="walk"/);
    assert.match(ask, /breath-A/);
    assert.match(ask, /walk-A-B/);
    assert.match(ask, /walk-B-A/);
    const sheet = ask.slice(ask.indexOf("export function HangRefSheet"));
    assert.match(sheet, /data-hang-slots/);
    assert.doesNotMatch(sheet, /HangCitadelStrip/);
    assert.doesNotMatch(sheet, /HangRoomStrip/);
    assert.doesNotMatch(sheet, /Room \$\{picked\}/);
    assert.match(sheet, /onHangDoor/);
    assert.match(sheet, /Hang A/);
    assert.match(sheet, /Hang B/);
    assert.match(sheet, /to biome/);
    assert.match(vault, /HangRefSheet/);
    assert.match(vault, /hangPlayerRef/);
    assert.match(vault, /data-hang-ref-open/);
    assert.match(vault, /const \[hangRef, setHangRef\] = useState\(true\)/);
    assert.match(vault, /slotWrites\(refSlots\)/);
    assert.match(vault, /HANG_REF_GRAPH_HALL/);
    assert.match(vault, /playHungGraph/);
    assert.match(vault, /useRouter/);
    assert.match(vault, /persistAndRewriteHung/);
    assert.match(vault, /rememberHangFile/);
    assert.match(vault, /history\.push\(href\)/);
    assert.match(vault, /askHangGraph/);
    assert.match(vault, /rehomeHungGraph/);
    assert.match(vault, /HANG_GRAPH_PROMPT/);
    assert.match(vault, /isLegacyDoorHang/);
    assert.match(engine, /overlayHungShelf/);
    assert.match(engine, /applyHungRefBank/);
    assert.match(engine, /hydrateHungArtifacts/);
    const living = engine.slice(engine.indexOf("function enterLivingRoom"), engine.indexOf("begin.current"));
    assert.match(living, /await hydrateHungArtifacts/);
    assert.ok(living.indexOf("hydrateHungArtifacts") < living.indexOf("holdIdle()"));
    assert.ok(living.indexOf("applyHungRefBank") < living.indexOf("holdIdle()"));
    const rune = readFileSync(join(here, "../routes/rune.tsx"), "utf8");
    assert.match(rune, /s\.stills === "false"/);
    assert.match(rune, /first && \(!tour \|\| plan\)/);
    assert.match(engine, /Human Hang wins stock/);
    assert.match(engine, /hungArtsNow/);
    assert.match(engine, /hungPlayBankFrost/);
    assert.match(engine, /stockMustYield/);
    assert.match(engine, /isHungPlayUrl\(clip\.url\)/);
    const enterBreath = engine.slice(engine.indexOf("async function enterDoorBreath"), engine.indexOf("async function saveFilms"));
    assert.match(enterBreath, /hungShelf/);
    assert.match(enterBreath, /isHungPlayUrl\(shelfBreath\)/);
    assert.match(enterBreath, /applyHungRefBank\(\)/);
    assert.match(enterBreath, /showHungPicture\(url, true\)/);
    assert.match(engine, /function showHungPicture/);
    const playFrame = readFileSync(join(here, "play-frame.ts"), "utf8");
    assert.match(playFrame, /hang missed play bank/);
    const playFn = vault.slice(vault.indexOf("function playHungGraph"), vault.indexOf("function askHangGraph"));
    assert.match(playFn, /history\.push\(href\)/);
    assert.doesNotMatch(playFn, /location\.assign/);
    assert.match(playFn, /walkHangHallHref\(undefined, HANG_REF_GRAPH_HALL/);
    for (const line of HANG_REF_LAW) {
      assert.match(readme, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 28)));
    }
    assert.match(readme, /Hang refs → play room/);
    assert.match(readme, /KEEP/);
  });
});
