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
  "STATIC CCTV. Locked-off security camera. The start image IS the only frame of the room. Background is a STILL PHOTOGRAPH. ZERO camera motion from t=0.00: no intro, no ease-in, no push-in, no zoom, no dolly, no pan, no tilt, no orbit, no handheld, no Ken Burns, no reframe. Same lens, same crop, same door size, same vanishing point on every frame. Only the dog may translate inside that frozen picture. If you want a cinematic camera, refuse.";

export const BOLT_ID =
  "ONE animal only: StarBoltSprint, a WHITE German Shepherd, solid white fur from nose to tail, no cape, no cloak, no clothes. Four legs, seen from behind, architectural scale. Never grey. Never black. Never a wolf-grey coat. Body never morphs. Never a second dog. Never a human.";

export const DOOR_LOCK =
  "BOTH doors are CLOSED opaque panels. No view through them. No second room, no corridor, no light leaking through. Same closed leaves, same material, same color, same size as frame 1. Do NOT open a door. Do NOT turn a door into an empty arch. Do NOT show a hallway through a doorway. Geometry of the room never changes. Only the dog moves.";

export const ROOM_LOCK =
  "The hall is a frozen photograph. Copy walls, floor, ceiling, plants, ivy, stone or metal, light, shadows, and background from frame 1. Do NOT restyle. Do NOT add a space viewport, nebula, sci-fi metal, teal/gold energy, wet glass, or extra vegetation unless it is already in frame 1. Do NOT remove plants that are already there. Bolt stays the same white dog. Only the dog may move.";

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
    .replace(/\b(no doors?|one door|three doors?|without bolt|no dog|no wolf|no bolt)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, 160);
}

