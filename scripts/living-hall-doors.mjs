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
    if (!el) return { present: false };
    return {
      present: true,
      phase: el.getAttribute("data-phase"),
      beat: el.getAttribute("data-beat"),
      camera: el.getAttribute("data-camera"),
      here: el.getAttribute("data-here"),
      living: el.getAttribute("data-living"),
      look: Boolean(document.querySelector("[data-look]")),
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

async function runViewport(browser, vp) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const notes = [];
  try {
    await page.goto(`${BASE}/rune`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(400);
    const fresh = page.locator("a", { hasText: "New citadel" });
    if (await fresh.count()) await fresh.first().click();
    else await page.goto(`${BASE}/rune?tour=1&drive=engine&rooms=1&hall=1`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    const doorA = page.locator("[aria-label=A]").first();
    await doorA.click();
    await page.waitForTimeout(200);
    const next = page.locator("a", { hasText: "Next" }).first();
    await next.click();
    await page.waitForSelector("[data-rune=engine][data-phase=play]", { timeout: 15000 });
    await page.waitForTimeout(700);
    const entered = await engineState(page);
    if (entered.phase !== "play" || entered.camera !== "lock") {
      throw new Error(`${vp.name}: enter failed ${JSON.stringify(entered)}`);
    }
    if (entered.look || entered.films) {
      throw new Error(`${vp.name}: Films checklist regression ${JSON.stringify(entered)}`);
    }
    await page.screenshot({ path: `${OUT}/${vp.name}-hall-idle.png`, fullPage: false });

    const tapA = await tapPicture(page, 0.26, 0.4);
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
    await page.screenshot({ path: `${OUT}/${vp.name}-hall-walk-a.png`, fullPage: false });
    const afterA = await waitBeat(page, "idle", 16000);
    notes.push({ afterA });

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
    await page.screenshot({ path: `${OUT}/${vp.name}-hall-walk-b.png`, fullPage: false });
    const afterB = await waitBeat(page, "idle", 16000);
    const final = await engineState(page);
    if (final.camera !== "lock" || final.phase !== "play") {
      throw new Error(`${vp.name}: camera/phase regression ${JSON.stringify(final)}`);
    }
    if (final.look || final.films) {
      throw new Error(`${vp.name}: Films checklist appeared after walks`);
    }
    return { ok: true, viewport: vp.name, entered, afterA, afterB, final, notes };
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
    results.push(await runViewport(browser, vp));
  }
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
