// The portraits: Apoleia's generator, carried over unchanged (portrait/, docs/PORTRAITS.md). The test people and
// their portraits as numbers (tests/portrait/golden.json) were written by Apoleia's own crate at commit c30a107;
// the builder of the game has to give the same, as WebAssembly.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PORTRAIT_PUBLIC, PORTRAIT_TEST_WASM, portraitManifest } from '../tools/portrait/build_portrait';
import { loadPortraitBuilder } from '../tools/portrait/load';
import { DoubleSide, FrontSide, ShaderLib } from 'three';
import { LOCK_OPAQUE, drawOrder, portraitSkinTone, skinTone, surfaceKind, surfaceMaterials } from '../src/portrait/materials';
import { APOLEIA, profileOf } from '../src/portrait/profile';
import { ENGLAND_1356 } from '../src/portrait/profile_1356';
import { CURVE, toneCurve } from '../src/portrait/finish';
import { decodePortrait, encodePerson, rankOfHistory, type Portrait, type PortraitPerson } from '../src/portrait/wire';
import { framing, keyPlaces, standing } from '../src/portrait/stage';

interface GoldenSurface { rough: number; metal: number; double: boolean; tex: string; nmap: string; verts: number; pos: number; col: number; uv: number; nrm: number }
interface Golden { pid: number; top: number; chin: number; cx: number; cz: number; fill: number; tris: number; surfaces: GoldenSurface[] }

const here = (name: string) => resolve(__dirname, 'portrait', name);
const people: PortraitPerson[] = JSON.parse(readFileSync(here('people.json'), 'utf8'));
const golden: Golden[] = JSON.parse(readFileSync(here('golden.json'), 'utf8'));
const goldenSimple: Golden[] = JSON.parse(readFileSync(here('golden_simple.json'), 'utf8'));
const sum = (v: Float32Array) => v.reduce((a, x) => a + x, 0);

/** Sums of thousands of single-precision numbers: equal up to the rounding of the functions sin, cos and pow,
 *  which differ a little between the machines' libraries and WebAssembly. */
function near(got: number, want: number, what: string): void {
  expect(Math.abs(got - want), what).toBeLessThanOrEqual(0.05 + 2e-5 * Math.abs(want));
}

/** The solution of a small set of linear equations, each row its coefficients and then its right-hand side. */
function solve(m: number[][]): number[] {
  const n = m.length;
  for (let c = 0; c < n; c++) {
    let best = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[best]![c]!)) best = r;
    [m[c], m[best]] = [m[best]!, m[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r]![c]! / m[c]![c]!;
      for (let k = c; k <= n; k++) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  return m.map((row, r) => row[n]! / row[r]!);
}

function expectSame(p: Portrait, g: Golden): void {
  for (const k of ['top', 'chin', 'cx', 'cz', 'fill'] as const) expect(p[k], k).toBeCloseTo(g[k], 3);
  expect(p.tris).toBe(g.tris);
  expect(p.surfaces.length).toBe(g.surfaces.length);
  p.surfaces.forEach((s, i) => {
    const w = g.surfaces[i], at = `person ${g.pid} surface ${i}`;
    expect([s.rough, s.metal, s.double, s.tex, s.nmap, s.pos.length / 3], at).toEqual([expect.closeTo(w.rough, 5), expect.closeTo(w.metal, 5), w.double, w.tex, w.nmap, w.verts]);
    near(sum(s.pos), w.pos, `${at} positions`);
    near(sum(s.col), w.col, `${at} colours`);
    near(sum(s.uv), w.uv, `${at} texture coordinates`);
    near(sum(s.nrm), w.nrm, `${at} normals`);
  });
}

