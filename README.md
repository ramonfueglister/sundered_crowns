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
npm run economy:build   # the economy engine (WebAssembly); needs the Rust toolchain, https://rustup.rs
npm run world      # world server at ws://localhost:8787 (DEV login by display name when Supabase is not set)
npm run dev        # the client at http://localhost:5173 (a browser with WebGPU)
```

## Layout
- `src/sim/`: the world, shared by server and client. `world.ts` is the static map, `state.ts` the changing state
  (entity tables of typed arrays, `ecs.ts`), `schedule.ts` the tick and the order of systems, `systems/` the systems,
  `commands.ts` how players change the world, `snapshot.ts` the binary snapshot and its hash.
- `src/net/`: the wire protocol, the views the server sends, and the browser's connection.
- `src/worldprobe/`, `src/lookprobe/`: the WebGPU world (the voxel world from afar down to the houses).
- `src/ui/`: the Preact interface.
- `economy/`: the economy engine, a Rust shell around the port of BeforeIT.jl (`economy/vendor/port-beforeit`, kept in
  the repository since its own repository is gone), built to WebAssembly
  (`npm run economy:build`; needs the Rust toolchain). `data/economy/` holds its calibration table.
- `server/`: the world server (`world.ts` core, `log.ts` the log entries and their replay, `files.ts` snapshots and log
  on disk, `backup.ts` the copy of the world in the store, `history.ts` the history of the borders for the replay,
  `rulers_copy.ts` the readable copy of the rulers, `config.ts` settings, `session.ts` connections, `main.ts`
  WebSocket transport, `auth.ts`, `store.ts` for Supabase).
- `supabase/migrations/`: accounts, worlds and seats with Row Level Security.
- `tools/geo/` builds the map, `tools/history/` the start setups.

How to work in this repository (checks before a pull request, layout, file size, the piece key): [CLAUDE.md](CLAUDE.md).
More: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATA_SCHEMA.md](docs/DATA_SCHEMA.md), [docs/DEPLOY.md](docs/DEPLOY.md).

## Tests
```
npx vitest run     # foundation, economy, world server replay and resume, auth, Row Level Security of all migrations
npm run typecheck
npm run lint       # Biome: lint rules everywhere, layout in the folders already formatted (biome.json); then
                   # the budgets: no file gets more lint or more lines than it had (tools/check/budgets.ts)
ruff check && ruff format --check   # the Python tools (ruff.toml; pip install ruff==0.17.4)
(cd economy && cargo test --release --locked)   # the shell around the port
(cd economy && cargo fmt --check && cargo clippy --all-targets -- -D warnings)   # its layout (rustfmt.toml) and clippy
```
`npm run format` lays out the folders listed in the `overrides` of `biome.json`; the rest is taken in folder by folder,
when no open pull request changes it. CI (`.github/workflows/ci.yml`) runs the types, the lint, the Rust checks of `economy/` and the tests.
The tests build the economy engine first and need the Rust toolchain (https://rustup.rs; the compiler version is
fixed in `economy/rust-toolchain.toml`). The world server image builds the engine itself.
