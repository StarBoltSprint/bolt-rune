# PCG anti-3D / film-strip laws

Bolt Rune has a strip of films, not a volume you stand in. If a technique needs coordinates, collision, or a ticking world sim, throw it out.

The README holds the refuse table, steal table, and smell tests. This note is the deeper map onto the rails. Asteroid HOLD. No Pack seats expansion.

## One source of truth

**Graph + clips.** Camera is a sentence (`LOCKED-OFF CAMERA` in the prompt rails). Move is an act enum (`walk-A` / `walk-B` / `breath` / `enter` / `decay`). Imagine is a renderer of a filled template, never a dungeon master.

| Layer | File | Job |
| --- | --- | --- |
| Run seed + clip keys | `src/game/pcg-rail.ts` | `s`, `s_i`, `s_enter`, cache before recook |
| Enter-ready / Hall′ | `src/game/pcg-rail.ts` | Stock or cache only; no Imagine on double-tap |
| Graph pins | `src/game/pcg-grammar.ts` | Hall → Door A + Door B; relic if `m` high |
| Prompt slots + linter | `src/game/pcg-prompt.ts` | Rails + enums; fail → stock |
| Picture-time | `src/game/pcg-rail.ts` | `pictureTimeMs` / `picturePhase` / `mayPeak` |
| 1D time-WFC | `src/game/pcg-wfc.ts` | Roles on time cells; tap-as-observe |
| Prefab chunks | `src/game/pcg-chunk.ts` | Hang wins; bridge stitch on rail 2 |
| Play-loop / cue sheet | `src/game/pcg-play.ts` | `gradeTap` / picture-time / Howl / Recall / Pause |
| Citadel pose SM | `src/game/pcg-pose.ts` | spawn/atA/atB · breath loops · pose on ended · arm on Hit |
| Plate transition | `src/game/transition.ts` | double-buffer + WAAPI · cut / dissolve≤280ms / hold 80ms / decay no fade |
| Preload | `src/game/preload.ts` | next probable PASS only · 4 slots · take→dissolve · never Imagine |
| Picture-time audio | `src/game/pcg-audio.ts` | Plate + engine buses; pause/mute; grade one-shots |
| Play input / haptics / a11y | `src/game/pcg-input.ts` | Video-layout A/B; same cue sheet; no XYZ / WASD |
| EDPCG density / awakening | `src/game/pcg-density.ts` | `smoothstep(m) * noise(s, pictureTime)` → cook slots |
| Smoke ship-gate | `src/game/smoke-gate.ts` | PASS/FAIL before Hang / cache / enter; spawn behind; still-pair; void; `railsVersion` `bolt-1` |
| Play chrome | `src/game/play-chrome.ts` | Play = no SEATS/FILMS/ROOMS/REFS; video-layout A/B hits only |
| Smoke taille / black hole | `src/game/smoke-gate.ts` + `transition.ts` | SmiR taille lock; never empty video; hold stillEnd on ended/gap |
| Smoke door / light / grade | `src/game/smoke-gate.ts` | Architecture in plate; lighting A/B; L teal R gold; lock-off no splice; RIG SURVEY |
| Still-pair pixel match | `src/game/still-pair-match.ts` | Ingest-only `matchPose`: rig + back-silhouette, not skeletal dog |
| Rich cache + LRU pin | `src/game/pcg-rail.ts` | PASS rows only; Keep edges / hung / Hall′ stills never evict |
| Keep share recipe | `src/game/pcg-share.ts` | Graph + pin keys; visitor never auto-billed |

1D role-WFC neighbors are **time**, not floor tiles. Voxel WFC / STWFC T×Y×X does not belong here.

## Picture-time

```
pictureTime = Σ played plate durations
phase      = (pictureTime / 60s bone) × momentum m
peak       = phase window (45–90s) AND m ≥ τ
relic      = same gate as peak
```

`pictureTimeMs(playedPlates)` sums milliseconds. It does not call `Date.now` or `setTimeout`. Pause the film — add no plate — picture-time does not move.

Score is Resonance `m` only (`SCORE_LAW`) — no points, combo chrome, or leaderboard. Enter PASS sets m low (Hall′ quiet). Keep is `{ seed, nodes, edges }` (`KEEP_LAW`); plates resolve PASS→play / ticket→cook-decay / else decay (`CLIP_LIBRARY_LAW`). Idle rates 0.95/0.98/0.99/0.93; trail hysteresis 0.70 down / 0.75 up. EDPCG writes next-plate domain only (`EDPCG_LAW`). WFC weights never revive banned tiles (`WFC_WEIGHT_LAW`).

Four nested clocks (`NESTED_CYCLES_LAW`) — do not mix: micro plate (6–15s) does not change the room alone; room poses loop breath without a mandatory peak; bone ~60s picture-time (WFC+m+CA) may permit peak on the same A/B; citadel graph enter is the only Hall′ hop and always respawns breath-spawn. One tap crosses one level.

Breath plates **always loop** until walk / Howl / Pause / enter. Never play-once-then-freeze last frame. `walk-spawn-A` ended plays looping `breath-A` (`video.loop=true`); a breath lap replays the same pose and must not recook, arm, raise `m`, advance WFC, or use wall-clock. Idle-decay is NOT a miss: `m · 0.95^Δt` per media second on breath|decay (`tickIdleDecay`), not per lap or frame. Howl is intentional breath (`howlPose`): clock runs, armed off, same pose / `walkFrom` if mid-walk — not Pause, not miss, not Recall −0.05. Hall entry is always spawn + looping `breath-spawn` (`beginPose` / `resetForNewHall`); Continue is breath on the saved pose, never a mid-cut walk. Doors are plan sides + arm state (`DOOR_LAW`), never meshes or a third hitbox. Pose lives in `pcg-pose.ts` and advances only on plate ended.

