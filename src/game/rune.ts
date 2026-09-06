import { genePrompt } from "@/game/rune-brain";

export type RuneNode = {
  id: string;
  name: string;
  x: number;
  y: number;
};

export type RuneClip =
  | { kind: "idle"; id: string; node: string; camera: "lock"; morph: false }
  | {
      kind: "walk";
      id: string;
      from: string;
      to: string;
      startPose: string;
      endPose: string;
      reverseOf?: string;
      camera: "lock";
      morph: false;
    };

export type WalkSecs = 6 | 10 | 15;

export type RuneGraph = {
  plate: string;
  nodes: RuneNode[];
  idles: RuneClip[];
  walks: RuneClip[];
  laws: string[];
  walkSecs: WalkSecs;
};

export type RuneFacing = "down" | "left" | "right" | "up";

export const SPAWN: RuneNode = { id: "spawn", name: "spawn", x: 0.5, y: 0.78 };

export const LAWS = [
  "same plate on every clip",
  "Bolt, objects and room never morph",
  "each walk starts on the last stop pose",
  "camera locked",
  "at A he looks at B, at B he looks at A",
  "breath is feet glued — never a walk back to spawn",
  "always two doors, never one gate",
  "hall frozen — only the dog moves",
  "citadel lives in Keep — relaunch must not empty the hall",
] as const;

export function withSpawn(pins: RuneNode[]): RuneNode[] {
  return [{ ...SPAWN }, ...pins.map((n) => ({ ...n }))];
}

export function compileCitadel(plate: string, pins: RuneNode[], walkSecs: WalkSecs = 10): RuneGraph {
  const nodes = withSpawn(pins.filter((n) => n.id !== "spawn"));
  const idles: RuneClip[] = nodes.map((n) => ({
    kind: "idle",
    id: `idle-${n.id}`,
    node: n.id,
    camera: "lock",
    morph: false,
  }));
  const walks: RuneClip[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const fwd = `walk-${a.id}-${b.id}`;
      walks.push({
        kind: "walk",
        id: fwd,
        from: a.id,
        to: b.id,
        startPose: a.id,
        endPose: b.id,
        camera: "lock",
        morph: false,
      });
      walks.push({
        kind: "walk",
        id: `walk-${b.id}-${a.id}`,
        from: b.id,
        to: a.id,
        startPose: b.id,
        endPose: a.id,
        reverseOf: fwd,
        camera: "lock",
        morph: false,
      });
    }
  }
  return { plate, nodes, idles, walks, laws: [...LAWS], walkSecs };
}

export function clipCount(n: number, cap = 0) {
  const nodes = n + 1;
  const ids = Array.from({ length: nodes }, (_, i) => (i === 0 ? "spawn" : `m${i}`));
  const walks = planWalks(ids, cap).length;
  const idles = nodes;
  return {
    nodes,
    idles,
    walks,
    generate: walks,
    reverse: 0,
    total: walks,
    idleSecs: 6 as const,
  };
}

export function forgeQueue(graph: RuneGraph): RuneClip[] {
  const idleOf = (id: string) => graph.idles.find((c) => c.kind === "idle" && c.node === id);
  const walkOf = (a: string, b: string) =>
    graph.walks.find((c) => c.kind === "walk" && c.from === a && c.to === b);
  const out: RuneClip[] = [];
  const used = new Set<string>();
  const spawn = graph.nodes[0]?.id ?? "spawn";
  const firstIdle = idleOf(spawn);
  if (firstIdle) {
    out.push(firstIdle);
    used.add(firstIdle.id);
  }
  let prev = spawn;
  for (const n of graph.nodes) {
    if (n.id === spawn) continue;
    const w = walkOf(prev, n.id);
    if (w) {
      out.push(w);
      used.add(w.id);
    }
    const idle = idleOf(n.id);
    if (idle) {
      out.push(idle);
      used.add(idle.id);
    }
    prev = n.id;
  }
  for (const w of graph.walks) {
    if (w.kind === "walk" && !w.reverseOf && !used.has(w.id)) {
      out.push(w);
      used.add(w.id);
    }
  }
  for (const w of graph.walks) {
    if (!used.has(w.id)) out.push(w);
  }
  return out;
}

