// Static game definitions: goods, social classes, terrain, units, buildings.
// All names of mechanics are our own.

export const TERRAINS = ['plains', 'farmland', 'forest', 'hills', 'mountains', 'marsh', 'steppe', 'desert', 'jungle', 'tundra', 'wasteland'] as const;
export type Terrain = typeof TERRAINS[number];

export interface TerrainDef {
  move: number;        // movement speed multiplier
  defence: number;     // defender combat bonus (fraction)
  supply: number;      // supply capacity multiplier
  growth: number;      // population growth multiplier
  yield: number;       // agricultural yield multiplier
  attrition: number;   // extra attrition
  cav: number;         // cavalry effectiveness
}
export const TERRAIN_DEF: Record<Terrain, TerrainDef> = {
  plains:    { move: 1.0, defence: 0.0, supply: 1.0, growth: 1.0, yield: 1.0, attrition: 0, cav: 1.15 },
  farmland:  { move: 1.0, defence: 0.0, supply: 1.4, growth: 1.1, yield: 1.25, attrition: 0, cav: 1.15 },
  forest:    { move: 0.75, defence: 0.15, supply: 0.7, growth: 0.8, yield: 0.6, attrition: 0.2, cav: 0.7 },
  hills:     { move: 0.75, defence: 0.25, supply: 0.75, growth: 0.85, yield: 0.75, attrition: 0.2, cav: 0.8 },
  mountains: { move: 0.5, defence: 0.45, supply: 0.4, growth: 0.6, yield: 0.4, attrition: 0.6, cav: 0.5 },
  marsh:     { move: 0.55, defence: 0.3, supply: 0.5, growth: 0.6, yield: 0.5, attrition: 0.8, cav: 0.5 },
  steppe:    { move: 1.15, defence: -0.05, supply: 0.6, growth: 0.8, yield: 0.6, attrition: 0.1, cav: 1.3 },
  desert:    { move: 0.8, defence: 0.0, supply: 0.25, growth: 0.5, yield: 0.2, attrition: 1.2, cav: 1.1 },
  jungle:    { move: 0.5, defence: 0.3, supply: 0.4, growth: 0.7, yield: 0.5, attrition: 1.2, cav: 0.4 },
  tundra:    { move: 0.7, defence: 0.05, supply: 0.3, growth: 0.5, yield: 0.25, attrition: 0.8, cav: 0.8 },
  wasteland: { move: 0.3, defence: 0.0, supply: 0.05, growth: 0.1, yield: 0.05, attrition: 3, cav: 0.5 },
};

