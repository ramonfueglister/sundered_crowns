// The courts stay whole (spec points 37, 38): a son or daughter married abroad keeps a claim on the throne of the
// house they come from but never rules or inherits at home while they live at another court; no realm keeps a dead
// ruler, heir or consort; a house that marries away its last child passes the crown by the claim (personal union);
// an elected theocracy chooses among its men; a released realm bears arms of its own faith; and the AI's secret work
// stays out of the log other realms read.
// The long run is COURT_YEARS years (default 30, several minutes).
// Run: npx vitest run tests/court_integrity.test.ts
import { describe, it, expect } from 'vitest';
import { newGame } from '../tools/sim/load';
import { advanceDay } from '../src/sim/engine';
import { royalMatch, houseMember } from '../src/sim/systems/dynasty';
import { characterDies, ablestOfficial, nextInLine, newChar, settleCourts } from '../src/sim/systems/politics';
import { releaseNation, landFaith } from '../src/sim/systems/military';
import { genCoa } from '../src/sim/content/heraldry';
import { GROUP_OF, ALL_CULTURES, FAITHS } from '../src/sim/content/peoples';
import { poolIdOf } from '../src/sim/content/names';
import { aiRecord } from '../src/sim/systems/ai_log';
import { answer } from '../src/game/view';
import { LAWS, LAW_INDEX } from '../src/sim/content/laws';
import type { GameState, Nation } from '../src/sim/types';

const nat = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!;
const YEAR = 365;

/** Everything wrong with the courts right now: a ruler, heir or consort who is dead or lives at another court (a crown
 *  shared in personal union excepted), and a consort who is not the ruler's spouse. */
function courtFaults(s: GameState): string[] {
  const out: string[] = [];
  const inUnion = (n: Nation) => (n.overlord >= 0 && n.subjectType === 'personal_union') || s.nations.some((x) => x.alive && x.overlord === n.id && x.subjectType === 'personal_union');
  for (const n of s.nations) {
    if (!n.alive) continue;
    const r = s.chars[n.ruler];
    if (!r || !r.alive) out.push(`${n.key}: dead ruler ${r?.name}`);
    else if (r.nation !== n.id && !inUnion(n)) out.push(`${n.key}: ruled by ${r.name} of ${s.nations[r.nation]?.key}`);
    for (const [role, id] of [['heir', n.heir], ['consort', n.consort]] as const) {
      const c = id ? s.chars[id] : undefined; if (!c) continue;
      if (!c.alive) out.push(`${n.key}: dead ${role} ${c.name}`);
      else if (c.nation !== n.id && !inUnion(n)) out.push(`${n.key}: ${role} ${c.name} lives in ${s.nations[c.nation]?.key}`);
    }
    if (n.consort && r && r.spouse !== n.consort) out.push(`${n.key}: consort ${s.chars[n.consort]?.name} is not the spouse of ${r.name}`);
    for (const x of s.nations) if (x.alive && x.id !== n.id && n.consort && x.ruler === n.consort && !inUnion(n)) out.push(`${n.key}: consort rules ${x.key}`);
  }
  return out;
}