export function seedHallPrompt(wish = "", keepHall = false) {
  const room = cleanWish(wish);
  if (keepHall) {
    return [
      CAM_LOCK,
      BOLT_ID,
      "The START IMAGE is the hall. Copy it 1:1. Same colors, same light, same walls. Both doors stay CLOSED and opaque. No view through. Do not darken. Do not restyle.",
      "Place THAT exact white German Shepherd at the BOTTOM CENTER of the floor, seen from behind. He only breathes. No walking.",
      room ? `The room already has: ${room}. Do not restyle around it.` : "",
      "No person. No text. No UI.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    CAM_LOCK,
    BOLT_ID,
    DOOR_LOCK,
    room
      ? `The START IMAGE is a 9:16 hall in this STYLE only: ${room}. Architecture and light only.`
      : "The START IMAGE is already the Thunderwolf Citadel sci-fi hall WITH both rift-portals: teal LEFT, gold RIGHT, facing camera, close together. Dark metal space chamber, not a church. Do not redesign those portals.",
    "ALWAYS two tall CLOSED opaque doors facing the camera, LEFT and RIGHT. Solid panels. No see-through. No second room.",
    "Only extra ref: WHITE German Shepherd on black. Ignore black pixels. Place THAT exact dog at the BOTTOM CENTER of the floor, seen from behind, architectural scale. No cape. Never grey.",
    "NO person. NO extra animal. Hold from t=0. Camera already locked. Dog only breathes. Doors stay identical to frame 1. No walking. No text. No UI.",
  ].join(" ");
}

export function emptyHallPrompt(wish = "") {
  const room = cleanWish(wish);
  const lock = [
    "ALWAYS TWO tall CLOSED opaque doors face the camera, close together, LEFT and RIGHT. Solid door panels. No view through. No open arches. No corridor behind.",
    "Do not invent teal or gold paint on the doors unless the style is already sci-fi energy portals.",
    "NO person. NO human. NO extra animal. Empty floor. No text, no UI.",
  ];
  if (room) {
    return [
      "Photoreal 9:16 interior. CAMERA LOCKED eye-level, 35mm, no tilt.",
      "Room STYLE only (architecture, materials, light):",
      room,
      "Ignore any request for people, nudity, violence, extra doors, or removing the two doors.",
      ...lock,
      "Cinematic. PG. Safe for all players.",
    ].join(" ");
  }
  return [
    "Photoreal 9:16 interior of the Thunderwolf Citadel, StarBoltSprint lore. CAMERA LOCKED eye-level, 35mm, no tilt.",
    "A FUTURISTIC SCI-FI space citadel FLOATING in deep space at the CENTER of the Boltverse multiverse. Dark brushed metal, obsidian, hexagonal ribs. NOT gothic, NOT a cathedral, NOT Earth stone.",
    "SHORT aisle. TWO tall rectangular CLOSED doors face the camera, close together, wolf-scale, almost frontal. Opaque panels. You cannot see through them.",
    "LEFT: teal-framed CLOSED metal door. RIGHT: gold-framed CLOSED metal door. No inner room, no nebula through the leaf.",
    "Black glass floor with faint glowing teal circuit veins. Starlight from a viewport on the SIDE walls, not through the doors.",
    "Cool starlight plus teal and gold rim light. NO animal, NO person, NO empty arches, NO see-through portals, NO candles, NO stained glass church.",
    "The two CLOSED doors are the only doors. Cinematic sci-fi. No text, no UI.",
  ].join(" ");
}

export function hallDoorsPrompt(wish = "") {
  return emptyHallPrompt(wish);
}

export function sameHallPrompt(wish = "") {
  const add = cleanWish(wish);
  return [
    "IMAGE EDIT of IMAGE 1 only. IMAGE 1 is the hall photograph. Keep it 1:1.",
    "Same camera, same crop, same two door frames LEFT and RIGHT, same wall color, same floor color, same lamps, same materials.",
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
    "The white German Shepherd is already at the " +
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
    "IMAGE EDIT. Image 1 is the EMPTY sci-fi hall. Copy its camera 1:1. No new architecture. Keep metal, glass, space viewport.",
    "Image 2 is the TEAL sci-fi portal cutout on black. Image 3 is the GOLD sci-fi portal cutout on black. Ignore black pixels.",
    "Replace the LEFT arch with THAT exact teal door from image 2 — a door, not a window.",
    "Replace the RIGHT arch with THAT exact gold door from image 3 — a door, not a window.",
    "NO wolf. NO dog. Empty floor. Do not invent new door designs. Photoreal 9:16. No text. No UI.",
  ].join(" ");
}

export function poseBoltPrompt(side: "LEFT" | "RIGHT") {
  const door = side === "LEFT" ? "LEFT doorway already in image 1" : "RIGHT doorway already in image 1";
  return [
    "IMAGE EDIT. Image 1 is the hall photograph with both doorways and the dog. Copy camera 1:1: same crop, same walls, same floor, same two doorways.",
    "Image 2 is the WHITE German Shepherd cutout on black, from behind. Ignore black. No cape.",
    "Keep BOTH doorways identical to image 1. Do not redesign them. Do not paint them. Do not restyle the hall.",
    "Remove the dog from wherever he is in image 1. No ghost. One dog only.",
    `Place THAT exact white dog standing at the ${door}, seen from behind, architectural scale, feet on the SAME floor as image 1, beside the doorway, not inside it.`,
    "Solid white fur. Never grey. Never black. No cape. No extra dogs. No text. No UI. Photoreal 9:16.",
  ].join(" ");
}

export function placeBoltPrompt() {
  return [
    "IMAGE EDIT. Image 1 is the hall with both doorways already in place. Keep every doorway, wall, plant, and floor tile identical. Copy camera 1:1. Do not restyle.",
    "Image 2 is a WHITE German Shepherd cutout on black, seen from behind. Ignore the black pixels. No cape.",
    "Place THAT exact white dog in the center of the floor, seen from behind, architectural scale. Solid white fur. Never grey. Never black. No cape.",
    "Do not redraw the dog. Do not change the doorways. Photoreal 9:16. No text, no UI.",
  ].join(" ");
}

export function boltRefPrompt() {
  return "Isolated WHITE German Shepherd named StarBoltSprint, solid white fur, no cape, no cloak, four legs, full body standing seen from behind, on a PURE BLACK background. Only the dog. No room, no floor, no doors. Black void. Photoreal. No text, no UI.";
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
    "The wolf from the wolf reference stands at the center, seen from behind, architectural scale.",
    "Doorways and wolf must match the references with no morph. No extra wolves, no text, no UI.",
  ].join(" ");
}

