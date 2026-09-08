# Bolt Rune

Living-film citadel. The picture is the clock. Crystal never chrome.

Play a hall. Walk a door. Hang an artefact on A or B. Add a room — Load lists it.

## Run

```bash
npm install
cp .env.example .env   # XAI_API_KEY for Imagine cooks
npm run dev
```

Open `http://localhost:8080`.

- **Runes** — citadel. Play / Load / New citadel.
- **Hang / Vault** — paste your own walk/breath/spawn mp4 or `grok.com/imagine/post/…` URLs into pose slots. One Hang writes one hall graph. Unhang of old Door A biome hangs stays advanced.
- **Keep** — sign in so the hall is yours.

Stock sprint mp4s are not in this tree (too heavy). Stills, UI, and Imagine CDN clips are.

## Hang refs → play room

Hang import: local mp4 or grok.com/imagine/post URL as room refs.
Roles: breath-spawn, breath-A, breath-B, walk-A, walk-B, walk-A-B, walk-B-A. Keyed spawn|atA|atB.
Breaths loop at poses; walks are edges. Human Hang wins stock on the pose SM / plate graph.
9:16 preferred. Continuity FAIL + KEEP = flag only — SmiR Hang wins.

Player-owned Imagine videos become hall **room refs** — not a second engine.

1. **Hang** (Vault) opens a slot form — not a pile of rooms. Fullscreen picture. Paste a local **mp4** and/or a **grok.com/imagine/post/…** URL into `breath-spawn`, `walk-A`, `walk-B`, `breath-A`, `breath-B` (`walk-A-B` / `walk-B-A` optional empty). 9:16 preferred.
2. One **Hang** confirm creates or updates **one** hall pose graph (`spawn | atA | atB`). Breaths loop at a pose; walks are edges. Human Hang wins stock. Empty slots stay stock.
3. **Play** walks that hall. Hung breaths and walks play when present — spawn, sill A/B, and A↔B crosses.
4. Continuity FAIL on land does **not** block Hang if you **KEEP** — flag only. SmiR Hang wins. Other Smoke FAIL (wide 16:9, zero-byte) still holds.
5. Old Door A biome hangs (Continue / Shift / Unhang) stay **advanced** — they do not block or dominate the import sheet.

No wallet. No player API keys. Spec stays free; paid cook only on confirm. Valley play URL unchanged.

## PCG rail 1

New citadel / Play mint a run seed `s` and Keep persists it with the citadel. Plate clips key as `s_i = H(s, i, act, biome)`. Enter clips key as `s_enter = H(s, i, enter, from, to, door)`. The clip cache reuses those keys before any Imagine recook. Walk-toward-door speculation never calls Imagine. Asteroid HOLD.

## PCG rail 2

Door glow in the picture: **walk-ready** (tap to walk) vs **enter-ready** (second, faster pulse) only when `s_enter` is a cache hit or a stock bridge exists for that from→to pair. No enter-ready pulse → double-tap stays idle/breath and never calls Imagine. Double-tap / enter plays the cached clip or stock only. Graph commits Hall′ only after that clip exists (PASS). Paid enter cook is an explicit Forge / ticket confirm — never walk-toward-door. Stock enter mp4s are not shipped; `registerStockBridge` is the library hook (play stock or refuse, never spin). Asteroid HOLD. No Pack seats expansion.

## PCG rail 3

Citadel is a graph, not a map. A grammar grows **pins** from run seed `s` + momentum; `compileCitadel` still realizes the walks. Hall → Door A + Door B (never one gate). Room —enter→ Hall′ only after a rail-2 clip, and the biome tag may change only on that enter. Dead-end → breath/idle, no rewrite. Legendary relic pin only when momentum ≥ τ — an extra pin, not a third front door. Manual Hang / Load pins win. Asteroid HOLD. No unpaid Imagine. No Pack seats expansion.

## PCG prompt grammar

Every Imagine plate is two layers: **rails** (terminals — camera, Bolt, lens, chrome ban, gold-cyan path; never sampled) then **slots** (biome / act / fork / trail / floor / leftover / fromTo / still / destStill / seed) from tiny enums only. `assemblePrompt(slots)` fills the template; the linter checksums rails, blocks morph / banned flavor / missing lock, and fails → stock, no Imagine. Player voice maps Rome→ember, Mars→asteroid, space→asteroid, or one short flavor clause — never camera or body. Graph pins stay in `pcg-grammar.ts` (rail 3). Asteroid HOLD. No Pack seats expansion.

## PCG anti-3D / film-strip laws

Bolt Rune has a strip of films, not a volume you stand in. If a technique needs coordinates, collision, or a ticking world sim, throw it out.

One source of truth: **graph + clips**. Camera is a sentence. Move is an act enum. Asteroid HOLD. No Pack seats expansion.

Deeper notes: [`docs/pcg-anti-3d.md`](docs/pcg-anti-3d.md). Picture-time lives in `src/game/pcg-rail.ts` (`pictureTimeMs` / `picturePhase` / `mayPeak`).

### Refuse