// ---------------- goods ----------------
export type GoodKind = 'raw' | 'intermediate' | 'finished';
export interface GoodDef { id: string; name: { en: string; de: string }; kind: GoodKind; base: number; tier: 0 | 1 | 2 | 3; color: string; }
// base = price in silver pennies-equivalent "marks" per unit (abstract unit, ~ a cartload / bolt / barrel)
const g = (id: string, en: string, de: string, kind: GoodKind, base: number, tier: 0 | 1 | 2 | 3, color: string): GoodDef => ({ id, name: { en, de }, kind, base, tier, color });
export const GOODS: GoodDef[] = [
  g('grain', 'Grain', 'Getreide', 'raw', 1.0, 0, '#d9c26a'),
  g('livestock', 'Livestock', 'Vieh', 'raw', 2.2, 1, '#a0522d'),
  g('fish', 'Fish', 'Fisch', 'raw', 1.6, 1, '#6aa5c8'),
  g('wool', 'Wool', 'Wolle', 'raw', 2.4, 0, '#e8e2cf'),
  g('flax', 'Flax', 'Flachs', 'raw', 1.8, 0, '#b6c48a'),
  g('timber', 'Timber', 'Bauholz', 'raw', 1.2, 0, '#6b4f2a'),
  g('stone', 'Stone', 'Stein', 'raw', 1.0, 0, '#9a9a92'),
  g('salt', 'Salt', 'Salz', 'raw', 2.6, 0, '#f2f2f2'),
  g('iron_ore', 'Iron ore', 'Eisenerz', 'raw', 1.8, 0, '#7b5e57'),
  g('copper', 'Copper', 'Kupfer', 'raw', 4.0, 0, '#c87533'),
  g('tin', 'Tin', 'Zinn', 'raw', 4.5, 0, '#b8b8c0'),
  g('silver', 'Silver', 'Silber', 'raw', 12.0, 3, '#d8d8e0'),
  g('gold', 'Gold', 'Gold', 'raw', 40.0, 3, '#f0c020'),
  g('furs', 'Furs', 'Pelze', 'raw', 7.0, 3, '#7a5230'),
  g('grapes', 'Wine grapes', 'Trauben', 'raw', 1.8, 0, '#7b2d5a'),
  g('olives', 'Olives', 'Oliven', 'raw', 1.8, 0, '#808000'),
  g('cotton', 'Cotton', 'Baumwolle', 'raw', 3.0, 0, '#f5f5ef'),
  g('sugarcane', 'Sugar cane', 'Zuckerrohr', 'raw', 3.0, 0, '#c9e3a0'),
  g('tobacco', 'Tobacco', 'Tabak', 'raw', 5.0, 2, '#8b6b3d'),
  g('coffee', 'Coffee', 'Kaffee', 'raw', 6.0, 2, '#4b2e1e'),
  g('spices', 'Spices', 'Gewürze', 'raw', 14.0, 3, '#c0392b'),
  g('silk', 'Raw silk', 'Rohseide', 'raw', 10.0, 0, '#f3d1e0'),
  g('dyes', 'Dyes', 'Farbstoffe', 'raw', 5.0, 0, '#3f51b5'),
  g('alum', 'Alum', 'Alaun', 'raw', 5.0, 0, '#e0e0ff'),
  g('horses', 'Horses', 'Pferde', 'raw', 8.0, 0, '#8d6e63'),
  g('saltpeter', 'Saltpetre', 'Salpeter', 'raw', 4.0, 0, '#eeeeee'),
  g('amber', 'Amber', 'Bernstein', 'raw', 9.0, 3, '#ffb300'),
  g('honey', 'Honey & wax', 'Honig & Wachs', 'raw', 3.0, 1, '#f9a825'),
  // intermediate
  g('flour', 'Flour', 'Mehl', 'intermediate', 1.4, 0, '#fff3c4'),
  g('cloth', 'Cloth', 'Tuch', 'intermediate', 5.0, 0, '#5d7fb5'),
  g('linen', 'Linen', 'Leinen', 'intermediate', 4.0, 0, '#ede7d0'),
  g('iron', 'Iron', 'Eisen', 'intermediate', 4.5, 0, '#5b5b5b'),
  g('leather', 'Leather', 'Leder', 'intermediate', 3.5, 0, '#8b5a2b'),
  g('paper', 'Paper', 'Papier', 'intermediate', 5.0, 0, '#faf6e8'),
  g('gunpowder', 'Gunpowder', 'Schießpulver', 'intermediate', 9.0, 0, '#333333'),
  g('bronze', 'Bronze', 'Bronze', 'intermediate', 8.0, 0, '#b87333'),
  // finished
  g('bread', 'Bread', 'Brot', 'finished', 1.8, 0, '#c8a165'),
  g('beer', 'Beer', 'Bier', 'finished', 1.6, 1, '#e0a030'),
  g('wine', 'Wine', 'Wein', 'finished', 4.0, 2, '#7b1f3a'),
  g('olive_oil', 'Olive oil', 'Olivenöl', 'finished', 3.5, 1, '#9e9d24'),
  g('clothing', 'Clothing', 'Kleidung', 'finished', 6.0, 0, '#6d8fbf'),
  g('fine_cloth', 'Fine cloth', 'Feintuch', 'finished', 18.0, 3, '#8e24aa'),
  g('tools', 'Tools', 'Werkzeug', 'finished', 7.0, 1, '#607d8b'),
  g('weapons', 'Weapons', 'Waffen', 'finished', 10.0, 0, '#455a64'),
  g('armour', 'Armour', 'Rüstungen', 'finished', 16.0, 0, '#78909c'),
  g('ships', 'Ship timber & rigging', 'Schiffsbedarf', 'finished', 14.0, 0, '#3e5e7e'),
  g('books', 'Books', 'Bücher', 'finished', 14.0, 3, '#5d4037'),
  g('glassware', 'Glassware', 'Glaswaren', 'finished', 12.0, 3, '#80deea'),
  g('jewelry', 'Jewellery', 'Schmuck', 'finished', 40.0, 3, '#ffd54f'),
  g('sugar', 'Sugar', 'Zucker', 'finished', 9.0, 3, '#fafafa'),
  g('furniture', 'Furniture', 'Möbel', 'finished', 8.0, 2, '#8d6e63'),
];
export const G = GOODS.length;
export const GI: Record<string, number> = Object.fromEntries(GOODS.map((x, i) => [x.id, i]));

