# Sundered Crowns

A persistent online world in historical Europe, starting on 1 January 1356. One authoritative world server runs the
world without end; players sign in, take up the crown of a realm and rule it. Realms without a player will be played
by an AI.

**State of the rebuild (November 2026):** all earlier game systems and the single-player game were removed. What is
left is the foundation: the map, the 1356 start setup, a data-oriented (ECS) state with a fixed tick order, the
persistent world server with snapshots and a command log, and a lean client. The economy is being designed topic by
topic before it is built: [docs/ECONOMY_DESIGN.md](docs/ECONOMY_DESIGN.md).

## Run locally
```
npm install
npm run world      # world server at ws://localhost:8787 (DEV login by display name when Supabase is not set)
npm run dev        # the client at http://localhost:5173 (a browser with WebGPU)
```

## Layout
- `src/sim/`: the world, shared by server and client. `world.ts` is the static map, `state.ts` the changing state
  (entity tables of typed arrays, `ecs.ts`), `schedule.ts` the tick and the order of systems, `systems/` the systems,
  `commands.ts` how players change the world, `snapshot.ts` the binary snapshot and its hash.
- `src/net/`: the wire protocol, the views the server sends, and the browser's connection.
- `src/render/`: the WebGPU map.
- `src/ui/`: the Preact interface.
- `server/`: the world server (`world.ts` core, `main.ts` WebSocket transport, `auth.ts`, `store.ts` for Supabase).
- `supabase/migrations/`: accounts, worlds and seats with Row Level Security.
- `tools/geo/` builds the map, `tools/history/` the start setups.

More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATA_SCHEMA.md](docs/DATA_SCHEMA.md), [docs/DEPLOY.md](docs/DEPLOY.md).

## Tests
```
npx vitest run     # foundation, world server replay and resume, auth, Row Level Security of all migrations
npm run typecheck
```
