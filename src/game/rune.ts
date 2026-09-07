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

export { pathEntry, createPathHref, createBotForgeHref, parseLookForge, shouldAutoStartBotForge } from "./path-entry.ts";

export const TOUR_PLATE = "/films/citadel-tour.jpg?v=sharp";
export {
  HALL_LOOP,
  HALL_STILL,
  isHallFilm,
  stockDoorWalk,
  stockRoomBank,
  stockDoorHits,
  stockStand,
  STOCK_STAND,
  inDoorHit,
  doorAtPoint,
  type DoorHit,
} from "./stock-room.ts";

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
  const dog = hasBolt
    ? `@image${objects.length + 1} is the snow-white Swiss Shepherd cutout on black. Place THAT exact dog in the center of the floor, seen from behind. Ignore the black. REPAINT the coat snow-white if the cutout looks cream.`
    : "";
  return [
    "Composite ONE photoreal 9:16 futuristic sci-fi citadel hall in deep space. Dark metal, black glass floor, nebula viewport. The references are isolated cutouts on black — paste them into this space chamber. Do not invent new portals or a new dog. No gothic cathedral.",
    ...lines,
    dog,
    "Camera locked. No morph. No extra dogs. No text. No UI.",
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

/** Shipped hall cooks must stay under this so cook.ts 2200 cannot truncate rails. */
export const HALL_PROMPT_MAX = 2100;

/** Lead every hall cook. Must stay first — cook slices video prompts at 2100. */
export const SHOT_REJECT =
  "REJECT LIST — never output: profile close-up, profile-hero, side hero, side mid-walk L→R hero, close-up silhouette fill, medium shot of the dog, tracking cam, orbit, push-in, tan/beige/ginger/saddle/mask coat, wolf morph, fox morph.";

/** Second lead rail. Coat bans sit with SHOT_REJECT so a 2100 slice cannot drop them. */
export const COAT_LOCK =
  "COAT: FULL snow-white ONLY — zero tan, beige, ginger, saddle, mask. TEXT COAT WINS over any tinted ref. REPAINT snow-white.";

const HALL_LEAD = [SHOT_REJECT, COAT_LOCK] as const;

/** Pin REJECT + COAT first, then flavor. Used when extras would overflow 2100. */
export function pinHallLead(text: string, max = HALL_PROMPT_MAX) {
  let rest = String(text || "");
  for (const rail of HALL_LEAD) rest = rest.split(rail).join(" ");
  rest = rest.replace(/\s+/g, " ").trim();
  return `${SHOT_REJECT} ${COAT_LOCK} ${rest}`.replace(/\s+/g, " ").trim().slice(0, max);
}

export function fitHallPrompt(...parts: (string | false | undefined)[]) {
  const text = parts
    .filter((p): p is string => Boolean(p))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= HALL_PROMPT_MAX) return text;
  return pinHallLead(text, HALL_PROMPT_MAX);
}

export const DOG_SCALE =
  "Dog is a SMALL figure in the LOWER center, ≤20% frame height. Both doors visible the entire clip.";

export const HALL_SHOT =
  `${SHOT_REJECT} ${COAT_LOCK} LEGAL SHOT: locked CCTV of the WHOLE hall (entire hall visible). ${DOG_SCALE} From BEHIND (rear) only. Welded camera — no orbit, no push-in, no track.`;

export const CAM_LOCK =
  `${HALL_SHOT} Start=room 1:1. Same lens/crop. HALL FROZEN. Only the dog moves. Both doors CLOSED.`;

/** Walk plates only — rear CCTV, never a side-profile mid-walk hero. */
export const WALK_LOCK =
  "WALK: SMALL Bolt, entire hall visible, locked CCTV, from BEHIND (rear) only. Never a side mid-walk L→R hero.";

export const TRAVEL_FACE =
  "BODY heading ≠ camera: Walk left → body heads left. Walk right → body heads right. Camera stays BEHIND. Moonwalk REJECT.";

export const GAIT_LOCK =
  "Paws plant. Stride = travel. No foot-slide. REAL dog size.";

export const STAND_LOCK =
  "STAND: rear / back-to-camera or 3/4-from-behind. Not a profile-hero.";

export const AAA_LOCK =
  "LOOK: Unreal 5 AAA, Nanite, Lumen, photoreal PBR. Not 2D, cartoon, anime, illustration. Skin AAA. Camera stays the wide locked hall.";

