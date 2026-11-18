// The genes of the persons (src/sim/people/genes.ts, a port of portrait/src/dna.rs): founders from the gene pool of
// their culture (src/sim/people/pools.ts), children from their parents, the same bytes as the Rust original, and the
// upgrade of an older world.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { child, founder, origin, GENES, NG, ORIGINS, Origin } from '../src/sim/people/genes';
import { CITIES, genesOf, giveGenes } from '../src/sim/systems/people';
import { dressOf, poolOf, poolOfCulture } from '../src/sim/people/pools';
import { ALL_CULTURES } from '../src/sim/content/peoples';
import { STATE_VERSION } from '../src/sim/state';
import { upgradeState } from '../src/sim/upgrade';
import { hashState } from '../src/sim/snapshot';
import { newWorldState } from '../tools/sim/load';

const SKIN = GENES.indexOf('skin');
const { s } = newWorldState();
const P = s.person.cols, N = s.person.size;
const placeOf = (id: number) => s.family.cols.place[P.family[id]];

describe('the gene pools', () => {
  it('are those of dna.rs for known places', () => {
    expect(origin(2.35, 48.85)).toBe(Origin.Gallia); // Paris
    expect(origin(6.96, 50.94)).toBe(Origin.Germania); // Cologne
    expect(origin(29.9, 31.2)).toBe(Origin.Aegyptus); // Alexandria
    expect(origin(28.98, 41.0)).toBe(Origin.Graecia); // Constantinople
    expect(origin(-5.8, 35.8)).toBe(Origin.Africa); // Tangier
  });
});

describe('the pool of a culture', () => {
  it('is known for every culture of the game but the unknown one, which draws by the place', () => {
    for (const c of ALL_CULTURES) {
      if (c === 'unknown') expect(poolOfCulture(c)).toBeUndefined();
      else expect(poolOfCulture(c), c).toBeGreaterThanOrEqual(0);
    }
    expect(poolOf('unknown', 2.35, 48.85)).toBe(Origin.Gallia); // by the place: Paris
    expect(poolOf(undefined, 29.9, 31.2)).toBe(Origin.Aegyptus);
  });
  it('is that of the people, wherever they live', () => {
    expect(poolOf('english', 116.4, 39.9)).toBe(Origin.Gallia); // an Englishman in Beijing
    expect(poolOfCulture('han')).toBe(Origin.China); expect(poolOfCulture('mongol')).toBe(Origin.Siberia);
    expect(poolOfCulture('yoruba')).toBe(Origin.Guinea); expect(poolOfCulture('amhara')).toBe(Origin.Horn);
    expect(poolOfCulture('khoisan')).toBe(Origin.Kalahari); expect(poolOfCulture('tamil')).toBe(Origin.Deccan);
    expect(poolOfCulture('nahua')).toBe(Origin.America); expect(poolOfCulture('inuit')).toBe(Origin.Siberia);
    expect(poolOfCulture('egyptian_arab')).toBe(Origin.Aegyptus); expect(poolOfCulture('bedouin')).toBe(Origin.Arabia);
    expect(poolOfCulture('ashkenazi')).toBe(Origin.Graecia); expect(poolOfCulture('swedish')).toBe(Origin.Germania);
  });
  it('is used by every pool but the Roman province of Africa, and names a pool that exists', () => {
    const used = new Set(ALL_CULTURES.map((c) => poolOfCulture(c)).filter((o) => o !== undefined));
    for (let o = 0; o < ORIGINS.length; o++) expect(used.has(o), ORIGINS[o]).toBe(o !== Origin.Africa);
  });
  it('goes with a dress: England\'s for the Latin west, a culture\'s own name for everybody else', () => {
    for (const c of ['english', 'french', 'bavarian', 'tuscan', 'castilian', 'swedish']) expect(dressOf(c)).toBe('England');
    for (const c of ['andalusi', 'greek', 'han', 'yoruba', 'polish', 'unknown']) expect(dressOf(c)).toBe(c);
  });
});

