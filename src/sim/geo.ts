// Fixed vocabularies of the baked map (tools/geo): the terrain of each place and the natural resource found there.
// The indices are what World stores per place; the order must not change once a world is running.

export const TERRAINS = ['plains', 'farmland', 'forest', 'hills', 'mountains', 'marsh', 'steppe', 'desert', 'jungle', 'tundra', 'wasteland'] as const;
export type Terrain = typeof TERRAINS[number];

/** Natural resources on the map (index 0: none). */
export const RESOURCES = [
  'none', 'grain', 'livestock', 'fish', 'timber', 'wool', 'flax', 'cotton', 'furs', 'horses', 'honey', 'salt', 'stone',
  'iron_ore', 'copper', 'tin', 'gold', 'silver', 'saltpeter', 'alum', 'amber', 'grapes', 'olives', 'dyes', 'silk',
  'spices', 'sugarcane', 'tobacco', 'coffee',
] as const;
export type Resource = typeof RESOURCES[number];
export const RESOURCE_INDEX: Record<string, number> = Object.fromEntries(RESOURCES.map((r, i) => [r, i]));
