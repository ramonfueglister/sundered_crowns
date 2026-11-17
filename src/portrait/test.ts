// The portrait test page (portrait-test.html): the test people of tests/portrait/people.json, drawn one by one on
// the stage and laid out in a row of pictures. tools/portrait/compare.ts photographs it and holds each picture
// against Apoleia's (Godot). ?size=672x840 sets the size of a picture, ?simple the faceted look,
// ?origin=England moves every test person there (and with that into the dress of England 1356); ?female=1 or 0
// and ?age=12 make every test person a woman or a man, or of that age (to see one garment on many faces);
// ?gene=27:240,32:0 sets both alleles of genes by their number in portrait/src/look.rs GENES (27 hairL, 32 grey);
// ?only=930000,930003 draws these test people alone; ?turn=-1.3 turns every head that far (radians) instead of as
// its profile says, to see a face from the side; ?without=_cap. leaves out every surface whose image has that in its
// name, to see what lies under it; ?set=exposure:0.5,skin.colour:1.1,skin.tint.1:0.75,sky.top:ffe9d6 sets values
// of the stage profile by their path (a number, or a colour as six hex digits), to try them without a build.
// ?at=0.835:0.5168,0.9031:0.5168 writes where points of the skin's image (u:v) lie in each picture, into the
// picture's data-at as x:y in pixels, for tools that measure a picture at the face's landmarks
// (tools/portrait/face_colour.mjs).
// ?sample=england draws founders of the pool England's people come from instead of the twelve test people
// (tests/portrait/sample_england.json, written by portrait/examples/sample.rs): women and men of 8 to 68.
// ?headwear=bascinet puts that piece on every head whose dress has a table (with ?origin=England), whatever the
// table says: helm_great, bascinet, mail_coif, crown, coif_linen, hat_felt, hat_straw (portrait/src/dress.rs).
import people from '../../tests/portrait/people.json';
import england from '../../tests/portrait/sample_england.json';
import { loadPortraitAssets } from './assets';
import { profileOf } from './profile';
import { PortraitStage } from './stage';
import { surfaceKind } from './materials';
import type { Portrait, PortraitPerson } from './wire';

declare global { interface Window { portraitsDone?: boolean; portraitError?: string } }

/** Where points of the skin's image lie in the picture drawn last: for each the corner of the skin nearest to it
 *  on the image, as "x:y" in pixels. */
function placesOf(portrait: Portrait, at: number[][], stage: PortraitStage): string {
  const skin = portrait.surfaces.filter(s => surfaceKind(s) === 'skin' && s.tex.includes('skin')).sort((a, b) => b.pos.length - a.pos.length)[0];
  if (!skin) throw new Error('?at: the portrait has no skin with an image');
  return at.map(([u, v]) => {
    let best = 0, least = Infinity;
    for (let k = 0; k < skin.uv.length / 2; k++) {
      const d = (skin.uv[2 * k] - u) ** 2 + (skin.uv[2 * k + 1] - v) ** 2;
      if (d < least) { least = d; best = k; }
    }
    if (least > 1e-6) throw new Error(`?at: no corner of the skin at ${u}:${v}`);
    return stage.place(skin.pos[3 * best], skin.pos[3 * best + 1], skin.pos[3 * best + 2]).map(x => x.toFixed(1)).join(':');
  }).join(',');
}

async function main(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const [width, height] = (q.get('size') ?? '336x420').split('x').map(Number);
  const assets = await loadPortraitAssets();
  if (q.has('simple')) assets.builder.real('');
  assets.builder.headwear(q.get('headwear') ?? '');
  const stage = new PortraitStage({ width, height, images: assets.images, url: assets.url });
  const wall = document.getElementById('wall')!;
  const origin = q.get('origin');
  const genes = (q.get('gene') ?? '').split(',').filter(Boolean).map(t => t.split(':').map(Number));
  const only = (q.get('only') ?? '').split(',').filter(Boolean).map(Number);
  const at = (q.get('at') ?? '').split(',').filter(Boolean).map(t => t.split(':').map(Number));
  for (const given of (q.get('sample') === 'england' ? england : people) as PortraitPerson[]) {
    if (only.length && !only.includes(given.pid)) continue;
    const person: PortraitPerson = {
      ...given,
      ...(origin ? { origin } : {}),
      ...(q.has('female') ? { female: q.get('female') === '1' } : {}),
      ...(q.has('age') ? { age: Number(q.get('age')) } : {}),
    };
    if (genes.length) {
      const dna = Array.from(person.dna);
      for (const [gene, value] of genes) dna[gene] = dna[gene + dna.length / 2] = value;
      person.dna = dna;
    }
    const t0 = performance.now();
    const portrait = assets.builder.build(person);
    const t1 = performance.now();
    if (q.has('turn')) profileOf(portrait.look).turn = Number(q.get('turn'));
    for (const pair of (q.get('set') ?? '').split(',').filter(Boolean)) {
      const [path, value] = pair.split(':');
      const keys = path.split('.');
      let at = profileOf(portrait.look) as unknown as Record<string, unknown>;
      for (const key of keys.slice(0, -1)) at = at[key] as Record<string, unknown>;
      const last = keys[keys.length - 1];
      if (!at || !(last in at)) throw new Error(`?set: the profile has no ${path}`);
      at[last] = typeof at[last] === 'string' ? `#${value}` : Number(value);
    }
    const without = q.get('without');
    if (without) portrait.surfaces = portrait.surfaces.filter(s => !s.tex.includes(without));
    await stage.draw(portrait);
    const places = at.length ? placesOf(portrait, at, stage) : '';
    const picture = document.createElement('canvas');
    picture.width = width; picture.height = height;
    picture.id = `p${person.pid}`;
    picture.title = `${person.pid}: ${portrait.look}, ${portrait.tris} triangles, built in ${(t1 - t0).toFixed(0)} ms, drawn in ${(performance.now() - t1).toFixed(0)} ms`;
    picture.getContext('2d')!.drawImage(stage.renderer.domElement, 0, 0);
    if (places) picture.dataset.at = places;
    wall.append(picture);
    console.log(picture.title);
  }
  window.portraitsDone = true;
}

main().catch(e => { window.portraitError = String(e?.stack ?? e); console.error(e); });
