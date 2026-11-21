// The probe scene's ground while it is being filled: the ground itself, the batch that gathers every thing, which cells
// are taken (`used`), and the counts the page reports. Every part of the scene places its things through this.
import * as THREE from 'three/webgpu';
import { FLOOR, ROOFS, WALLS, house, m, townHouse } from '../../buildings';
import { Batch, type Rnd } from '../batch';
import { Mat, N, idx, inGrid, occlude, toST } from '../layout';
import { buildGround, fieldAt, inCity, roadDist } from './places';

/** A footprint side drawn between two lengths in metres, whole blocks (the footprints were read off the reference image). */
export const blocks = (r: Rnd, lo: number, hi: number) =>
  r.int(Math.max(2, Math.round(m(lo))), Math.max(2, Math.round(m(hi))));

/** whether (x, z) lies in the picture of the reference camera, with a margin */
export const inFrame = (x: number, z: number) => {
  const [s, t] = toST(x, z);
  return s > -0.05 && s < 1.05 && t > -0.08 && t < 1.14;
};

/** country ground: off the fields and away from the roads */
export const rural = (px: number, pz: number) => !fieldAt(px, pz, 1) && roadDist(px, pz) > 1.6;

export class Site {
  readonly g = buildGround();
  readonly things = new Batch();
  readonly used = new Uint8Array(N * N);
  readonly counts: Record<string, number> = {};
  /** roof tops of the houses outside the city, for the smoke */
  readonly hearths: [number, number, number][] = [];
  private readonly mat = new THREE.Matrix4();

  count(k: string): void {
    this.counts[k] = (this.counts[k] ?? 0) + 1;
  }
  put(model: Batch, x: number, y: number, z: number, angle: number): void {
    this.things.append(model, this.mat.makeRotationY(angle).setPosition(x, y, z));
  }
  /** whether every cell of the rectangle lies on the grid and passes `f` (which stops the walk by giving false) */
  cells(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    f: (i: number, x: number, z: number) => boolean | undefined,
  ): boolean {
    for (let z = Math.floor(z0); z < Math.ceil(z1); z++)
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        if (!inGrid(x, z) || f(idx(x, z), x, z) === false) return false;
      }
    return true;
  }
  claim(x0: number, z0: number, x1: number, z1: number): void {
    this.cells(x0, z0, x1, z1, (i) => {
      this.used[i] = 1;
    });
  }
  /** free ground for a footprint: every cell passes `where`, nothing built and no water within `gap` cells */
  fits(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    where: (x: number, z: number) => boolean = () => true,
    gap = 1,
  ): boolean {
    const { g, used } = this;
    return (
      this.cells(x0 - gap, z0 - gap, x1 + gap, z1 + gap, (i) => g.wet[i] === 0) &&
      this.cells(x0 - gap, z0 - gap, x1 + gap, z1 + gap, (i) => used[i] === 0 && g.mat[i] !== Mat.Rock) &&
      this.cells(x0, z0, x1, z1, (_, x, z) => where(x + 0.5, z + 0.5))
    );
  }
  baseY(x: number, z: number): number {
    return this.g.h[idx(Math.floor(x), Math.floor(z))];
  }
  /** places a model with footprint w × d (before turning) centred on (x, z) and records what it covers */
  build(model: Batch, x: number, z: number, w: number, d: number, turns: number, height: number, kind: string): void {
    const fw = turns % 2 ? d : w,
      fd = turns % 2 ? w : d,
      y = this.baseY(x, z);
    this.put(model, x, y, z, (turns * Math.PI) / 2);
    this.claim(x - fw / 2, z - fd / 2, x + fw / 2, z + fd / 2);
    occlude(this.g, x - fw / 2, z - fd / 2, x + fw / 2, z + fd / 2, y + height);
    this.count(kind);
  }
  /** a house on the footprint from (x, z): one block when small, a town house of two blocks when long */
  homes(r: Rnd, x: number, z: number, w: number, d: number, floors: number): void {
    const top = floors * FLOOR + m(1.7),
      model =
        Math.max(w, d) >= m(11.4) && r.chance(0.7)
          ? townHouse(w, d, floors, r.pick(WALLS), r.pick(ROOFS), r)
          : house(w, d, floors, r.pick(WALLS), r.pick(ROOFS), r);
    if (!inCity(x, z)) this.hearths.push([x + w / 2, this.baseY(x + w / 2, z + d / 2) + top + 0.4, z + d / 2]);
    this.build(model, x + w / 2, z + d / 2, w, d, 0, top, 'house');
  }
}
