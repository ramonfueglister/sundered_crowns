// Paris probe (PROTOTYPE, 20 Nov 2026): blocks of Paris houses (traditions/paris.ts) round a market square with
// lanes between them, on the look probe's stage, to be measured against Ramon's reference picture of the Île de la
// Cité of that day (tools/lookprobe/gauntlet_paris.py). Every house faces its lane; the yards inside the blocks get
// grass and a tree now and then; the square gets market stalls and trees. The layout is the probe's, by assumption.
import * as THREE from 'three/webgpu';
import {
  type Column,
  type GroundCell,
  PARIS,
  type Tradition,
  fineGround,
  fineHouse,
  jetty,
  waterColourAt,
  waterFlecks,
} from '../buildings';
import { Batch, type RGB, type Rnd, mix, rgb, seeded, shade } from './batch';
import { boat } from './blocks';
import { LAND_Y, N, SEA_Y } from './layout';
import { EARTH } from './scenery';
import { NEAR_LIGHT, type StageScene, showError, stage } from './stage';

const q = new URLSearchParams(location.search);
/** a number from the address, or the probe's own value */
const num = (k: string, d: number) => (q.get(k) === null ? d : Number(q.get(k)));
/** a colour from the address (hex without #), or none */
const colour = (k: string) => {
  const v = q.get(k);
  return v === null ? null : Number.parseInt(v, 16);
};
const hexOf = (k: string) => {
  const h = colour(k);
  return h === null ? null : rgb(h);
};
/**
 * The probe's knobs for the gauntlet's search (tools/lookprobe/search_paris.py): a colour moves the mean of a palette
 * there channel by channel and keeps how its colours differ, `spread` widens or narrows that difference. Of the roofs
 * only the warm colours move, so that the slate roofs stay slate; of the walls all (`all`).
 */
function moved(p: readonly RGB[], to: RGB | null, spread: number, all = false): readonly RGB[] {
  const warm = (c: RGB) => all || c[0] > 1.5 * c[2],
    w = p.filter(warm);
  if (!w.length || (!to && spread === 1)) return p;
  const mean = [0, 1, 2].map((i) => w.reduce((s, c) => s + c[i], 0) / w.length),
    t = to ?? mean;
  const to1 = (c: RGB, i: number) => Math.max(0, t[i] + ((c[i] * t[i]) / mean[i] - t[i]) * spread);
  return p.map((c): RGB => (warm(c) ? [to1(c, 0), to1(c, 1), to1(c, 2)] : c));
}
const TR: Tradition = {
  ...PARIS,
  walls: moved(PARIS.walls, hexOf('wall'), num('wallspread', 1), true),
  roofs: moved(PARIS.roofs ?? [PARIS.roof], hexOf('roof'), num('roofspread', 1)),
  quay: {
    ...PARIS.quay,
    paving: hexOf('pave') ?? PARIS.quay.paving,
    spread: num('pspread', PARIS.quay.spread ?? 1),
    slab: num('slab', PARIS.quay.slab ?? 2),
  },
  glass: hexOf('glass') ?? PARIS.glass,
  stone: hexOf('stone') ?? PARIS.stone,
  timber: PARIS.timber && {
    share: num('tshare', PARIS.timber.share),
    c: hexOf('timber') ?? PARIS.timber.c,
    post: num('post', PARIS.timber.post ?? 0.9),
  },
  window: [num('winw', PARIS.window[0]), num('winh', PARIS.window[1])],
  bay: num('bay', PARIS.bay),
  ashlarSpread: q.get('aspread') === null ? PARIS.ashlarSpread : num('aspread', 1),
  dormers: num('dormers', PARIS.dormers ?? 0),
  tileShades: [
    num('tlow', PARIS.tileShades?.[0] ?? 0.88),
    num('tspread', PARIS.tileShades?.[1] ?? 0.2),
    num('todd', PARIS.tileShades?.[2] ?? 0),
  ],
  pitch: [num('pitch0', PARIS.pitch[0]), num('pitch1', PARIS.pitch[1])],
  jetty: { ...PARIS.jetty, share: num('jetty', PARIS.jetty.share) },
};
/**
 * a block of houses and the lane beside it, in blocks; the square takes SQ cells. The block size is the search's own,
 * unrounded (a rounded one draws another town); the lane, the passages, the square and the camera were set by eye beside
 * the picture at the same scale (21 Nov 2026 evening), so that the houses stand as close and as large as there
 */
const BLOCK = num('block', 12.033),
  LANE = num('lane', 4),
  CELL = BLOCK + LANE;
