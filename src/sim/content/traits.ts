// What a ruler's traits do to the realm. Every trait a person can bear in 1356 or receive in play is either listed here
// with its effects (keys of src/sim/effects.ts, read through lawEffect) or in TRAITS_DESCRIPTIVE: a trait that says who
// the person is (a child, a captive, an heiress, a partisan of the emperor) without a rule of its own. The effects apply
// while the person rules, as the modifier 'ruler_traits' (systems/politics.ts syncRulerTraits), so every breakdown
// names them as their source. Sizes are small on purpose: a trait colours a reign, the realm's laws and estates make it.
// Commanders' traits in battle are separate (systems/military.ts, ctrait_* texts), and health traits act on mortality.

export const RULER_TRAIT_FX: Record<string, Record<string, number>> = {
  // ---- character
  just: { unrest: -1, control: 0.03 }, wise: { research: 0.05, admin: 0.03 }, brave: { morale: 0.05 },
  diligent: { admin: 0.05, tax: 0.02 }, charming: { diplomacy: 0.1 }, pious: { conversion: 0.15 },
  shrewd: { trade: 0.05, tax: 0.02 }, patient: { unrest: -0.5, diplomacy: 0.05 }, learned: { research: 0.08 },
  energetic: { admin: 0.02, speed: 0.05 }, cruel: { unrest: 1, control: 0.03 }, lazy: { admin: -0.05, tax: -0.02 },
  craven: { morale: -0.05 }, greedy: { tax: 0.05, unrest: 1 }, rash: { morale: 0.03, discipline: -0.03 },
  paranoid: { control: 0.02, diplomacy: -0.1 }, weak_willed: { authority_gain: -0.1 }, profligate: { tax: -0.05 },
  ambitious: { authority_gain: 0.1, unrest: 0.5 }, cautious: { defence: 0.05 }, cunning: { diplomacy: 0.05, trade: 0.02 },
  builder: { build_time: -0.1 }, stern: { control: 0.04, unrest: 0.5 }, chivalrous: { morale: 0.03, diplomacy: 0.03 },
  capable: { admin: 0.04 }, cultured: { research: 0.04, diplomacy: 0.03 }, prudent: { tax: 0.02, army_cost: -0.03 },
  determined: { authority_gain: 0.05, morale: 0.02 }, zealous: { conversion: 0.2, diplomacy: -0.05 }, worldly: { trade: 0.04 },
  ruthless: { control: 0.05, unrest: 1 }, able: { admin: 0.03, tax: 0.02 }, bold: { morale: 0.04 }, defiant: { defence: 0.03 },
  dutiful: { admin: 0.03 }, quarrelsome: { diplomacy: -0.1 }, rebellious: { unrest: 1 }, seafarer: { naval: 0.1 },
  clever: { research: 0.04 }, suspicious: { diplomacy: -0.05, control: 0.02 }, devout: { conversion: 0.1 },
  harsh: { unrest: 1, control: 0.03 }, unlucky: { morale: -0.02 }, unruly: { unrest: 0.5 },
  factional: { unrest: 0.5, authority_gain: -0.05 }, restless: { speed: 0.03 }, acquisitive: { tax: 0.03 },
  adventurer: { speed: 0.03 }, aggressive: { morale: 0.03, diplomacy: -0.05 }, bookish: { research: 0.05 },
  brilliant: { research: 0.05, admin: 0.03 }, ceremonious: { authority_gain: 0.05 }, conqueror: { morale: 0.05, discipline: 0.02 },
  deceitful: { diplomacy: -0.05 }, diplomatic: { diplomacy: 0.1 }, extravagant: { tax: -0.04 }, grasping: { tax: 0.04, unrest: 0.5 },
  honourable: { diplomacy: 0.05 }, idle: { admin: -0.04 }, imperious: { authority_gain: 0.05, diplomacy: -0.05 },
  impious: { conversion: -0.1 }, jurist: { control: 0.03 }, kind: { unrest: -0.5 }, litigious: { control: 0.02, unrest: 0.3 },
  meek: { authority_gain: -0.05 }, miserly: { tax: 0.03, growth: -0.02 }, passionate: { morale: 0.02 }, patriotic: { manpower: 0.05 },
  patron: { research: 0.04 }, peaceable: { diplomacy: 0.05, morale: -0.02 }, 'pleasure-loving': { admin: -0.03 },
  pliant: { authority_gain: -0.05 }, poet: { research: 0.02 }, pragmatic: { admin: 0.02 }, raider: { speed: 0.03, morale: 0.02 },
  secretive: { control: 0.01 }, steadfast: { defence: 0.04 }, steady: { unrest: -0.3 }, temperate: { tax: 0.01 },
  tolerant: { unrest: -0.5 }, trader: { trade: 0.05 }, treacherous: { diplomacy: -0.1 }, unpopular: { unrest: 1 },
  unstable: { unrest: 0.5 }, vain: { diplomacy: -0.03 }, vigilant: { defence: 0.03 }, vindictive: { diplomacy: -0.03 },
  wealthy: { tax: 0.02 }, 'iron-willed': { authority_gain: 0.08 }, curious: { research: 0.02 }, chronicler: { research: 0.01 },
  influential: { diplomacy: 0.03 }, council: { admin: 0.02, authority_gain: -0.03 }, content: { unrest: -0.3 },
  diplomat: { diplomacy: 0.1 }, frugal: { tax: 0.02, army_cost: -0.02 }, gentle: { unrest: -0.5 }, impatient: { speed: 0.02, diplomacy: -0.03 },
  indebted: { interest: 0.01 }, indecisive: { authority_gain: -0.05 }, mercantile: { trade: 0.05 },
  proud: { authority_gain: 0.03, diplomacy: -0.03 }, resentful: { diplomacy: -0.05 }, scholarly: { research: 0.05 },
  tenacious: { defence: 0.04 }, generous: { unrest: -0.5, tax: -0.02 }, stubborn: { defence: 0.02, diplomacy: -0.03 },
  thrifty: { tax: 0.02, army_cost: -0.02 }, warlike: { morale: 0.04, diplomacy: -0.03 }, weak: { authority_gain: -0.05 }, vengeful: { diplomacy: -0.05 },
};
/** Traits that say who the person is, and act on nothing in the realm (age, status, allegiance, health). */
export const TRAITS_DESCRIPTIVE = new Set([
  'child', 'infant', 'young', 'old', 'elderly', 'captive', 'heiress', 'ward', 'founder', 'catholic', 'ghibelline', 'convert',
  'childless', 'dependent', 'independent', 'impoverished', 'neglected', 'obese', 'worn', 'lame', 'resilient', 'traditional',
  'hunter', 'loyal', 'lustful',
]);
/** Traits that act on a person's own life: sickly and ailing people die sooner, hardy ones later (politics.ts). */
export const TRAITS_HEALTH: Record<string, 'bad' | 'good'> = { sickly: 'bad', ailing: 'bad', hardy: 'good', wounded: 'bad' };

/** The sum of the effects of a ruler's traits (unknown traits add nothing). */
export function rulerTraitEffects(traits: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of traits) for (const [k, v] of Object.entries(RULER_TRAIT_FX[t] ?? {})) out[k] = (out[k] ?? 0) + v;
  for (const k in out) if (Math.abs(out[k]) < 1e-9) delete out[k];
  return out;
}
