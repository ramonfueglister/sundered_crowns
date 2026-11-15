// Node helpers: the portrait builder with the head and the files of the real look from public/portrait (tests, tools).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { wasmPortraitBuilder, type PortraitBuilder } from '../../src/portrait/builder';
import { PORTRAIT_PUBLIC, portraitManifest } from './build_portrait';

/** A builder from a WebAssembly file, with the head loaded and, if `real`, the real look switched on. */
export function loadPortraitBuilder(wasm: string, real = true): PortraitBuilder {
  const b = wasmPortraitBuilder(readFileSync(wasm));
  b.head(readFileSync(resolve(PORTRAIT_PUBLIC, 'head.bin.zst')));
  if (real) {
    const m = portraitManifest();
    for (const f of m.data) b.file(`${m.folder}/${f.name}`, readFileSync(resolve(PORTRAIT_PUBLIC, m.folder, f.name)));
    for (const name of m.images) b.image(`${m.folder}/${name}`);
    b.real(m.folder);
  }
  return b;
}
