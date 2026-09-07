import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLIP_TOO_LARGE_FROST,
  IMAGINE_VIDEO_MAX_BYTES,
  clipRetryFrost,
  cookClipTooLarge,
  cookFrameHint,
  cookFrameLine,
  imagineVideoOverCap,
  nextSmallerClipSpec,
  readFrame,
  readImaginePoll,
  readImagineStatus,
  readImagineWhy,
  readPct,
} from "./cook-progress.ts";

describe("Imagine cook progress — never FRAME [object Object]", () => {
  it("unwraps a nested frame object instead of String(object)", () => {
    const body = { status: "pending", frame: { current: 12, total: 28 } };
    assert.equal(readFrame(body), "12 / 28");
    assert.equal(readPct(body), 43);
    assert.doesNotMatch(readFrame(body) ?? "", /\[object\s+object\]/i);
    assert.equal(cookFrameLine(readFrame(body), "Imagine is forging"), "frame 12 / 28");
  });

  it("reads frame counts from nested progress / Imagine event bags", () => {
    const body = {
      status: "pending",
      progress: { percent: 43, frame: { current: 86, total: 200 } },
    };
    assert.equal(readPct(body), 43);
    assert.equal(readFrame(body), "86 / 200");
    assert.equal(cookFrameHint({ current: 86, total: 200 }), "86 / 200");
  });

  it("keeps scalar frame strings and skips junk object-strings", () => {
    assert.equal(readFrame({ current_frame: 9, total_frames: 20 }), "9 / 20");
    assert.equal(readFrame({ frame: 18 }), "18");
    assert.equal(cookFrameHint("18 / 40"), "18 / 40");
    assert.equal(cookFrameHint("[object Object]"), "");
    assert.equal(cookFrameHint("[OBJECT OBJECT]"), "");
    assert.equal(cookFrameLine("[object Object]", "Imagine continues the film"), "Imagine continues the film");
    assert.equal(cookFrameLine({ url: "https://example/preview.jpg" }, "Imagine is forging"), "Imagine is forging");
  });

  it("does not hang a continue cook when status is a nested object", () => {
    const pending = readImaginePoll({
      status: { state: "processing", progress: 0.43 },
      frame: { current: 12, total: 28 },
    });
    assert.equal(pending.status, "pending");
    assert.equal(pending.pct, 43);
    assert.equal(pending.frame, "12 / 28");
    assert.doesNotMatch(pending.frame ?? "", /object Object/i);

    const done = readImaginePoll({
      status: { state: "succeeded" },
      url: "https://cdn.example/clip.mp4",
    });
    assert.equal(done.status, "done");
    assert.equal(readImagineStatus({ status: { state: "completed" } }), "done");
    assert.equal(readImagineStatus({ state: "failed" }), "failed");
  });

  it("failed error objects become a human why, not [object Object]", () => {
    assert.equal(readImagineWhy({ error: { message: "safety filter" } }), "safety filter");
    const failed = readImaginePoll({ status: "failed", error: { reason: "capacity" } });
    assert.equal(failed.status, "failed");
    assert.equal(failed.frame, "capacity");
    assert.doesNotMatch(failed.frame ?? "", /\[object/i);
  });

  it("Imagine 50 MiB wall becomes a human frost, not FRAME VIDEO EXCEEDS", () => {
    const raw = "VIDEO EXCEEDS MAXIMUM SIZE OF 52428800 BYTES. REJECTED";
    assert.equal(IMAGINE_VIDEO_MAX_BYTES, 50 * 1024 * 1024);
    assert.equal(imagineVideoOverCap(IMAGINE_VIDEO_MAX_BYTES), false);
    assert.equal(imagineVideoOverCap(IMAGINE_VIDEO_MAX_BYTES + 1), true);
    assert.equal(cookClipTooLarge(raw), true);
    assert.equal(cookClipTooLarge({ error: { message: raw } }), true);
    assert.equal(cookFrameHint(raw), "");
    assert.equal(cookFrameLine(raw, CLIP_TOO_LARGE_FROST), CLIP_TOO_LARGE_FROST);
    assert.doesNotMatch(cookFrameLine(raw, "Imagine is forging"), /52428800|EXCEEDS MAXIMUM/i);

    const failed = readImaginePoll({ status: "failed", error: raw });
    assert.equal(failed.status, "failed");
    assert.equal(failed.frame, CLIP_TOO_LARGE_FROST);
    assert.equal(cookFrameHint(failed.frame), "");
    assert.equal(cookFrameLine(failed.frame, CLIP_TOO_LARGE_FROST), CLIP_TOO_LARGE_FROST);

    const pending = readImaginePoll({
      status: "processing",
      progress: 40,
      message: "FRAME VIDEO EXCEEDS MAXIMUM SIZE OF 52428800 BYTES",
    });
    assert.equal(pending.status, "failed");
    assert.equal(pending.frame, CLIP_TOO_LARGE_FROST);
    assert.doesNotMatch(pending.frame ?? "", /52428800|object Object/i);

    assert.deepEqual(nextSmallerClipSpec({ secs: 15, res: "1080" }), { secs: 15, res: "720" });
    assert.deepEqual(nextSmallerClipSpec({ secs: 15, res: "720" }), { secs: 10, res: "720" });
    assert.deepEqual(nextSmallerClipSpec({ secs: 10, res: "1080" }), { secs: 10, res: "720" });
    assert.deepEqual(nextSmallerClipSpec({ secs: 6, res: "720" }), null);
    assert.equal(clipRetryFrost({ secs: 10, res: "720" }), "clip too large — retrying 10s 720");
  });

  it("vault Continue and cook overlays use cookFrameLine, not raw FRAME ${object}", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const vault = readFileSync(join(here, "../components/vault-hall.tsx"), "utf8");
    const studio = readFileSync(join(here, "../components/cook-studio.tsx"), "utf8");
    const cook = readFileSync(join(here, "cook.ts"), "utf8");
    assert.match(vault, /cookFrameHint/);
    assert.match(vault, /cookFrameLine/);
    assert.match(vault, /CLIP_TOO_LARGE_FROST/);
    assert.match(vault, /nextSmallerClipSpec/);
    assert.match(vault, /clipRetryFrost/);
    assert.doesNotMatch(vault, /pace\.n >= 100 \|\| pace\.n <= 0/);
    assert.doesNotMatch(vault, /frame \$\{polled\.frame\}/);
    assert.doesNotMatch(vault, /frame \$\{frameHint\}/);
    assert.match(studio, /cookFrameLine/);
    assert.match(studio, /CLIP_TOO_LARGE_FROST/);
    assert.match(studio, /nextSmallerClipSpec/);
    assert.doesNotMatch(studio, /frame \$\{polled\.frame\}/);
    assert.match(cook, /readImaginePoll/);
    assert.match(cook, /clip-too-large/);
    assert.match(cook, /imagineVideoOverCap/);
  });
});
