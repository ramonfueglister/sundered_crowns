// Binary snapshot of a WorldState: a JSON skeleton in which every typed array is replaced by a reference into a
// binary section. Encoding is deterministic (same state → same bytes), so the hash of the bytes identifies a state
// (the world server compares it after replaying its command log).
import type { WorldState } from './state';
import { STATE_VERSION } from './state';

type TA = Float64Array | Float32Array | Int32Array | Int16Array | Int8Array | Uint32Array | Uint16Array | Uint8Array;
const TYPES: Record<string, new (b: ArrayBuffer, o: number, n: number) => TA> = {
  Float64Array, Float32Array, Int32Array, Int16Array, Int8Array, Uint32Array, Uint16Array, Uint8Array,
};
const MAGIC = 0x53435731; // "SCW1"

export function encodeState(s: WorldState): Uint8Array {
  const blobs: TA[] = []; let off = 0;
  const skel = JSON.stringify(s, (_k, v) => {
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
      const a = v as TA; const align = a.BYTES_PER_ELEMENT;
      off = Math.ceil(off / align) * align;
      const ref = { $ta: a.constructor.name, off, n: a.length };
      blobs.push(a); off += a.byteLength;
      return ref;
    }
    return v;
  });
  const json = new TextEncoder().encode(skel);
  const head = 12, bodyStart = Math.ceil((head + json.length) / 8) * 8;
  const out = new Uint8Array(bodyStart + off);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, json.length, true); dv.setUint32(8, off, true);
  out.set(json, head);
  let p = 0;
  for (const a of blobs) {
    p = Math.ceil(p / a.BYTES_PER_ELEMENT) * a.BYTES_PER_ELEMENT;
    out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), bodyStart + p); p += a.byteLength;
  }
  return out;
}

export function decodeState(bytes: Uint8Array): WorldState {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('not a world snapshot');
  const jl = dv.getUint32(4, true), bl = dv.getUint32(8, true);
  const bodyStart = Math.ceil((12 + jl) / 8) * 8;
  if (bytes.length < bodyStart + bl) throw new Error('snapshot is truncated');
  // an aligned copy (a Node Buffer's slice() would be a view into its shared pool)
  const body = new Uint8Array(bytes.subarray(bodyStart, bodyStart + bl)).buffer;
  const skel = new TextDecoder().decode(bytes.subarray(12, 12 + jl));
  const s = JSON.parse(skel, (_k, v) => {
    if (v && typeof v === 'object' && typeof v.$ta === 'string') {
      const C = TYPES[v.$ta]; if (!C) throw new Error(`unknown array type ${v.$ta}`);
      return new C(body, v.off, v.n);
    }
    return v;
  }) as WorldState;
  // an older state is returned as it is; upgradeState (src/sim/upgrade.ts) brings it up to date
  if (!(s.v >= 1 && s.v <= STATE_VERSION)) throw new Error(`snapshot version ${s.v}, this build reads up to ${STATE_VERSION}`);
  return s;
}

/** FNV-1a over the encoded state, as 8 hex digits. */
export function hashState(s: WorldState): string {
  const b = encodeState(s); let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
