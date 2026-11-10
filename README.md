# Choppy Party

A 3D browser party game (Three.js, glossy cartoon style) for 2 to 10 players: local on one screen, online with room codes, or both at once. Gamepads (any standard pad via the Gamepad API) and keyboards are supported.

Design doc (all 30 planned minigames, stack, architecture): https://claude.ai/artifact/47BsotP3fLpMUh3W5wRCHP

## Run it

```bash
npm install
npm run dev          # Vite on http://localhost:5173 + room server on :8787
npm test             # game logic tests
npm run build && npm start   # production: one Node process serves the game and rooms on :8787
```

## Controls

| Input | Move | A | B |
| --- | --- | --- | --- |
| Gamepad | Left stick or d-pad | Bottom face button | Right face button |
| Keyboard 1 | WASD | Space | Left Shift |
| Keyboard 2 | Arrows | Enter | Right Shift |

In the lobby, press A on any device to join and B to leave. The first player is the host: Left/Right picks a game or party mode, Up/Down sets the number of rounds, A starts.

## Modes

From the main menu: **Party Boards** (roll the dice block, race around a board, buy crowns for 20 coins, a minigame after every turn), **Minigame Mix**, **Free Play** and **Play Online**.

| Board | Best for | Gimmick |
| --- | --- | --- |
| Lantern Hollow | 4-6 players | Event spaces swap day and night, opening different routes; pay the Wisp to rob the leader |
| Cosmo Junction | 6-8 players | Laser Lane through the middle counts down and blasts coins off anyone in it; warp pads |
| Gold Rush Gulch | 8+ players | Two crowns at once, steam train between stations, gold-or-dynamite mine shafts |

The lobby picks the best board for your head count automatically; the host can still change it.

## Online

Click **Host online** to open a room; share the 4-letter code or the `?room=CODE` link. Each browser can bring up to 4 local players. The server runs every round (30 ticks/s) and sends snapshots; browsers send inputs and draw, blending between snapshots. A dropped browser can reload the link and pick its players back up.

## Layout

- `src/shared/types.ts` minigame interface and input types
- `src/shared/party.ts` party flow: lobby, intro, play, results, final scores
- `src/shared/games/` one file per minigame; register new ones in `games/index.ts`
- `src/shared/board/` board mode: layouts (`boards.ts`), rules (`engine.ts`)
- `src/client/` input manager, local and online sessions, menu HUD screens
- `src/client/three/` 3D renderer: stage, the Choppy character model, and one 3D view per minigame in `views/`
- `src/server/server.ts` WebSocket room server and static file server

## Adding a minigame

Implement `Minigame` (setup, step, isOver, results, and a 2D HUD `draw`), add a 3D view in `src/client/three/views/` and register it in `GAME_VIEWS`, keep state plain JSON, use the seeded RNG in `src/shared/rng.ts` for randomness, and add it to `GAMES`. The tests in `tests/games.test.ts` automatically check every registered game finishes, ranks every player, is deterministic and survives a JSON round trip.
