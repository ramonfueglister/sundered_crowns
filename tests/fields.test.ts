// Feature 4 of the settlement (docs/SETTLEMENT_DESIGN.md): the fields of the farmsteads. The arithmetic of courses,
// furlongs and strips, the ground they lie on, the fields in the land register of a world of 1291, the snapshot, the
// upgrade of an older world, what the world server tells of them and the farmstead's part of the harvest.
import { describe, it, expect } from 'vitest';
import { FIELD_LOT, GEWANN, GEWANN_HA, HA_PER_BLOCK, CROP, cropOf, hectaresOf, layFields, lotAt, lotCorner, slotsAround, stripOf, stripOrder, type Slot } from '../src/sim/settlement/fields';
import { compileTilth } from '../src/sim/content/tilth';
import { foundFields, placeFarmFields, farmHarvest, hamletStrips } from '../src/sim/systems/fields';
import { hamletBox, HAMLET_GAP } from '../src/sim/settlement/hamlets';
import { STATE_VERSION, LOT_KIND, NO_LOT, type WorldState } from '../src/sim/state';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { townLots } from '../src/net/lots';
import { personFarm } from '../src/net/people';
import { farmRows } from '../src/people/economy_rows';
import { newWorldState, loadSetup } from '../tools/sim/load';

describe('the courses of the rotation', () => {
  it('move on by one a year: winter corn, spring corn, fallow; corn and fallow in two courses', () => {
    expect([0, 1, 2, 3].map((y) => cropOf(0, 3, y))).toEqual([CROP.winter, CROP.spring, CROP.fallow, CROP.winter]);
    expect([0, 1, 2].map((z) => cropOf(z, 3, 1291))).toEqual([cropOf(0, 3, 1291), cropOf(1, 3, 1291), cropOf(2, 3, 1291)]);
    expect(new Set([0, 1, 2].map((z) => cropOf(z, 3, 1291)))).toEqual(new Set([CROP.winter, CROP.spring, CROP.fallow]));
    expect(new Set([0, 1].map((z) => cropOf(z, 2, 1291)))).toEqual(new Set([CROP.winter, CROP.fallow]));
  });
});

describe('a furlong', () => {
  it('is a field lot of the world graphic without its balk: 10 by 7 blocks of 125 m, 109.4 ha', () => {
    expect(GEWANN).toEqual({ w: FIELD_LOT.w - 1, d: FIELD_LOT.d - 1 });
    expect(HA_PER_BLOCK).toBeCloseTo(1.5625, 6);
    expect(GEWANN_HA).toBeCloseTo(109.375, 6);
    expect(hectaresOf(20, 14)).toBeCloseTo(GEWANN_HA, 6);
  });
  it('lies on the lots of the world graphic, every other row set off by half a lot', () => {
    for (const [lx, lz] of [[0, 0], [3, -2], [-7, 5], [12, 13]]) expect(lotAt(...lotCorner(lx, lz))).toEqual([lx, lz]);
    expect(lotCorner(0, 1)[0] - lotCorner(0, 0)[0]).toBe(5);
    expect(lotAt(lotCorner(2, 2)[0] + 1, lotCorner(2, 2)[1])).toBeNull();
  });
  it('is shared in strips of equal width, in the order of the farmsteads at the lane from the west (the sun division)', () => {
    const farms = [{ x: 5, z: -10 }, { x: -5, z: -10 }, { x: 5, z: 10 }, { x: -15, z: 10 }];
    expect(stripOrder(farms)).toEqual([3, 1, 0, 2]);
    const f = { x: 100, z: 0, w: 20, d: 14 }, strips = [0, 1, 2, 3].map((k) => stripOf(f, 4, k));
    expect(strips.map((q) => q.w)).toEqual([5, 5, 5, 5]);
    expect(strips.map((q) => q.x)).toEqual([92.5, 97.5, 102.5, 107.5]);
  });
});

