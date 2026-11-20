// Writes src/sim/content/town_ways_<year>.json: in which directions the ways of the world leave each town, and of what
// kind (settlement feature 3, docs/SETTLEMENT_DESIGN.md). The first streets of a town run out from its market along
// these ways (Pounds 2005, pp. 23–26: the streets of a town grew from the paths by which people approached its
// nucleus). Read from public/data/roads_<year>.json (tools/roads/build_roads.ts): its lines are in map pixels, a way
// running through the middle of each pixel.
//   npx tsx tools/settlement/town_ways.ts 1291
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import gazetteer from '../../data/content/gazetteer.json';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const year = Number(process.argv[2] ?? 1291);
const geo = JSON.parse(readFileSync(resolve(ROOT, 'public/data/geo.json'), 'utf8')) as {
  W: number;
  H: number;
  lon0: number;
  lon1: number;
  latN: number;
  latS: number;
};
const roads = JSON.parse(readFileSync(resolve(ROOT, `public/data/roads_${year}.json`), 'utf8')) as {
  lines: { k: number; p: number[] }[];
};
const land = JSON.parse(readFileSync(resolve(ROOT, `public/data/hamletland_${year}.json`), 'utf8')) as {
  town: number[];
};
const places = gazetteer.places as { name: string; lon: number; lat: number }[];
const merc = (deg: number) => Math.asinh(Math.tan((deg * Math.PI) / 180));
const pixelOf = (lon: number, lat: number): [number, number] => [
  ((lon - geo.lon0) / (geo.lon1 - geo.lon0)) * geo.W,
  ((merc(geo.latN) - merc(lat)) / (merc(geo.latN) - merc(geo.latS))) * geo.H,
];

/** a way is taken as leaving the town when one of its pixels lies this near to the town's pixel (map pixels) */
const NEAR = 1.5;
/** its direction is that of the way this many pixels on from the town (some 6 km in middle Europe) */
const AHEAD = 3;
/** two ways leaving within this angle of each other leave by one street (radians, 30°) */
const SAME = Math.PI / 6;

// the pixels of each line, as their middles
const lines = roads.lines.map((l) => {
  const pts: [number, number][] = [];
  for (let i = 0; i < l.p.length; i += 2) pts.push([l.p[i] + 0.5, l.p[i + 1] + 0.5]);
  return { k: l.k, pts };
});
const grid = new Map<number, { l: number; i: number }[]>();
const key = (x: number, y: number) => Math.floor(y) * 65536 + Math.floor(x);
lines.forEach((l, li) =>
  l.pts.forEach(([x, y], i) => {
    const k = key(x, y),
      a = grid.get(k);
    if (a) a.push({ l: li, i });
    else grid.set(k, [{ l: li, i }]);
  }),
);

const out: { site: number; ways: { a: number; k: number }[] }[] = [];
for (const site of [...new Set(land.town)].sort((a, b) => a - b)) {
  const [tx, ty] = pixelOf(places[site].lon, places[site].lat);
  const found: { a: number; k: number }[] = [];
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++)
      for (const h of grid.get(key(tx + dx, ty + dy)) ?? []) {
        const pts = lines[h.l].pts,
          [x, y] = pts[h.i];
        if (Math.hypot(x - tx, y - ty) > NEAR) continue;
        for (const step of [-AHEAD, AHEAD]) {
          const j = Math.max(0, Math.min(pts.length - 1, h.i + step));
          const [ax, ay] = pts[j];
          if (Math.hypot(ax - tx, ay - ty) < NEAR + 0.5) continue; // the line ends at the town on this side
          found.push({ a: Math.atan2(ay - ty, ax - tx), k: lines[h.l].k }); // east 0, south positive (map rows run south)
        }
      }
  // one street for the ways that leave in one direction: the most important kind, the mean direction
  found.sort((p, q) => q.k - p.k || p.a - q.a);
  const ways: { a: number; k: number; n: number; sx: number; sy: number }[] = [];
  for (const f of found) {
    const w = ways.find(
      (v) =>
        Math.abs(Math.atan2(Math.sin(f.a - Math.atan2(v.sy, v.sx)), Math.cos(f.a - Math.atan2(v.sy, v.sx)))) < SAME,
    );
    if (w) {
      w.sx += Math.cos(f.a);
      w.sy += Math.sin(f.a);
      w.n++;
    } else ways.push({ a: f.a, k: f.k, n: 1, sx: Math.cos(f.a), sy: Math.sin(f.a) });
  }
  out.push({ site, ways: ways.map((w) => ({ a: Math.round(Math.atan2(w.sy, w.sx) * 1000) / 1000, k: w.k })) });
}
const file = {
  year,
  source: `the ways of public/data/roads_${year}.json that leave each town (tools/settlement/town_ways.ts): a the direction (radians, east 0, south positive), k the kind (0 track, 1 road, 2 highway)`,
  towns: out,
};
writeFileSync(resolve(ROOT, `src/sim/content/town_ways_${year}.json`), JSON.stringify(file) + '\n');
const counts = out.map((t) => t.ways.length).sort((a, b) => a - b);
console.log(
  `town_ways_${year}.json: ${out.length} towns; ways per town ${counts[0]} / ${counts[counts.length >> 1]} / ${counts[counts.length - 1]}; without a way ${counts.filter((c) => c === 0).length}`,
);