const GRASS = rgb(0x6a8a3a),
  OLIVE = hexOf('olive') ?? rgb(0x4a6a30),
  LIGHT_LEAF = hexOf('leaf') ?? rgb(0x6a8a1c),
  LIGHT_TOP = hexOf('leaftop') ?? rgb(0x8aa020),
  TRUNK = rgb(0x6b4a2c),
  STRIPES: readonly RGB[] = [rgb(0xc8382c), rgb(0x2f5f9a), rgb(0xd8a030)],
  CANVAS = rgb(0xf0e8d8),
  POLE = rgb(0x6b4a2c);
const mat = new THREE.Matrix4();
/** how much larger the townsfolk are drawn than the look probe's (the reference picture's stand about two thirds of a door) */
const FOLK = num('folk', 1.4);
const CLOTHES: readonly RGB[] = [0x7a3a2a, 0x2f4a6a, 0x5a6a3a, 0x8a7a5a, 0x6a4a6a, 0xb08a4a, 0x3a3a3a, 0xc8b8a0].map(
    (h) => rgb(h),
  ),
  SKIN = rgb(0xe0b090);

/** A townsman of a few cubes: legs, a coat of one of the clothes' colours, a head (scenery of the probe). */
function folk(things: Batch, x: number, z: number, r: Rnd) {
  const c = r.pick(CLOTHES),
    s = r.range(0.9, 1.05) * FOLK;
  things.box(x - 0.1 * s, LAND_Y, z - 0.08 * s, x + 0.1 * s, LAND_Y + 0.3 * s, z + 0.08 * s, shade(c, 0.6));
  things.box(x - 0.14 * s, LAND_Y + 0.3 * s, z - 0.11 * s, x + 0.14 * s, LAND_Y + 0.7 * s, z + 0.11 * s, c);
  things.box(x - 0.09 * s, LAND_Y + 0.7 * s, z - 0.09 * s, x + 0.09 * s, LAND_Y + 0.88 * s, z + 0.09 * s, SKIN);
}

type Front = 'px' | 'nx' | 'pz' | 'nz';

/** the town's draw: another seed gives another town of the same kind, to see how much a measure owes to one draw */
const SEED = num('seed', 21);
/** how many cells the market square takes: one, as small as the reference picture's, or two side by side */
const SQ = num('sq', 0.55);
/** the share of houses with a passage after them, its width; how far a block's edges and a house's front may move */
const GAP = num('gap', 0.5),
  GAP_W = num('gapw', 1.2),
  JIT = num('jit', 0.8),
  SETBACK = num('setback', 0.5);
/** the share of houses of the lower storey count */
const LOW = num('low', 0.65);
/** the share of wide passages that hold a tree; drawn from their own seed, so that the houses stay the same */
const PASSAGE_TREE = num('ptree', 0.3),
  GAP_TREES = seeded(SEED + 4);
/** the townsfolk in the lanes */
const CROWD = num('crowd', 450);
/** the cell from which on the river runs in place of blocks (7: no river), and the river's width in blocks */
const RIVER = num('river', 4),
  RIVER_W = num('riverw', 16),
  RIVER_C = hexOf('water') ?? rgb(0x3a6e78);

/**
 * One side of a block: houses from `a` to `b` along the side, fronts towards `front`, as single houses rather than a
 * row, as in the reference picture: a passage after some of them, each standing back from the lane by its own small
 * amount (OWN RULE for the prototype, read off the picture).
 */
