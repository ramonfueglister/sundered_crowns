// The ground of a town laid on a real plan that draws its land and water (src/sim/settlement/plan_ground.ts): what
// the blocks are, and where its main streets cross the water on bridges.
import { describe, it, expect } from 'vitest';
import { BRIDGE_SPAN, GROUND, groundBlocks, type PlanGround } from '../src/sim/settlement/plan_ground';

/** a plan of 2 × 2 radii in cells of 0.01 radii, dry but for a canal north-south: `wide` cells from x = 0 east */
const canal = (wide: number): PlanGround => {
  const w = 200,
    h = 200,
    water = new Uint8Array(w * h);
  for (let z = 0; z < h; z++) for (let x = 100; x < 100 + wide; x++) water[z * w + x] = 15;
  return { x0: -1, z0: -1, cell: 0.01, w, h, water };
};
// a radius of 100 real metres laid as 100 world metres, blocks of 2 m: a cell is 1 m, a block two cells
const plan = { market: [0, 0] as const, streets: [[-0.5, 0, 0.5, 0]] };

describe('the ground of a real plan', () => {
  it('is water where more than half of a block is, land elsewhere in the plan, open beyond it', () => {
    const b = groundBlocks({ ...plan, streets: [] }, canal(10), 100, 100, 3, 2);
    expect(b.at(2, 30)).toBe(GROUND.water); // metres 3 to 5 east: in the canal (0 to 10)
    expect(b.at(-3, 30)).toBe(GROUND.land);
    expect(b.at(0, 30)).toBe(GROUND.land); // metres −1 to 1: half water, half land
    expect(b.at(80, 0)).toBe(GROUND.open);
    expect(b.reach).toBe(50);
  });
  it('bridges a canal a main street crosses, no wider than the longest span; a wider water stays open', () => {
    const narrow = groundBlocks(plan, canal(10), 100, 100, 3, 2);
    expect(BRIDGE_SPAN).toBeGreaterThan(10);
    for (const j of [-1, 0, 1]) expect(narrow.at(2, j)).toBe(GROUND.land); // within 3 m of the street's middle line
    expect(narrow.at(2, 2)).toBe(GROUND.water);
    const wide = groundBlocks(plan, canal(40), 100, 100, 3, 2);
    expect(wide.at(10, 0)).toBe(GROUND.water);
  });
});
