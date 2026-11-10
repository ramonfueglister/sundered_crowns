// Real characters (spec points 37, 38, 68): names from each people's own pool, German regnal numbers and epithets,
// royal marriages with members of the partner house and the claims they pass on, the claimants to a throne whose
// house dies out, commanders chosen by the player or the AI who learn from battle, and released realms with a ruler
// of their people and arms of their own.
// Run: npx vitest run tests/people.test.ts
import { describe, it, expect } from 'vitest';
import { newGame } from '../tools/sim/load';
import { applyCommand } from '../src/sim/commands';
import { NAME_POOLS, poolIdOf, personName, localName, localHouse } from '../src/sim/content/names';
import { interpolate } from '../src/sim/systems/events';
import { royalMatch, inheritClaims, successionClaims, dynastyView, siblingsOf } from '../src/sim/systems/dynasty';
import { availableCommanders, commanderSkill, raiseGeneral, appointBest, battleLessons, generalCost, setCommander, pruneCharacters } from '../src/sim/systems/commanders';
import { releaseNation } from '../src/sim/systems/military';
import { commanders } from '../src/sim/systems/commanders';
import { newChar } from '../src/sim/systems/politics';
import { answer } from '../src/game/view';
import { serialize, deserialize, hashState, advanceDay } from '../src/sim/engine';
import { seedRng } from '../src/sim/rng';
import type { GameState, Nation } from '../src/sim/types';

const nat = (s: GameState, key: string) => s.nations.find((n) => n.key === key)!;

describe('names from the realm\'s own people', () => {
  const { s } = newGame(1356);
  // twelve and more peoples, each with its own pool
  const cases: [string, string][] = [['castile', 'castilian'], ['france', 'french'], ['venice', 'italian'], ['saxe_wittenberg', 'german'], ['england', 'english'],
    ['sweden', 'scandinavian'], ['bohemia', 'czech'], ['schweidnitz_jauer', 'polish'], ['novgorod', 'russian'], ['hungary', 'hungarian'], ['byzantium', 'greek'],
    ['ottoman', 'turkish'], ['mamluk', 'arabic'], ['muzaffarid', 'persian'], ['portugal', 'portuguese'], ['serbia', 'serbian']];
  it('maps at least twelve peoples to their own pools', () => {
    for (const [key, pool] of cases) expect([key, poolIdOf(nat(s, key).culture)]).toEqual([key, pool]);
    expect(new Set(cases.map((c) => c[1])).size).toBeGreaterThanOrEqual(12);
  });
  it('generals raised by a realm carry a given name of its people', () => {
    for (const [key, pool] of cases) {
      const n = nat(s, key); const P = NAME_POOLS[pool];
      for (let k = 0; k < 6; k++) {
        const g = raiseGeneral(s, n, true);
        const given = P.order === 'fg' ? g.name.split(' ').slice(-1)[0] : g.name.split(' ')[0];
        expect([key, P.m.some((x) => x === given || x.startsWith(given) || g.name.startsWith(x))]).toEqual([key, true]);
      }
    }
  });
  it('councillors and consorts come from the pool too, and no non-English name has an English title', () => {
    const rng = seedRng(42);
    for (const n of s.nations.filter((x) => x.alive)) {
      const pool = poolIdOf(n.culture); if (!pool || pool === 'english' || pool === 'gaelic') continue;
      for (let k = 0; k < 4; k++) {
        const p = personName(rng, n.culture, k % 2 === 1);
        expect([n.key, /\b(of|the|Lord|Lady|Sir)\b/.test(p.name)]).toEqual([n.key, false]);
      }
    }
    const pol = nat(s, 'schweidnitz_jauer');
    for (const id of Object.values(pol.council)) {
      const c = s.chars[id]; const first = c.name.split(' ')[0];
      expect(NAME_POOLS.polish.m.includes(first) || NAME_POOLS.polish.f.includes(first)).toBe(true);
    }
  });
});

