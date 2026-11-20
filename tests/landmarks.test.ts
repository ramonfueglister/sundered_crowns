// The landmarks of the land register (settlement feature 5, docs/SETTLEMENT_DESIGN.md): the rules
// (src/sim/settlement/landmarks.ts), the list of 1291 (src/sim/content/landmarks_1291.json), the register of a new
// world (src/sim/systems/landmarks.ts, lots.ts), the upgrade 32 → 33, what the world server tells, and what the world
// graphic draws (src/worldprobe/landmarks.ts).
import { describe, it, expect } from 'vitest';
import { BUILT, LANDMARK_KIND, NO_YEAR, ORDERS, URBAN, builtIn, ordersOf } from '../src/sim/settlement/landmarks';
import { namedOf, seeOf } from '../src/sim/content/landmarks';
import { LANDMARK_GAP, latinAt } from '../src/sim/systems/landmarks';
import { citiesOf } from '../src/sim/content/cities';
import { footprint } from '../src/sim/settlement/rule';
import { STATE_VERSION, LOT_KIND, STREET_KIND, type WorldState } from '../src/sim/state';
import { SCALE } from '../src/sim/scale';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { townLots, aloneLandmarks } from '../src/net/lots';
import { shownOf } from '../src/worldprobe/landmarks';
import { m, styleOf } from '../src/buildings';
import { newWorldState, loadSetup } from '../tools/sim/load';

describe('the rules of the landmarks', () => {
  it('build a landmark from its first year to its last, and keep a ruin a ruin', () => {
    expect(builtIn(1220, 1270, NO_YEAR, 1200).state).toBe(BUILT.not_yet);
    expect(builtIn(1220, 1270, NO_YEAR, 1245)).toEqual({ state: BUILT.building, share: 0.5 });
    expect(builtIn(1220, 1270, NO_YEAR, 1291).state).toBe(BUILT.standing);
    expect(builtIn(NO_YEAR, NO_YEAR, NO_YEAR, 1291).state).toBe(BUILT.standing);
    expect(builtIn(-280, -250, 1303, 1291).state).toBe(BUILT.standing);
    expect(builtIn(-280, -250, 1303, 1310).state).toBe(BUILT.ruin);
  });
  it('give a Latin town the convents of the orders it was large enough for, and draw it together as its people', () => {
    expect(ordersOf(1000)).toEqual([]);
    expect(ordersOf(5000)).toEqual([0, 1]);
    expect(ordersOf(100000)).toEqual(ORDERS.map((_, k) => k));
    expect(URBAN * URBAN * SCALE).toBeCloseTo(1, 9);
  });
});

describe('the landmarks of 1291', () => {
  const named = namedOf(1291), sites = new Set(citiesOf(1291).map((c) => c.site));
  it('stand in towns of 1291 or alone, at a real place, with a size and years that make sense', () => {
    const ids = new Set<string>();
    for (const n of named) {
      expect(ids.has(n.id)).toBe(false); ids.add(n.id);
      expect(n.kind).toBeGreaterThanOrEqual(0);
      if (n.site >= 0) expect(sites.has(n.site)).toBe(true);
      expect(Math.abs(n.lat)).toBeLessThan(70); expect(Math.abs(n.lon)).toBeLessThan(180);
      expect(n.l).toBeGreaterThanOrEqual(n.w);
      if (n.start !== NO_YEAR && n.end !== NO_YEAR) expect(n.end).toBeGreaterThanOrEqual(n.start);
      // only what had been begun by 1291 (the list was corrected for it: no Papal Palace, no Florence cathedral of today)
      if (n.start !== NO_YEAR) expect(n.start).toBeLessThanOrEqual(1291);
    }
    expect(named.length).toBeGreaterThan(50);
  });
  it('give the sees of the towns', () => {
    let sees = 0;
    for (const c of citiesOf(1291)) if (seeOf(1291, c.site)) sees++;
    expect(sees).toBeGreaterThan(300);
    expect(seeOf(1291, citiesOf(1291).find((c) => c.name === 'Paris')!.site)).toBe('bishop');
    expect(seeOf(1291, citiesOf(1291).find((c) => c.name === 'Cologne')!.site)).toBe('archbishop');
  });
});

const { s, w } = newWorldState(1291, 1291);