describe('the fields of a hamlet', () => {
  const ring = slotsAround(400);
  const farms = (n: number, x: number, z: number) => Array.from({ length: n }, (_, i) => ({ x: x + (i >> 1) * 10, z: z + (i & 1 ? 20 : -20) }));
  it('hold the arable of its farmsteads exactly, in three courses of equal land, on the spots nearest to it', () => {
    const h = { x: 0, z: 0, farms: farms(9, 0, 0) }, laid = layFields([h], 2000, 3, ring);
    expect(laid.laid).toBeCloseTo(2000, 3);
    const per = [0, 1, 2].map((z) => laid.fields.filter((f) => f.zelge === z).reduce((a, f) => a + hectaresOf(f.w, f.d), 0));
    for (const p of per) expect(p).toBeCloseTo(2000 / 3, 3);
    expect(laid.fields.every((f) => f.farm === -1)).toBe(true);
    // nearest first: every spot left over lies at least as far as the farthest furlong
    const far = Math.max(...laid.fields.map((f) => Math.hypot(f.x, f.z))), used = new Set(laid.fields.map((f) => `${f.x - f.w / 2},${f.z - f.d / 2}`));
    for (const q of ring) if (!used.has(`${q.bx * 2},${q.bz * 2}`)) expect(Math.hypot((q.bx + 5) * 2, (q.bz + 3.5) * 2)).toBeGreaterThanOrEqual(far - 15);
  });
  it('share out the spots in turn among the hamlets of a town, so that each holds its land', () => {
    const a = { x: -100, z: 0, farms: farms(10, -100, 0) }, b = { x: 100, z: 0, farms: farms(8, 100, 0) }, laid = layFields([a, b], 3600, 3, ring);
    const of = (h: number) => laid.fields.filter((f) => f.hamlet === h).reduce((s, f) => s + hectaresOf(f.w, f.d), 0);
    expect(of(0)).toBeCloseTo(2000, 3);
    expect(of(1)).toBeCloseTo(1600, 3);
    const seen = new Set<string>();
    for (const f of laid.fields) { const k = `${f.x},${f.z}`; expect(seen.has(k)).toBe(false); seen.add(k); }
  });
  it('in two courses: every furlong to one farmstead, each holding its share, one course and the other in turn', () => {
    const h = { x: 0, z: 0, farms: farms(6, 0, 0) }, laid = layFields([h], 1500, 2, ring);
    for (let k = 0; k < 6; k++) {
      const mine = laid.fields.filter((f) => f.farm === k);
      expect(mine.reduce((s, f) => s + hectaresOf(f.w, f.d), 0)).toBeCloseTo(250, 3);
      expect(new Set(mine.map((f) => f.zelge))).toEqual(new Set([0, 1]));
    }
  });
  it('fall short where the ground does not hold them', () => {
    const few: Slot[] = ring.slice(0, 4), laid = layFields([{ x: 0, z: 0, farms: farms(10, 0, 0) }], 5000, 3, few);
    expect(laid.fields.length).toBe(4);
    expect(laid.laid).toBeCloseTo(4 * GEWANN_HA, 3);
    expect(laid.asked).toBe(5000);
  });
});

describe('the surveyed ground of the fields', () => {
  it('names the lots round a town that a furlong can lie on, from the town\'s centre block, and its courses', () => {
    // two lots in a row of three, the second row empty
    const t = compileTilth({ year: 1291, sites: [{ site: 4, wx: 100, wz: 50, dry: 1, lx0: 8, lz0: 6, cols: 3, rows: 2, cells: btoa(String.fromCharCode(0b101)) }] });
    expect(t.has(4)).toBe(true);
    expect(t.has(5)).toBe(false);
    expect(t.courses(4)).toBe(2);
    const [x0, z0] = lotCorner(8, 6), [x2] = lotCorner(10, 6);
    expect(t.slots(4)).toEqual([{ bx: x0 - 100, bz: z0 - 50 }, { bx: x2 - 100, bz: z0 - 50 }]);
  });
});

const { s, w } = newWorldState(1291, 1291);

