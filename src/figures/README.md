# Figures

The people of the world: small figures built from a kit of boxes a tenth of a block wide, in the estates and trades
of 1356, walking the streets of the walled towns, standing about the houses of villages and farms, and working at the
edges of the fields. The layout of the folder is described at the top of `index.ts`.

## Why they look like this

The look follows the figures Ramon chose in the figure probe of 15 November 2026 (artifact "Figurenprobe 1356"): the
"Wuselfaktor" of Die Siedler II–IV, where a figure is read by what it does and what it carries, not by detail. A
porter carries a sack, a farmer swings a hoe, a soldier carries a spear and wears a kettle hat, a burgher wears a dyed
hood with a long tail. The head is drawn larger than true so that a figure reads from afar.

## How they are drawn

- All figures of a piece of the world are one instanced mesh, drawn once. The kit holds every part of every estate;
  the vertex stage folds away what a figure does not wear or carry.
- A walker goes back and forth along a straight way of free ground. Position, facing, swinging legs and arms, and the
  bending of a farmer at work are computed on the graphics card from five numbers per figure that never change. The
  processor does nothing per frame for them.
- Near: 516 triangles a figure (including the folded parts). Far, beyond 260 blocks across the picture: 108.
- On the finest step of the map and on the first far step, which draws the finest step's figures, persons and all,
  as large as it draws its houses (`worldprobe/crowd.ts`). On a coarser step a block is wider than a person is tall.
- The persons of the 30 great cities follow the plan of the day (people feature 12, `docs/PEOPLE_DESIGN.md`): a
  person has a figure in the street, and where the plan takes the person, one at the market and one at a house of
  worship. Once a second the main thread puts on the stage the one where the plan has the person at the world's hour
  (`schedule.ts`), and none at night; a figure off the stage has a negative phase and is folded into a point by the
  vertex stage, so nothing is built anew.

## Rules for this code

- One concern per file, at most 300 lines (checked by `tests/figures/figures.test.ts`).
- Every number that describes the real world (height of a person, walking pace, colours of cloth) carries its source
  in a comment, or is marked as an assumption.
- `kit.ts`, `estates.ts`, `crowd.ts` and `aims.ts` run in the world's web workers: no page, no renderer. A figure is decided by
  its own column of the world alone, and only the piece that owns the column adds it.

## Open

- How many figures stand where is an assumption (a share of the free columns). It is to come from the person system
  (thread "Personensystem als ECS entwerfen"): its persons of the 30 great cities, with estate, trade, home and
  workplace, and counts for the rest of the map.
- The middle step with pictures drawn in advance (impostors), for many thousands of figures at middle distance.
- Clothing by region (only the Italian and Upper German look so far); children and the old.