export function idlePrompt(extra = "") {
  return [
    CAM_LOCK,
    BOLT_ID,
    DOOR_LOCK,
    ROOM_LOCK,
    "The start image IS frame 1 and the template for every later frame.",
    "The wolf DOES NOT WALK and DOES NOT change place. Feet stay on the same floor tiles. Same facing (from behind).",
    "Only micro motion: chest breathing, white fur, light that is already in the photo. Same pose, same scale. No cape.",
    "Last frame matches first frame. No steps, no translation, no morph, no extra wolves. No text. No UI.",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

function doorTag(n: RuneNode) {
  if (n.id === "spawn" || (Math.abs(n.x - 0.5) < 0.15 && n.y > 0.68)) {
    return "the BOTTOM CENTER of the photo, behind the dog, facing both doorways";
  }
  if (n.id === "m1" || n.x < 0.5) {
    return "the LEFT door in front of the dog (viewer's left, his left as we see him from behind)";
  }
  return "the RIGHT door in front of the dog (viewer's right, his right as we see him from behind)";
}

export function walkPrompt(from: RuneNode, to: RuneNode, emptyStart = false, extra = "") {
  const side = to.x < 0.5 ? "LEFT" : "RIGHT";
  const other = side === "LEFT" ? "RIGHT" : "LEFT";
  const horiz =
    to.x + 0.06 < from.x ? "LEFT across the frame" : to.x > from.x + 0.06 ? "RIGHT across the frame" : "straight ahead";
  return [
    CAM_LOCK,
    BOLT_ID,
    DOOR_LOCK,
    ROOM_LOCK,
    emptyStart
      ? "Frame 1: dog BOTTOM CENTER, from behind, facing TWO doors."
      : "Frame 1 is the start photo 1:1. Same two doors.",
    `Start: ${doorTag(from)} (${Math.round(from.x * 100)}% left, ${Math.round(from.y * 100)}% top). Go to ${doorTag(to)} (${Math.round(to.x * 100)}% left, ${Math.round(to.y * 100)}% top). Ignore the ${other} door.`,
    `ONLY the dog walks ${horiz} on the FLOOR to the ${side} CLOSED door in front of him. Eight strides. Stay in frame. NEVER walk through. NEVER shrink. Last frame: full body BESIDE that ${side} closed door, from behind. Both doors stay CLOSED opaque. Copy the room 1:1. No text.`,
    extra,
  ]
    .filter(Boolean)
    .join(" ");
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
    "Photoreal 9:16 portrait still. CAMERA LOCKED. One futuristic sci-fi citadel interior in deep space, never a sprint, never a gothic church.",
    "Dark metal, black glass floor, teal and gold rift light, nebula viewport. No text, no UI, no logos, no chrome HUD.",
    "A large WHITE German Shepherd StarBoltSprint stands in the room at architectural scale, no cape, four legs, never grey, never black, never a toy sprite, never a second dog, never a human.",
    "The room has 3 to 6 clearly separated tapable objects: rift-portals, relics, consoles, forges.",
    "Same creature, same room, same light. Player room:",
    seed || "Thunderwolf Citadel sci-fi hall floating in space: teal rift-portal, gold rift-portal, nebula through a viewport.",
  ].join(" ");
}