// several of these build England's whole sample (36 people) and take 4 to 5 seconds on a busy machine: the
// default limit of 5 seconds failed one run in six
describe('portraits', { timeout: 20_000 }, () => {
  it('the test people are the ones the numbers were written for', () => {
    expect(people.map(p => p.pid)).toEqual(golden.map(g => g.pid));
    const lines = readFileSync(here('people.txt'), 'utf8').trim().split('\n');
    expect(lines.map(l => l.split(' ').pop())).toEqual(people.map(p => Buffer.from(Uint8Array.from(p.dna)).toString('hex')));
  });

  it('a fresh build gives the portraits of Apoleia', () => {
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    people.forEach((p, i) => expectSame(b.build(p), golden[i]));
  });

  it('the build in the repository gives the portraits of Apoleia', () => {
    const b = loadPortraitBuilder(resolve(PORTRAIT_PUBLIC, 'sc_portrait.wasm'));
    people.forEach((p, i) => expectSame(b.build(p), golden[i]));
  });

  it('the same person gives the same portrait, a different person a different one', () => {
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const [a, again, other] = [b.build(people[0]), b.build(people[0]), b.build(people[1])];
    expect(again.surfaces[0].pos).toEqual(a.surfaces[0].pos);
    expect(sum(other.surfaces[0].pos)).not.toBe(sum(a.surfaces[0].pos));
  });

  it('without the real look the portrait is the simple, faceted one of Apoleia', () => {
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM, false);
    people.forEach((p, i) => expectSame(b.build(p), goldenSimple[i]));
    expect(b.build(people[0]).surfaces.every(s => s.tex === '' && s.uv.length === 0)).toBe(true);
  });

  it('the list of files in the repository is the list of files there', () => {
    expect(JSON.parse(readFileSync(resolve(PORTRAIT_PUBLIC, 'manifest.json'), 'utf8'))).toEqual(portraitManifest());
  });

  it('a person goes through the bytes unharmed, and a broken portrait is refused', () => {
    expect(encodePerson(people[0], 1).length).toBe(32 + 100 + 4 + Buffer.byteLength(people[0].job) + Buffer.byteLength(people[0].origin));
    expect(() => encodePerson({ ...people[0], dna: [1, 2, 3] }, 1)).toThrow(/100 bytes/);
    expect(() => decodePortrait(new Uint8Array(40))).toThrow();
  });

  it('people of England wear the dress of 1356, Apoleia\'s own people Apoleia\'s', () => {
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const list = portraitManifest(), images = new Set(list.images.map(n => `${list.folder}/${n}`));
    const ways = new Set<string>();
    for (const p of people) {
      const roman = b.build(p), english = b.build({ ...p, origin: 'England' });
      expect(roman.look.includes('/'), `person ${p.pid}`).toBe(false);
      expect(profileOf(roman.look)).toBe(APOLEIA);
      expect(english.look.startsWith('england1356/'), `person ${p.pid}`).toBe(true);
      expect(profileOf(english.look)).toBe(ENGLAND_1356);
      const worn = english.surfaces.map(s => s.tex);
      // (a person of rank wears it in silk since round 150, plain or figured since round 156)
      expect(worn.some(t => /\/cloth_cote(_silk(_figured)?)?\./.test(t)), `person ${p.pid} wears the gown`).toBe(true);
      expect(worn.some(t => t.includes('/cloth_tunic.') || t.includes('/cloth_veil.')), `person ${p.pid} wears nothing Roman`).toBe(false);
      for (const t of worn) if (t) expect(images.has(t), `${t} is in the repository`).toBe(true);
      // no man and no girl wears the veil. A woman from the age of the veil wears it one of two ways (round
      // 121): set back over parted hair, which lies on a girl's painted layer, or on forehead and cheeks with
      // no hair under it; or, until 30, she goes in a girl's plaits. From 30 every woman wears it; a lady of rank
      // from 50 (round 146: at court the hair is shown in plaits)
      const veil = worn.some(t => t.includes('/cloth_veil_linen.')), cap = worn.some(t => t.includes('/plait01_cap.'));
      // the plaits themselves are round strands, a surface of their own (round 86)
      const plaits = worn.some(t => t.includes('/plait01_rope.'));
      const woman = p.female && p.age >= 20;
      expect(veil, `person ${p.pid}: the veil`).toBe(woman && !plaits);
      if (woman && p.age >= (p.stand >= 2 ? 50 : 30)) expect(veil, `person ${p.pid}: the veil from 30`).toBe(true);
      if (!woman) expect(plaits, `person ${p.pid}: plaits before the veil`).toBe(p.female && p.age >= 7);
      if (plaits) expect(cap, `person ${p.pid}: the painted layer under the plaits`).toBe(true);
      if (cap) expect(plaits || veil, `person ${p.pid}: a girl's hair on a girl or under a veil`).toBe(true);
      if (woman) ways.add(plaits ? 'plaits' : cap ? 'back' : 'closed');
      // hair is a body (round 109; locks from round 87, cards before): one surface of thick bundles, arched
      // bands seen from both sides, drawn with the one image of England's bundles, over the painted layer of
      // the cut. No cards and no locks of England's head hair are left
      const body = english.surfaces.filter(s => s.tex.includes('/hair1356_body.'));
      expect(body.length, `person ${p.pid}: a body where there is hair`).toBe(worn.some(t => /\/(bob0\d|plait01)_cap\./.test(t)) ? 1 : 0);
      expect(body.every(s => s.double && surfaceKind(s) === 'rope'), `person ${p.pid}: bundles are open bands of solid hair`).toBe(true);
      expect(worn.some(t => t.includes('/hair1356_locks.')), `person ${p.pid}: no locks of England's head hair`).toBe(false);
      expect(worn.some(t => /\/bob0\d_cap\./.test(t)) && p.female, `person ${p.pid}: a woman wears no man's cut`).toBe(false);
      expect(worn.some(t => /\/(bob0\d|plait01|part01)\./.test(t)), `person ${p.pid}: no cards of England's hair`).toBe(false);
      // everyone wears the brows that sit level on these heads (the finer ones tried for women sit slanted: a
      // frown): MakeHuman's `eyebrow001`, whose cards a Roman wears with Apoleia's image of them, a closed band,
      // and a person of England with England's own, the hairs as soft as MakeHuman drew them (round 76). So with
      // the lashes: England's are a soft fringe. The stage tells brows and lashes from hair cards by the image's
      // name, and how densely it draws each (`lashes1356.webp` was drawn as a hair card, with its own depth pass)
      const [brow, lashes] = ['/eyebrow1356.', '/Eyelashes1356.'].map(n => english.surfaces.filter(s => s.tex.includes(n)));
      expect([brow.length, lashes.length], `person ${p.pid}: brows and lashes of England`).toEqual([1, 1]);
      expect([surfaceKind(brow[0]), surfaceKind(lashes[0])]).toEqual(['brow', 'brow']);
      expect(surfaceMaterials(brow[0], null, null, ENGLAND_1356)[0].opacity).toBe(ENGLAND_1356.brow!.brows);
      expect(surfaceMaterials(lashes[0], null, null, ENGLAND_1356)[0].opacity).toBe(ENGLAND_1356.brow!.lashes);
      expect(worn.some(t => /\/eyebrow0(01|02|05|11)\.|\/Eyelashes01\./.test(t)), `person ${p.pid}: no brows or lashes but England's`).toBe(false);
      const romans = roman.surfaces.map(s => s.tex);
      expect([romans.filter(t => t.includes('/eyebrow001.')).length, romans.filter(t => t.includes('/Eyelashes01.')).length], `person ${p.pid}: a Roman's`).toEqual([1, 1]);
      expect(romans.some(t => t.includes('1356')), `person ${p.pid}: nothing of England's on a Roman`).toBe(false);
      // the cards are the same, the image alone differs
      const cards = (list: typeof english.surfaces, n: string) => list.find(s => s.tex.includes(n))!;
      expect(Array.from(cards(english.surfaces, '/eyebrow1356.').uv)).toEqual(Array.from(cards(roman.surfaces, '/eyebrow001.').uv));
      expect(Array.from(cards(english.surfaces, '/Eyelashes1356.').uv)).toEqual(Array.from(cards(roman.surfaces, '/Eyelashes01.').uv));
      // a head that loses its hair wears the dress's own hair for it, and no beard the dress leaves out
      // (nor Apoleia's short beard or stubble, whose hairs run on over the line of the mouth: on a mouth closed by
      // raising the lower lip they lie on it as a row of teeth)
      for (const not of ['/receding01.', '/curly01.', '/beard_chin.', '/beard_phil.', '/beard_full.', '/beard_short_cap.', '/beard_stubble_cap.']) {
        expect(worn.some(t => t.includes(not)), `person ${p.pid} wears no ${not}`).toBe(false);
      }
    }
    expect(ways.has('back'), 'a veil set back over hair').toBe(true);
  });
  it('the grown women of England\'s sample do not all wear their hair one way', () => {
    // Until round 120 every woman from 20 wore the veil on forehead and cheeks: eight grown women of the sample,
    // eight ovals of grey linen, and no hair on any of them. Now (portrait/src/dress.rs `veils`) five wear the
    // veil set back over parted hair, two as before, and one of the three under 30 a girl's plaits
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const sample: PortraitPerson[] = JSON.parse(readFileSync(here('sample_england.json'), 'utf8'));
    const ways = { plaits: 0, back: 0, closed: 0 };
    for (const p of sample.filter(p => p.female && p.age >= 20)) {
      const worn = b.build(p).surfaces.map(s => s.tex);
      const veil = worn.some(t => t.includes('/cloth_veil_linen.')), plaits = worn.some(t => t.includes('/plait01_rope.'));
      expect(veil, `person ${p.pid}: the veil or plaits`).toBe(!plaits);
      if (plaits) expect(p.age, `person ${p.pid}: plaits until 30`).toBeLessThan(30);
      // hair under the veil: a body of bundles on a girl's painted layer, and no plaits
      const hair = worn.some(t => t.includes('/hair1356_body.'));
      expect(hair, `person ${p.pid}: bundles on the painted layer`).toBe(worn.some(t => t.includes('/plait01_cap.')));
      ways[plaits ? 'plaits' : hair ? 'back' : 'closed']++;
    }
    expect(ways).toEqual({ plaits: 1, back: 5, closed: 2 });
  });
  it('the skin of a person of England is light enough to take the whole tint, whatever is painted darker on it', () => {
    // the tint goes by the person's skin as a whole (the median of its colours), not point by point: a point
    // painted darker (the shadow of a beard, a fold) took less of the red and turned olive
    expect(skinTone(new Float32Array([0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.5, 0.5, 0.5]))).toBeCloseTo(0.5, 5);
    expect(skinTone(new Float32Array(0))).toBe(0);
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const sample: PortraitPerson[] = JSON.parse(readFileSync(here('sample_england.json'), 'utf8'));
    expect(sample.length).toBe(36);
    const tones = sample.map(p => skinTone(b.build(p).surfaces.find(s => surfaceKind(s) === 'skin')!.col));
    // 0.44 to 0.63: from 0.45 on a skin takes all of the tint (materials.ts skinLook)
    for (const t of tones) expect(t).toBeGreaterThan(0.4);
  });
  it('a short beard and stubble in England are the ones written for 1356', () => {
    // Apoleia's short beard and its stubble have hairs rooted in the gap between the lips that run on over the line
    // of the mouth; on a mouth closed by raising the lower lip they lie on that lip as dark bars, a row of teeth
    // (the short beard until round 62, stubble until round 67)
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const sample: PortraitPerson[] = JSON.parse(readFileSync(here('sample_england.json'), 'utf8'));
    const worn = sample.flatMap(p => b.build(p).surfaces.map(s => s.tex));
    for (const beard of ['short', 'stubble']) {
      expect(worn.some(t => t.includes(`/beard_${beard}1356_cap.`)), `${beard} of 1356 is worn`).toBe(true);
      expect(worn.some(t => t.includes(`/beard_${beard}_cap.`)), `Apoleia's ${beard} is not`).toBe(false);
      // and everyone else's is Apoleia's
      expect(people.some(p => b.build(p).surfaces.some(s => s.tex.includes(`/beard_${beard}1356_cap.`)))).toBe(false);
    }
    expect(people.some(p => b.build(p).surfaces.some(s => s.tex.includes('/beard_stubble_cap.'))), "a Roman wears Apoleia's stubble").toBe(true);
  });
  it('a beard of England is a layer of its own to the stage, not the shade under a head of hair', () => {
    // England's beards are a painted layer with no hair cards over it (since round 53; a full beard wears locks
    // over it since round 90, the next test). Until round 80
    // the stage drew that layer with the values of the layer under the hair of the head, which is the shade
    // between the cards there: dark, and lit all the way round. A brown beard was 13 L darker than the same man's
    // hair and as dark on the lit side of the face as on the far one, a black shape (docs/PORTRAITS.md, round 80)
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const sample: PortraitPerson[] = JSON.parse(readFileSync(here('sample_england.json'), 'utf8'));
    const beards = sample.flatMap(p => b.build(p).surfaces.filter(s => s.tex.includes('/beard_')));
    const names = [...new Set(beards.map(s => s.tex.slice(s.tex.lastIndexOf('/') + 1)))].sort();
    expect(names).toEqual(['beard_crop_cap.webp', 'beard_short1356_cap.webp', 'beard_stubble1356_cap.webp']);
    for (const s of beards) expect(surfaceKind(s), s.tex).toBe('cap');
    const cap = ENGLAND_1356.cap!;
    const drawn = (tex: string) => {
      const m = surfaceMaterials({ rough: 0.5, metal: 0, double: false, tex, nmap: '', pos: new Float32Array(9), col: new Float32Array(9).fill(0.5), uv: new Float32Array(6), nrm: new Float32Array(9) }, null, null, ENGLAND_1356)[0]!;
      const shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
      m.onBeforeCompile(shader as never, null as never);
      return { code: shader.fragmentShader, key: m.customProgramCacheKey() };
    };
    const look = (v: { tone: number; light: number; colour: number; wrap: number }) => [
      `diffuseColor.rgb *= mix( ${v.tone.toFixed(3)}, ${v.light.toFixed(3)}, smoothstep(`, `diffuseColor.rgb, ${v.colour.toFixed(3)} );`, `vec3 wrapBy = vec3( ${v.wrap.toFixed(3)} );`];
    const [hair, full, short, stubble] = ['real/bob01_cap.webp', 'real/beard_crop_cap.webp', 'real/beard_short1356_cap.webp', 'real/beard_stubble1356_cap.webp'].map(drawn) as [ReturnType<typeof drawn>, ReturnType<typeof drawn>, ReturnType<typeof drawn>, ReturnType<typeof drawn>];
    for (const piece of look(cap)) expect(hair.code).toContain(piece);
    for (const piece of look(cap.beard)) { expect(full.code).toContain(piece); expect(short.code).toContain(piece); }
    // stubble is hairs on skin that shows between them: neither lightened nor darkened (round 67)
    expect(cap.stubble).toBe(0);
    for (const piece of look({ ...cap, tone: 1, light: 1 })) expect(stubble.code).toContain(piece);
    // three programs: with one key three.js would draw all three with whichever it compiled first
    expect(new Set([hair.key, full.key, stubble.key]).size).toBe(3);
    expect(short.key).toBe(full.key);
    // a beard is lighter than the shade under hair, a dark one most of all (`tone` is the factor for dark hair,
    // `light` for hair as light as white), and it has a shaded side: light reaches less than half way round it
    expect(cap.beard.tone).toBeGreaterThan(2 * cap.tone);
    expect(cap.beard.light).toBeGreaterThan(cap.light);
    expect(cap.beard.wrap).toBeLessThan(0.5);
    expect(cap.wrap).toBe(1);
    // Round 159: a short beard was lit as if nothing stood before it (no shadow fell on a painted layer since
    // round 53, when shadows had hard edges; they are soft since round 81) and from a third of the way round its
    // shaded side: in the shade of a hood, on a jaw that is turned away, a light beard was a bright flat patch
    // (the layer of three hooded men with light brown hair L 41.1 over skin that reads 32.5 without it; 33.3 now).
    // Shadows fall on the painted layers, and a beard's layer is lit as far round as its surface faces the light
    expect(cap.shadow).toBe(true);
    expect(cap.beard.wrap).toBe(0);
  });
  it('a full beard of England is locks over its painted layer, and light hair keeps its strands', () => {
    // Until round 90 a full beard was its painted layer alone: a smooth shell with hairs drawn on it, lit as one
    // form, its outline the layer's own edge (relief round the lit jaw 5 to 9 L between the darkest and the
    // lightest tenth; with locks 10 to 17). Now 300 short locks lie over the layer, solid hair as a head's
    // locks: open bands seen from both sides, cut out by their image, in the stage's shadows. The short beard
    // and stubble stay painted (a short beard of locks read as a dark full beard on a boy of 17)
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const sample: PortraitPerson[] = JSON.parse(readFileSync(here('sample_england.json'), 'utf8'));
    let full = 0;
    for (const p of sample) {
      const surfaces = b.build(p).surfaces, worn = surfaces.map(s => s.tex);
      const locks = surfaces.filter(s => s.tex.includes('/beard1356_locks.'));
      const wears = worn.some(t => t.includes('/beard_crop_cap.'));
      expect(locks.length, `person ${p.pid}: a beard's locks with the full beard alone`).toBe(wears ? 1 : 0);
      if (!wears) continue;
      full++;
      const lock = locks[0]!;
      expect([surfaceKind(lock), lock.double, drawOrder(lock)], `person ${p.pid}`).toEqual(['rope', true, 0]);
      const [m, ...more] = surfaceMaterials(lock, null, null, ENGLAND_1356);
      expect(more.length).toBe(0);
      expect([m!.transparent, m!.depthWrite, m!.side, m!.alphaTest]).toEqual([false, true, DoubleSide, LOCK_OPAQUE]);
      // the beard's locks are not the head's hair: an image of their own (coarser hairs that sway more, frayed
      // ends), and a surface of their own beside the head's bundles where the man has hair
      expect(lock.tex.includes('/hair1356_body.')).toBe(false);
      expect(lock.pos.length / 9).toBeGreaterThan(8000);
    }
    // four of the sample's men wear the full beard (940011, 940013, 940021, 940027)
    expect(full).toBe(4);
    expect(people.some(p => b.build(p).surfaces.some(s => s.tex.includes('/beard1356_locks.'))), "no Roman wears England's beard").toBe(false);
    // The image of locks has dark strands between light ones. The stage darkens them further on light hair
    // (`sheen.light`, an exponent that grows with the hair's brightness), which cards needed: blended sheets
    // of white hair showed no strands at all. On solid locks, each lit by its own form, 1.5 turned white hair
    // and white beards into grey wool (round 90: 1.5 grey wool, 0 plastic, 0.5 white hair with strands)
    const sheen = ENGLAND_1356.sheen!;
    expect(sheen.light).toBeGreaterThan(0);
    expect(sheen.light).toBeLessThan(1);
    const shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
    surfaceMaterials({ rough: 0.6, metal: 0, double: true, tex: 'real/beard1356_locks.webp', nmap: '', pos: new Float32Array(9), col: new Float32Array(9).fill(0.5), uv: new Float32Array(6), nrm: new Float32Array(9) }, null, null, ENGLAND_1356)[0]!.onBeforeCompile(shader as never, null as never);
    expect(shader.fragmentShader).toContain(`pow( min( hairStrand / 0.8, 1.0 ), ${sheen.light.toFixed(3)} * smoothstep(`);
    expect(shader.fragmentShader).toContain('directLight.color * hairLit * hairStrand');
  });
  it('the iris of a person of England is as large as a real one', () => {
    // MakeHuman's eyeball is 30 mm across (a real one 24) and England's resting face scales the eyes up: with the
    // iris as the ball's image has it, it was 14 to 16 mm across and took 0.59 of the opening between the lids, a
    // doll's eyes (until round 68). A real iris is 11.71 mm (SD 0.42) across (Rüfer, Schröder & Erb 2005, Cornea
    // 24: 259-261) in an opening of 25.6 mm (Rana et al. 2023, Int Ophthalmol 43: 2695-2701): 0.46 of it.
    // Measured on the built head: the image of the ball is laid round the gaze by the angle to it, the edge of the
    // iris lies at 0.0765 of a cell (public/portrait/real/eyeball.webp)
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const sample: PortraitPerson[] = JSON.parse(readFileSync(here('sample_england.json'), 'utf8'));
    const irises = (p: PortraitPerson): number[] => {
      const ball = b.build(p).surfaces.find(s => surfaceKind(s) === 'eyeball')!;
      const n = ball.pos.length / 3;
      const all = Array.from({ length: n }, (_, i) => i);
      const mid = all.reduce((a, i) => a + ball.pos[3 * i]!, 0) / n;
      return [all.filter(i => ball.pos[3 * i]! < mid), all.filter(i => ball.pos[3 * i]! >= mid)].map(eye => {
        const c = [0, 1, 2].map(k => eye.reduce((a, i) => a + ball.pos[3 * i + k]!, 0) / eye.length);
        const dir = (i: number) => { const q = [0, 1, 2].map(k => ball.pos[3 * i + k]! - c[k]!); const l = Math.hypot(...q); return { q: q.map(x => x / l), l }; };
        const radius = eye.reduce((a, i) => a + dir(i).l, 0) / eye.length;
        const cell = [0, 1].map(k => Math.floor(eye.map(i => ball.uv[2 * i + k]! * 4).sort((x, y) => x - y)[eye.length >> 1]!) + 0.5);
        const rr = (i: number) => Math.hypot(ball.uv[2 * i]! * 4 - cell[0]!, ball.uv[2 * i + 1]! * 4 - cell[1]!);
        const pole = dir(eye.reduce((a, i) => (rr(i) < rr(a) ? i : a))).q;
        // radians of the ball per cell of the image, from the vertices between the iris and the ball's back
        const per = eye.filter(i => rr(i) > 0.1 && rr(i) < 0.4).map(i => Math.acos(Math.min(1, dir(i).q.reduce((a, x, k) => a + x * pole[k]!, 0))) / rr(i)).sort((x, y) => x - y);
        return 2 * radius * Math.sin(0.0765 * per[per.length >> 1]!) * 100;
      });
    };
    // Since round 107 that is a child's, whose head is as it is measured. The grown are drawn as the reference
    // draws its people, with larger eyes (portrait/src/dress.rs `Style`): the opening between the lids is 35 to
    // 36 mm long where it was 30 to 32, and the iris grows with it to 14.5 mm, 0.41 of a woman's opening (0.40
    // before; a real one's 0.46, dress.rs `iris_mm`). Between eleven and its adult form (15 and 17) a head grows into the drawing.
    for (const p of sample) {
      for (const mm of irises(p)) {
        if (p.age <= 11) {
          // one standard deviation round the mean of real ones (a child's iris is nearly grown)
          expect(mm, `person ${p.pid}`).toBeGreaterThan(11.71 - 0.42);
          expect(mm, `person ${p.pid}`).toBeLessThan(11.71 + 0.42);
        } else if (p.age >= 17) {
          expect(mm, `person ${p.pid}`).toBeGreaterThan(14.5 - 0.42);
          expect(mm, `person ${p.pid}`).toBeLessThan(14.5 + 0.42);
        } else {
          expect(mm, `person ${p.pid}`).toBeGreaterThan(11.71 + 0.42);
          expect(mm, `person ${p.pid}`).toBeLessThan(14.5 - 0.42);
        }
      }
      // Apoleia's, on the same head: 14 to 17 mm
      for (const mm of irises({ ...p, origin: 'Italia' })) expect(mm, `person ${p.pid} as a Roman`).toBeGreaterThan(13.5);
    }
  });
  it('the eyes of a person of England look at whoever looks at the picture', () => {
    // The stage turns the person away from the camera (profile.ts `turn`); the dress table turns the eyes back
    // (portrait/src/dress.rs `gaze`, `converge`). From round 50 to round 74 the table's angle had the turn's own
    // sign: the eyes were turned further away, 19 degrees past the viewer (people who look at nobody). Measured on
    // the built head as the stage frames it: the middle of the iris (the mean of the directions of the ball's
    // points that lie in the iris of its image, 0.0765 of a cell round the cell's middle) against the line from
    // the ball's middle to the camera.
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const sample: PortraitPerson[] = JSON.parse(readFileSync(here('sample_england.json'), 'utf8'));
    // (each person is built once: until round 145 the heads below were read off a second build of everybody, and on
    // GitHub's machine the test ran into its 20 seconds twice in a day)
    const offs = (p: PortraitPerson, profile = ENGLAND_1356, built = b.build(p)): [number, number][] => {
      const ball = built.surfaces.find(s => surfaceKind(s) === 'eyeball')!;
      const f = framing(built, profile), stands = standing(built, profile);
      // a point or a direction of the portrait as the stage stands it: turned about the upright axis through the
      // head by the profile's turn and the person's own, tilted about the neck's foot (round 127)
      const turned = (q: number[], point: boolean): number[] => stands.place(q, point);
      const n = ball.pos.length / 3, all = Array.from({ length: n }, (_, i) => i);
      const mid = all.reduce((a, i) => a + ball.pos[3 * i]!, 0) / n;
      return [all.filter(i => ball.pos[3 * i]! < mid), all.filter(i => ball.pos[3 * i]! >= mid)].map(eye => {
        const c = [0, 1, 2].map(k => eye.reduce((a, i) => a + ball.pos[3 * i + k]!, 0) / eye.length);
        const cell = [0, 1].map(k => Math.floor(eye.map(i => ball.uv[2 * i + k]! * 4).sort((x, y) => x - y)[eye.length >> 1]!) + 0.5);
        // the ball's image is laid round the line of sight by the angle to it: for a point at the angle t from that
        // line and the unit direction d, d . sight = cos t, and t is its distance from the cell's middle times a
        // factor. Near the line cos t = 1 - t t / 2: least squares for the line of sight and that factor's square
        const near = eye.map(i => ({ i, rr: Math.hypot(ball.uv[2 * i]! * 4 - cell[0]!, ball.uv[2 * i + 1]! * 4 - cell[1]!) })).filter(v => v.rr < 0.1);
        expect(near.length, `person ${p.pid}: points of the ball in and round its iris`).toBeGreaterThan(8);
        const rows = near.map(({ i, rr }) => { const q = [0, 1, 2].map(k => ball.pos[3 * i + k]! - c[k]!), l = Math.hypot(...q); return [...q.map(x => x / l), rr * rr / 2]; });
        const sight = turned(solve(rows.reduce((m, r) => m.map((row, a) => row.map((x, k) => x + r[a]! * (k < 4 ? r[k]! : 1))), Array.from({ length: 4 }, () => [0, 0, 0, 0, 0]))).slice(0, 3), false);
        const to = turned(c, true).map((x, k) => f.camera[k]! - x);
        // how far the eye looks beside the camera and above it, in degrees
        const [yaw, pitch] = [(q: number[]) => Math.atan2(q[0]!, q[2]!), (q: number[]) => Math.atan2(q[1]!, Math.hypot(q[0]!, q[2]!))];
        return [(yaw(sight) - yaw(to)) * 180 / Math.PI, (pitch(sight) - pitch(to)) * 180 / Math.PI] as [number, number];
      });
    };
    const heads: number[][] = [];
    for (const p of sample) {
      const built = b.build(p);
      heads.push([...built.head]);
      for (const [beside, above] of offs(p, ENGLAND_1356, built)) {
        expect(Math.abs(beside), `person ${p.pid}: beside the camera`).toBeLessThan(1.5);
        expect(Math.abs(above), `person ${p.pid}: above the camera`).toBeLessThan(1.5);
      }
    }
    // (round 127) and the heads are carried each its own way: turned further than the stage turns them and tilted,
    // by no more than the dress table says, and not all alike
    for (const [yaw, tilt] of heads) { expect(Math.abs(yaw)).toBeLessThanOrEqual(0.1001); expect(Math.abs(tilt)).toBeLessThanOrEqual(0.0701); }
    for (const k of [0, 1]) expect(Math.max(...heads.map(h => h[k]!)) - Math.min(...heads.map(h => h[k]!))).toBeGreaterThan(k ? 0.07 : 0.1);
    // on a stage that turns the person the other way the same eyes look past the camera by twice the turn
    const other = offs(sample[6]!, { ...ENGLAND_1356, turn: -ENGLAND_1356.turn });
    for (const [beside] of other) expect(Math.abs(beside)).toBeGreaterThan(20);
    // and a Roman looks straight ahead of the head, past the viewer by the turn of Apoleia's stage
    for (const [beside] of offs({ ...sample[6]!, origin: 'Italia' }, APOLEIA)) expect(Math.abs(Math.abs(beside) - Math.abs(APOLEIA.turn) * 180 / Math.PI)).toBeLessThan(3);
  });
  it('a picture of England is a bust that ends on cloth', () => {
    // Until round 124 the figure ended in ragged sleeves at the upper arm and the picture stood so close that its
    // foot lay over them (`close` 1.12: the head on 0.59 of the height). The body's data reaches to under the
    // waist now (portrait/tests/bust.rs) and the picture shows the bust: the head from the chin to over the crown
    // on 0.45 of the height (more for a small child, whose short body would end inside the picture), the picture's
    // foot on the gown, with the gown hanging on below it.
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const sample: PortraitPerson[] = JSON.parse(readFileSync(here('sample_england.json'), 'utf8'));
    for (const p of sample) {
      const built = b.build(p), f = framing(built, ENGLAND_1356);
      const head = Math.max(0.8, built.top - built.chin) / f.height;
      expect(head, `person ${p.pid}: the head's share of the height`).toBeGreaterThan(0.44);
      expect(head, `person ${p.pid}: the head's share of the height`).toBeLessThan(p.age < 12 ? 0.75 : 0.46);
      // (the picture's middle lies 0.36 of its height under the top: its foot 0.86 under it)
      const foot = built.top - 0.86 * f.height, gown = built.surfaces.find(s => s.tex.includes('/cloth_cote.'))!;
      let lowest = Infinity;
      for (let i = 0; i < gown.pos.length; i += 3) if (Math.abs(gown.pos[i]! - built.cx) < 1) lowest = Math.min(lowest, gown.pos[i + 1]!);
      expect(lowest, `person ${p.pid}: the gown ends under the picture's foot`).toBeLessThan(foot - 0.3);
    }
    // the box in which the key's shadows are thrown is as large on the figure as it was at `close` 1.12 (0.9 of
    // the picture's height either way), so that the shadows on the face are drawn with the same pixels: what the
    // gauntlet reads on the face is read under the same shadows
    expect(Math.abs(ENGLAND_1356.shadow.reach / ENGLAND_1356.close / (0.9 / 1.12) - 1)).toBeLessThan(0.02);
    expect(APOLEIA.shadow.reach / APOLEIA.close).toBe(0.9);
  });
  it('the hems of the garments of England are wound outward', () => {
    // a hem is a thin tube along a garment's edge (tools/portrait/pipeline/tunic_bind.py). Wound inward its normals
    // point into it, the stage's shadow lookup starts inside the tube, and the hem lies in its own shadow: a black
    // cord round hood, veil and neckline (until round 61). On a tube with normals pointing outward, position and
    // normal change in the same direction from corner to corner of a triangle (nine in ten of the hems' triangles
    // or more as they are now, one in ten wound inward).
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const sample: PortraitPerson[] = JSON.parse(readFileSync(here('sample_england.json'), 'utf8'));
    const seen = new Map<string, number>();
    for (const p of sample) {
      for (const s of b.build(p).surfaces) {
        if (surfaceKind(s) !== 'cloth') continue;
        // (a man's coif, round 132, drawn with the fillet's image: its edge is the sheet itself turned in, no tube)
        if (s.tex.includes('/cloth_fillet.')) continue;
        let hem = 0, outward = 0;
        for (let t = 0; t + 2 < s.pos.length / 3; t += 3) {
          // the hem's texture coordinates run along it and a twentieth of the image round it
          if (![0, 1, 2].every(k => Math.abs(s.uv[(t + k) * 2 + 1]!) <= 0.05)) continue;
          let along = 0;
          for (const [i, j] of [[0, 1], [1, 2], [2, 0]] as const) {
            for (let a = 0; a < 3; a++) along += (s.pos[(t + i) * 3 + a]! - s.pos[(t + j) * 3 + a]!) * (s.nrm[(t + i) * 3 + a]! - s.nrm[(t + j) * 3 + a]!);
          }
          hem++;
          if (along > 0) outward++;
        }
        if (hem) {
          expect(outward / hem, `person ${p.pid}: ${s.tex}`).toBeGreaterThan(0.8);
          seen.set(s.tex, hem);
        }
      }
    }
    // gown, hood on the head and thrown back, veil and wimple all have a hem
    expect([...seen.keys()].map(t => t.replace(/^.*\/|\..*$/g, '')).sort()).toEqual(['cloth_cote', 'cloth_hood_down', 'cloth_hood_up', 'cloth_veil_linen', 'cloth_wimple']);
  });
  it('the hems of the garments of England are part of the cloth', () => {
    // a hem that is a mesh of its own, each of its points bound to its own nearest triangle of the body, leaves the
    // cloth's edge on a body other than the one the garment was draped on: under the chin of a hood it hung a
    // finger's breadth above the edge, with the throat between them (until round 63). Welded, one corner of the
    // tube's ring is the cloth's own edge vertex: a third of the tube's triangles have a corner on the cloth
    // (fewer on a child's gown, a fifth; none before)
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const sample: PortraitPerson[] = JSON.parse(readFileSync(here('sample_england.json'), 'utf8'));
    const seen = new Set<string>();
    for (const p of sample) {
      for (const s of b.build(p).surfaces) {
        if (surfaceKind(s) !== 'cloth' || s.tex.includes('/cloth_fillet.')) continue;
        const at = (v: number) => `${s.pos[v * 3]},${s.pos[v * 3 + 1]},${s.pos[v * 3 + 2]}`;
        const hem = (t: number) => [0, 1, 2].every(k => Math.abs(s.uv[(t + k) * 2 + 1]!) <= 0.05);
        const cloth = new Set<string>();
        for (let t = 0; t + 2 < s.pos.length / 3; t += 3) if (!hem(t)) for (const k of [0, 1, 2]) cloth.add(at(t + k));
        let tube = 0, welded = 0;
        for (let t = 0; t + 2 < s.pos.length / 3; t += 3) {
          if (!hem(t)) continue;
          tube++;
          if ([0, 1, 2].some(k => cloth.has(at(t + k)))) welded++;
        }
        if (tube) {
          expect(welded / tube, `person ${p.pid}: ${s.tex}`).toBeGreaterThan(0.15);
          seen.add(s.tex.replace(/^.*\/|\..*$/g, ''));
        }
      }
    }
    expect([...seen].sort()).toEqual(['cloth_cote', 'cloth_hood_down', 'cloth_hood_up', 'cloth_veil_linen', 'cloth_wimple']);
  });
  it('the hood worn on the head and the wimple are closed under the chin', () => {
    // until round 63 the hood was open in front down to the chest, its front edges hanging beside the neck as cords,
    // and until round 64 the wimple stood round the neck as a ring: their hems in front were half a hand and more
    // in front of the skin, and what cloth they had under the chin lay inside the head (rays from the head's centre
    // end in the mouth's cavity). Closed, the hem of the opening for the face lies on the throat between the gown's
    // neckline and the face: no more than 3 cm in front of the skin at its height (the builder's units are 10 cm)
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const sample: PortraitPerson[] = JSON.parse(readFileSync(here('sample_england.json'), 'utf8'));
    const worn = { cloth_hood_up: 0, cloth_wimple: 0 };
    for (const p of sample) {
      const surfaces = b.build(p).surfaces;
      const gown = surfaces.find(s => s.tex.includes('/cloth_cote.')), skin = surfaces.find(s => surfaceKind(s) === 'skin');
      for (const name of Object.keys(worn) as (keyof typeof worn)[]) {
        const cloth = surfaces.find(s => s.tex.includes(`/${name}.`));
        if (!cloth || !gown || !skin) continue;
        worn[name]++;
        // (the neckline beside the middle: since round 110 a man's gown is opened in the middle in a V, which
        // ends 3 cm to either side)
        let neckline = -Infinity;
        for (let v = 0; v < gown.pos.length / 3; v++) {
          const x = Math.abs(gown.pos[v * 3]!);
          if (x > 0.3 && x < 0.45 && gown.pos[v * 3 + 2]! > 0.5) neckline = Math.max(neckline, gown.pos[v * 3 + 1]!);
        }
        let on = 0;
        for (let v = 0; v < cloth.pos.length / 3; v++) {
          const [x, y, z] = [cloth.pos[v * 3]!, cloth.pos[v * 3 + 1]!, cloth.pos[v * 3 + 2]!];
          if (Math.abs(cloth.uv[v * 2 + 1]!) > 0.05 || Math.abs(x) > 0.15 || z < 0.5 || y < neckline + 0.1 || y > neckline + 1.0) continue;
          let front = -Infinity;
          for (let k = 0; k < skin.pos.length / 3; k++) {
            if (Math.abs(skin.pos[k * 3]! - x) < 0.12 && Math.abs(skin.pos[k * 3 + 1]! - y) < 0.05) front = Math.max(front, skin.pos[k * 3 + 2]!);
          }
          if (z - front > -0.02 && z - front < 0.3) on++;
        }
        expect(on, `person ${p.pid}: points of the hem of ${name} on the throat`).toBeGreaterThan(20);
      }
    }
    expect(worn.cloth_hood_up).toBeGreaterThan(3);
    expect(worn.cloth_wimple).toBeGreaterThan(1);
  });
  it('the lid\'s edge of a person of England is dark where the lashes grow', () => {
    // MakeHuman's lashes are long single hairs that point at the viewer where they grow: the eye lay in the face
    // without an outline (until round 65). The skin within reach of the eyeball against the lid further out:
    // 0.36 to 0.59 with the lash line, 0.73 to 0.83 without (the shade of the fold alone). Since round 118 the
    // line is the upper lid's (the lower lid's rim keeps a share of it, `lid_under`): on England's people the
    // upper lid alone is read, 0.29 to 0.59; all round the eye they have 0.52 to 0.75
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const sample: PortraitPerson[] = JSON.parse(readFileSync(here('sample_england.json'), 'utf8'));
    const edgeToLid = (p: Portrait, upper: boolean): number => {
      const eye = p.surfaces.find(s => surfaceKind(s) === 'eyeball')!, skin = p.surfaces.find(s => surfaceKind(s) === 'skin')!;
      const sums = { edge: 0, edges: 0, lid: 0, lids: 0 };
      for (const side of [1, -1]) {
        const own: number[] = [];
        for (let i = 0; i < eye.pos.length; i += 3) if ((eye.pos[i]! - p.cx) * side > 0) own.push(i);
        const c = [0, 1, 2].map(k => own.reduce((a, i) => a + eye.pos[i + k]!, 0) / own.length);
        const r = own.reduce((a, i) => a + Math.hypot(eye.pos[i]! - c[0]!, eye.pos[i + 1]! - c[1]!, eye.pos[i + 2]! - c[2]!), 0) / own.length;
        for (let i = 0; i < skin.pos.length; i += 3) {
          if (skin.pos[i + 2]! < c[2]! + 0.3 * r) continue;
          const d = Math.hypot(skin.pos[i]! - c[0]!, skin.pos[i + 1]! - c[1]!, skin.pos[i + 2]! - c[2]!) / r;
          const light = 0.2126 * skin.col[i]! + 0.7152 * skin.col[i + 1]! + 0.0722 * skin.col[i + 2]!;
          if (upper && skin.pos[i + 1]! < c[1]!) continue;
          if (d < 1.15) { sums.edge += light; sums.edges++; } else if (d > 1.45 && d < 1.9) { sums.lid += light; sums.lids++; }
        }
      }
      expect(sums.edges).toBeGreaterThan(upper ? 150 : 300);
      expect(sums.lids).toBeGreaterThan(upper ? 150 : 300);
      return sums.edge / sums.edges / (sums.lid / sums.lids);
    };
    for (const p of sample) expect(edgeToLid(b.build(p), true), `person ${p.pid}`).toBeLessThan(0.65);
    // and everyone else's lids are Apoleia's
    for (const p of people) expect(edgeToLid(b.build(p), false), `person ${p.pid}`).toBeGreaterThan(0.7);
  });
  it('the lower lid\'s rim of a person of England is not drawn round with a dark line', () => {
    // (round 118) the stare. The shade of the eye's socket (skin_ao.txt) is darkest where a lid lies against the
    // ball, and it and the lash line lay on the lower lid's rim as on the upper's: a dark line all round the eye,
    // as drawn with a pen. Lashes are thick on the upper lid, and the lower lid's rim faces the light: England
    // keeps a share of both there (portrait/src/dress.rs `lid_under`). The skin within reach of the eyeball,
    // below the eye's middle against above it: 1.02 to 1.67 with the tables as they are (1.25 over all), 1.35 to
    // 2.40 since (1.76)
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const sample: PortraitPerson[] = JSON.parse(readFileSync(here('sample_england.json'), 'utf8'));
    const underToOver = (p: Portrait): number => {
      const eye = p.surfaces.find(s => surfaceKind(s) === 'eyeball')!, skin = p.surfaces.find(s => surfaceKind(s) === 'skin')!;
      const sums = { under: 0, unders: 0, over: 0, overs: 0 };
      for (const side of [1, -1]) {
        const own: number[] = [];
        for (let i = 0; i < eye.pos.length; i += 3) if ((eye.pos[i]! - p.cx) * side > 0) own.push(i);
        const c = [0, 1, 2].map(k => own.reduce((a, i) => a + eye.pos[i + k]!, 0) / own.length);
        const r = own.reduce((a, i) => a + Math.hypot(eye.pos[i]! - c[0]!, eye.pos[i + 1]! - c[1]!, eye.pos[i + 2]! - c[2]!), 0) / own.length;
        for (let i = 0; i < skin.pos.length; i += 3) {
          if (skin.pos[i + 2]! < c[2]! + 0.3 * r) continue;
          if (Math.hypot(skin.pos[i]! - c[0]!, skin.pos[i + 1]! - c[1]!, skin.pos[i + 2]! - c[2]!) / r >= 1.15) continue;
          const light = 0.2126 * skin.col[i]! + 0.7152 * skin.col[i + 1]! + 0.0722 * skin.col[i + 2]!;
          if (skin.pos[i + 1]! < c[1]!) { sums.under += light; sums.unders++; } else { sums.over += light; sums.overs++; }
        }
      }
      expect(sums.unders).toBeGreaterThan(100);
      expect(sums.overs).toBeGreaterThan(100);
      return sums.under / sums.unders / (sums.over / sums.overs);
    };
    const all = sample.map(p => underToOver(b.build(p)));
    // every one of them, and all of them together
    for (const [k, v] of all.entries()) expect(v, `person ${sample[k]!.pid}`).toBeGreaterThan(1.3);
    expect(all.reduce((a, x) => a + x, 0) / all.length).toBeGreaterThan(1.6);
  });
  it('the lips of a person of England close over the mouth, in a colour that goes with the skin', () => {
    // MakeHuman's closed mouth is a slit of a millimetre between the edges where the lips turn inward: one looked
    // through it into the black inside of the mouth (until round 66). A strip from edge to edge closes it: the last
    // triangles of the skin, two sides of 11 and 8 vertices each, which Apoleia's skin does not have
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const sample: PortraitPerson[] = JSON.parse(readFileSync(here('sample_england.json'), 'utf8'));
    const STRIP = 2 * (11 + 8 - 2) * 3;
    const tones: [number, number][] = [];
    for (const p of sample) {
      const skin = b.build(p).surfaces.find(s => surfaceKind(s) === 'skin')!;
      const bare = b.build({ ...p, origin: 'Italia' }).surfaces.find(s => surfaceKind(s) === 'skin')!;
      expect(skin.pos.length / 3 - bare.pos.length / 3, `person ${p.pid}`).toBe(STRIP);
      const first = skin.pos.length - 3 * STRIP;
      const at = (i: number) => `${skin.pos[i]},${skin.pos[i + 1]},${skin.pos[i + 2]}`;
      // welded to the lips: every corner of the strip is a corner of the skin itself
      const own = new Set<string>();
      for (let i = 0; i < first; i += 3) own.add(at(i));
      const box = [[Infinity, -Infinity], [Infinity, -Infinity]];
      const mean = (from: number, to: number) => [0, 1, 2].map(k => { let a = 0; for (let i = from; i < to; i += 3) a += skin.col[i + k]!; return a / ((to - from) / 3); });
      for (let i = first; i < skin.pos.length; i += 3) {
        expect(own.has(at(i)), `person ${p.pid}: corner ${i / 3} of the strip lies on the lips`).toBe(true);
        for (const k of [0, 1]) box[k] = [Math.min(box[k]![0]!, skin.pos[i + k]!), Math.max(box[k]![1]!, skin.pos[i + k]!)];
      }
      // from one corner of the mouth to the other (3.4 to 5.3 cm, a small child's to a man's), and flat
      const [wide, high] = box.map(r => r[1]! - r[0]!) as [number, number];
      expect(wide, `person ${p.pid}`).toBeGreaterThan(0.25);
      expect(wide, `person ${p.pid}`).toBeLessThan(0.6);
      expect(high, `person ${p.pid}`).toBeLessThan(0.15 * wide);
      const [lip, all] = [mean(first, skin.pos.length), mean(0, first)] as [number[], number[]];
      // a flesh colour as the skin's own, not a painted red (green to red 0.81 to 0.99 of the skin's as a whole;
      // until round 71 0.87 to 1.03, until round 81 0.72 to 1.03: the lips' blood alone would be 0.55 to 0.8);
      // and no darker than the skin (0.95 to 1.28 of its red, the grown 0.95 to 1.19): the strip stands in the
      // lips' shade, where the stage has no light that comes through flesh, and is as dark as the line of a
      // mouth only so. Until round 77 1.12 to 1.41: the upper lip was painted half as light again and the strip
      // with it; since round 78 a light of the stage lights both from below (`Lips::upper` 1.15). Since round 82
      // the lips themselves are lighter and the strip's factor smaller by as much (`Lips::seam` 1.3, before
      // 1.6): the line between the lips reads 50 L under the lit cheek (before 54, the reference's 41 to 47).
      // Since round 103 the lips' red is in their paint (the picture's curve keeps a colour's hue and no longer
      // reddens what is dark, `Lips::blood`): the strip has the lips' red with it, green to red 0.46 to 0.82 of
      // the skin's, and is about as light as it was (1.08 to 1.34 of the skin's red; `Lips::seam` 1.43 and 1.0)
      expect(lip[1]! / lip[0]! / (all[1]! / all[0]!), `person ${p.pid}`).toBeGreaterThan(0.4);
      expect(lip[1]! / lip[0]! / (all[1]! / all[0]!), `person ${p.pid}`).toBeLessThan(1.1);
      expect(lip[0]! / all[0]!, `person ${p.pid}`).toBeGreaterThan(0.9);
      expect(lip[0]! / all[0]!, `person ${p.pid}`).toBeLessThan(1.45);
      tones.push([all[0]!, lip[0]!]);
    }
    // the lips go with the skin: fairer skin, fairer lips, not one red for everyone (0.75 over the sample)
    const m = [0, 1].map(k => tones.reduce((a, t) => a + t[k]!, 0) / tones.length);
    const cov = (j: number, k: number) => tones.reduce((a, t) => a + (t[j]! - m[j]!) * (t[k]! - m[k]!), 0);
    expect(cov(0, 1) / Math.sqrt(cov(0, 0) * cov(1, 1))).toBeGreaterThan(0.6);
  });
  it('the eye of England\'s profile tells its white from its iris, and every material finds its place in three.js', () => {
    // the profile's materials are written into three.js' own shaders (materials.ts `swap`): a piece that a new
    // three.js no longer has must be noticed here, not as a grey face in the game
    const compiled = (tex: string, double: boolean): string => {
      const s = { rough: 0.5, metal: 0, double, tex, nmap: '', pos: new Float32Array(9), col: new Float32Array(9).fill(0.5), uv: new Float32Array(6), nrm: new Float32Array(9) };
      return surfaceMaterials(s, null, null, ENGLAND_1356).map(m => {
        const shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
        m.onBeforeCompile(shader as never, null as never);
        return shader.fragmentShader;
      }).join('\n');
    };
    const eye = compiled('real/eyeball.webp', false);
    expect(surfaceKind({ tex: 'real/eyeball.webp', double: false } as never)).toBe('eyeball');
    expect(eye).toContain('eyeWhite = smoothstep(');
    expect(eye).toContain(`mix( ${ENGLAND_1356.eye!.iris.toFixed(3)} * ( 1.0 - ${ENGLAND_1356.eye!.ring.toFixed(3)} * eyeRing ) * mix( 1.0, ${ENGLAND_1356.eye!.pupil.dark.toFixed(3)}, eyePupil ), ${ENGLAND_1356.eye!.white.toFixed(3)}, eyeWhite )`);
    // (round 118) the stare. The image's pupil is 0.29 of the iris with a hard edge, a pinpoint as of an eye in
    // glaring light: the stage draws its own, larger and soft-edged, as an eye has it indoors. The white of the
    // eye was grey beside warm skin (a 6.6, b 9.2 in CIELAB where the skin under the eye has 14.0 and 20.9) and
    // stood out of the face by its colour: it is drawn warmer, and as light as it was. The key's glint: rough enough
    // that the stage's eight key lights (`shadow.lights`) are one glint and not a cluster of dots
    expect(eye).toContain('eyePupil = 1.0 - smoothstep(');
    expect(ENGLAND_1356.eye!.pupil.size).toBeGreaterThan(0.35);
    expect(ENGLAND_1356.eye!.pupil.size).toBeLessThan(0.5);
    expect(ENGLAND_1356.eye!.pupil.soft).toBeGreaterThan(0.05);
    const [br, bg, bb] = ENGLAND_1356.eye!.blush;
    expect(br).toBeGreaterThan(bg); expect(bg).toBeGreaterThan(bb);
    expect(Math.abs(0.2126 * br + 0.7152 * bg + 0.0722 * bb - 1)).toBeLessThan(0.03);
    expect(ENGLAND_1356.eye!.rough).toBeGreaterThan(0.2);
    expect(ENGLAND_1356.eye!.rough).toBeLessThan(0.3);
    // round 119: light reaches less far round the white of the eye than round the iris, so that the white goes into the
    // shade with the skin beside it (on the face's shaded half it was lighter than the cheek under it; the reference's is darker)
    expect(eye).toContain(`eyeWrap = mix( ${ENGLAND_1356.eye!.wrap.toFixed(3)}, ${ENGLAND_1356.eye!.wrapWhite.toFixed(3)}, eyeWhite );`);
    expect(eye).toContain('vec3 wrapBy = vec3( eyeWrap );');
    expect(ENGLAND_1356.eye!.wrapWhite).toBeGreaterThan(0.03);
    expect(ENGLAND_1356.eye!.wrapWhite).toBeLessThan(0.2);
    expect(ENGLAND_1356.eye!.wrap).toBeGreaterThan(0.4);
    // the white of the eye lighter than the image gives it. The iris too, since round 103, and its darks lifted:
    // from round 65 to 102 it was drawn darker (0.7), by one brown-eyed face of the reference, and a blue or a
    // green iris was as black as a brown one, a hole in the face. It is darkest in a ring at its rim
    expect(ENGLAND_1356.eye!.white).toBeGreaterThan(1);
    expect(ENGLAND_1356.eye!.iris).toBeGreaterThan(1);
    expect(ENGLAND_1356.eye!.lift).toBeLessThan(0.7);
    expect(ENGLAND_1356.eye!.ring).toBeGreaterThan(0.3);
    expect(ENGLAND_1356.eye!.ring).toBeLessThan(0.8);
    expect(eye).toContain('eyeRing = smoothstep(');
    // the cornea: over the iris the normal leans outward (until round 72 the eye was a plain ball and the key
    // light's glint lay on the white beside the iris)
    expect(ENGLAND_1356.eye!.cornea).toBeGreaterThan(0);
    expect(eye).toContain('eyeLean');
    expect(compiled('real/skin_young_female.webp', false)).toContain('skinTint');
    expect(compiled('real/roman01.webp', true)).toContain('hairStrand');
    expect(compiled('real/bob01_cap.webp', true)).toContain('wrapBy');
    // Apoleia's eye is left as it is
    expect(APOLEIA.eye).toBeNull();
  });
  it('the people of the world wear the plain dress of 1356 under England\'s light', () => {
    // (round 111) founders of every pool of genes the game's cultures draw from (tests/portrait/sample_world.json,
    // portrait/examples/sample.rs), given to the builder under their culture's name as the game gives them: a
    // culture without a dress of its own wears the plain one, England's table without hood, veil and wimple, and
    // stands under England's light. Until then all of them stood in Apoleia's Roman dress on Apoleia's stage
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const world: PortraitPerson[] = JSON.parse(readFileSync(here('sample_world.json'), 'utf8'));
    expect(world.length).toBe(22 * 8);
    const list = portraitManifest(), images = new Set(list.images.map(n => `${list.folder}/${n}`));
    const plain = profileOf('plain1356/x');
    expect(plain.key).toBe('plain1356');
    expect([plain.skin, plain.lights, plain.finish, plain.sheen]).toEqual([ENGLAND_1356.skin, ENGLAND_1356.lights, ENGLAND_1356.finish, ENGLAND_1356.sheen]);
    let fleece = 0, flat = 0, darkest = 1;
    for (const p of world) {
      const out = b.build(p), worn = out.surfaces.map(s => s.tex);
      expect(out.look.startsWith('plain1356/'), `person ${p.pid}`).toBe(true);
      for (const t of worn) if (t) expect(images.has(t), `${t} is in the repository`).toBe(true);
      expect(worn.some(t => /\/cloth_(hood|veil|wimple)/.test(t)), `person ${p.pid}: a bare head`).toBe(false);
      expect(worn.some(t => /\/cloth_(cote|kirtle)/.test(t)), `person ${p.pid}: a gown`).toBe(true);
      // tightly curled hair is one matte mass: solid, no bundles beside it and none of the strands' sheen
      const coils = out.surfaces.filter(s => s.tex.includes('/hair1356_fleece.'));
      if (coils.length) {
        fleece++;
        expect(worn.some(t => t.includes('/hair1356_body.') || t.includes('_rope.')), `person ${p.pid}: no bundles and no plaits beside it`).toBe(false);
        expect([surfaceKind(coils[0]!), drawOrder(coils[0]!)]).toEqual(['fleece', 0]);
        const m = surfaceMaterials(coils[0]!, null, null, plain);
        expect(m.length).toBe(1);
        expect([m[0]!.transparent, m[0]!.depthWrite, m[0]!.roughness, m[0]!.anisotropy]).toEqual([false, true, 1, 0]);
      }
      if (worn.some(t => t.includes('_flat.'))) flat++;
      darkest = Math.min(darkest, portraitSkinTone(out.surfaces)!);
    }
    // the 16 founders of the two pools south of the Sahara and some of the Horn's; every head drawn with the
    // skin's image that has no light painted into it (round 113; round 111 only the heads with a flat nose
    // root); and skins far darker than any of England's
    expect(fleece).toBeGreaterThanOrEqual(16); expect(fleece).toBeLessThan(40);
    expect(flat).toBe(world.length);
    expect(darkest).toBeLessThan(0.12);
  }, 120_000);
  it('a dark skin has a warm, weaker highlight and little of the down\'s sheen; a skin of England\'s is drawn as it was', () => {
    // (round 111) the white gleam that is lost in the light of a pale cheek lies as a grey film on a dark one, and
    // the pale sheen of the down as ash. Both go by the person's tone, in full from 0.30 on: England's sample
    // lies at 0.46 to 0.66, the world's goes down to 0.07
    const of = (tex: string) => ({ rough: 0.6, metal: 0, double: false, tex, nmap: '', pos: new Float32Array(9), col: new Float32Array(9).fill(0.5), uv: new Float32Array(6), nrm: new Float32Array(9) });
    const skin = of('real/skin_young_female.webp');
    expect(surfaceKind(skin)).toBe('skin');
    const look = (tone: number) => { const m = surfaceMaterials(skin, null, null, ENGLAND_1356, tone)[0]!; return [m.specularIntensity, m.specularColor.r, m.specularColor.g, m.specularColor.b, m.sheen]; };
    for (const tone of [0.30, 0.46, 0.66]) expect(look(tone)).toEqual([1, 1, 1, 1, ENGLAND_1356.skin!.fuzz]);
    const dark = look(0.07);
    expect(dark[0]).toBeLessThan(0.55); expect(dark[0]).toBeGreaterThanOrEqual(0.5);
    expect(dark[1]).toBe(1); expect(dark[2]).toBeLessThan(0.8); expect(dark[3]).toBeLessThan(0.62);
    expect(dark[4]).toBeLessThan(0.3 * ENGLAND_1356.skin!.fuzz);
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const sample: PortraitPerson[] = JSON.parse(readFileSync(here('sample_england.json'), 'utf8'));
    for (const p of sample) {
      const out = b.build(p);
      expect(portraitSkinTone(out.surfaces)!, `person ${p.pid}`).toBeGreaterThan(0.30);
      // and none of England's sample wears tightly curled hair. Every head is drawn with the skin's image that has
      // no light painted into it (round 113: the stage lights the face, and the light of the photographs the
      // images are made from stood under it as a pale band from the nose's root under the eyes; round 111 drew
      // only a head with a flat nose root with it)
      expect(out.surfaces.some(s => s.tex.includes('_fleece.')), `person ${p.pid}`).toBe(false);
      expect(out.surfaces.some(s => s.tex.includes('_flat.')), `person ${p.pid}`).toBe(true);
    }
    // one program for the skin of a stage, whichever of its images a head is drawn with
    const key = (tex: string) => surfaceMaterials(of(tex), null, null, ENGLAND_1356, 0.5)[0]!.customProgramCacheKey();
    expect(key('real/skin_young_female.webp')).toBe(key('real/skin_old_male_flat.webp'));
  });
  it('a plait is solid hair: drawn with the solid surfaces, in the stage\'s shadows', () => {
    // Until round 86 a plait was hair cards: blended over what is behind them, throwing no shadow, and with a
    // sheen that every light gave them whether it reached them or not (a card knows of no shadow but its own
    // direction's). The far plait hangs in the head's shadow and shone as the near one. Now a plait's strands
    // are solid: one material, not blended, writing depth, one-sided; the stage lets what is not blended throw
    // shadows; and the sheen is part of each light's own share, which three.js darkens by the light's shadow
    const of = (tex: string, double: boolean) => ({ rough: 0.6, metal: 0, double, tex, nmap: '', pos: new Float32Array(9), col: new Float32Array(9).fill(0.5), uv: new Float32Array(6), nrm: new Float32Array(9) });
    const compiled = (s: ReturnType<typeof of>): string[] => surfaceMaterials(s, null, null, ENGLAND_1356).map(m => {
      const shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
      m.onBeforeCompile(shader as never, null as never);
      return shader.fragmentShader;
    });
    const rope = of('real/plait01_rope.webp', false), cards = of('real/roman01.webp', true);
    expect([surfaceKind(rope), surfaceKind(cards)]).toEqual(['rope', 'cards']);
    expect([drawOrder(rope), drawOrder(cards)]).toEqual([0, 2]);
    const solid = surfaceMaterials(rope, null, null, ENGLAND_1356);
    expect(solid.length).toBe(1);
    expect([solid[0]!.transparent, solid[0]!.depthWrite, solid[0]!.colorWrite, solid[0]!.side]).toEqual([false, true, true, FrontSide]);
    expect(surfaceMaterials(cards, null, null, ENGLAND_1356).map(m => m.transparent)).toEqual([false, true]);
    // the same hair: roughness and glint as the cards have them
    expect([solid[0]!.roughness, solid[0]!.anisotropy]).toEqual([ENGLAND_1356.cards.rough, ENGLAND_1356.cards.anisotropy]);
    // the sheen's two bands: on a strand from the light as it arrives (`directLight`, shadowed), inside three.js'
    // own function for one light; on cards from every light as it was sent, after all lights are done
    const [strand] = compiled(rope), card = compiled(cards)[1]!;
    expect(strand).toContain('directLight.color * hairLit * hairStrand');
    expect(strand).not.toContain('directionalLights[ i ].color * hairLit');
    expect(strand.indexOf('directLight.color * hairLit')).toBeLessThan(strand.indexOf('void main()'));
    expect(card).toContain('directionalLights[ i ].color * hairLit * hairStrand');
    expect(card).not.toContain('directLight.color * hairLit');
    // a profile without a sheen of strands (Apoleia's) draws a plait's strands as plain solid hair
    expect(surfaceMaterials(rope, null, null, APOLEIA)[0]!.transparent).toBe(false);
  });
  it('dark hair of England is drawn lighter and hair keeps most of its colour', () => {
    // Round 122: the strands' image and the shade baked between the bundles take half of a hair's colour away
    // before any light falls on it, and the stage left 0.7 of its colour (set in round 47 for cards, which were
    // lighter): brown hair at the crown read L 14 to 27 and a chroma of 9 to 15, where the reference's brown and
    // red heads read L 25 to 42 and 21 to 30. Hair is drawn lighter where it is dark (`sheen.tone`), as it was
    // where it is as light as white (`sheen.toneLight`: blond and white hair were as light as the reference's),
    // and keeps more of its colour
    const sheen = ENGLAND_1356.sheen!, cap = ENGLAND_1356.cap!;
    expect(sheen.tone).toBeGreaterThan(1.3);
    expect(sheen.tone).toBeLessThan(2);
    expect(sheen.toneLight).toBe(1);
    expect(sheen.colour).toBeGreaterThan(0.75);
    expect(sheen.colour).toBeLessThan(1);
    const of = (tex: string) => ({ rough: 0.6, metal: 0, double: false, tex, nmap: '', pos: new Float32Array(9), col: new Float32Array(9).fill(0.5), uv: new Float32Array(6), nrm: new Float32Array(9) });
    for (const tex of ['real/hair1356_body.webp', 'real/plait01_rope.webp', 'real/beard1356_locks.webp']) {
      const shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
      surfaceMaterials(of(tex), null, null, ENGLAND_1356)[0]!.onBeforeCompile(shader as never, null as never);
      expect(shader.fragmentShader, tex).toContain(`diffuseColor.rgb, ${sheen.colour.toFixed(3)} ) * mix( ${sheen.tone.toFixed(3)}, ${sheen.toneLight.toFixed(3)}, smoothstep( 0.08, 0.45, dot( vColor.rgb`);
    }
    // the painted layers go with it: the shade under the hair keeps as much colour as the hair over it, and a short
    // beard, which is its layer alone, stays lighter than the man's hair as it was (5.5 times before the hair's 1)
    expect(cap.colour).toBe(sheen.colour);
    expect(cap.beard.tone / sheen.tone).toBeCloseTo(5.5, 5);
  });
  it('black hair has a white sheen to show its form by (round 158)', () => {
    // Black hair was a dark shape: drawn lighter it is still next to black (round 122), and the white band of its
    // sheen was set for brown hair, on which the band in the hair's own colour does the work (L 5.2 at the crown
    // of four heads for the reference's 17.9). The white band is surface reflection and does not darken with the
    // hair (Marschner et al. 2003, section 2.1): it is drawn stronger on black hair (`sheen.white`) and as it was
    // from a middle brown on (`sheen.whiteLight`, the 0.3 it was), as sharp as it was
    const sheen = ENGLAND_1356.sheen!;
    expect(sheen.whiteLight).toBe(0.3);
    expect(sheen.whiteSharp).toBe(120);
    expect(sheen.white).toBeGreaterThan(1);
    expect(sheen.white).toBeLessThan(3);
    // bundles, a plait's strands, a beard's locks, and hair cards (drawn from both sides; their second material)
    const of = (tex: string) => ({ rough: 0.6, metal: 0, double: tex.includes('roman'), tex, nmap: '', pos: new Float32Array(9), col: new Float32Array(9).fill(0.5), uv: new Float32Array(6), nrm: new Float32Array(9) });
    for (const tex of ['real/hair1356_body.webp', 'real/plait01_rope.webp', 'real/beard1356_locks.webp', 'real/roman01.webp']) {
      const shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
      const all = surfaceMaterials(of(tex), null, null, ENGLAND_1356);
      all[all.length - 1]!.onBeforeCompile(shader as never, null as never);
      expect(shader.fragmentShader, tex).toContain(`hairWhite = mix( ${sheen.white.toFixed(3)}, ${sheen.whiteLight.toFixed(3)}, smoothstep( 0.0, 0.08, dot( vColor.rgb`);
      expect(shader.fragmentShader, tex).toContain('hairStrand * ( hairWhite * hairS1 * 0.08 +');
      // the strength is set where the hair's colour is read, before the lights use it
      expect(shader.fragmentShader.indexOf('hairWhite = mix(')).toBeLessThan(shader.fragmentShader.lastIndexOf('#include <lights_fragment_end>'));
    }
  });
  it('a lock of hair is solid, open below, and frayed where its image is empty', () => {
    // Until round 87 the hair of a man's head was cards: thin sheets blended over each other, lit as one smooth
    // dome (a card's direction was the one from the head's centre), throwing no shadow on the forehead. Then it
    // was locks, as a full beard still is: arched bands, each lit by its own form, in the stage's shadows as a
    // plait's strands are. A band
    // is open below, so it is drawn from both sides; its hairs end one after the other, so the image is empty
    // between them there, and where the image is empty nothing is drawn and nothing throws a shadow
    const of = (tex: string, double: boolean) => ({ rough: 0.6, metal: 0, double, tex, nmap: '', pos: new Float32Array(9), col: new Float32Array(9).fill(0.5), uv: new Float32Array(6), nrm: new Float32Array(9) });
    const locks = of('real/beard1356_locks.webp', true), plait = of('real/plait01_rope.webp', false);
    expect(surfaceKind(locks)).toBe('rope');
    // the bundles of a head's hair (round 109) are drawn by the same rule: solid, from both sides
    const bundles = of('real/hair1356_body.webp', true);
    expect([surfaceKind(bundles), drawOrder(bundles)]).toEqual(['rope', 0]);
    expect(surfaceMaterials(bundles, null, null, ENGLAND_1356).map(m => [m.transparent, m.side, m.alphaTest])).toEqual([[false, DoubleSide, LOCK_OPAQUE]]);
    expect(drawOrder(locks)).toBe(0);
    const [lock, ...more] = surfaceMaterials(locks, null, null, ENGLAND_1356);
    expect(more.length).toBe(0);
    expect([lock!.transparent, lock!.depthWrite, lock!.colorWrite, lock!.side]).toEqual([false, true, true, DoubleSide]);
    expect(lock!.alphaTest).toBe(LOCK_OPAQUE);
    // cut out, not blended: a part-covered pixel would be written part-clear into the picture, which stands
    // on whatever the page shows behind it
    expect(lock!.alphaToCoverage).toBe(false);
    expect(LOCK_OPAQUE).toBeGreaterThan(0.25);
    expect(LOCK_OPAQUE).toBeLessThan(0.75);
    // a plait's strands are cut out by the same rule (their image covers everywhere) and stay one-sided
    const strand = surfaceMaterials(plait, null, null, ENGLAND_1356)[0]!;
    expect([strand.alphaTest, strand.side]).toEqual([LOCK_OPAQUE, FrontSide]);
    // the same hair as the cards were: roughness, glint, and the sheen from each light as it arrives
    expect([lock!.roughness, lock!.anisotropy]).toEqual([ENGLAND_1356.cards.rough, ENGLAND_1356.cards.anisotropy]);
    const shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
    lock!.onBeforeCompile(shader as never, null as never);
    expect(shader.fragmentShader).toContain('directLight.color * hairLit * hairStrand');
    expect(shader.fragmentShader).not.toContain('directionalLights[ i ].color * hairLit');
  });
  it('silk is drawn smoother than wool and shines (round 150)', () => {
    // The court's gown is of silk (`DressSet::gown_image`, an image named `_silk`): the stage draws wool and
    // linen as matt cloth, silk with a glint along its folds. Until then a lord's gown was the villagers' wool
    // in a stronger dye.
    const of = (tex: string) => ({ rough: 0.5, metal: 0, double: false, tex, nmap: '', pos: new Float32Array(9), col: new Float32Array(9).fill(0.5), uv: new Float32Array(6), nrm: new Float32Array(9) });
    const look = (tex: string) => { const m = surfaceMaterials(of(tex), null, null, ENGLAND_1356)[0]!; return { rough: m.roughness, ior: m.ior, tone: m.color.r, side: m.side }; };
    const [wool, silk, linen] = [look('real/cloth_cote.webp'), look('real/cloth_cote_silk.webp'), look('real/cloth_smock.webp')];
    expect(surfaceKind(of('real/cloth_cote_silk.webp'))).toBe('cloth');
    const k = ENGLAND_1356.cloth!;
    expect([wool.rough, linen.rough, silk.rough]).toEqual([0.95, 0.95, k.silk.rough]);
    expect(silk.rough).toBeLessThan(0.7);
    expect(silk.ior).toBeGreaterThan(wool.ior);
    expect([wool.tone, linen.tone, silk.tone]).toEqual([k.wool, k.linen, k.silk.tone]);
    expect(silk.side).toBe(DoubleSide);
    // Apoleia's profile has no cloth of its own: an image named so is drawn as any cloth
    expect(surfaceMaterials(of('real/cloth_cote_silk.webp'), null, null, APOLEIA)[0]!.roughness).toBe(0.95);
  });
  it('a figured silk has its figure drawn in gold (round 156)', () => {
    // Half of the court's gowns are of a silk with a figure woven in in gold thread (`DressSet::gown_figured`, an
    // image named `_figured`): the figure is the image's covering, and where the covering is less than 1 the
    // stage draws the gold's colour in place of the dye's, with the gold's roughness and share of metal. The
    // rest of the cloth is the plain silk's.
    const of = (tex: string) => ({ rough: 0.5, metal: 0, double: false, tex, nmap: '', pos: new Float32Array(9), col: new Float32Array(9).fill(0.5), uv: new Float32Array(6), nrm: new Float32Array(9) });
    const drawn = (tex: string, profile = ENGLAND_1356) => {
      const m = surfaceMaterials(of(tex), null, null, profile)[0]!;
      const shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
      m.onBeforeCompile(shader as never, null as never);
      return { m, code: shader.fragmentShader, key: m.customProgramCacheKey() };
    };
    const [plain, figured] = [drawn('real/cloth_cote_silk.webp'), drawn('real/cloth_cote_silk_figured.webp')];
    const k = ENGLAND_1356.cloth!;
    expect([figured.m.roughness, figured.m.color.r, figured.m.ior]).toEqual([plain.m.roughness, plain.m.color.r, plain.m.ior]);
    expect(plain.code).toBe(ShaderLib.physical.fragmentShader);
    expect(figured.code).toContain('silkFigure = 1.0 - sampledDiffuseColor.a;');
    expect(figured.code).toContain(`vec3( ${k.figured.gold.map(c => c.toFixed(3)).join(', ')} )`);
    expect(figured.code).toContain(`roughnessFactor = mix( roughnessFactor, ${k.figured.rough.toFixed(3)}, silkFigure );`);
    expect(figured.code).toContain(`metalnessFactor = mix( metalnessFactor, ${k.figured.metal.toFixed(3)}, silkFigure );`);
    // the figure is declared before it is used, and both after the image is read
    const at = (piece: string) => figured.code.indexOf(piece);
    expect(at('#include <map_fragment>')).toBeLessThan(at('float silkFigure'));
    expect(at('float silkFigure')).toBeLessThan(at('roughnessFactor = mix'));
    expect(figured.key).not.toBe(plain.key);
    // gold is yellow and lighter than any dye is drawn
    const [r, g, b] = k.figured.gold;
    expect(r > g && g > 2 * b && r > 1).toBe(true);
    // Apoleia's profile has no cloth of its own: an image named so is drawn as any cloth
    expect(drawn('real/cloth_cote_silk_figured.webp', APOLEIA).code).toBe(ShaderLib.physical.fragmentShader);
  });
  it('a scar takes the tone of the skin it lies in', () => {
    // a scar of the real look is a small surface of skin of its own, lighter than the skin as a whole: with a
    // tone of its own it would take more of the profile's tint than the skin round it and show as a patch
    const tint = (s: object, tone?: number): number[] => {
      const shader = { uniforms: {} as Record<string, { value: { toArray(): number[] } }>, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
      surfaceMaterials(s as never, null, null, ENGLAND_1356, tone)[0]!.onBeforeCompile(shader as never, null as never);
      return shader.uniforms.skinTint!.value.toArray();
    };
    const of = (corners: number, light: number) => ({ rough: 0.5, metal: 0, double: false, tex: 'real/skin_young_female.webp', nmap: '', pos: new Float32Array(3 * corners), col: new Float32Array(3 * corners).fill(light), uv: new Float32Array(2 * corners), nrm: new Float32Array(3 * corners) });
    const [skin, scar] = [of(300, 0.25), of(30, 0.6)];
    const tone = portraitSkinTone([scar, skin] as never);
    expect(tone).toBeCloseTo(0.25);
    expect(portraitSkinTone([{ ...skin, tex: '' }] as never)).toBeUndefined();
    expect(tint(scar, tone)).toEqual(tint(skin, tone));
    expect(tint(scar)).not.toEqual(tint(skin));
  });
  it('a child of England has a child\'s skin: less of the pores, the relief and the blotches of the grown', () => {
    // (round 105) the skin's images and the stage's noise are a grown person's: on a child of two they drew a
    // small adult's leathery skin. The builder says how much of a child the person still is, the stage takes that
    // share of the way from the grown's fine structure to `skin.child` of it.
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const sample: PortraitPerson[] = JSON.parse(readFileSync(here('sample_england.json'), 'utf8'));
    const young = (age: number, female: boolean) => b.build({ ...sample.find(q => q.female === female)!, age }).young;
    for (const female of [true, false]) {
      for (const age of [2, 5, 8, 11]) expect(young(age, female), `${age}`).toBe(1);
      expect(young(13, female)).toBeGreaterThan(0);
      expect(young(13, female)).toBeLessThan(1);
      for (const age of [17, 24, 68]) expect(young(age, female), `${age}`).toBe(0);
    }
    // a look without a dress table has none of it
    expect(b.build(people[0]!).young).toBe(0);
    const k = ENGLAND_1356.skin!;
    expect(k.child).toBeGreaterThan(0.1);
    expect(k.child).toBeLessThan(0.6);
    const skin = { rough: 0.5, metal: 0, double: false, tex: 'real/skin_young_female.webp', nmap: '', pos: new Float32Array(9), col: new Float32Array(9).fill(0.3), uv: new Float32Array(6), nrm: new Float32Array(9) };
    const fine = (share?: number): [number, number] => {
      const m = surfaceMaterials(skin, null, null, ENGLAND_1356, 0.3, share)[0]!;
      const shader = { uniforms: {} as Record<string, { value: number }>, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
      m.onBeforeCompile(shader as never, null as never);
      // relief, blotches and speckle are drawn by the share
      expect(shader.fragmentShader).toContain('* skinFine * ( skinNoise');
      expect(shader.fragmentShader).toContain('* skinFine * skinA');
      expect(shader.fragmentShader).toContain('* skinFine * skinB');
      return [m.normalScale.x, shader.uniforms.skinFine!.value];
    };
    expect(fine()).toEqual([k.pores, 1]);
    expect(fine(0)).toEqual([k.pores, 1]);
    expect(fine(1)[0]).toBeCloseTo(k.pores * k.child);
    expect(fine(1)[1]).toBeCloseTo(k.child);
    expect(fine(0.5)[1]).toBeCloseTo((1 + k.child) / 2);
  });
  it('the light a shadow on England\'s skin lets through comes out of the skin red', () => {
    // (round 113) The key light's shadow is drawn at 0.7 and the rim light's at 0.5 (`shadow.strength`,
    // `rimShadow`): what a shadow lets through stands for light that went through the nose or came off the cheek.
    // In the lamp's own colour it lay on the shaded half of a face as a grey film (the rim light is blue): the
    // shaded cheek of the sample's women had a chroma 9.6 under the lit cheek's, the men's 15.3, where four faces
    // of the reference keep it within 2. It takes the colour `skin.bleed` now, and the highlight none of it.
    // The stronger gloss in a stripe down the nose's back (`skin.zone`, rounds 106 to 112) is gone: it was held
    // to one face's reading and lay on every nose as a pale patch
    const k = ENGLAND_1356.skin!;
    expect(k.bleed[0]).toBe(1);
    expect(k.bleed[1]).toBeLessThan(0.7); expect(k.bleed[1]).toBeGreaterThan(k.bleed[2]);
    expect(k.bleed[2]).toBeGreaterThan(0.1);
    expect('zone' in k).toBe(false);
    const skin = { rough: 0.5, metal: 0, double: false, tex: 'real/skin_young_female_flat.webp', nmap: '', pos: new Float32Array(9), col: new Float32Array(9).fill(0.3), uv: new Float32Array(6), nrm: new Float32Array(9) };
    const drawn = (profile: typeof ENGLAND_1356) => {
      const m = surfaceMaterials(skin, null, null, profile, 0.3)[0]!;
      const shader = { uniforms: {} as Record<string, { value: number }>, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
      m.onBeforeCompile(shader as never, null as never);
      return shader;
    };
    const through = (c: readonly number[]) => `mix( vec3( ${c.map(v => v.toFixed(3)).join(', ')} ), vec3( 1.0 ), skinSeen )`;
    const shader = drawn(ENGLAND_1356);
    expect(shader.fragmentShader).toContain(through(k.bleed));
    // where the lamp is seen in full the light is the lamp's, and the highlight is the lamp's share alone
    expect(shader.fragmentShader).toContain('directLight.color *= skinShare;');
    expect(shader.fragmentShader).toContain('skinGloss = skinSeen / max( skinShare, vec3( 1e-4 ) );');
    expect(shader.fragmentShader).not.toContain('vSkinUv');
    expect(shader.vertexShader).not.toContain('vSkinUv');
    // a profile with a white bleed lets the lamp's own colour through, as until round 112
    expect(drawn({ ...ENGLAND_1356, skin: { ...k, bleed: [1, 1, 1] } }).fragmentShader).toContain(through([1, 1, 1]));
  });
  it('England\'s stage lights a face from above and from the side it is turned away from', () => {
    // a face lit level and from the side it is turned to has no shaded half and no shade under brow, nose and
    // lip (rounds 60 to 72: flat, pale, the eyes wide in full light). The key light stands on the other side of
    // the camera, far enough round that the far cheek lies in shade and near enough that the face's front is
    // lit, and high enough to shade the eye's socket without being a light from the ceiling
    const { key, rim, fill, bounce } = ENGLAND_1356.lights;
    const degrees = (r: number): number => r * 180 / Math.PI;
    const round = degrees(Math.atan2(key.from[0], key.from[2]) - ENGLAND_1356.turn);
    const above = degrees(Math.atan2(key.from[1], Math.hypot(key.from[0], key.from[2])));
    expect(key.from[0] * Math.sin(ENGLAND_1356.turn)).toBeLessThan(0);
    expect(round).toBeGreaterThan(45);
    expect(round).toBeLessThan(75);
    expect(above).toBeGreaterThan(30);
    expect(above).toBeLessThan(45);
    // the rim light stands behind the head on the shaded side: it draws the far cheek's edge and does not light
    // the cheek beside the nose (which faces half a radian round from the face's front)
    expect(rim.from[2]).toBeLessThan(0);
    expect(rim.from[0] * key.from[0]).toBeLessThan(0);
    const facing = (l: { from: readonly [number, number, number] }, turned: number): number => {
      const a = ENGLAND_1356.turn - turned * Math.sign(key.from[0]);
      return (l.from[0] * Math.sin(a) + l.from[2] * Math.cos(a)) / Math.hypot(...l.from);
    };
    // it stands behind the plane of that cheek, not in it (round 85): until then it stood 2 degrees in front of
    // the plane, and skin that a light skims shines pale towards whoever looks at it from the other side: a grey
    // patch between the nose and the far eye, on a child's flat face the whole field (16.4 % of it grey on the
    // children, 6.2 % on the reference's woman; then 8.3 %, and 1.0 % since round 94, when the highlight of the
    // hidden rim went)
    expect(facing(rim, 0.5)).toBeLessThan(-0.05);
    // and it stays above the head: hair that hangs straight down shines most under a level light (a girl's far
    // plait 11.5 L lighter with the rim level, a pale lilac, while a plait was cards), and level it lays more
    // grey beside the nose on everyone but small children (round 86: the young 10.7 %, women 9.1 %, men 11.1 %,
    // with the rim as it is 6.5, 6.2, 7.9)
    const over = degrees(Math.atan2(rim.from[1], Math.hypot(rim.from[0], rim.from[2])));
    expect(over).toBeGreaterThan(15);
    expect(over).toBeLessThan(35);
    // the far side of the nose faces a quarter turn round from the face's front, where neither the key nor a
    // light from below reaches it: with the head's whole shadow in the rim light it was a black wedge between
    // nose and far eye (55 L darker than the nose's back on the women, the reference's woman 35, on whom a pale
    // bluish streak lies along the nose's far side). The rim light shines on that side from 43 degrees off its
    // normal (36 until round 85), and half of the head's shadow is taken off it (round 83; as light, and since
    // round 94 without the highlight of a lamp that is hidden there)
    expect(facing(rim, Math.PI / 2)).toBeGreaterThan(0.6);
    // (round 123) under a key twice as large again the key itself reaches further round the nose, and the shade
    // beside it was lighter than five faces of the reference have it: a tenth of the rim passes the head now,
    // not half. Not none: the stage still has no light that goes through a nose or comes back off a cheek
    expect(ENGLAND_1356.rimShadow).toBeGreaterThan(0.5);
    expect(ENGLAND_1356.rimShadow).toBeLessThan(1);
    // two weak lights lighten the shade. What chest and ground throw back (round 78) comes from below and in
    // front, from the middle, and reaches what faces down: the jaw's underside and the neck under it, the upper
    // lip, the skin under the brow. Until then the one fill stood level on the far side (10 degrees below, 0.07
    // of the key): the neck under the chin was 53 L darker than the lit cheek where the reference's is 42, and
    // the upper lip had to be painted half as light again
    const below = (l: { from: readonly [number, number, number] }): number => degrees(Math.atan2(-l.from[1], Math.hypot(l.from[0], l.from[2])));
    expect(below(bounce)).toBeGreaterThan(20);
    expect(below(bounce)).toBeLessThan(45);
    expect(bounce.from[2]).toBeGreaterThan(0);
    expect(Math.abs(bounce.from[0])).toBeLessThan(0.2 * bounce.from[2]);
    // the fill is the photographer's (round 83): in front on the side away from the key and about level, so that
    // it reaches the far eye's socket and the far side of the nose (from round 78 to 82 the light from below did
    // both, from the key's side: a man's eye was 60 L darker than his lit cheek, the reference's emperor's 41)
    expect(fill.from[0] * key.from[0]).toBeLessThan(0);
    expect(fill.from[2]).toBeGreaterThan(0);
    expect(Math.abs(below(fill))).toBeLessThan(20);
    expect(facing(fill, 0)).toBeGreaterThan(0.4);
    expect(facing(fill, Math.PI / 2)).toBeGreaterThan(0.4);
    // it is the light of the face's far side, in the skin's own colour: until round 85 much of the light there
    // was the rim's grey gloss, and with the rim behind the cheek's plane and the fill as it was (a tenth of the
    // key) the shade beside a woman's nose was 6 L darker and a man's far cheek 6 (with the fill at 0.16 of the
    // key 2 L darker each; the reference's woman 9 L lighter there than ours)
    // That was under ACES, which darkens what is dark. Since round 103 the picture is finished through a curve of
    // its own, and round 106 held the stage against the reference's numbers line by line (tools/portrait/
    // gauntlet.mjs): with the fill above 0.13 of the key a woman's far cheek was 22.1 L under the lit one and the
    // shade beside her nose 30.6 (the reference's 27.7 and 34 to 35), a face without a shaded half; at 0.078 of
    // the key they are 24.4 and 33.6. The fill is still a light, and the stronger of the two.
    // (Round 113) The fill has the colour of light that comes off skin and cloth (a red: its green 0.32 and its
    // blue 0.14 of its red), so that the shaded half of a face keeps the skin's colour; a light of that colour is
    // 0.45 as light as a white one of its energy. The lights are held by how light they are: until then the
    // fill, nearly white, was 0.069 of the key by that (0.078 by energy; the limits 0.06 and 0.11 by energy
    // are 0.053 and 0.097 by lightness), now 0.057
    const channel = (hex: string, k: number): number => { const v = parseInt(hex.slice(1 + 2 * k, 3 + 2 * k), 16) / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const light = (l: { colour: string; energy: number }): number => l.energy * (0.2126 * channel(l.colour, 0) + 0.7152 * channel(l.colour, 1) + 0.0722 * channel(l.colour, 2));
    expect(light(fill)).toBeGreaterThan(0.053 * light(key));
    expect(light(fill)).toBeLessThan(0.097 * light(key));
    expect(light(fill)).toBeGreaterThan(light(bounce));
    expect(channel(fill.colour, 1)).toBeLessThan(0.5 * channel(fill.colour, 0));
    expect(channel(fill.colour, 2)).toBeLessThan(channel(fill.colour, 1));
    // each of the two is a light, and both together far weaker than the key: the face keeps its shaded half
    for (const l of [fill, bounce]) expect(light(l)).toBeGreaterThan(0.044 * light(key));
    expect(light(fill) + light(bounce)).toBeGreaterThan(0.097 * light(key));
    expect(light(fill) + light(bounce)).toBeLessThan(0.159 * light(key));
    expect(ENGLAND_1356.sky.energy).toBeLessThan(0.15 * key.energy);
    // Apoleia's stage is as it was
    expect(APOLEIA.lights.key.from).toEqual([-3.5, 4.5, 5.0]);
    expect(APOLEIA.lights.fill).toEqual({ from: [3.0, -1.0, 5.0], colour: '#ffe2c8', energy: 0.35 });
    expect(APOLEIA.lights.bounce.energy).toBe(0);
    expect(APOLEIA.rimShadow).toBe(0);
    expect(APOLEIA.exposure).toBe(0.92);
  });
  it('England\'s picture is finished through a curve that keeps a colour\'s hue', () => {
    // Until round 103 the picture went onto the canvas through three.js' ACES curve, which bends red, green and
    // blue each on its own: lit skin turned yellow and pale, whatever the skin's colour, and the rounds mended
    // that through the skin's tint. The profile now finishes its picture itself (finish.ts): drawn in linear
    // light, finer than the canvas, through a curve on the strongest of the three colours
    const f = ENGLAND_1356.finish!;
    expect(APOLEIA.finish).toBeNull();
    expect(f.fine).toBeGreaterThanOrEqual(2);
    expect(f.hue).toBeGreaterThan(0.8);
    // the curve: nothing in, nothing out; it rises all the way; its straight part begins at `start`, which it
    // leaves where it is, with the slope `contrast`; it comes to rest at white and never passes it
    const y = (x: number): number => toneCurve(x, f.curve);
    expect(y(0)).toBe(0);
    for (let x = 0.01; x < 8; x += 0.01) expect(y(x), `at ${x.toFixed(2)}`).toBeGreaterThan(y(x - 0.01));
    expect(y(f.curve.start)).toBeCloseTo(f.curve.start, 6);
    expect((y(f.curve.start + 0.02) - y(f.curve.start + 0.01)) / 0.01).toBeCloseTo(f.curve.contrast, 3);
    expect(y(8)).toBeLessThanOrEqual(1);
    expect(y(8)).toBeGreaterThan(0.99);
    // darks are drawn together, not lifted: under the straight part the curve lies under the straight line
    expect(y(f.curve.start / 4)).toBeLessThan(f.curve.start / 4);
    // the shader has the same curve, and takes it on the strongest colour
    expect(CURVE).toContain('float toneCurve( float x, float a, float m, float l, float c )');
    // the backdrop is part of the picture: nothing of the page shows through it
    expect(f.backdrop).not.toBeNull();
  });
  it('the wool of England is drawn light enough to be a colour, its linen as it is', () => {
    // (round 108) Set beside the reference, England's gowns and hoods were black shapes under the heads: read on
    // the sheets, the chest of six people had L 10 and a chroma of 7 where the reference's clothes have 30 and
    // 17. The builder's wools are a cloth's own colour, a quarter as light as skin, and the picture's curve draws
    // the darks together. The stage draws wool `cloth.wool` times lighter, as `cap.light` does hair: L 25 and a
    // chroma of 17 with the wools of that round. Linen, light as it is, is left.
    const k = ENGLAND_1356.cloth!;
    expect(APOLEIA.cloth).toBeNull();
    expect(k.wool).toBeGreaterThan(2);
    expect(k.wool).toBeLessThan(3.5);
    expect(k.linen).toBe(1);
    const of = (tex: string) => ({ rough: 0.9, metal: 0, double: true, tex, nmap: '', pos: new Float32Array(9), col: new Float32Array(9).fill(0.2), uv: new Float32Array(6), nrm: new Float32Array(9) });
    const light = (tex: string, p = ENGLAND_1356): number => surfaceMaterials(of(tex), null, null, p)[0]!.color.r;
    for (const wool of ['real/cloth_cote.webp', 'real/cloth_hood_up.webp', 'real/cloth_hood_down.webp']) expect(light(wool), wool).toBe(k.wool);
    for (const linen of ['real/cloth_veil_linen.webp', 'real/cloth_wimple.webp', 'real/cloth_smock.webp', 'real/cloth_fillet.webp']) expect(light(linen), linen).toBe(k.linen);
    expect(light('real/cloth_tunic.webp', APOLEIA)).toBe(1);
    // the garments England's sample wears are those: the stage tells wool from linen by an image's name
    const sample: PortraitPerson[] = JSON.parse(readFileSync(here('sample_england.json'), 'utf8'));
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const worn = new Set(sample.flatMap(p => b.build(p).surfaces.filter(s => surfaceKind(s) === 'cloth').map(s => s.tex)));
    // (since round 110 with the linen under the gown, a smock's and a shirt's, drawn with one image; the gown's
    // cuts are drawn with the gown's; since round 132 with a man's coif, drawn with the fillet's image: until
    // then the stage took that image for wool, and the fillet of round 128 was drawn `cloth.wool` times too light)
    expect([...worn].sort()).toEqual(['cloth_cote', 'cloth_fillet', 'cloth_hood_down', 'cloth_hood_up', 'cloth_smock', 'cloth_veil_linen', 'cloth_wimple'].map(n => `real/${n}.webp`));
    // what the factor is for: a wool of the builder under the light a chest gets lies deep in the curve's toe,
    // where a value is drawn darker than it is; lifted, it comes out at more than three times its lightness
    const y = (x: number): number => toneCurve(x, ENGLAND_1356.finish!.curve);
    const chest = 0.03;
    expect(y(chest)).toBeLessThan(chest * 0.5);
    expect(y(chest * k.wool) / y(chest)).toBeGreaterThan(3.5);
  });
  it('the skin of England shows no highlight of a lamp that is hidden', () => {
    // A shadow that is not full lets a share of its light through (the key's 0.3, the rim's half): that share
    // stands for light that comes by other ways, off a wall, off the cheek, through the nose. three.js lets the
    // same share of the lamp's highlight through, which nothing stands for: from a place in a lamp's shadow the
    // lamp is not seen, and a highlight is the lamp seen in the skin. Until round 94 the rim light's highlight
    // came through the head at half strength, strongest where the lamp would skim the skin: a pale grey patch
    // between the nose and the far eye of every face (of that field grey on children 8.3 %, the young 7.0,
    // women 6.3, men 7.8; now 1.0, 4.4, 3.5, 6.3: what is left lies where the rim light itself falls)
    const of = (tex: string, double: boolean) => ({ rough: 0.5, metal: 0, double, tex, nmap: '', pos: new Float32Array(9), col: new Float32Array(9).fill(0.5), uv: new Float32Array(6), nrm: new Float32Array(9) });
    const compiled = (s: ReturnType<typeof of>, p = ENGLAND_1356): string => surfaceMaterials(s, null, null, p).map(m => {
      const shader = { uniforms: {}, vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader };
      m.onBeforeCompile(shader as never, null as never);
      return shader.fragmentShader;
    }).join('\n');
    const skin = compiled(of('real/skin_young_female.webp', false));
    // the loop over the lights is the skin's own, every light begins as a lamp that is seen, and each light's
    // highlight is taken by what the loop found
    expect(skin).not.toContain('#include <lights_fragment_begin>');
    expect(skin).toContain('getDirectionalLightInfo( directionalLight, directLight ); skinGloss = vec3( 1.0 );');
    expect(skin).toContain('directLight.color *= skinShare;');
    expect(skin).toContain('reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation * skinGloss * skinOil;');
    expect(skin.indexOf('* skinGloss * skinOil;')).toBeLessThan(skin.indexOf('void main()'));
    // the shader's own arithmetic, run here for one colour at a time: of a lamp of which the share `seen` is seen
    // through a shadow of some strength, the light keeps what the shadow lets through, in the colour of light
    // that has been in skin (`skin.bleed`, round 113), and the highlight only the share seen, in the lamp's own
    const seenLine = /float skinSeen = (saturate\(.*\));/.exec(skin)![1]!, shareLine = /vec3 skinShare = (.*);/.exec(skin)![1]!;
    expect(skin).toContain('skinGloss = skinSeen / max( skinShare, vec3( 1e-4 ) );');
    const bleed = ENGLAND_1356.skin!.bleed;
    expect(shareLine).toContain(`vec3( ${bleed.map(v => v.toFixed(3)).join(', ')} )`);
    const saturate = (x: number): number => Math.min(1, Math.max(0, x));
    const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
    const shown = (seen: number, strength: number, c: number): [number, number] => {
      const lit = 1 - strength * (1 - seen);
      const share = shareLine.replace(/vec3\( [\d.]+, [\d.]+, [\d.]+ \)/, String(bleed[c])).replace(/vec3\( 1\.0 \)/g, '1.0');
      const run = new Function('saturate', 'max', 'mix', 'skinLit', 'directionalLightShadow', `const skinSeen = ${seenLine}; const skinShare = ${share}; return [skinShare, skinShare * ( skinSeen / max( skinShare, 1e-4 ) )];`) as
        (saturate: (x: number) => number, max: (a: number, b: number) => number, mix: (a: number, b: number, t: number) => number, lit: number, shadow: { shadowIntensity: number }) => [number, number];
      return run(saturate, Math.max, mix, lit, { shadowIntensity: strength });
    };
    for (const strength of [ENGLAND_1356.rimShadow, ENGLAND_1356.shadow.strength, 1, 0.05]) {
      for (const seen of [0, 0.25, 0.5, 1]) {
        for (const c of [0, 1, 2]) {
          const [light, highlight] = shown(seen, strength, c);
          expect(light, `light, ${seen} seen through ${strength}`).toBeCloseTo(strength * seen + (1 - strength) * (bleed[c]! + (1 - bleed[c]!) * seen), 6);
          expect(highlight, `highlight, ${seen} seen through ${strength}`).toBeCloseTo(seen, 3);
        }
      }
    }
    // some of the rim light's red still comes through the head as light (half of it from round 83, a tenth
    // since round 123, under a larger key), less of its green and blue, and none of it as a highlight
    expect(shown(0, ENGLAND_1356.rimShadow, 0)[0]).toBeGreaterThan(0.05);
    expect(shown(0, ENGLAND_1356.rimShadow, 0)[0]).toBeLessThan(0.5);
    expect(shown(0, ENGLAND_1356.rimShadow, 2)[0]).toBeLessThan(0.6 * shown(0, ENGLAND_1356.rimShadow, 0)[0]);
    expect(shown(0, ENGLAND_1356.rimShadow, 0)[1]).toBe(0);
    // a light that throws no shadow (the fill, what chest and ground throw back) keeps its colour and its highlight
    for (const c of [0, 1, 2]) expect(shown(1, 0, c)).toEqual([1, 1]);
    // hair, beards and cloth are lit as they were, and so is Apoleia's skin (three.js' own loop)
    expect(compiled(of('real/bob01_cap.webp', true))).not.toContain('skinGloss');
    expect(compiled(of('real/plait01_rope.webp', false))).not.toContain('skinGloss');
    expect(compiled(of('real/skin_young_female.webp', false), APOLEIA)).toContain('#include <lights_fragment_begin>');
  });
  it('England\'s key light has a size, so that the shadows it throws have soft edges', () => {
    // a light without size throws shadows with hard edges, whatever throws them: the nose's shadow on the far
    // cheek was a dark wedge with a straight edge, a hood's a line across the forehead (until round 80; the
    // reference's shades all run out softly). A light with a size is seen from the head under an angle, and the
    // edge of a shadow is as broad as that angle times how far the thing that throws it stands off the skin.
    // The stage draws such a light as several lights spread over its disc, which share its energy
    const { shadow, lights } = ENGLAND_1356, from = lights.key.from;
    // a window or a lamp with a shade, not the sun (a quarter of a degree) and not the whole sky: at most a
    // window a metre and a half wide a metre from the head (round 123: 35 degrees; until then at most 20, under
    // which the shadow of a man's nose lay on his far cheek 9 L darker than on the reference's men)
    expect(shadow.spread).toBeGreaterThanOrEqual(6);
    expect(shadow.spread).toBeLessThanOrEqual(37);
    expect(shadow.lights).toBeGreaterThanOrEqual(6);
    // WebGL 2 promises 16 images to a material: the key's shadows, the rim's, the surface's image and its normals
    expect(shadow.lights + 1 + 2).toBeLessThanOrEqual(16);
    const places = keyPlaces(from, shadow.spread, shadow.lights);
    expect(places.length).toBe(shadow.lights);
    const unit = (v: readonly number[]) => { const l = Math.hypot(...v); return v.map(x => x / l); };
    const angle = (a: readonly number[], b: readonly number[]) => { const [p, q] = [unit(a), unit(b)]; return Math.acos(Math.min(1, p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]!)) * 180 / Math.PI; };
    const off = places.map(p => angle(p, from));
    // every light on the disc, as far from the head as the key; the disc filled to its rim, not a ring or a clump
    for (const [k, p] of places.entries()) {
      expect(Math.hypot(...p)).toBeCloseTo(Math.hypot(...from), 5);
      expect(off[k]!, `light ${k}`).toBeLessThanOrEqual(shadow.spread * 1.05);
    }
    expect(Math.max(...off)).toBeGreaterThan(0.85 * shadow.spread);
    expect(Math.min(...off)).toBeLessThan(0.4 * shadow.spread);
    // no two at one place (two shadows on each other are one hard edge again)
    for (let i = 0; i < places.length; i++) for (let j = 0; j < i; j++) expect(angle(places[i]!, places[j]!), `lights ${j} and ${i}`).toBeGreaterThan(0.25 * shadow.spread);
    // together they shine from where the key stands: the light's place, and with it the far cheek's shade, is
    // the profile's, whatever the number of lights
    const mean = [0, 1, 2].map(k => places.reduce((t, p) => t + p[k]!, 0));
    expect(angle(mean, from)).toBeLessThan(0.2);
    // a light without size, or drawn as one light, is the key itself; Apoleia's is such a light
    expect(keyPlaces(from, 0, 8)).toEqual([[...from]]);
    expect(keyPlaces(from, 10, 1)).toEqual([[...from]]);
    expect(APOLEIA.shadow).toEqual({ map: 512, strength: 0.7, radius: 1, spread: 0, lights: 1, reach: 0.9 });
    expect(keyPlaces(APOLEIA.lights.key.from, APOLEIA.shadow.spread, APOLEIA.shadow.lights)).toEqual([[-3.5, 4.5, 5.0]]);
  });

  it('a person of history is dressed as people of rank are, and who holds a kingdom wears a crown of gold', () => {
    // (round 144) Until then the game handed over every person as one of the common people, and England's table knew
    // one estate: Edward III stood in a villager's russet gown. A person of history is of a ruler's house; with a
    // kingdom or an empire among the realms held on the day the portrait wears a crown (src/people/panel.ts).
    expect(rankOfHistory([])).toEqual({ stand: 3, job: 'Adel' });
    expect(rankOfHistory([{ rank: 'duchy' }, { rank: 'prince_bishopric' }])).toEqual({ stand: 3, job: 'Adel' });
    expect(rankOfHistory([{ rank: 'county' }, { rank: 'kingdom' }])).toEqual({ stand: 4, job: 'Adel' });
    expect(rankOfHistory([{ rank: 'empire' }]).stand).toBe(4);
    // (a world server older than this round names no rank: no crown then)
    expect(rankOfHistory([{}]).stand).toBe(3);
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const sample: PortraitPerson[] = JSON.parse(readFileSync(here('sample_england.json'), 'utf8'));
    for (const given of sample.filter(p => p.age >= 24).slice(0, 4)) {
      // (each stand built once: the test asks for them some twenty times, and took 17 of its 20 seconds)
      const known = new Map<number, ReturnType<typeof b.build>>();
      const built = (stand: number) => known.get(stand) ?? known.set(stand, b.build({ ...given, ...(stand > 1 ? { stand, job: 'Adel' } : {}) })).get(stand)!;
      const metal = (stand: number) => built(stand).surfaces.filter(s => !s.tex && s.metal === 1);
      const at = `person ${given.pid}`;
      expect(metal(1), `${at}: the common people wear no metal`).toEqual([]);
      // the look's name is England's whatever the estate: the stage lights by it
      for (const stand of [1, 3, 4]) expect(profileOf(built(stand).look), `${at}, stand ${stand}`).toBe(ENGLAND_1356);
      // the crown: gold (the larger piece of metal: the gown's buttons are the other), stones and pearls, drawn as
      // the builder says: metal that shines, without an image and seen from outside only
      const king = built(4), gold = metal(4).sort((x, y) => y.pos.length - x.pos.length)[0]!;
      expect(gold.pos.length / 9, `${at}: the crown's gold`).toBeGreaterThan(2500);
      expect(surfaceKind(gold)).toBe('plain');
      const m = surfaceMaterials(gold, null, null, ENGLAND_1356)[0]!;
      expect([m.metalness, m.side, m.map], at).toEqual([1, FrontSide, null]);
      expect(m.roughness).toBeGreaterThan(0.2);
      expect(m.roughness).toBeLessThan(0.45);
      // (round 145: and the stones of the mantle's two brooches, each the upper part of a ball, 48 triangles)
      const stones = king.surfaces.filter(s => !s.tex && s.metal === 0 && s.rough < 0.5);
      expect(stones.map(s => s.pos.length / 9).sort((x, y) => y - x), `${at}: stones and pearls`).toEqual([24 * 64, 18 * 64, 2 * 48]);
      // (round 145) a mantle on the crowned head alone: its cloth and its fur, each cloth to the stage with an image
      // of its own, the fur's the lighter
      const mantle = (stand: number) => built(stand).surfaces.filter(s => /cloth_mantle/.test(s.tex)).sort((x, y) => x.tex.length - y.tex.length);
      expect(mantle(4).map(s => s.tex.replace(/^.*\/|\..*$/g, '')), `${at}: the mantle`).toEqual(['cloth_mantle', 'cloth_mantle_fur']);
      for (const s of mantle(4)) expect([surfaceKind(s), s.uv.length / 2, s.nrm.length / 3], `${at}: ${s.tex}`).toEqual(['cloth', s.pos.length / 3, s.pos.length / 3]);
      const light = (s: (typeof king.surfaces)[number]) => s.col.reduce((a, x) => a + x, 0) / s.col.length;
      expect(light(mantle(4)[1]!), `${at}: the fur against the cloth`).toBeGreaterThan(3 * light(mantle(4)[0]!));
      expect(mantle(3), `${at}: no mantle without a kingdom`).toEqual([]);
      // and nothing else on a crowned head
      expect(king.surfaces.filter(s => /cloth_(hood|veil|wimple|fillet|coif|hat)/.test(s.tex)), at).toEqual([]);
      // a person of rank without a crown: none, and a gown of another cloth than the common people's
      expect(metal(3).every(s => s.pos.length / 9 < 2500), `${at}: no crown without a kingdom`).toBe(true);
      // (round 150: the common people's gown is drawn with the wool's image, the court's with the silk's)
      // (round 156: at court the silk is plain or figured by the person's seed, a crowned head's always figured)
      const gown = (stand: number) => built(stand).surfaces.find(s => /cloth_cote(_silk(_figured)?)?\./.test(s.tex))!;
      const cloth = [1, 3, 4].map(stand => gown(stand).tex.replace(/^.*\/|\..*$/g, ''));
      expect([cloth[0], cloth[2]], `${at}: the gown's cloth`).toEqual(['cloth_cote', 'cloth_cote_silk_figured']);
      expect(['cloth_cote_silk', 'cloth_cote_silk_figured'], `${at}: the court's cloth`).toContain(cloth[1]);
      const red = (stand: number) => { const c = gown(stand).col; let r = 0, g = 0; for (let i = 0; i < c.length; i += 3) { r += c[i]!; g += c[i + 1]!; } return r / g; };
      expect(Math.abs(Math.log(red(3) / red(1))), `${at}: the court's cloth`).toBeGreaterThan(0.15);
    }
  });
});