/** Face-front crop. Never a Forge tray chip. Never an Imagine @ref — face stills turn walk cooks. */
export const BOLT_FACE = "/refs/bolt-face.jpg";
/** Sealed Imagine identity still: rear full-body, snow-white coat on black. Scale lock. */
export const BOLT_BODY = "/refs/bolt-body.jpg";

const TAINTED_BOLT = new Set(["/refs/bolt-face.jpg", "/refs/bolt.jpg"]);
const TAINTED_BOLT_FILE = new Set([
  "bolt-face.jpg",
  "bolt-face.jpeg",
  "bolt-face.png",
  "bolt-face.webp",
  "bolt.jpg",
  "bolt.jpeg",
  "bolt.png",
  "bolt.webp",
]);
const OTHER_BOLT_STILL = /^(bolt)(-white|-face|-body)?\.(jpg|jpeg|png|webp)$/i;

/** Roux / cream / face-front crops — never send to Imagine, even if the file was replaced. */
export function isTaintedBolt(u?: string | null): boolean {
  if (!u) return false;
  const path = (u.split("?")[0] || u).toLowerCase();
  if (TAINTED_BOLT.has(path)) return true;
  const base = path.split("/").pop() || path;
  return TAINTED_BOLT_FILE.has(base);
}

/** Extra bolt stills (tiny white chip, face, old crops). Identity kit is rear body only. */
export function isOtherBoltStill(u?: string | null): boolean {
  if (!u) return false;
  const path = (u.split("?")[0] || u).toLowerCase();
  if (path === BOLT_BODY) return false;
  const base = path.split("/").pop() || path;
  return OTHER_BOLT_STILL.test(base);
}

export function dropTaintedBolt(urls: (string | null | undefined)[] = []): string[] {
  return urls.filter((u): u is string => !!u && !isTaintedBolt(u));
}

export function isForgeFaceChip(id?: string | null, name?: string | null): boolean {
  const a = String(id || "").toLowerCase().trim();
  const b = String(name || "").toLowerCase().trim();
  return a === "bolt-face" || a === "face" || b === "bolt-face" || b === "face";
}

/** Forge tray identity chips: rear body only — never the face crop. */
export function forgeTrayRefs<T extends { id: string; name?: string; src?: string }>(refs: T[]): T[] {
  return refs.filter((r) => !isForgeFaceChip(r.id, r.name) && !isTaintedBolt(r.src) && !isOtherBoltStill(r.src));
}

export const BOLT_ID =
  "ONE dog: StarBoltSprint. White Swiss Shepherd only — never a classic German Shepherd. FULL snow-white coat ONLY — zero tan, ginger, saddle, mask. TEXT COAT WINS over any tinted ref. No wolf, no fox, no second dog.";

/** Rear body identity only. Drop face / tiny white chip / old crops so @ref cannot turn Bolt. */
export function boltKit(extra: (string | null | undefined)[] = []) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of [BOLT_BODY, ...dropTaintedBolt(extra)]) {
    if (!u || seen.has(u) || isTaintedBolt(u) || isOtherBoltStill(u)) continue;
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
  return fitHallPrompt(
    CAM_LOCK,
    STAND_LOCK,
    BOLT_ID,
    "START IMAGE is THIS hall 1:1. FORBIDDEN: house, corridor, suburban room, white paneled doors.",
    keepHall || room ? `This hall already is: ${room || "the start photo"}.` : "Thunderwolf sci-fi hall. Dark metal.",
    "Dog SMALL in LOWER center, rear / back-to-camera. REPAINT coat snow-white. Breathe only. Last=first (loop). TEXT COAT WINS. No walk. No text.",
  );
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
    "Empty floor except that object. NO person. NO new dog. Photoreal 9:16. No text. No UI.",
  ].join(" ");
}