// Production recipes (workshops). Inputs/outputs per worker-month at "guild" method.
export interface Recipe { id: string; out: string; outQty: number; inputs: [string, number][]; cls: number; minEra: number; name: { en: string; de: string } }
export const RECIPES: Recipe[] = [
  { id: 'mill', out: 'flour', outQty: 1.6, inputs: [['grain', 1.2]], cls: 2, minEra: 0, name: { en: 'Mill', de: 'Mühle' } },
  { id: 'bakery', out: 'bread', outQty: 1.5, inputs: [['flour', 1.0]], cls: 2, minEra: 0, name: { en: 'Bakery', de: 'Bäckerei' } },
  { id: 'brewery', out: 'beer', outQty: 1.6, inputs: [['grain', 0.8]], cls: 2, minEra: 0, name: { en: 'Brewery', de: 'Brauerei' } },
  { id: 'winery', out: 'wine', outQty: 0.8, inputs: [['grapes', 1.0]], cls: 2, minEra: 0, name: { en: 'Winery', de: 'Kelterei' } },
  { id: 'oil_press', out: 'olive_oil', outQty: 0.9, inputs: [['olives', 1.0]], cls: 2, minEra: 0, name: { en: 'Oil press', de: 'Ölpresse' } },
  { id: 'weavery', out: 'cloth', outQty: 0.7, inputs: [['wool', 1.0]], cls: 2, minEra: 0, name: { en: 'Weavery', de: 'Weberei' } },
  { id: 'linen_weavery', out: 'linen', outQty: 0.7, inputs: [['flax', 1.0]], cls: 2, minEra: 0, name: { en: 'Linen weavery', de: 'Leinenweberei' } },
  { id: 'cotton_weavery', out: 'cloth', outQty: 0.8, inputs: [['cotton', 0.9]], cls: 2, minEra: 0, name: { en: 'Cotton weavery', de: 'Baumwollweberei' } },
  { id: 'tailor', out: 'clothing', outQty: 0.8, inputs: [['cloth', 0.5], ['linen', 0.4]], cls: 2, minEra: 0, name: { en: 'Tailors', de: 'Schneiderei' } },
  { id: 'fine_weavery', out: 'fine_cloth', outQty: 0.3, inputs: [['cloth', 0.6], ['dyes', 0.25], ['alum', 0.08]], cls: 2, minEra: 0, name: { en: 'Fine cloth works', de: 'Feintuchwerkstatt' } },
  { id: 'silk_weavery', out: 'fine_cloth', outQty: 0.35, inputs: [['silk', 0.45]], cls: 2, minEra: 0, name: { en: 'Silk weavery', de: 'Seidenweberei' } },
  { id: 'smelter', out: 'iron', outQty: 0.8, inputs: [['iron_ore', 1.2], ['timber', 0.4]], cls: 1, minEra: 0, name: { en: 'Bloomery', de: 'Rennofen' } },
  { id: 'tannery', out: 'leather', outQty: 0.8, inputs: [['livestock', 0.6]], cls: 2, minEra: 0, name: { en: 'Tannery', de: 'Gerberei' } },
  { id: 'smithy', out: 'tools', outQty: 0.6, inputs: [['iron', 0.5], ['timber', 0.2]], cls: 2, minEra: 0, name: { en: 'Smithy', de: 'Schmiede' } },
  { id: 'armoury', out: 'weapons', outQty: 0.5, inputs: [['iron', 0.6], ['timber', 0.2], ['leather', 0.1]], cls: 2, minEra: 0, name: { en: 'Weaponsmith', de: 'Waffenschmiede' } },
  { id: 'plater', out: 'armour', outQty: 0.3, inputs: [['iron', 0.8], ['leather', 0.2]], cls: 2, minEra: 0, name: { en: 'Armourer', de: 'Plattner' } },
  { id: 'shipwright', out: 'ships', outQty: 0.35, inputs: [['timber', 1.2], ['linen', 0.3], ['iron', 0.1]], cls: 2, minEra: 0, name: { en: 'Shipwright', de: 'Schiffbauer' } },
  { id: 'papermill', out: 'paper', outQty: 0.8, inputs: [['linen', 0.4]], cls: 2, minEra: 0, name: { en: 'Paper mill', de: 'Papiermühle' } },
  { id: 'press', out: 'books', outQty: 0.3, inputs: [['paper', 0.8]], cls: 2, minEra: 1, name: { en: 'Printing house', de: 'Druckerei' } },
  { id: 'scriptorium', out: 'books', outQty: 0.08, inputs: [['paper', 0.3]], cls: 4, minEra: 0, name: { en: 'Scriptorium', de: 'Skriptorium' } },
  { id: 'powder_mill', out: 'gunpowder', outQty: 0.5, inputs: [['saltpeter', 0.6], ['timber', 0.1]], cls: 2, minEra: 0, name: { en: 'Powder mill', de: 'Pulvermühle' } },
  { id: 'foundry', out: 'bronze', outQty: 0.6, inputs: [['copper', 0.6], ['tin', 0.1]], cls: 2, minEra: 0, name: { en: 'Bell foundry', de: 'Glockengießerei' } },
  { id: 'glassworks', out: 'glassware', outQty: 0.4, inputs: [['stone', 0.3], ['timber', 0.6]], cls: 2, minEra: 0, name: { en: 'Glassworks', de: 'Glashütte' } },
  { id: 'goldsmith', out: 'jewelry', outQty: 0.12, inputs: [['gold', 0.06], ['silver', 0.12]], cls: 2, minEra: 0, name: { en: 'Goldsmith', de: 'Goldschmied' } },
  { id: 'sugar_mill', out: 'sugar', outQty: 0.5, inputs: [['sugarcane', 1.0]], cls: 1, minEra: 0, name: { en: 'Sugar mill', de: 'Zuckermühle' } },
  { id: 'joinery', out: 'furniture', outQty: 0.5, inputs: [['timber', 0.8]], cls: 2, minEra: 0, name: { en: 'Joinery', de: 'Schreinerei' } },
];
export const RI: Record<string, number> = Object.fromEntries(RECIPES.map((x, i) => [x.id, i]));

