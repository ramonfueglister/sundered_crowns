// The walls of the towns (settlement feature 6, docs/SETTLEMENT_DESIGN.md): the geometry of a ring and its gates
// (src/sim/settlement/walls.ts, wall_shape.ts), the sources (src/sim/content/walls.ts), the walls of a new world
// (src/sim/systems/walls.ts), the upgrade 40 → 41, what the world server tells, and the wall the graphic draws.
import { describe, it, expect } from 'vitest';
import { WALL_PIECE, holds, layRing, runOn, scaled, straddles } from '../src/sim/settlement/walls';
import { shapeAround } from '../src/sim/settlement/wall_shape';
import { unwalled, walledOf } from '../src/sim/content/walls';
import { planOf } from '../src/sim/content/town_plans';
import { citiesOf } from '../src/sim/content/cities';
import { ringsOf, townOf } from '../src/sim/systems/walls';
import { STATE_VERSION, type WorldState } from '../src/sim/state';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { townLots } from '../src/net/lots';
import { ringWall } from '../src/buildings';
import { newWorldState, loadSetup } from '../tools/sim/load';

const square = (h: number): [number, number][] => [
  [-h, -h],
  [h, -h],
  [h, h],
  [-h, h],
];

describe('the geometry of a ring', () => {
  it('tells what lies inside it and what reaches over it, and stretches it by area', () => {
    const r = square(10);
    expect(holds(r, [0, 0])).toBe(true);
    expect(holds(r, [11, 0])).toBe(false);
    expect(straddles(r, { x: 10, z: 0, w: 4, d: 4 })).toBe(true);
    expect(straddles(r, { x: 0, z: 0, w: 4, d: 4 })).toBe(false);
    expect(scaled(r, 0, 0, 4)[1]).toEqual([20, -20]);
  });
  it('has a gate where a way crosses it, a postern on a lane, and is open over water', () => {
    const r = square(50),
      way = { x0: 0, z0: 0, x1: 0, z1: -100, kind: 2 },
      lane = { x0: 0, z0: 0, x1: 100, z1: 0, kind: 0 };
    const pieces = layRing(r, () => true, [way, lane], 2, 8);
    expect(pieces.filter((p) => p.kind === WALL_PIECE.gate)).toHaveLength(1);
    expect(pieces.filter((p) => p.kind === WALL_PIECE.postern)).toHaveLength(1);
    const gate = pieces.find((p) => p.kind === WALL_PIECE.gate)!;
    expect(Math.hypot(gate.x1 - gate.x0, gate.z1 - gate.z0)).toBeCloseTo(8);
    // water along the south side: no wall there
    const wet = layRing(r, (_x, z) => z < 45, [], 2, 8);
    expect(wet.every((p) => Math.max(p.z0, p.z1) <= 50 && !(p.z0 === 50 && p.z1 === 50))).toBe(true);
  });
  it('lets a way that ends near it inside run on through it', () => {
    const r = square(50),
      ways = runOn(r, [{ x0: 0, z0: 0, x1: 0, z1: -45, kind: 2 }], 12);
    expect(ways).toHaveLength(2);
    expect(layRing(r, () => true, ways, 2, 8).some((p) => p.kind === WALL_PIECE.gate)).toBe(true);
    // a way that ends far inside the town stays there
    expect(runOn(r, [{ x0: 0, z0: 0, x1: 0, z1: -10, kind: 2 }], 12)).toHaveLength(1);
  });
  it('follows its town a margin off, keeps off a farmstead, and makes a ring for each piece of the town', () => {
    const house = { x: 0, z: 0, w: 20, d: 20 },
      far = { x: 300, z: 0, w: 20, d: 20 },
      farm = { x: 0, z: 26, w: 10, d: 10 };
    const [one] = shapeAround([house], [], 5, 15, 2);
    expect(holds(one, [0, 0])).toBe(true);
    expect(straddles(one, house)).toBe(false);
    expect(holds(one, [20, 0])).toBe(false);
    const [kept] = shapeAround([house], [farm], 5, 15, 2);
    expect(straddles(kept, farm)).toBe(false);
    expect(holds(kept, [farm.x, farm.z])).toBe(false);
    expect(shapeAround([house, far], [], 5, 15, 2)).toHaveLength(2);
  });
});

