// Reads a landmark model exported by tools/blender (binary glTF with positions, flat normals and COLOR_0, Y up, no
// materials) into a Batch, so that it is placed like every hand-built model. Only what those exports use is read:
// one mesh, one primitive, triangles, indexed. No DOM, no renderer, so it runs in the world's workers.
import { Batch, type RGB, type V3 } from '../../lookprobe/batch';

interface Accessor {
  bufferView: number;
  componentType: number;
  count: number;
  type: string;
  byteOffset?: number;
  normalized?: boolean;
}
interface View {
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}
interface Gltf {
  meshes: { primitives: { attributes: Record<string, number>; indices?: number; mode?: number }[] }[];
  accessors: Accessor[];
  bufferViews: View[];
}

const FLOAT = 5126,
  UBYTE = 5121,
  USHORT = 5123,
  UINT = 5125;
const SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** The numbers of an accessor, normalised integers brought to 0 … 1. */
function read(gltf: Gltf, bin: DataView, index: number): Float64Array {
  const a = gltf.accessors[index],
    v = gltf.bufferViews[a.bufferView],
    n = SIZE[a.type],
    out = new Float64Array(a.count * n);
  const width = a.componentType === FLOAT || a.componentType === UINT ? 4 : a.componentType === USHORT ? 2 : 1;
  const stride = v.byteStride ?? n * width,
    base = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  for (let i = 0; i < a.count; i++)
    for (let k = 0; k < n; k++) {
      const at = base + i * stride + k * width;
      let x: number;
      if (a.componentType === FLOAT) x = bin.getFloat32(at, true);
      else if (a.componentType === UINT) x = bin.getUint32(at, true);
      else if (a.componentType === USHORT) x = bin.getUint16(at, true) / (a.normalized ? 65535 : 1);
      else if (a.componentType === UBYTE) x = bin.getUint8(at) / (a.normalized ? 255 : 1);
      else throw new Error(`glb: component type ${a.componentType} not supported`);
      out[i * n + k] = x;
    }
  return out;
}

/** The triangles of a GLB as a Batch: every corner keeps its own colour, the normal comes from the file. */
export function glbToBatch(buffer: ArrayBuffer): Batch {
  const head = new DataView(buffer);
  if (head.getUint32(0, true) !== 0x46546c67 || head.getUint32(4, true) !== 2)
    throw new Error('glb: not a binary glTF 2 file');
  let at = 12,
    json: Gltf | null = null,
    bin: DataView | null = null;
  while (at < buffer.byteLength) {
    const len = head.getUint32(at, true),
      kind = head.getUint32(at + 4, true);
    if (kind === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, at + 8, len))) as Gltf;
    else if (kind === 0x004e4942) bin = new DataView(buffer, at + 8, len);
    at += 8 + len;
  }
  if (!json || !bin) throw new Error('glb: JSON or BIN chunk missing');
  if (json.meshes.length !== 1 || json.meshes[0].primitives.length !== 1)
    throw new Error('glb: expected one mesh with one primitive');
  const prim = json.meshes[0].primitives[0];
  if ((prim.mode ?? 4) !== 4 || prim.indices === undefined) throw new Error('glb: expected indexed triangles');
  const pos = read(json, bin, prim.attributes.POSITION),
    nor = read(json, bin, prim.attributes.NORMAL),
    col = read(json, bin, prim.attributes.COLOR_0),
    idx = read(json, bin, prim.indices);
  const cn = SIZE[json.accessors[prim.attributes.COLOR_0].type];
  const p = (i: number): V3 => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  const c = (i: number): RGB => [col[i * cn], col[i * cn + 1], col[i * cn + 2]];
  const b = new Batch();
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const i = idx[t],
      j = idx[t + 1],
      k = idx[t + 2];
    b.tri(p(i), p(j), p(k), c(i), c(j), c(k), [nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]]);
  }
  return b;
}