| Technique | Why |
| --- | --- |
| **Voxel WFC / marching cubes / navmesh** | XYZ volume. Neighbors are time cells, not floor tiles. |
| **Unconstrained diffusion worlds** (Imagine as dungeon master) | Diffusion renders a filled template. It does not invent the graph. |
| **Wall-clock spawners** (`Date.now` / `setTimeout` for peak/relic) | The picture is the clock. Pause the film → world must freeze. |
| **Perlin height / caves** | Heightmaps are a volume. |
| **Poisson disk props** | `put prop at (x,y,z)` is the wrong engine. |
| **LOD streaming cells** | Chunk streaming is a world sim. |
| **Physics / ragdoll / IK** | Collision + ticking bodies. |
| **Billboard HUD** | Words on the dog. Picture is the UI. |
| **Minimap / fog of war** | Map of a volume. |
| **Infinite terrain chunking** | Endless XYZ. We have a ~60s bone of plates. |

### Steal

| Steal | Not |
| --- | --- |
| **WFC on time cells (roles) + biome adjacency** | XYZ tiles |
| **Slot grammar + last frame + dest still + linter** | Chatty Imagine as DM |
| **Picture-time = Σ played plate durations**; phase = that × momentum `m`; peak only if phase window **and** `m` high | `Date.now()` in the generator |
| **Prefab chunks / Hang**, seeds `s_i`, prefetch stock cook on confirm | Live spawners |

### Smell tests

- If output is mesh / heightmap / put prop at `(x,y,z)` → wrong engine
- If model can change leg count and clip is accepted → not an engine
- Pause the film — if world still progresses → clock is wrong

## PCG role-WFC

1D time-strip of plate-roles — not a 2D map, not STWFC T×Y×X. WFC collapses the ~60s bone (5–8 plates). Neighbors are **time**. Roles (`calm | lean-L | lean-R | fork | peak | decay | breath | enter`) unlock prompt slots only; never free-text Imagine. Quiet 0–8s cannot be peak|enter. Peak only if t≥45s and momentum ≥ τ. Trail never jumps none→full. Contradiction → decay + stock, never a spinner. Every sample is `H(s, cell, observe)`. Offline New Citadel preview may still `collapseStrip` from 0 with seed `s`. Asteroid HOLD. No Pack seats.

**Online + tap-as-observe** is required so miss/idle can kill a peak already in the future domain — otherwise the EDPCG curve lies. Before Play: window bans, collapse cell 0 to calm|breath, propagate. After plate `i`, `applyTapObserve(strip, i, tap, m, pictureTime)` bans what the act forbids (miss → peak off i+1 and i+2 + decay boost; idle → peak+fork off i+1; clean + m≥τ + picture-time in the peak window → keep peak). Then `advanceOnline` observes the lowest-entropy uncollapsed cell (prefer i+1 if tied) and propagates. Picture-time is the sum of played plate durations (`pictureTimeMs`) — never `Date.now()`. Partial cook: Imagine only for a confirmed (collapsed) plate. Live empty i+1 → force decay; if decay is banned → breath stock; never pause the picture.

## PCG EDPCG density / awakening

Within a ~60s play bone, success chains wake the world in the picture. `density = smoothstep(m) * noise(runSeed, pictureTime)` fills **cook slots** (trail none|thin|full, fork, floor empty|crystals-ahead) — not terrain, not XYZ. High `m` + peak window → denser catalog `worldLine` / slot fills into `assemblePrompt`. Miss → λm, thinner trail; peak ban stays in online WFC. Same biome tag; enter is still required for a Hall′ biome hop. Catalog variants (forest quiet vs forest-crystal peak) pick by phase×m, never free LLM text. Asteroid HOLD. No Pack seats. No `Date.now()`.

## PCG chunk library

A chunk is a **trusted prefab film**. PCG places it on door A/B and does not invent pixels inside. Catalog biomes are the starter shelf (`chunk-{biome}`: still, optional loop, acts breath / walkA / walkB, walkSecs 6|10|15, pins A/B, laws RAILS). Tags: biome, door-handed, pose, energy, identity. Hung forge artifact wins over the seeded pick. Same hall A+B share a biome; biome hop only on enter.

PCG chooses only: which chunk on A/B, `walkSecs` by phase, whether a bridge is needed, and `library.pick(hash(s, room, door), filter)`.

**Bridge stitch** — Imagine only when two chunks must touch and poses mismatch. Start last frame of A, end still of B, act `enter` | `walk-across`, 6–8s, rails locked. Enter is illegal without a bridge clip or a named stock pair. Cook on confirm / Forge / ticket only. Cache key `H(s, fromId, toId, act)` hooks rail 2 (`lookupEnterClip` / `replaceStockEnter`). No bridge → breath on door. Credits: stock walk 0, remix hang 0, first stitch 1 ticket, replay cache 0. Lint chunks with the prompt rails linter. Asteroid HOLD. No Pack seats expansion.

## PCG play-loop / cue sheet

The play loop is a rhythm game whose chart is the film. Grade taps on the cue sheet in picture-time — never `Date.now()`, never buttons on Bolt.

A **plate** is `{ clip, duration (from file), cues[], stillStart, stillEnd }`. A **cue** is `{ side: A|B|none, on, off, kind: walk|enter-arm|breath }` with `on`/`off` in media seconds (`video.currentTime`).

`gradeTap(t, cue, coyote)` → early / hit / late / miss. Optional ≤80ms pre-on is still a Hit. Coyote is 180–280ms after `off`, cut at the next cue `on`. Wrong side is a miss. One grade per cue. Enter-arm only after a walk Hit on that door. Decoder skip over a window is not a miss.

Picture-time advances only while playing — not paused, hidden, or waiting on cook. On plate end: add time actually played. Phase / peak reuse `pictureTimeMs` / `mayPeak` from `pcg-rail`. Grades feed online WFC `applyTapObserve` (miss bans peak; idle bans peak+fork; empty domain → decay stock, never a spinner).

