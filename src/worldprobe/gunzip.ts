// The world's binary files are gzipped on disk (public/map, public/data); a server may already have taken that layer
// off for the browser (Content-Encoding: gzip), so the bytes are looked at before they are unpacked.
import { gunzip } from 'fflate';

/** Gunzip unless the server already removed the gzip layer (Content-Encoding). */
export async function maybeGunzip(b: Uint8Array): Promise<Uint8Array> {
  if (b.length < 2 || b[0] !== 0x1f || b[1] !== 0x8b) return b;
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const s = new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Uint8Array(await new Response(s).arrayBuffer());
    } catch {
      /* fall back to fflate */
    }
  }
  return new Promise((res, rej) => gunzip(b, (err, out) => (err ? rej(err) : res(out))));
}
