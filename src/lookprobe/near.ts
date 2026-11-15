// Near probe: a quay of Venice at the scale of the near view, on the look probe's stage, to be judged against the
// reference class image (traditions/measures/referenzklasse_nahsicht.json). The row of houses runs along z with the
// fronts towards +x, the sunlit side of the stage, so the probe is compared with the reference mirrored left to right.
import * as THREE from 'three/webgpu';
import { Batch, type RGB, type Rnd, hash2, rgb, seeded, shade } from './batch';
import { boat } from './blocks';
import { VENICE, VOXEL as V, bollard, cloth, crate, fineHouse, jar, jetty, pane, paving, stairs, wallOf } from '../buildings';
import { LAND_Y, N, SEA_Y } from './layout';
import { type StageScene, showError, stage } from './stage';

const PAVING = rgb(0xf2d4ac), QUAY = 2.6, STONE = rgb(0xcdbba4), WOOD = rgb(0xa9744a);
/** the lagoon before the quay: brighter than the open sea of the look probe, as the water of the reference class image (assumption) */
const LAGOON = rgb(0x0a929a), RIPPLE = rgb(0x8adcdc);
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

async function build(): Promise<StageScene> {
  const ground = new Batch(), things = new Batch(), water = new Batch(), c = N / 2, r = seeded(7), mat = new THREE.Matrix4();
  const xf = c + 0.8, xq = xf + QUAY, z0 = c - 22, z1 = c + 22;
  // the island: paved up to the quay's edge, which drops to the water as a wall of stone
  ground.box(c - 60, SEA_Y - 2, z0 - 30, xq, LAND_Y, z1 + 30, STONE, { top: PAVING });
  paving(ground, c - 60, z0 - 30, xq, z1 + 30, LAND_Y, PAVING, 3);
  // the water in cells of one block: broad bands a touch lighter or darker, lying level on the picture as in the reference
  for (let x = xq; x < c + 60; x += 1) for (let z = z0 - 30; z < z1 + 30; z += 1) {
    const band = Math.floor((x * 0.686 - z * 0.728) / 1.5), col = shade(LAGOON, 0.84 + 0.26 * hash2(band, 0, 11) + 0.06 * hash2(x, z, 9));
    water.quad([x, SEA_Y, z], [x, SEA_Y, z + 1], [x + 1, SEA_Y, z + 1], [x + 1, SEA_Y, z], col, [0, 1, 0]);
  }
  // ripples: short pale streaks along the quay, as the light lies on the water of the reference
  for (let k = 0; k < 700; k++) {
    // streaks lying level on the picture: along the picture's right, which is (0.686, -0.728) on the ground
    const x = xq + 0.6 + r.range(0, 40), z = r.range(z0 - 24, z1 + 24), l = r.range(0.4, 1.6), t = V * 0.4, dark = r.chance(0.35);
    const ax = 0.686 * l, az = -0.728 * l, px = 0.728 * t, pz = 0.686 * t, y = SEA_Y + 0.01;
    water.quad([x - px, y, z - pz], [x + px, y, z + pz], [x + ax + px, y, z + az + pz], [x + ax - px, y, z + az - pz], dark ? shade(LAGOON, 0.62) : shade(RIPPLE, r.range(0.9, 1.15)), [0, 1, 0]);
  }
  row(things, xf, z0, z1, r, true);
  row(things, xf - 10, z0 - 6, z1 + 4, seeded(8), false);
  row(things, xf - 19, z0 - 8, z1 + 6, seeded(9), false);
  // the quay: mooring posts along the edge, steps down to the water, two landing stages, boats
  for (let z = z0 + 1; z < z1; z += 1.6) bollard(things, xq - V * 0.6, LAND_Y, z + r.range(-0.2, 0.2), rgb(0x8a5a34));
  stairs(things, xq, c + 5, c + 7.2, LAND_Y, LAND_Y - SEA_Y, STONE);
  jetty(things, xq, SEA_Y, c - 11, 5, 1.1, LAND_Y - 0.15, WOOD);
  jetty(things, xq, SEA_Y, c + 13, 4, 0.9, LAND_Y - 0.15, WOOD);
  boat(things, xq + 3.5, c - 4, r); boat(things, xq + 9, c + 9, r);
  // goods, cloth and jars along the fronts, and the people of the quay
  const front = wallOf(xf - 1, z0, xf, z1, 'px');
  for (let k = 0; k < 16; k++) crate(things, xf + r.range(0.4, 2.0), LAND_Y, r.range(z0 + 2, z1 - 2), r.chance(0.5) ? 'x' : 'z', rgb(0xa9744a), GOODS, k);
  for (let k = 0; k < 3; k++) cloth(things, front, r.range(4, front.len - 4), LAND_Y + 11 * V, 2, 3, r.pick([rgb(0xf0e6d0), rgb(0xd8b060), rgb(0x9a6a8a)]), rgb(0x7a5230));
  for (let k = 0; k < 7; k++) jar(things, xf + r.range(0.3, 0.9), LAND_Y, r.range(z0, z1), rgb(0xb85c34));
  // the quay's wall to the water: blocks of stone two fine blocks by one
  const face = wallOf(c - 60, z0 - 30, xq, z1 + 30, 'px'), rows = Math.ceil((LAND_Y - SEA_Y + 1) / V);
  for (let k = 0; k < rows; k++) for (let j = 0; j < face.len / (2 * V); j++) {
    const t = (j + (k % 2) * 0.5) * 2 * V, y = LAND_Y - (k + 1) * V;
    pane(ground, face, t + V * 0.05, y + V * 0.05, t + 2 * V - V * 0.05, y + V - V * 0.05, shade(STONE, 0.9 + 0.16 * hash2(j, k, 21)), 0.02);
  }
  return { ground, things, water, counts: { triangles: ground.triangles + things.triangles + water.triangles } };
}

/** the light of the near view: softer than the far view's, so that the shaded sides keep about two thirds of the sunlit ones, as in the reference class image */
const NEAR_LIGHT = { sun: Number(q.get('sun')) || 0.9, side: Number(q.get('sidel')) || 0.55, sky: Number(q.get('sky')) || 0.5, bounce: Number(q.get('bounce')) || 0.22, fill: Number(q.get('fill')) || 0.22 };
stage(build, { frameW: Number(q.get('across')) || 24, elevation: Number(q.get('elev')) || 38, tall: 14, light: NEAR_LIGHT, shadowRadius: Number(q.get('soft')) || 6 }).catch(showError);
