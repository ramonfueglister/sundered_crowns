// The genes of the persons: what the portraits draw a face from. A port of portrait/src/dna.rs (Apoleia's Werkstatt,
// brought over unchanged by the portrait thread): every person carries 34 genes of two alleles, one byte each, 68 bytes
// in all; a founder draws them from the gene pool of the place they live in, a child takes one allele of each gene from
// either parent, moved by a small mutation. The genes are a design choice (the morph targets and colours of the
// MakeHuman base mesh), not a model of human genetics: no dominance, no linkage, independent genes (dna.rs says so).
//
// The functions take the random bits as `r(k)`, a 64-bit number per draw k, exactly as dna.rs does, so that both give
// the same bytes for the same bits (tests/people-genes.test.ts holds them to the Rust golden vectors).

/** Genes per person, and their order (dna.rs GENES; the portrait builder reads them in this order). */
export const NG = 34;
export const GENES = [
  'headW', 'headH', 'headF', 'fore', 'jaw', 'chin', 'chinH', 'cheek', 'noseL', 'noseW', 'hump', 'tip', 'eyeS', 'eyeD', 'brow',
  'browA', 'ear', 'earF', 'mouthW', 'lips', 'neck',
  'weight', 'muscle', 'typA', 'typB', 'typC',
  'skin', 'hairL', 'hairR', 'eye',
  'curl', 'bald', 'grey', 'beardG',
] as const;

/** The gene pools of the founders (dna.rs ORIGINS; a placeholder there: the regions of Apoleia's Werkstatt). */
export const ORIGINS = ['Italia', 'Gallia', 'Germania', 'Graecia', 'Syria', 'Aegyptus', 'Africa'] as const;
export const enum Origin { Italia = 0, Gallia = 1, Germania = 2, Graecia = 3, Syria = 4, Aegyptus = 5, Africa = 6 }

/** Per pool the range a founder's alleles of these genes are drawn from (dna.rs RANGES, unsourced there). */
const RANGES: readonly (readonly [string, number, number])[][] = [
  [['skin', 40, 130], ['hairL', 10, 120], ['hairR', 0, 60], ['eye', 0, 140], ['curl', 40, 150], ['typA', 0, 50], ['typB', 0, 40], ['typC', 170, 255]],
  [['skin', 0, 80], ['hairL', 50, 220], ['hairR', 20, 170], ['eye', 50, 255], ['curl', 0, 100], ['typA', 0, 20], ['typB', 0, 30], ['typC', 210, 255]],
  [['skin', 0, 60], ['hairL', 90, 240], ['hairR', 10, 150], ['eye', 100, 255], ['curl', 0, 80], ['typA', 0, 15], ['typB', 0, 30], ['typC', 220, 255]],
  [['skin', 50, 130], ['hairL', 0, 90], ['hairR', 0, 50], ['eye', 0, 110], ['curl', 60, 170], ['typA', 0, 50], ['typB', 0, 50], ['typC', 170, 255]],
  [['skin', 70, 160], ['hairL', 0, 60], ['hairR', 0, 40], ['eye', 0, 80], ['curl', 60, 190], ['typA', 0, 60], ['typB', 20, 100], ['typC', 140, 230]],
  [['skin', 100, 190], ['hairL', 0, 50], ['hairR', 0, 30], ['eye', 0, 60], ['curl', 100, 220], ['typA', 60, 170], ['typB', 0, 60], ['typC', 90, 200]],
  [['skin', 110, 240], ['hairL', 0, 40], ['hairR', 0, 20], ['eye', 0, 50], ['curl', 140, 255], ['typA', 120, 255], ['typB', 0, 30], ['typC', 30, 140]],
];

