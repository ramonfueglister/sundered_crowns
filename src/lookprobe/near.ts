// Near probe: a quay of Venice at the scale of the near view, on the look probe's stage, to be judged against the
// reference class image (traditions/measures/referenzklasse_nahsicht.json). The row of houses runs along z with the
// fronts towards +x, the sunlit side of the stage, so the probe is compared with the reference mirrored left to right.
import * as THREE from 'three/webgpu';
import { Batch, type RGB, type Rnd, hash2, rgb, seeded, shade } from './batch';
import { boat } from './blocks';
import { type Column, LAGOON, VENICE, VOXEL as V, cloth, crate, fineGround, fineHouse, jar, jetty, waterColourAt, waterFlecks, wallOf } from '../buildings';
import { LAND_Y, N, SEA_Y } from './layout';
import { NEAR_LIGHT, NEAR_SHADOW, type StageScene, showError, stage } from './stage';

/** the quay's edge lies this many blocks before the fronts, rounded to a whole block, since the ground kit builds by columns */
const QUAY = 3.2, STONE = VENICE.quay.wall, PAVING = VENICE.quay.paving, WOOD = rgb(0xa9744a);
const q = new URLSearchParams(location.search);
const GOODS: readonly RGB[] = [rgb(0xe8a030), rgb(0xd04030), rgb(0x8ab040), rgb(0xf0e0c0), rgb(0x3f5f8a), rgb(0xe8c050)];

/** A row of houses along z with their fronts at x = `xf`, from z0 on, one plot after the other with a lane now and then. */
function row(things: Batch, xf: number, z0: number, z1: number, r: Rnd, great: boolean) {
  const mat = new THREE.Matrix4(), tr = VENICE;
  let z = z0, k = 0, before = 1;
  while (z < z1) {
    const big = great && k === 2, w = big ? r.range(...tr.plot.greatWidth) : r.range(...tr.plot.width), d = r.range(...tr.plot.depth);
    const floors = big ? 3 : r.chance(0.7) ? tr.storeys[0] : tr.storeys[1], lane = r.chance(0.8) ? r.range(0.5, 1.2) : 0;
    // party walls stay blind; a wall on a lane gets windows
    const house = fineHouse(d, w, floors, tr, r, { front: 'px', shop: !big && r.chance(0.35), great: big, blind: [...(before ? [] : ['nz' as const]), ...(lane ? [] : ['pz' as const])] });
    things.append(house, mat.identity().setPosition(xf - d / 2, LAND_Y, z + w / 2));
    z += w + lane; k++; before = lane;
  }
}

const LEAF = rgb(0x6fae3a), EARTH = rgb(0x9a7046), TRUNK = rgb(0x6b4a2c);

/** A tree in blocks: a trunk and a crown of a few leafy cubes (scenery of the probe, not of the house kit). */
function tree(b: Batch, x: number, y: number, z: number, r: Rnd) {
  const h = r.range(1.2, 2.0), s = r.range(0.7, 1.0);
  b.box(x - 0.15, y, z - 0.15, x + 0.15, y + h, z + 0.15, TRUNK);
  for (let k = 0; k < r.int(3, 5); k++) {
    const dx = r.range(-0.5, 0.5) * s, dz = r.range(-0.5, 0.5) * s, dy = r.range(-0.3, 0.5) * s, e = r.range(0.4, 0.6) * s;
    b.box(x + dx - e, y + h + dy - e, z + dz - e, x + dx + e, y + h + dy + e, z + dz + e, shade(LEAF, r.range(0.85, 1.15)), { top: shade(LEAF, 1.1) });
  }
}

/**
 * Gardens behind the houses: earth plots with rows of bushes and a few trees. Venice's parcels kept gardens
 * (orti) and vines into the 14th century (Crouzet-Pavan 1992, not checked; the Barbari view of 1500 still shows
 * many); here they are the scenery of the probe, placed by assumption.
 */
function orti(ground: Batch, things: Batch, x0: number, x1: number, z0: number, z1: number, r: Rnd) {
  for (let z = z0; z < z1; z += r.range(5, 9)) {
    const d = r.range(3, 5), w = r.range(3.5, 6), x = r.range(x0, x1 - d), y = LAND_Y;
    ground.box(x, y - 0.5, z, x + d, y + 0.06, z + w, EARTH, { top: shade(EARTH, 1.05) });
    for (let i = 0.4; i < d - 0.3; i += 0.8) for (let k = 0.3; k < w - 0.3; k += 0.45) {
      const e = r.range(0.12, 0.2);
      things.box(x + i - e, y, z + k - e, x + i + e, y + r.range(0.25, 0.45), z + k + e, shade(LEAF, r.range(0.8, 1.2)), { top: shade(LEAF, 1.1) });
    }
    if (r.chance(0.7)) tree(things, x + r.range(0, d), y, z + w + r.range(0.4, 1.2), r);
  }
}