export function filmQueue(graph: RuneGraph): RuneClip[] {
  return forgeQueue(graph).filter((c): c is Extract<RuneClip, { kind: "walk" }> => c.kind === "walk");
}

export function walkTour(ids: string[]): { from: string; to: string; via: string }[] {
  const nodes = ids.length ? ids : ["spawn"];
  const spawn = nodes[0]!;
  const out: { from: string; to: string; via: string }[] = [];
  const have = new Set<string>([`${spawn}←start`]);
  const done = new Set<string>();
  let added = true;
  while (added) {
    added = false;
    for (const from of nodes) {
      const vias = from === spawn ? ["start", ...nodes.filter((v) => v !== from)] : nodes.filter((v) => v !== from);
      for (const via of vias) {
        if (!have.has(`${from}←${via}`)) continue;
        for (const to of nodes) {
          if (to === from) continue;
          const k = `${from}←${via}→${to}`;
          if (done.has(k)) continue;
          done.add(k);
          out.push({ from, to, via });
          have.add(`${to}←${from}`);
          added = true;
        }
      }
    }
  }
  return out;
}

/** Spawn is start only. Then door to door. Never walk back to the camera. */
export function walkLane(ids: string[]): { from: string; to: string; via: string }[] {
  const spawn = ids[0] ?? "spawn";
  const doors = ids.filter((id) => id !== spawn);
  const out: { from: string; to: string; via: string }[] = [];
  const seen = new Set<string>();
  function add(from: string, to: string, via: string) {
    const k = `${from}→${to}`;
    if (from === to || from === spawn && to === spawn || seen.has(k)) return;
    if (to === spawn) return;
    seen.add(k);
    out.push({ from, to, via });
  }
  if (doors[0]) add(spawn, doors[0], "start");
  if (doors[0] && doors[1]) {
    add(doors[0], doors[1], spawn);
    add(doors[1], doors[0], doors[0]);
  }
  for (const d of doors) add(spawn, d, "start");
  for (const a of doors) {
    for (const b of doors) add(a, b, spawn);
  }
  return out;
}

export function planWalks(ids: string[], cap = 0) {
  const all = walkLane(ids);
  if (cap > 0) return all.slice(0, cap);
  return all;
}

/** First door, then the other, then back. 3 films. Spawn is start only. */
export function pathWalks(first: "m1" | "m2"): { from: string; to: string; via: string }[] {
  const a = first;
  const b = first === "m1" ? "m2" : "m1";
  return [
    { from: "spawn", to: a, via: "start" },
    { from: a, to: b, via: "spawn" },
    { from: b, to: a, via: a },
  ];
}

export function otherDoor(first: "m1" | "m2"): "m1" | "m2" {
  return first === "m1" ? "m2" : "m1";
}

export const TOUR_PLATE = "/films/citadel-tour.jpg?v=sharp";

export function pct(n: number) {
  return `${Math.max(0, Math.min(100, Math.round(n * 100)))}%`;
}

export function regionName(x: number, y: number) {
  const side = x < 0.34 ? "LEFT" : x > 0.66 ? "RIGHT" : "CENTER";
  const band = y < 0.38 ? "UPPER" : y > 0.72 ? "LOWER" : "MID";
  return `${band} ${side}`;
}