describe('German regnal numbers and epithets', () => {
  it('translates the epithets of historic rulers', () => {
    expect(localName('Pedro I the Cruel', 'de')).toBe('Peter I. der Grausame');
    expect(localName('Casimir III the Great', 'de')).toBe('Kasimir III. der Große');
    expect(localName('Henry VI the Elder', 'de')).toBe('Heinrich VI. der Ältere');
    expect(localName('Henry V of Iron', 'de')).toBe('Heinrich V. der Eiserne');
    expect(localName('Louis II the Roman', 'de')).toBe('Ludwig II. der Römer');
    expect(localName('Margaret the Great', 'de', true)).toBe('Margarete die Große');
    expect(localName('Otto of Hesse', 'de')).toBe('Otto von Hessen');
    expect(localName('Charles, Dauphin and Duke of Normandy', 'de')).toBe('Karl, Dauphin und Herzog der Normandie');
    expect(localName('Maurice FitzGerald, 4th Earl of Kildare', 'de')).toBe('Maurice FitzGerald, 4. Graf von Kildare');
    expect(localName('Pedro I the Cruel', 'en')).toBe('Pedro I the Cruel');
    // fix-people: one German form per ruler, as German historians and the realm summaries write it
    expect(localName('Jean II le Bon', 'de')).toBe('Johann II. der Gute');
    expect(localName('Charles IV', 'de')).toBe('Karl IV.');
    expect(localName('John Henry, Margrave of Moravia', 'de')).toBe('Johann Heinrich, Markgraf von Mähren');
    expect(localName('Edward of Woodstock (the Black Prince)', 'de')).toBe('Eduard von Woodstock (der Schwarze Prinz)');
    expect(localName('Philippa of Hainaut', 'de', true)).toBe('Philippa von Hennegau');
    expect(localName('Joan the Lame', 'de', true)).toBe('Johanna die Lahme');
    expect(localName('Anna of Wallachia', 'de', true)).toBe('Anna von der Walachei');
    expect(localName('Council of Lübeck', 'de')).toBe('Rat von Lübeck');
    // a courtier of the name pools keeps the name of his people
    expect(localName('John Percy', 'de')).toBe('John Percy');
    expect(localName('Jean de Craon', 'de')).toBe('Jean de Craon');
    expect(localHouse('Luxembourg', 'de')).toBe('Luxemburg');
    expect(localHouse('Burgundy-Ivrea (Anscarid)', 'de')).toBe('Burgund-Ivrea (Anskarier)');
  });
  it('writes the ruler of an event in German', () => {
    const { s, w } = newGame(1356);
    const cas = nat(s, 'castile');
    expect(s.chars[cas.ruler].name).toMatch(/the Cruel/);
    const txt = interpolate(s, w, cas, {}, { en: '{ruler} rules.', de: '{ruler} herrscht.' });
    expect(txt.de).toBe('Peter I. der Grausame herrscht.');
    expect(txt.en).toBe('Pedro I the Cruel rules.');
  });
});