describe('a child married abroad', () => {
  it('a childless ruler marries away a sister, not an invented eldest child; the house passes by claim, and deaths clear every court', () => {
    const { s, w } = newGame(1356);
    const F = nat(s, 'faenza'), B = nat(s, 'bologna');
    const fr = s.chars[F.ruler], br = s.chars[B.ruler];
    if (fr.spouse) s.chars[fr.spouse].alive = false;
    F.consort = 0; br.children = []; B.heir = 0; B.laws.succession = 0;
    const m = royalMatch(s, w, F.id, B.id)!;
    expect(m.realm).toBe(F.id);
    const bride = s.chars[m.spouse];
    // a sister of Bologna's ruler (born into the house), not a child who would stand first in line
    expect(br.children).not.toContain(bride.id);
    expect(bride.nation).toBe(F.id);
    expect(bride.claims).toContain(B.id);
    characterDies(s, w, B, B.ruler);
    // the house died out: the claim passes the crown to Faenza's ruler in personal union, never to the bride alone
    const nr = s.chars[B.ruler];
    expect(nr.alive).toBe(true);
    expect(nr.id).not.toBe(bride.id);
    expect(nr.id === fr.id ? (B.overlord === F.id || F.overlord === B.id) : nr.nation === B.id).toBe(true);
    expect(courtFaults(s)).toEqual([]);
    // the bride dies at her husband's court: no realm keeps her as consort
    characterDies(s, w, F, bride.id);
    expect(F.consort).toBe(0); expect(B.consort).toBe(0);
    expect(courtFaults(s)).toEqual([]);
  });

  it('never marries away the next in line, a child older than the heir, an official or a commander', () => {
    const { s, w } = newGame(1356);
    const B = nat(s, 'castile'); const r = s.chars[B.ruler];
    B.laws.succession = LAWS[LAW_INDEX.succession].options.findIndex((o) => o.id === 'primogeniture');
    // two grown daughters and no son: male primogeniture names no heir, the elder daughter stands first in line
    r.children = []; B.heir = 0; r.father = undefined; r.mother = undefined;
    const d1 = newChar(s, B, { name: 'Elder', female: true, born: s.day - 22 * YEAR, father: r.id });
    const d2 = newChar(s, B, { name: 'Younger', female: true, born: s.day - 19 * YEAR, father: r.id });
    r.children.push(d1.id, d2.id);
    expect(nextInLine(s, B)).toBe(d1.id);
    expect(houseMember(s, B, true, s.day - 21 * YEAR)?.id).toBe(d2.id);
    // the younger daughter in office: neither is free, and no child born before an heir is invented
    B.council.chancellor = d2.id;
    const inv = houseMember(s, B, true, s.day - 21 * YEAR)!;
    expect([d1.id, d2.id]).not.toContain(inv.id);
    expect(r.children.includes(inv.id)).toBe(false); // no heir to come after: a sister of the ruler
    delete B.council.chancellor;
    const army = s.armies.find((a) => a.owner === B.id && !a.fleet)!; army.general = d2.id;
    expect(houseMember(s, B, true, s.day - 21 * YEAR)?.id).not.toBe(d2.id);
  });

  it('a son married abroad does not inherit at home, and his death leaves no realm with a dead consort', () => {
    const { s, w } = newGame(1356);
    const A = nat(s, 'aragon'); const ar = s.chars[A.ruler];
    A.laws.succession = LAWS[LAW_INDEX.succession].options.findIndex((o) => o.id === 'primogeniture');
    ar.children = []; A.heir = 0;
    const son = newChar(s, A, { name: 'Abroad', female: false, born: s.day - 25 * YEAR, father: ar.id });
    const son2 = newChar(s, A, { name: 'Home', female: false, born: s.day - 20 * YEAR, father: ar.id });
    ar.children.push(son.id, son2.id);
    const X = nat(s, 'navarre'); const xr = s.chars[X.ruler];
    // the elder son went to Navarre as the consort of its ruler (a queen for this test)
    xr.female = true; if (xr.spouse && s.chars[xr.spouse]) s.chars[xr.spouse].alive = false;
    son.nation = X.id; son.spouse = xr.id; xr.spouse = son.id; X.consort = son.id; son.claims = [A.id];
    characterDies(s, w, A, A.ruler);
    expect(A.ruler).toBe(son2.id);
    expect(A.consort === 0 || s.chars[A.consort].nation === A.id).toBe(true);
    expect(courtFaults(s)).toEqual([]);
    // the son dies, his death rolled at his father's old court: Navarre's consort falls vacant too
    characterDies(s, w, A, son.id);
    expect(X.consort).toBe(0);
    expect(courtFaults(s)).toEqual([]);
  });
});

describe('crowns that part', () => {
  it('a junior crown freed from a union chooses its own ruler; a ruler whose realm is gone brings the court along', () => {
    const { s, w } = newGame(1356);
    const A = nat(s, 'luxembourg'), L = nat(s, 'lorraine');
    // Lorraine inherited by Luxembourg's ruler, then freed by a peace: it still wears the other ruler's crown
    L.overlord = A.id; L.subjectType = 'personal_union'; L.ruler = A.ruler; L.heir = A.heir; L.consort = A.consort;
    settleCourts(s, w);
    expect(L.ruler).toBe(A.ruler);
    L.overlord = -1; L.subjectType = null;
    settleCourts(s, w);
    const r = s.chars[L.ruler];
    expect(r.id).not.toBe(A.ruler);
    expect(r.nation).toBe(L.id);
    expect(s.chars[A.ruler].nation).toBe(A.id);
    expect(L.consort).toBe(0);
    expect(courtFaults(s)).toEqual([]);
    // a pretender's realm is gone and its ruler wears this crown: the ruler and his consort now live here
    const P = nat(s, 'bar'); const pr = s.chars[P.ruler];
    P.alive = false; const B = nat(s, 'lorraine'); B.ruler = pr.id; B.consort = P.consort; B.heir = 0;
    settleCourts(s, w);
    expect(pr.nation).toBe(B.id);
    if (B.consort) expect(s.chars[B.consort].nation).toBe(B.id);
    expect(courtFaults(s).filter((f) => f.startsWith('lorraine'))).toEqual([]);
  });
});