describe('the sources of the walls', () => {
  it('give the walled area of the towns Cesaretti et al. know, Venice none, and Paris the wall of Philippe Auguste', () => {
    const site = (name: string) => citiesOf(1291).find((c) => c.name === name)!.site;
    expect(walledOf(1291, site('Paris'))).toEqual({ walled: 250, settled: 800 });
    expect(walledOf(1291, site('Erfurt'))).toEqual({ walled: 133, settled: 133 });
    expect(unwalled(1291, site('Venice'))).toBe(true);
    expect(unwalled(1291, site('Paris'))).toBe(false);
    expect(planOf(1291, site('Paris'))?.wall?.length).toBeGreaterThan(8);
  });
});

const { s, w } = newWorldState(1291, 1291);
const W = s.wall.cols,
  cities = citiesOf(1291).filter((c) => townOf(s, c.site).parcels.length);
const piecesOf = (site: number) => {
  const out: number[] = [];
  for (let i = 0; i < s.wall.size; i++) if (s.wall.alive[i] && W.site[i] === site) out.push(i);
  return out;
};

describe('the walls of a new world of 1291', () => {
  it('stand round every town but Venice', () => {
    for (const c of cities) expect(piecesOf(c.site).length > 0, c.name).toBe(!unwalled(1291, c.site));
  });
  it('cut no farmstead, and no parcel and no landmark but where a real plan draws its wall', () => {
    let cut = 0;
    for (const c of cities) {
      if (unwalled(1291, c.site) || planOf(1291, c.site)?.wall) continue;
      const t = townOf(s, c.site),
        rings = ringsOf(s, c.site, t);
      for (const b of [...t.farms, ...t.parcels, ...t.core, ...t.edge]) if (rings.some((r) => straddles(r, b))) cut++;
    }
    expect(cut).toBe(0);
  });
  it('have gates where the ways leave the towns', () => {
    const gated = cities.filter((c) => piecesOf(c.site).some((i) => W.kind[i] === WALL_PIECE.gate));
    expect(gated.length).toBeGreaterThan(0.95 * (cities.length - 1));
  });
  it('hold only the walled share of a town the sources know, the suburbs outside', () => {
    const bristol = cities.find((c) => c.name === 'Bristol')!,
      t = townOf(s, bristol.site),
      rings = ringsOf(s, bristol.site, t),
      inside = t.parcels.filter((b) => rings.some((r) => holds(r, [b.x, b.z]))).length;
    expect(inside).toBeLessThan(t.parcels.length);
    expect(inside).toBeGreaterThan(0);
  });
  it('are the same after a snapshot, and are told by the world server with the rest of their town', () => {
    expect(hashState(decodeState(encodeState(s)))).toBe(hashState(s));
    const paris = cities.find((c) => c.name === 'Paris')!.site,
      v = townLots(s, paris),
      n = piecesOf(paris).length;
    expect(n).toBeGreaterThan(10);
    for (const k of Object.keys(v.walls) as (keyof typeof v.walls)[]) expect(v.walls[k].length).toBe(n);
  });
});

describe('a world of 1291 saved before the walls', () => {
  it('gets the walls of a new world', { timeout: 150_000 }, () => {
    const old = decodeState(encodeState(s)) as WorldState;
    old.v = 40;
    delete (old as Partial<WorldState>).wall;
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(1291));
    expect(up.v).toBe(STATE_VERSION);
    expect(up.wall.size).toBe(s.wall.size);
    expect(hashState(up)).toBe(hashState(s));
  });
});

describe('the wall the world graphic draws', () => {
  const pieces = [
    [0, 0, 40, 0, WALL_PIECE.wall],
    [40, 0, 44, 0, WALL_PIECE.gate],
    [44, 0, 80, 0, WALL_PIECE.wall],
    [80, 0, 80, 40, WALL_PIECE.wall],
  ];
  it('along the pieces of the ring, where the ground draws it', () => {
    const all = ringWall(pieces, () => 10),
      none = ringWall(pieces, () => null);
    expect(all.pos.length).toBeGreaterThan(0);
    expect(none.pos.length).toBe(0);
    const ys = all.pos.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBe(9);
    expect(Math.max(...ys)).toBeGreaterThan(12);
  });
});
