// The portrait builder: Apoleia's generator (portrait/, Rust) built to WebAssembly. It turns a person into the
// triangles of head and shoulders; stage.ts draws them.
import { decodePortrait, encodePerson, type Portrait, type PortraitPerson } from './wire';

export interface PortraitBuilder {
  /** The head: the bytes of public/portrait/head.bin.zst. Needed before the first portrait. */
  head(bytes: Uint8Array): void;
  /** A data file of the real look, by its path (folder/name). */
  file(path: string, bytes: Uint8Array): void;
  /** An image of the real look is there, by its path (the renderer loads it). */
  image(path: string): void;
  /** Switches the real look on (the folder its files were handed in under) or off (''): the simple, faceted look. */
  real(folder: string): void;
  /** The piece on the head every portrait wears from now on, by its key in portrait/src/dress.rs `HEADWEAR`
   *  ('': what each person's dress says), to look at one piece on many faces. */
  headwear(key: string): void;
  /** The portrait of a person at a level of detail 0..3 (1 in the game). */
  build(person: PortraitPerson, lod?: number): Portrait;
}

interface Exports {
  memory: WebAssembly.Memory;
  scp_alloc(len: number): number; scp_free(ptr: number, len: number): void;
  scp_head(ptr: number, len: number): number;
  scp_file(path: number, pathLen: number, ptr: number, len: number): number;
  scp_image(path: number, len: number): number;
  scp_real(folder: number, len: number): number;
  scp_headwear(key: number, len: number): number;
  scp_build(person: number, len: number): number;
  scp_out_ptr(): number; scp_out_len(): number;
}

/** The builder from the bytes of the WebAssembly file (public/portrait/sc_portrait.wasm, npm run portrait:build). */
export function wasmPortraitBuilder(wasm: Uint8Array): PortraitBuilder {
  const e = new WebAssembly.Instance(new WebAssembly.Module(wasm as BufferSource), {}).exports as unknown as Exports;
  const utf8 = new TextEncoder(), text = new TextDecoder();

  /** Copies the inputs into the instance, calls `f` with their addresses and lengths, and returns a copy of the result. */
  function call(inputs: Uint8Array[], f: (args: number[]) => number): Uint8Array {
    const held: [number, number][] = [], args: number[] = [];
    for (const b of inputs) {
      const p = e.scp_alloc(b.length);
      held.push([p, b.length]); args.push(p, b.length);
      new Uint8Array(e.memory.buffer, p, b.length).set(b); // the buffer is looked up anew: memory may have grown
    }
    const ok = f(args);
    for (const [p, n] of held) e.scp_free(p, n);
    const out = new Uint8Array(e.memory.buffer, e.scp_out_ptr(), e.scp_out_len()).slice();
    if (!ok) throw new Error(`portrait builder: ${text.decode(out)}`);
    return out;
  }

  return {
    head(bytes) { call([bytes], a => e.scp_head(a[0], a[1])); },
    file(path, bytes) { call([utf8.encode(path), bytes], a => e.scp_file(a[0], a[1], a[2], a[3])); },
    image(path) { call([utf8.encode(path)], a => e.scp_image(a[0], a[1])); },
    real(folder) { call([utf8.encode(folder)], a => e.scp_real(a[0], a[1])); },
    headwear(key) { call([utf8.encode(key)], a => e.scp_headwear(a[0], a[1])); },
    build(person, lod = 1) { return decodePortrait(call([encodePerson(person, lod)], a => e.scp_build(a[0], a[1]))); },
  };
}
