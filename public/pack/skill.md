# Bolt valley pack — SmiR seats

SmiR's own bots sit on this valley Bolt Engine to help. Dan / freebots-style *pattern*: bots sit on HIS engine. They do **not** join freebots.lol or any public mesh.

`GET /api/door-chat` · `GET /pack/skill.md` · `GET /pack-skill.md`

## SuperGrok

SmiR's packed bots may use his SuperGrok. Other humans and other bots must never. No player API keys. No `VITE_*` wake URLs. No Connect Wallet.

## Roster (four seats)

| Seat | Role | Bot id | Brief | Wake env |
| --- | --- | --- | --- | --- |
| **Door** | say | `002bcd41-29f7-4cf0-9eba-d67fad9fa3f6` | `say` | `DOOR_WAKE_URL` |
| **Smoke** | gate / testing | `0d69dbc8-a28a-4bb6-b53b-2d50d0329af9` | `walk / breath / biome` | `SMOKE_WAKE_URL` |
| **Cook** | cook | `2a8e88a2-3c88-41c3-b489-1c4a4a7c43d8` | `hall stills · classic` | `COOK_WAKE_URL` |
| **Continuity** | continuity | `efba9930-f946-4caf-a7a7-b50580047c51` | `hold the cut` | `CONTINUITY_WAKE_URL` |

Wake files are markers only (`/seats/{seat}.wake.json`). They never hold URLs.

Scenario / Gamify seats later. Asteroid HOLD.

## Wake — no URL required

Webhook copy on grok.me is broken. Do **not** wait on a paste.

1. **Hall seat tap** — open the top `seats` sheet, tap Door / Smoke / Cook / Continuity. Same-origin `POST /api/door-chat` with that seat's brief. When the hop is wired, the bot wakes.
2. **Director control** — tap `director` in the sheet (defaults to Smoke), or `window.__boltSeats.wake("smoke")`. Same hop, `source: "director"`.
3. **Zero-URL fallback** — Cursor / Grok **Exécution de test** / Director **SendToAgent** to the bot id. No https webhook. This is the path when Clés secrètes never bake.
4. **Optional bonus** — if an `https` webhook is already in hand, hold it in the sheet. `POST /api/door-chat` accepts `wakeUrl` only when the server has no usable http URL. Never required.

```bash
curl -sS https://YOUR-VALLEY/pack/skill.md
curl -sS https://YOUR-VALLEY/api/door-chat
# Director-triggered smoke (same-origin hop when wired)
curl -sS -X POST https://YOUR-VALLEY/api/door-chat \
  -H 'content-type: application/json' \
  -d '{"seat":"smoke","text":"walk / breath / biome","source":"director"}'
```

Unwired hop returns `{ ok:false, error:"wake-unwired", fallback:"Exécution de test / Director SendToAgent" }`. That is the cue to SendToAgent — not to hunt a webhook.

## Imagine cook

- **Hall** = classic stills (`grok-imagine-image-2.0`). Keep SHOT_REJECT / COAT_LOCK / SCALE_LOCK on the lead.
- **Biomes** = Imagine video **1.5 later** (`grok-imagine-video-1.5`). Do not flip hall stills to 1.5.
- Cook sits on the engine to help. Cook does not take a player key. Continuity holds the cut (same Bolt, same coat, Asteroid HOLD).

## Not this pack

Foreign bots. freebots.lol mesh. Connect Wallet. Player `XAI_API_KEY`. Scenario / Gamify. Asteroid as a living-hall title.
