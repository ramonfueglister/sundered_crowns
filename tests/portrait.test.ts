// The portraits: Apoleia's generator, carried over unchanged (portrait/, docs/PORTRAITS.md). The test people and
// their portraits as numbers (tests/portrait/golden.json) were written by Apoleia's own crate at commit c30a107;
// the builder of the game has to give the same, as WebAssembly.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PORTRAIT_PUBLIC, PORTRAIT_TEST_WASM, portraitManifest } from '../tools/portrait/build_portrait';
import { loadPortraitBuilder } from '../tools/portrait/load';
import { ShaderLib } from 'three';
import { portraitSkinTone, skinTone, surfaceKind, surfaceMaterials } from '../src/portrait/materials';
import { APOLEIA, ENGLAND_1356, profileOf } from '../src/portrait/profile';
import { decodePortrait, encodePerson, type Portrait, type PortraitPerson } from '../src/portrait/wire';

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

describe('portraits', () => {
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
      expect(worn.some(t => t.includes('/plait01.')), `person ${p.pid}: plaits before the veil`).toBe(p.female && p.age >= 7 && p.age < 20);
      // everyone wears the brows that sit level on these heads (the finer ones tried for women sit slanted: a frown)
      expect(worn.some(t => t.includes('/eyebrow001.')), `person ${p.pid}: brows`).toBe(true);
      expect(worn.some(t => /\/eyebrow0(02|05|11)\./.test(t)), `person ${p.pid}: no slanted brows`).toBe(false);
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
      // a flesh colour as the skin's own, not a painted red (green to red 0.72 to 1.03 of the skin's as a whole;
      // until round 71 0.87 to 1.03: the lips are redder since, by the hue read on the reference's lips; the
      // lips' blood alone would be 0.5 to 0.6); and lighter than the skin (1.12 to 1.41 of its red): the strip
      // stands in the lips' shade, where the stage has no light that comes through flesh, and is as dark as the
      // line of a mouth only so
      expect(lip[1]! / lip[0]! / (all[1]! / all[0]!), `person ${p.pid}`).toBeGreaterThan(0.65);
      expect(lip[1]! / lip[0]! / (all[1]! / all[0]!), `person ${p.pid}`).toBeLessThan(1.1);
      expect(lip[0]! / all[0]!, `person ${p.pid}`).toBeGreaterThan(1.05);
      expect(lip[0]! / all[0]!, `person ${p.pid}`).toBeLessThan(1.45);
      tones.push([all[0]!, lip[0]!]);
    }
    // the lips go with the skin: fairer skin, fairer lips, not one red for everyone (0.85 over the sample)
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
    expect(compiled('real/bob01.webp', true)).toContain('hairStrand');
    expect(compiled('real/bob01_cap.webp', true)).toContain('wrapBy');
    // Apoleia's eye is left as it is
    expect(APOLEIA.eye).toBeNull();
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
    const { key, rim, fill } = ENGLAND_1356.lights;
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
    const far = ENGLAND_1356.turn - 0.5 * Math.sign(key.from[0]);
    const rimOn = (rim.from[0] * Math.sin(far) + rim.from[2] * Math.cos(far)) / Math.hypot(...rim.from);
    expect(rimOn).toBeLessThan(0.1);
    // the light that fills the shade is far weaker than the key
    expect(fill.energy).toBeLessThan(0.15 * key.energy);
    expect(ENGLAND_1356.sky.energy).toBeLessThan(0.15 * key.energy);
    // Apoleia's stage is as it was
    expect(APOLEIA.lights.key.from).toEqual([-3.5, 4.5, 5.0]);
    expect(APOLEIA.exposure).toBe(0.92);
  });
});
