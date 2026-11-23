// The bridges of the towns (settlement feature 7, docs/SETTLEMENT_DESIGN.md): the geometry of a crossing
// (src/sim/settlement/bridges.ts), the sources (src/sim/content/bridges.ts), the bridges of a new world
// (src/sim/systems/bridges.ts), the upgrade 41 → 42, what the world server tells, and the bridge the graphic draws.
import { describe, it, expect } from 'vitest';
import { BRIDGE_KIND, bridgesOf } from '../src/sim/settlement/bridges';
import { ferried, namedBridges } from '../src/sim/content/bridges';
import { citiesOf } from '../src/sim/content/cities';
import { STATE_VERSION, type WorldState } from '../src/sim/state';
import { encodeState, decodeState, hashState } from '../src/sim/snapshot';
import { upgradeState } from '../src/sim/upgrade';
import { townLots } from '../src/net/lots';
import { townBridge } from '../src/buildings';
import { newWorldState, loadSetup } from '../tools/sim/load';

describe('the geometry of a crossing', () => {
  // a river from x = 10 to x = 30, dry ground beyond it up to x = 60, then the sea
  const river = (x: number) => x >= 10 && x < 30,
    dry = (x: number) => x < 10 || (x >= 30 && x < 60);
  const way = { x0: 0, z0: 0, x1: 8, z1: 0, kind: 2 };
  it('takes a way that ends at a river over it to the dry bank', () => {
    const [b] = bridgesOf([way], river, dry, 4, 1, 100);
    expect(b.x0).toBe(8);
    expect(b.x1).toBe(30);
    expect(b.span).toBe(20);
  });
  it('builds none for a lane, a way that goes on, water that ends in the sea or a river too far off', () => {
    expect(bridgesOf([{ ...way, kind: 0 }], river, dry, 4, 1, 100)).toHaveLength(0);
    expect(bridgesOf([way, { x0: 8, z0: 0, x1: 8, z1: 20, kind: 2 }], river, dry, 4, 1, 100)).toHaveLength(0);
    expect(
      bridgesOf(
        [way],
        (x) => x >= 10,
        () => false,
        4,
        1,
        100,
      ),
    ).toHaveLength(0);
    expect(bridgesOf([{ ...way, x1: 2 }], river, dry, 4, 1, 100)).toHaveLength(0);
  });
  it('gives two streets that meet over one river one bridge', () => {
    const other = { x0: 40, z0: 0, x1: 32, z1: 0, kind: 2 };
    expect(bridgesOf([way, other], river, dry, 4, 1, 100)).toHaveLength(1);
  });
});

describe('the sources of the bridges', () => {
  it('name London Bridge of stone with houses, the Rialto of timber, and Cologne crossed by ferry', () => {
    const site = (name: string) => citiesOf(1291).find((c) => c.name === name)!.site,
      named = namedBridges(1291);
    const london = named.find((n) => n.site === site('London'))!;
    expect(london.stone && london.houses).toBe(true);
    expect(named.find((n) => n.site === site('Venice'))?.stone).toBe(false);
    expect(ferried(1291, site('Cologne'))).toBe(true);
    expect(ferried(1291, site('London'))).toBe(false);
  });
});

const { s, w } = newWorldState(1291, 1291);
const B = s.bridge.cols,
  alive = [...Array(s.bridge.size).keys()].filter((i) => s.bridge.alive[i]);

describe('the bridges of a new world of 1291', () => {
  it('cross the rivers of the towns, of timber but where a source says stone', () => {
    expect(alive.length).toBeGreaterThan(100);
    const stone = alive.filter((i) => B.kind[i] === BRIDGE_KIND.stone);
    expect(stone.length).toBeGreaterThan(0);
    for (const i of stone) expect(namedBridges(1291)[B.named[i]]?.stone).toBe(true);
  });
  it('give London its bridge, and no wide crossing where the sources say ferry', () => {
    const site = (name: string) => citiesOf(1291).find((c) => c.name === name)!.site;
    expect(alive.some((i) => B.site[i] === site('London') && B.named[i] >= 0)).toBe(true);
    for (const i of alive)
      if (ferried(1291, B.site[i])) expect(Math.hypot(B.x1[i] - B.x0[i], B.z1[i] - B.z0[i])).toBeLessThan(200);
  });
  it('are the same after a snapshot, and are told by the world server with the rest of their town', () => {
    expect(hashState(decodeState(encodeState(s)))).toBe(hashState(s));
    const site = B.site[alive[0]],
      v = townLots(s, site),
      n = alive.filter((i) => B.site[i] === site).length;
    for (const k of Object.keys(v.bridges) as (keyof typeof v.bridges)[]) expect(v.bridges[k].length).toBe(n);
  });
});

describe('a world of 1291 saved before the bridges', () => {
  it('gets the bridges of a new world', { timeout: 150_000 }, () => {
    const old = decodeState(encodeState(s)) as WorldState;
    old.v = 41;
    delete (old as Partial<WorldState>).bridge;
    const up = upgradeState(decodeState(encodeState(old)), w, () => loadSetup(1291));
    expect(up.v).toBe(STATE_VERSION);
    expect(up.bridge.size).toBe(s.bridge.size);
    expect(hashState(up)).toBe(hashState(s));
  });
});

describe('the bridge the world graphic draws', () => {
  const rows = [
    [0, 0, 40, 0, BRIDGE_KIND.stone, 1],
    [0, 10, 0, 30, BRIDGE_KIND.timber, 0],
  ];
  it('from bank to bank above the higher bank, by the piece of the world its middle lies on', () => {
    const all = townBridge(
        rows,
        3,
        () => 10,
        () => true,
      ),
      none = townBridge(
        rows,
        3,
        () => 10,
        () => false,
      ),
      timber = townBridge(
        [rows[1]],
        3,
        () => 10,
        () => true,
      );
    expect(all.pos.length).toBeGreaterThan(timber.pos.length);
    expect(none.pos.length).toBe(0);
    const ys = all.pos.filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeGreaterThan(12);
    expect(Math.min(...ys)).toBeLessThan(9);
  });
});