describe('the fields of a world of 1291', () => {
  const C = s.field.cols, L = s.lot.cols, H = s.hamlets.cols, rows = Array.from({ length: s.field.size }, (_, i) => i);
  it('hold the arable of every place, an equal share to each of its farmsteads, but where the ground round a town is short', () => {
    const t = decodeState(encodeState(s)), found = foundFields(t, w.tilth);
    expect(found.laid / found.asked).toBeGreaterThan(0.97);
    expect(found.short.length).toBeLessThan(40);
    const byPlace = new Map<number, number>();
    for (const i of rows) byPlace.set(C.place[i], (byPlace.get(C.place[i]) ?? 0) + hectaresOf(C.w[i], C.d[i]));
    let checked = 0;
    for (const [place, ha] of byPlace) {
      const sites = new Set(rows.filter((i) => C.place[i] === place).map((i) => C.site[i]));
      if ([...sites].some((x) => found.short.includes(x))) continue;
      expect(ha / s.place.arable[place]).toBeCloseTo(1, 2);
      checked++;
    }
    expect(checked).toBeGreaterThan(400);
  });
  it('give every hamlet with arable its furlongs, in three courses of equal land north of the Mediterranean', () => {
    const per = new Map<number, number[]>();
    for (const i of rows) { const a = per.get(C.hamlet[i]) ?? [0, 0, 0]; a[C.zelge[i]] += hectaresOf(C.w[i], C.d[i]); per.set(C.hamlet[i], a); if (C.courses[i] === 3) expect(C.farm[i]).toBe(NO_LOT); else expect(L.kind[C.farm[i]]).toBe(LOT_KIND.farmstead); }
    let even = 0;
    for (const [h, a] of per) if (rows.some((i) => C.hamlet[i] === h && C.courses[i] === 3) && Math.abs(a[0] - a[1]) < 1e-3 * a[0] && Math.abs(a[1] - a[2]) < 1e-3 * a[0]) even++;
    expect(even).toBeGreaterThan(0.9 * [...per.keys()].filter((h) => rows.some((i) => C.hamlet[i] === h && C.courses[i] === 3)).length);
    for (let h = 0; h < s.hamlets.size; h++) if (s.place.arable[H.place[h]] > 0) expect(per.has(h)).toBe(true);
  });
  it('lie clear of each other and of every hamlet of their town', () => {
    const at = new Set<string>();
    for (const i of rows) { const k = `${C.site[i]}:${C.x[i] - C.w[i] / 2}:${C.z[i] - C.d[i] / 2}`; expect(at.has(k)).toBe(false); at.add(k); }
    for (let h = 0; h < s.hamlets.size; h++) {
      const b = hamletBox(H.farms[h]);
      for (const i of rows) if (C.site[i] === H.site[h]) expect(Math.abs(C.x[i] - H.x[h]) < (C.w[i] + b.w) / 2 + HAMLET_GAP && Math.abs(C.z[i] - C.d[i] / 2 + GEWANN.d - H.z[h]) < (GEWANN.d * 2 + b.d) / 2 + HAMLET_GAP).toBe(false); // the whole lot of a furlong, a shortened one too
    }
  });
  it('give each farmstead its strips and its part of the harvest: together the harvest of the place', () => {
    let h0 = 0;
    while (!(s.place.harvest[H.place[h0]] > 0)) h0++;
    const place = H.place[h0], fields = placeFarmFields(s, place);
    let all = 0;
    for (const f of fields.keys()) all += farmHarvest(s, f, fields);
    expect(all / s.place.harvest[place]).toBeCloseTo(1, 6);
    const order = hamletStrips(s, h0);
    expect(order.length).toBe(H.farms[h0]);
    expect(new Set(order.map((i) => L.hamlet[i]))).toEqual(new Set([h0]));
  });
  it('are the same from the same seed, survive a snapshot, and founding them again changes nothing', () => {
    const t = decodeState(encodeState(s));
    expect(hashState(t)).toBe(hashState(s));
    foundFields(t, w.tilth);
    expect(hashState(t)).toBe(hashState(s));
  });
});

describe('a world of 1291 saved before the fields', () => {
  it('gets the fields a new world has, and encodes as one', { timeout: 150_000 }, () => {
    const old = decodeState(encodeState(s)) as WorldState;
    old.v = 36;
    delete (old as Partial<WorldState>).field;
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(1291));
    expect(up.v).toBe(STATE_VERSION);
    expect(hashState(up)).toBe(hashState(s));
  });
});

describe('what the world tells of the fields', () => {
  const site = s.hamlets.cols.site[0];
  it('are the furlongs of the town\'s hamlets, with the order of the strips of each hamlet', () => {
    const t = townLots(s, site), n = Array.from({ length: s.field.size }, (_, i) => i).filter((i) => s.field.cols.site[i] === site).length;
    expect(t.fields.x.length).toBe(n);
    for (const k of Object.keys(t.fields) as (keyof typeof t.fields)[]) expect(t.fields[k].length).toBe(n);
    t.hamlets.id.forEach((h, k) => {
      expect(t.hamlets.strips[k]).toEqual(hamletStrips(s, h));
    });
  });
  it('to a person of a farmstead: its strips, its land and its part of the harvest', () => {
    const P = s.person.cols, F = s.family.cols;
    let id = -1;
    for (let i = 0; i < s.person.size && id < 0; i++) { const l = F.lot[P.family[i]]; if (l !== NO_LOT && s.lot.cols.kind[l] === LOT_KIND.farmstead && s.place.arable[s.lot.cols.place[l]] > 0) id = i; }
    const f = personFarm(s, id)!;
    expect(f.courses === 3 ? f.strips : f.furlongs).toBeGreaterThan(0);
    expect(f.hectares).toBeGreaterThan(0);
    expect(f.harvest).toBeGreaterThan(0);
    const rows = farmRows({ farm: f } as Parameters<typeof farmRows>[0]);
    expect(rows.map((r) => r[0])).toContain('Ackerland');
    let town = -1;
    for (let i = 0; i < s.person.size && town < 0; i++) { const l = F.lot[P.family[i]]; if (l !== NO_LOT && s.lot.cols.kind[l] === LOT_KIND.parcel) town = i; }
    expect(personFarm(s, town)).toBeNull();
  });
});
