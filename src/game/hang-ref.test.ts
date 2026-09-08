import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HungArtifact } from "./artifacts.ts";
import { hangArtifactOnDoor } from "./enter-graph.ts";
import { hungOnDoor } from "./pcg-chunk.ts";
import { mayHang } from "./smoke-gate.ts";
import {
  bankPatchesFromHung,
  bindHangRefRoom,
  clipIdOfHangRole,
  continuityReasons,
  doorOfHangRole,
  hangMediaSrc,
  hangRefRole,
  hangRoleOwnsDoor,
  hungOnRole,
  hungRefsForHall,
  isContinuityOnlyFail,
  isHangMediaUrl,
  isImaginePostUrl,
  mayHangPlayerRef,
  overlayHungShelf,
  parseImaginePostUrl,
  poseOfHangRole,
  HANG_REF_LAW,
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
    assert.equal(hangRefRole("walk-A"), "walk-A");
    assert.equal(hangRefRole("nope"), "breath-spawn");
    assert.equal(poseOfHangRole("breath-spawn"), "spawn");
    assert.equal(poseOfHangRole("walk-A"), "atA");
    assert.equal(poseOfHangRole("walk-B"), "atB");
    assert.equal(clipIdOfHangRole("breath-spawn"), "breath-spawn");
    assert.equal(clipIdOfHangRole("walk-A"), "walk-spawn-A");
    assert.equal(clipIdOfHangRole("walk-B"), "walk-spawn-B");
    assert.equal(doorOfHangRole("walk-B"), "B");
    assert.equal(doorOfHangRole("breath-spawn"), "A");
    assert.equal(hangRoleOwnsDoor("breath-spawn", "A"), false);
    assert.equal(hangRoleOwnsDoor("walk-A", "A"), true);
    assert.equal(hangRoleOwnsDoor(undefined, "A"), true);
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
    ];
    const stock = {
      "breath-spawn": "/ui/citadel.mp4?v=aaa",
      "walk-spawn-A": "/ui/citadel.mp4?v=aaa",
      "walk-spawn-B": "/ui/citadel.mp4?v=aaa",
    };
    const shelf = overlayHungShelf(stock, hung, 2, "cit-1");
    assert.equal(shelf["breath-spawn"], "/films/breath-mine.mp4");
    assert.equal(shelf["walk-spawn-A"], "/films/walk-mine.mp4");
    assert.equal(shelf["walk-spawn-B"], "/ui/citadel.mp4?v=aaa");
    const miss = overlayHungShelf(stock, hung, 1, "cit-1");
    assert.equal(miss["breath-spawn"], "/ui/citadel.mp4?v=aaa");
    assert.equal(hungOnRole(hung, "walk-A", 2, "cit-1")?.id, "art-walk-a");
    assert.equal(hungOnDoor(hung, "A", 2)?.id, "art-walk-a");
    assert.notEqual(hungOnDoor(hung, "A", 2)?.id, "art-breath");
    const refs = hungRefsForHall(hung, 2, "cit-1");
    assert.equal(refs["breath-spawn"]?.pose, "spawn");
    assert.equal(refs["walk-A"]?.pose, "atA");
    const patches = bankPatchesFromHung(hung, 2, "cit-1");
    assert.ok(patches.some((p) => p.key === "idle-spawn" && p.url === "/films/breath-mine.mp4"));
    assert.ok(patches.some((p) => p.key === "spawn→m1" && p.url === "/films/walk-mine.mp4"));
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
    assert.match(vault, /HangRefSheet/);
    assert.match(vault, /hangPlayerRef/);
    assert.match(vault, /data-hang-ref-open/);
    assert.match(engine, /overlayHungShelf/);
    assert.match(engine, /applyHungRefBank/);
    assert.match(engine, /Human Hang wins stock/);
    for (const line of HANG_REF_LAW) {
      assert.match(readme, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 28)));
    }
    assert.match(readme, /Hang refs → play room/);
    assert.match(readme, /KEEP/);
  });
});