function side(things: Batch, x0: number, z0: number, x1: number, z1: number, front: Front, r: Rnd) {
  const tr = TR,
    alongX = front === 'pz' || front === 'nz',
    a = alongX ? x0 : z0,
    b = alongX ? x1 : z1,
    room = alongX ? z1 - z0 : x1 - x0;
  let t = a,
    touching = false;
  while (b - t > 1.5) {
    const w = Math.min(b - t, r.range(...tr.plot.width)),
      back = r.range(0, SETBACK),
      d = Math.min(room - back, r.range(...tr.plot.depth)),
      floors = r.chance(LOW) ? tr.storeys[0] : tr.storeys[1];
    const last = b - (t + w) <= 1.5,
      gap = !last && r.chance(GAP) ? r.range(GAP_W * 0.6, GAP_W * 1.4) : 0;
    // a wall stays blind where the neighbour's touches it; a house beside a passage or at a corner shows windows there
    const party: Front[] = alongX ? ['nx', 'px'] : ['nz', 'pz'],
      blind = party.filter((_, i) => (i === 0 ? touching : !last && !gap));
    const house = alongX
      ? fineHouse(w, d, floors, tr, r, { front, blind, shop: r.chance(0.3) })
      : fineHouse(d, w, floors, tr, r, { front, blind, shop: r.chance(0.3) });
    const cx = alongX ? t + w / 2 : front === 'px' ? x1 - back - d / 2 : x0 + back + d / 2,
      cz = alongX ? (front === 'pz' ? z1 - back - d / 2 : z0 + back + d / 2) : t + w / 2;
    things.append(house, mat.identity().setPosition(cx, LAND_Y, cz));
    // now and then a tree in a passage wide enough, as between the houses of the reference picture (OWN RULE)
    if (gap > 1.2 && GAP_TREES.chance(PASSAGE_TREE)) {
      const along = t + w + gap / 2,
        across =
          front === 'px'
            ? x1 - room / 2
            : front === 'nx'
              ? x0 + room / 2
              : front === 'pz'
                ? z1 - room / 2
                : z0 + room / 2;
      const leaf = GAP_TREES.chance(0.5) ? LIGHT_LEAF : OLIVE;
      cubeTree(things, alongX ? along : across, alongX ? across : along, GAP_TREES, 1.6 * num('treesize', 1.5), leaf);
    }
    touching = !gap;
    t += w + gap;
  }
}

/** A block of houses `sx` by `sz`: the four sides, the long ones full length, the short ones between them; a yard inside. */
function block(ground: Batch, things: Batch, x0: number, z0: number, sx: number, sz: number, r: Rnd) {
  const x1 = x0 + sx,
    z1 = z0 + sz,
    d = num('depth', 3.931);
  side(things, x0, z1 - d, x1, z1, 'pz', r);
  side(things, x0, z0, x1, z0 + d, 'nz', r);
  side(things, x1 - d, z0 + d, x1, z1 - d, 'px', r);
  side(things, x0, z0 + d, x0 + d, z1 - d, 'nx', r);
  // the yard: grass
  ground.box(x0 + d - 0.6, LAND_Y - 0.4, z0 + d - 0.6, x1 - d + 0.6, LAND_Y + 0.04, z1 - d + 0.6, GRASS, {
    top: shade(GRASS, 1.05),
  });
  // a tree in most yards, big enough to stand over the eaves as in the reference picture
  if (r.chance(0.8))
    cubeTree(
      things,
      x0 + sx / 2 + r.range(-0.8, 0.8),
      z0 + sz / 2 + r.range(-0.8, 0.8),
      r,
      r.range(1.8, 2.3) * num('treesize', 1.5),
      r.chance(0.4) ? LIGHT_LEAF : OLIVE,
    );
}

/**
 * A tree as the reference picture draws it: a bare trunk, and over it tiers of small cubes, more below than above,
 * their tops lit lighter (OWN RULE for the prototype, read off the picture).
 */
function cubeTree(things: Batch, x: number, z: number, r: Rnd, size: number, leaf: RGB) {
  const s = size * 0.55,
    h = r.range(0.9, 1.2) * s,
    tiers: readonly [number, number, number][] = [
      [r.int(4, 6), 0.55, 0.42],
      [r.int(2, 4), 0.35, 0.36],
      [1, 0, 0.3],
    ];
  things.box(x - 0.12 * s, LAND_Y, z - 0.12 * s, x + 0.12 * s, LAND_Y + h + 0.2 * s, z + 0.12 * s, TRUNK);
  tiers.forEach(([n, reach, e0], t) => {
    const y = LAND_Y + h + t * 0.62 * s;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 2 * Math.PI + r.range(-0.4, 0.4),
        e = e0 * s * r.range(0.85, 1.15),
        cx = x + Math.cos(a) * reach * s,
        cz = z + Math.sin(a) * reach * s,
        c = shade(leaf, r.range(0.8, 1.05));
      things.box(cx - e, y, cz - e, cx + e, y + 2 * e, cz + e, c, { top: mix(c, LIGHT_TOP, 0.55) });
    }
  });
}

