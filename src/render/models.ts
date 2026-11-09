// The Blender-built map props (trees, houses, churches, castles, soldiers, ships): loader and format checks.
// The files are made by tools/models/build_models.py (see tools/models/README.md):
//   models.bin  = every vertex of every mesh as float32 [px,py,pz, nx,ny,nz, r,g,b, tint] (40 bytes), followed by
//                 all indices as uint32, local to their mesh (0..vertexCount-1); index data starts at totalVertices*40
//   models.json = { version: 1, stride: 40, totalVertices, totalIndices,
//                   meshes: { name: { vertexOffset, vertexCount, indexOffset, indexCount, height, radius } } }
// Model space: z up, x east, y north, origin at the ground centre (ships: the waterline); bows, the cannon's muzzle and
// all figures face +y. tint = 1 marks the parts recoloured with the owner's colour.

export interface ModelMesh { vertexOffset: number; vertexCount: number; indexOffset: number; indexCount: number; height: number; radius: number }
export interface ModelSet { meshes: Record<string, ModelMesh>; vertices: Float32Array; indices: Uint32Array }

/** bytes per vertex and floats per vertex */
export const MODEL_STRIDE = 40;
export const MODEL_FLOATS = 10;

/** every mesh the game uses, with its triangle budget */
export const MODEL_BUDGETS = {
  tree_conifer_a: 160, tree_conifer_b: 160, tree_broadleaf_a: 160, tree_broadleaf_b: 160, tree_palm: 160, bush: 160,
  house_timber: 300, house_stone: 300, house_mediterranean: 300, house_steppe_yurt: 300,
  farm_barn: 1500, windmill: 1500, church_gothic: 1500, mosque: 1500, castle: 1500, town_wall_tower: 1500,
  tent: 200,
  soldier_infantry: 700, soldier_pikeman: 700, soldier_archer: 700, soldier_musketeer: 700, soldier_cavalry: 1400,
  cannon: 600, banner_standard: 700,
  ship_cog: 1600, ship_galley: 1600, ship_carrack: 1600, ship_ship_of_the_line: 1600,
} as const;
export type ModelName = keyof typeof MODEL_BUDGETS;
export const MODEL_NAMES = Object.keys(MODEL_BUDGETS) as ModelName[];

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** check the header and the buffer and wrap them as typed arrays; throws an Error that says what is wrong */
export function parseModels(meta: unknown, buf: ArrayBuffer): ModelSet {
  const m = meta as { version?: unknown; stride?: unknown; totalVertices?: unknown; totalIndices?: unknown; meshes?: unknown };
  if (!m || typeof m !== 'object') throw new Error('models.json: not an object');
  if (m.version !== 1) throw new Error(`models.json: unsupported version ${String(m.version)}`);
  if (m.stride !== MODEL_STRIDE) throw new Error(`models.json: stride ${String(m.stride)}, expected ${MODEL_STRIDE}`);
  const nv = m.totalVertices, ni = m.totalIndices;
  if (!isCount(nv) || !isCount(ni) || nv === 0 || ni === 0) throw new Error('models.json: bad totalVertices/totalIndices');
  const want = nv * MODEL_STRIDE + ni * 4;
  if (buf.byteLength !== want) throw new Error(`models.bin: ${buf.byteLength} bytes, expected ${want} (${nv} vertices, ${ni} indices)`);
  if (!m.meshes || typeof m.meshes !== 'object') throw new Error('models.json: no meshes');
  const vertices = new Float32Array(buf, 0, nv * MODEL_FLOATS);
  const indices = new Uint32Array(buf, nv * MODEL_STRIDE, ni);
  const meshes: Record<string, ModelMesh> = {};
  for (const [name, raw] of Object.entries(m.meshes as Record<string, Record<string, unknown>>)) {
    const { vertexOffset: vo, vertexCount: vc, indexOffset: io, indexCount: ic, height, radius } = raw ?? {};
    if (!isCount(vo) || !isCount(vc) || !isCount(io) || !isCount(ic)) throw new Error(`models.json: ${name}: bad offsets or counts`);
    if (vc === 0 || ic === 0 || ic % 3 !== 0) throw new Error(`models.json: ${name}: empty or not triangles`);
    if (vo + vc > nv || io + ic > ni) throw new Error(`models.json: ${name}: range outside the buffer`);
    if (typeof height !== 'number' || typeof radius !== 'number' || !Number.isFinite(height) || !Number.isFinite(radius) || radius < 0)
      throw new Error(`models.json: ${name}: bad height/radius`);
    for (let i = io; i < io + ic; i++) if (indices[i] >= vc) throw new Error(`models.bin: ${name}: index ${indices[i]} >= ${vc} vertices`);
    meshes[name] = { vertexOffset: vo, vertexCount: vc, indexOffset: io, indexCount: ic, height, radius };
  }
  return { meshes, vertices, indices };
}

/** fetch and check public/models/models.json and models.bin (base: the app's base path, e.g. import.meta.env.BASE_URL) */
export async function loadModels(base = '/'): Promise<ModelSet> {
  const root = base.endsWith('/') ? base : base + '/';
  const [j, b] = await Promise.all([fetch(root + 'models/models.json'), fetch(root + 'models/models.bin')]);
  if (!j.ok) throw new Error(`models.json: HTTP ${j.status}`);
  if (!b.ok) throw new Error(`models.bin: HTTP ${b.status}`);
  return parseModels(await j.json(), await b.arrayBuffer());
}
