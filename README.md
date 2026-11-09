# Sundered Crowns

An original grand strategy game set in historical Europe, from 1 January 1356 to 31 December 1815 (a second start in 1492).
The map is drawn with WebGPU, and a deterministic TypeScript simulation runs in a Web Worker. There is a single-player
campaign, and a persistent online world runs on its own server. The world clock runs at 36 s per game day, so a
season lasts about 10 weeks. Nothing can be bought that gives an advantage.

## Run locally
```
npm install
npm run dev        # browser game at http://localhost:5173 (Chrome or Edge with WebGPU)
npm run world      # optional: world server at ws://localhost:8787 (DEV login by display name when Supabase is not set)
```
Single player needs no backend. Without Supabase settings, the online panel says that it is not configured, and the
game stays fully playable.

## Controls
| Input | Action |
|---|---|
| Left click | Select a location, army or fleet (Shift adds armies to the selection) |
| Right click | Move the selected armies or fleets there |
| Drag, WASD, arrow keys | Pan the map |
| Mouse wheel, + / − | Zoom |
| Space | Pause and resume (single player) |
| Numpad + / − | Speed 1–5 (single player) |
| 1 … 0 | Map modes: political, terrain, diplomatic, development, population, culture, faith, trade, unrest, control |
| E / G / Shift+D / M / B / K / U / J / L / C / V | Economy, government, diplomacy, military, works, knowledge, society, decisions, ledger, chronicle, victory |
| H | Hide the interface (photo mode) |
| F5 | Quick save (the autosave interval is set in the settings: 1 to 24 months) |
| F2 | Developer panel (trigger events, switch a realm's AI, fast-forward, performance) |
| Esc | Close the panel, then the selection, then open the pause menu |

Every key except the map's camera keys can be rebound under Settings → Key bindings (conflicts are marked, defaults
can be restored); the tooltips show the keys as set. The settings also hold the colour-blind palette, high-contrast
borders, the resolution scale and opt-in browser notifications.

Hover over a number in the top bar or the panels to see where it comes from.

## Architecture (short)
- `src/sim/`: the simulation. It uses a seeded RNG and a fixed system order (politics, progress, society, economy,
  military, war, diplomacy, colonial, realm, situations, goals, events, AI), and the same input gives the same state
  hash. Content (laws, values, events, situations, peoples, names) lives in `src/sim/content/`.
- `src/game/`: the worker protocol and the view models for the UI.
- `src/render/`: the WebGPU map. It draws terrain from elevation, water, borders, names, armies and map modes.
- `src/ui/`: the Preact interface.
- `src/online/`: the online client, the wire protocol and achievements.
- `server/`: the world server. It runs the same simulation, applies commands at day boundaries, writes snapshots
  and a command log, and recovers after a restart.
- `supabase/migrations/`: tables, Row Level Security and storage for accounts, cloud saves, worlds, seats,
  leaderboards, chat and offers.
- `tools/geo/`: the map pipeline (Natural Earth and elevation tiles to `public/map`). `tools/history/` holds the
  1356 setup. `tools/sim/` holds the headless runs and the observer test.

More detail is in `docs/ARCHITECTURE.md` and `docs/DATA_SCHEMA.md`.

## Tests and checks
```
npx vitest run                         # all tests: acceptance (point 119), RLS on all migrations, world server replay, auth
npm run test:accept:slow               # determinism over 50 in-game years
npm run smoke:online                   # two clients against a running world server (start it with npm run world:fast)
npx tsx tools/sim/observer.ts 1600     # AI-only run 1356–1600 with a report and owner maps
npx tsx tools/load_test.ts             # 100 bot players against a world server (see the header of the file)
```

## Deploy
Step by step for Supabase, Vercel and Fly.io: `docs/DEPLOY.md`. The final report is in `docs/REPORT.md`.
