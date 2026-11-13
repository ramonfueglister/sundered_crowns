// Names for the places the map data leaves unnamed. The source carries a real name for about a third of the
// locations; the rest arrive as "Upland district 958" or as a neighbour's name with a running number
// ("Karapınar 12"). Those get a name built from the real names around them: the head of one neighbour's name joined
// to the tail of another's, so a district in Anatolia sounds Turkish and one in the Maghreb sounds Arabic.
// The result depends only on the map, so every client and the world server agree.

const VOWELS = new Set('aeiouyáàâäãåæéèêëíìîïóòôöõøúùûüýıœəаеёиоуыэюяαεηιουω'.split(''));
const isV = (c: string) => VOWELS.has(c.toLowerCase());
const numbered = /^(.*?)\s*\d+$/;
const generic = /^(Upland|Lowland) district$/;

function hash(a: number, b: number) {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Splits a word between a vowel and the following consonant nearest to its middle (null if it has no such point). */
function cut(word: string): [string, string] | null {
  const mid = word.length / 2; let best = -1, bd = Infinity;
  for (let k = 1; k < word.length - 1; k++) if (isV(word[k - 1]) && !isV(word[k]) && Math.abs(k - mid) < bd) { bd = Math.abs(k - mid); best = k; }
  return best < 0 ? null : [word.slice(0, best), word.slice(best)];
}

function blend(a: string, b: string): string | null {
  const wa = a.split(' '), wb = b.split(' ');
  // two-word names ("Kafr Nakhl", "Tell Qadim"): keep the first word of one and the last word of the other
  if (wa.length > 1 && wb.length > 1) return wa[0] === wb[0] && wa[wa.length - 1] === wb[wb.length - 1] ? null : `${wa[0]} ${wb[wb.length - 1]}`;
  const x = cut(wa[0]), y = cut(wb[wb.length - 1]);
  if (!x || !y) return null;
  const out = x[0] + y[1];
  if (out.length < 4 || out.length > 13 || out === wa[0] || out === wb[wb.length - 1]) return null;
  return out[0].toUpperCase() + out.slice(1);
}

export function refineNames(names: string[], lon: ArrayLike<number>, lat: ArrayLike<number>, L: number): string[] {
  const out = names.slice();
  const real: number[] = [];
  const isReal = (n: string) => !!n && !numbered.test(n) && !generic.test(n) && !n.startsWith('#');
  for (let i = 0; i < L; i++) if (isReal(names[i])) real.push(i);
  if (!real.length) return out;
  // 2° grid of the real names
  const cell = (lo: number, la: number) => `${Math.floor(lo / 2)},${Math.floor(la / 2)}`;
  const grid = new Map<string, number[]>();
  for (const i of real) { const k = cell(lon[i], lat[i]); let g = grid.get(k); if (!g) grid.set(k, (g = [])); g.push(i); }
  const used = new Set(names.slice(0, L));
  for (let i = 0; i < L; i++) {
    if (isReal(names[i])) continue;
    // the nearest real names: widen the search ring until there are enough
    const cx = Math.floor(lon[i] / 2), cy = Math.floor(lat[i] / 2);
    let near: number[] = [];
    for (let r = 0; r < 40 && near.length < 10; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const g = grid.get(`${cx + dx},${cy + dy}`); if (g) near = near.concat(g);
      }
    }
    const cosLat = Math.cos(lat[i] * Math.PI / 180);
    near.sort((p, q) => ((lon[p] - lon[i]) * cosLat) ** 2 + (lat[p] - lat[i]) ** 2 - (((lon[q] - lon[i]) * cosLat) ** 2 + (lat[q] - lat[i]) ** 2));
    near = near.slice(0, 12);
    let name: string | null = null;
    for (let t = 0; t < 60 && !name; t++) {
      const h = hash(i, t);
      const a = names[near[h % near.length]], b = names[near[(h >>> 8) % near.length]];
      if (a === b) continue;
      const c = blend(a, b);
      if (c && !used.has(c)) name = c;
    }
    if (!name) { const base = numbered.exec(names[i])?.[1]; name = base && !generic.test(base) ? base : names[near[0]]; } // the old name stays readable at worst
    used.add(name); out[i] = name;
  }
  return out;
}
