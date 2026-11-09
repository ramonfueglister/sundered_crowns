// The AI uses every system the player has (spec points 95, 99): spies, preachers and officials, the estates'
// privileges, gifts and assembly, the council, the mint and its laws, all through the player's commands, chosen by
// the realm's situation; and what it did is kept in a log per realm.
// The long run is AI_YEARS years (default 10, which takes a few minutes; AI_YEARS=50 for the full check).
// Run: npx vitest run tests/ai_statecraft.test.ts
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { newGame } from '../tools/sim/load';
import { advanceDay } from '../src/sim/engine';
import { AI_USAGE, AI_USAGE_REALMS, resetAiUsage, aiLogText } from '../src/sim/systems/ai_log';
import { situation, coinage, estates, offices, espionage, lawWeights, reformScore, aiReforms } from '../src/sim/systems/ai_statecraft';
import { declareWar } from '../src/sim/systems/war';
import { answer } from '../src/game/view';
import type { GameState, Nation } from '../src/sim/types';

const nat = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!;
const last = (n: Nation) => n.aiLog![n.aiLog!.length - 1];

describe('statecraft rules', () => {
  it('debases the coin when deep in debt, and restores it when the treasury recovers', () => {
    const { s, w } = newGame(1356);
    const n = nat(s, 'aragon'); n.mandate = 60; n.inflation = 0; n.coinage = 0;
    n.loans = [0, 1, 2, 3].map(() => ({ amount: 100, rate: 0.05, due: s.day + 3650 } as any));
    coinage(s, w, n, situation(s, w, n, false));
    expect(n.coinage).toBeCloseTo(0.1, 5);
    expect(last(n).y).toBe('debt');
    n.loans = []; n.treasury = 1e6;
    coinage(s, w, n, situation(s, w, n, false));
    expect(n.coinage).toBe(0);
    expect(last(n).y).toBe('restore_coin');
    expect(aiLogText(s, w, last(n)).de).toBe('Vollwertige Münze wiederhergestellt (die Kasse hat sich erholt)');
  });
  it('revokes a privilege of an over-mighty estate, gives gifts to a restless one, summons the assembly for Authority', () => {
    const { s, w } = newGame(1356);
    const n = nat(s, 'hungary');
    for (const e of n.estates) e.contentment = 60;
    const mag = n.estates.find((e) => e.id === 'magnates')!;
    mag.privileges = ['magnate_command']; mag.influence = 66; mag.contentment = 75; n.authority = 100;
    estates(s, w, n, situation(s, w, n, false));
    expect(mag.privileges).not.toContain('magnate_command');
    expect(last(n).c).toMatchObject({ t: 'estate', action: 'revoke' });
    const com = n.estates.find((e) => e.id === 'commons')!;
    com.contentment = 20; com.influence = 40; n.treasury = 1e5;
    estates(s, w, n, situation(s, w, n, false));
    expect(last(n).c).toMatchObject({ t: 'estate', action: 'appease', estate: 'commons' });
    n.authority = 5; n.flags.assembly = 0;
    for (const e of n.estates) e.contentment = 70;
    estates(s, w, n, situation(s, w, n, false));
    expect(last(n).c).toMatchObject({ t: 'estate', action: 'summon' });
    expect(n.authority).toBeGreaterThan(25);
  });
  it('fills a vacant office with the ablest person at court', () => {
    const { s, w } = newGame(1356);
    const n = nat(s, 'france'); n.authority = 100;
    delete n.council.marshal;
    offices(s, w, n);
    expect(n.council.marshal).toBeTruthy();
    expect(last(n)).toMatchObject({ y: 'vacant', c: { t: 'office', office: 'marshal' } });
  });
  it('stirs up rebels against the enemy whose war it leads', () => {
    const { s, w } = newGame(1356);
    const a = nat(s, 'hungary'), b = nat(s, 'serbia');
    s.wars = s.wars.filter((x) => !x.att.includes(a.id) && !x.def.includes(a.id));
    declareWar(s, w, a.id, b.id, 'conquest');
    a.treasury = 1e5; a.personality = 'opportunist';
    for (let k = 0; k < 200 && !s.spies.some((x) => x.nation === a.id); k++) espionage(s, w, a, situation(s, w, a, true));
    const sp = s.spies.find((x) => x.nation === a.id);
    expect(sp).toBeTruthy();
    expect(sp!.action).toBe('support_rebels');
    const war = s.wars.find((x) => x.attLead === a.id || x.defLead === a.id)!;
    expect(sp!.target).toBe(war.attLead === a.id ? war.defLead : war.attLead);
  });
  it('chooses laws by the situation, not by fixed preferences', () => {
    const { s, w } = newGame(1356);
    const n = nat(s, 'castile');
    const calm = situation(s, w, n, false);
    const indebted = { ...calm, loans: 5, deficit: true };
    const tax = (sit: typeof calm) => reformScore(n, 'taxation', 2, lawWeights(n, sit)).v;
    expect(tax(indebted)).toBeGreaterThan(tax(calm));
    const manyFaiths = { ...calm, foreignFaith: 0.5 };
    const tol = (sit: typeof calm) => reformScore(n, 'tolerance', 2, lawWeights(n, sit)).v;
    expect(tol(manyFaiths)).toBeGreaterThan(tol(calm));
    n.personality = 'zealot';
    expect(reformScore(n, 'tolerance', 2, lawWeights(n, manyFaiths)).v).toBeLessThan(tol(manyFaiths) + 1e-9);
    n.personality = 'builder'; n.authority = 300; n.reform = undefined as any; n.flags.ai_reform = 0;
    expect(aiReforms(s, w, n, false)).toBe(true);
    expect(n.reform).toBeTruthy();
    expect(last(n).y).toMatch(/^rf:/);
  });
});

