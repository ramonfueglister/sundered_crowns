// Plays the chronicle of rulers of 1291 (public/data/rulers_1291.json) on a world of 1291 and prints, on fixed days,
// how many realms of the world frame have a holder, and on the first day whether the holder is the ruler the 1291
// research names (data/history/1291/*.json). Run after build.ts:
//
//   npx tsx tools/history/rulers/check.ts
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { newWorldState } from '../../sim/load';
import { dayOf } from '../../../src/sim/content/chronicle';
import { playChronicle } from '../../../src/sim/systems/rulers';

const ROOT = resolve(import.meta.dirname, '../../..');
const frame: { realms: { id: string; ruler_1291: string | null }[] } = JSON.parse(readFileSync(resolve(ROOT, 'data/history/rulers/realms_frame.json'), 'utf8'));
const lists = new Set(readdirSync(resolve(ROOT, 'data/history/rulers/lists')).map((f) => f.replace(/\.csv$/, '')));
const { s, w } = newWorldState(1291, 1291);
const at = new Map(s.realmText.map((t, k) => [t.key, k]));
const holder = (id: string) => { const h = s.realm.cols.holder[at.get(id)!]; return h < 0 ? null : s.named.find((n) => n.person === h)!.name; };
const words = (x: string) => new Set(x.toLowerCase().replace(/[^a-z0-9À-ɏ ]/g, ' ').split(/\s+/).filter((t) => t.length > 2));
let same = 0, other = 0, none = 0; const differ: string[] = [];
for (const r of frame.realms) {
  if (!lists.has(r.id)) continue;
  const h = holder(r.id);
  if (!h) { none++; continue; }
  if (!r.ruler_1291) continue;
  const a = words(h), b = words(r.ruler_1291);
  if ([...a].some((t) => b.has(t))) same++; else { other++; differ.push(`${r.id}: chronicle ${h} / research ${r.ruler_1291}`); }
}
console.log(`1 January 1291, realms with a list: ${lists.size}; holder agrees with the research ${same}, differs ${other}, none ${none}`);
for (const d of differ) console.log('  ' + d);
for (const date of ['1350-01-01', '1453-06-01', '1500-01-01', '1648-01-01', '1789-07-14', '1848-12-31']) {
  const day = dayOf(date, 1291)!;
  playChronicle(s, w, s.day + 1, day); s.day = day;
  const held = frame.realms.filter((r) => holder(r.id)).length;
  const sample = ['england', 'france', 'castile', 'hungary', 'bohemia', 'venice', 'mamluk', 'golden_horde'].map((k) => `${k}: ${holder(k) ?? '-'}`).join('; ');
  console.log(`${date}: ${held} of ${frame.realms.length} realms have a holder. ${sample}`);
}