Grade alphas (SmiR): hit `m ← sat(m + 0.12 × (1 − m))`; late modest `−0.04`; miss `m ← 0.70 m` (never snaps to 0); idle `m ← 0.95 m` per quiet plate; early ignores `m` and does not feed WFC.

**Score law** (`SCORE_LAW` in `src/game/pcg-play.ts`): NO points / combo×N / high-score chrome / mandatory leaderboard. Only living number = m ∈ [0,1] on Resonance crystal. Hit: m ← m + 0.12(1−m). Late: m ← m − 0.04. Miss: m ← 0.7 m (never 0). Idle/Howl: m ← m · 0.95^Δt. Recall: m ← m − 0.05. Pause: frozen. Enter PASS: m low (Hall′ quiet). Floor ~0.05. m buys: trail none→thin→full, clearer forks, peak permission if picture-time≥~45s AND m≥τ, relic pin still needs confirm enter. m high + idle 20s → decays (wanted). Do NOT score: points per door, room count, perfect 100, on-screen multiplier, raw m global rank. Long-term trophy = Keep citadel recipe (seed+graph+PASS clips), not an integer. If player must read a number to know they play well, film failed.

Resonance chrome: bottom safe edge of 9:16, side gutters ~9%, height ~3.6% of frame. Thin crystal capsule. Fill = `smoothstep(m)`, ease ~180ms toward new `m` (not a whole-plate lerp). Quiet dim; lean brighter gold-cyan; peak permission brighter, still thin. Miss / wrong side drains extra-thin ~260ms then settles — no red flash or shake on the bar. Pause freezes fill and color. Readout of `m` only: no numerals, no COMBO, no pause glyph, never a hitbox, never covering Bolt paws / path / door pulses. Howl = breath act $0. Recall = last committed still of the node (not undo Keep enter). Pause freezes picture-time, CA, WFC, and prefetch.

**Howl law** (`HOWL_LAW` in `src/game/pcg-pose.ts`): Howl = intentional breath. Not heal, not Pause, not miss. Pause: clock frozen, m frozen, same clip freeze, armed unchanged. Howl: clock runs, same idle-decay 0.95^dt, (re)launch breath(pose) loop, armed=false, credits 0. Idle doing nothing: clock runs, idle-decay, existing breath loop, armed unchanged. No extra -0.05 on Howl (Recall only). No miss λ=0.7 on Howl. Howl during walk: abandon trip, return breath on fromPose (walk start pose), do NOT teleport to atA mid-sprint. H / long-press center → armed=false; play breath(pose); loop ok.

Smoke glow helper fails unreadable sheets (`on≥off`, `off>duration`, window `<0.35s`). Human Smoke stays visual. Asteroid HOLD. No Pack seats.

## Citadel pose SM

Citadel is a **film graph**, not a 3D dungeon: always two doors A/B; poses `spawn | atA | atB`; modes `breath | walk | enter | paused`. Walk is a pose-transition clip. Breath is the idle film on a pose (hall frozen, feet glued, side none). **HARD LOCK: breath ALWAYS loops until walk / Howl / Pause / enter** — never play-once-then-freeze last frame. Pose advances on plate `ended`, not on tap. Armed only on a walk Hit (not Early/Late). Same-door tap while breath-atA|atB + armed may enter (Relic is not door C). `walkClip(from, side)` is null if already at that door. Picture-time only. Video-layout A/B taps feed this SM. Asteroid HOLD. No Pack seats. No Imagine cook wakes.

**HARD LOCK: every plate change is `planTransition` → `runTransition` → play.** Never assign `video.src` from `goTo` / tap / Howl. Double-buffer + WAAPI only — no 8× `setTimeout` dissolve. `runTransition(video, planTransition(from, to), to.url)` after `createDomTransitionPlayer({ outgoing, incoming, still })`. `stillEnd === stillStart` or breath→breath same pose is a cut (0s). Dissolve ≤ 280ms (`prefers-reduced-motion` → 80ms). Decay holds, no fade. Missing clip or Smoke FAIL decays — no spinner. Howl / Pause abort the in-flight fade. Prefetch arrival breath on walk tap. Tap only chooses the clip; pose changes on walk `ended`. If the join pops, last frame of walk-A ≠ frame 0 of breath-A — dissolve cannot fix a bad encode (`src/game/transition.ts`).

**Preload law (`src/game/preload.ts`):** never Imagine. Warm only stock/cache already PASS, and only the next probable film. Priority: walk toward A → breath-atA; during breath → walk-spawn-A / walk-spawn-B; always decay; fallback breath-spawn. Enter only if already on disk. Max 4 offscreen 1×1 `<video preload=auto>`. `take(id)` steals the buffer into the dissolve pair. `prepare` tries `pre.take(plateId)` first. Pause → `pauseAll()`. Pose change re-warms and ignores the old generation. `link rel=preload as=video` is a network hint, not a 5th decode. `syncPreload(sm, lib, pre)` after startHall / onTap / onEnded.

**Breath after walk** (`BREATH_AFTER_WALK_LAW` in `src/game/pcg-pose.ts`):

1. walk ended → pose arrive → play breath(pose) with loop=true
2. onEnded while already breath → same breath(pose) again (loop), pose unchanged
3. loop=true ONLY for breath|decay; walk/enter loop=false then chain to breath
4. NEVER play-once-then-freeze for breath
5. loop must not recook / arm enter / raise m / advance WFC / wall-clock; idle-decay m per media second
6. dual-buffer WAAPI transitions + stock/cache-only preload (max 4)

