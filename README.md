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

## Hall seats (Door + Smoke)

Two Grok Bots sit in the Hang/play hall picture — not a side chat, not Connect Wallet.

| Seat | Role | Default bot id | Wake env | Wake file |
| --- | --- | --- | --- | --- |
| **Door** | talk in-picture (wake → say) | `002bcd41-29f7-4cf0-9eba-d67fad9fa3f6` | `DOOR_WAKE_URL` | `/seats/door.wake.json` |
| **Smoke** | play/smoke gates (walk / breath / biome → PASS/FAIL) | `0d69dbc8-a28a-4bb6-b53b-2d50d0329af9` | `SMOKE_WAKE_URL` | `/seats/smoke.wake.json` |

Cook stays outside (Imagine cook). Asteroid HOLD.

### Point wake URLs / bot ids (SmiR)

1. Put the per-bot wake URL in the **server** env only. Never `VITE_*`. Never commit it.
2. Same-origin hop is `POST /api/door-chat` with `{ seat: "door" | "smoke", text, source? }`. One hop. No player API keys.
3. Optional overrides: `DOOR_BOT_ID`, `SMOKE_BOT_ID`, `DOOR_CHAT_WAKE_SECRET` (Bearer on the wake POST).
4. Wake files are public **markers** (seat + bot id + which env to read). They do not hold URLs.
5. `GET /api/door-chat` returns the roster + `wired` (boolean). It never returns the wake URL.
6. Director/Cook can wake Smoke from the hall picture, or `window.__boltSeats.wake("smoke", "walk / breath / biome")`.

```bash
# .env on valley — example only
DOOR_WAKE_URL=https://your-door-wake.example/hook
SMOKE_WAKE_URL=https://your-smoke-wake.example/hook
# optional if the Citadel ids change
DOOR_BOT_ID=002bcd41-29f7-4cf0-9eba-d67fad9fa3f6
SMOKE_BOT_ID=0d69dbc8-a28a-4bb6-b53b-2d50d0329af9
```

The hop POSTs `{ seat, text, source, botId }` to that URL. The bot reply (`reply` / `text` / `result`) paints in-picture.

## Stack

TanStack Start, React 19, Vite, Tailwind, Postgres / PGLite, Imagine.

StarBoltSprint.
