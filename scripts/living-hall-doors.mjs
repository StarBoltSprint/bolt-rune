#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.HALL_SMOKE_URL || "http://127.0.0.1:8080";
const OUT = process.env.HALL_SMOKE_OUT || "/opt/cursor/artifacts/screenshots";
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile412", width: 412, height: 720 },
];

mkdirSync(OUT, { recursive: true });

async function picturePoint(page, nx, ny) {
  return page.evaluate(
    ({ nx, ny }) => {
      const root = document.querySelector("[data-rune=engine]");
      const layer = root?.querySelector(":scope > div");
      const boxRoot = layer || root;
      if (!boxRoot) return { ok: false, reason: "no-root" };
      const rect = boxRoot.getBoundingClientRect();
      const pic = boxRoot.querySelector("img");
      const ar = pic && pic.naturalWidth > 8 ? pic.naturalWidth / pic.naturalHeight : 9 / 16;
      let fw = rect.width;
      let fh = rect.width / ar;
      if (fh > rect.height) {
        fh = rect.height;
        fw = rect.height * ar;
      }
      const x = rect.left + (rect.width - fw) / 2 + nx * fw;
      const y = rect.top + (rect.height - fh) / 2 + ny * fh;
      const el = document.elementFromPoint(x, y);
      return {
        ok: true,
        x,
        y,
        tag: el?.tagName || "",
        door: el?.getAttribute?.("data-door") || "",
        beat: root?.getAttribute("data-beat") || "",
      };
    },
    { nx, ny },
  );
}

async function tapPicture(page, nx, ny) {
  const info = await picturePoint(page, nx, ny);
  if (info.ok) await page.mouse.click(info.x, info.y);
  return info;
}

async function engineState(page) {
  return page.evaluate(() => {
    const el = document.querySelector("[data-rune=engine]");
    const look = document.querySelector("[data-look]");
    const pct = document.querySelector("[data-forge-pct]");
    if (!el && !look) return { present: false };
    return {
      present: true,
      phase: el?.getAttribute("data-phase") || (look ? "look" : ""),
      beat: el?.getAttribute("data-beat") || "",
      camera: el?.getAttribute("data-camera") || "",
      here: el?.getAttribute("data-here") || "",
      living: el?.getAttribute("data-living") || "",
      stockWalk: el?.getAttribute("data-stock-walk") || "",
      look: Boolean(look),
      forge: Boolean(document.querySelector("[data-forge=start]")),
      botForge: Boolean(document.querySelector("[data-forge=bot]")),
      botLabel: document.querySelector("[data-forge=bot]")?.textContent?.trim() || "",
      lookLock: look?.getAttribute("data-look-lock") || "",
      forgePack:
        document.querySelector("[data-forge=bot]")?.getAttribute("data-forge-pack") ||
        el?.getAttribute("data-forge-pack") ||
        "",
      forgeWish: el?.getAttribute("data-forge-wish") || "",
      forgePct: pct?.getAttribute("data-forge-pct") || "",
      frost: document.body.innerText,
      films: /3 walks/i.test(document.body.innerText),
    };
  });
}

async function waitBeat(page, want, timeoutMs = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await engineState(page);
    if (s.beat === want) return s;
    await page.waitForTimeout(80);
  }
  return engineState(page);
}