First land after walk starts at `t=0`.

**Idle-decay law** (`IDLE_DECAY_LAW` / `tickIdleDecay` in `src/game/pcg-play.ts`): Idle-decay is NOT a miss. Film asked for nothing. m drops slowly on breath picture-time only. Only m decays (permission). Not Keep/pose/biome/cache. Miss: m ← λ_miss * m once (e.g. 0.70). Idle: m ← m * λ_idle^Δt with λ_idle ≈ 0.95 PER SECOND of media picture-time (not per loop lap, not per frame). onTimeUpdate: if paused return; if mode not breath|decay return; dt from media currentTime, clamp 0..0.25; handle loop wrap when currentTime < lastSample; m = idleDecay(m, dt). No idle during walk/enter (grade owns m). Howl = breath so idle continues. Recall = flat -0.05 already, not extra idle same instant. Floor 0.05–0.08. Resonance lerps to m. CA trail step only when m crosses 0.70 down / 0.75 up / 0.35 — not 60×/s. Never Imagine because m moved. Rates: breath/Howl λ=0.95/s; decay clip λ=0.98/s; quiet 0–8s λ=0.99/s; peak idle λ=0.93/s. Never miss λ (0.7× once) on idle. Idle does NOT flip WFC every tick. Don't recook breath on m tick. Resonance eases toward m 150–200ms; no red flash; per-second λ only — not also per-loop ×0.95.

**Spawn law** (`SPAWN_LAW` in `src/game/pcg-pose.ts`): Hall entry: pose=spawn, clip=breath-spawn loop. Center of hall, not stuck to a door, not already running. Both A and B readable in same lock-off frame. pictureTime=0, m ~0.15–0.25, quiet phase, no required glow first ~2s. Sequence: load hall → still cook-biome.jpg spawn → play breath-spawn → tap A/B → walk-spawn-* → breath-at*. First enter only after walk Hit + second pulse. Nobody spawns into Hall′ mid-run. Forbidden: spawn mid-walk; spawn facing only one door; spawn after failed enter as if Hall′ existed; camera not lock-off behind him. New Citadel / new room: always spawn+breath. Continue restores Keep node; safe play = breath on saved pose (may show atA still if Keep saved it), never resume mid-cut walk clip.

**Door law** (`DOOR_LAW` in `src/game/pcg-pose.ts`): Doors are NOT meshes. They are two sides of the plan + arm state. Layers: pixels (glow A/B), hitbox (L/R 9:16 only in on..off+coyote), graph edge Hall--A/B→, clip (walk changes pose, enter changes room). Always two doors in encode — never one, never three. Relic ≠ door C. Per-side states: unlit | lit | armed | committed | blocked. armed.A does not arm B. spawn + tap A → walk-spawn-A if clip else fail-forward (do not invent door). during walk-A cue: Hit → armed.A; Late → not armed; Miss/wrong side → not armed, m drops. atA + tap A: if armed + enter PASS cached → play enter-A; if armed + ticket → cook + decay wait; else stay breath-A (no free double-tap). atA + tap B → walk-A-B if clip else stay. Enter NEVER first tap from spawn — must have walked with Hit first. A is an edge not a destination; graph picks `to`. Walk cues ONLY on walk clips. breath-atA: side none, except one short enter-arm ONCE after Hit — not every loop (prevents m farm). Both doors glow same time = Smoke FAIL; tap A during glow B = Miss; Recall mid-walk → spawn armed off; Howl mid-walk → breath fromPose; Enter Smoke FAIL → graph intact decay armed off; illegal adjacency → blocked no cook. Hang pins chunk on edge A/B without adding a 3rd hitbox.

**Nested cycles** (`NESTED_CYCLES_LAW` in `src/game/pcg-pose.ts`): Four nested clocks — do not mix: 1) Micro plate (6–15s): play→cues→grade→ended→transition→play. Does not change room alone. 2) Room poses: breath-spawn ⇄ walk → breath-atA/B; Howl=re-breath; Recall=spawn; Pause=out. Breath loops. No mandatory peak here. 3) Bone ~60s picture-time: quiet→lean→peak permitted; miss=decay. Unit=sum of played plates. WFC+m+CA. Idle/Howl advance bone (slow decay); Pause does not. Peak = permission on SAME A/B not a 5th door. 4) Citadel graph: Hall enter→Hall′ (ticket, Smoke PASS), rare/paid, always respawn breath-spawn. One tap crosses ONE level at a time. If spawn tap does planet+lightning, cycle is broken. Enter PASS restarts bone to quiet in new hall. Anti-patterns already known: breath-as-walk; enter every walk; wall-clock peak; breath re-grade glow; walk→walk without breath.

**Keep schema** (`KEEP_LAW` in `src/game/pcg-pose.ts`): Keep = { seed s, nodes: Hall[], edges: { from, side: A|B, to, clipKey? } }. Citadel starts Hall0 catalog biome pose spawn; grows only via enter PASS (or Hang existing artifact). Share = seed + node/chunk ids not mesh. New Citadel = new s; Continue = this graph. No minimap. Hall = biome + chunkA/B + poses spawn|atA|atB + clips (breath-spawn/A/B, walk-spawn-A/B, optional A-B/B-A, decay) + aligned stills. Always two doors in spawn plan. Walk = same node other pose. Enter = new node + spawn + bone quiet reset. Room = same Hall memory with enter to other biome tag — never a 3D cube vs corridor. Dead-end = no legal edges → breath only. Healthy Keep ~4–8 halls; always 2 doors; ~6 stock clips + 1–2 enters. PCG picks which chunk on A/B, not door count.

