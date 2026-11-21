// A level meadow with a lake, the ground the world's tests lay their land on (world.test.ts, near_view.test.ts).
import { type Ground, LAND_Y, Mat, N, SEA_Y } from '../../src/lookprobe/layout';

/** a level meadow with a lake of 20 × 20 blocks at world blocks 250 … 270, 150 … 170, starting at world block (ox, 0) */
export const meadow = (ox: number): Ground => {
  const g: Ground = {
    h: new Int16Array(N * N).fill(LAND_Y),
    mat: new Uint8Array(N * N).fill(Mat.Grass),
    wet: new Uint8Array(N * N),
    shore: new Uint8Array(N * N),
    occ: new Float32Array(N * N).fill(LAND_Y),
    surf: new Float32Array(N * N).fill(SEA_Y),
    ox,
    oz: 0,
  };
  for (let z = 150; z < 170; z++) for (let x = 0; x < N; x++) if (x + ox >= 250 && x + ox < 270) g.wet[z * N + x] = 1;
  return g;
};
