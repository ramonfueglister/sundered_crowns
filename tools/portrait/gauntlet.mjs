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
// against another (two readings; a chroma against another's by the same share, 2.7). They are by judgement, not
// from a source: PLACEHOLDER.
//
// What it does not hold: forms (portrait/tests/faces.rs holds them against a survey of real heads), hair, cloth,
// children (the reference's faces read are grown), and whether a picture is good. A face
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

const L = 3, AB = 2, AGAINST = 4, AB_AGAINST = AB * AGAINST / L;
const chroma = (g, place) => Math.hypot(g[`${place} a*`], g[`${place} b*`]);
/** The checks: what is held, the reference's value, ours, the limit, and the round of docs/PORTRAITS.md that read
 *  the reference's value. A value "against the lit cheek" is that place's L less the lit cheek's. */
const checks = [
  // The lit cheek's colour: until round 114 the ruler designer's woman's (L 56.1, a* 22.9, b* 25.4, chroma 34.2,
  // hue 48), "the one face large enough to read". Round 114 read five large faces of the developer diaries at the
  // same place (three women, two men: L 56 to 70, a* 14.8 to 18.8, b* 23.6 to 27.7; over four placements of the
  // place the mean stays within L 57 to 62, a* 15.1 to 18.2, b* 25.1 to 25.6): hers is the reddest of the six by
  // 4 a*, and held to her ours were salmon beside every other. Held to the five's mean since.
  ['lit cheek L', 60.3, women['lit cheek L'], L, 'round 114'],
  ['lit cheek a*', 16.2, women['lit cheek a*'], AB, 'round 114'],
  ['lit cheek b*', 25.6, women['lit cheek b*'], AB, 'round 114'],
  ['lit cheek chroma', 30.3, women['lit cheek chroma'], AB, 'round 114'],
  ['lit cheek hue (degrees)', 57.7, women['lit cheek hue'], 3, 'round 114'],
  // (Until round 107 held to her own, -27.7. The reference's faces differ in this more than in anything else: its
  // emperor's far cheek is 20.9 under his lit one, and five women of its developer diaries, read in round 107 on
  // pictures scaled to ours, have theirs half as far under as ours by the same reading. Held to the softer of
  // the game's two faces since: at -24.5, round 106, the light was the hardest of all seven.)
  ['woman: far cheek against the lit', -20.9, women['shaded cheek L'] - women['lit cheek L'], AGAINST, 'round 107'],
  // the shade beside the nose on the far side, the black wedge of round 83, and the cheek beyond it: read then
  // by a scratch script along the same level lines, on her picture and on ours (hers -34 to -35 and -16)
  ['woman: beside the nose against cheek', -34.5, -women['beside the nose darker than cheek (L)'], AGAINST, 'round 83'],
  ['woman: cheek beyond the nose', -16, -women['cheek beyond the nose darker than cheek (L)'], AGAINST, 'round 83'],
  // (her own: 5. Two of round 114's five faces show a forehead in the same light as the cheek: 0.9 to 4.0 by
  // where on the forehead one reads)
  ['woman: cheek redder than forehead', 2.5, women['cheek redder than forehead (a*)'], AB, 'round 114'],
  // (Round 113) This line FAILS, and is left to: the 8 is one face's, read on the face's middle line. Five faces
  // read in round 113 (three of the developer diaries' large women, two men) have a narrow streak of light on the
  // nose, a thirtieth of the face wide, 1.3 to 11.0 over the lit cheek (mean 6.8), with skin 2 to 6 under the
  // cheek on either side of it: the gloss of the light from behind on the nose's far flank, and where it lies
  // across the nose differs from face to face (on the middle line itself they read from 12 under to 11 over).
  // Rounds 106 to 112 passed the line by a stronger gloss in a broad stripe down every nose's back (`skin.zone`),
  // which lay on the noses as a pale patch and is gone. Ours have no such streak yet: open.
  ['woman: nose\'s back against cheek', 8, women['nose\'s back L'] - women['lit cheek L'], AGAINST, 'round 71'],
  ['woman: lower lip against cheek', -22.9, -women['lower lip darker than cheek (L)'], AGAINST, 'round 82'],
  ['woman: lower lip redder (a*)', 6.2, women['lower lip redder than cheek (a*)'], AB, 'round 82'],
  ['woman: upper lip against cheek', -35.1, women['upper lip L'] - women['lit cheek L'], AGAINST, 'round 82'],
  ['woman: over the lip against cheek', -4.4, women['above the lip L'] - women['lit cheek L'], AGAINST, 'round 82'],
  ['woman: eye against cheek', -40.2, -women['eye darker than cheek (L)'], AGAINST, 'round 83'],
  // (Round 113) The shaded cheek keeps the lit cheek's colour: on three large women of the developer diaries its
  // chroma is 1.9 and 0.2 under and 0.2 over the lit cheek's (at 9 to 21 L under it, 5 to 9 degrees redder), on
  // one man 1.8 under. Ours had a grey shaded half: 9.6 under on the women, 15.3 on the men, until the light a
  // shadow lets through took the colour of light that has been in skin (`skin.bleed`).
  ['woman: far cheek chroma against lit', -0.6, chroma(women, 'shaded cheek') - women['lit cheek chroma'], AB_AGAINST, 'round 113'],
  ['man: far cheek chroma against lit', -1.8, chroma(men, 'shaded cheek') - men['lit cheek chroma'], AB_AGAINST, 'round 113'],
  // (Round 114) This line FAILS, and says where to look: the far cheek of the reference's men is 20.9 (the
  // emperor), 11.6 and 18.3 (two men of the developer diaries) under the lit one; ours 31, with the women's at 19
  // on the same stage. Round 116 found the cause: the cast shadow of a man's larger nose lies on the place that
  // is read (without any shadow ours are 19.9 under; round 114 had tried the shadow at 0.6 for 0.7 and seen
  // too little move). With the key light twice as large the line stands at 24.3 and still FAILS: the rest is
  // the nose's size, which is held to a survey of real heads, or how the reference lights its men.
  ['man: far cheek against the lit', -16.9, men['shaded cheek L'] - men['lit cheek L'], AGAINST, 'round 114'],
  // the reference's emperor (a small face, read five times enlarged). His picture is another scene with another
  // light than the woman's: his lit cheek is at L 65.5 where hers is at 56.1, his far cheek 20.9 under it where
  // hers is 27.7. One stage lights both of ours, and it is held to hers: of his face only what stands against
  // his own cheek is held, and his skin's colour. His lips are held against those of our men who wear no beard
  // over them (stubble aside): a beard's hair over the lip reads darker and less red than any lip, and until
  // round 106 the mean over all men passed by that, with lips 7 L too light on the men one sees them on.
  // (his skin's chroma until round 114: 33.7. The two men of round 114's five faces: 29.7 and 31.3)
  ['man: lit cheek chroma', 30.5, men['lit cheek chroma'], AB, 'round 114'],
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
  console.log(`${name.padEnd(38)}${reference.toFixed(1).padStart(10)}${ours.toFixed(1).padStart(8)}${f(off).padStart(8)}${(Number.isInteger(limit) ? limit.toFixed(0) : limit.toFixed(1)).padStart(7)}  ${pass ? 'PASS' : 'FAIL'}  (${round})`);
}
console.log(`\n${checks.length - failed} of ${checks.length} pass.`);
if (strict && failed) process.exit(1);
