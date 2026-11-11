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

## Online play (peer-to-peer)

Online rooms need no server of our own. **Host a Room** turns the host's browser into the room: it runs the game and everyone else connects straight to it over WebRTC. The free PeerJS service only introduces the browsers to each other, using the room code. So the game works from any static host, such as GitHub Pages (`.github/workflows/pages.yml` deploys it on every push to `main`).

- **Joining:** use **Join a Room** and type the 4-letter code, or open `…/?room=ABCD`.
- **Dropped connections:** a Normal CPU plays for anyone who drops mid-game. Typing the same code again in the same browser gives them their seat back.
- **Host reloads:** if the host's page reloads, it reopens the same room from a save made every 2 seconds. Guests reconnect on their own.
- **Strict networks:** about 1 in 10 networks block direct connections, such as school or office Wi-Fi. For those, add a TURN relay in **Play Online → Connection Settings**. The same screen can point at a self-hosted PeerJS server.
- **Limits:**
  - The host's connection carries the whole match, so the host should be on decent internet.
  - The free PeerJS signalling service has no uptime guarantee.
  - Online play doesn't work inside the claude.ai preview, which blocks WebRTC.
- **Server mode:** the old Node room server still works with `?server` (`npm run build && npm start`).

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

## Game feel

Movement is meant to feel bouncy and a little floaty, not rigid. `src/shared/physics.ts` holds the shared rules every minigame can use:

- Snappy start (full speed in about 0.1 s), a short glide when you let go, and a quick turnaround when reversing.
- Floaty jumps: a strong kick, low gravity near the top of the arc for hang time, slightly heavier fall, and a small bounce on landing.
- Springy bumps: players knock each other back harder than a plain collision and pop up off the ground on big hits.
- Characters squash on landing and stretch on the way up, hop a little with every step, and bounce in when they appear. Board spaces dip and spring back when someone lands on them.

Coin Cloudburst uses jumps to clear bomb blasts; in Shrinking Rink you're only out once you land over the water.

Sound effects are synthesized with WebAudio (`src/client/sfx.ts`); `src/client/juice.ts` watches snapshots to play them and throws confetti on the results screens.

## Art

Water and sand use two CC BY 4.0 models (credits in `public/tex/CREDITS-sea-and-sand.txt`): the sea animation is baked from "Sea part" by Ayberk Tosunoglu, and the sand ripples come from "Desert Landscape" by Šimon Ustal.

The board dice are "Dice" by Geug (CC BY 4.0, https://sketchfab.com/3d-models/dice-4091e2ef8de54644a5ab68a646d8d9ca), simplified and recoloured (credit in `public/models/misc/CREDITS-dice.txt`).
The turn-order die is "12 sides Dodecahedron Dice" by CdR (CC BY 4.0, https://sketchfab.com/3d-models/12-sides-dodecahedron-dice-afbcd0424fa7475d8d24141c6d88c052), simplified and recoloured (same credits file).

3D models are from Kenney's CC0 kits (Platformer, Mini Characters, Pirate, Mini Forest, Prototype) in `public/models`, with their license files. The 10 playable characters are listed in `src/shared/players.ts`.

## Online

Click **Host online** to open a room; share the 4-letter code or the `?room=CODE` link. Each browser can bring up to 4 local players. The server runs every round (30 ticks/s) and sends snapshots; browsers send inputs and draw, blending between snapshots. A dropped browser can reload the link and pick its players back up.

## Layout

- `src/shared/types.ts` minigame interface and input types
- `src/shared/party.ts` party flow: lobby, intro, play, results, final scores
- `src/shared/games/` one file per minigame; register new ones in `games/index.ts`
- `src/shared/physics.ts` shared bouncy movement, jumps and bumps
- `src/shared/board/` board mode: layouts (`boards.ts`), rules (`engine.ts`)
- `src/client/` input manager, local and online sessions, menu HUD screens
- `src/client/three/` 3D renderer: stage, the Choppy character model, and one 3D view per minigame in `views/`
- `src/server/server.ts` WebSocket room server and static file server

## Adding a minigame

Implement `Minigame` (setup, step, isOver, results, and a 2D HUD `draw`), add a 3D view in `src/client/three/views/` and register it in `GAME_VIEWS`, keep state plain JSON, use the seeded RNG in `src/shared/rng.ts` for randomness, and add it to `GAMES`. The tests in `tests/games.test.ts` automatically check every registered game finishes, ranks every player, is deterministic and survives a JSON round trip.

## Pack-based minigames (wave 2)

Built around the Kenney packs:

- **Meteor Shower** (Space Kit): dodge meteors on a moon base, three hearts, craters slow you down.
- **Present Pile-Up** (Holiday Kit): time your drop to stack the swinging gift; misses knock gifts off.
- **Graveyard Shift** (Graveyard Kit): collect candles at night while ghosts rise from the graves.
- **Train Hop** (Train Kit): grab coins on the rails, get off the track when the signal flashes.

The logo (`public/logo.png`) has a transparent background and shows on the title, loading and main menu screens.
