import { b, type Beat } from "./films";

export type EchoSeed = {
  frame: string;
  path: "main" | "river" | "thicket";
  dusk: boolean;
  hunter: number;
  crashed: boolean;
  grade: "S" | "A" | "B" | "C" | "D" | "F";
};

export const ECHO_BEATS: Beat[] = [
  b("e1", 2.2, "tap", "c", "TAP", { spot: { x: 0.5, y: 0.55 } }),
  b("e2", 5.3, "hold", "c", "HOLD", { holdMs: 420, spot: { x: 0.5, y: 0.56 } }),
  b("e3", 8.1, "tap", "c", "HOWL", { spot: { x: 0.5, y: 0.5 } }),
];

export const ECHO_CHART = 10;

export function echoPrompt(seed: EchoSeed): string {
  const heroic = !seed.crashed && (seed.grade === "S" || seed.grade === "A");
  const place =
    seed.path === "river"
      ? "along a rushing forest river, wet stone, splashes"
      : seed.path === "thicket"
        ? "bursting through a dense fern thicket"
        : "on a mossy forest path";
  const light = seed.dusk ? "dusk gold-blue light" : "clear daylight";
  const foe =
    seed.hunter > 0.55
      ? "A dark rival wolf-hunter is close behind in the trees, both bodies in frame."
      : seed.hunter > 0.2
        ? "A dark hunter silhouette lingers far back in the trees."
        : "The hunter is gone.";
  const act = heroic
    ? "He sprints true, then plants and howls — heroic, gold in the trees."
    : "He staggers, hurt, torn jacket, almost falling.";
  return [
    "Portrait 9:16 WIDE full-body cinematic. Same white-and-cream wolf hero in a dark hooded jacket.",
    "Camera pulled back 6 meters. Head to boots visible. Do NOT zoom into the face.",
    `He is running ${place}, ${light}.`,
    foe,
    act,
    "Photoreal, living forest, no text, no UI, no logos.",
  ].join(" ");
}