export function enterHallPrompt(side: "LEFT" | "RIGHT", wish = "") {
  const add = cleanWish(wish);
  return [
    "PORTAL CROSS. Do NOT lock the camera for the whole clip.",
    "FRAME 1 is the START IMAGE only. Copy it 1:1 at t=0: same room, same walls, same light, same doorway, same dog pose. Do not start in a different hall. Do not jump to image 2 at t=0.",
    "The snow-white Swiss Shepherd is already at the " +
      side +
      " doorway of THIS room (the start image). Solid white coat — no tan, beige, cream, ivory, or saddle. He walks FORWARD into that same doorway, through it, one continuous walk. He never morphs. No cape. No second dog. No human.",
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
    `Paste THAT exact door into the ${side} arch. Do not redesign the door. Do not change the rest of the hall. No new dog.`,
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
      ? "SMALL figure beside LEFT door, 3/4-from-behind, glance toward the RIGHT door (A looks at B)."
      : "SMALL figure beside RIGHT door, 3/4-from-behind, glance toward the LEFT door (B looks at A).";
  return fitHallPrompt(
    HALL_SHOT,
    STAND_LOCK,
    "IMAGE EDIT. <IMAGE_0> is the FULL hall — that crop IS the shot. Copy camera 1:1.",
    "<IMAGE_1> is StarBoltSprint, snow-white Swiss Shepherd from behind. TEXT COAT WINS — REPAINT cream/tan/saddle snow-white.",
    `Paste THAT dog SMALL (≤20% height) at the ${door}, same floor, not inside. ${gaze} No zoom. No ghost.`,
    "FULL snow-white coat. Never tan, cream, saddle, or a wolf. No text. Photoreal 9:16.",
  );
}

export function placeBoltPrompt() {
  return fitHallPrompt(
    HALL_SHOT,
    STAND_LOCK,
    "IMAGE EDIT. <IMAGE_0> is the FULL hall — that crop IS the shot. Keep 1:1. Do not zoom to the dog.",
    "<IMAGE_1> is StarBoltSprint, rear / back-to-camera snow-white Swiss Shepherd on black. Paste SMALL in LOWER center.",
    "TEXT COAT WINS: REPAINT cream/tan/saddle snow-white. Never a classic German Shepherd. No tan, beige, cream, ivory, saddle, or mask.",
    "FORBIDDEN: house, beige corridor, suburban room. Empty floor except the tiny dog. No text. Photoreal 9:16.",
  );
}

export function boltRefPrompt() {
  return "Isolated StarBoltSprint, White Swiss Shepherd, FULL solid snow-white coat — zero tan, beige, cream, ivory, sable, saddle, mask, or grey. Amber eyes, tall pricked ears pink inside, black nose, full body from behind, REAL dog size, on a PURE BLACK background. Only the dog. No room, no cape. Photoreal. No text.";
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
    "The dog from the StarBoltSprint reference stands at center, from behind, REAL dog size. REPAINT the coat snow-white if the reference looks cream.",
    "Doorways and dog must match the references with no morph. No extra dogs, no text, no UI.",
  ].join(" ");
}

export function gazeLaw(id: string) {
  if (id === "spawn")
    return "Pose: SMALL figure LOWER center, rear / back-to-camera, facing both CLOSED doors. Feet glued. NOT a profile-hero.";
  if (id === "m1")
    return "Pose: SMALL figure beside LEFT door, 3/4-from-behind, glance toward the RIGHT door (A looks at B). Feet glued. NOT a profile-hero.";
  if (id === "m2")
    return "Pose: SMALL figure beside RIGHT door, 3/4-from-behind, glance toward the LEFT door (B looks at A). Feet glued. NOT a profile-hero.";
  return "Feet glued. SMALL figure, rear or 3/4-from-behind. Glance at the other door. NOT a profile-hero.";
}

export function idlePrompt(extra = "") {
  return fitHallPrompt(
    CAM_LOCK,
    STAND_LOCK,
    BOLT_ID,
    "Frame 1 1:1. ZERO walk. Feet glued. Chest only. Last=first (loop). No text.",
    extra,
  );
}

export function breathPrompt(extra = "") {
  return fitHallPrompt(
    CAM_LOCK,
    STAND_LOCK,
    BOLT_ID,
    "CONTINUE. Already stopped. ZERO steps. Feet glued. Chest only. Rear/behind. Last=first. No text.",
    extra,
  );
}

function doorTag(n: RuneNode) {
  if (n.id === "spawn" || (Math.abs(n.x - 0.5) < 0.15 && n.y > 0.68)) return "BOTTOM CENTER, facing both doors";
  if (n.id === "m1" || n.x < 0.5) return "LEFT door";
  return "RIGHT door";
}

function headingLine(face: RuneFacing) {
  if (face === "left") return "body heads left — no moonwalk. Camera BEHIND, see his BACK, never a side-profile hero";
  if (face === "right") return "body heads right — no moonwalk. Camera BEHIND, see his BACK, never a side-profile hero";
  if (face === "up") return "nose points toward the far wall — rear / back-to-camera";
  return "body stays a SMALL figure toward camera — still wide hall, never a close-up";
}

