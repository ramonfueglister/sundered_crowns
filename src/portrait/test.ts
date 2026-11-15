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
// ?sample=england draws founders of the pool England's people come from instead of the twelve test people
// (tests/portrait/sample_england.json, written by portrait/examples/sample.rs): women and men of 8 to 68.
import people from '../../tests/portrait/people.json';
import england from '../../tests/portrait/sample_england.json';
import { loadPortraitAssets } from './assets';
import { profileOf } from './profile';
import { PortraitStage } from './stage';
import type { PortraitPerson } from './wire';

declare global { interface Window { portraitsDone?: boolean; portraitError?: string } }

async function main(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const [width, height] = (q.get('size') ?? '336x420').split('x').map(Number);
  const assets = await loadPortraitAssets();
  if (q.has('simple')) assets.builder.real('');
  const stage = new PortraitStage({ width, height, images: assets.images, url: assets.url });
  const wall = document.getElementById('wall')!;
  const origin = q.get('origin');
  const genes = (q.get('gene') ?? '').split(',').filter(Boolean).map(t => t.split(':').map(Number));
  const only = (q.get('only') ?? '').split(',').filter(Boolean).map(Number);
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
    const picture = document.createElement('canvas');
    picture.width = width; picture.height = height;
    picture.id = `p${person.pid}`;
    picture.title = `${person.pid}: ${portrait.look}, ${portrait.tris} triangles, built in ${(t1 - t0).toFixed(0)} ms, drawn in ${(performance.now() - t1).toFixed(0)} ms`;
    picture.getContext('2d')!.drawImage(stage.renderer.domElement, 0, 0);
    wall.append(picture);
    console.log(picture.title);
  }
  window.portraitsDone = true;
}

main().catch(e => { window.portraitError = String(e?.stack ?? e); console.error(e); });