async function openCreateDoor(page, letter) {
  await page.goto(`${BASE}/rune`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(300);
  const fresh = page.locator("a", { hasText: "New citadel" });
  if (await fresh.count()) await fresh.first().click();
  else await page.goto(`${BASE}/rune?tour=1&drive=engine&rooms=1&hall=1`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);
  await page.waitForSelector(`[aria-label=${letter}]`, { timeout: 15000 });
  await page.locator(`[aria-label=${letter}]`).first().click();
  await page.waitForTimeout(200);
  const next = page.locator("a", { hasText: "Next" }).first();
  const href = await next.getAttribute("href");
  if (href && /stills=0/.test(href)) {
    throw new Error(`create Next still skips forge (${href})`);
  }
  await next.click();
}

async function runCreateLook(browser, vp) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  try {
    await openCreateDoor(page, "A");
    await page.waitForSelector("[data-look]", { timeout: 15000 });
    const lookA = await engineState(page);
    if (!lookA.look || !lookA.forge || !lookA.botForge || lookA.botLabel !== "Grok Bot Forge" || lookA.films) {
      throw new Error(`${vp.name}: Door A create missed look/Forge + Grok Bot Forge ${JSON.stringify(lookA)}`);
    }
    if (lookA.lookLock === "1" || lookA.forgePack !== "sealed") {
      throw new Error(`${vp.name}: unlocked look must keep sealed DEFAULT HALL ${JSON.stringify(lookA)}`);
    }
    const style = page.locator("[data-look] input[placeholder]");
    await style.fill("crystal ferns");
    await page.locator("[data-look] button", { hasText: /^Lock$/i }).click();
    await page.waitForTimeout(80);
    const locked = await engineState(page);
    if (locked.lookLock !== "1" || locked.forgePack !== "live") {
      throw new Error(`${vp.name}: LOCK did not switch Grok Bot Forge to live hall ${JSON.stringify(locked)}`);
    }
    await page.locator("[data-look] button", { hasText: /^Clear$/i }).click();
    await page.waitForTimeout(80);
    const cleared = await engineState(page);
    if (cleared.lookLock === "1" || cleared.forgePack !== "sealed") {
      throw new Error(`${vp.name}: CLEAR did not return Grok Bot Forge to sealed DEFAULT HALL ${JSON.stringify(cleared)}`);
    }
    await style.fill("crystal ferns");
    await page.locator("[data-look] button", { hasText: /^Lock$/i }).click();
    await page.waitForTimeout(80);
    await page.screenshot({ path: `${OUT}/${vp.name}-create-look.png`, fullPage: false });
    await page.locator("[data-forge=start]").click();
    await page.waitForSelector("[data-forge-pct]", { timeout: 12000 });
    const cooking = await engineState(page);
    if (!cooking.forgePct && cooking.phase === "look") {
      throw new Error(`${vp.name}: Forge tap did not start cook UI ${JSON.stringify(cooking)}`);
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${vp.name}-create-forge-pct.png`, fullPage: false });

    await openCreateDoor(page, "B");
    await page.waitForSelector("[data-look]", { timeout: 15000 });
    const lookB = await engineState(page);
    if (!lookB.look || !lookB.forge || !lookB.botForge) {
      throw new Error(`${vp.name}: Door B create missed look/Forge + Grok Bot Forge ${JSON.stringify(lookB)}`);
    }
    if (lookB.lookLock === "1" || lookB.forgePack !== "sealed") {
      throw new Error(`${vp.name}: Door B unlocked look must stay sealed ${JSON.stringify(lookB)}`);
    }
    await page.locator("[data-look] input[placeholder]").fill("crystal ferns");
    await page.locator("[data-look] button", { hasText: /^Lock$/i }).click();
    await page.waitForTimeout(80);
    const lookBLocked = await engineState(page);
    if (lookBLocked.lookLock !== "1" || lookBLocked.forgePack !== "live") {
      throw new Error(`${vp.name}: Door B LOCK missed live bot pack ${JSON.stringify(lookBLocked)}`);
    }
    let picker = false;
    page.once("filechooser", () => {
      picker = true;
    });
    await page.locator("[data-forge=bot]").click();
    await page.waitForSelector("[data-forge-pct]", { timeout: 12000 });
    const botCooking = await engineState(page);
    if (picker) {
      throw new Error(`${vp.name}: Grok Bot Forge opened a file picker`);
    }
    if (!botCooking.forgePct && botCooking.phase === "look") {
      throw new Error(`${vp.name}: Grok Bot Forge tap did not start cook UI ${JSON.stringify(botCooking)}`);
    }
    if (botCooking.forgePack !== "live" || !/crystal ferns/i.test(botCooking.forgeWish || botCooking.frost || "")) {
      throw new Error(`${vp.name}: locked Grok Bot Forge dropped hall style ${JSON.stringify(botCooking)}`);
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${vp.name}-create-bot-forge-pct.png`, fullPage: false });
    return { ok: true, flow: "look", viewport: vp.name, lookA, cooking, lookB, botCooking };
  } finally {
    await page.close();
  }
}