/** A market stall: four poles, a table of goods, an awning in stripes. */
function stall(things: Batch, x: number, z: number, r: Rnd) {
  const w = r.range(1.4, 1.9),
    d = r.range(0.9, 1.2),
    h = 1.15,
    c = r.pick(STRIPES);
  for (const [px, pz] of [
    [x, z],
    [x + w, z],
    [x, z + d],
    [x + w, z + d],
  ])
    things.box(px - 0.05, LAND_Y, pz - 0.05, px + 0.05, LAND_Y + h, pz + 0.05, POLE);
  things.box(x, LAND_Y + 0.45, z, x + w, LAND_Y + 0.55, z + d, shade(POLE, 1.2));
  for (let k = 0; k < 6; k++)
    things.box(
      x + 0.1 + (k * (w - 0.2)) / 6,
      LAND_Y + 0.55,
      z + 0.15,
      x + 0.1 + ((k + 0.8) * (w - 0.2)) / 6,
      LAND_Y + 0.7,
      z + d - 0.15,
      shade(r.pick([rgb(0xe8a030), rgb(0x8ab040), rgb(0xd04030)]), r.range(0.9, 1.1)),
    );
  const n = 6;
  for (let k = 0; k < n; k++)
    things.box(
      x - 0.1 + (k * (w + 0.2)) / n,
      LAND_Y + h,
      z - 0.1,
      x - 0.1 + ((k + 1) * (w + 0.2)) / n,
      LAND_Y + h + 0.12,
      z + d + 0.1,
      k % 2 ? CANVAS : c,
    );
}

/**
 * The river from the quay's edge `xq` to the far bank at `xb` (the ground ends at `x9`): the water in the near view's
 * colours with its flecks, landing stages with boats along the quay, a ship in the stream, and the far bank as a meadow
 * with trees (the scenery of the reference picture; OWN RULE for the prototype).
 */
function riverside(
  ground: Batch,
  things: Batch,
  water: Batch,
  cell: GroundCell,
  at: (x: number) => Column,
  xq: number,
  xb: number,
  x9: number,
) {
  const z9 = cell.z0 + cell.size,
    r = seeded(SEED + 5);
  for (let x = xq; x < xb; x++)
    for (let z = cell.z0; z < z9; z++)
      water.quad(
        [x, SEA_Y, z],
        [x, SEA_Y, z + 1],
        [x + 1, SEA_Y, z + 1],
        [x + 1, SEA_Y, z],
        waterColourAt(x, z, RIVER_C),
        [0, 1, 0],
      );
  waterFlecks(water, cell, at);
  for (let z = cell.z0 + r.range(4, 10); z < z9 - 4; z += r.range(11, 17)) {
    jetty(things, xq, SEA_Y, z, r.range(3.5, 5), 0.9, LAND_Y - 0.15, POLE);
    boat(things, xq + r.range(1.5, 3), z + r.pick([-2.2, 2.2]), r);
  }
  // river boats under one square sail, lying along the stream, as the picture draws them
  for (let z = cell.z0 + r.range(8, 20); z < z9 - 8; z += r.range(18, 30)) {
    const x = r.range(xq + 7, xb - 4),
      hull = shade(POLE, r.range(0.85, 1.1));
    things.box(x - 0.7, SEA_Y - 0.2, z - 2, x + 0.7, SEA_Y + 0.55, z + 2, hull, { top: shade(hull, 1.35), foot: 0.7 });
    things.box(x - 0.45, SEA_Y - 0.2, z + 2, x + 0.45, SEA_Y + 0.7, z + 2.6, shade(hull, 0.85));
    things.box(x - 0.08, SEA_Y + 0.55, z - 0.08, x + 0.08, SEA_Y + 3.6, z + 0.08, shade(hull, 0.7));
    things.box(x - 1.1, SEA_Y + 1.3, z + 0.1, x + 1.1, SEA_Y + 3.3, z + 0.22, CANVAS);
  }
  if (xb >= x9) return;
  ground.box(xb, LAND_Y - 2, cell.z0, x9, LAND_Y, z9, EARTH, { top: GRASS });
  for (let z = cell.z0 + 2; z < z9 - 2; z += r.range(2.5, 6))
    cubeTree(things, r.range(xb + 1.5, xb + 7), z, r, r.range(1.6, 2.4), r.chance(0.5) ? LIGHT_LEAF : OLIVE);
}