// Production methods by era / innovation: multiply output per worker
export const METHODS = [
  { id: 'guild', name: { en: 'Guild workshop', de: 'Zunftwerkstatt' }, mult: 1.0 },
  { id: 'putting_out', name: { en: 'Putting-out system', de: 'Verlagssystem' }, mult: 1.35 },
  { id: 'manufactory', name: { en: 'Manufactory', de: 'Manufaktur' }, mult: 1.9 },
];

// ---------------- social classes ----------------
export const CLASSES = ['peasants', 'labourers', 'artisans', 'burghers', 'clergy', 'nobles', 'wage_workers'] as const;
export const C = CLASSES.length;
export const CL = { peasants: 0, labourers: 1, artisans: 2, burghers: 3, clergy: 4, nobles: 5, wage_workers: 6 } as const;
export const CLASS_NAME: Record<string, { en: string; de: string }> = {
  peasants: { en: 'Peasants', de: 'Bauern' }, labourers: { en: 'Labourers', de: 'Tagelöhner' }, artisans: { en: 'Artisans', de: 'Handwerker' },
  burghers: { en: 'Burghers & merchants', de: 'Bürger & Kaufleute' }, clergy: { en: 'Clergy', de: 'Klerus' }, nobles: { en: 'Nobility', de: 'Adel' },
  wage_workers: { en: 'Wage workers', de: 'Lohnarbeiter' },
};
// Needs per person per month, by tier: [good, qty]. Tier 0 basic (food, clothing, fuel), 1 everyday, 2 comfort, 3 luxury
export const NEEDS: [string, number, number][] = [
  // [good, qty per 100 persons per month, tier]
  ['grain', 9, 0], ['bread', 2.0, 0], ['clothing', 0.9, 0], ['timber', 1.4, 0], ['salt', 0.35, 0],
  ['livestock', 1.6, 1], ['fish', 1.0, 1], ['beer', 1.6, 1], ['linen', 0.4, 1], ['tools', 0.2, 1], ['olive_oil', 0.3, 1], ['honey', 0.2, 1], ['leather', 0.3, 1],
  ['wine', 0.8, 2], ['furniture', 0.2, 2], ['cloth', 0.4, 2], ['books', 0.03, 2], ['glassware', 0.05, 2], ['sugar', 0.05, 2],
  ['spices', 0.12, 3], ['fine_cloth', 0.15, 3], ['furs', 0.08, 3], ['jewelry', 0.02, 3], ['tobacco', 0.06, 3], ['coffee', 0.05, 3], ['amber', 0.02, 3],
];
// how far up the need tiers each class reaches, and consumption multiplier
export const CLASS_NEED_MULT = [1.0, 0.9, 1.2, 2.0, 1.8, 8.0, 1.0];
export const CLASS_MAX_TIER = [1, 1, 2, 3, 3, 3, 2];

