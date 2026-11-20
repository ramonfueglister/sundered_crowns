// The ground of a town whose old plan draws its land and its water (settlement feature 3, real plans): Venice, from
// the Napoleonic land register of 1808 (tools/settlement/cadastre_venice.py). The land register of the simulation
// lays the town's parcels and streets on it (src/sim/systems/lots.ts), and the world graphic draws it in place of the
// map's own land and water (src/worldprobe/plan_ground.ts): both ask the same blocks, so the houses stand where the
// graphic has land. Only arithmetic here, no state.

/** the real plan of a town where an old plan of it is open (src/sim/content/town_plans_<year>.json): its market and
 *  the pieces of its main streets [x0, z0, x1, z1], east-west or north-south, east and south of the centre in radii
 *  of the real town. It gives the form, not the size: layTown lays it as wide as the town it lays. */
export interface Plan {
  market: readonly [number, number];
  streets: readonly (readonly number[])[];
  /** the real metres of one radius of the walled town (the plans of src/sim/content/town_plans.ts) */
  radius?: number;
  /** the plan's land and water, where it draws them (below) */
  ground?: PlanGround;
}

/** what a block of such a town is: `open` lies outside what the plan draws (the map's own ground holds there) */
export const GROUND = { open: 0, land: 1, water: 2 } as const;

/** The longest span of a bridge over a canal of Venice in the register: the Rialto bridge over the Grand Canal,
 *  28.80 m (Structurae, structure 20000461, "main span"). A main street of the plan crosses water no wider. */
export const BRIDGE_SPAN = 28.8;

/** the ground of a plan: from (x0, z0) east and south of the centre, `w` × `h` cells of `cell` radii, rows from north
 *  to south, and per cell its share of water in fifteenths (0 dry, 15 water) */
export interface PlanGround {
  x0: number;
  z0: number;
  cell: number;
  w: number;
  h: number;
  water: Uint8Array;
}

/** what the blocks of a town are, and how far from the centre the plan draws ground (blocks, east, west, north, south) */
export interface GroundBlocks {
  at: (bx: number, bz: number) => number;
  reach: number;
}

/**
 * The blocks of `metres` metres of a town laid on its real plan `plan` with `real` metres to a radius of the plan
 * (the real town) and `radius` metres to a radius in the world, numbered from the town's centre: the block bx spans
 * (bx ± ½) · metres east of it. A block is water where more than half of it is water in the plan (the canals narrower
 * than half a block vanish, the wider ones stay). Where a main street of the plan crosses water with land on both
 * sides, over no more than the longest bridge of the plan's town spans (BRIDGE_SPAN at the plan's size, and the block
 * the crossing rounds to), its blocks within `half` metres of the street's middle line are land: a bridge.
 */
export function groundBlocks(
  plan: Plan,
  ground: PlanGround,
  real: number,
  radius: number,
  half: number,
  metres: number,
): GroundBlocks {
  const { x0, z0, cell, w, h, water } = ground;
  // the shares of water summed from the north-west corner: the integral of the cells, exact between the corners
  // of the cells when read bilinearly
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let z = 0; z < h; z++)
    for (let x = 0, row = 0; x < w; x++) {
      row += water[z * w + x] / 15;
      sum[(z + 1) * (w + 1) + x + 1] = sum[z * (w + 1) + x + 1] + row;
    }
  const corner = (u: number, v: number) => {
    const x = Math.max(0, Math.min(w, u)),
      z = Math.max(0, Math.min(h, v)),
      i = Math.min(w - 1, Math.floor(x)),
      j = Math.min(h - 1, Math.floor(z)),
      fx = x - i,
      fz = z - j;
    const a = sum[j * (w + 1) + i],
      b = sum[j * (w + 1) + i + 1],
      c = sum[(j + 1) * (w + 1) + i],
      d = sum[(j + 1) * (w + 1) + i + 1];
    return a * (1 - fx) * (1 - fz) + b * fx * (1 - fz) + c * (1 - fx) * fz + d * fx * fz;
  };
  // a block in cells of the plan
  const toCell = metres / radius / cell,
    ux = -x0 / cell,
    vz = -z0 / cell;
  const known = new Map<number, number>();
  const base = (bx: number, bz: number) => {
    const key = (bz + 32768) * 65536 + bx + 32768,
      had = known.get(key);
    if (had !== undefined) return had;
    const cu = ux + bx * toCell,
      cv = vz + bz * toCell;
    let k: number = GROUND.open;
    if (cu >= 0 && cu < w && cv >= 0 && cv < h) {
      const a = cu - toCell / 2,
        b = cv - toCell / 2,
        c = cu + toCell / 2,
        d = cv + toCell / 2;
      const area = (Math.min(w, c) - Math.max(0, a)) * (Math.min(h, d) - Math.max(0, b));
      const wet = (corner(c, d) - corner(a, d) - corner(c, b) + corner(a, b)) / area;
      k = wet > 0.5 ? GROUND.water : GROUND.land;
    }
    known.set(key, k);
    return k;
  };
  // the bridges: the middle lines of the main streets in blocks; where they run over water, each stretch of water
  // blocks (joined side by side) that main-street land touches in two places or more and is no longer than the span
  const bridges = new Set<number>(),
    span = (BRIDGE_SPAN * radius) / real + metres,
    side = Math.floor(half / metres);
  const keyOf = (bx: number, bz: number) => (bz + 32768) * 65536 + bx + 32768;
  const along = new Map<number, boolean>(); // the street's blocks: true where it runs east-west
  for (const q of plan.streets) {
    const ax = Math.round((q[0] * radius) / metres),
      az = Math.round((q[1] * radius) / metres),
      bx = Math.round((q[2] * radius) / metres),
      bz = Math.round((q[3] * radius) / metres);
    const n = Math.abs(bx - ax) + Math.abs(bz - az),
      sx = Math.sign(bx - ax),
      sz = Math.sign(bz - az);
    for (let k = 0; k <= n; k++) along.set(keyOf(ax + k * sx, az + k * sz), sx !== 0);
  }
  const seen = new Set<number>(),
    STEP = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
  for (const start of along.keys()) {
    const x0 = (start % 65536) - 32768,
      z0 = Math.floor(start / 65536) - 32768;
    if (seen.has(start) || base(x0, z0) !== GROUND.water) continue;
    const run: [number, number][] = [],
      stack: [number, number][] = [[x0, z0]],
      shores = new Set<number>();
    seen.add(start);
    while (stack.length) {
      const [x, z] = stack.pop()!;
      run.push([x, z]);
      for (const [dx, dz] of STEP) {
        const k = keyOf(x + dx, z + dz);
        if (!along.has(k)) continue;
        if (base(x + dx, z + dz) === GROUND.land) shores.add(k);
        else if (base(x + dx, z + dz) === GROUND.water && !seen.has(k)) {
          seen.add(k);
          stack.push([x + dx, z + dz]);
        }
      }
    }
    if (shores.size < 2 || run.length * metres > span) continue;
    for (const [rx, rz] of run)
      for (let j = -side; j <= side; j++) bridges.add(along.get(keyOf(rx, rz)) ? keyOf(rx, rz + j) : keyOf(rx + j, rz));
  }
  const far = Math.max(Math.abs(x0), Math.abs(z0), Math.abs(x0 + w * cell), Math.abs(z0 + h * cell));
  return {
    at: (bx, bz) => (bridges.has(keyOf(bx, bz)) ? GROUND.land : base(bx, bz)),
    reach: Math.ceil((far * radius) / metres),
  };
}