async function runStockTaps(browser, vp) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const notes = [];
  try {
    await page.goto(`${BASE}/rune?first=m1&drive=engine&rooms=1&hall=1&stills=0`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForSelector("[data-rune=engine][data-phase=play]", { timeout: 15000 });
    await page.waitForTimeout(700);
    const entered = await engineState(page);
    if (entered.phase !== "play" || entered.camera !== "lock") {
      throw new Error(`${vp.name}: stock enter failed ${JSON.stringify(entered)}`);
    }
    if (entered.look || entered.films) {
      throw new Error(`${vp.name}: stock path opened look/Films ${JSON.stringify(entered)}`);
    }
    await page.screenshot({ path: `${OUT}/${vp.name}-hall-idle.png`, fullPage: false });

    const tapA = await tapPicture(page, 0.26, 0.42);
    notes.push({ door: "A", tap: tapA });
    const walkA = await waitBeat(page, "playvid", 4000);
    if (walkA.beat !== "playvid") {
      const btn = page.locator("[data-door=m1]");
      if (await btn.count()) await btn.first().click({ force: true });
      const again = await waitBeat(page, "playvid", 4000);
      if (again.beat !== "playvid") {
        throw new Error(`${vp.name}: Door A tap did not reach playvid ${JSON.stringify({ tapA, walkA, again })}`);
      }
    }
    await page.waitForTimeout(700);
    const midA = await page.evaluate(() => {
      const cv = document.querySelector("[data-rune=engine] canvas");
      const bolt = cv?.getAttribute("data-bolt") || "";
      const [x, y] = bolt.split(",").map(Number);
      return { bolt, x, y, stockWalk: document.querySelector("[data-rune=engine]")?.getAttribute("data-stock-walk") };
    });
    notes.push({ midA });
    if (!(midA.x > 0.2 && midA.x < 0.48 && midA.y > 0.52 && midA.y < 0.76)) {
      throw new Error(`${vp.name}: Door A walk did not move Bolt on the floor ${JSON.stringify(midA)}`);
    }
    await page.screenshot({ path: `${OUT}/${vp.name}-hall-walk-a.png`, fullPage: false });
    const afterA = await waitBeat(page, "idle", 8000);
    if (afterA.here !== "m1") {
      throw new Error(`${vp.name}: Door A walk did not land at m1 ${JSON.stringify(afterA)}`);
    }

    await page.waitForTimeout(200);
    const tapB = await tapPicture(page, 0.72, 0.4);
    notes.push({ door: "B", tap: tapB });
    const walkB = await waitBeat(page, "playvid", 4000);
    if (walkB.beat !== "playvid") {
      const btn = page.locator("[data-door=m2]");
      if (await btn.count()) await btn.first().click({ force: true });
      const again = await waitBeat(page, "playvid", 4000);
      if (again.beat !== "playvid") {
        throw new Error(`${vp.name}: Door B tap did not reach playvid ${JSON.stringify({ tapB, walkB, again })}`);
      }
    }
    await page.waitForTimeout(700);
    const midB = await page.evaluate(() => {
      const root = document.querySelector("[data-rune=engine]");
      const cv = root?.querySelector("canvas");
      const bolt = cv?.getAttribute("data-bolt") || "";
      const [x, y] = bolt.split(",").map(Number);
      return {
        bolt,
        x,
        y,
        face: root?.getAttribute("data-face") || cv?.getAttribute("data-face") || "",
      };
    });
    notes.push({ midB });
    if (!(midB.x > 0.42 && midB.x < 0.82 && midB.y > 0.52 && midB.y < 0.7)) {
      throw new Error(`${vp.name}: Door B walk did not move Bolt toward gold ${JSON.stringify(midB)}`);
    }
    if (midB.face && midB.face !== "right") {
      throw new Error(`${vp.name}: Door B moonwalk — face ${midB.face} while translating right ${JSON.stringify(midB)}`);
    }
    await page.screenshot({ path: `${OUT}/${vp.name}-hall-walk-b.png`, fullPage: false });
    const afterB = await waitBeat(page, "idle", 8000);
    if (afterB.here !== "m2") {
      throw new Error(`${vp.name}: Door B walk did not land at m2 ${JSON.stringify(afterB)}`);
    }
    const final = await engineState(page);
    if (final.camera !== "lock" || final.phase !== "play") {
      throw new Error(`${vp.name}: camera/phase regression ${JSON.stringify(final)}`);
    }
    return { ok: true, flow: "stock", viewport: vp.name, entered, afterA, afterB, final, notes };
  } finally {
    await page.close();
  }
}

async function seedForest(page) {
  await page.addInitScript(() => {
    const art = {
      id: "art-forest-smoke",
      name: "Forest",
      still: "/films/cook-forest.jpg",
      playlist: ["/films/forge-forest.mp4", "/films/forge-forest-moss.mp4"],
      prompt: "forest",
      hungAt: Date.now(),
      grade: null,
    };
    try {
      localStorage.setItem("bolt-artifacts-v1", JSON.stringify([art]));
      sessionStorage.setItem("bolt-artifacts-mem-v1", JSON.stringify([art]));
    } catch {
      /* */
    }
  });
}