/** Per pool a shift of the founders' face genes away from the middle (dna.rs FACE_SHIFT: Howells' craniometric means). */
const FACE_SHIFT: readonly (readonly [string, number])[][] = [
  [['noseL', -1], ['eyeS', 0], ['eyeD', 4], ['headW', 7], ['headH', -1], ['noseW', 3]],
  [['noseL', -2], ['eyeS', 1], ['eyeD', 9], ['headW', 17], ['headH', -1], ['noseW', 2]],
  [['noseL', 1], ['eyeS', 3], ['eyeD', 6], ['headW', 15], ['headH', 2], ['noseW', 2]],
  [['noseL', 0], ['eyeS', -1], ['eyeD', -1], ['headW', -2], ['headH', 0], ['noseW', 6]],
  [['noseL', 0], ['eyeS', -1], ['eyeD', -4], ['headW', -10], ['headH', 2], ['noseW', 9]],
  [['noseL', 1], ['eyeS', -2], ['eyeD', -11], ['headW', -21], ['headH', 1], ['noseW', -2]],
  [['noseL', 0], ['eyeS', -1], ['eyeD', -3], ['headW', -6], ['headH', -3], ['noseW', -21]],
];

/** The gene pool of a place (dna.rs origin: coarse boxes round the Werkstatt's regions, a placeholder there). */
export function origin(lon: number, lat: number): Origin {
  if (lat < 31.6 && lon > 24.5 && lon < 36.0) return Origin.Aegyptus;
  if (lon >= 34.5 && lat < 38.5) return Origin.Syria;
  const africaNorth = lon < -1.0 ? 36.0 : lon < 1.5 ? 36.3 : lon < 11.6 ? 37.6 : lon < 16.0 ? 35.6 : 33.5;
  if (lon < 24.5 && lat < africaNorth) return Origin.Africa;
  if (lat >= 47.0 && lon > 5.5) return Origin.Germania;
  if (lon < 3.5 && lat < 43.8) return Origin.Italia;
  if (lon < 7.5) return Origin.Gallia;
  if (lon < 19.0 && lat < 47.0) return Origin.Italia;
  return Origin.Graecia;
}

/** Random bits of a draw: a 64-bit number (BigInt, as dna.rs takes u64). */
export type Bits = (k: number) => bigint;
const byte = (h: bigint, n: number) => Number((h >> BigInt(8 * n)) & 0xffn);
const clamp = (v: number) => Math.min(255, Math.max(0, v));

/** 128 with a spread of about 34: the sum of four random bytes, centred and scaled (dna.rs around_middle). */
function aroundMiddle(h: bigint): number {
  const sum = byte(h, 0) + byte(h, 1) + byte(h, 2) + byte(h, 3);
  return clamp(128 + Math.trunc(((sum - 510) * 48 * 122) / (255 * 100)));
}

/** round((u1 + u2 + u3 − 1.5) × 10) for three uniforms, from three bytes (dna.rs mutation). */
function mutation(h: bigint): number {
  const x = (byte(h, 0) + byte(h, 1) + byte(h, 2)) * 20 - 7650;
  return x >= 0 ? Math.trunc((x + 255) / 510) : Math.trunc((x - 255) / 510);
}

/** A founder from a gene pool: 68 bytes, first allele of every gene then the second (one draw per allele). */
export function founder(pool: Origin, r: Bits): Uint8Array {
  const ranges = RANGES[Math.min(pool, RANGES.length - 1)], shifts = FACE_SHIFT[Math.min(pool, FACE_SHIFT.length - 1)];
  const d = new Uint8Array(2 * NG);
  GENES.forEach((name, i) => {
    for (let k = 0; k < 2; k++) {
      const h = r(2 * i + k), range = ranges.find((g) => g[0] === name);
      let v: number;
      if (range) v = range[1] + Number(h % BigInt(range[2] - range[1] + 1));
      else if (name === 'bald' || name === 'grey') v = byte(h, 0);
      else v = clamp(aroundMiddle(h) + (shifts.find((g) => g[0] === name)?.[1] ?? 0));
      d[i + k * NG] = v;
    }
  });
  return d;
}

/** A child of a father and a mother: per gene one allele from either, each moved by a mutation of about ±5. */
export function child(father: ArrayLike<number>, mother: ArrayLike<number>, r: Bits): Uint8Array {
  const d = new Uint8Array(2 * NG);
  for (let i = 0; i < NG; i++) {
    const h = r(i);
    const fromF = (h & 1n) === 0n ? father[i] : father[i + NG];
    const fromM = (h & 2n) === 0n ? mother[i] : mother[i + NG];
    d[i] = clamp(fromF + mutation(h >> 8n));
    d[i + NG] = clamp(fromM + mutation(h >> 32n));
  }
  return d;
}
