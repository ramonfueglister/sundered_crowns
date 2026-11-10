// Coat of arms drawn as SVG from our own `coa` spec (docs/DATA_SCHEMA.md): shield, tinctures, divisions,
// ordinaries and charges. Charges are simple heraldic silhouettes in a 100×100 box, outlined in ink.
import { memo } from 'preact/compat';
import { lang } from '../i18n';

/** Inscriptions on a shield (a 'letter' charge with a long text, the Mamluk sultan's blazon) as German readers read
 *  them; the text is drawn into the arms and hidden from screen readers and from the text of tables. */
const INSCRIPTION_DE: Record<string, string> = { 'Glory to our lord the Sultan': 'Ruhm unserem Herrn, dem Sultan' };

export const TINCTURE: Record<string, string> = {
  or: '#e2b63c', argent: '#f2efe6', gules: '#b8261d', azure: '#1f4f9e', vert: '#2f7a3c', sable: '#1d1a17', purpure: '#76306f',
  murrey: '#7a2f3a', sanguine: '#8a2a1e', tenne: '#b5651d', orange: '#d9822b', proper: '#9a6a3a', carnation: '#e2b49a', cendree: '#8a8a8a',
};
const DARK = '#1b120a';
const tinct = (x: string | null | undefined, fb: string) => { if (!x) return fb; const k = String(x).toLowerCase(); if (TINCTURE[k]) return TINCTURE[k]; if (/^#[0-9a-f]{3,8}$/i.test(k)) return k; return fb; };
const isMetal = (c: string) => c === TINCTURE.or || c === TINCTURE.argent;
/** A tincture that contrasts with the field (rule of tincture: metal on colour). */
const contrast = (c: string) => (isMetal(c) ? TINCTURE.gules : TINCTURE.or);

const SHIELD = 'M3,3 H97 V52 C97,86 72,106 50,117 C28,106 3,86 3,52 Z';

// ---------------------------------------------------------------- charges
// Each charge: f = filled paths, l = stroked line paths [d, width], k = detail paths drawn in ink.
interface Ch { f: string[]; l?: [string, number][]; k?: string[] }
const mirror = (d: string) => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${(100 - Number(x)).toFixed(1)},${y}`).replace(/A(\d+),(\d+) (\d) (\d),(\d)/g, (_m, rx, ry, rot, la, sw) => `A${rx},${ry} ${rot} ${la},${1 - Number(sw)}`);
function star(n: number, cx: number, cy: number, r1: number, r2: number, rot = -Math.PI / 2) {
  let d = '';
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1; const a = rot + (i * Math.PI) / n; d += `${i ? 'L' : 'M'}${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }
  return d + 'Z';
}
const circle = (cx: number, cy: number, r: number) => `M${cx - r},${cy} A${r},${r} 0 1,0 ${cx + r},${cy} A${r},${r} 0 1,0 ${cx - r},${cy} Z`;

const LION = 'M17,25 C16,19 21,13 27,12 C30,7 38,6 43,10 C49,10 52,16 50,22 C55,27 60,33 63,40 C67,46 71,51 72,58 C76,62 78,68 76,74 L80,84 C83,85 86,88 85,92 L74,93 C72,90 71,86 70,82 C66,80 62,76 60,72 C56,74 52,74 48,72 L46,80 C49,82 51,86 49,90 L36,91 C35,87 36,83 38,80 L37,70 C34,64 33,57 35,51 L31,50 L26,55 L18,57 C14,57 13,53 16,51 L24,48 L27,44 C24,43 21,42 18,42 L11,43 C8,42 8,38 11,37 L22,35 C24,33 26,32 28,31 C25,31 22,30 20,28 Z';
const LION_TAIL = 'M73,60 C82,56 86,48 84,40 C82,33 84,26 90,24 C88,28 89,32 91,36 C94,46 88,58 76,66 Z';
const LION_PASS = 'M20,40 C17,33 21,26 28,24 C34,21 41,25 42,31 C50,33 62,33 72,34 C80,35 84,40 84,48 C84,54 82,58 79,61 L81,77 C83,78 85,80 84,83 L74,83 L72,64 C69,65 66,65 63,64 L62,77 C64,78 65,80 64,83 L55,83 L54,63 C48,64 42,63 38,61 L36,76 C38,77 39,80 38,83 L28,83 L29,60 C27,58 26,56 25,53 L21,64 C23,66 23,68 21,70 L12,70 L18,50 C15,47 16,43 20,40 Z';
const LION_PASS_TAIL = 'M82,44 C90,40 92,30 88,22 C86,17 89,13 94,13 C92,17 93,20 95,24 C98,33 94,44 84,50 Z';
const EAGLE_WING_L = 'M43,34 C34,26 22,18 6,12 C8,17 9,20 5,22 C10,25 11,28 6,31 C12,33 13,37 8,40 C14,42 15,46 11,49 C17,50 19,54 16,58 C24,58 32,56 42,52 Z';
const EAGLE_BODY = 'M44,30 C44,26 46,23 50,23 C54,23 56,26 56,30 C59,36 60,46 58,56 C58,62 56,66 54,68 L64,86 C60,86 56,84 54,82 L50,90 L46,82 C44,84 40,86 36,86 L46,68 C44,66 42,62 42,56 C40,46 41,36 44,30 Z';
const EAGLE_HEAD_L = 'M49,25 C46,18 42,14 37,15 C33,16 31,19 30,22 L26,24 L31,25 C33,27 37,27 40,26 C43,28 45,30 46,32 Z';
const EAGLE_LEGS = 'M44,62 L34,70 L30,68 L28,73 L33,73 L32,77 L37,74 L46,66 Z';
const FLEUR = [
  'M50,6 C58,16 61,30 55,48 L45,48 C39,30 42,16 50,6 Z',
  'M44,50 C31,51 18,45 15,33 C13,25 20,19 27,23 C23,25 22,31 27,35 C32,40 38,42 44,44 Z',
  'M32,48 H68 V57 H32 Z',
  'M44,58 C43,66 41,72 38,77 C35,82 29,84 26,80 C30,79 34,74 35,67 L36,58 Z',
  'M46,58 H54 L53,74 L50,80 L47,74 Z',
];
const FLEUR_ALL = [...FLEUR, mirror(FLEUR[1]), mirror(FLEUR[3])];

const BEAST_BODY = 'M24,44 C32,36 62,36 76,40 C83,43 85,54 80,60 L81,80 C83,81 84,83 83,85 L74,85 L72,64 C69,66 66,66 63,64 L62,81 C64,82 65,84 64,86 L56,86 L56,64 C48,66 40,66 34,64 L33,81 C35,82 36,84 35,86 L27,86 L27,62 C25,61 24,60 23,58 L22,81 C24,82 25,84 24,86 L15,86 L17,56 C16,50 19,46 24,44 Z';

const CHARGES: Record<string, () => Ch> = {
  lion: () => ({ f: [LION, LION_TAIL], k: ['M24,18 L27,20', 'M42,40 C46,46 47,52 46,58'] }),
  lion_passant: () => ({ f: [LION_PASS, LION_PASS_TAIL], k: ['M26,30 L29,31'] }),
  eagle: () => ({ f: [EAGLE_WING_L, mirror(EAGLE_WING_L), EAGLE_BODY, EAGLE_HEAD_L, EAGLE_LEGS, mirror(EAGLE_LEGS)], k: ['M36,20 L38,20'] }),
  double_eagle: () => ({ f: [EAGLE_WING_L, mirror(EAGLE_WING_L), EAGLE_BODY, 'M47,30 C44,22 40,16 34,16 C30,17 28,20 27,23 L23,25 L28,26 C31,28 35,28 38,27 C41,29 43,31 44,33 Z', mirror('M47,30 C44,22 40,16 34,16 C30,17 28,20 27,23 L23,25 L28,26 C31,28 35,28 38,27 C41,29 43,31 44,33 Z'), EAGLE_LEGS, mirror(EAGLE_LEGS)] }),
  fleur_de_lis: () => ({ f: FLEUR_ALL }),
  lily: () => ({ f: [...FLEUR_ALL.slice(0, 2), mirror(FLEUR[1]), 'M47,57 H53 V92 H47 Z', 'M36,48 H64 V56 H36 Z'] }),
  cross_small: () => ({ f: ['M42,8 H58 V40 H90 V56 H58 V92 H42 V56 H10 V40 H42 Z'] }),
  star: () => ({ f: [star(6, 50, 50, 44, 18)] }),
  crescent: () => ({ f: ['M12,36 A38,38 0 0,0 88,36 A44,44 0 0,1 12,36 Z'] }),
  moon: () => ({ f: ['M62,10 A40,40 0 1,0 62,90 A34,34 0 1,1 62,10 Z'] }),
  tower: () => ({ f: ['M28,92 L31,34 L25,34 L25,14 L34,14 L34,22 L42,22 L42,14 L58,14 L58,22 L66,22 L66,14 L75,14 L75,34 L69,34 L72,92 Z'], k: ['M43,92 L43,72 C43,64 57,64 57,72 L57,92 Z', 'M47,44 h6 v10 h-6 Z'] }),
  castle: () => ({ f: ['M8,92 V48 H5 V36 H11 V42 H16 V36 H22 V48 H20 V60 H36 V40 H33 V26 H40 V32 H46 V26 H54 V32 H60 V26 H67 V40 H64 V60 H80 V48 H78 V36 H84 V42 H89 V36 H95 V48 H92 V92 Z'], k: ['M42,92 V76 C42,68 58,68 58,76 V92 Z', 'M13,58 h4 v8 h-4 Z', 'M83,58 h4 v8 h-4 Z', 'M48,44 h4 v8 h-4 Z'] }),
  key: () => ({ f: [circle(50, 22, 15), 'M46,35 H54 V90 H46 Z', 'M54,70 H68 V77 H62 V81 H54 Z', 'M54,82 H66 V89 H54 Z'], k: [circle(50, 22, 7)] }),
  keys_crossed: () => ({ f: [], l: [['M22,86 L76,16', 9], ['M78,86 L24,16', 9]], k: [circle(80, 12, 9), circle(20, 12, 9), 'M28,78 L34,86 L38,82', 'M72,78 L66,86 L62,82'] }),
  crown: () => ({ f: ['M16,80 L12,36 L31,56 L50,26 L69,56 L88,36 L84,80 Z', 'M14,80 H86 V90 H14 Z', circle(12, 33, 5), circle(50, 22, 6), circle(88, 33, 5)], k: [circle(50, 85, 2.5), circle(32, 85, 2.5), circle(68, 85, 2.5)] }),
  rose: () => ({ f: [0, 1, 2, 3, 4].map((i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; return circle(50 + 22 * Math.cos(a), 50 + 22 * Math.sin(a), 19); }), k: [circle(50, 50, 9)] }),
  sword: () => ({ f: ['M50,4 L55,14 L55,64 L45,64 L45,14 Z', 'M28,64 H72 V71 H28 Z', 'M46,71 H54 V86 H46 Z', circle(50, 91, 6)], k: ['M50,14 V60'] }),
  bear: () => ({ f: [BEAST_BODY, 'M30,44 C26,32 18,28 10,32 L4,36 C4,40 8,42 12,42 C16,48 24,50 30,50 Z', circle(16, 28, 4.5), 'M78,44 C82,42 86,44 86,48 C84,50 80,50 78,48 Z'], k: ['M7,38 L9,38'] }),
  wolf: () => ({ f: [BEAST_BODY, 'M28,44 C24,34 18,30 12,30 L14,22 L18,29 L20,22 L22,30 C22,32 6,34 2,40 C6,44 14,44 18,44 C22,48 26,50 30,50 Z', 'M78,44 C88,46 94,56 92,70 C90,66 88,60 82,54 Z'] }),
  horse: () => ({ f: ['M28,48 C36,40 62,40 74,44 C82,47 84,56 79,62 L82,84 C84,85 85,87 84,89 L76,89 L72,66 C66,68 62,68 60,66 L60,85 C62,86 63,88 62,90 L54,90 L54,66 C46,68 40,68 36,66 L34,86 C36,87 37,89 36,91 L28,91 L29,64 C27,63 26,62 25,60 L22,84 C24,85 25,87 24,89 L16,89 L19,58 C18,54 22,50 28,48 Z',
    'M30,50 C28,38 26,28 22,22 C18,18 12,18 8,22 L4,30 C4,33 6,35 10,34 L16,32 C20,38 22,46 24,54 Z', 'M22,20 L24,12 L27,20 Z', 'M80,48 C88,52 90,64 88,80 C86,74 84,66 79,58 Z'], k: ['M24,24 C30,30 32,40 32,50'] }),
  boar: () => ({ f: [BEAST_BODY.replace('M24,44 C32,36', 'M24,46 C30,30').replace('62,36 76,40', '62,30 76,40'), 'M28,46 C24,40 16,40 6,44 L4,52 C10,54 18,54 26,56 Z', 'M18,40 L22,32 L24,42 Z', 'M80,46 C86,44 88,48 86,52 Z'], k: ['M8,50 C10,46 14,46 14,50', 'M30,34 L34,30 L38,34 L42,29 L46,33 L50,28 L54,32 L58,28'] }),
  griffin: () => ({ f: [LION, LION_TAIL, 'M48,30 C56,20 70,10 90,8 C86,14 88,18 84,22 C88,24 86,30 80,32 C84,36 80,40 74,40 C70,42 62,42 56,40 Z', 'M20,16 L8,24 L18,26 Z'] }),
  dragon: () => ({ f: [LION, 'M48,30 C56,18 70,8 92,6 C86,14 90,18 84,22 C90,26 86,32 80,32 C84,38 78,42 72,40 C66,42 60,40 56,38 Z', 'M72,62 C86,60 94,70 90,82 C88,90 80,94 72,92 C78,88 82,84 80,78 C78,72 74,70 70,68 Z', 'M20,14 L14,6 L24,12 Z'] }),
  ship: () => ({ f: ['M8,66 H92 C88,80 76,88 60,88 H40 C24,88 12,80 8,66 Z', 'M48,12 H52 V66 H48 Z', 'M26,20 C36,18 64,18 74,20 C76,34 76,46 74,58 C64,60 36,60 26,58 C24,46 24,34 26,20 Z', 'M52,6 L70,10 L52,14 Z'], k: ['M50,20 V58', 'M26,39 H74'] }),
  wheel: () => ({ f: [circle(50, 50, 40), circle(50, 50, 9)], l: [0, 1, 2, 3, 4, 5].map((i) => { const a = (i * Math.PI) / 3; return [`M${(50 + 8 * Math.cos(a)).toFixed(1)},${(50 + 8 * Math.sin(a)).toFixed(1)} L${(50 + 32 * Math.cos(a)).toFixed(1)},${(50 + 32 * Math.sin(a)).toFixed(1)}`, 5] as [string, number]; }), k: [circle(50, 50, 31)] }),
  horn: () => ({ f: ['M10,40 C30,40 52,52 64,70 C70,78 78,82 88,80 L90,92 C76,94 66,90 58,80 C48,64 30,54 10,52 Z', 'M86,76 L94,74 L96,94 L88,96 Z'], l: [['M22,44 C30,24 60,22 72,46 C76,56 78,64 76,74', 3]] }),
  fish: () => ({ f: ['M10,50 C26,30 60,30 76,46 L92,34 C90,44 90,56 92,66 L76,54 C60,70 26,70 10,50 Z'], k: [circle(22, 47, 2.5), 'M34,40 C38,46 38,54 34,60', 'M50,36 L54,30 L60,36', 'M50,64 L54,70 L60,64'] }),
  tree: () => ({ f: ['M45,92 L46,58 L40,52 L46,54 L47,46 H53 L54,54 L60,52 L54,58 L55,92 Z', circle(50, 32, 20), circle(32, 44, 16), circle(68, 44, 16), circle(40, 22, 14), circle(60, 22, 14), 'M30,92 C38,88 44,88 46,86 H54 C56,88 62,88 70,92 Z'] }),
  stag_head: () => ({ f: ['M38,46 C38,40 44,38 50,38 C56,38 62,40 62,46 L60,66 C58,76 54,82 50,84 C46,82 42,76 40,66 Z', 'M38,46 L28,40 L36,52 Z', 'M62,46 L72,40 L64,52 Z'],
    l: [['M42,40 C36,30 30,24 20,10 M34,28 L22,26 M30,20 L32,8', 4.5], ['M58,40 C64,30 70,24 80,10 M66,28 L78,26 M70,20 L68,8', 4.5]], k: [circle(44, 54, 2), circle(56, 54, 2)] }),
  bull_head: () => ({ f: ['M34,40 C34,34 42,30 50,30 C58,30 66,34 66,40 L62,66 C60,78 56,84 50,84 C44,84 40,78 38,66 Z', 'M34,42 L20,40 L32,52 Z', 'M66,42 L80,40 L68,52 Z', 'M36,36 C26,32 18,24 16,10 C24,18 32,24 40,30 Z', mirror('M36,36 C26,32 18,24 16,10 C24,18 32,24 40,30 Z')], k: [circle(43, 50, 2), circle(57, 50, 2), 'M44,76 C46,74 48,74 48,78 M56,76 C54,74 52,74 52,78'] }),
  mountain: () => ({ f: ['M4,94 C8,70 18,56 28,56 C34,56 38,60 40,64 C42,42 46,30 50,30 C54,30 58,42 60,64 C62,60 66,56 72,56 C82,56 92,70 96,94 Z'] }),
  tamga: () => ({ f: [], l: [['M50,92 V30 M50,52 C34,52 26,40 26,22 M50,52 C66,52 74,40 74,22 M36,76 H64', 9]] }),
  tughra_like: () => ({ f: [], l: [['M20,80 C40,84 70,84 86,76 M30,80 V20 M42,80 V30 M54,80 V24 M30,60 C10,50 10,30 30,36 C50,40 70,40 80,56 C86,66 76,74 66,70', 5]] }),
  bezant: () => ({ f: [circle(50, 50, 34)] }),
  roundel: () => ({ f: [circle(50, 50, 34)] }),
  crozier: () => ({ f: [circle(50, 40, 6)], l: [['M50,94 V30 C50,10 78,10 78,26 C78,38 64,40 62,30', 7]] }),
  hen: () => ({ f: ['M28,40 C26,30 30,22 38,22 C44,22 46,28 46,34 C56,30 68,26 80,14 C82,30 80,48 72,58 C66,66 54,70 42,68 C32,66 26,56 28,40 Z', 'M28,30 L18,32 L28,36 Z', 'M34,22 L36,14 L40,20 L44,14 L44,24 Z'], l: [['M42,68 L40,86 L34,90 M40,86 L46,90 M54,68 L56,86 L50,90 M56,86 L62,90', 3.5]], k: [circle(34, 28, 1.8)] }),
  lamb: () => ({ f: [BEAST_BODY.replace(/L(\d+),8[1-6]/g, 'L$1,80'), circle(20, 40, 11), 'M78,44 C84,46 86,52 82,56 Z'], l: [['M66,40 V10', 3]], k: [circle(17, 38, 1.8)] }),
  moor_head: () => ({ f: ['M60,20 C44,14 28,22 26,40 C24,46 20,50 18,54 C20,56 22,56 24,57 C24,60 22,62 24,64 C26,66 28,66 28,70 C30,76 36,78 44,76 C46,82 46,88 44,92 H76 C72,80 72,68 76,58 C82,44 78,26 60,20 Z'], k: ['M26,40 C38,30 60,28 78,34'] }),
  letter: () => ({ f: [] }),
};
// variants that only differ in name
CHARGES.cross = CHARGES.cross_small; CHARGES.mullet = CHARGES.star; CHARGES.estoile = CHARGES.star; CHARGES.lion_rampant = CHARGES.lion; CHARGES.alerion = CHARGES.eagle;

// ---------------------------------------------------------------- placement
type Pos = [number, number, number, number?]; // x, y, size, rotation
function positions(arr: string | undefined, count: number, box: { x: number; y: number; w: number; h: number }, opts: { between?: boolean; ordinary?: string | null }): Pos[] {
  const { x, y, w, h } = box; const cx = x + w / 2, cy = y + h * 0.46;
  const S = Math.min(w, h);
  const P = (fx: number, fy: number, s: number, r?: number): Pos => [x + fx * w, y + fy * h, s * S, r];
  const a = arr || '';
  if (opts.between) {
    if (count === 2) return [P(0.2, 0.32, 0.22), P(0.8, 0.32, 0.22)];
    if (count === 3) return [P(0.22, 0.2, 0.2), P(0.78, 0.2, 0.2), P(0.5, 0.82, 0.2)];
    if (count === 4) return [P(0.23, 0.2, 0.2), P(0.77, 0.2, 0.2), P(0.23, 0.68, 0.2), P(0.77, 0.68, 0.2)];
  }
  if (a === 'on_bend') return Array.from({ length: count }, (_, i) => { const f = (i + 1) / (count + 1); return P(0.06 + f * 0.88, 0.05 + f * 0.86, Math.min(0.2, 0.55 / count), 0); });
  if (a === 'on_cross' || a === 'in_cross') {
    const pts: [number, number][] = [[0.5, 0.42], [0.5, 0.15], [0.18, 0.42], [0.82, 0.42], [0.5, 0.74]];
    return pts.slice(0, Math.max(1, count)).map(([fx, fy]) => P(fx, fy, 0.17));
  }
  if (a === 'in_chief') return Array.from({ length: count }, (_, i) => P((i + 0.5) / count, 0.5, Math.min(0.9 / count, 0.8)));
  if (a === 'dexter') return [P(0.27, 0.44, 0.48)];
  if (a === 'in_orle') return Array.from({ length: count }, (_, i) => { const t = (i / count) * Math.PI * 2 - Math.PI / 2; return P(0.5 + 0.38 * Math.cos(t), 0.45 + 0.38 * Math.sin(t), 0.14); });
  if ((a === 'pale' || a === 'in_pale') && count > 1) return Array.from({ length: count }, (_, i) => P(0.5, 0.16 + (i * 0.62) / (count - 1), Math.min(0.62 / count + 0.08, 0.36)));
  if (a === 'fess' || a === 'in_fess') return Array.from({ length: count }, (_, i) => P((i + 0.5) / count, 0.42, Math.min(0.85 / count, 0.4)));
  if (a === 'addorsed' && count === 2) return [P(0.32, 0.44, 0.5, 90), P(0.68, 0.44, 0.5, -90)];
  if (a === 'quarters' && count <= 2) return [P(0.27, 0.22, 0.3), P(0.73, 0.68, 0.3)];
  if (a === 'quarters' || count === 4) return [P(0.27, 0.22, 0.28), P(0.73, 0.22, 0.28), P(0.27, 0.66, 0.28), P(0.73, 0.66, 0.28)];
  if (count <= 1) return [[cx, cy, S * (opts.ordinary === 'cross' || opts.ordinary === 'saltire' ? 0.42 : 0.68)]];
  if (count === 2) return [P(0.3, 0.42, 0.36), P(0.7, 0.42, 0.36)];
  if (count === 3) return [P(0.28, 0.24, 0.32), P(0.72, 0.24, 0.32), P(0.5, 0.68, 0.32)];
  if (count === 5) return [P(0.5, 0.14, 0.22), P(0.2, 0.42, 0.22), P(0.5, 0.42, 0.22), P(0.8, 0.42, 0.22), P(0.5, 0.7, 0.22)];
  // 6 and more: rows 3-2-1 / 3-3-2-1...
  const rows: number[] = count === 6 ? [3, 2, 1] : count <= 9 ? [3, 3, count - 6].filter(Boolean) : [4, 3, 2, count - 9].filter((n) => n > 0);
  const out: Pos[] = []; const rh = 0.8 / rows.length; const sz = Math.min(0.24, rh * 0.95);
  rows.forEach((n, r) => { for (let i = 0; i < n; i++) out.push(P(0.5 + (i - (n - 1) / 2) * 0.28, 0.12 + r * rh + rh / 2 - 0.04, sz)); });
  return out;
}
function semee(box: { x: number; y: number; w: number; h: number }): Pos[] {
  const out: Pos[] = []; const step = 19;
  for (let r = 0; r * step < box.h + step; r++) for (let c = -1; c * step < box.w + step; c++) out.push([box.x + c * step + (r % 2 ? step / 2 : 0) + 6, box.y + r * step + 8, 13]);
  return out;
}

let uid = 0;
interface Group { type: string; tincture?: string; count?: number; arrangement?: string; text?: string }

function ChargeG({ g, p, fill, ink, sw }: { g: Group; p: Pos; fill: string; ink: string; sw: number }) {
  const [x, y, s, rot] = p; const k = s / 100;
  const tr = `translate(${(x - s / 2).toFixed(2)},${(y - s / 2).toFixed(2)}) scale(${k.toFixed(4)})${rot ? ` rotate(${rot},50,50)` : ''}`;
  if (g.type === 'letter') {
    const raw = String(g.text || 'A'); const long = raw.length > 3;
    const txt = long && lang.value === 'de' ? INSCRIPTION_DE[raw] ?? raw : raw;
    return <g transform={tr} aria-hidden="true"><text x={50} y={long ? 58 : 76} text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="bold" font-size={long ? 16 : 80}
      {...(long ? { textLength: 92, lengthAdjust: 'spacingAndGlyphs' } : {})} fill={fill} stroke={ink} stroke-width={long ? 0.6 : 2.5} paint-order="stroke">{long ? txt.slice(0, 40) : txt.slice(0, 2)}</text></g>;
  }
  const ch = (CHARGES[g.type] || CHARGES.roundel)();
  const w0 = sw / k; // outline width in local units
  return <g transform={tr}>
    {ch.f.map((d) => <path d={d} fill={ink} stroke={ink} stroke-width={w0 * 2} stroke-linejoin="round" />)}
    {(ch.l || []).map(([d, w]) => <path d={d} fill="none" stroke={ink} stroke-width={w + w0 * 2} stroke-linecap="round" stroke-linejoin="round" />)}
    {ch.f.map((d) => <path d={d} fill={fill} fill-rule="evenodd" />)}
    {(ch.l || []).map(([d, w]) => <path d={d} fill="none" stroke={fill} stroke-width={w} stroke-linecap="round" stroke-linejoin="round" />)}
    {(ch.k || []).map((d) => <path d={d} fill="none" stroke={ink} stroke-width={Math.max(w0, 1.6)} stroke-linecap="round" />)}
  </g>;
}

function divisionShapes(div: string, c2: string, id: string) {
  const R = (x: number, y: number, w: number, h: number) => <rect x={x} y={y} width={w} height={h} fill={c2} />;
  switch (div) {
    case 'per_pale': return R(50, 0, 50, 120);
    case 'per_fess': return R(0, 56, 100, 64);
    case 'quarterly': return <>{R(50, 0, 50, 56)}{R(0, 56, 50, 64)}</>;
    case 'per_bend': return <path d="M0,0 L100,120 L0,120 Z" fill={c2} />;
    case 'per_bend_sinister': return <path d="M100,0 L0,120 L100,120 Z" fill={c2} />;
    case 'per_saltire': return <path d="M0,0 L50,56 L0,120 Z M100,0 L50,56 L100,120 Z" fill={c2} />;
    case 'per_chevron': return <path d="M0,120 L0,96 L50,48 L100,96 L100,120 Z" fill={c2} />;
    case 'paly': return <>{[1, 3, 5].map((i) => R(i * (100 / 6), 0, 100 / 6, 120))}</>;
    case 'barry': return <>{[1, 3, 5, 7].map((i) => R(0, i * 15, 100, 15))}</>;
    case 'bendy': return <g>{[-3, -1, 1, 3, 5].map((i) => <path d={`M${i * 22},0 L${i * 22 + 22},0 L${i * 22 + 22 + 110},120 L${i * 22 + 110},120 Z`} fill={c2} />)}</g>;
    case 'chequy': { const out = []; for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) if ((r + c) % 2) out.push(R(c * 16.67, r * 15, 16.8, 15.2)); return <>{out}</>; }
    case 'lozengy': { const out = []; for (let r = 0; r < 9; r++) for (let c = 0; c < 6; c++) if ((r + c) % 2 === 0) { const x = c * 18 + (r % 2 ? 9 : 0), y = r * 14; out.push(<path d={`M${x},${y - 14} L${x + 9},${y} L${x},${y + 14} L${x - 9},${y} Z`} fill={c2} />); } return <>{out}</>; }
  }
  void id; return null;
}