export const REF_KIT = [
  {
    name: "teal door",
    x: 0.22,
    y: 0.48,
    prompt:
      "Isolated TEAL glowing sci-fi spacetime-rift portal on a PURE BLACK background. Tall vertical hard-light metal frame with cyan neon, inner swirling teal nebula. Only the portal, cut out, filling most of the frame. No hall, no floor, no gothic stone, no wolf. Black void. Photoreal. No text, no UI.",
  },
  {
    name: "gold door",
    x: 0.78,
    y: 0.48,
    prompt:
      "Isolated GOLD glowing sci-fi spacetime-rift portal on a PURE BLACK background. Tall vertical hard-light metal frame with amber neon, inner swirling gold nebula. Only the portal, cut out, filling most of the frame. No hall, no floor, no gothic stone, no wolf. Black void. Photoreal. No text, no UI.",
  },
  {
    name: "stone door",
    x: 0.22,
    y: 0.72,
    prompt:
      "Isolated dark METAL sci-fi portal frame on a PURE BLACK background. Only the doorway, cut out. No hall, no wolf, no gothic stone. Black void. Photoreal. No text.",
  },
  {
    name: "ice door",
    x: 0.78,
    y: 0.72,
    prompt:
      "Isolated ICE-blue glowing sci-fi spacetime-rift portal on a PURE BLACK background. Hard-light metal frame, inner ice nebula. Only the portal, cut out. No hall, no wolf, no gothic stone. Black void. Photoreal. No text.",
  },
] as const;

export function plannedObjects(n: number) {
  const count = Math.max(1, Math.min(REF_KIT.length, n));
  return REF_KIT.slice(0, count).map((o, i) => ({
    id: `m${i + 1}`,
    name: o.name,
    prompt: o.prompt,
    x: o.x,
    y: o.y,
  }));
}

export function roomFromPlanPrompt(objects: { name: string }[], hasBolt = true) {
  const lines = objects.map((o, i) => {
    const n = i + 1;
    if (o.name.includes("teal")) {
      return `@image${n} is a TEAL door cutout on black. Composite THAT exact door onto the LEFT wall. Ignore the black. Do not redesign the door.`;
    }
    if (o.name.includes("gold")) {
      return `@image${n} is a GOLD door cutout on black. Composite THAT exact door onto the RIGHT wall. Ignore the black. Do not redesign the door.`;
    }
    return `@image${n} is the ${o.name} cutout on black. Composite THAT exact object into the hall. Ignore the black.`;
  });
  const wolf = hasBolt
    ? `@image${objects.length + 1} is the wolf cutout on black. Place THAT exact wolf in the center of the floor, seen from behind. Ignore the black. Do not redraw him.`
    : "";
  return [
    "Composite ONE photoreal 9:16 futuristic sci-fi citadel hall in deep space. Dark metal, black glass floor, nebula viewport. The references are isolated cutouts on black — paste them into this space chamber. Do not invent new portals or a new wolf. No gothic cathedral.",
    ...lines,
    wolf,
    "Camera locked. No morph. No extra wolves. No text. No UI.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function objectRefName(node: RuneNode) {
  if (node.x < 0.34) return "teal door";
  if (node.x > 0.66) return "gold door";
  if (Math.abs(node.x - 0.5) < 0.22 && node.y < 0.78) return "relic";
  return regionName(node.x, node.y).toLowerCase();
}

export function objectRefPrompt(node: RuneNode) {
  if (node.x < 0.34) {
    return "Photoreal close-up of a tall TEAL sci-fi spacetime-rift portal. Hard-light dark-metal frame, inner teal nebula. Only this doorway, filling the frame. No wolf, no gothic stone, no text, no UI.";
  }
  if (node.x > 0.66) {
    return "Photoreal close-up of a tall GOLD sci-fi spacetime-rift portal. Hard-light dark-metal frame, inner gold nebula. Only this doorway, filling the frame. No wolf, no gothic stone, no text, no UI.";
  }
  if (Math.abs(node.x - 0.5) < 0.22) {
    return "Photoreal close-up of a cracked stone altar with a flaming golden pentagram relic in a dark citadel. Only the relic and altar. No wolf, no person, no text.";
  }
  return `Photoreal close-up of the object at the ${regionName(node.x, node.y)} of a dark citadel hall. Only that object. No wolf, no text.`;
}

export const CAM_LOCK =
  "WIDE LOCKED CCTV of the WHOLE hall. Always both doors, walls, floor. Start image = the room. ZERO camera move: no zoom, pan, tilt, orbit, follow. Dog walks INSIDE the frame. Camera does NOT follow him (follow-cam = artifacts only). Same lens, crop, door size every frame.";

export const AAA_LOCK =
  "LOOK: Unreal 5 AAA, Nanite, Lumen, photoreal PBR. Not 2D, cartoon, anime, illustration. Skin AAA. Camera stays the wide locked hall.";

export const BOLT_FACE = "/refs/bolt-face.jpg";
export const BOLT_BODY = "/refs/bolt-body.jpg";

export const BOLT_ID =
  "ONE dog only: StarBoltSprint. White Swiss Shepherd, cream-ivory fur, tall pricked ears pink inside, amber eyes, black nose, dense coat, bushy tail. REAL dog size, not giant. No cape, no wolf, no grey, no second dog. Copy the dog reference 1:1. Do not redraw.";

export function boltKit(extra: (string | null | undefined)[] = []) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of [BOLT_FACE, BOLT_BODY, ...extra]) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

