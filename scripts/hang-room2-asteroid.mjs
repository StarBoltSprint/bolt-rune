#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.HALL_SMOKE_URL || "http://127.0.0.1:8080";
const OUT = process.env.HALL_SMOKE_OUT || "/opt/cursor/artifacts/screenshots";
mkdirSync(OUT, { recursive: true });

async function seedAsteroidHalls(page) {
  await page.addInitScript(() => {
    const art = {
      id: "art-asteroid-h2",
      name: "Asteroid",
      still: "/films/cook-asteroid.jpg",
      playlist: ["/films/forge-asteroid.mp4", "/ui/forge.mp4"],
      prompt: "asteroid",
      hungAt: Date.now(),
      grade: null,
    };
    const cit = {
      id: "cit-smoke-h2",
      name: "Citadel",
      title: "Citadel",
      updated: Date.now(),
      phase: "play",
      want: 2,
      walks: 0,
      thumb: "/films/citadel-tour.jpg",
      rooms: 2,
      hall: 1,
    };
    try {
      localStorage.setItem("bolt-artifacts-v1", JSON.stringify([art]));
      sessionStorage.setItem("bolt-artifacts-mem-v1", JSON.stringify([art]));
      localStorage.setItem("bolt-rune-catalog-v1", JSON.stringify([cit]));
      sessionStorage.setItem("bolt-rune-catalog-v1", JSON.stringify([cit]));
      localStorage.setItem("bolt-last-play", JSON.stringify({ id: cit.id, title: cit.title, hall: 1, rooms: 2 }));
      sessionStorage.setItem("bolt-last-play", JSON.stringify({ id: cit.id, title: cit.title, hall: 1, rooms: 2 }));
      const stored = {
        ...cit,
        halls: [
          { n: 1, still: "/films/citadel-tour.jpg", bank: [], refs: [], pins: [] },
          { n: 2, still: "/films/citadel-tour.jpg", bank: [], refs: [], pins: [] },
        ],
      };
      localStorage.setItem("bolt-rune-store-v1", JSON.stringify([stored]));
      sessionStorage.setItem("bolt-rune-mem-v1", JSON.stringify([stored]));
    } catch {
      /* */
    }
  });
}

async function snapHall(page) {
  return page.evaluate(() => {
    const engine = document.querySelector("[data-rune=engine]");
    const play = document.querySelector("[data-biome-play]");
    const vid = play?.querySelector("video");
    const img = play?.querySelector("img");
    const src = vid?.getAttribute("data-url") || vid?.currentSrc || vid?.getAttribute("src") || "";
    const poster = img?.currentSrc || img?.getAttribute("src") || vid?.getAttribute("poster") || "";
    return {
      play: Boolean(play),
      stay: play?.getAttribute("data-biome-stay") === "1",
      name: play?.getAttribute("data-biome-name") || "",
      door: play?.getAttribute("data-biome-door") || "",
      src,
      poster,
      hallFilm: /citadel/i.test(src) || /\/ui\/forge\.mp4/i.test(src),
      biomeStill: /cook-asteroid|cook-forest|\/films\/cook-/.test(poster),
      hall: engine?.getAttribute("data-hall") || "",
      phase: engine?.getAttribute("data-phase") || "",
      rift: engine?.getAttribute("data-rift") || "",
      room1: /Room 1/i.test(document.body.innerText) && !play,
      room2: /Room 2/i.test(document.body.innerText),
      miss: /MISS/i.test(document.body.innerText),
      fracture: /Film fracture/i.test(document.body.innerText),
    };
  });
}

async function openHangA(page) {
  if (await page.locator("[data-hang-ask=A]").count()) return;
  if (await page.locator("[data-hang=A]").count()) {
    await page.locator("[data-hang=A]").first().click();
    return;
  }
  const menu = page.locator('[aria-label="menu"]');
  if (await menu.count()) {
    await menu.first().click();
    await page.waitForTimeout(200);
  }
  const add = page.locator("button", { hasText: /Add artefact|Artefacts/i });
  if (await add.count()) {
    await add.first().click();
    await page.waitForTimeout(400);
  }
  if (await page.locator("[data-hang=A]").count()) {
    await page.locator("[data-hang=A]").first().click();
  }
}

async function enterDoorA(page) {
  const fired = await page.evaluate(() => {
    const d = document.querySelector("[data-door=m1]");
    if (!d) return false;
    d.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
    d.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, view: window }));
    return true;
  });
  if (!fired) {
    const box = await page.locator("[data-rune=engine]").boundingBox();
    if (box) await page.mouse.click(box.x + box.width * 0.22, box.y + box.height * 0.42);
  }
}

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
try {
  await seedAsteroidHalls(page);
  await page.goto(`${BASE}/rune?first=m1&drive=engine&rooms=2&hall=1&stills=0`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });
  await page.waitForSelector("[data-rune=engine][data-phase=play]", { timeout: 20000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/hang21-title-before.png`, fullPage: false });

  await openHangA(page);
  await page.waitForSelector("[data-hang-ask=A]", { timeout: 8000 });
  await page.waitForSelector("[data-hang-ask] [data-hang-pick='2']", { timeout: 5000 });
  await page.locator("[data-hang-ask] [data-hang-pick='2']").first().click();
  await page.waitForSelector('[data-hang-armed="1"]', { timeout: 4000 });
  await page.locator("[data-hang-confirm]").first().click();
  await page.waitForFunction(() => !document.querySelector("[data-hang-ask]"), { timeout: 5000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/hang21-enter.png`, fullPage: false });

  const afterHang = await snapHall(page);
  if (afterHang.hall !== "2") {
    throw new Error(`hang Room 2 bound hall ${afterHang.hall || "?"} ${JSON.stringify(afterHang)}`);
  }

  await enterDoorA(page);
  await page.waitForSelector("[data-biome-play]", { timeout: 8000 });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${OUT}/hang21-door-tap.png`, fullPage: false });
  const stay = await snapHall(page);
  if (!stay.play || !stay.stay || stay.hallFilm || stay.room1 || stay.fracture) {
    throw new Error(`Door A after hang Room 2 did not stay biome ${JSON.stringify(stay)}`);
  }
  await page.waitForTimeout(2500);
  const held = await snapHall(page);
  await page.screenshot({ path: `${OUT}/hang21-later.png`, fullPage: false });
  if (!held.play || !held.stay || held.hallFilm || held.room1 || held.fracture) {
    throw new Error(`biome snapped back to the room ${JSON.stringify(held)}`);
  }
  console.log(JSON.stringify({ ok: true, afterHang, stay, held }, null, 2));
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