function ordinaryShape(o: string, c: string, ink: string, sw: number) {
  const st = { fill: c, stroke: ink, 'stroke-width': sw };
  switch (o) {
    case 'fess': return <rect x={-2} y={40} width={104} height={30} {...st} />;
    case 'pale': return <rect x={35} y={-2} width={30} height={124} {...st} />;
    case 'bend': return <g><path d="M-2,-2 L100,120" stroke={ink} stroke-width={24 + sw * 2} /><path d="M-2,-2 L100,120" stroke={c} stroke-width={24} /></g>;
    case 'bend_sinister': return <g><path d="M102,-2 L0,120" stroke={ink} stroke-width={24 + sw * 2} /><path d="M102,-2 L0,120" stroke={c} stroke-width={24} /></g>;
    case 'chevron': return <g><path d="M-4,100 L50,44 L104,100" fill="none" stroke={ink} stroke-width={20 + sw * 2} /><path d="M-4,100 L50,44 L104,100" fill="none" stroke={c} stroke-width={20} /></g>;
    case 'cross': return <path d="M40,-2 H60 V44 H102 V64 H60 V122 H40 V64 H-2 V44 H40 Z" {...st} />;
    case 'cross_patriarchal': return <path d="M44,8 H56 V22 H74 V32 H56 V44 H84 V56 H56 V108 H44 V56 H16 V44 H44 V32 H26 V22 H44 Z" {...st} />;
    case 'saltire': return <g>{['M-2,-2 L102,122', 'M102,-2 L-2,122'].map((d) => <path d={d} stroke={ink} stroke-width={18 + sw * 2} />)}{['M-2,-2 L102,122', 'M102,-2 L-2,122'].map((d) => <path d={d} stroke={c} stroke-width={18} />)}</g>;
    case 'chief': return <rect x={-2} y={-2} width={104} height={34} {...st} />;
    case 'bordure': return <path d={SHIELD} fill="none" stroke={c} stroke-width={20} />;
  }
  return null;
}