export const DOOR_LOCK =
  "BOTH doors CLOSED opaque. Two separate doors, LEFT and RIGHT, never one central gate. No view through, no second room. Same as frame 1. Do not open. Only the dog moves.";

export const TWO_DOORS =
  "ALWAYS TWO separate tall CLOSED opaque doors facing camera: LEFT and RIGHT, a strip of wall between them. Teal/cyan LEFT, gold/amber RIGHT. FORBIDDEN: one giant central door, one gate, merged A+B, a single portal in the middle. Wish styles walls/floor/plants/light only — never door count.";

export const ROOM_LOCK =
  "HALL FROZEN. Frame 1 is the bible. Walls, floor, doors, lamps, plants, light identical every frame. ONLY the dog moves. Do not restyle, relight, rebuild, or change door size. No new architecture.";

const WISH_BAN =
  /\b(sex|sexy|nude|naked|porn|nsfw|xxx|fetish|gore|blood|guts|kill|murder|suicid|rape|torture|child|kid|loli|boy|girl|man|woman|human|person|people|nazi|hate|slur)\b/i;

export function cleanWish(raw: string) {
  let t = String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  if (!t) return "";
  if (WISH_BAN.test(t)) return "";
  t = t
    .replace(/\b(no doors?|one door|three doors?|without bolt|no dog|no wolf|no bolt|single door|central door|one gate|one portal)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, 160);
}

