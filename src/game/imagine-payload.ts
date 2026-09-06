/**
 * Imagine request bodies for Forge stills / films.
 * Keep payloads here so unit tests can lock the identity contract
 * without spinning up server functions.
 */

import { SHOT_REJECT } from "./rune.ts";

export const IMAGINE_IMAGE = "grok-imagine-image-2.0";
export const IMAGINE_VIDEO = "grok-imagine-video-1.5";

/** cook.ts slices to this. Hall-cook REJECT must stay in the kept prefix. */
export const IMAGINE_PROMPT_MAX = 2200;

/**
 * Hall cooks: put SHOT_REJECT first so the 2200 slice cannot drop it.
 * Non-hall prompts (door cutouts, sprint vault) are sliced as-is.
 */
export function clipImaginePrompt(raw: string, max = IMAGINE_PROMPT_MAX) {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const hall = /profile-hero|WHOLE hall|locked full-hall|REJECT LIST/i.test(text);
  if (!hall) return text.slice(0, max);
  const rest = text.split(SHOT_REJECT).join(" ").replace(/\s+/g, " ").trim();
  return `${SHOT_REJECT} ${rest}`.slice(0, max);
}

export function runeStillJobs(input: {
  prompt: string;
  pics: { url: string }[];
  edit?: boolean;
  editOnly?: boolean;
  ratio: string;
  resolution: string;
  store: { filename: string; public_url: true };
}): { path: string; body: Record<string, unknown> }[] {
  const { pics, edit, editOnly, ratio, resolution, store } = input;
  const prompt = clipImaginePrompt(input.prompt);
  const model = IMAGINE_IMAGE;
  const jobs: { path: string; body: Record<string, unknown> }[] = [];
  if (edit && pics.length > 1) {
    // Multi-ref edit: hall + identity. `images` is mutually exclusive with `image`.
    jobs.push({
      path: "/images/edits",
      body: { model, prompt, aspect_ratio: ratio, resolution, images: pics, storage_options: store },
    });
    if (!editOnly) {
      jobs.push({
        path: "/images/generations",
        body: { model, prompt, n: 1, aspect_ratio: ratio, resolution, images: pics, storage_options: store },
      });
    }
  } else if (edit && pics[0]) {
    jobs.push({
      path: "/images/edits",
      body: { model, prompt, aspect_ratio: ratio, resolution, image: pics[0], storage_options: store },
    });
    if (!editOnly) {
      jobs.push({
        path: "/images/generations",
        body: { model, prompt, n: 1, aspect_ratio: ratio, resolution, images: [pics[0]], storage_options: store },
      });
    }
  } else if (pics.length) {
    jobs.push({
      path: "/images/generations",
      body: { model, prompt, n: 1, aspect_ratio: ratio, resolution, images: pics, storage_options: store },
    });
  } else {
    jobs.push({
      path: "/images/generations",
      body: { model, prompt, n: 1, aspect_ratio: ratio, resolution, storage_options: store },
    });
  }
  return jobs;
}

/**
 * Image-to-video only. `image` + `reference_images` is a 400 on grok-imagine-video-1.5,
 * so identity must already live in the start still — never attach a cream/profile @ref.
 */
export function runeFilmVariants(input: {
  prompt: string;
  imageUrl: string;
  duration: number;
  resolution: string;
  store: { filename: string; public_url: true };
}): Record<string, unknown>[] {
  const { imageUrl, duration, resolution, store } = input;
  const prompt = clipImaginePrompt(input.prompt);
  function plate(res?: string) {
    const body: Record<string, unknown> = {
      model: IMAGINE_VIDEO,
      prompt,
      image: { url: imageUrl },
      duration,
      aspect_ratio: "9:16",
      storage_options: store,
    };
    if (res) body.resolution = res;
    return body;
  }
  const variants: Record<string, unknown>[] = [plate(resolution)];
  if (resolution === "1080p") variants.push(plate("720p"));
  variants.push(plate(undefined));
  return variants;
}
