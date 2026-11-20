# Working in this repository

Several Claude threads change this repository at once. These rules keep the code clean without anyone having to tidy
up after them. They come on top of the README (layout, how to run, the checks) and `docs/ARCHITECTURE.md`.

## Before every pull request

Run what CI runs (`.github/workflows/ci.yml`) for what you touched, and fix every failure:

```
npm run typecheck
npm run lint                         # Biome: must show no new warning
npx vitest run tests/<the tests of the code you changed>
ruff check && ruff format --check    # when you touched Python (pip install ruff==0.17.4)
(cd economy && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test --release --locked)
                                     # when you touched economy/
```

- Never skip, disable or loosen a test to get green.
- No new lint warning. If a rule truly does not fit, silence that one line with
  `// biome-ignore lint/<group>/<rule>: <why>`, and write the reason.
- No new `any` and no `@ts-ignore`: give a value its real type (the few that are left, mostly three.js TSL nodes,
  are being removed). A cast with `as` needs a reason in a comment.
- Name the PR's title and description after what it changes, and say in the description how you checked it.

## Layout

- Biome lays out the folders listed in the `overrides` of `biome.json`; the rest is taken in folder by folder by the
  cleanup thread, when no open pull request changes the folder. Do not edit that list yourself.
- Lay out every new file you write, also outside those folders:
  `npx biome format --write --javascript-formatter-enabled=true <file>` (120 columns, single quotes). Python is laid
  out by `ruff format`, Rust by `cargo fmt`.
- After a Biome format, look for `*/;` at the end of a line: Biome moves a doc comment written after `;` behind the
  member before it. Put it back above its own member.

## Code

- Keep files small: one subject per file, about 500 lines at most (300 in `src/buildings/`, which a test checks).
  When a file grows past that, split it by subject before adding more.
- Export only what another module imports. Delete code that nothing uses; git keeps the history.
- No dead or commented-out code, no `TODO` without the name of what it waits on.
- Use the names the code already uses for the same thing; name things after what they are in the game or the source.
- A comment says why, and where a rule or number comes from: the paper with its section or equation, the source code
  with file and line, or Ramon's words with the date. A rule made up here is marked `OWN RULE` with its reason.
- Simulation rules and parameters follow published literature only (Ramon, 19 November 2026: "alles nur
  literaturkonform"). Never invent a rule or tune a number to make results look right.

## The piece key

Players keep the world's built pieces on disk under a key (`tools/stamp/piece_key.ts`): a hash of the code the world
workers import, the map data in `public/map` and `public/data`, and the library versions. Any change to a file in that
closure (most of `src/sim`, `src/worldprobe`, `src/lookprobe`, `src/buildings`, `src/figures`) gives a new key, and
every player downloads the world again. So do not touch those files for cosmetic reasons alone; bundle such changes
with real work, and say in the PR when the key changes. Compare before and after with:

```
node --experimental-strip-types -e 'import("./tools/stamp/piece_key.ts").then(m=>console.log(m.pieceKey(".")))'
```
