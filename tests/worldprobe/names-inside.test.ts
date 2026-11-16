// Every realm's name lies on its own realm (Ramon, 2026-11-16: "sauber, ein für alle Mal"): for each start year's
// setup in public/data, the names are found as the game finds them (paint.ts, over the world's frame), laid out as the
// game lays them (names.ts), and every point of every letter's reach is checked against the map at its own pixels.
// The reach of the letters is the font's own, measured in the browser on EB Garamond 500 (dominant-baseline central):
// capitals and ascenders 0.35 of the size above the curve, accented capitals 0.52; the baseline 0.34 below it,
// descenders 0.54. This test does not share these numbers with paint.ts, so that a change there is caught here.
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { extentOf } from '../../src/worldprobe/extent';
import { layoutNames } from '../../src/worldprobe/names';
import { type Realms, placeAt, realmNames } from '../../src/worldprobe/paint';
import { type Index, projectionFrom } from '../../src/worldprobe/region';

const u16 = (b: Buffer) => new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
const ids = u16(gunzipSync(readFileSync('public/map/ids.bin.gz')));
const geo = JSON.parse(readFileSync('public/data/geo.json', 'utf8')) as { beyond: { w: number; h: number; cells: number; worldW: number; raster: string } };
const rest = { ids: u16(gunzipSync(readFileSync(`public/${geo.beyond.raster}`))), w: geo.beyond.w, h: geo.beyond.h, cells: geo.beyond.cells };
const index = JSON.parse(readFileSync('public/map/regions/world/index.json', 'utf8')) as Index, frame = extentOf(projectionFrom(index, 1 / index.cells));
const MARKED_CAPITAL = /[À-ÝĀ-ſ]/u, DESCENDING = /[gjpqyçQŞşŢţȘșȚțąęįųĄĘĮŲ,;ƒ]/u;

describe.each(readdirSync('public/data').filter((f) => /^setup_\d+\.json$/.test(f)))('the realms\' names of %s', (file) => {
  const setup = JSON.parse(readFileSync(`public/data/${file}`, 'utf8')) as { states: { short: { de: string } }[]; owner: (number | null)[] };
  const r: Realms = { ids, w: 6144, h: ids.length / 6144, round: geo.beyond.worldW, rest, owner: Int16Array.from(setup.owner, (o) => (typeof o === 'number' && o >= 0 ? o : -1)), colors: [] } as unknown as Realms;
  const nameOf = (k: number) => setup.states[k].short.de;

  it('lie, every letter from its top to its lowest reach, on their own realm', () => {
    const found = realmNames(r, 4, nameOf, frame).map((n) => ({ ...n, name: nameOf(n.realm) }));
    // laid out as at the nearest view of the map (4 picture pixels to the map pixel, so that no name is too small to be
    // written), on a picture too large for any name to be cut down for it; tested a map pixel apart
    const S = 4, W = 60000 * S, laid = layoutNames(found, W, W, 0, 0, S, 1), toMap = (v: number) => (v - W / 2) / S;
    expect(laid.length).toBeGreaterThan(150);
    const bad: string[] = [];
    let off = 0, all = 0;
    for (const n of laid) {
      const [ax, ay, cx, cy, bx, by] = n.d.match(/-?[\d.]+/g)!.map(Number), realm = n.realm;
      const at = (t: number): [number, number] => [(1 - t) ** 2 * ax + 2 * (1 - t) * t * cx + t * t * bx, (1 - t) ** 2 * ay + 2 * (1 - t) * t * cy + t * t * by];
      // the curve by arc length, its letters spread over `length` about its middle
      const STEPS = 400, arc = [0];
      for (let k = 1; k <= STEPS; k++) { const p = at((k - 1) / STEPS), q = at(k / STEPS); arc.push(arc[k - 1] + Math.hypot(q[0] - p[0], q[1] - p[1])); }
      const total = arc[STEPS], above = [...n.name].some((c) => MARKED_CAPITAL.test(c) && c !== c.toLowerCase()) ? 0.52 : 0.35, below = DESCENDING.test(n.name) ? 0.54 : 0.34;
      let o = 0, k = 0;
      for (let s = (total - n.length) / 2; s <= (total + n.length) / 2; s += S) {
        let i = 1;
        while (i < STEPS && arc[i] < s) i++;
        const t = (i - 1 + (s - arc[i - 1]) / (arc[i] - arc[i - 1] || 1)) / STEPS, p = at(t), q = at(Math.min(1, t + 1e-3)), d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
        const nx = -(q[1] - p[1]) / d, ny = (q[0] - p[0]) / d;
        for (let a = -above * n.size; a <= below * n.size; a += S) {
          const place = placeAt(r, Math.floor(toMap(p[0] + nx * a)), Math.floor(toMap(p[1] + ny * a)));
          k++; const ow = place >= 0 && place < r.owner.length ? r.owner[place] : -1; if (ow !== realm) { o++; if (process.env.DEBUG_NAME === n.name) console.log(n.name, Math.floor(toMap(p[0] + nx * a)), Math.floor(toMap(p[1] + ny * a)), 'owner', ow, nameOf(ow) ?? 'none', 'a/size', (a / n.size).toFixed(2)); }
        }
      }
      off += o; all += k;
      // a speck under a letter (a tiny lake or enclave inside the realm) is allowed, nothing more
      if (o > 0.004 * k) bad.push(`${n.name} ${((100 * o) / k).toFixed(1)} %`);
    }
    expect(bad, `names over their realm's edge (${off} of ${all} points)`).toEqual([]);
  }, 120_000);
});
