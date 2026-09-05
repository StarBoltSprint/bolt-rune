import type { FilmId, Grade } from "./films";

const KEY = "bolt-engine-v1";
const LEGACY = "cine-circuit-v1";

export type ReelSave = {
  best: number;
  grade: Grade | null;
  shards: number;
  combo: number;
};

export type Save = {
  version: 1;
  original: boolean;
  shards: number;
  reels: Record<FilmId, ReelSave>;
};

const emptyReel = (): ReelSave => ({ best: 0, grade: null, shards: 0, combo: 0 });

export function blankSave(): Save {
  return {
    version: 1,
    original: false,
    shards: 0,
    reels: {
      den: emptyReel(),
      kiln: emptyReel(),
      dive: emptyReel(),
      hall: emptyReel(),
      sprint: emptyReel(),
      lane: emptyReel(),
      asteroid: emptyReel(),
    },
  };
}

export function readSave(): Save {
  if (typeof window === "undefined") return blankSave();
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY);
    if (!raw) return blankSave();
    const parsed = JSON.parse(raw) as Save;
    if (parsed?.version !== 1) return blankSave();
    return { ...blankSave(), ...parsed, reels: { ...blankSave().reels, ...parsed.reels } };
  } catch {
    return blankSave();
  }
}

export function writeSave(save: Save) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(save));
}

export function recordRun(id: FilmId, score: number, grade: Grade, shards: number, combo: number) {
  const save = readSave();
  const prev = save.reels[id];
  const better = score >= prev.best;
  save.reels[id] = {
    best: Math.max(prev.best, score),
    grade: better ? grade : prev.grade ?? grade,
    shards: prev.shards + shards,
    combo: Math.max(prev.combo, combo),
  };
  save.shards += shards;
  writeSave(save);
  return save;
}

export function setOriginal(original: boolean) {
  const save = readSave();
  save.original = original;
  writeSave(save);
  return save;
}
