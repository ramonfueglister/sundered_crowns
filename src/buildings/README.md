# Buildings

The houses, churches, fortifications, works and real monuments of the world. The layout of the folders is described
at the top of `index.ts`.

## Rules for this code

- One concern per file, at most 300 lines (checked by `tests/buildings/properties.test.ts`).
- Every number that describes a real building (storey height, roof pitch, plot width, colour of a material) carries
  its source in a comment, or is marked as an assumption. Drawing values that only shape the look (how far a pane
  stands off its wall, how a tile row is shaded) are tuned against the reference image and need no source.
- Runs in the world's web workers: no DOM, no renderer. A model depends only on its arguments and its random source,
  and draws from that source in a fixed order, so every piece of the world builds the same building.
- Every builder is fixed by a fingerprint in `tests/buildings/golden.json`. A refactor must leave it unchanged. A
  deliberate change to a building rewrites it (`UPDATE_GOLDEN=1 npx vitest run tests/buildings`) and says so in the
  commit, with a picture pair against the reference.

## Building tradition by tradition

Each region goes through the same steps, and the next region starts only after Ramon has judged the last one:

1. Sources: house types of the region in 1356 from the literature on vernacular building, with measured values
   (storey height, roof pitch and covering, plot width and depth, wall material).
2. A parameter file for the tradition under `traditions/`, every value with its source.
3. Rules and parts: the grammar steps (body, fronts, roof, roof parts) and the hand-made parts the tradition needs.
4. Tests: fingerprint, properties, ranges taken from the sources.
5. Measurement against the reference image (gauntlet) and against photos of surviving houses.
6. Ramon's verdict, then a page in `docs/wiki/`.

Order: Italy (Venice first), the Alps and Upper Germany, North Germany and the Hanse, France and England, Iberia,
Byzantium and the Balkans, the Rus, the Islamic Mediterranean and the Near East. The rest of the world follows once
it has settlement data.
