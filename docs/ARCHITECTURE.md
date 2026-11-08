# Sundered Crowns – architecture (for contributors)

Original grand strategy game, real Europe 1356–1815. No names, assets, UI or mechanic terms from any existing commercial game.
Our own terms: **Concord** (internal stability −100..100), **Mandate** (legitimacy 0..100), **Authority** (political capital),
**Powers of the Realm** (estates: magnates, prelates, burghers, commons), **Dread** (fear of expansion), **Common Front** (coalition),
**Insight** (points for doctrines), **Marks** (money).

## Layout
- `tools/geo/*.py` – data pipeline → `public/data/{geo,world,setup_1356}.json`, `public/map/{ids.bin.gz,height.bin.gz,biome.png}`
- `src/sim/` – deterministic simulation (no DOM, no Math.random, no Date). Runs in a Web Worker in the browser and in Node on the world server.
  - `types.ts` GameState contract · `world.ts` static world (graph, terrain) · `setup.ts` createGame · `engine.ts` advanceDay/save/hash
  - `commands.ts` applyCommand – the only way players/AI change state
  - `systems/*.ts` – each `{id, init, daily, monthly, yearly}`; order in `systems/index.ts`
  - `content/*` – data-driven content (laws, peoples, events, decisions, situations, doctrines, innovations)
- `src/render/` – WebGPU map renderer · `src/ui/` – Preact UI · `src/game/` – worker bridge · `server/` – world server · `supabase/` – migrations

## Conventions
- Location ids in the sim are 0-based: land `0..L-1`, sea zones `L..L+S-1` (`w.L`, `w.N`). The id raster is 1-based (0 = nothing).
- Owner `-1` = unclaimed. `ctrl -2` = rebels.
- Randomness: `rand(s.rng)`, `chance(s.rng,p)`, `pick(s.rng, arr)` from `sim/rng.ts`. Never Math.random in sim code.
- Text shown to players is `I18n = {en, de}`. German must be real German with umlauts.
- Money: nation `income.tax` ≈ monthly tax income; use it to scale costs (`fx.gold(months)`).

## Effect keys (modifiers, laws, doctrines, innovations)
Read via `lawEffect(n,key)` (laws + values + modifiers) or `mod(n,key)` (modifiers only):
`tax, trade, production, unrest` (fractions/points; read with mod), `morale, discipline, fire, cavalry, speed, manpower, army_cost,
mercenary_cost, fort_strength, attrition` (military, fractions), `concord_gain, mandate_gain, authority_gain, corruption, interest,
dread_decay, tolerance, admin, control, integration, research, conversion, assimilation, colonial_range, colonial_growth, colonists, agents`.