// ---------------- military units ----------------
export interface UnitDef {
  id: string; name: { en: string; de: string }; kind: 'inf' | 'cav' | 'ranged' | 'art' | 'ship';
  shock: number; fire: number; def: number; morale: number; speed: number;
  cost: number; upkeep: number; // per 1000 men per month in marks
  goods: [string, number][];    // monthly consumption per 1000 men
  era: number; until: number;   // available from era index, obsolete after era
  cultures?: string[];          // restricted (e.g. longbowmen English/Welsh)
  govs?: string[];
  sea?: { hull: number; cannons: number; cargo: number; galley?: boolean };
}
export const UNITS: UnitDef[] = [
  { id: 'levy', name: { en: 'Feudal levy', de: 'Lehnsaufgebot' }, kind: 'inf', shock: 0.6, fire: 0, def: 0.6, morale: 0.7, speed: 1, cost: 3, upkeep: 0.25, goods: [['grain', 6], ['tools', 0.05]], era: 0, until: 2 },
  { id: 'men_at_arms', name: { en: 'Men-at-arms', de: 'Waffenknechte' }, kind: 'inf', shock: 1.1, fire: 0, def: 1.1, morale: 1.0, speed: 1, cost: 12, upkeep: 0.8, goods: [['grain', 6], ['weapons', 0.2], ['armour', 0.12]], era: 0, until: 2 },
  { id: 'knights', name: { en: 'Mounted knights', de: 'Ritter' }, kind: 'cav', shock: 2.2, fire: 0, def: 1.4, morale: 1.2, speed: 1.15, cost: 40, upkeep: 2.5, goods: [['grain', 8], ['horses', 0.3], ['armour', 0.3], ['weapons', 0.15]], era: 0, until: 2 },
  { id: 'crossbowmen', name: { en: 'Crossbowmen', de: 'Armbrustschützen' }, kind: 'ranged', shock: 0.5, fire: 1.0, def: 0.8, morale: 0.9, speed: 1, cost: 10, upkeep: 0.7, goods: [['grain', 6], ['weapons', 0.25]], era: 0, until: 2 },
  { id: 'longbowmen', name: { en: 'Longbowmen', de: 'Langbogenschützen' }, kind: 'ranged', shock: 0.6, fire: 1.5, def: 0.8, morale: 1.0, speed: 1, cost: 12, upkeep: 0.8, goods: [['grain', 6], ['timber', 0.2]], era: 0, until: 2, cultures: ['english', 'welsh'] },
  { id: 'horse_archers', name: { en: 'Horse archers', de: 'Berittene Bogenschützen' }, kind: 'cav', shock: 1.0, fire: 1.2, def: 0.9, morale: 1.1, speed: 1.4, cost: 18, upkeep: 1.0, goods: [['livestock', 2], ['horses', 0.4]], era: 0, until: 3, govs: ['nomadic_horde', 'tribal_federation'] },
  { id: 'pikemen', name: { en: 'Pike squares', de: 'Spießhaufen' }, kind: 'inf', shock: 1.2, fire: 0, def: 1.5, morale: 1.15, speed: 1, cost: 10, upkeep: 0.7, goods: [['grain', 6], ['timber', 0.2], ['weapons', 0.1]], era: 1, until: 3 },
  { id: 'arquebusiers', name: { en: 'Pike and shot', de: 'Pike und Arkebuse' }, kind: 'inf', shock: 1.3, fire: 1.4, def: 1.4, morale: 1.15, speed: 1, cost: 14, upkeep: 0.9, goods: [['grain', 6], ['weapons', 0.25], ['gunpowder', 0.2]], era: 2, until: 3 },
  { id: 'cuirassiers', name: { en: 'Heavy horse', de: 'Kürassiere' }, kind: 'cav', shock: 2.0, fire: 0.4, def: 1.4, morale: 1.2, speed: 1.15, cost: 32, upkeep: 2.0, goods: [['grain', 8], ['horses', 0.3], ['armour', 0.2], ['gunpowder', 0.05]], era: 2, until: 4 },
  { id: 'musketeers', name: { en: 'Line infantry', de: 'Linieninfanterie' }, kind: 'inf', shock: 1.4, fire: 2.2, def: 1.6, morale: 1.3, speed: 1, cost: 16, upkeep: 1.0, goods: [['grain', 6], ['weapons', 0.3], ['gunpowder', 0.35], ['clothing', 0.2]], era: 3, until: 4 },
  { id: 'dragoons', name: { en: 'Dragoons', de: 'Dragoner' }, kind: 'cav', shock: 1.6, fire: 1.2, def: 1.3, morale: 1.25, speed: 1.2, cost: 26, upkeep: 1.6, goods: [['grain', 8], ['horses', 0.3], ['gunpowder', 0.15]], era: 3, until: 4 },
  { id: 'bombards', name: { en: 'Bombards', de: 'Steinbüchsen' }, kind: 'art', shock: 0.3, fire: 1.0, def: 0.4, morale: 0.6, speed: 0.7, cost: 60, upkeep: 2.0, goods: [['gunpowder', 0.6], ['stone', 0.5], ['bronze', 0.05]], era: 0, until: 2 },
  { id: 'field_guns', name: { en: 'Field artillery', de: 'Feldgeschütze' }, kind: 'art', shock: 0.4, fire: 2.6, def: 0.6, morale: 0.8, speed: 0.85, cost: 50, upkeep: 1.8, goods: [['gunpowder', 0.8], ['bronze', 0.1], ['iron', 0.1]], era: 2, until: 4 },
  // ships (per ship; men field = number of ships)
  { id: 'cog', name: { en: 'Cog', de: 'Kogge' }, kind: 'ship', shock: 0, fire: 0.5, def: 1.0, morale: 1, speed: 1.0, cost: 30, upkeep: 0.8, goods: [['ships', 0.05], ['grain', 0.4]], era: 0, until: 2, sea: { hull: 30, cannons: 0, cargo: 300 } },
  { id: 'galley', name: { en: 'War galley', de: 'Kriegsgaleere' }, kind: 'ship', shock: 0, fire: 1.2, def: 0.8, morale: 1, speed: 1.1, cost: 45, upkeep: 1.2, goods: [['ships', 0.06], ['grain', 1.6]], era: 0, until: 4, sea: { hull: 24, cannons: 2, cargo: 100, galley: true } },
  { id: 'carrack', name: { en: 'Carrack', de: 'Karacke' }, kind: 'ship', shock: 0, fire: 1.6, def: 1.6, morale: 1, speed: 1.15, cost: 70, upkeep: 1.4, goods: [['ships', 0.06], ['grain', 0.5]], era: 1, until: 3, sea: { hull: 50, cannons: 12, cargo: 500 } },
  { id: 'galleon', name: { en: 'Galleon', de: 'Galeone' }, kind: 'ship', shock: 0, fire: 2.6, def: 2.4, morale: 1, speed: 1.2, cost: 100, upkeep: 2.0, goods: [['ships', 0.07], ['gunpowder', 0.05]], era: 2, until: 4, sea: { hull: 70, cannons: 30, cargo: 600 } },
  { id: 'ship_of_line', name: { en: 'Ship of the line', de: 'Linienschiff' }, kind: 'ship', shock: 0, fire: 5.0, def: 4.0, morale: 1, speed: 1.15, cost: 180, upkeep: 3.5, goods: [['ships', 0.08], ['gunpowder', 0.15]], era: 3, until: 4, sea: { hull: 120, cannons: 74, cargo: 200 } },
  { id: 'transport', name: { en: 'Transport hulk', de: 'Transportholk' }, kind: 'ship', shock: 0, fire: 0, def: 0.6, morale: 1, speed: 1.0, cost: 20, upkeep: 0.4, goods: [['ships', 0.03]], era: 0, until: 4, sea: { hull: 20, cannons: 0, cargo: 1000 } },
];
export const UI_: Record<string, number> = Object.fromEntries(UNITS.map((u, i) => [u.id, i]));
export const U = UNITS.length;

