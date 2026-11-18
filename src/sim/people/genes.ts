// The genes of the persons: what the portraits draw a face from. A port of portrait/src/dna.rs (Apoleia's Werkstatt,
// brought over unchanged by the portrait thread): every person carries 50 genes of two alleles, one byte each, 100 bytes
// in all (34 and 68 up to state version 27: the last 16 came with portrait round 112); a founder draws them from the gene pool of the place they live in, a child takes one allele of each gene from
// either parent, moved by a small mutation. The genes are a design choice (the morph targets and colours of the
// MakeHuman base mesh), not a model of human genetics: no dominance, no linkage, independent genes (dna.rs says so).
//
// The functions take the random bits as `r(k)`, a 64-bit number per draw k, exactly as dna.rs does, so that both give
// the same bytes for the same bits (tests/people-genes.test.ts holds them to the Rust golden vectors).

/** Genes per person, and their order (dna.rs GENES; the portrait builder reads them in this order). */
export const NG = 50;
export const GENES = [
  'headW', 'headH', 'headF', 'fore', 'jaw', 'chin', 'chinH', 'cheek', 'noseL', 'noseW', 'hump', 'tip', 'eyeS', 'eyeD', 'brow',
  'browA', 'ear', 'earF', 'mouthW', 'lips', 'neck',
  'weight', 'muscle', 'typA', 'typB', 'typC',
  'skin', 'hairL', 'hairR', 'eye',
  'curl', 'bald', 'grey', 'beardG',
  // (portrait round 112) more of the face, for the dress of 1356: the head's depth, the chin's breadth, the eyes'
  // tilt, lid, height and depth, the mouth's height, corners, fuller lip and how far it stands forward, the nose's
  // bridge, the neck's length, the bags under the eyes, the folds beside the mouth, the brows' weight and the cheeks' blood.
  // All drawn around the middle, in every pool (dna.rs GENES)
  'headD', 'chinW', 'eyeT', 'lid', 'eyeH', 'eyeP', 'mouthH', 'mouthC', 'lipB', 'mouthF', 'noseB', 'neckL', 'bags', 'folds', 'browT', 'ruddy',
] as const;

/** The gene pools of the founders (dna.rs ORIGINS). The first seven are the regions of Apoleia's Werkstatt (a
 *  placeholder there), the pools after them the rest of the world (portrait round 111). Which culture draws from
 *  which pool: src/sim/people/pools.ts. */
export const ORIGINS = [
  'Italia', 'Gallia', 'Germania', 'Graecia', 'Syria', 'Aegyptus', 'Africa',
  'Maghreb', 'Arabia', 'Iran', 'Horn', 'Guinea', 'Kalahari', 'Steppe', 'Siberia', 'China', 'Tibet', 'Hindustan', 'Deccan', 'Indochina', 'Oceania', 'Australia', 'America',
] as const;
export const enum Origin {
  Italia = 0, Gallia = 1, Germania = 2, Graecia = 3, Syria = 4, Aegyptus = 5, Africa = 6,
  Maghreb = 7, Arabia = 8, Iran = 9, Horn = 10, Guinea = 11, Kalahari = 12, Steppe = 13, Siberia = 14, China = 15, Tibet = 16, Hindustan = 17, Deccan = 18, Indochina = 19, Oceania = 20, Australia = 21, America = 22,
}

