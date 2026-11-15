// Scale probe: the same houses at three sizes next to a figure and the campanile, on the look probe's stage, so that
// the scale of the houses (today 2.1 blocks a storey) can be judged against the figure (1.2 blocks) and a landmark
// built at 3.65 m a block. Address option ?scales=1,0.7,0.39 sets the factors applied to the houses (left to right).
import * as THREE from 'three/webgpu';
import { Batch, rgb, seeded } from './batch';
import { person } from './blocks';
import { glbToBatch } from '../buildings/landmarks/glb';
import { ROOFS, WALLS, house, townHouse } from '../buildings';
import { LAND_Y, N, NEAR, RIGHT } from './layout';
import { type StageScene, showError, stage } from './stage';

const FIGURE = 1.2;
const factors = (new URLSearchParams(location.search).get('scales') ?? '1,0.7,0.39').split(',').map(Number);

async function build(): Promise<StageScene> {
  const campanile = glbToBatch(await (await fetch('/models/landmarks/campanile_san_marco_1356.glb')).arrayBuffer());
  const ground = new Batch(), things = new Batch(), m = new THREE.Matrix4(), c = N / 2;
  ground.box(c - 80, LAND_Y - 3, c - 80, c + 80, LAND_Y, c + 80, rgb(0xa4a532));
  /** world position of a point `u` blocks to the right of the picture's centre and `v` blocks towards its back */
  const at = (u: number, v: number): [number, number] => [c + u * RIGHT[0] - v * NEAR[0], c + u * RIGHT[1] - v * NEAR[1]];
  const put = (model: Batch, u: number, v: number, scale = 1, y = LAND_Y) => { const [x, z] = at(u, v); things.append(model, m.makeScale(scale, scale, scale).setPosition(x, y, z)); };
  const span = 24;
  factors.forEach((f, k) => {
    const u0 = (k - (factors.length - 1) / 2) * span, r = seeded(11);
    put(campanile, u0 - 6, -4);
    put(townHouse(10, 6, 3, WALLS[2], ROOFS[0], r), u0 + 2, -6, f);
    put(house(5, 5, 2, WALLS[5], ROOFS[1], r), u0 + 4, -14, f);
    const figures = new Batch(), fr = seeded(3);
    for (let i = 0; i < 4; i++) person(figures, i * 0.9, 0, 0, fr);
    put(figures, u0 - 3, -18, FIGURE);
  });
  return { ground, things, water: new Batch(), counts: { groups: factors.length } };
}

stage(build, { frameW: 96, elevation: 18.7 }).catch(showError);