**Clip / plate library** (`CLIP_LIBRARY_LAW` / `resolvePlatePath` in `src/game/pcg-pose.ts`): Citadel is a library of clips the SM may play — not streamed geometry. Plate = { id, url, duration, cues[], stillStart, stillEnd, poseStart, poseEnd, biome, act: breath|walk|enter|decay, side?, smoke PASS }. No clip, no move. Missing + no ticket → decay, not spinner. breath: idle on pose, loop yes, no pose change, stock. walk: spawn→A / A→B, loop no, pose yes, stock first. enter: hall→Hall′, loop no, reset spawn new hall, ticket if new; ONLY clip that may add Keep node. decay: fail-forward, optional loop, no rewrite Keep, prepaid stock. IDs: {biome}/breath-{spawn|atA|atB}, {biome}/walk-spawn-A, {biome}/walk-A-B, {biome}/decay, {from}→{to}/enter-A. Cache key for cooked = id + railsVersion + seed/slots hash. Catalog stock ignores run seed. stillEnd(walk-spawn-A) === stillStart(breath-A) → cut; else short dissolve. Authors: catalog stock ~6–8/biome; hung artifacts same shape; cooked Imagine only on confirm → Smoke → cache. Play thread only load(url) of PASS. Cues: walk one window one side; breath side none; enter optional one-shot enter-arm. resolve: PASS+url → prepare→transition→play; missing+ticket → queueCook+decay; missing/FAIL → decay. Preload next family (after walk-A, breath-A prio 0). NOT a clip: 3D room, nav path, one long citadel video, Resonance, door seat chat. walk-A-B and walk-B-A remain OPTIONAL in the library. Minimum playable hall stock: breath-spawn, breath-A, breath-B, walk-spawn-A, walk-spawn-B, decay. If cross-walk missing: from atA tap B → stay breath-A (fail-forward), player can Recall→spawn then walk-spawn-B. Do not require authors to cook A↔B.

**Play leftovers** (`PLAY_LEFTOVERS_LAW` in `src/game/pcg-pose.ts`): Walk = pose translation, NOT camera. Truck/orbit/follow-through-door = enter wearing walk tag → Smoke FAIL / don't match breath-A. Never blend walk→walk. ended(walk) ALWAYS → breath(newPose). First breath after walk: start at t=0. Hall change ONLY enter plate + Keep rewrite + spawn breath new biome. Walk through doorway must NOT onHallCommitted. armed dies when leaving door: walk-A-B / Howl / Recall → armed.A=false. Decay = pose-preserving stay. Fail-forward decay in current pose if have it; else spawn breath. Picture-time on loop wrap: loop=true MUST detect currentTime wrap. After enter PASS: drop old hall warm walks from preload; keep decay + new spawn breath. No stick forward. Forward = film-lit side. Holding A through walk does not auto-enter.

**EDPCG coupling** (`EDPCG_LAW` in `src/game/pcg-density.ts`): EDPCG is not a separate director. It reads same sensors as play (m, picture-time, last grade, mode) and writes ONLY into the next plate's allowed set + slots. Never steals camera or skips a miss. phase = f(picture-time): quiet|lean|peak-window|after. allowed = tiles(phase) ∩ tiles(m) ∩ tiles(lastGrade). Quiet 0–8s: still no peak even if high m. Peak-window ≥45s: peak may enter domain only if m high. After miss: decay forced first. Idle decay during breath can drop peak out of domain even at t=50s — generator does not owe lightning. onEnded walk/breath → next role + slot enums (do NOT recook plate that just played). start of next walk → prompt slots from m (do NOT change pose graph). miss → ban peak 1–2 cells (do NOT skip decay plate). Idle tick → nothing until next walk (do NOT swap breath every 0.05 m). enter PASS → reset phase + m low (do NOT carry peak into Hall′). Breath loops reuse SAME stock clip. EDPCG stamps upcoming walk only. On tap walk: domain=wfc.reweight(phase,m,lastGrade); role=observe; slots=ca.step; play stock. Decoupled on purpose: doors A/B, Keep graph (only enter PASS), rails/dog, credits (peak slots on existing walk file — no Imagine to chase curve). If EDPCG needs a new node to feel good, design failed — density on current hall is the actuator.

**WFC domain weights** (`WFC_WEIGHT_LAW` in `src/game/pcg-wfc.ts`): domain[i] = hard legal roles (adjacency + windows + miss bans). weight[i][r] soft; p(r)=weight[r]/sum over domain only. If peak ∉ domain, weight irrelevant. Weights NEVER revive banned tiles. weight(r) = W_phase(r,t) × W_m(r,m) × W_grade(r,last) × W_adj(r,prev). Seed NOT in weight table — only at observe via hash(s,i). Phase multipliers + m multipliers + grade bump as SmiR tables (quiet bans peak; high m makes peak likelier among legal only; miss bans peak decay×2; idle peak×0.4). observe: seeded sample; sum<=0 → return decay fail-forward. Same s/domain/weights → same tile. Online: only need cell i+1. Don't observe high-entropy future to plan bone. Slots second wave after role collapse (fork/trail domains) — ban first, weight second, hash observe. Failure bans: don't weight peak in quiet instead of ban; don't normalize before bans; don't use m as only weight; don't re-observe every idle tick; no Math.random().