async function runBiomeVaultBot(browser, vp) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  try {
    await seedForest(page);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const home = await page.evaluate(() => ({
      vault: Boolean(document.querySelector("[data-vault], [data-vault-bot]")),
      artifacts: Boolean(document.querySelector("[data-go=artifacts]")),
    }));
    if (!home.vault || !home.artifacts) {
      throw new Error(`${vp.name}: home missing vault/artifacts reach ${JSON.stringify(home)}`);
    }

    await page.goto(`${BASE}/artifacts`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector("[data-biome-bot=bot]", { timeout: 15000 });
    const biomeLabel = await page.locator("[data-biome-bot=bot]").first().textContent();
    if (!/Grok Bot Biome/i.test(biomeLabel || "")) {
      throw new Error(`${vp.name}: biome bot label missing ${JSON.stringify(biomeLabel)}`);
    }
    let picker = false;
    page.once("filechooser", () => {
      picker = true;
    });
    await page.locator("[data-biome-bot=bot]").first().click();
    await page.waitForTimeout(600);
    if (picker) throw new Error(`${vp.name}: Grok Bot Biome opened a file picker`);
    await page.screenshot({ path: `${OUT}/${vp.name}-bot-biome.png`, fullPage: false });

    await page.goto(`${BASE}/vault`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector("[data-hang-bot=bot]", { timeout: 15000 });
    await page.waitForSelector("[data-hang=A]", { timeout: 15000 });
    await page.waitForSelector("[data-hang=B]", { timeout: 8000 });
    picker = false;
    page.once("filechooser", () => {
      picker = true;
    });
    await page.locator("[data-hang-bot=bot]").first().click();
    await page.waitForTimeout(400);
    if (picker) throw new Error(`${vp.name}: Grok Bot Hang opened a file picker`);
    const hungBot = await page.evaluate(() => /room \d+ · door/i.test(document.body.innerText));
    if (!hungBot) throw new Error(`${vp.name}: Grok Bot Hang did not bind a door`);

    await page.locator("button", { hasText: "Unhang" }).first().click().catch(() => {});
    await page.waitForTimeout(200);
    if (await page.locator("[data-hang=A]").count()) {
      await page.locator("[data-hang=A]").first().click();
    } else {
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector("[data-hang=A]", { timeout: 8000 });
      await page.locator("[data-hang=A]").first().click();
    }
    await page.waitForTimeout(400);
    const hungA = await page.evaluate(() => /door A/i.test(document.body.innerText));
    if (!hungA) throw new Error(`${vp.name}: human Hang A did not bind door A`);
    await page.screenshot({ path: `${OUT}/${vp.name}-vault-hang.png`, fullPage: false });

    const enterPage = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    try {
      await seedForest(enterPage);
      await enterPage.addInitScript(() => {
        try {
          const raw = localStorage.getItem("bolt-artifacts-v1");
          const list = raw ? JSON.parse(raw) : [];
          const head = list[0];
          if (head) {
            head.room = {
              door: "A",
              still: "/films/cook-forest.jpg",
              trans: "/ui/citadel.mp4?v=aaa",
              hall: 1,
              biome: "forest",
            };
            localStorage.setItem("bolt-artifacts-v1", JSON.stringify([head]));
            sessionStorage.setItem("bolt-artifacts-mem-v1", JSON.stringify([head]));
          }
        } catch {
          /* */
        }
      });
      await enterPage.goto(`${BASE}/rune?first=m1&drive=engine&rooms=1&hall=1&stills=0`, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      await enterPage.waitForSelector("[data-rune=engine][data-phase=play]", { timeout: 15000 });
      await enterPage.waitForTimeout(700);
      const rift = await enterPage.evaluate(() => document.querySelector("[data-rune=engine]")?.getAttribute("data-rift"));
      if (rift !== "1") {
        throw new Error(`${vp.name}: living hall did not hydrate hung biome ${rift}`);
      }
      const btn = enterPage.locator("[data-door=m1]");
      if (await btn.count()) {
        await btn.first().click({ force: true });
        await waitBeat(enterPage, "idle", 8000);
        await btn.first().click({ force: true });
      }
      await enterPage.waitForTimeout(800);
      const biomePlay = await enterPage.evaluate(() => Boolean(document.querySelector("[data-biome-play]")));
      if (!biomePlay) {
        throw new Error(`${vp.name}: door A enter did not open biome play`);
      }
      await enterPage.screenshot({ path: `${OUT}/${vp.name}-biome-enter.png`, fullPage: false });
    } finally {
      await enterPage.close();
    }

    return { ok: true, flow: "biome-vault-bot", viewport: vp.name, home, hungBot, hungA };
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const results = [];
  for (const vp of VIEWPORTS) {
    results.push(await runCreateLook(browser, vp));
    results.push(await runStockTaps(browser, vp));
    results.push(await runBiomeVaultBot(browser, vp));
  }
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
