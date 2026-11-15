// The portrait test page (portrait-test.html): the test people of tests/portrait/people.json, drawn one by one on
// the stage and laid out in a row of pictures. tools/portrait/compare.ts photographs it and holds each picture
// against Apoleia's (Godot). ?size=672x840 sets the size of a picture, ?simple the faceted look.
import people from '../../tests/portrait/people.json';
import { loadPortraitAssets } from './assets';
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
  for (const person of people as PortraitPerson[]) {
    const t0 = performance.now();
    const portrait = assets.builder.build(person);
    const t1 = performance.now();
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
