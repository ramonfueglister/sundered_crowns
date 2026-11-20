// The tables built ahead are zipped with Brotli (table.ts `TablesIndex.coding`): a fifth smaller than with gzip.
// Where the browser cannot unzip Brotli itself (DecompressionStream has no 'brotli' in Chrome 157; Firefox has it)
// a small decoder in WebAssembly is fetched once, the first time a table is read (about 100 KB zipped).
let native: boolean | undefined;
let wasm: Promise<{ decompress(b: Uint8Array): Uint8Array }> | undefined;

/** The bytes of a run zipped with Brotli, unzipped. */
export async function unbrotli(bytes: Uint8Array): Promise<Uint8Array> {
  if (native === undefined) {
    try {
      new DecompressionStream('brotli' as CompressionFormat);
      native = true;
    } catch {
      native = false;
    }
  }
  if (native)
    return new Uint8Array(
      await new Response(
        new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('brotli' as CompressionFormat)),
      ).arrayBuffer(),
    );
  return (await (wasm ??= import('brotli-dec-wasm').then((m) => m.default))).decompress(bytes);
}
