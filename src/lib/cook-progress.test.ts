import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cookFrameHint,
  cookFrameLine,
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

  it("vault Continue and cook overlays use cookFrameLine, not raw FRAME ${object}", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const vault = readFileSync(join(here, "../components/vault-hall.tsx"), "utf8");
    const studio = readFileSync(join(here, "../components/cook-studio.tsx"), "utf8");
    const cook = readFileSync(join(here, "cook.ts"), "utf8");
    assert.match(vault, /cookFrameHint/);
    assert.match(vault, /cookFrameLine/);
    assert.doesNotMatch(vault, /frame \$\{polled\.frame\}/);
    assert.doesNotMatch(vault, /frame \$\{frameHint\}/);
    assert.match(studio, /cookFrameLine/);
    assert.doesNotMatch(studio, /frame \$\{polled\.frame\}/);
    assert.match(cook, /readImaginePoll/);
  });
});