describe('the landmarks in the register of a world of 1291', () => {
  const M = s.landmark.cols, rows = Array.from({ length: s.landmark.size }, (_, i) => i), cities = citiesOf(1291);
  it('give every town with a see the church of its see, and every building known by name its place', () => {
    for (const c of cities) {
      const see = seeOf(1291, c.site);
      if (!see) continue;
      const kind = see === 'mosque' ? LANDMARK_KIND.mosque : see === 'orthodox' ? LANDMARK_KIND.orthodox : LANDMARK_KIND.cathedral;
      expect(rows.some((i) => M.site[i] === c.site && M.kind[i] === kind)).toBe(true);
    }
    namedOf(1291).forEach((n, k) => {
      if (n.kind === LANDMARK_KIND.convent && n.site >= 0) return; // a convent known by name is laid at the edge with the others
      expect(rows.filter((i) => M.named[i] === k).length).toBe(1);
    });
  });
  it('give the Latin towns their convents, and no other town any', () => {
    for (const c of cities) {
      const n = rows.filter((i) => M.site[i] === c.site && M.order[i] !== 255).length;
      expect(n).toBe(latinAt(s, c.place) ? ordersOf(c.people).length : 0);
    }
  });
  it('lie clear of each other, of the parcels and of the streets of their town', () => {
    const L = s.lot.cols, S = s.street.cols, box = (i: number) => ({ x: M.x[i], z: M.z[i], w: M.w[i], d: M.d[i] });
    const hit = (a: { x: number; z: number; w: number; d: number }, b: { x: number; z: number; w: number; d: number }, gap: number) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + gap;
    const bySite = new Map<number, number[]>();
    for (const i of rows) if (M.site[i] >= 0) bySite.set(M.site[i], [...(bySite.get(M.site[i]) ?? []), i]);
    let parcels = 0, streets = 0;
    for (const [site, mine] of bySite) {
      for (const a of mine) for (const b of mine) if (a < b) expect(hit(box(a), box(b), 0)).toBe(false);
      for (let i = 0; i < s.lot.size; i++) if (L.site[i] === site && L.kind[i] === LOT_KIND.parcel) {
        const f = footprint({ front: L.front[i] }, { w: L.w[i], d: L.d[i] }), p = { x: L.x[i], z: L.z[i], w: f.w, d: f.d };
        if (mine.some((a) => hit(box(a), p, 0))) parcels++;
      }
      for (let k = 0; k < s.street.size; k++) if (S.site[k] === site && S.kind[k] !== STREET_KIND.market) {
        const q = { x: (S.x0[k] + S.x1[k]) / 2, z: (S.z0[k] + S.z1[k]) / 2, w: Math.abs(S.x1[k] - S.x0[k]), d: Math.abs(S.z1[k] - S.z0[k]) };
        if (mine.some((a) => hit(box(a), q, -1))) streets++; // the line of a street, a metre into the landmark at most
      }
    }
    expect(parcels).toBe(0);
    expect(streets).toBe(0);
    expect(LANDMARK_GAP).toBeGreaterThan(0);
  });
  it('are the same from the same seed, survive a snapshot, and stand alone where they stood', () => {
    const t = decodeState(encodeState(s));
    expect(hashState(t)).toBe(hashState(s));
    expect(Array.from(t.landmark.cols.x.subarray(0, t.landmark.size))).toEqual(Array.from(M.x.subarray(0, s.landmark.size)));
    const alone = aloneLandmarks(s), lone = namedOf(1291).filter((n) => n.site < 0);
    expect(alone.kind.length).toBe(lone.length);
    lone.forEach((n, k) => { expect(alone.lat[k]).toBeCloseTo(n.lat, 4); expect(alone.lon[k]).toBeCloseTo(n.lon, 4); });
  });
  it('are told by the world server with the rest of their town', () => {
    const site = cities.find((c) => c.name === 'Paris')!.site, v = townLots(s, site), n = rows.filter((i) => M.site[i] === site).length;
    expect(n).toBeGreaterThan(3);
    for (const k of Object.keys(v.landmarks) as (keyof typeof v.landmarks)[]) expect(v.landmarks[k].length).toBe(n);
  });
});

describe('a world of 1291 saved before the landmarks', () => {
  it('gets the landmarks a new world has, and encodes as one', { timeout: 60_000 }, () => {
    const old = decodeState(encodeState(s)) as WorldState;
    old.v = 34;
    delete (old as Partial<WorldState>).landmark;
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(1291));
    expect(up.v).toBe(STATE_VERSION);
    expect(hashState(up)).toBe(hashState(s));
  });
});

describe('the landmarks the world graphic draws', () => {
  const style = styleOf('france'), files = new Map();
  it('at their real size, the long side east-west where the landmark is longer that way', () => {
    const shown = shownOf(LANDMARK_KIND.cathedral, -1, 128, 48, NO_YEAR, NO_YEAR, NO_YEAR, 1291, style, files)!;
    expect(shown.w).toBe(Math.round(m(128)));
    expect(shown.d).toBe(Math.round(m(48)));
  });
  it('not before it was begun, and a ruin low', () => {
    expect(shownOf(LANDMARK_KIND.cathedral, -1, 90, 32, 1300, 1350, NO_YEAR, 1291, style, files)).toBe(null);
    const whole = shownOf(LANDMARK_KIND.castle, -1, 60, 50, NO_YEAR, NO_YEAR, NO_YEAR, 1291, style, files)!;
    const ruin = shownOf(LANDMARK_KIND.castle, -1, 60, 50, NO_YEAR, NO_YEAR, 1200, 1291, style, files)!;
    expect(ruin.model.height).toBeLessThan(whole.model.height);
    // a castle is not raised as far as its ground is wide (CASTLE_TALL)
    expect(whole.model.height).toBeLessThanOrEqual(m(30) + 1e-9);
  });
});
