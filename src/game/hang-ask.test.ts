import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { walkHangHallHref } from "./enter-graph.ts";
import { HANG_CONFIRM_ARM_MS, HANG_HALL_FLOOR, HANG_LEFTOVER_SWALLOW_MS, HANG_PENDING_KEY, dropHangPending, hangActEnters, hangBindHall, hangCardHall, hangDoorAct, hangStillLane, hangStillSwipe, hangStillWrap, hangStripCards, hangStripPick, readHangPending, sheetConfirmHall, swallowOpeningTap, takeHangPending, writeHangFloor, writeHangPending } from "./hang-ask.ts";

function clickOn(target: { closest?: (sel: string) => unknown; getAttribute: (k: string) => string | null }) {
  const e = new Event("click", { bubbles: true, cancelable: true });
  Object.defineProperty(e, "target", { value: target });
  Object.defineProperty(e, "composedPath", { value: () => [target] });
  return e;
}

describe("hang still carousel", () => {
  it("wraps next/prev and treats edges as back, centre as lock", () => {
    assert.equal(hangStillWrap(8, 0, 1), 1);
    assert.equal(hangStillWrap(8, 7, 1), 0);
    assert.equal(hangStillWrap(8, 0, -1), 7);
    assert.equal(hangStillWrap(1, 0, 1), 0);
    assert.equal(hangStillWrap(0, 3, 1), 0);
    assert.equal(hangStillLane(0.5), "lock");
    assert.equal(hangStillLane(0.1), "back");
    assert.equal(hangStillLane(0.9), "back");
    assert.equal(hangStillSwipe(-80, 10), 1);
    assert.equal(hangStillSwipe(80, 10), -1);
    assert.equal(hangStillSwipe(20, 80), 0);
  });

  it("pending hang stores hall N until the living-hall door tap takes it", () => {
    const store = new Map<string, string>();
    const fake = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    Object.defineProperty(globalThis, "sessionStorage", { value: fake, configurable: true });
    writeHangPending({ id: "art-1", citadel: "cit-2", hall: 3 });
    assert.equal(store.get(HANG_PENDING_KEY)?.includes("art-1"), true);
    const got = readHangPending();
    assert.deepEqual(got, { id: "art-1", citadel: "cit-2", hall: 3 });
    assert.deepEqual(takeHangPending(), { id: "art-1", citadel: "cit-2", hall: 3 });
    assert.equal(readHangPending(), null);
    writeHangPending({ id: "", citadel: "cit-2", hall: 3 });
    assert.equal(readHangPending(), null);
    assert.match(walkHangHallHref("cit-8", 4), /session=cit-8/);
    assert.match(walkHangHallHref("cit-8", 4), /hall=4/);
    assert.ok(!walkHangHallHref("cit-8", 4).includes("first="));
    assert.equal(walkHangHallHref("cit-8", 0), "");
    writeHangPending({ id: "art-1", citadel: "cit-2", hall: 3 });
    dropHangPending("cit-2", 3);
    assert.equal(readHangPending(), null);
    writeHangPending({ id: "art-1", citadel: "cit-2", hall: 5 });
    dropHangPending("cit-2", 3, [[5, 4]]);
    assert.deepEqual(readHangPending(), { id: "art-1", citadel: "cit-2", hall: 4 });
    store.set(HANG_HALL_FLOOR, "8");
    writeHangFloor(2, "set");
    assert.equal(store.get(HANG_HALL_FLOOR), "2");
    writeHangFloor(5, "hold");
    assert.equal(store.get(HANG_HALL_FLOOR), "5");
  });
});

