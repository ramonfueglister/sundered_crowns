// The portrait test page (portrait-test.html): the test people of tests/portrait/people.json, drawn one by one on
// the stage and laid out in a row of pictures. tools/portrait/compare.ts photographs it and holds each picture
// against Apoleia's (Godot). ?size=672x840 sets the size of a picture, ?simple the faceted look,
// ?origin=England moves every test person there (and with that into the dress of England 1356); ?female=1 or 0
// and ?age=12 make every test person a woman or a man, or of that age (to see one garment on many faces);
// ?gene=27:240,32:0 sets both alleles of genes by their number in portrait/src/look.rs GENES (27 hairL, 32 grey);
// ?only=930000,930003 draws these test people alone; ?turn=-1.3 turns every head that far (radians) instead of as
// its profile says, to see a face from the side; ?without=_cap. leaves out every surface whose image has that in its
// name, to see what lies under it.
import people from '../../tests/portrait/people.json';
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
  for (const given of people as PortraitPerson[]) {
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
