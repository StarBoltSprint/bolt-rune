/**
 * Imagine request bodies for Forge stills / films.
 * Keep payloads here so unit tests can lock the identity contract
 * without spinning up server functions.
 */

export const IMAGINE_IMAGE = "grok-imagine-image-2.0";
export const IMAGINE_VIDEO = "grok-imagine-video-1.5";

export function runeStillJobs(input: {
  prompt: string;
  pics: { url: string }[];
  edit?: boolean;
  editOnly?: boolean;
  ratio: string;
  resolution: string;
  store: { filename: string; public_url: true };
}): { path: string; body: Record<string, unknown> }[] {
  const { prompt, pics, edit, editOnly, ratio, resolution, store } = input;
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
  const { prompt, imageUrl, duration, resolution, store } = input;
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
