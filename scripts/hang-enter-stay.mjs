#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.HALL_SMOKE_URL || "http://127.0.0.1:8080";
const OUT = process.env.HALL_SMOKE_OUT || "/opt/cursor/artifacts/screenshots";
mkdirSync(OUT, { recursive: true });

async function seedHungHall2(page) {
  await page.addInitScript(() => {
    const art = {
      id: "art-forest-h2",
      name: "Forest",
      still: "/films/cook-forest.jpg",
      playlist: ["/films/forge-forest.mp4", "/ui/forge.mp4"],
      prompt: "forest",
      hungAt: Date.now(),
      grade: null,
      room: {
        door: "A",
        still: "/films/cook-forest.jpg",
        trans: "/ui/citadel.mp4?v=aaa",
        hall: 2,
        biome: "forest",
      },
    };
    try {
      localStorage.setItem("bolt-artifacts-v1", JSON.stringify([art]));
      sessionStorage.setItem("bolt-artifacts-mem-v1", JSON.stringify([art]));
    } catch {
      /* */
    }
  });
}

async function snapStay(page) {
  return page.evaluate(() => {
    const play = document.querySelector("[data-biome-play]");
    const engine = document.querySelector("[data-rune=engine]");
    const vid = play?.querySelector("video");
    const src = vid?.getAttribute("data-url") || vid?.currentSrc || vid?.getAttribute("src") || "";
    return {
      play: Boolean(play),
      stay: play?.getAttribute("data-biome-stay") === "1",
      door: play?.getAttribute("data-biome-door") || "",
      name: play?.getAttribute("data-biome-name") || "",
      src,
      hallFilm: /citadel/i.test(src),
      hall: engine?.getAttribute("data-hall") || "",
      phase: engine?.getAttribute("data-phase") || "",
      rift: engine?.getAttribute("data-rift") || "",
      miss: /MISS/i.test(document.body.innerText),
      fracture: /Film fracture/i.test(document.body.innerText),
      room1: /Room 1/i.test(document.body.innerText) && !play,
    };
  });
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

async function runCase(browser, name, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await seedHungHall2(page);
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector("[data-rune=engine][data-phase=play], [data-biome-play]", { timeout: 20000 });
    await page.waitForTimeout(700);
    const pre = await snapStay(page);
    if (pre.hall && pre.hall !== "2" && !pre.play) {
      throw new Error(`${name}: hung hall 2 bind left overlay on hall ${pre.hall}`);
    }
    if (!(await page.locator("[data-biome-play]").count())) {
      await enterDoorA(page);
    }
    await page.waitForSelector("[data-biome-play]", { timeout: 8000 });
    await page.waitForTimeout(1400);
    const stay = await snapStay(page);
    if (!stay.play || !stay.stay || stay.miss || stay.fracture || stay.room1 || stay.hallFilm) {
      throw new Error(`${name}: hang hall 2 door A did not stay biome ${JSON.stringify(stay)}`);
    }
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
    return { ok: true, name, stay };
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const results = [
    await runCase(browser, "hang-h2-from-hall1", "/rune?first=m1&drive=engine&rooms=2&hall=1&stills=0"),
    await runCase(browser, "hang-h2-from-hall2", "/rune?first=m1&drive=engine&rooms=2&hall=2&stills=0"),
  ];
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
