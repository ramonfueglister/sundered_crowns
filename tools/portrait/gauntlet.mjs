// The gauntlet of the portraits: holds what `face_colour.mjs` reads off the sample's faces against what earlier
// rounds read off the reference's faces (screenshots of Crusader Kings III, which are not in the repository; the
// numbers are, in docs/PORTRAITS.md), and says PASS or FAIL for each. As the map's gauntlet does for the look of
// the map (tools/lookprobe/gauntlet.py): a round is held against the same numbers as the round before it.
//
//   npx vite --port 5199 &            (the game's dev server)
//   NODE_PATH=$(npm root -g) node tools/portrait/gauntlet.mjs http://localhost:5199 [query] [--strict]
//   node tools/portrait/gauntlet.mjs --from=measured.txt [--strict]      (what face_colour.mjs printed, kept)
//
// `query` goes to the test page as it is (set=exposure:0.4 to try a value of the stage profile). --strict ends
// with an error when a check fails. The limits are what two faces side by side at the panel's size may differ by
// before the eye sees it at a glance: 3 L of a place's lightness, 2 of its a* and b*, 4 where one place stands
// against another (two readings). They are by judgement, not from a source: PLACEHOLDER.
//
// What it does not hold: forms (portrait/tests/faces.rs holds them against a survey of real heads), hair, cloth,
// children (the reference's faces read are a woman's and an emperor's), and whether a picture is good. A face
// can pass every line and be dead; a line that fails says where to look first.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const from = args.find(a => a.startsWith('--from='))?.slice(7);
const rest = args.filter(a => !a.startsWith('--'));
if (!from && !rest[0]) throw new Error('usage: gauntlet.mjs <address of the dev server> [query for the test page] [--strict] | --from=<what face_colour.mjs printed> [--strict]');

const text = from
  ? readFileSync(from, 'utf8')
  : execFileSync(process.execPath, [fileURLToPath(new URL('./face_colour.mjs', import.meta.url)), ...rest], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'inherit'] });

/** The means `face_colour.mjs` prints: a group's title on a line of its own, then its measures, indented. */
const groups = {};
let group = null;
for (const line of text.split('\n')) {
  if (line.trim() && !line.startsWith(' ')) { group = groups[line.trim()] = {}; continue; }
  const m = /^\s+(.*?)\s+(-?\d+(?:\.\d+)?)$/.exec(line);
  if (m && group) group[m[1]] = Number(m[2]);
}
const of = start => {
  const title = Object.keys(groups).find(t => t.startsWith(start));
  if (!title) throw new Error(`gauntlet: no group "${start}" in what face_colour.mjs printed`);
  return groups[title];
};
const women = of('grown women'), men = of('grown men'), shaven = of('shaven men');

const L = 3, AB = 2, AGAINST = 4;
/** The checks: what is held, the reference's value, ours, the limit, and the round of docs/PORTRAITS.md that read
 *  the reference's value. A value "against the lit cheek" is that place's L less the lit cheek's. */
const checks = [
  // the reference's woman (the ruler designer's, the one face large enough to read)
  ['woman: lit cheek L', 56.1, women['lit cheek L'], L, 'round 81'],
  ['woman: lit cheek a*', 22.9, women['lit cheek a*'], AB, 'round 71'],
  ['woman: lit cheek b*', 25.4, women['lit cheek b*'], AB, 'round 71'],
  ['woman: lit cheek chroma', 34.2, women['lit cheek chroma'], AB, 'round 81'],
  ['woman: lit cheek hue (degrees)', 48, women['lit cheek hue'], 3, 'round 71'],
  // (Until round 107 held to her own, -27.7. The reference's faces differ in this more than in anything else: its
  // emperor's far cheek is 20.9 under his lit one, and five women of its developer diaries, read in round 107 on
  // pictures scaled to ours, have theirs half as far under as ours by the same reading. Held to the softer of
  // the game's two faces since: at -24.5, round 106, the light was the hardest of all seven.)
  ['woman: far cheek against the lit', -20.9, women['shaded cheek L'] - women['lit cheek L'], AGAINST, 'round 107'],
  // the shade beside the nose on the far side, the black wedge of round 83, and the cheek beyond it: read then
  // by a scratch script along the same level lines, on her picture and on ours (hers -34 to -35 and -16)
  ['woman: beside the nose against cheek', -34.5, -women['beside the nose darker than cheek (L)'], AGAINST, 'round 83'],
  ['woman: cheek beyond the nose', -16, -women['cheek beyond the nose darker than cheek (L)'], AGAINST, 'round 83'],
  ['woman: cheek redder than forehead', 5, women['cheek redder than forehead (a*)'], AB, 'round 71'],
  ['woman: nose\'s back against cheek', 8, women['nose\'s back L'] - women['lit cheek L'], AGAINST, 'round 71'],
  ['woman: lower lip against cheek', -22.9, -women['lower lip darker than cheek (L)'], AGAINST, 'round 82'],
  ['woman: lower lip redder (a*)', 6.2, women['lower lip redder than cheek (a*)'], AB, 'round 82'],
  ['woman: upper lip against cheek', -35.1, women['upper lip L'] - women['lit cheek L'], AGAINST, 'round 82'],
  ['woman: over the lip against cheek', -4.4, women['above the lip L'] - women['lit cheek L'], AGAINST, 'round 82'],
  ['woman: eye against cheek', -40.2, -women['eye darker than cheek (L)'], AGAINST, 'round 83'],
  // the reference's emperor (a small face, read five times enlarged). His picture is another scene with another
  // light than the woman's: his lit cheek is at L 65.5 where hers is at 56.1, his far cheek 20.9 under it where
  // hers is 27.7. One stage lights both of ours, and it is held to hers: of his face only what stands against
  // his own cheek is held, and his skin's colour. His lips are held against those of our men who wear no beard
  // over them (stubble aside): a beard's hair over the lip reads darker and less red than any lip, and until
  // round 106 the mean over all men passed by that, with lips 7 L too light on the men one sees them on.
  ['emperor: lit cheek chroma', 33.7, men['lit cheek chroma'], AB, 'round 73'],
  ['emperor: lower lip against cheek', -25.8, -shaven['lower lip darker than cheek (L)'], AGAINST, 'round 82'],
  ['emperor: lower lip redder (a*)', 7.1, shaven['lower lip redder than cheek (a*)'], AB, 'round 82'],
  ['emperor: eye against cheek', -40.6, -men['eye darker than cheek (L)'], AGAINST, 'round 83'],
];

const f = x => (x >= 0 ? '+' : '') + x.toFixed(1);
let failed = 0;
console.log(`${'the reference\'s'.padEnd(38)}${'reference'.padStart(10)}${'ours'.padStart(8)}${'off'.padStart(8)}${'limit'.padStart(7)}`);
for (const [name, reference, ours, limit, round] of checks) {
  if (!Number.isFinite(ours)) throw new Error(`gauntlet: "${name}" is not in what face_colour.mjs printed`);
  const off = ours - reference, pass = Math.abs(off) <= limit + 1e-9;
  if (!pass) failed++;
  console.log(`${name.padEnd(38)}${reference.toFixed(1).padStart(10)}${ours.toFixed(1).padStart(8)}${f(off).padStart(8)}${limit.toFixed(0).padStart(7)}  ${pass ? 'PASS' : 'FAIL'}  (${round})`);
}
console.log(`\n${checks.length - failed} of ${checks.length} pass.`);
if (strict && failed) process.exit(1);
