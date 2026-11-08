// Deterministic xoshiro128** PRNG. State lives inside the GameState so saves/replays reproduce exactly.
export function seedRng(seed: number): number[] {
  let s = seed >>> 0;
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    // splitmix32
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    out.push((z ^ (z >>> 16)) >>> 0);
  }
  if (!out.some((v) => v !== 0)) out[0] = 1;
  return out;
}
export function nextU32(s: number[]): number {
  const r = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
  const t = (s[1] << 9) >>> 0;
  s[2] = (s[2] ^ s[0]) >>> 0;
  s[3] = (s[3] ^ s[1]) >>> 0;
  s[1] = (s[1] ^ s[2]) >>> 0;
  s[0] = (s[0] ^ s[3]) >>> 0;
  s[2] = (s[2] ^ t) >>> 0;
  s[3] = rotl(s[3], 11);
  return r;
}
function rotl(x: number, k: number) { return ((x << k) | (x >>> (32 - k))) >>> 0; }
/** uniform in [0,1) */
export function rand(s: number[]): number { return nextU32(s) / 4294967296; }
export function randInt(s: number[], n: number): number { return Math.floor(rand(s) * n); }
export function chance(s: number[], p: number): boolean { return rand(s) < p; }
export function pick<T>(s: number[], arr: T[]): T { return arr[randInt(s, arr.length)]; }
/** Deterministic hash of integers -> [0,1), for stateless per-entity randomness. */
export function hash01(a: number, b = 0, c = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