describe('royal marriages and claims', () => {
  it('the consort is a member of the partner\'s ruling house, and the children inherit a claim', () => {
    const { s, w } = newGame(1356);
    const A = nat(s, 'castile'), B = nat(s, 'portugal');
    const before = { [A.id]: A.consort, [B.id]: B.consort };
    const m = royalMatch(s, w, A.id, B.id);
    expect(m).toBeTruthy();
    const X = s.nations[m!.realm], Y = X.id === A.id ? B : A;
    const spouse = s.chars[m!.spouse], person = s.chars[m!.person];
    const yr = s.chars[Y.ruler];
    // a real son or daughter, brother or sister of the partner's ruler, of the partner's house
    expect(spouse.dynasty).toBe(yr.dynasty);
    expect(yr.children.includes(spouse.id) || siblingsOf(s, yr).some((c) => c.id === spouse.id)).toBe(true);
    expect(spouse.spouse).toBe(person.id); expect(person.spouse).toBe(spouse.id);
    expect(spouse.nation).toBe(X.id);
    expect(spouse.claims).toContain(Y.id);
    if (person.id === X.ruler) expect(X.consort).toBe(spouse.id); else expect(X.consort).toBe(before[X.id]);
    // a child of the couple carries the claim (never one on its own realm)
    const child = newChar(s, X, { name: 'Test', female: false, born: s.day, father: person.female ? spouse.id : person.id, mother: person.female ? person.id : spouse.id });
    inheritClaims(child, person, spouse);
    expect(child.claims).toContain(Y.id);
    expect(child.claims).not.toContain(X.id);
    // the partner's throne has a claimant by blood
    const cl = successionClaims(s, Y);
    expect(cl[0].nation).toBe(X.id);
    expect(cl[0].how).toBe('blood');
    expect(cl[0].rank).toBeGreaterThanOrEqual(3);
  });
  it('a marriage accepted through diplomacy weds real people', () => {
    const { s, w } = newGame(1356);
    const A = nat(s, 'aragon'), B = nat(s, 'navarre');
    const r = applyCommand(s, w, { t: 'diplo', n: A.id, action: 'marriage', target: B.id });
    expect(r.ok).toBe(true);
    for (let d = 0; d < 60 && !s.treaties.some((t) => t.type === 'marriage' && ((t.a === A.id && t.b === B.id) || (t.a === B.id && t.b === A.id))); d++) advanceDay(s, w);
    const wed = s.chronicle.some((c) => c.kind === 'marriage' && /married/.test(c.text.en) && (c.text.en.includes(A.short.en) || c.text.en.includes(B.short.en)));
    const treaty = s.treaties.some((t) => t.type === 'marriage' && ((t.a === A.id && t.b === B.id) || (t.a === B.id && t.b === A.id)));
    if (treaty) expect(wed).toBe(true);
  });
  it('shows the ruling house with its members and claimants', () => {
    const { s, w } = newGame(1356);
    const A = nat(s, 'castile'), B = nat(s, 'portugal');
    const m = royalMatch(s, w, A.id, B.id)!;
    const X = s.nations[m.realm], Y = X.id === A.id ? B : A;
    const v = dynastyView(s, X)!;
    expect(v.house).toBeTruthy();
    expect(v.members[0].rel).toBe('ruler');
    expect(v.members.some((x) => x.rel === 'consort' || x.rel === 'heir' || x.rel === 'child' || x.rel === 'sibling')).toBe(true);
    // the bride or groom is still a member of the house they come from, now at the other court, with a claim
    const vy = dynastyView(s, Y)!;
    const out = vy.members.find((x) => x.id === m.spouse)!;
    expect(out.abroad).toBe(X.id);
    expect(out.claims).toContain(Y.id);
    expect(vy.claimants[0].nation).toBe(X.id);
  });
});

