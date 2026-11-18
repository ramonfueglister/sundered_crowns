import { describe, expect, it } from 'vitest';
import { bytesOf, pack, unpack } from '../../src/worldprobe/pack';

describe('pack', () => {
  const piece = () => ({
    scene: {
      ground: { pos: new Float32Array([1, 2.5, -3, 4, 5, 6, 7, 8, 9]), nor: new Float32Array(0), col: new Float32Array([0.1, 0.2, 0.3]), ball: [1, 2, 3, 4] },
      cells: [{ x: 1, z: 2, lots: [{ x: 3, region: 'Île-de-France' }], ground: { water: Infinity, tops: new Int16Array([-5, 7, 9]), kinds: new Uint8Array([1, 2, 3, 4, 5]) } }],
      figures: undefined as Uint32Array | undefined,
      counts: { 'ms step 0': 1234 },
    },
    summary: new Float32Array([NaN, 1]),
  });

  it('gives back what was packed, lists of every kind and numbers JSON has no word for', () => {
    const back = unpack<ReturnType<typeof piece>>(pack(piece()));
    expect(back).toEqual(piece());
    expect(back.scene.cells[0].ground.tops).toBeInstanceOf(Int16Array);
    expect(back.scene.cells[0].ground.water).toBe(Infinity);
  });

  it('gives every list bytes of its own, so that each can be handed over', () => {
    const back = unpack<ReturnType<typeof piece>>(pack(piece())), bytes = bytesOf(back);
    expect(new Set(bytes).size).toBe(bytes.length);
    expect(back.scene.ground.pos.buffer.byteLength).toBe(36);
    // (an empty list has nothing to hand over)
    expect(bytes.length).toBe(5);
  });

  it('does not read a run that is not a packed piece', () => {
    expect(() => unpack(new ArrayBuffer(64))).toThrow();
  });

  it('does not read a run that was cut short', () => {
    const run = pack(piece());
    for (const length of [0, 4, 16, run.byteLength >> 1, run.byteLength - 8]) expect(() => unpack(run.slice(0, length))).toThrow();
  });
});