/** Per pool the range a founder's alleles of these genes are drawn from (dna.rs RANGES, unsourced there). */
const RANGES: readonly (readonly [string, number, number])[][] = [
  [['skin', 40, 130], ['hairL', 10, 120], ['hairR', 0, 60], ['eye', 0, 140], ['curl', 40, 150], ['typA', 0, 50], ['typB', 0, 40], ['typC', 170, 255]],
  [['skin', 0, 80], ['hairL', 50, 220], ['hairR', 20, 170], ['eye', 50, 255], ['curl', 0, 100], ['typA', 0, 20], ['typB', 0, 30], ['typC', 210, 255]],
  [['skin', 0, 60], ['hairL', 90, 240], ['hairR', 10, 150], ['eye', 100, 255], ['curl', 0, 80], ['typA', 0, 15], ['typB', 0, 30], ['typC', 220, 255]],
  [['skin', 50, 130], ['hairL', 0, 90], ['hairR', 0, 50], ['eye', 0, 110], ['curl', 60, 170], ['typA', 0, 50], ['typB', 0, 50], ['typC', 170, 255]],
  [['skin', 70, 160], ['hairL', 0, 60], ['hairR', 0, 40], ['eye', 0, 80], ['curl', 60, 190], ['typA', 0, 60], ['typB', 20, 100], ['typC', 140, 230]],
  [['skin', 100, 190], ['hairL', 0, 50], ['hairR', 0, 30], ['eye', 0, 60], ['curl', 100, 220], ['typA', 60, 170], ['typB', 0, 60], ['typC', 90, 200]],
  [['skin', 110, 240], ['hairL', 0, 40], ['hairR', 0, 20], ['eye', 0, 50], ['curl', 140, 255], ['typA', 120, 255], ['typB', 0, 30], ['typC', 30, 140]],
  [['skin', 70, 150], ['hairL', 0, 50], ['hairR', 0, 30], ['eye', 0, 90], ['curl', 80, 190], ['typA', 15, 60], ['typB', 0, 25], ['typC', 180, 245]],
  [['skin', 95, 170], ['hairL', 0, 35], ['hairR', 0, 20], ['eye', 0, 50], ['curl', 70, 180], ['typA', 15, 65], ['typB', 0, 25], ['typC', 175, 240]],
  [['skin', 55, 135], ['hairL', 0, 60], ['hairR', 0, 35], ['eye', 0, 110], ['curl', 50, 160], ['typA', 0, 30], ['typB', 5, 45], ['typC', 190, 250]],
  [['skin', 150, 215], ['hairL', 0, 20], ['hairR', 0, 10], ['eye', 0, 35], ['curl', 185, 250], ['typA', 110, 190], ['typB', 0, 20], ['typC', 70, 140]],
  [['skin', 175, 240], ['hairL', 0, 15], ['hairR', 0, 10], ['eye', 0, 25], ['curl', 228, 255], ['typA', 200, 255], ['typB', 0, 15], ['typC', 0, 45]],
  [['skin', 110, 165], ['hairL', 0, 15], ['hairR', 0, 10], ['eye', 0, 30], ['curl', 240, 255], ['typA', 150, 215], ['typB', 40, 90], ['typC', 0, 30]],
  [['skin', 45, 120], ['hairL', 0, 70], ['hairR', 0, 35], ['eye', 0, 110], ['curl', 10, 90], ['typA', 0, 15], ['typB', 80, 160], ['typC', 100, 180], ['beardG', 50, 150], ['bald', 0, 200]],
  [['skin', 55, 120], ['hairL', 0, 25], ['hairR', 0, 15], ['eye', 0, 35], ['curl', 0, 40], ['typA', 0, 10], ['typB', 170, 235], ['typC', 45, 100], ['beardG', 20, 110], ['bald', 0, 160]],
  [['skin', 35, 105], ['hairL', 0, 25], ['hairR', 0, 15], ['eye', 0, 35], ['curl', 0, 35], ['typA', 0, 10], ['typB', 155, 225], ['typC', 55, 115], ['beardG', 20, 110], ['bald', 0, 160]],
  [['skin', 75, 140], ['hairL', 0, 25], ['hairR', 0, 15], ['eye', 0, 35], ['curl', 0, 45], ['typA', 0, 15], ['typB', 140, 205], ['typC', 70, 130], ['beardG', 20, 110], ['bald', 0, 160]],
  [['skin', 90, 170], ['hairL', 0, 30], ['hairR', 0, 15], ['eye', 0, 50], ['curl', 40, 150], ['typA', 10, 45], ['typB', 10, 50], ['typC', 180, 245]],
  [['skin', 140, 215], ['hairL', 0, 15], ['hairR', 0, 10], ['eye', 0, 30], ['curl', 60, 170], ['typA', 30, 80], ['typB', 10, 40], ['typC', 150, 225]],
  [['skin', 90, 160], ['hairL', 0, 20], ['hairR', 0, 10], ['eye', 0, 30], ['curl', 10, 80], ['typA', 10, 45], ['typB', 125, 195], ['typC', 60, 120], ['beardG', 20, 110], ['bald', 0, 160]],
  [['skin', 105, 165], ['hairL', 0, 30], ['hairR', 0, 15], ['eye', 0, 30], ['curl', 60, 170], ['typA', 20, 60], ['typB', 90, 150], ['typC', 90, 150]],
  [['skin', 180, 235], ['hairL', 0, 40], ['hairR', 0, 20], ['eye', 0, 30], ['curl', 100, 200], ['typA', 110, 175], ['typB', 0, 25], ['typC', 85, 145]],
  [['skin', 100, 165], ['hairL', 0, 15], ['hairR', 0, 10], ['eye', 0, 30], ['curl', 0, 40], ['typA', 0, 15], ['typB', 115, 185], ['typC', 75, 135], ['beardG', 20, 110], ['bald', 0, 160]],
];