describe('the AI uses every system in a long run', () => {
  const years = Number(process.env.AI_YEARS ?? 10);
  it(`uses each system in ${years} years, across the kinds of realm`, () => {
    const { s, w } = newGame(1356);
    resetAiUsage();
    for (let d = 0; d < 365 * years; d++) advanceDay(s, w);
    const kind = (n: Nation) => (n.gov.includes('monarchy') ? 'monarchy' : n.gov.includes('republic') ? 'republic' : n.gov === 'theocracy' || n.gov === 'military_order' ? 'theocracy' : 'tribal');
    const kindsOf = (k: string) => new Set<string>([...(AI_USAGE_REALMS[k] ?? [])].map((id) => kind(s.nations[id])));
    const table = Object.fromEntries(Object.keys(AI_USAGE).sort().map((k) => [k, `${AI_USAGE[k]} by ${AI_USAGE_REALMS[k].size} [${[...kindsOf(k)].join(',')}]`]));
    if (process.env.AI_USAGE_OUT) writeFileSync(process.env.AI_USAGE_OUT, JSON.stringify(table, null, 1));
    const need: [string, string[]][] = [
      ['office', ['monarchy', 'republic', 'theocracy']], ['law', ['monarchy', 'republic', 'theocracy']],
      ['estate:appease', ['monarchy']], ['estate:grant', ['monarchy']], ['estate:summon', ['monarchy']],
      ['coinage:debase', ['monarchy']], ['agent:faith', ['monarchy']], ['agent:culture', ['monarchy']],
      ['spy:slander', ['monarchy', 'republic']], ['spy:support_rebels', ['monarchy']], ['spy:steal_tech', ['monarchy', 'republic']], ['spy:fabricate', ['monarchy']],
      ['diplo:fabricate', ['monarchy']], ['decision', []],
    ];
    if (years >= 50) need.push(['estate:revoke', ['monarchy']], ['coinage:restore', ['monarchy']]);
    for (const [k, kinds] of need) {
      expect([k, (AI_USAGE[k] ?? 0) > 0]).toEqual([k, true]);
      for (const kd of kinds) expect([k, kd, kindsOf(k).has(kd)]).toEqual([k, kd, true]);
    }
    // each AI realm's log is short, bilingual and shown in its panel
    const n = s.nations.find((x) => x.alive && (x.aiLog?.length ?? 0) >= 5)!;
    expect(n.aiLog!.length).toBeLessThanOrEqual(20);
    const d = answer(s, w, -1, { q: 'nation', nation: n.id });
    expect(d.aiLog.length).toBe(n.aiLog!.length);
    for (const e of d.aiLog) { expect(e.text.en).toBeTruthy(); expect(e.text.de).toBeTruthy(); expect(e.text.de).not.toMatch(/—/); }
  }, 60 * 60 * 1000);
});