async function build(): Promise<StageScene> {
  const ground = new Batch(), things = new Batch(), water = new Batch(), c = N / 2, r = seeded(7), mat = new THREE.Matrix4();
  const xf = c + 0.8, xq = Math.round(xf + QUAY), z0 = c - 22, z1 = c + 22;
  // the island: paved up to the quay's edge, which drops to the water as a wall of stone; the water in cells of one
  // block in the near view's colours (ground kit: src/buildings/ground). The probe is one cell of the kit.
  ground.box(c - 60, SEA_Y - 2, z0 - 30, xq, LAND_Y, z1 + 30, STONE, { top: PAVING });
  const land: Column = { top: LAND_Y, wet: false, paved: true }, sea: Column = { top: SEA_Y, wet: true, paved: false };
  const cell = { x0: c - 60, z0: z0 - 30, size: 120, ox: 0, oz: 0, water: SEA_Y }, at = (x: number, _z: number) => (x < xq ? land : sea);
  fineGround(ground, cell, at, VENICE.quay);
  for (let x = xq; x < c + 60; x += 1) for (let z = z0 - 30; z < z1 + 30; z += 1) {
    water.quad([x, SEA_Y, z], [x, SEA_Y, z + 1], [x + 1, SEA_Y, z + 1], [x + 1, SEA_Y, z], waterColourAt(x, z, LAGOON), [0, 1, 0]);
  }
  waterFlecks(water, { ...cell, x0: xq, z0: z0 - 14, size: 46 }, at);
  row(things, xf, z0, z1, r, true);
  row(things, xf - 10, z0 - 6, z1 + 4, seeded(8), false);
  row(things, xf - 19, z0 - 8, z1 + 6, seeded(9), false);
  orti(ground, things, xf - 44, xf - 29, z0 - 30, z1 + 30, seeded(10));
  // the quay's posts and steps come from the ground kit; two landing stages and boats besides
  jetty(things, xq, SEA_Y, c - 11, 5, 1.1, LAND_Y - 0.15, WOOD);
  jetty(things, xq, SEA_Y, c + 13, 4, 0.9, LAND_Y - 0.15, WOOD);
  boat(things, xq + 3.5, c - 4, r); boat(things, xq + 9, c + 9, r);
  // goods, cloth and jars along the fronts, and the people of the quay
  const front = wallOf(xf - 1, z0, xf, z1, 'px');
  for (let k = 0; k < 34; k++) crate(things, xf + r.range(0.4, 2.0), LAND_Y, r.range(z0 + 2, z1 - 2), r.chance(0.5) ? 'x' : 'z', rgb(0xa9744a), GOODS, k);
  for (let k = 0; k < 3; k++) cloth(things, front, r.range(4, front.len - 4), LAND_Y + 11 * V, 2, 3, r.pick([rgb(0xf0e6d0), rgb(0xd8b060), rgb(0x9a6a8a)]), rgb(0x7a5230));
  for (let k = 0; k < 24; k++) jar(things, xf + r.range(0.3, 0.9), LAND_Y, r.range(z0, z1), rgb(0xb85c34));
  return { ground, things, water, counts: { triangles: ground.triangles + things.triangles + water.triangles } };
}

/** the light of the near view (stage.ts), each strength to be tried out from the address */
const LIGHT = { ...NEAR_LIGHT, sun: Number(q.get('sun')) || NEAR_LIGHT.sun, side: Number(q.get('sidel')) || NEAR_LIGHT.side, sky: Number(q.get('sky')) || NEAR_LIGHT.sky, bounce: Number(q.get('bounce')) || NEAR_LIGHT.bounce, fill: Number(q.get('fill')) || NEAR_LIGHT.fill, mirror: Number(q.get('mirror')) || NEAR_LIGHT.mirror };
stage(build, { frameW: Number(q.get('across')) || 24, elevation: Number(q.get('elev')) || 30, tall: 14, light: LIGHT, shadowRadius: Number(q.get('soft')) || NEAR_SHADOW }).catch(showError);
