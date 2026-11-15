// The files of the portraits in the browser: the builder (WebAssembly), the head, the data files of the real look
// (about 4 MB, loaded once, when the first portrait is asked for), and the list of its images, which the stage
// loads one by one as portraits need them.
import { wasmPortraitBuilder, type PortraitBuilder } from './builder';

/** public/portrait/manifest.json (tools/portrait/build_portrait.ts writes it). */
export interface PortraitManifest { folder: string; data: { name: string; bytes: number }[]; images: string[] }

export interface PortraitAssets {
  builder: PortraitBuilder;
  /** The paths of the images there are, as the builder names them (folder/name). */
  images: Set<string>;
  /** The address of an image the builder names. */
  url(path: string): string;
}

async function bytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`portraits: ${url} answered ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

/** Loads the builder and everything it reads from `base` (the address of public/portrait), with the real look on. */
export async function loadPortraitAssets(base = '/portrait'): Promise<PortraitAssets> {
  const manifest: PortraitManifest = JSON.parse(new TextDecoder().decode(await bytes(`${base}/manifest.json`)));
  const [wasm, head, ...data] = await Promise.all([
    bytes(`${base}/sc_portrait.wasm`), bytes(`${base}/head.bin.zst`),
    ...manifest.data.map(f => bytes(`${base}/${manifest.folder}/${f.name}`)),
  ]);
  const builder = wasmPortraitBuilder(wasm);
  builder.head(head);
  manifest.data.forEach((f, i) => builder.file(`${manifest.folder}/${f.name}`, data[i]));
  const images = new Set(manifest.images.map(n => `${manifest.folder}/${n}`));
  for (const path of images) builder.image(path);
  builder.real(manifest.folder);
  return { builder, images, url: path => `${base}/${path}` };
}