describe('the genes of the persons of a world founded in 1356', () => {
  it('are 100 bytes for every person', () => {
    expect(P.genes.length).toBeGreaterThanOrEqual(N * 2 * NG);
    expect(genesOf(s, N - 1).length).toBe(2 * NG);
  });
  it('of founders lie in the ranges of the pool of their culture', () => {
    const range = (city: string, lo: number, hi: number) => {
      const place = CITIES.find((c) => c.name === city)!.place;
      let n = 0;
      for (let id = 0; id < N; id++) if (placeOf(id) === place && P.mother[id] < 0) {
        const g = genesOf(s, id); n++;
        expect(g[SKIN]).toBeGreaterThanOrEqual(lo); expect(g[SKIN]).toBeLessThanOrEqual(hi);
        expect(g[SKIN + NG]).toBeGreaterThanOrEqual(lo); expect(g[SKIN + NG]).toBeLessThanOrEqual(hi);
      }
      expect(n).toBeGreaterThan(100);
    };
    range('Paris', 0, 80); // Gallia
    range('Cairo', 100, 190); // Aegyptus
  });
  it('come anew by the upgrade from 24, whose founders drew by the place: as in a world founded now', () => {
    const { s: old, w } = newWorldState();
    const before = hashState(old);
    // (a world up to version 25 carries 34 genes a person, 68 bytes: the upgrade lays the column out for 50)
    old.v = 24; (old.person.cols as { genes: Uint8Array }).genes = new Uint8Array(old.person.alive.length * 68).fill(7);
    expect(hashState(old)).not.toBe(before);
    const up = upgradeState(old, w);
    expect(up.v).toBe(STATE_VERSION);
    expect(hashState(up)).toBe(before);
  }, 60_000);
  it('are given to those born since in the order of their births', () => {
    // a grandchild with a number below its parents': the parents' genes are given before the grandchild takes them
    const { s: t } = newWorldState();
    const T = t.person.cols, kid = (() => { for (let id = 0; id < t.person.size; id++) if (T.mother[id] >= 0) return id; return -1; })();
    const other = (() => { for (let id = kid + 1; id < t.person.size; id++) if (T.mother[id] >= 0 && T.sex[id] !== T.sex[kid]) return id; return -1; })();
    const [fa, mo] = T.sex[kid] === 1 ? [kid, other] : [other, kid];
    const grand = (() => { for (let id = 0; id < t.person.size; id++) if (T.mother[id] < 0 && id !== T.mother[fa] && id !== T.father[fa] && id !== T.mother[mo] && id !== T.father[mo]) return id; return -1; })();
    T.mother[grand] = mo; T.father[grand] = fa; T.born[grand] = Math.max(T.born[fa], T.born[mo]) + 6000;
    giveGenes(t);
    const c = genesOf(t, grand), f = genesOf(t, fa), m = genesOf(t, mo);
    for (let i = 0; i < NG; i++) {
      const near = (x: number, a: number, b: number) => Math.abs(x - a) <= 15 || Math.abs(x - b) <= 15;
      expect(near(c[i], f[i], f[i + NG])).toBe(true); expect(near(c[i + NG], m[i], m[i + NG])).toBe(true);
    }
  });
  it('of children come one allele from the father and one from the mother, moved by at most 15', () => {
    let n = 0, far = 0; // counted, not one expect per allele: 100 alleles a child since portrait round 112
    const near = (x: number, a: number, b: number) => Math.abs(x - a) <= 15 || Math.abs(x - b) <= 15;
    for (let id = 0; id < N; id++) {
      if (P.mother[id] < 0) continue;
      const c = genesOf(s, id), f = genesOf(s, P.father[id]), m = genesOf(s, P.mother[id]); n++;
      for (let i = 0; i < NG; i++) {
        if (!near(c[i], f[i], f[i + NG])) far++;
        if (!near(c[i + NG], m[i], m[i + NG])) far++;
      }
    }
    expect(far).toBe(0);
    expect(n).toBeGreaterThan(5000);
  });
  it('make siblings look alike: their skin is far closer than that of two strangers of the same city', () => {
    const shown = (id: number) => (genesOf(s, id)[SKIN] + genesOf(s, id)[SKIN + NG]) / 2;
    const byFamily = new Map<number, number[]>();
    for (let id = 0; id < N; id++) if (P.mother[id] >= 0) byFamily.set(P.family[id], [...(byFamily.get(P.family[id]) ?? []), id]);
    let sib = 0, ns = 0, str = 0, nt = 0;
    const kids = [...byFamily.values()].filter((k) => k.length >= 2);
    for (let i = 0; i < kids.length; i++) {
      sib += Math.abs(shown(kids[i][0]) - shown(kids[i][1])); ns++;
      const j = (i + 1) % kids.length;
      if (placeOf(kids[i][0]) === placeOf(kids[j][0])) { str += Math.abs(shown(kids[i][0]) - shown(kids[j][0])); nt++; }
    }
    expect(ns).toBeGreaterThan(500);
    expect(sib / ns).toBeLessThan(0.75 * (str / nt));
  });
  it('are the same for the same seed', () => {
    expect(Array.from(newWorldState(1356).s.person.cols.genes.slice(0, 1000))).toEqual(Array.from(P.genes.slice(0, 1000)));
  });
});

// Golden vectors written by the Rust original (portrait thread, tests/portrait/genes_golden.json): the same random bits
// must give the same bytes in both. Skipped until the file exists on this branch.
const GOLDEN = 'tests/portrait/genes_golden.json';
describe.skipIf(!existsSync(GOLDEN))('the port', () => {
  it('gives the bytes of portrait/src/dna.rs', () => {
    const g = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    const bits = (list: string[]) => (k: number) => BigInt(`0x${list[k]}`);
    for (const f of g.founders) expect(Array.from(founder(f.origin, bits(f.draws)))).toEqual(f.dna);
    for (const c of g.children) expect(Array.from(child(c.father, c.mother, bits(c.draws)))).toEqual(c.dna);
    expect(g.founders.length).toBe(3 * ORIGINS.length); expect(g.children.length).toBe(12);
    for (const o of g.places) expect(origin(o.lon, o.lat)).toBe(o.origin);
    expect(g.origins).toEqual([...ORIGINS]);
  });
});