/**
 * Walk packing (first → last): SHOT_REJECT + COAT_LOCK (via CAM_LOCK / HALL_SHOT),
 * WALK_LOCK, travel/gait, BOLT_ID, then door/land flavor + extras.
 * Rails stay early so fitHallPrompt / clipImaginePrompt cannot drop coat or rear-CCTV.
 */
export function walkPrompt(from: RuneNode, to: RuneNode, emptyStart = false, extra = "", lockHome = false) {
  const side = to.x < 0.5 ? "LEFT" : "RIGHT";
  const other = side === "LEFT" ? "RIGHT" : "LEFT";
  const travel = travelOf(from, to);
  const landLook =
    side === "LEFT"
      ? "STOP. SMALL figure beside the LEFT door, 3/4-from-behind, glance toward the RIGHT door (A looks at B)."
      : "STOP. SMALL figure beside the RIGHT door, 3/4-from-behind, glance toward the LEFT door (B looks at A).";
  const heading = headingLine(travel.face);
  const land = lockHome
    ? `Walk ${travel.horiz}. ${heading}. Never moonwalk. Last=HOME still 1:1. ${landLook} No walk to center.`
    : `Walk ${travel.horiz}. Eight planted strides. ${heading}. Never moonwalk. Last: ${landLook} No walk to center.`;
  return fitHallPrompt(
    CAM_LOCK,
    WALK_LOCK,
    TRAVEL_FACE,
    GAIT_LOCK,
    BOLT_ID,
    emptyStart ? "Frame 1 1:1. Dog SMALL LOWER center, rear / back-to-camera." : "Frame 1 1:1. Same doors, same pose, same wide crop.",
    `Start ${doorTag(from)}. Go ${doorTag(to)}. BOTH doors stay visible — do not crop the ${other} door.`,
    land,
    extra,
  );
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

/** walk.png 4×4: row 0 front/down, row 1 left, row 2 right, row 3 rear/up. */
export function faceRow(face: RuneFacing): number {
  if (face === "down") return 0;
  if (face === "left") return 1;
  if (face === "right") return 2;
  return 3;
}

/** Door A looks at B; Door B looks at A; spawn faces both doors. */
export function standFace(id: string): RuneFacing {
  if (id === "m1") return "right";
  if (id === "m2") return "left";
  return "up";
}

export function travelOf(from: RuneNode, to: RuneNode): { face: RuneFacing; horiz: string } {
  const face = facingOf(to.x - from.x, to.y - from.y);
  const horiz =
    face === "left"
      ? "LEFT across the frame"
      : face === "right"
        ? "RIGHT across the frame"
        : face === "up"
          ? "FORWARD toward the far wall"
          : "toward the camera";
  return { face, horiz };
}

/** True when facing fights translation (move left + face right, etc.). */
export function isMoonwalk(face: RuneFacing, dx: number, dy: number) {
  const travel = facingOf(dx, dy);
  if (travel === "left") return face === "right";
  if (travel === "right") return face === "left";
  if (travel === "up") return face === "down";
  return face === "up";
}

export const WALK_SHEET_COLS = 4;
/** Picture-space distance covered by one 4-frame walk cycle. */
export const WALK_CYCLE_DIST = 0.11;

export function walkProgress(t: number, dur: number) {
  if (dur <= 0) return 1;
  return Math.max(0, Math.min(1, t / dur));
}

/** Linear plant — ease-out makes the cycle skate at the end. */
export function walkPos(from: { x: number; y: number }, to: { x: number; y: number }, t: number, dur: number) {
  const k = walkProgress(t, dur);
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, k };
}

export function walkCycleCol(k: number, dist: number, cols = WALK_SHEET_COLS) {
  const cycles = Math.max(2, dist / WALK_CYCLE_DIST);
  return Math.floor(Math.max(0, Math.min(0.999, k)) * cycles * cols) % cols;
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
    "StarBoltSprint stands in the room at REAL dog size: FULL snow-white Swiss Shepherd, amber eyes, pricked ears, no cape, never a wolf, never tan, never cream, never grey, never a second dog.",
    "The room has 3 to 6 clearly separated tapable objects: rift-portals, relics, consoles, forges.",
    "Same creature, same room, same light. Player room:",
    seed || "Thunderwolf Citadel sci-fi hall floating in space: teal rift-portal, gold rift-portal, nebula through a viewport.",
  ].join(" ");
}
