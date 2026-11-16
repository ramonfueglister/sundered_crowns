// The heights of the overgrown land are cleaned into terraces: a step stays only where it is three columns wide.
import { describe, expect, it } from 'vitest';
import { Mat, N } from '../../src/lookprobe/layout';
import { terrace } from '../../src/worldprobe/world';

describe('the terraces of the land', () => {
  const grass = () => new Uint8Array(N * N).fill(Mat.Grass);
  /** a plain with a scarp of two steps from column 200 on */
  const scarp = () => { const level = new Int16Array(N * N); for (let z = 0; z < N; z++) for (let x = 200; x < N; x++) level[z * N + x] = 2; return level; };

  it('take down what stands out narrower than three columns, and fill what lies in narrower than that', () => {
    const level = scarp();
    level[50 * N + 50] = 3; // a single column
    for (let z = 80; z < 120; z++) { level[z * N + 100] = 1; level[z * N + 101] = 1; } // a wall two columns wide
    level[300 * N + 300] = 0; // a hole in the upper ground
    for (let x = 250; x < 290; x++) level[150 * N + x] = 1; // a ditch one column wide
    terrace(level, grass());
    expect(level).toEqual(scarp());
  });

  it('keep what is three columns wide, and straight edges as they are', () => {
    const level = scarp();
    for (let z = 60; z < 63; z++) for (let x = 60; x < 63; x++) level[z * N + x] = 1; // a knoll of three by three
    for (let z = 320; z < 323; z++) for (let x = 320; x < 360; x++) level[z * N + x] = 0; // a dell three wide
    const before = Int16Array.from(level);
    terrace(level, grass());
    expect(level).toEqual(before);
  });

  it('smooth a frayed edge', () => {
    const level = scarp();
    // every other column of the edge stands a column forward
    for (let z = 0; z < N; z += 2) level[z * N + 199] = 2;
    terrace(level, grass());
    let steps = 0;
    for (let z = 10; z < N - 10; z++) if (level[z * N + 199] !== level[(z + 1) * N + 199]) steps++;
    expect(steps).toBe(0);
  });

  it('leave the rock and the water as they are, and count them for nothing', () => {
    const level = new Int16Array(N * N), mat = grass();
    // a pillar of rock and a pond, each a single column, and a grass column between two rocks
    level[40 * N + 40] = 9; mat[40 * N + 40] = Mat.Rock;
    level[70 * N + 70] = -3; mat[70 * N + 70] = Mat.Bed;
    terrace(level, mat);
    expect(level[40 * N + 40]).toBe(9);
    expect(level[70 * N + 70]).toBe(-3);
    expect(level[40 * N + 41]).toBe(0);
    expect(level[70 * N + 71]).toBe(0);
  });
});