function CoaInner({ coa, color, size = 32 }: { coa: any; color: [number, number, number] | number[]; size?: number }) {
  const id = `coa${++uid}`;
  const nat = `rgb(${color?.[0] ?? 120},${color?.[1] ?? 110},${color?.[2] ?? 100})`;
  const spec = coa && typeof coa === 'object' ? coa : null;
  const field = tinct(spec?.field, nat);
  const div = spec?.division || 'plain';
  const f2 = tinct(spec?.field2, contrast(field));
  const ord = spec?.ordinary || null;
  const oc = tinct(spec?.ordinary_tincture, contrast(field));
  const groups: Group[] = Array.isArray(spec?.charges) ? spec.charges.filter((g: any) => g && g.type) : [];
  const sw = size < 28 ? 1.4 : size < 60 ? 1.1 : 0.8; // outline width in shield units
  const ink = DARK;
  const fieldBox = ord === 'chief' ? { x: 4, y: 32, w: 92, h: 84 } : { x: 6, y: 6, w: 88, h: 106 };
  const chiefBox = { x: 4, y: 2, w: 92, h: 30 };
  const quarterBox = (q: number) => ({ x: q % 2 ? 52 : 4, y: q < 2 ? 4 : 58, w: 44, h: q < 2 ? 50 : 52 });

  const items: any[] = [];
  const semees = groups.filter((g) => g.arrangement === 'semee' || (g.count || 1) >= 10);
  const main = groups.filter((g) => !semees.includes(g));
  const draw = (g: Group, ps: Pos[], key: string) => ps.forEach((p, i) => items.push(<ChargeG key={`${key}${i}`} g={g} p={p} fill={tinct(g.tincture, contrast(field))} ink={ink} sw={sw} />));
  const quarterly = div === 'quarterly' && groups.length >= 1;
  if (quarterly) {
    // first charge group in quarters 1 & 4, second in 2 & 3
    groups.slice(0, 2).forEach((g, gi) => {
      const qs = gi === 0 ? [0, 3] : [1, 2];
      for (const q of qs) {
        const b = quarterBox(q);
        if (g.arrangement === 'semee' || (g.count || 1) >= 8) draw(g, semee(b).map((p) => [p[0], p[1], 10] as Pos).filter((p) => p[0] > b.x - 2 && p[0] < b.x + b.w + 2 && p[1] < b.y + b.h + 4), `q${gi}${q}`);
        else draw(g, positions(g.arrangement === 'quarters' ? undefined : g.arrangement, g.arrangement === 'quarters' ? 1 : Math.min(3, g.count || 1), b, {}), `q${gi}${q}`);
      }
    });
  } else {
    semees.forEach((g, gi) => draw(g, semee(fieldBox), `s${gi}`));
    main.forEach((g, gi) => {
      const inChief = ord === 'chief' && (g.arrangement === 'in_chief' || (main.length > 1 && gi === main.length - 1));
      const box = inChief ? chiefBox : fieldBox;
      const between = !inChief && gi > 0 && main.length > 1 && !(ord === 'chief' && gi === main.length - 1) && g.arrangement !== 'overall';
      const arr = inChief && g.arrangement !== 'in_chief' ? 'in_chief' : g.arrangement;
      let ps = positions(arr, Math.min(g.count || 1, 12), box, { between, ordinary: ord });
      if (g.arrangement === 'overall') ps = ps.map((p) => [p[0], p[1], p[2] * 0.62] as Pos);
      if (ord === 'cross' && (g.count || 1) === 4 && !g.arrangement) ps = positions('quarters', 4, fieldBox, {}).map((p) => [p[0], p[1], p[2] * 0.85] as Pos);
      if (ord === 'cross' && (g.count || 1) === 1 && main.length === 1 && semees.length === 0) ps = [[27, 26, 30]];
      draw(g, ps, `m${gi}`);
    });
  }
  // charges sit on the ordinary for on_* arrangements; otherwise ordinary first then charges
  const onOrd = groups.some((g) => g.arrangement === 'on_bend' || g.arrangement === 'on_cross');
  const w = Math.round(size * 0.84), h = size;
  return <svg class="coa" width={w} height={h} viewBox="0 0 100 120" aria-hidden="true">
    <defs>
      <clipPath id={`${id}c`}><path d={SHIELD} /></clipPath>
      <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".38" /><stop offset=".45" stop-color="#fff" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity=".32" />
      </linearGradient>
    </defs>
    <g clip-path={`url(#${id}c)`}>
      <rect x={0} y={0} width={100} height={120} fill={field} />
      {div !== 'plain' && divisionShapes(div, f2, id)}
      {!onOrd && ord && ord !== 'bordure' && ordinaryShape(ord, oc, ink, sw)}
      {onOrd && ord && ordinaryShape(ord, oc, ink, sw)}
      {items}
      {ord === 'bordure' && ordinaryShape(ord, oc, ink, sw)}
      {ord === 'bordure' && <path d={SHIELD} fill="none" stroke={ink} stroke-width={sw} transform="translate(10,10.6) scale(.8)" vector-effect="non-scaling-stroke" />}
      <rect x={0} y={0} width={100} height={120} fill={`url(#${id}g)`} />
    </g>
    <path d={SHIELD} fill="none" stroke="#2a1a08" stroke-width={size < 28 ? 7 : 5} />
    <path d={SHIELD} fill="none" stroke="#d8b257" stroke-width={size < 28 ? 3.4 : 2.4} />
  </svg>;
}

/** SVG coat of arms. `coa` follows docs/DATA_SCHEMA.md; falls back to the nation colour. */
export const Coa = memo(CoaInner, (a, b) => a.coa === b.coa && a.size === b.size && a.color?.[0] === b.color?.[0] && a.color?.[1] === b.color?.[1] && a.color?.[2] === b.color?.[2]);
export const CHARGE_TYPES = Object.keys(CHARGES);
