// The genes of the persons (src/sim/people/genes.ts, a port of portrait/src/dna.rs): founders from the gene pool of
// their city, children from their parents, the same bytes as the Rust original, and the upgrade of an older world.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { child, founder, origin, GENES, NG, ORIGINS, Origin } from '../src/sim/people/genes';
import { CITIES, genesOf } from '../src/sim/systems/people';
import { newWorldState } from '../tools/sim/load';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { STATE_VERSION } from '../src/sim/state';

const SKIN = GENES.indexOf('skin');
const { s, w } = newWorldState();
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

describe('the genes of the persons of a world founded in 1356', () => {
  it('are 68 bytes for every person', () => {
    expect(P.genes.length).toBeGreaterThanOrEqual(N * 2 * NG);
    expect(genesOf(s, N - 1).length).toBe(2 * NG);
  });
  it('of founders lie in the ranges of their city\'s pool', () => {
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
  it('of children come one allele from the father and one from the mother, moved by at most 15', () => {
    let n = 0;
    for (let id = 0; id < N; id++) {
      if (P.mother[id] < 0) continue;
      const c = genesOf(s, id), f = genesOf(s, P.father[id]), m = genesOf(s, P.mother[id]); n++;
      for (let i = 0; i < NG; i++) {
        const near = (x: number, a: number, b: number) => Math.abs(x - a) <= 15 || Math.abs(x - b) <= 15;
        expect(near(c[i], f[i], f[i + NG])).toBe(true);
        expect(near(c[i + NG], m[i], m[i + NG])).toBe(true);
      }
    }
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
    expect(Array.from(newWorldState(1356).s.person.cols.genes.slice(0, 680))).toEqual(Array.from(P.genes.slice(0, 680)));
  });
});

describe('an older world', () => {
  it('gets the genes by the upgrade, as a new world has them', () => {
    const old = decodeState(encodeState(s)) as any; delete old.person.cols.genes; old.v = 5;
    const up = upgradeState(decodeState(encodeState(old)), w);
    expect(up.v).toBe(STATE_VERSION);
    expect(hashState(up)).toBe(hashState(s));
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
    expect(g.founders.length).toBe(21); expect(g.children.length).toBe(12);
    for (const o of g.places) expect(origin(o.lon, o.lat)).toBe(o.origin);
    expect(g.origins).toEqual([...ORIGINS]);
  });
});
