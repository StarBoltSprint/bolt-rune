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
| EDPCG density / awakening | `src/game/pcg-density.ts` | `smoothstep(m) * noise(s, pictureTime)` → cook slots |

1D role-WFC neighbors are **time**, not floor tiles. Voxel WFC / STWFC T×Y×X does not belong here.

## Picture-time

```
pictureTime = Σ played plate durations
phase      = (pictureTime / 60s bone) × momentum m
peak       = phase window (45–90s) AND m ≥ τ
relic      = same gate as peak
```

`pictureTimeMs(playedPlates)` sums milliseconds. It does not call `Date.now` or `setTimeout`. Pause the film — add no plate — picture-time does not move.

`Date.now` that remains elsewhere is not this clock:

- run-seed / artefact **ids**
- clip-cache **LRU** stamps
- Keep / auth **updated** fields

Those must never drive peak, relic, or phase.

## Smell tests

- If output is mesh / heightmap / put prop at `(x,y,z)` → wrong engine
- If model can change leg count and clip is accepted → not an engine
- Pause the film — if world still progresses → clock is wrong

## Refuse (named)

Voxel WFC, marching cubes, navmesh, unconstrained diffusion worlds (Imagine as dungeon master), wall-clock spawners (`Date.now` / `setTimeout` for peak/relic), Perlin height/caves, Poisson disk props, LOD streaming cells, physics/ragdoll/IK, billboard HUD, minimap/fog of war, infinite terrain chunking.

Do not add a navmesh. Do not rework Three.js history to become the world.
