# Architecture

## One world, one authority
The world server (`server/world.ts`) holds the only true state. Clients send commands and receive what changed; they
never simulate. The world has no end date: it runs one day per `SECONDS_PER_DAY` for as long as the server runs.

## State as entity tables (ECS)
- **Entities** are row numbers. Places are the fixed rows 0 … L − 1 of the map; realms (and later population groups,
  firms, markets, routes) live in tables (`src/sim/ecs.ts`) whose rows are reused when an entity goes.
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
Randomness comes only from the seeded generator in the state (`src/sim/rng.ts`) or from `hash01` of ids.

## Commands
`src/sim/commands.ts` keeps one definition per command kind: a check that names the reason when it cannot be done,
and an effect. Players and the AI of realms without a player use the same commands.

## Client
`src/net/client.ts` keeps the server's messages as signals; `src/ui/` draws them. The map (`src/render/`) gets the
owners of all places as one binary frame at sign-in and the changes each day.