/** Per pool a shift of the founders' face genes away from the middle (dna.rs FACE_SHIFT: Howells' craniometric means;
 *  none for the pools of round 111). */
const FACE_SHIFT: readonly (readonly [string, number])[][] = [
  [['noseL', -1], ['eyeS', 0], ['eyeD', 4], ['headW', 7], ['headH', -1], ['noseW', 3]],
  [['noseL', -2], ['eyeS', 1], ['eyeD', 9], ['headW', 17], ['headH', -1], ['noseW', 2]],
  [['noseL', 1], ['eyeS', 3], ['eyeD', 6], ['headW', 15], ['headH', 2], ['noseW', 2]],
  [['noseL', 0], ['eyeS', -1], ['eyeD', -1], ['headW', -2], ['headH', 0], ['noseW', 6]],
  [['noseL', 0], ['eyeS', -1], ['eyeD', -4], ['headW', -10], ['headH', 2], ['noseW', 9]],
  [['noseL', 1], ['eyeS', -2], ['eyeD', -11], ['headW', -21], ['headH', 1], ['noseW', -2]],
  [['noseL', 0], ['eyeS', -1], ['eyeD', -3], ['headW', -6], ['headH', -3], ['noseW', -21]],
  ...Array.from({ length: 16 }, () => []),
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

/** Random bits of a draw: a 64-bit number (BigInt, as dna.rs takes u64). `low`, where the source of the bits has
 *  it: the lower 32 bits of the same draw as a plain number, for the draws that read no more than those (most of
 *  a founder's: 100 draws since portrait round 112, and a BigInt for each was most of the time they took). */
export type Bits = ((k: number) => bigint) & { low?: (k: number) => number };
const byte = (h: bigint, n: number) => Number((h >> BigInt(8 * n)) & 0xffn);
const clamp = (v: number) => Math.min(255, Math.max(0, v));

/** 128 with a spread of about 34: the sum of four random bytes, centred and scaled (dna.rs around_middle), from
 *  the lower 32 bits of a draw. */
function aroundMiddle(lo: number): number {
  const sum = (lo & 255) + ((lo >>> 8) & 255) + ((lo >>> 16) & 255) + (lo >>> 24);
  return clamp(128 + Math.trunc(((sum - 510) * 48 * 122) / (255 * 100)));
}

/** round((u1 + u2 + u3 − 1.5) × 10) for three uniforms, from three bytes (dna.rs mutation). */
function mutation(h: bigint): number {
  const x = (byte(h, 0) + byte(h, 1) + byte(h, 2)) * 20 - 7650;
  return x >= 0 ? Math.trunc((x + 255) / 510) : Math.trunc((x - 255) / 510);
}

/** A founder from a gene pool: two bytes a gene, first allele of every gene then the second (one draw per allele). */
export function founder(pool: Origin, r: Bits): Uint8Array {
  const ranges = RANGES[Math.min(pool, RANGES.length - 1)], shifts = FACE_SHIFT[Math.min(pool, FACE_SHIFT.length - 1)];
  const d = new Uint8Array(2 * NG), low = r.low ?? ((k: number) => Number(BigInt.asUintN(32, r(k))));
  GENES.forEach((name, i) => {
    const range = ranges.find((g) => g[0] === name), shift = range ? 0 : shifts.find((g) => g[0] === name)?.[1] ?? 0;
    for (let k = 0; k < 2; k++) {
      let v: number;
      if (range) v = range[1] + Number(r(2 * i + k) % BigInt(range[2] - range[1] + 1));
      else if (name === 'bald' || name === 'grey') v = low(2 * i + k) & 255;
      else v = clamp(aroundMiddle(low(2 * i + k)) + shift);
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
