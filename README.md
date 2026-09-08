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
- **Vault** — coffre. Continue, Shift, pick a room, Hang A / Hang B.
- **Keep** — sign in so the hall is yours.

Stock sprint mp4s are not in this tree (too heavy). Stills, UI, and Imagine CDN clips are.

## PCG rail 1

New citadel / Play mint a run seed `s` and Keep persists it with the citadel. Plate clips key as `s_i = H(s, i, act, biome)`. Enter clips key as `s_enter = H(s, i, enter, from, to, door)`. The clip cache reuses those keys before any Imagine recook. Walk-toward-door speculation never calls Imagine. Asteroid HOLD.

## PCG rail 2

Door glow in the picture: **walk-ready** (tap to walk) vs **enter-ready** (second, faster pulse) only when `s_enter` is a cache hit or a stock bridge exists for that from→to pair. No enter-ready pulse → double-tap stays idle/breath and never calls Imagine. Double-tap / enter plays the cached clip or stock only. Graph commits Hall′ only after that clip exists (PASS). Paid enter cook is an explicit Forge / ticket confirm — never walk-toward-door. Stock enter mp4s are not shipped; `registerStockBridge` is the library hook (play stock or refuse, never spin). Asteroid HOLD. No Pack seats expansion.

## PCG rail 3

Citadel is a graph, not a map. A grammar grows **pins** from run seed `s` + momentum; `compileCitadel` still realizes the walks. Hall → Door A + Door B (never one gate). Room —enter→ Hall′ only after a rail-2 clip, and the biome tag may change only on that enter. Dead-end → breath/idle, no rewrite. Legendary relic pin only when momentum ≥ τ — an extra pin, not a third front door. Manual Hang / Load pins win. Asteroid HOLD. No unpaid Imagine. No Pack seats expansion.

## PCG prompt grammar

Every Imagine plate is two layers: **rails** (terminals — camera, Bolt, lens, chrome ban, gold-cyan path; never sampled) then **slots** (biome / act / fork / trail / floor / leftover / fromTo / still / destStill / seed) from tiny enums only. `assemblePrompt(slots)` fills the template; the linter checksums rails, blocks morph / banned flavor / missing lock, and fails → stock, no Imagine. Player voice maps Rome→ember, Mars→asteroid, space→asteroid, or one short flavor clause — never camera or body. Graph pins stay in `pcg-grammar.ts` (rail 3). Asteroid HOLD. No Pack seats expansion.

## PCG role-WFC

1D time-strip of plate-roles — not a 2D map, not STWFC T×Y×X. WFC collapses the ~60s bone (5–8 plates). Neighbors are **time**. Roles (`calm | lean-L | lean-R | fork | peak | decay | breath | enter`) unlock prompt slots only; never free-text Imagine. Quiet 0–8s cannot be peak|enter. Peak only if t≥45s and momentum ≥ τ. Trail never jumps none→full. Contradiction → decay + stock, never a spinner. Every sample is `H(s, cell, observe)`. Offline New Citadel preview may still `collapseStrip` from 0 with seed `s`. Asteroid HOLD. No Pack seats.

**Online + tap-as-observe** is required so miss/idle can kill a peak already in the future domain — otherwise the EDPCG curve lies. Before Play: window bans, collapse cell 0 to calm|breath, propagate. After plate `i`, `applyTapObserve(strip, i, tap, m, pictureTime)` bans what the act forbids (miss → peak off i+1 and i+2 + decay boost; idle → peak+fork off i+1; clean + m≥τ + picture-time in the peak window → keep peak). Then `advanceOnline` observes the lowest-entropy uncollapsed cell (prefer i+1 if tied) and propagates. Picture-time is the sum of played plate durations — never `Date.now()`. Partial cook: Imagine only for a confirmed (collapsed) plate. Live empty i+1 → force decay; if decay is banned → breath stock; never pause the picture.

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