// ---------------- buildings (per location) ----------------
export interface BuildingDef { id: string; name: { en: string; de: string }; cost: number; months: number; max: number; desc: { en: string; de: string }; needsCoast?: boolean; era?: number }
export const BUILDINGS: BuildingDef[] = [
  { id: 'fort', name: { en: 'Fortifications', de: 'Befestigung' }, cost: 120, months: 18, max: 4, desc: { en: 'Walls and a garrison; resists sieges and controls nearby roads', de: 'Mauern und Besatzung; widersteht Belagerungen und kontrolliert Straßen' } },
  { id: 'market', name: { en: 'Market hall', de: 'Markthalle' }, cost: 60, months: 8, max: 3, desc: { en: 'More burghers, cheaper local trade, toll income', de: 'Mehr Bürger, günstigerer Handel, Zolleinnahmen' } },
  { id: 'workshop', name: { en: 'Workshops', de: 'Werkstätten' }, cost: 50, months: 6, max: 4, desc: { en: 'Room for more artisans and production', de: 'Platz für mehr Handwerker und Produktion' } },
  { id: 'farm', name: { en: 'Field improvements', de: 'Feldverbesserung' }, cost: 40, months: 6, max: 3, desc: { en: 'Drainage, mills and three-field rotation raise yields', de: 'Entwässerung, Mühlen und Dreifelderwirtschaft steigern den Ertrag' } },
  { id: 'road', name: { en: 'Road & bridges', de: 'Straße & Brücken' }, cost: 45, months: 10, max: 3, desc: { en: 'Faster movement, lower transport costs, better control', de: 'Schnellere Bewegung, geringere Transportkosten, mehr Kontrolle' } },
  { id: 'port', name: { en: 'Harbour', de: 'Hafen' }, cost: 70, months: 12, max: 3, needsCoast: true, desc: { en: 'Builds ships, raises sea trade and fishing', de: 'Baut Schiffe, fördert Seehandel und Fischerei' } },
  { id: 'church', name: { en: 'Church & schools', de: 'Kirche & Schulen' }, cost: 50, months: 12, max: 3, desc: { en: 'Clergy, literacy and faith stability', de: 'Klerus, Bildung und Glaubensfestigkeit' } },
  { id: 'mine', name: { en: 'Mine works', de: 'Bergwerk' }, cost: 80, months: 12, max: 3, desc: { en: 'Doubles output of ore, salt and precious metals', de: 'Steigert Erz-, Salz- und Edelmetallförderung' } },
  { id: 'admin', name: { en: 'Seat of administration', de: 'Verwaltungssitz' }, cost: 150, months: 24, max: 1, desc: { en: 'Projects control over the region like a second capital', de: 'Verbreitet Kontrolle in der Region wie eine zweite Hauptstadt' } },
  { id: 'university', name: { en: 'University', de: 'Universität' }, cost: 200, months: 36, max: 1, desc: { en: 'Literacy, research and the spread of new ideas', de: 'Bildung, Forschung und Verbreitung neuer Ideen' } },
  { id: 'manufactory', name: { en: 'Manufactory', de: 'Manufaktur' }, cost: 180, months: 18, max: 2, era: 2, desc: { en: 'Large workshop with wage workers; much higher output', de: 'Großwerkstatt mit Lohnarbeitern; viel höhere Leistung' } },
  { id: 'canal', name: { en: 'Canal', de: 'Kanal' }, cost: 250, months: 36, max: 1, era: 2, desc: { en: 'Very cheap transport of goods', de: 'Sehr billiger Warentransport' } },
];
export const B = BUILDINGS.length;
export const BI: Record<string, number> = Object.fromEntries(BUILDINGS.map((b, i) => [b.id, i]));

export const RAW_FROM_MINE = new Set(['iron_ore', 'copper', 'tin', 'silver', 'gold', 'salt', 'stone', 'alum', 'saltpeter']);