describe('commanders', () => {
  const setup = () => {
    const { s, w } = newGame(1356);
    const n = nat(s, 'france'); s.playerNations = [n.id];
    const a = s.armies.find((x) => x.owner === n.id && !x.fleet)!;
    return { s, w, n, a };
  };
  it('the player picks a general from the court, with skills and traits shown', () => {
    const { s, w, n, a } = setup();
    const list = availableCommanders(s, n);
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.some((c) => c.id === n.ruler)).toBe(true);
    const pick = list.find((c) => c.id !== a.general)!;
    const r = applyCommand(s, w, { t: 'general', n: n.id, army: a.id, char: pick.id });
    expect(r.ok).toBe(true);
    expect(a.general).toBe(pick.id);
    const v = answer(s, w, n.id, { q: 'commanders', army: a.id });
    expect(v.current.id).toBe(pick.id);
    expect(v.list.find((c: any) => c.id === pick.id).busy.here).toBe(true);
    expect(v.list.every((c: any) => typeof c.skill === 'number' && Array.isArray(c.traits) && c.parts.skill.length >= 1)).toBe(true);
    // somebody from another realm cannot
    const foreign = s.chars[nat(s, 'england').ruler];
    expect(applyCommand(s, w, { t: 'general', n: n.id, army: a.id, char: foreign.id }).ok).toBe(false);
    // nor an official, who keeps to his office
    const official = s.chars[Object.values(n.council)[0]];
    const bad = applyCommand(s, w, { t: 'general', n: n.id, army: a.id, char: official.id });
    expect(bad.ok).toBe(false);
    expect(bad.err).toBe('cannot lead an army');
  });
  it('a new general is raised for gold', () => {
    const { s, w, n, a } = setup();
    n.treasury = 1e6;
    const cost = generalCost(s, n), before = n.treasury, gens = (n.generals ?? []).length;
    const r = applyCommand(s, w, { t: 'general', n: n.id, army: a.id, char: -1 });
    expect(r.ok).toBe(true);
    expect(n.treasury).toBeCloseTo(before - cost, 5);
    const g = s.chars[a.general];
    expect(g.role).toBe('general');
    expect(g.skills[2]).toBeGreaterThanOrEqual(2);
    expect((n.generals ?? []).length).toBe(gens + 1);
    n.treasury = 0;
    expect(applyCommand(s, w, { t: 'general', n: n.id, army: a.id, char: -1 }).ok).toBe(false);
  });
  it('the AI appoints the ablest free commander', () => {
    const { s, n, a } = setup();
    const best = raiseGeneral(s, n, true); best.skills[2] = 7; best.traits = ['tactician'];
    a.general = 0;
    const id = appointBest(s, n, a);
    expect(id).toBe(best.id);
    expect(commanderSkill(best)).toBe(8);
  });
  it('battles teach: experience, veteran, wounds', () => {
    const { s, n, a } = setup();
    const g = raiseGeneral(s, n, false); setCommander(s, n, a, g); g.traits = [];
    for (let k = 0; k < 4; k++) battleLessons(s, [a], []);
    expect(g.xp).toBe(8);
    expect(g.traits).toContain('veteran');
  });
  it('generals age and die, and the register drops people long dead', () => {
    const { s, w, n } = setup();
    const g = raiseGeneral(s, n, false); g.born = s.day - 66 * 365;
    for (let m = 0; m < 12 * 40 && g.alive; m++) { s.day += 30; commanders.monthly!({ s, w } as any); if (m === 60 && g.alive) expect(g.role).toBe('courtier'); }
    expect(g.alive).toBe(false);
    expect(n.generals).not.toContain(g.id);
    const old = newChar(s, n, { name: 'Forgotten', born: s.day - 120 * 365 }); old.alive = false; old.died = s.day - 12 * 365;
    pruneCharacters(s);
    expect(s.chars[old.id]).toBeUndefined();
  });
});

describe('released realms', () => {
  it('get a ruler of their people and a coat of arms', () => {
    const { s, w } = newGame(1356);
    const from = nat(s, 'golden_horde');
    const locs: number[] = []; for (let i = 0; i < w.L && locs.length < 3; i++) if (s.loc.owner[i] === from.id && s.loc.culture[i] !== from.culture) locs.push(i);
    expect(locs.length).toBeGreaterThan(0);
    const culture = s.loc.culture[locs[0]];
    const nn = releaseNation(s, w, from, locs, culture);
    expect(nn.coa).toBeTruthy();
    expect(nn.coa.field).toBeTruthy();
    expect(nn.coa.charges.length).toBeGreaterThan(0);
    const r = s.chars[nn.ruler];
    expect(r?.alive).toBe(true);
    expect(r.nation).toBe(nn.id);
    const pool = poolIdOf(culture);
    if (pool) { const P = NAME_POOLS[pool]; expect(P.m.some((x) => r.name.includes(x))).toBe(true); }
  });
});

describe('save and replay', () => {
  it('the new fields survive a save, and the game stays deterministic', () => {
    const run = () => { const { s, w } = newGame(1356); for (let d = 0; d < 70; d++) advanceDay(s, w); return { s, w }; };
    const a = run(), b = run();
    expect(hashState(a.s)).toBe(hashState(b.s));
    const c = deserialize(serialize(a.s));
    expect(hashState(c)).toBe(hashState(a.s));
    expect(c.nations.every((n: Nation) => Array.isArray(n.aiLog) && Array.isArray(n.generals))).toBe(true);
  }, 300000);
});
