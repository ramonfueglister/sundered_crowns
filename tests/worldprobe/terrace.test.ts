// The heights of the overgrown land are cleaned into terraces: a step stays only where it is eleven columns wide.
import { describe, expect, it } from 'vitest';
import { Mat, N } from '../../src/lookprobe/layout';
import { Water } from '../../src/worldprobe/region';
import { landAveraged, terrace } from '../../src/worldprobe/world';

describe('the terraces of the land', () => {
  const grass = () => new Uint8Array(N * N).fill(Mat.Grass);
  /** a plain with a scarp of two steps from column 200 on */
  const scarp = () => { const level = new Int16Array(N * N); for (let z = 0; z < N; z++) for (let x = 200; x < N; x++) level[z * N + x] = 2; return level; };

  it('take down what stands out narrower than eleven columns, and fill what lies in narrower than that', () => {
    const level = scarp();
    level[50 * N + 50] = 3; // a single column
    for (let z = 80; z < 120; z++) for (let x = 100; x < 110; x++) level[z * N + x] = 1; // a wall ten columns wide
    for (let z = 300; z < 303; z++) for (let x = 300; x < 303; x++) level[z * N + x] = 0; // a hole of three by three in the upper ground
    for (let z = 150; z < 160; z++) for (let x = 250; x < 290; x++) level[z * N + x] = 1; // a ditch ten columns wide
    terrace(level, grass());
    expect(level).toEqual(scarp());
  });

  it('keep what is eleven columns wide, and straight edges as they are', () => {
    const level = scarp();
    for (let z = 60; z < 71; z++) for (let x = 60; x < 71; x++) level[z * N + x] = 1; // a knoll of eleven by eleven
    for (let z = 320; z < 331; z++) for (let x = 320; x < 360; x++) level[z * N + x] = 0; // a dell eleven wide
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

  it('average the heights of the dry land only', () => {
    const metres = new Float32Array(N * N).fill(400), kind = new Uint8Array(N * N);
    // a sea to the west of column 100, a single hill of 900 m
    for (let z = 0; z < N; z++) for (let x = 0; x < 100; x++) { kind[z * N + x] = Water.Sea; metres[z * N + x] = -50; }
    metres[200 * N + 200] = 900;
    const smooth = landAveraged(metres, kind);
    expect(smooth[50 * N + 100]).toBeCloseTo(400);
    expect(smooth[50 * N + 50]).toBe(-50);
    expect(smooth[200 * N + 200]).toBeCloseTo(400 + 500 / 169);
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
