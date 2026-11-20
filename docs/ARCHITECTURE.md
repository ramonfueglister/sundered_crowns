# Architecture

## One world, one authority
The world server (`server/world.ts`) holds the only true state. Clients send commands and receive what changed; they
never simulate. The world has no end date: it runs one day per `SECONDS_PER_DAY` for as long as the server runs.

## State as entity tables (ECS)
- **Entities** are row numbers. Places are the fixed rows 0 … L − 1 of the map; realms (and later population groups,
  firms, markets, routes) live in tables (`src/sim/ecs.ts`) whose rows are reused when an entity goes. Persons and
  families (`state.person`, `state.family`, docs/PEOPLE_DESIGN.md) are the exception: their rows are never freed, so a
  person id stays the same person for ever (parents, families and portraits point at it).
- **Components** are dense typed arrays, one per property (`state.place.owner`, `state.realm.cols.capital`, …). Strings
  sit in plain arrays beside a table (`realmText`).
- **Systems** (`src/sim/systems/`) are functions that run in a fixed order once per day (`src/sim/schedule.ts`).
  Work that covers every place is spread over `SHARDS` days (each place once per cycle), so every day costs about
  the same.
- The state is plain data. `src/sim/snapshot.ts` writes it as a JSON skeleton plus one binary block of all arrays; the
  bytes are deterministic, and their hash identifies a state.

## Determinism and persistence
Everything that changes the state is a log entry (`cmd`, `claim`, `release`), applied in order and appended to the
command log between day markers. Snapshots are written every `SNAPSHOT_EVERY_DAYS`; on start the server loads the
latest and replays the log after it. `verifyReplay` checks that a snapshot plus the log reproduces the live state.
A copy of the latest snapshot and of the log since it goes to Supabase Storage (`server/backup.ts` sends it through
`server/store.ts`); a server that starts on an empty disk resumes from that copy (`restoreFromStore`). The rulers have a readable copy in the
tables `world_persons` and `world_reigns` (`server/rulers_copy.ts`), which the simulation never reads.
Randomness comes only from the seeded generator in the state (`src/sim/rng.ts`), from `hash01` of ids, or from the
generator inside the state of an economy (below).

## The economy engine
Economies are computed by the port of BeforeIT.jl (github.com/ramonfueglister/port-beforeit), unchanged and
pinned to one commit. `economy/` is a Rust shell around it, built to one WebAssembly file
(`build/economy/sc_economy.wasm`: `npm run economy:build`, or the Rust stage of `server/Dockerfile`). The shell also
holds the model type of the daily clock (`economy/src/clock.rs`), which replaces two rules of the port through the
port's own mechanism for model types. `src/sim/economy/engine.ts` loads the file. The result of a call depends on
nothing but its arguments: the state of an economy is a block of bytes in the state of the world (`state.economy`),
and a period maps bytes to bytes. (The engine remembers the economy of the bytes it handed out last, to save decoding
them again on the next day; it uses it only for exactly those bytes.) So the economy is in every snapshot and in its
hash, and replays like everything else. Its random numbers come from the port's own generator, whose state is part of
those bytes. `src/sim/systems/economy.ts` computes one period for each day of the world (docs/ECONOMY_DESIGN.md,
features 3 to 5).

The economies of the game are those of its largest cities: one economy of the port per place with a city, all in one
block of bytes together with the merchants that carry goods between them (`economy/src/trade.rs`, which stands in for
the port's rule of the rest of the world; `state.economy.cities`). `public/data/economy_cities.json` holds the
parameters and the starting position of every city (`npm run economy:calibrate`). The engine takes the list of
cities, computes a day of all of them in one call, and gives figures and checks per city.

## Commands
`src/sim/commands.ts` keeps one definition per command kind: a check that names the reason when it cannot be done,
and an effect. Players and the AI of realms without a player use the same commands.

## Client
`src/net/client.ts` keeps the server's messages as signals; `src/ui/` draws them. The world view (`src/worldprobe/view.ts`,
under `src/ui/WorldView.tsx`) gets the owners of all places as one binary frame at sign-in and the changes each day.