Every plate change goes `planTransition` → `runTransition` → play (`src/game/transition.ts`). `goTo` never assigns `video.src`. Double buffer: prepare incoming before fade, `commitIncoming` is an opacity + pointer flip. One WAAPI opacity anim — no 8-step `setTimeout`. Same still or breath→breath same pose is a cut; dissolve ≤ 280ms (`prefers-reduced-motion` → 80ms); decay holds with no fade; missing clip or Smoke FAIL decays with no spinner. Howl / Pause abort the fade. Prefetch arrival breath on walk tap. A popping join means last frame of walk-A ≠ frame 0 of breath-A — dissolve cannot fix a bad encode.

**Spawn / play chrome:** spawn is a lock-off behind still. Mood and profile plates are Vault refs only — Smoke FAIL if they try to be breath-spawn (face-on hero spawn = FAIL). Hang / play library accept requires still-pair when `stillStart` / `stillEnd` are present (`stillEnd(walk) ≈ stillStart(breath dest)`, `stillStart(walk-spawn-*) ≈ stillStart(breath-spawn)`); fail closed on the authoring path. Mid-clip near-black frames FAIL. Play paints no text chrome. Pause / forge may show SEATS/FILMS/ROOMS/REFS. Hits are video-layout A/B, not Imagine-baked rectangles. Pose SM is unchanged; walk A↔B stays optional.

`Date.now` that remains elsewhere is not this clock:

- run-seed / artefact **ids**
- clip-cache **LRU** stamps
- Keep / auth **updated** fields

Those must never drive peak, relic, or phase.

SmiR HARD LOCK taille/scale: Bolt lower third of 9:16; withers ~1/4 frame height; same lens/height/distance every hall plate.

Breath: size frozen — jump >~15% bbox height/frame between consecutive samples = FAIL.

Walk: may rise toward ~0.35–0.40 at door, never ~0.70; spawn band ~0.22–0.32.

stillEnd vs next stillStart taille jump = FAIL pair.

Document bans: grow/shrink/morph/zoom/dolly/orbit/hero close-up/tiny cathedral.

SmiR HARD LOCK — black hole illegal: on ended or gap immediately show stillEnd (last decoded frame), prepare next breath/decay, cut or ≤0.28s dissolve.

NEVER clear <video> to empty. NEVER pause with opacity 0 and no still. NEVER video.src="" to reset.

If next not ready: decay stock or freeze last frame. No spinner, no void.

Smoke: play plate that goes full black mid-hall = FAIL (encode black tail OR engine didn't hold still).

Preload breath of current/dest pose before walk ends so swap isn't empty.

SmiR door architecture: doors are architecture IN the plate, not rectangles on glass. If tap target is only a UI box, film failed Smoke.

Legal hall door must have ALL of: hole (jambs+lintel+depth, not flat slab); thickness/reveal; floor contact same plane as paws; gold-cyan path fork paws→sills (cue on fork/threshold not chrome orb); L teal / R gold color IN encode (overlay may trace never replace).

Spawn: doors upper-mid 9:16; path 5–15% height clear of foliage; foliage side wings only.

Walk stops short of sill (atA). Enter crosses. Slab/CSS outline door = FAIL.

Smoke: two door masses touching floor; path pixels; overlay-only glow = FAIL; dog too small to reach in one walk = FAIL.

SmiR lighting: lighting speaks A/B without chrome. Soft key on floor fork + door sills; Bolt rimmed from behind/above; face in shade (eye glint at camera = FAIL).

Split: raise teal practical on walk-A cue, gold quieter (and mirror). Peak = both bloom a little; miss = subtract fill not red strobe.

Practicals only (crystal veins, bronze seams, path inlay). Ban beauty dish, studio spots, lens flare, orbit, sun sweep on breath.

Exposure: stable grey at paws across breath; no smash between stillEnd and next stillStart. Thin floor haze for door depth; not thick fog.

Smoke: both door hues mid-frame; fork brighter than foliage; Bolt face never brightest object; breath paw exposure stable.

SmiR color grade: protect L door cool teal-cyan, R warm gold-amber, Bolt white (withers nearer white than either door), mid-floor neutral dusk, path thin gold-cyan.

Same grade family all plates of a hall. No full-frame duotone. No Hollywood skin LUT (apricot fur).

Secondary sat on doors/path only. Cue = tiny sat/+stop on active door ROI or bake in encode; engine grade static preferred.

Miss: sat down, split remains — never monochrome grey, never red flash.

Smoke: sample L jamb, R jamb, withers — hues in bands, ΔE L vs R above floor, breath hues stable frame0 vs last.

SmiR lock-off: lens nailed behind him facing doors every play frame. One plate one camera one act — never splice profile+behind in one mp4.

Engine must NOT auto-flip/crop profile to fake back — FAIL and decay/old PASS.

SmiR lock-off RIG SURVEY: frame0 constants door-pair width/frame, paws Y, withers Y, mid-pillar X must match across breath/walk siblings.

SmiR still-pair: match rig + back-silhouette, not skeletal dog.

## Smell tests

- If output is mesh / heightmap / put prop at `(x,y,z)` → wrong engine
- If model can change leg count and clip is accepted → not an engine
- Pause the film — if world still progresses → clock is wrong

## Refuse (named)

Voxel WFC, marching cubes, navmesh, unconstrained diffusion worlds (Imagine as dungeon master), wall-clock spawners (`Date.now` / `setTimeout` for peak/relic), Perlin height/caves, Poisson disk props, LOD streaming cells, physics/ragdoll/IK, billboard HUD, minimap/fog of war, infinite terrain chunking.

Do not add a navmesh. Do not rework Three.js history to become the world.
