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
import { APOLEIA, ENGLAND_1356, profileOf } from '../src/portrait/profile';
import { decodePortrait, encodePerson, type Portrait, type PortraitPerson } from '../src/portrait/wire';
import { framing, keyPlaces } from '../src/portrait/stage';

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
    expect(encodePerson(people[0], 1).length).toBe(32 + 68 + 4 + Buffer.byteLength(people[0].job) + Buffer.byteLength(people[0].origin));
    expect(() => encodePerson({ ...people[0], dna: [1, 2, 3] }, 1)).toThrow(/68 bytes/);
    expect(() => decodePortrait(new Uint8Array(40))).toThrow();
  });

  it('people of England wear the dress of 1356, everyone else Apoleia\'s', () => {
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const list = portraitManifest(), images = new Set(list.images.map(n => `${list.folder}/${n}`));
    for (const p of people) {
      const roman = b.build(p), english = b.build({ ...p, origin: 'England' });
      expect(roman.look.includes('/'), `person ${p.pid}`).toBe(false);
      expect(profileOf(roman.look)).toBe(APOLEIA);
      expect(english.look.startsWith('england1356/'), `person ${p.pid}`).toBe(true);
      expect(profileOf(english.look)).toBe(ENGLAND_1356);
      const worn = english.surfaces.map(s => s.tex);
      expect(worn.some(t => t.includes('/cloth_cote.')), `person ${p.pid} wears the gown`).toBe(true);
      expect(worn.some(t => t.includes('/cloth_tunic.') || t.includes('/cloth_veil.')), `person ${p.pid} wears nothing Roman`).toBe(false);
      for (const t of worn) if (t) expect(images.has(t), `${t} is in the repository`).toBe(true);
      // women from the age of the veil wear it, men never
      expect(worn.some(t => t.includes('/cloth_veil_linen.'))).toBe(p.female && p.age >= 20);
      const plaited = p.female && p.age >= 7 && p.age < 20;
      expect(worn.some(t => t.includes('/plait01_cap.')), `person ${p.pid}: plaits before the veil`).toBe(plaited);
      // the plaits themselves are round strands, a surface of their own (round 86)
      expect(worn.some(t => t.includes('/plait01_rope.')), `person ${p.pid}: the plaits' strands`).toBe(plaited);
      // hair is locks (a man's and a boy's since round 87, a girl's head above her plaits since round 88): one
      // surface of arched bands, seen from both sides, drawn with the one image of England's locks, over the
      // painted layer of the cut. No cards of England's hair are left
      const locks = english.surfaces.filter(s => s.tex.includes('/hair1356_locks.'));
      expect(locks.length, `person ${p.pid}: locks where there is hair`).toBe(worn.some(t => /\/(bob0\d|plait01)_cap\./.test(t)) ? 1 : 0);
      expect(locks.every(s => s.double && surfaceKind(s) === 'rope'), `person ${p.pid}: locks are open bands of solid hair`).toBe(true);
      expect(worn.some(t => /\/bob0\d_cap\./.test(t)) && p.female, `person ${p.pid}: a woman wears no man's cut`).toBe(false);
      expect(worn.some(t => /\/(bob0\d|plait01)\./.test(t)), `person ${p.pid}: no cards of England's hair`).toBe(false);
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
    // England's beards are their painted layer alone, with no hair cards over it (since round 53). Until round 80
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
    for (const p of sample) {
      // one standard deviation round the mean of real ones, for children too (a child's iris is nearly grown)
      for (const mm of irises(p)) {
        expect(mm, `person ${p.pid}`).toBeGreaterThan(11.71 - 0.42);
        expect(mm, `person ${p.pid}`).toBeLessThan(11.71 + 0.42);
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
    const offs = (p: PortraitPerson, profile = ENGLAND_1356): [number, number][] => {
      const built = b.build(p), ball = built.surfaces.find(s => surfaceKind(s) === 'eyeball')!;
      const f = framing(built, profile), [cs, sn] = [Math.cos(profile.turn), Math.sin(profile.turn)];
      // a point or a direction of the portrait as the stage turns it about the upright axis through the head
      const turned = (q: number[], point: boolean): number[] => {
        const [x, z] = [q[0]! - (point ? built.cx : 0), q[2]! - (point ? built.cz : 0)];
        return [x * cs + z * sn + (point ? built.cx : 0), q[1]!, -x * sn + z * cs + (point ? built.cz : 0)];
      };
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
    for (const p of sample) {
      for (const [beside, above] of offs(p)) {
        expect(Math.abs(beside), `person ${p.pid}: beside the camera`).toBeLessThan(1.5);
        expect(Math.abs(above), `person ${p.pid}: above the camera`).toBeLessThan(1.5);
      }
    }
    // on a stage that turns the person the other way the same eyes look past the camera by twice the turn
    const other = offs(sample[6]!, { ...ENGLAND_1356, turn: -ENGLAND_1356.turn });
    for (const [beside] of other) expect(Math.abs(beside)).toBeGreaterThan(20);
    // and a Roman looks straight ahead of the head, past the viewer by the turn of Apoleia's stage
    for (const [beside] of offs({ ...sample[6]!, origin: 'Italia' }, APOLEIA)) expect(Math.abs(Math.abs(beside) - Math.abs(APOLEIA.turn) * 180 / Math.PI)).toBeLessThan(3);
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
        if (surfaceKind(s) !== 'cloth') continue;
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
        let neckline = -Infinity;
        for (let v = 0; v < gown.pos.length / 3; v++) if (Math.abs(gown.pos[v * 3]!) < 0.15 && gown.pos[v * 3 + 2]! > 0.5) neckline = Math.max(neckline, gown.pos[v * 3 + 1]!);
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
    // 0.36 to 0.59 with the lash line, 0.73 to 0.83 without (the shade of the fold alone)
    const b = loadPortraitBuilder(PORTRAIT_TEST_WASM);
    const sample: PortraitPerson[] = JSON.parse(readFileSync(here('sample_england.json'), 'utf8'));
    const edgeToLid = (p: Portrait): number => {
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
          if (d < 1.15) { sums.edge += light; sums.edges++; } else if (d > 1.45 && d < 1.9) { sums.lid += light; sums.lids++; }
        }
      }
      expect(sums.edges).toBeGreaterThan(300);
      expect(sums.lids).toBeGreaterThan(300);
      return sums.edge / sums.edges / (sums.lid / sums.lids);
    };
    for (const p of sample) expect(edgeToLid(b.build(p)), `person ${p.pid}`).toBeLessThan(0.65);
    // and everyone else's lids are Apoleia's
    for (const p of people) expect(edgeToLid(b.build(p)), `person ${p.pid}`).toBeGreaterThan(0.7);
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
      // 1.6): the line between the lips reads 50 L under the lit cheek (before 54, the reference's 41 to 47)
      expect(lip[1]! / lip[0]! / (all[1]! / all[0]!), `person ${p.pid}`).toBeGreaterThan(0.65);
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
    expect(eye).toContain(`mix( ${ENGLAND_1356.eye!.iris.toFixed(3)}, ${ENGLAND_1356.eye!.white.toFixed(3)}, eyeWhite )`);
    // the white of the eye lighter, the iris darker than the image gives them
    expect(ENGLAND_1356.eye!.white).toBeGreaterThan(1);
    expect(ENGLAND_1356.eye!.iris).toBeLessThan(1);
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
  it('a lock of hair is solid, open below, and frayed where its image is empty', () => {
    // Until round 87 the hair of a man's head was cards: thin sheets blended over each other, lit as one smooth
    // dome (a card's direction was the one from the head's centre), throwing no shadow on the forehead. Now it
    // is locks: arched bands, each lit by its own form, in the stage's shadows as a plait's strands are. A band
    // is open below, so it is drawn from both sides; its hairs end one after the other, so the image is empty
    // between them there, and where the image is empty nothing is drawn and nothing throws a shadow
    const of = (tex: string, double: boolean) => ({ rough: 0.6, metal: 0, double, tex, nmap: '', pos: new Float32Array(9), col: new Float32Array(9).fill(0.5), uv: new Float32Array(6), nrm: new Float32Array(9) });
    const locks = of('real/hair1356_locks.webp', true), plait = of('real/plait01_rope.webp', false);
    expect(surfaceKind(locks)).toBe('rope');
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
    // children, 6.2 % on the reference's woman; now 8.3 %)
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
    // normal (36 until round 85), and half of the head's shadow is taken off it (round 83)
    expect(facing(rim, Math.PI / 2)).toBeGreaterThan(0.6);
    expect(ENGLAND_1356.rimShadow).toBeGreaterThan(0.3);
    expect(ENGLAND_1356.rimShadow).toBeLessThan(0.7);
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
    expect(fill.energy).toBeGreaterThan(0.13 * key.energy);
    expect(fill.energy).toBeGreaterThan(bounce.energy);
    // each of the two is a light, and both together far weaker than the key: the face keeps its shaded half
    for (const l of [fill, bounce]) expect(l.energy).toBeGreaterThan(0.05 * key.energy);
    expect(fill.energy + bounce.energy).toBeGreaterThan(0.15 * key.energy);
    expect(fill.energy + bounce.energy).toBeLessThan(0.25 * key.energy);
    expect(ENGLAND_1356.sky.energy).toBeLessThan(0.15 * key.energy);
    // Apoleia's stage is as it was
    expect(APOLEIA.lights.key.from).toEqual([-3.5, 4.5, 5.0]);
    expect(APOLEIA.lights.fill).toEqual({ from: [3.0, -1.0, 5.0], colour: '#ffe2c8', energy: 0.35 });
    expect(APOLEIA.lights.bounce.energy).toBe(0);
    expect(APOLEIA.rimShadow).toBe(0);
    expect(APOLEIA.exposure).toBe(0.92);
  });
  it('England\'s key light has a size, so that the shadows it throws have soft edges', () => {
    // a light without size throws shadows with hard edges, whatever throws them: the nose's shadow on the far
    // cheek was a dark wedge with a straight edge, a hood's a line across the forehead (until round 80; the
    // reference's shades all run out softly). A light with a size is seen from the head under an angle, and the
    // edge of a shadow is as broad as that angle times how far the thing that throws it stands off the skin.
    // The stage draws such a light as several lights spread over its disc, which share its energy
    const { shadow, lights } = ENGLAND_1356, from = lights.key.from;
    // a window or a lamp with a shade, not the sun (a quarter of a degree) and not the whole sky
    expect(shadow.spread).toBeGreaterThanOrEqual(6);
    expect(shadow.spread).toBeLessThanOrEqual(20);
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
    expect(APOLEIA.shadow).toEqual({ map: 512, strength: 0.7, radius: 1, spread: 0, lights: 1 });
    expect(keyPlaces(APOLEIA.lights.key.from, APOLEIA.shadow.spread, APOLEIA.shadow.lights)).toEqual([[-3.5, 4.5, 5.0]]);
  });
});
