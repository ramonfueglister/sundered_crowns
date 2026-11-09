// Registry of every effect key the content may use (laws, value axes, traditions of culture groups, privileges,
// doctrines, innovations, landmarks, situations, events, decisions, goals). Every key listed here is read by the
// simulation through lawEffect() (systems/politics.ts), which sums laws, value axes, the tradition of the realm's
// culture group and all timed and permanent modifiers. tests/effects_wired.test.ts checks that content uses no key
// missing here and that each key here has a reader in src/sim.
//
// unit: how the UI shows a value (its real size): 'pct' = × 100 %, 'pp' = percentage points (× 100), 'pts' = plain
// points, 'count' = whole number, 'share' = a level 0..1 shown in %, 'flag' = on/off, 'km' = × scale kilometres.
// scale: the value is multiplied by it before display (e.g. concord_gain counts 50 points of Concord target per 1.0).
// per: the effect is a change per month or per year. bad: more is worse. reader: where the simulation reads the key
// (the test checks that this file contains a lawEffect(…, 'key') call).

export type EffectUnit = 'pct' | 'pp' | 'pts' | 'count' | 'share' | 'flag' | 'km';
export interface EffectDef { unit: EffectUnit; scale?: number; per?: 'month' | 'year'; bad?: boolean; reader: string; prefix?: boolean }

const S = 'src/sim/systems/';
export const EFFECTS: Record<string, EffectDef> = {
  // ---- economy
  tax: { unit: 'pct', reader: S + 'economy.ts' },
  trade: { unit: 'pct', reader: S + 'economy.ts' },
  production: { unit: 'pct', reader: S + 'economy.ts' },
  quality: { unit: 'pct', reader: S + 'economy.ts' },
  growth: { unit: 'pct', reader: S + 'economy.ts' },
  literacy: { unit: 'pp', reader: S + 'economy.ts' },
  unrest: { unit: 'pts', bad: true, reader: S + 'economy.ts' },
  serfdom: { unit: 'share', bad: true, reader: S + 'economy.ts' },
  tolerance: { unit: 'share', reader: S + 'economy.ts' },
  tax_farming: { unit: 'flag', reader: S + 'economy.ts' },
  exempt_: { unit: 'share', prefix: true, reader: S + 'economy.ts' },
  hearth_exempt_nobles: { unit: 'share', reader: S + 'economy.ts' },
  interest: { unit: 'pp', bad: true, reader: S + 'economy.ts' },
  inflation_resist: { unit: 'pct', reader: S + 'economy.ts' },
  tariff_max: { unit: 'pp', reader: S + 'economy.ts' },
  innovation_block: { unit: 'pct', bad: true, reader: S + 'progress.ts' },
  // ---- state and estates
  admin: { unit: 'pct', reader: S + 'administration.ts' },
  control: { unit: 'pct', reader: S + 'society.ts' },
  integration: { unit: 'pct', reader: S + 'society.ts' },
  corruption: { unit: 'pp', scale: 0.01, per: 'month', bad: true, reader: S + 'politics.ts' },
  authority: { unit: 'pts', per: 'month', reader: S + 'politics.ts' },
  authority_gain: { unit: 'pct', reader: S + 'politics.ts' },
  concord: { unit: 'pts', reader: S + 'politics.ts' },
  concord_gain: { unit: 'pts', scale: 50, reader: S + 'politics.ts' },
  mandate: { unit: 'pts', reader: S + 'politics.ts' },
  mandate_gain: { unit: 'pts', scale: 100, reader: S + 'politics.ts' },
  prestige: { unit: 'pts', per: 'month', reader: S + 'politics.ts' },
  estate_power: { unit: 'pct', reader: S + 'politics.ts' },
  succession_strife: { unit: 'pp', scale: 0.3, bad: true, reader: S + 'politics.ts' },
  regency_strife: { unit: 'pts', scale: 20, bad: true, reader: S + 'politics.ts' },
  war_vote: { unit: 'flag', reader: S + 'war.ts' },
  research: { unit: 'pct', reader: S + 'progress.ts' },
  // ---- faith
  conversion: { unit: 'pct', reader: S + 'society.ts' },
  assimilation: { unit: 'pct', reader: S + 'society.ts' },
  agents: { unit: 'count', reader: S + 'society.ts' },
  reform_pressure: { unit: 'pct', bad: true, reader: 'src/sim/content/situations.ts' },
  curia: { unit: 'pts', per: 'year', reader: S + 'realm.ts' },
  // ---- diplomacy
  diplomacy: { unit: 'pct', reader: S + 'diplomacy.ts' },
  foreign_claims: { unit: 'pct', reader: S + 'administration.ts' },
  dread: { unit: 'pct', bad: true, reader: S + 'war.ts' },
  dread_decay: { unit: 'pts', scale: 0.1, per: 'month', reader: S + 'war.ts' },
  // ---- colonies
  colonise: { unit: 'pct', reader: S + 'colonial.ts' },
  colonial_range: { unit: 'km', scale: 1000, reader: S + 'colonial.ts' },
  colonial_growth: { unit: 'pct', reader: S + 'colonial.ts' },
  colonists: { unit: 'count', reader: S + 'colonial.ts' },
  // ---- military
  manpower: { unit: 'pct', reader: S + 'military.ts' },
  morale: { unit: 'pct', reader: S + 'military.ts' },
  discipline: { unit: 'pct', reader: S + 'military.ts' },
  fire: { unit: 'pct', reader: S + 'military.ts' },
  shock: { unit: 'pct', reader: S + 'military.ts' },
  cavalry: { unit: 'pct', reader: S + 'military.ts' },
  defence: { unit: 'pct', reader: S + 'military.ts' },
  speed: { unit: 'pct', reader: S + 'military.ts' },
  attrition: { unit: 'pct', bad: true, reader: S + 'military.ts' },
  siege: { unit: 'pts', reader: S + 'military.ts' },
  fort_strength: { unit: 'pct', reader: S + 'military.ts' },
  fort_cost: { unit: 'pct', bad: true, reader: S + 'military.ts' },
  army_cost: { unit: 'pct', bad: true, reader: S + 'military.ts' },
  mercenary_cost: { unit: 'pct', bad: true, reader: S + 'military.ts' },
  naval: { unit: 'pct', reader: S + 'military.ts' },
  naval_cost: { unit: 'pct', bad: true, reader: S + 'military.ts' },
  sailors: { unit: 'pct', reader: S + 'military.ts' },
  trade_raid: { unit: 'pct', reader: S + 'administration.ts' },
};

/** The registry entry of a key (exempt_<class> keys share one entry). */
export function effectDef(key: string): EffectDef | undefined {
  const d = EFFECTS[key]; if (d) return d;
  if (key.startsWith('exempt_')) return EFFECTS.exempt_;
  return undefined;
}
/** Only the effects the simulation reads, with their size as displayed (value × scale). */
export function workingEffects(fx: Record<string, number> | null | undefined): [string, number, EffectDef][] {
  const out: [string, number, EffectDef][] = [];
  for (const k in fx || {}) {
    const v = fx![k]; const d = effectDef(k);
    if (!d || typeof v !== 'number' || Math.abs(v) < 1e-9) continue;
    out.push([k, v * (d.scale ?? 1), d]);
  }
  return out;
}