## Smoke ship-gate

PASS | FAIL + `reasons[]` on a clip or still **before** Hang, cook-cache insert, or last-frame / enter handoff. FAIL never becomes the next universe — same as empty WFC: no Hang, no bad `stillEnd`, decay/hold, no spinner. Reasons paint on paused forge UI only.

Local lint always runs first (even if `SMOKE_WAKE_URL` is down): container (~9:16, duration band, last frame, no zero-byte) → camera / lock-off → body → doors / door architecture → chrome ban → path → cue honesty (`off−on≥0.35s`) → continuity → still-pair (URL keys, then pixel `matchPose` when both still bitmaps exist) → taille lock → lighting → grade → lock-off rig → void frames / black hole → prompt residue (`lintPrompt`). Pixel still-pair is ingest-only (Hang / cook / library accept) — play does not run it per frame. Other pixel/CV-hard checks use prompt + cue + aspect proxies; explicit doubt / mismatch FAILs. Optional Smoke bot hop when the wake URL is set — timeout or unparseable `{pass, reasons[]}` is FAIL. `railsVersion: "bolt-1"` on every PASS. Stock ingest once a clip is cached PASS. Keep replay / Howl / Pause skip. Door seat stays talk-only. Asteroid HOLD. No Pack seats expansion.

**Spawn / play chrome law:** spawn = lock-off BEHIND still only. Face-on hero spawn = FAIL. Profile-as-primary / hall mood loop = Vault ref only — never a legal breath-spawn without Smoke PASS. stillEnd(walk) ≈ stillStart(breath dest) and stillStart(walk-spawn-*) ≈ stillStart(breath-spawn); required fields `stillStart`, `stillEnd` — fail closed when the authoring path provides them. Mid-clip near-black full frames (void) = FAIL. Burned SEATS/FILMS/ROOMS/REFS in a breath|walk|enter|decay encode = FAIL. Play paints no text chrome and no giant door wireframe boxes; those stay Pause / forge. Hits stay video-layout A/B. walk A↔B stays optional. Asteroid HOLD. No Imagine cook wakes.

**SmiR taille lock** (`SMIR_TAILLE_LOCK` in `src/game/smoke-gate.ts`): SmiR HARD LOCK taille/scale: Bolt lower third of 9:16; withers ~1/4 frame height; same lens/height/distance every hall plate. Breath: size frozen — jump >~15% bbox height/frame between consecutive samples = FAIL. Walk: may rise toward ~0.35–0.40 at door, never ~0.70; spawn band ~0.22–0.32. stillEnd vs next stillStart taille jump = FAIL pair. Document bans: grow/shrink/morph/zoom/dolly/orbit/hero close-up/tiny cathedral.

