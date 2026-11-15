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

## The house of the near view

Up close, a house is built from fine blocks of an eighth of a storey (`VOXEL` in `houses/style.ts`, 0.375 m), the
size Ramon's reference class image of 2026-11-15 draws its houses at (`traditions/measures/referenzklasse_nahsicht.json`
holds what was measured on it: storey 8 fine blocks, window 2 × 3, door 3 × 5 under a hood, plinth, string course,
cornice, a roof plate of tile cubes, the clutter of the quay). `houses/grammar.ts` is the split grammar: the plot
becomes a body of storeys, each storey's wall is split into axes, each axis gets a part from `houses/parts.ts`
(windows straight or under a pointed arch, doors, shop fronts, water gates, the faint ashlar grid, tile cubes, Venetian
chimneys, corbels, the roof terrace), the quay gets its clutter from `houses/clutter.ts`. All sizes come from a
`Tradition` (`traditions/tradition.ts`), which a tradition file builds from its measure file: `traditions/venice.ts`
from `measures/venedig_1356.json`. `detail: 0` builds the same house for the far view (about 320 triangles for a small
house instead of about 10,000).

The near probe (`near-probe.html`, `src/lookprobe/near.ts`) shows a quay of Venice on the look probe's stage;
`tools/lookprobe/gauntlet_near.py` measures it against the reference class image.

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