describe("hang ask leftover tap", () => {
  it("confirm stays unarmed long enough that Hang A leftover click cannot bind", () => {
    assert.ok(HANG_CONFIRM_ARM_MS >= 1000);
    assert.ok(HANG_LEFTOVER_SWALLOW_MS >= HANG_CONFIRM_ARM_MS);
  });

  it("swallowOpeningTap eats leftover Play Sprint and confirm taps", () => {
    const hits: string[] = [];
    const cap: Array<(e: Event) => void> = [];
    const bubble: Array<(e: Event) => void> = [];
    const root = {
      addEventListener(type: string, fn: (e: Event) => void, capture?: boolean) {
        (capture ? cap : bubble).push(fn);
      },
      removeEventListener(type: string, fn: (e: Event) => void, capture?: boolean) {
        const list = capture ? cap : bubble;
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      },
      dispatch(e: Event) {
        for (const fn of cap) fn(e);
        if (!e.defaultPrevented) for (const fn of bubble) fn(e);
      },
    };
    bubble.push((e) => hits.push((e.target as { kind?: string }).kind || e.type));
    const confirm = {
      kind: "confirm",
      getAttribute: (k: string) => (k === "data-hang-confirm" ? "A" : null),
    };
    const play = {
      kind: "play",
      getAttribute: (k: string) => (k === "data-play-sprint" ? "" : null),
    };
    const room = {
      kind: "room",
      getAttribute: () => null,
    };
    const release = swallowOpeningTap(80, root);
    root.dispatch(clickOn(play));
    root.dispatch(clickOn(play));
    root.dispatch(clickOn(confirm));
    root.dispatch(clickOn(room));
    assert.deepEqual(hits, ["room"]);
    release();
    root.dispatch(clickOn(confirm));
    assert.deepEqual(hits, ["room", "confirm"]);
  });

  it("Room 3 card tap is never swallowed — leftover pointerup must not steal the pick", () => {
    const hits: string[] = [];
    const cap: Array<(e: Event) => void> = [];
    const bubble: Array<(e: Event) => void> = [];
    const root = {
      addEventListener(type: string, fn: (e: Event) => void, capture?: boolean) {
        (capture ? cap : bubble).push(fn);
      },
      removeEventListener(type: string, fn: (e: Event) => void, capture?: boolean) {
        const list = capture ? cap : bubble;
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      },
      dispatch(e: Event) {
        for (const fn of cap) fn(e);
        if (!e.defaultPrevented) for (const fn of bubble) fn(e);
      },
    };
    bubble.push((e) => hits.push((e.target as { kind?: string }).kind || e.type));
    const leftover = {
      kind: "leftover",
      getAttribute: () => null,
    };
    const room3 = {
      kind: "room3",
      getAttribute: (k: string) => (k === "data-hang-pick" ? "3" : null),
    };
    const release = swallowOpeningTap(80, root);
    const pointerup = new Event("pointerup", { bubbles: true, cancelable: true });
    Object.defineProperty(pointerup, "target", { value: leftover });
    Object.defineProperty(pointerup, "composedPath", { value: () => [leftover] });
    root.dispatch(pointerup);
    const click = new Event("click", { bubbles: true, cancelable: true });
    Object.defineProperty(click, "target", { value: room3 });
    Object.defineProperty(click, "composedPath", { value: () => [room3] });
    root.dispatch(click);
    release();
    const freshCap: Array<(e: Event) => void> = [];
    const freshBubble: Array<(e: Event) => void> = [];
    const fresh = {
      addEventListener(type: string, fn: (e: Event) => void, capture?: boolean) {
        (capture ? freshCap : freshBubble).push(fn);
      },
      removeEventListener() {},
      dispatch(e: Event) {
        for (const fn of freshCap) fn(e);
        if (!e.defaultPrevented) for (const fn of freshBubble) fn(e);
      },
    };
    const freshHits: string[] = [];
    freshBubble.push((e) => freshHits.push((e.target as { kind?: string }).kind || e.type));
    const arm = swallowOpeningTap(80, fresh);
    fresh.dispatch(clickOn(room3));
    assert.deepEqual(freshHits, ["room3"]);
    assert.ok(hits.includes("room3"));
    arm();
  });

  it("tapped Room 3 confirm is 3, not last-hung / parent hall 8", () => {
    assert.equal(hangCardHall(3), 3);
    assert.equal(hangCardHall("3"), 3);
    assert.equal(sheetConfirmHall(3, 8), 3);
    assert.equal(sheetConfirmHall("3", 8), 3);
    assert.notEqual(sheetConfirmHall(3, 8), 8);
    assert.equal(sheetConfirmHall(undefined, 8), 8);
    assert.equal(hangBindHall(3), 3);
    assert.equal(hangBindHall("7"), 7);
    assert.equal(hangBindHall(undefined), 0);
    assert.notEqual(hangBindHall(undefined), 8);
    assert.equal(hangDoorAct("enter"), "enter");
    assert.equal(hangDoorAct("bind"), "bind");
    assert.equal(hangDoorAct("walk"), "bind");
    assert.equal(hangDoorAct(undefined), "bind");
    assert.equal(hangActEnters("enter"), true);
    assert.equal(hangActEnters("bind"), false);
    assert.equal(hangActEnters(null), false);
  });

  it("strip card index is not hall N — tap index 2 binds Room 3, not 8", () => {
    const eight = [1, 2, 3, 4, 5, 6, 7, 8].map((hall) => ({
      hall,
      name: `Room ${hall}`,
      still: "",
      living: hall === 8,
      bindHall: hall === 3 ? 8 : undefined,
    }));
    const cards = hangStripCards(eight);
    assert.equal(cards[2]?.index, 2);
    assert.equal(cards[2]?.hall, 3);
    assert.equal(cards[2]?.bindHall, 8);
    assert.equal(hangStripPick(eight, 2), 3);
    assert.notEqual(hangStripPick(eight, 2), 8);
    assert.notEqual(hangStripPick(eight, 2), eight.length);
    assert.notEqual(hangStripPick(eight, 2), cards[2]?.index);
    assert.notEqual(hangStripPick(eight, 2), cards[2]?.bindHall);
    assert.equal(hangStripPick(eight, 7), 8);
    assert.equal(sheetConfirmHall(hangStripPick(eight, 2), 8), 3);
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../components/hang-ask.tsx"), "utf8");
    assert.match(src, /data-hang-card-index=\{card\.index\}/);
    assert.match(src, /data-hang-pick=\{n\}/);
    assert.match(src, /data-hang-citadel-pick/);
    assert.match(src, /data-hang-citadel-lock/);
    assert.match(src, /data-hang-citadels/);
    assert.match(src, /HangCitadelStrip/);
    assert.match(src, />\s*Lock\s*</);
    assert.doesNotMatch(src, /data-hang-confirm=\{door\}[\s\S]{0,160}className="sr-only"/);
    assert.match(src, /onCitadel/);
    assert.match(src, /hangStripPick\(rooms, card\.index\)/);
    assert.match(src, /data-still-carousel/);
    assert.match(src, /data-still-actions/);
    assert.match(src, /Walk this hall/);
    assert.match(src, /Hang & enter/);
    assert.match(src, /data-hang-act="bind"/);
    assert.match(src, /data-hang-act="enter"/);
    assert.match(src, /data-hang-choice/);
    assert.match(src, /onLock=\{pickHall\}/);
    assert.doesNotMatch(src, /onLock=\{lockRoom\}/);
    assert.match(src, /hangStillSwipe/);
    assert.match(src, /hangStillLane/);
    assert.doesNotMatch(src, /overflow-x-auto/);
    assert.doesNotMatch(src, /grid-cols-2/);
    assert.doesNotMatch(src, /onHall\(i \+ 1\)/);
    assert.doesNotMatch(src, /onHall\(card\.index\)/);
    assert.doesNotMatch(src, /Room \{i \+ 1\}/);
  });

  it("confirm passes the picked hall so Hang A room 2 does not bind room 1", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../components/hang-ask.tsx"), "utf8");
    assert.match(src, /onConfirm: \(hall: number, act: HangDoorAct\) => void/);
    assert.match(src, /onConfirm\(hangBindHall\(picked\) \|\| hangBindHall\(pickedRef\.current\), hangDoorAct\(act\)\)/);
    assert.match(src, /const \[picked, setPicked\]/);
    assert.match(src, /choseRef\.current/);
    assert.match(src, /if \(choseRef\.current\) return/);
    assert.match(src, /function pickHall/);
    assert.match(src, /data-hang-picked=\{picked\}/);
    assert.match(src, /hangStripCards\(rooms\)/);
    assert.match(src, /hangStripPick\(rooms, card\.index\)/);
    assert.match(src, /onPointerDown/);
    assert.doesNotMatch(src, /onPointerUp=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*pick\(\);/);
    assert.doesNotMatch(src, /pickedRef\.current = picked;/);
    const vault = readFileSync(join(here, "../components/vault-hall.tsx"), "utf8");
    assert.match(vault, /onConfirm=\{\(hall, act\) => \{/);
    assert.match(vault, /pickHangCitadel/);
    assert.match(vault, /listHangCitadels/);
    assert.match(vault, /citadels=\{hangCitadels\}/);
    assert.match(vault, /writeHangPending/);
    assert.match(vault, /walkHangHallHref/);
    assert.match(vault, /hangActEnters/);
    assert.match(vault, /hangDoorAct\(act\)/);
    assert.match(vault, /data-hang-bound/);
    assert.match(vault, /hung · Play to walk/);
    assert.match(vault, /StillCarousel/);
    assert.match(vault, /data-vault-actions/);
    assert.match(vault, />\s*Continue\s*</);
    assert.match(vault, />\s*Shift\s*</);
    assert.match(vault, />\s*Play\s*</);
    assert.match(vault, /Unhang/);
    assert.match(vault, /<ClipSpecBar compact disabled=\{busy\} \/>/);
    const actionsBlock = vault.slice(vault.indexOf("data-vault-actions"), vault.indexOf("sr-only sticky"));
    assert.match(actionsBlock, /<ClipSpecBar compact/);
    assert.match(actionsBlock, />\s*Continue\s*</);
    assert.ok(actionsBlock.indexOf("<ClipSpecBar compact") < actionsBlock.indexOf("Continue"));
    const shiftSheet = vault.indexOf("Shift biome");
    assert.ok(shiftSheet >= 0 && vault.lastIndexOf("<ClipSpecBar") > shiftSheet);
    const specBar = readFileSync(join(here, "../components/clip-spec.tsx"), "utf8");
    assert.match(specBar, /data-clip-spec="card"/);
    assert.match(specBar, /data-clip-secs-pick=\{s\}/);
    assert.match(specBar, /data-clip-res-pick=\{r\}/);
    assert.match(specBar, /6, 10, 15/);
    assert.match(specBar, /"720", "1080"/);
    assert.match(specBar, /Next continue \/ shift/);
    assert.match(vault, /cookFrameLine/);
    assert.match(vault, /cookFrameHint/);
    assert.doesNotMatch(vault, /frame \$\{polled\.frame\}/);
    const hangAVis = vault.indexOf('data-hang={vaultHangStart("A")');
    const vaultActions = vault.indexOf("data-vault-actions");
    const botOnly = vault.indexOf("sr-only sticky");
    assert.ok(vaultActions >= 0 && hangAVis > vaultActions);
    assert.ok(botOnly < 0 || hangAVis < botOnly);
    assert.match(vault, /hangDoor\(hangAsk\.a, hangAsk\.door, undefined, hangBindHall\(hall\), choice\)/);
    assert.match(vault, /hangBindHall\(hallWant\)/);
    assert.match(vault, /const bindHall = hangBindHall\(hallWant\)/);
    assert.match(vault, /if \(now < hangGuard\.current\) return/);
    assert.match(vault, /swallowOpeningTap\(\)/);
    assert.doesNotMatch(vault, /const bindHall = pick\?\.bindHall \|\| hall/);
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    assert.match(engine, /onConfirm=\{\(hall, act\) => \{/);
    assert.match(engine, /writeHangPending/);
    assert.match(engine, /readHangPending/);
    assert.match(engine, /takeHangPending/);
    assert.match(engine, /beginRift\(id, gateFromHung\(a\), bind\)/);
    assert.match(engine, /walkHangHallHref/);
    assert.match(engine, /hangBindHall\(hall\)/);
    assert.match(engine, /hangActEnters\(choice\)/);
    assert.match(engine, /attachRift\(door, gateFromHung\(hangAsk\.a\), bindHall\)/);
    assert.match(engine, /if \(!hangActEnters\(choice\)\) return/);
    assert.match(engine, /pickHangHall/);
    assert.match(engine, /livingHangHall/);
    assert.match(engine, /hangBindHall/);
    assert.match(engine, /listHangRooms\(/);
    assert.match(engine, /listHangCitadels/);
    assert.match(engine, /pickHangCitadel/);
    assert.match(engine, /citadels=\{hangCitadels\}/);
    assert.match(engine, /liveHangRooms/);
    assert.match(engine, /const \[liveHall, setLiveHall\]/);
    assert.doesNotMatch(engine, /const \[hallN,/);
    assert.match(engine, /goHungHall/);
    assert.match(engine, /hungDoorReady/);
    assert.match(engine, /resolveHungEnter/);
    assert.match(engine, /hungPlayChrome/);
    assert.match(engine, /data-living-hall=/);
    assert.match(engine, /riftFilm\(stay\.name, stay\.still, stay\.clips, hall, letter\)/);
    assert.match(engine, /hungEnterBindHall\(/);
    assert.match(engine, /liveArt\?\.room\?\.hall/);
    assert.match(engine, /setLiveHall\(bindHall\)/);
    assert.match(engine, /chromeHall/);
    assert.match(vault, /vaultHangCaption\(head\.room\)/);
    assert.match(vault, /holdDoor=\{live\.room\?\.door === "B" \? "B"/);
  });

  it("Hang pick Room 8 confirm binds hall 8, not the column default", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../components/hang-ask.tsx"), "utf8");
    assert.match(src, /do not overwrite a tapped Room N/);
    assert.match(src, /Do not release swallow on unmount/);
    assert.match(src, /onConfirm\(hangBindHall\(picked\) \|\| hangBindHall\(pickedRef\.current\), hangDoorAct\(act\)\)/);
    assert.match(src, /hangCardHall/);
    assert.match(src, /onPointerDown/);
    assert.doesNotMatch(src, /return \(\) => \{\s*release\(\);/);
    const vault = readFileSync(join(here, "../components/vault-hall.tsx"), "utf8");
    const hangDoor = vault.slice(vault.indexOf("function hangDoor"), vault.indexOf("function botHang"));
    assert.match(hangDoor, /hangBindHall\(hallWant\)/);
    assert.doesNotMatch(hangDoor, /resolveHangRoom\(rooms, hallWant/);
    assert.match(hangDoor, /const bindHall = hangBindHall\(hallWant\)/);
    const engine = readFileSync(join(here, "../components/rune-engine.tsx"), "utf8");
    assert.match(engine, /hangBindHall\(hall\)/);
    assert.match(engine, /goHungHall\(bindHall/);
    const goHung = engine.slice(engine.indexOf("async function goHungHall"), engine.indexOf("function destHall"));
    assert.match(goHung, /hallsHold\.current\.find\(\(h\) => h\.n === bind\)/);
    assert.doesNotMatch(goHung, /hallsHold\.current\[n - 1\]/);
    assert.match(goHung, /if \(!slice\.still \|\| \(hintStill && \/citadel-tour/);
    assert.match(engine, /applyHall\(\{ \.\.\.slice, n: bind \}, false\)/);
    assert.match(engine, /attachRift\(door, gate, bindHall\)/);
    assert.match(engine, /hungPlayChrome\(chromeHall/);
    assert.match(engine, /if \(hangAsk\) return/);
    assert.match(engine, /if \(now < hangGuard\.current\) return/);
    assert.match(engine, /hangGuard\.current/);
    assert.match(engine, /Leftover Hang A \/ Door A after confirm must stay on hall N/);
    const goEnterFn = engine.slice(engine.indexOf("async function goEnter"), engine.indexOf("function enterNext"));
    assert.match(goEnterFn, /if \(now < hangGuard\.current\) return/);
    assert.match(engine, /setSprint\(null\)/);
    assert.match(engine, /data-hall-wired=/);
    assert.doesNotMatch(engine, /if \(hereHall && hereRef\.current === door\) setEnterAsk\(door\)/);
    const vaultWalk = readFileSync(join(here, "../components/vault-hall.tsx"), "utf8");
    assert.match(vaultWalk, /walkHungHref\(live\.room/);
    assert.match(vaultWalk, /window\.location\.assign\(href\)/);
    const vaultHang = readFileSync(join(here, "../components/vault-hall.tsx"), "utf8");
    const hangDoorFn = vaultHang.slice(vaultHang.indexOf("function hangDoor"), vaultHang.indexOf("function botHang"));
    assert.match(hangDoorFn, /swallowOpeningTap\(\)/);
    assert.match(hangDoorFn, /hangGuard\.current/);
    assert.match(hangDoorFn, /if \(hangActEnters\(act\)\)/);
    assert.match(hangDoorFn, /hung · Play to walk/);
    assert.match(hangDoorFn, /Only Hang & enter walks the hall/);
    const assignAt = hangDoorFn.indexOf("window.location.assign(href)");
    const enterGateAt = hangDoorFn.indexOf("if (hangActEnters(act))");
    assert.ok(enterGateAt >= 0 && assignAt > enterGateAt);
    const load = readFileSync(join(here, "../components/citadel-hub.tsx"), "utf8");
    assert.match(load, /data-load-play/);
    assert.match(load, /StillChip/);
    const cine = readFileSync(join(here, "../components/cine-app.tsx"), "utf8");
    assert.match(cine, /hungFilmHold\(custom\)/);
    assert.match(cine, /holdHall=\{hold\.hall\}/);
    const swallow = readFileSync(join(here, "./hang-ask.ts"), "utf8");
    assert.match(swallow, /hitsHangPick/);
    assert.match(swallow, /hitsHangOpen/);
    assert.match(swallow, /if \(hitsHangPick\(e\)\) return/);
  });
});