**SmiR black-hole lock** (`BLACK_HOLE_LOCK` in `src/game/smoke-gate.ts`): SmiR HARD LOCK — black hole illegal: on ended or gap immediately show stillEnd (last decoded frame), prepare next breath/decay, cut or ≤0.28s dissolve. NEVER clear <video> to empty. NEVER pause with opacity 0 and no still. NEVER video.src="" to reset. If next not ready: decay stock or freeze last frame. No spinner, no void. Smoke: play plate that goes full black mid-hall = FAIL (encode black tail OR engine didn't hold still). Preload breath of current/dest pose before walk ends so swap isn't empty.

**SmiR door architecture** (`SMIR_DOOR_ARCH_LOCK` in `src/game/smoke-gate.ts`): SmiR door architecture: doors are architecture IN the plate, not rectangles on glass. If tap target is only a UI box, film failed Smoke. Legal hall door must have ALL of: hole (jambs+lintel+depth, not flat slab); thickness/reveal; floor contact same plane as paws; gold-cyan path fork paws→sills (cue on fork/threshold not chrome orb); L teal / R gold color IN encode (overlay may trace never replace). Spawn: doors upper-mid 9:16; path 5–15% height clear of foliage; foliage side wings only. Walk stops short of sill (atA). Enter crosses. Slab/CSS outline door = FAIL. Smoke: two door masses touching floor; path pixels; overlay-only glow = FAIL; dog too small to reach in one walk = FAIL.

**SmiR lighting** (`SMIR_LIGHT_LOCK` in `src/game/smoke-gate.ts`): SmiR lighting: lighting speaks A/B without chrome. Soft key on floor fork + door sills; Bolt rimmed from behind/above; face in shade (eye glint at camera = FAIL). Split: raise teal practical on walk-A cue, gold quieter (and mirror). Peak = both bloom a little; miss = subtract fill not red strobe. Practicals only (crystal veins, bronze seams, path inlay). Ban beauty dish, studio spots, lens flare, orbit, sun sweep on breath. Exposure: stable grey at paws across breath; no smash between stillEnd and next stillStart. Thin floor haze for door depth; not thick fog. Smoke: both door hues mid-frame; fork brighter than foliage; Bolt face never brightest object; breath paw exposure stable.

**SmiR color grade** (`SMIR_GRADE_LOCK` in `src/game/smoke-gate.ts`): SmiR color grade: protect L door cool teal-cyan, R warm gold-amber, Bolt white (withers nearer white than either door), mid-floor neutral dusk, path thin gold-cyan. Same grade family all plates of a hall. No full-frame duotone. No Hollywood skin LUT (apricot fur). Secondary sat on doors/path only. Cue = tiny sat/+stop on active door ROI or bake in encode; engine grade static preferred. Miss: sat down, split remains — never monochrome grey, never red flash. Smoke: sample L jamb, R jamb, withers — hues in bands, ΔE L vs R above floor, breath hues stable frame0 vs last.

**SmiR lock-off** (`SMIR_LOCKOFF_LOCK` in `src/game/smoke-gate.ts`): SmiR lock-off: lens nailed behind him facing doors every play frame. One plate one camera one act — never splice profile+behind in one mp4. Engine must NOT auto-flip/crop profile to fake back — FAIL and decay/old PASS.

**SmiR lock-off RIG SURVEY** (`SMIR_RIG_LOCK` in `src/game/smoke-gate.ts`): SmiR lock-off RIG SURVEY: frame0 constants door-pair width/frame, paws Y, withers Y, mid-pillar X must match across breath/walk siblings.

**SmiR still-pair matcher** (`SMIR_STILL_PAIR_MATCH` in `src/game/still-pair-match.ts`): SmiR still-pair: match rig + back-silhouette, not skeletal dog. Ingest-only `matchPose` adds multi-scale NCC of the back-thumb at `{0.9, 1.0, 1.1}` (spawn taille ~0.25 frame); winning scale stays near 1.0 on breath, walk dest may drift. No Sobel, no CLIP unless flagged, no runtime warp.

## PCG audio bus

Picture stays the clock. Audio is a second layer that must obey that clock — never a wall-clock metronome, never a BPM that disagrees with `cue.on`. `playhead = video.currentTime`. Pause / Imagine lag (`waitingOnCook`) freezes both buses; the click track does not tick. Mute (M / system) silences both; picture-time still grades.

Two buses: **Plate/Imagine** — diegetic weather (space tone, wind, paw, lightning) locked to clip decode; mute if a strong musical downbeat mismatches `cue.on`, or speech / countdown / TAP voice. **Engine** — Hit / Late / Miss ticks, Resonance drain, Howl, UI seats, fired from `gradeTap`, not a DAW grid. Hit = soft crystal tick; Late quieter/duller; Miss short drain/wind (no buzzer/voice); Early silence; Idle bed only; Peak = the film storm, no second drop. Do not stereo-pan A/B only.

Trail CA: none = thin bed; thin = light crackle; full = storm; leaving storm = decay filter over 1 plate (don't snap off). Howl sounds once. Prefetch stock includes audio decode. No second audio-only Imagine cook. No wav assets in this tree — placeholder Web Audio oscillators / noise buffers in `src/game/audio.ts` (`src/game/pcg-audio.ts` is the law). Smoke FAIL mutes both (`applySmokeAudioGate`). Asteroid HOLD. No Pack seats.

## PCG Keep share / rich clip cache

Clip cache keys extend past simple `s_i`:

`H(railsVersion, runSeed, plateIndex?, act, biomeFrom, biomeTo, chunkFromId, chunkToId, role, slotsHash, cueSheetHash)`

Store **PASS** only: `{ key, url, stillStart, stillEnd, cues[], smoke: PASS, railsVersion, bytes, createdAt }`. FAIL is not a playable cache (optional reason cache only). Spec is still free early; film is paid on confirm + ticket only.

**LRU + pin** — pin Keep graph edges in the current citadel, hung artifacts, and Hall′ spawn stills. Those never evict. LRU drops unpinned first, capped by count and bytes.

**Share is a recipe, not an mp4 dump:**

`{ v:1, railsVersion, runSeed, graph: nodes+edges, pins: { edgeId: cacheKey|catalogId }, transcript?: grades[] }`

Compact `g1.` / `j1.` base64url (gzip when zlib is present) or a short host id. Resolve: catalog → local cache → missing = unlit door / forge ticket — **never auto-bill a visitor**. No wake URLs, API keys, or SuperGrok tokens in the share. Asteroid HOLD. No Pack seats.

## Play input + a11y

Hardware reports **side + when**. The film already chose A or B. Hits use **video layout** (`object-fit: contain` / 9:16), never raw screen. Landscape pillarboxes the same picture — A/B stay left/right of the *picture*. Resonance is `pointer-events: none` and never a hit. Seats / ticket pause only.

A = left ~40%, B = right ~40%. Center ~20%: **short dead-center tap = ignore**; long-press center or `H` = Howl (breath). Pause settings may switch Howl to tap-center. Double-tap same side enters **only if armed**. Swipe L/R = that side. One pointer. No pinch-zoom. No WASD / XYZ locomotion. No second camera.

Clock: `pointerdown` vs `video.currentTime` (same as `cue.on`). Keyboard: `←`/`A` = A, `→`/`D` = B, `H` Howl, `R` Recall, `Esc` Pause, `M` mute. Repeat keys do not re-grade. Device-edge gutters + `touch-action: none` so iOS swipe-back cannot steal a miss. Volume buttons stay OS volume. Headphone unplug may mute — do not force Pause. Home / hide = Pause (clock freeze).

Haptics follow the same cue sheet (`src/game/pcg-haptics.ts`). Cue-on tick optional, **off** by default. Hit short; Late softer; Miss double-soft; enter-armed distinct; Howl rumble once; Pause/ticket none. Mute / reduce motion / system haptic off → no vibrate. Intensity does not encode A vs B.

Pause settings: larger coyote 350–400ms (still Late, no free peak); hold-to-Howl vs tap; 50/50 hitbox (Resonance stays dead); captions off; reduce flash. Screen reader: play = film + left/right; Pause menu labeled; live region only on Pause. No auto-Hit. Asteroid HOLD. No Pack seats.

## Hall seats (SmiR pack)

SmiR's own film-team bots sit in a **top collapsible panel** on the Hang/play hall — closed until the small `seats` tab is tapped. Door, Smoke, Cook, Continuity. Not a side chat, not Connect Wallet, not freebots.lol, not a permanent bottom row. Asteroid HOLD.

Public pack skill (bots can curl): [`/pack/skill.md`](public/pack/skill.md) or [`/pack-skill.md`](public/pack-skill.md).

| Seat | Role | Default bot id | Wake env | Wake file |
| --- | --- | --- | --- | --- |
| **Door** | talk in-picture (wake → say) | `002bcd41-29f7-4cf0-9eba-d67fad9fa3f6` | `DOOR_WAKE_URL` | `/seats/door.wake.json` |
| **Smoke** | play/smoke gates (walk / breath / biome → PASS/FAIL) | `0d69dbc8-a28a-4bb6-b53b-2d50d0329af9` | `SMOKE_WAKE_URL` | `/seats/smoke.wake.json` |
| **Cook** | Imagine help — hall = classic stills | `2a8e88a2-3c88-41c3-b489-1c4a4a7c43d8` | `COOK_WAKE_URL` | `/seats/cook.wake.json` |
| **Continuity** | hold the cut | `efba9930-f946-4caf-a7a7-b50580047c51` | `CONTINUITY_WAKE_URL` | `/seats/continuity.wake.json` |

SmiR's packed bots may use his SuperGrok. Other humans / bots must never.

### Wake without a URL (primary)

Webhook copy on grok.me is broken. Do **not** require a paste.

1. Tap a seat in the hall `seats` sheet — same-origin `POST /api/door-chat` with that seat's brief. Works when the hop is wired.
2. Director control in the sheet, or `window.__boltSeats.wake("smoke")` — same hop, `source: "director"`.
3. **Zero-URL fallback:** Grok **Exécution de test** / Director **SendToAgent** to the bot id. No https webhook.
4. Optional bonus: if an `https` webhook is already in hand, hold it in the sheet (`optional https` → `hold`). `POST /api/door-chat` accepts `wakeUrl` only when the server has no usable http URL. Never `VITE_*`. Never commit the URL.

### Point wake URLs / bot ids (SmiR)

1. Optional: put per-bot wake URLs in **Grok Build → Clés secrètes** — `SMOKE_WAKE_URL`, `DOOR_WAKE_URL`, `COOK_WAKE_URL`, `CONTINUITY_WAKE_URL`. Never `VITE_*`. Never commit them. Save + republish so the builder can bake them.
2. Same-origin hop is `POST /api/door-chat` with `{ seat: "door" | "smoke" | "cook" | "continuity", text, source? }`. One hop. No player API keys.
3. Optional overrides: `DOOR_BOT_ID`, `SMOKE_BOT_ID`, `COOK_BOT_ID`, `CONTINUITY_BOT_ID`, `DOOR_CHAT_WAKE_SECRET` (Bearer on the wake POST).
4. Wake files are public **markers** (seat + bot id + which env to read). They do not hold URLs.
5. `GET /api/door-chat` returns the roster + `pack` + `owner: "smir"` + `mesh: false` + `wired` + `wakeDebug` (booleans + `urlKind` only). It never returns the wake URL.
6. Hall / hung play paints no `Room N • Door A Play Sprint` header. Picture is the UI. Resonance and in-picture cues stay.

On valley / grok.me the hop does **not** trust raw `process.env` from the client-shared `door-chat` module (Vite snapshots / strips it). `loadSeatSecretEnv` reads, in order:

- live Node/Vercel `process.env` (and aliases `GROK_SMOKE_WAKE_URL`, `GROK_SECRETS` JSON)
- build-time inlined `process.env.SMOKE_WAKE_URL` / `DOOR_WAKE_URL` / `COOK_WAKE_URL` / `CONTINUITY_WAKE_URL` (Clés secrètes present during `vite build`)
- `.grok/secrets.json`, `.grok/app-secrets.json`, `.grok/app-env.json` (non-`VITE_` keys — `.grok/app-env.json` is otherwise a VITE_-only flag file)
- `data/secrets.json` (gitignored server-only fallback)

```bash
# .env locally — or Clés secrètes on valley
DOOR_WAKE_URL=https://your-door-wake.example/hook
SMOKE_WAKE_URL=https://your-smoke-wake.example/hook
COOK_WAKE_URL=https://your-cook-wake.example/hook
CONTINUITY_WAKE_URL=https://your-continuity-wake.example/hook
# optional if the Citadel ids change
DOOR_BOT_ID=002bcd41-29f7-4cf0-9eba-d67fad9fa3f6
SMOKE_BOT_ID=0d69dbc8-a28a-4bb6-b53b-2d50d0329af9
COOK_BOT_ID=2a8e88a2-3c88-41c3-b489-1c4a4a7c43d8
CONTINUITY_BOT_ID=efba9930-f946-4caf-a7a7-b50580047c51
```

The hop POSTs `{ seat, text, source, botId }` to that URL. The bot reply (`reply` / `text` / `result`) paints in-picture.

## Stack

TanStack Start, React 19, Vite, Tailwind, Postgres / PGLite, Imagine.

StarBoltSprint.