async function build(): Promise<StageScene> {
  const ground = new Batch(),
    things = new Batch(),
    water = new Batch(),
    c = N / 2,
    r = seeded(SEED);
  // the whole probe is paved town (ground kit: paving, src/buildings/ground); the ground under the slabs, darker, shows in their joints
  const size = 7 * CELL,
    x0 = Math.round(c - size / 2),
    z0 = Math.round(c - size / 2);
  // the river beyond the town's last cells: the town ends at a quay, the far bank is a meadow behind its own wall
  const xq = Math.round(x0 + RIVER * CELL + 1.5),
    xb = xq + RIVER_W,
    x9 = x0 + size + 10;
  ground.box(x0 - 10, LAND_Y - 2, z0 - 10, Math.min(xq, x9), LAND_Y, z0 + size + 10, EARTH, {
    top: shade(TR.quay.paving, 0.62),
  });
  const land: Column = { top: LAND_Y, wet: false, paved: true },
    sea: Column = { top: SEA_Y, wet: true, paved: false },
    bank: Column = { top: LAND_Y, wet: false, paved: false },
    at = (x: number) => (x < xq ? land : x < xb ? sea : bank),
    cell = { x0: x0 - 10, z0: z0 - 10, size: size + 20, ox: 0, oz: 0, water: SEA_Y };
  fineGround(ground, cell, at, TR.quay);
  if (xq < x9) riverside(ground, things, water, cell, at, xq, Math.min(xb, x9), x9);
  // blocks on a grid of 7 x 7 cells; the square takes SQ cells in the middle. Each block's edges move by up to JIT
  // blocks, so that the lanes widen and narrow as in the reference picture (OWN RULE for the prototype)
  const rj = seeded(SEED + 3),
    edge = () => rj.range(-JIT, JIT);
  for (let i = 0; i < 7; i++)
    for (let k = 0; k < 7; k++) {
      const bx = x0 + i * CELL + LANE / 2 + edge(),
        bz = z0 + k * CELL + LANE / 2 + edge(),
        sx = x0 + i * CELL + LANE / 2 + BLOCK + edge() - bx,
        sz = z0 + k * CELL + LANE / 2 + BLOCK + edge() - bz;
      if (i >= RIVER) continue;
      if (k === 3 && (i === 3 || (SQ > 1 && i === 4))) {
        // a square smaller than a cell leaves the far part of its cell to a block of houses
        if (SQ < 1) block(ground, things, bx, bz + sz * SQ, sx, sz * (1 - SQ), r);
        continue;
      }
      block(ground, things, bx, bz, sx, sz, r);
    }
  // the square: stalls in two loose rows, trees at its edge
  const sx = x0 + 3 * CELL + LANE / 2,
    sz = z0 + 3 * CELL + LANE / 2,
    rs = seeded(SEED + 1);
  const wide = Math.max(1, SQ) * CELL,
    deep = Math.min(1, SQ) * BLOCK;
  for (let k = 0; k < 4.5 * Math.max(1, SQ); k++)
    stall(things, sx + 2 + rs.range(0, wide - 6), sz + 1 + rs.range(0, Math.max(0.5, deep - 2.5)), rs);
  for (let k = 0; k < 4 * Math.max(1, SQ); k++)
    cubeTree(things, sx + rs.range(0.5, wide - 2), sz + rs.pick([0.6, deep - 0.6]), rs, rs.range(1.2, 1.6), OLIVE);
  // people in the lanes and on the square
  const rf = seeded(SEED + 2);
  for (let k = 0; k < CROWD; k++) {
    const lane = x0 + rf.int(0, 7) * CELL + rf.range(-0.9, 0.9),
      along = z0 + rf.range(0, size);
    const [fx, fz] = rf.chance(0.5) ? [lane, along] : [along, lane];
    if (fx < xq - 0.4) folk(things, fx, fz, rf);
  }
  for (let k = 0; k < 20 * Math.max(1, SQ); k++)
    folk(things, sx + rf.range(0.5, wide - 1), sz + rf.range(0.5, deep - 0.5), rf);
  return { ground, things, water, counts: { triangles: ground.triangles + things.triangles + water.triangles } };
}

/**
 * the light of the near view (stage/look.ts) as the Paris gauntlet's search found it closest to the picture
 * (tools/lookprobe/search_paris.py, 21 Nov 2026), seen through `?tone=neutral&exposure=1.2&saturation=0.88&sea=0`
 * (the river in its own colour, without the sea's surface; the game's own tone stays AgX); each strength can be tried
 * out from the address, as in near.ts
 */
const FOUND = { ...NEAR_LIGHT, sun: 1.364, side: 0.923, sky: 0.755, bounce: 0.299, fill: 0.675, skyColor: 0xc4d1f0 };
const LIGHT = { ...FOUND };
for (const k of ['sun', 'side', 'sky', 'bounce', 'fill', 'mirror'] as const) LIGHT[k] = num(k, FOUND[k]);
LIGHT.mirrorTint = colour('mirrortint') ?? FOUND.mirrorTint;
LIGHT.skyColor = colour('skycol') ?? FOUND.skyColor;
LIGHT.sunColor = colour('suncol') ?? FOUND.sunColor;

stage(build, {
  frameW: num('across', 52),
  elevation: num('elev', 36.521),
  tall: 14,
  light: LIGHT,
  // softer shadows than the near view's, as the picture draws them (OWN RULE for the prototype)
  shadowRadius: num('soft', 14),
}).catch(showError);