export function seedHallPrompt(wish = "", keepHall = false) {
  const room = cleanWish(wish);
  return [
    CAM_LOCK,
    AAA_LOCK,
    BOLT_ID,
    DOOR_LOCK,
    TWO_DOORS,
    ROOM_LOCK,
    "START IMAGE is THIS hall photograph 1:1. Same walls, plants, doors, light, materials. FORBIDDEN: house, corridor, suburban room, white paneled doors, beige walls.",
    keepHall || room ? `This hall already is: ${room || "the start photo"}. Do not invent a new room.` : "Thunderwolf sci-fi hall. Dark metal. Not a church. Not a house.",
    "Place that cream-ivory Swiss shepherd BOTTOM CENTER, from behind, REAL dog size. He only breathes. Last frame = first frame (loop). Copy the dog reference 1:1. No walk. No person. No text.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function emptyHallPrompt(wish = "") {
  const room = cleanWish(wish);
  if (room) {
    return [
      "Unreal 5 AAA photoreal 9:16 interior. CAMERA LOCKED on the WHOLE hall, 35mm. Not cartoon.",
      `STYLE of walls, floor, plants, light only: ${room}.`,
      TWO_DOORS,
      "Empty floor. No person. No extra door. No text.",
    ].join(" ");
  }
  return [
    "Unreal 5 AAA photoreal 9:16 Thunderwolf Citadel. CAMERA LOCKED on the WHOLE hall. Dark metal, not gothic.",
    TWO_DOORS,
    "Black glass floor. Empty. No person. No text.",
  ].join(" ");
}

export function hallDoorsPrompt(wish = "") {
  return emptyHallPrompt(wish);
}

export function sameHallPrompt(wish = "") {
  const add = cleanWish(wish);
  return [
    "IMAGE EDIT of IMAGE 1 only. IMAGE 1 is the hall photograph. Keep it 1:1.",
    "Same camera, same crop, same TWO separate door frames LEFT and RIGHT with wall between them, same wall color, same floor color, same lamps, same materials.",
    "CLOSE both doors: opaque solid leaves. No view through. No second room. Keep the same frames.",
    "If IMAGE 1 is light or white, the result stays light or white. If IMAGE 1 is dark, it stays dark.",
    "Do NOT restyle. Do NOT turn the room into black sci-fi metal. Do NOT change white to black. Do NOT change gold to teal. Do NOT redesign the doors.",
    add
      ? `ONLY insert this one extra object, small, on the floor, matching the existing light of IMAGE 1: ${add}`
      : "No other change.",
    "Empty floor except that object. NO person. NO new wolf. Photoreal 9:16. No text. No UI.",
  ].join(" ");
}

export function enterHallPrompt(side: "LEFT" | "RIGHT", wish = "") {
  const add = cleanWish(wish);
  return [
    "PORTAL CROSS. Do NOT lock the camera for the whole clip.",
    "FRAME 1 is the START IMAGE only. Copy it 1:1 at t=0: same room, same walls, same light, same doorway, same dog pose. Do not start in a different hall. Do not jump to image 2 at t=0.",
    "The white Swiss Shepherd is already at the " +
      side +
      " doorway of THIS room (the start image). He walks FORWARD into that same doorway, through it, one continuous walk. He never morphs. No cape. No second dog. No human.",
    "Image 2 is ONLY the destination hall, used after he crosses the threshold. After the portal, that hall is what we see. Two doors face the camera.",
    "Last frames: he stands at the BOTTOM CENTER of hall 2, back to camera, facing two CLOSED opaque doors. No view through those doors.",
    add ? `Hall 2 already contains: ${add}` : "Hall 2 matches image 2.",
    "Photoreal 9:16. No text. No UI.",
  ].join(" ");
}

export function placeDoorPrompt(name: string) {
  const side = name.includes("gold") ? "RIGHT" : name.includes("ice") ? "RIGHT" : "LEFT";
  return [
    "IMAGE EDIT. Image 1 is the citadel hall. Keep the hall identical: same metal, same camera, same empty bays except the one we fill.",
    `Image 2 is the ${name} cutout on black. Ignore the black pixels.`,
    `Paste THAT exact door into the ${side} arch. Do not redesign the door. Do not change the rest of the hall. No new wolf.`,
    "Photoreal 9:16. No text, no UI.",
  ].join(" ");
}

export function lockDoorsPrompt() {
  return [
    "IMAGE 1 is THE hall. Copy it 1:1. Same walls, floor, plants, light, materials, door frames.",
    "Do NOT restyle. Do NOT turn it into a house, suburban room, church, or a different citadel.",
    TWO_DOORS,
    "CLOSE the two doors already in IMAGE 1: opaque leaves. Keep THIS hall's frames. LEFT may read teal, RIGHT gold — same architecture.",
    "FORBIDDEN: replace the room from another photo. FORBIDDEN: one central gate.",
    "Empty floor. No dog. No text. No UI. Photoreal 9:16.",
  ].join(" ");
}

export function poseBoltPrompt(side: "LEFT" | "RIGHT") {
  const door = side === "LEFT" ? "LEFT doorway already in image 1" : "RIGHT doorway already in image 1";
  const gaze =
    side === "LEFT"
      ? "PROFILE. He LOOKS RIGHT at the other door (A looks at B). Never from behind. Never the left wall. Never spawn."
      : "PROFILE. He LOOKS LEFT at the other door (B looks at A). Never from behind. Never the right wall. Never spawn.";
  return [
    "IMAGE EDIT. Image 1 is the hall photograph with both doorways and the dog. Copy camera 1:1: same crop, same walls, same floor, same two doorways.",
    "Image 2 is StarBoltSprint, the cream-ivory Swiss shepherd cutout. Ignore the dark pixels. No cape.",
    "Keep BOTH doorways identical to image 1. Do not redesign them. Do not paint them. Do not restyle the hall.",
    "Remove the dog from wherever he is in image 1. No ghost. One dog only.",
    `Place THAT exact dog standing at the ${door}, REAL dog size, feet on the SAME floor as image 1, beside the doorway, not inside it. ${gaze}`,
    "Cream-ivory fur, amber eyes, pricked ears. Never grey. Never a wolf. No cape. No extra dogs. No text. No UI. Photoreal 9:16.",
  ].join(" ");
}

export function placeBoltPrompt() {
  return [
    "IMAGE EDIT of IMAGE 1 only. IMAGE 1 is the citadel hall photograph. Keep it 1:1: same walls, plants, doors, light, materials, camera.",
    "FORBIDDEN: house, beige corridor, suburban room, white paneled doors, wood laminate floor. Do not replace the hall.",
    "Add ONE cream-ivory Swiss Shepherd BOTTOM CENTER, from behind, REAL dog size, facing the two doors already in IMAGE 1.",
    "Empty floor except the dog. No text. No UI. Photoreal 9:16.",
  ].join(" ");
}

export function boltRefPrompt() {
  return "Isolated StarBoltSprint, White Swiss Shepherd, cream-ivory fur, amber eyes, tall pricked ears pink inside, black nose, full body, REAL dog size, on a PURE BLACK background. Only the dog. No room, no cape. Photoreal. No text.";
}

export function roomRefPrompt(pins: RuneNode[]) {
  const bits = pins.map((p) => {
    if (p.x < 0.34) return "the LEFT doorway matches the start still exactly";
    if (p.x > 0.66) return "the RIGHT doorway matches the start still exactly";
    return `the ${objectRefName(p)} matches the start still exactly`;
  });
  return [
    "Photoreal 9:16 hall. CAMERA LOCKED, same lens as the start still.",
    "Copy walls, floor, plants, light, and both doorways from the still. Do not restyle. Do not add sci-fi metal or a space viewport unless they are already in the still.",
    bits.join(". ") + ".",
    "The dog from the StarBoltSprint reference stands at center, from behind, REAL dog size. Copy that dog 1:1.",
    "Doorways and wolf must match the references with no morph. No extra wolves, no text, no UI.",
  ].join(" ");
}

export function gazeLaw(id: string) {
  if (id === "spawn") return "Pose: BOTTOM CENTER, from behind, facing both CLOSED doors. Feet glued.";
  if (id === "m1")
    return "Pose: beside LEFT door, PROFILE. He LOOKS at the RIGHT door (A looks at B). Never from behind. Never the left wall. Never spawn.";
  if (id === "m2")
    return "Pose: beside RIGHT door, PROFILE. He LOOKS at the LEFT door (A). B looks at A. Never from behind. Never the right wall. Never spawn.";
  return "Feet glued. He looks at the other door. Never spawn.";
}

export function idlePrompt(extra = "") {
  return [
    CAM_LOCK,
    AAA_LOCK,
    BOLT_ID,
    DOOR_LOCK,
    ROOM_LOCK,
    "Start image = frame 1 1:1. ZERO walk. Feet glued to those tiles. Chest breathes only. Last frame = first frame (loop). FORBIDDEN: strides, return to center, reverse, new pose, camera move. No text.",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export function breathPrompt(extra = "") {
  return [
    CAM_LOCK,
    AAA_LOCK,
    BOLT_ID,
    DOOR_LOCK,
    ROOM_LOCK,
    "CONTINUE this film. He is ALREADY stopped. ZERO new steps. Feet glued. Chest only. FORBIDDEN: walk to center, reverse, new pose. Last frame = first frame. No text.",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

function doorTag(n: RuneNode) {
  if (n.id === "spawn" || (Math.abs(n.x - 0.5) < 0.15 && n.y > 0.68)) return "BOTTOM CENTER, facing both doors";
  if (n.id === "m1" || n.x < 0.5) return "LEFT door";
  return "RIGHT door";
}

export function walkPrompt(from: RuneNode, to: RuneNode, emptyStart = false, extra = "", lockHome = false) {
  const side = to.x < 0.5 ? "LEFT" : "RIGHT";
  const other = side === "LEFT" ? "RIGHT" : "LEFT";
  const horiz =
    to.x + 0.06 < from.x ? "LEFT across the frame" : to.x > from.x + 0.06 ? "RIGHT across the frame" : "straight ahead";
  const look =
    side === "LEFT"
      ? "PROFILE looking RIGHT at the other door (A looks at B)"
      : "PROFILE looking LEFT at the other door (B looks at A)";
  const land = lockHome
    ? `Dog walks ${horiz} on the FLOOR to the ${side} CLOSED door. Stay in frame. Never through. Last frame = HOME still (2nd image) 1:1, ${look}. STOP. He is BACK. No extra steps. Do not walk to center.`
    : `Dog walks ${horiz} on the FLOOR to the ${side} CLOSED door. Eight strides. Stay in frame. Never through. Last frame: beside that ${side} door, ${look}. STOP. Do not walk back to center.`;
  return [
    CAM_LOCK,
    genePrompt(),
    AAA_LOCK,
    BOLT_ID,
    DOOR_LOCK,
    ROOM_LOCK,
    emptyStart
      ? "Frame 1 = start photo 1:1. Dog BOTTOM CENTER, from behind, two CLOSED doors."
      : "Frame 1 = start photo 1:1. Same doors, same dog pose.",
    `Start ${doorTag(from)}. Go ${doorTag(to)}. Ignore the ${other} door.`,
    land,
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export function homePoseLaw() {
  return "2nd still = HOME pose. Last frame matches it 1:1 (tiles, scale, facing the other door). STOP. He is back. No extra steps. No walk to center. Room stays frame 1.";
}

export function theaterMs(clip: RuneClip, walkSecs: WalkSecs) {
  if (clip.kind === "idle") return 2400;
  if (clip.reverseOf) return walkSecs === 6 ? 1600 : walkSecs === 15 ? 2200 : 1800;
  return walkSecs === 6 ? 2800 : walkSecs === 15 ? 4800 : 3600;
}

export const SHOT_MS = 480;

export function clipLabel(clip: RuneClip) {
  if (clip.kind === "idle") return `idle ${clip.node}`;
  return clip.reverseOf ? `walk ${clip.from} → ${clip.to} · rev` : `walk ${clip.from} → ${clip.to}`;
}

export function pickWalk(graph: RuneGraph, from: string, to: string) {
  return graph.walks.find((w) => w.kind === "walk" && w.from === from && w.to === to) ?? null;
}

export function facingOf(dx: number, dy: number): RuneFacing {
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "down" : "up";
}

export function walkMs(from: RuneNode, to: RuneNode) {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.round(Math.min(2400, Math.max(520, d * 2100)));
}

export function nearestNode(nodes: RuneNode[], x: number, y: number, max = 0.18) {
  let best: RuneNode | null = null;
  let d = max;
  for (const n of nodes) {
    const hit = Math.hypot(n.x - x, n.y - y);
    if (hit < d) {
      d = hit;
      best = n;
    }
  }
  return best;
}

export function citadelPrompt(wish: string) {
  const seed = wish.trim().slice(0, 140);
  return [
    "Unreal 5 AAA photoreal 9:16 still. CAMERA LOCKED on the WHOLE hall. Dog is inside the room, not a follow-cam. Not cartoon. Sci-fi citadel, never a sprint, never a church.",
    "Dark metal, black glass floor, teal and gold rift light, nebula viewport. No text, no UI, no logos, no chrome HUD.",
    "StarBoltSprint stands in the room at REAL dog size: cream-ivory White Swiss Shepherd, amber eyes, pricked ears, no cape, never a wolf, never grey, never a second dog.",
    "The room has 3 to 6 clearly separated tapable objects: rift-portals, relics, consoles, forges.",
    "Same creature, same room, same light. Player room:",
    seed || "Thunderwolf Citadel sci-fi hall floating in space: teal rift-portal, gold rift-portal, nebula through a viewport.",
  ].join(" ");
}