describe('election to office', () => {
  it('a theocracy chooses among its men', () => {
    const { s } = newGame(1356);
    const n = s.nations.find((x) => x.alive && x.gov === 'theocracy')!;
    const best = newChar(s, n, { name: 'Able', female: true, born: s.day - 40 * YEAR, skills: [6, 6, 6] });
    n.candidates = [...(n.candidates ?? []), best.id];
    expect(ablestOfficial(s, n)?.female).toBe(false);
    n.gov = 'feudal_monarchy' as any;
    expect(ablestOfficial(s, n)?.id).toBe(best.id);
  });
});

describe('released realms', () => {
  it('bear arms of the faith of their own land (the Horde releasing Christian land draws no crescent)', () => {
    const { s, w } = newGame(1356);
    const G = nat(s, 'golden_horde');
    const locs: number[] = [];
    for (let i = 0; i < w.L && locs.length < 3; i++) if (s.loc.owner[i] === G.id && FAITHS[s.loc.faith[i]]?.family === 'christian' && poolIdOf(s.loc.culture[i]) === 'russian') locs.push(i);
    expect(locs.length).toBeGreaterThan(0);
    const culture = s.loc.culture[locs[0]];
    const lf = landFaith(s, locs);
    expect(FAITHS[lf]?.family).toBe('christian');
    const nn = releaseNation(s, w, G, locs, culture, lf);
    expect(nn.faith).toBe(lf);
    expect(nn.coa).toEqual(genCoa(nn.id * 7919 + s.seed, GROUP_OF[ALL_CULTURES[culture]] ?? 'other', false, w.names[locs[0]]));
    expect(nn.coa.charges.some((c: any) => c.type === 'crescent' || c.type === 'tughra_like')).toBe(false);
  });
});

describe('the AI log keeps secrets', () => {
  it('shows agents and forged claims to the realm itself and an observer, not to other realms', () => {
    const { s, w } = newGame(1356, 1356, []);
    const A = nat(s, 'france'), P = nat(s, 'england'), T = nat(s, 'bohemia');
    aiRecord(s, { t: 'spy', n: A.id, target: T.id, action: 'support_rebels' } as any, 'enemy');
    aiRecord(s, { t: 'diplo', n: A.id, target: T.id, action: 'fabricate' } as any, 'before_war');
    aiRecord(s, { t: 'diplo', n: A.id, target: P.id, action: 'alliance' } as any);
    const seen = (viewer: number) => answer(s, w, viewer, { q: 'nation', nation: A.id }).aiLog.map((e: any) => e.text.en).join(' | ');
    expect(seen(P.id)).not.toMatch(/rebels|claim/);
    expect(seen(P.id)).toMatch(/alliance/);
    expect(seen(T.id)).not.toMatch(/rebels|claim/);
    expect(seen(-1)).toMatch(/rebels/);
    expect(seen(-1)).toMatch(/claim/);
  });
});

describe('the courts in a long run', () => {
  const years = Number(process.env.COURT_YEARS ?? 30);
  it(`no realm keeps a dead or foreign ruler, heir or consort in ${years} years`, () => {
    const { s, w } = newGame(1356);
    const faults: string[] = [];
    for (let d = 1; d <= 365 * years; d++) {
      advanceDay(s, w);
      if (d % 365 === 0) for (const f of courtFaults(s)) faults.push(`${Math.floor(d / 365)}: ${f}`);
    }
    expect(faults).toEqual([]);
    // children married abroad are many; none of them rules or is heir at home
    let abroad = 0;
    for (const k in s.chars) { const c = s.chars[k]; if (c.alive && c.claims?.length && c.spouse) abroad++; }
    if (years >= 10) expect(abroad).toBeGreaterThan(0);
  }, 60 * 60 * 1000);
});
