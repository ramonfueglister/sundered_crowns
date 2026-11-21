// Paris probe (PROTOTYPE, 20 Nov 2026): blocks of Paris houses (traditions/paris.ts) round a market square with
// lanes between them, on the look probe's stage, to be measured against Ramon's reference picture of the Île de la
// Cité of that day (tools/lookprobe/gauntlet_paris.py). Every house faces its lane; the yards inside the blocks get
// grass and a tree now and then; the square gets market stalls and trees. The layout is the probe's, by assumption.
import * as THREE from 'three/webgpu';
import { type Column, PARIS, type Tradition, fineGround, fineHouse } from '../buildings';
import { Batch, type RGB, type Rnd, rgb, seeded, shade } from './batch';
import { LAND_Y, N } from './layout';
import { EARTH, tree } from './scenery';
import { NEAR_LIGHT, NEAR_SHADOW, type StageScene, showError, stage } from './stage';

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
 * there channel by channel and keeps how its colours differ, `spread` widens or narrows that difference. Only the warm
 * colours of a palette move, so that the slate roofs stay slate.
 */
function moved(p: readonly RGB[], to: RGB | null, spread: number): readonly RGB[] {
  const warm = (c: RGB) => c[0] > 1.5 * c[2],
    w = p.filter(warm);
  if (!w.length || (!to && spread === 1)) return p;
  const mean = [0, 1, 2].map((i) => w.reduce((s, c) => s + c[i], 0) / w.length),
    t = to ?? mean;
  const to1 = (c: RGB, i: number) => Math.max(0, t[i] + ((c[i] * t[i]) / mean[i] - t[i]) * spread);
  return p.map((c): RGB => (warm(c) ? [to1(c, 0), to1(c, 1), to1(c, 2)] : c));
}
const TR: Tradition = {
  ...PARIS,
  walls: moved(PARIS.walls, hexOf('wall'), num('wallspread', 1)),
  roofs: moved(PARIS.roofs ?? [PARIS.roof], hexOf('roof'), num('roofspread', 1)),
  quay: { ...PARIS.quay, paving: hexOf('pave') ?? PARIS.quay.paving, spread: num('pspread', PARIS.quay.spread ?? 1) },
  glass: hexOf('glass') ?? PARIS.glass,
  timber: PARIS.timber && {
    share: num('tshare', PARIS.timber.share),
    c: hexOf('timber') ?? PARIS.timber.c,
    post: num('post', PARIS.timber.post ?? 0.9),
  },
  window: [num('winw', PARIS.window[0]), num('winh', PARIS.window[1])],
  tileShades: [num('tlow', PARIS.tileShades?.[0] ?? 0.88), num('tspread', PARIS.tileShades?.[1] ?? 0.2)],
  pitch: [num('pitch0', PARIS.pitch[0]), num('pitch1', PARIS.pitch[1])],
  jetty: { ...PARIS.jetty, share: num('jetty', PARIS.jetty.share) },
};
/** a block of houses and the lane beside it, in blocks; the square takes two blocks and the lane between them */
const BLOCK = num('block', 12),
  LANE = num('lane', 4.6),
  CELL = BLOCK + LANE;
const GRASS = rgb(0x6a8a3a),
  OLIVE = hexOf('olive') ?? rgb(0x32551b),
  LIGHT_LEAF = hexOf('leaf') ?? rgb(0x5d7212),
  STRIPES: readonly RGB[] = [rgb(0xc8382c), rgb(0x2f5f9a), rgb(0xd8a030)],
  CANVAS = rgb(0xf0e8d8),
  POLE = rgb(0x6b4a2c);
const mat = new THREE.Matrix4();
const CLOTHES: readonly RGB[] = [0x7a3a2a, 0x2f4a6a, 0x5a6a3a, 0x8a7a5a, 0x6a4a6a, 0xb08a4a, 0x3a3a3a, 0xc8b8a0].map(
    (h) => rgb(h),
  ),
  SKIN = rgb(0xe0b090);

/** A townsman of a few cubes: legs, a coat of one of the clothes' colours, a head (scenery of the probe). */
function folk(things: Batch, x: number, z: number, r: Rnd) {
  const c = r.pick(CLOTHES),
    s = r.range(0.9, 1.05);
  things.box(x - 0.1 * s, LAND_Y, z - 0.08 * s, x + 0.1 * s, LAND_Y + 0.3 * s, z + 0.08 * s, shade(c, 0.6));
  things.box(x - 0.14 * s, LAND_Y + 0.3 * s, z - 0.11 * s, x + 0.14 * s, LAND_Y + 0.7 * s, z + 0.11 * s, c);
  things.box(x - 0.09 * s, LAND_Y + 0.7 * s, z - 0.09 * s, x + 0.09 * s, LAND_Y + 0.88 * s, z + 0.09 * s, SKIN);
}

type Front = 'px' | 'nx' | 'pz' | 'nz';

/** the share of houses with a passage after them, its width; how far a block's edges and a house's front may move */
const GAP = num('gap', 0.35),
  GAP_W = num('gapw', 1.3),
  JIT = num('jit', 0.8),
  SETBACK = num('setback', 0.5);

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
      floors = r.chance(0.55) ? tr.storeys[0] : tr.storeys[1];
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
    touching = !gap;
    t += w + gap;
  }
}

/** A block of houses `sx` by `sz`: the four sides, the long ones full length, the short ones between them; a yard inside. */
function block(ground: Batch, things: Batch, x0: number, z0: number, sx: number, sz: number, r: Rnd) {
  const x1 = x0 + sx,
    z1 = z0 + sz,
    d = num('depth', 3.9);
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
    tree(
      things,
      x0 + sx / 2 + r.range(-0.8, 0.8),
      LAND_Y,
      z0 + sz / 2 + r.range(-0.8, 0.8),
      r,
      r.range(1.8, 2.3) * num('treesize', 0.88),
      r.chance(0.4) ? LIGHT_LEAF : OLIVE,
    );
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

async function build(): Promise<StageScene> {
  const ground = new Batch(),
    things = new Batch(),
    water = new Batch(),
    c = N / 2,
    r = seeded(21);
  // the whole probe is paved town (ground kit: paving, src/buildings/ground); the ground under the slabs, darker, shows in their joints
  const size = 7 * CELL,
    x0 = Math.round(c - size / 2),
    z0 = Math.round(c - size / 2);
  ground.box(x0 - 10, LAND_Y - 2, z0 - 10, x0 + size + 10, LAND_Y, z0 + size + 10, EARTH, {
    top: shade(TR.quay.paving, 0.62),
  });
  const land: Column = { top: LAND_Y, wet: false, paved: true };
  fineGround(ground, { x0, z0, size, ox: 0, oz: 0, water: LAND_Y - 2 }, () => land, TR.quay);
  // blocks on a grid of 7 x 7 cells; the square takes the middle 2 x 1 cells. Each block's edges move by up to JIT
  // blocks, so that the lanes widen and narrow as in the reference picture (OWN RULE for the prototype)
  const rj = seeded(24),
    edge = () => rj.range(-JIT, JIT);
  for (let i = 0; i < 7; i++)
    for (let k = 0; k < 7; k++) {
      const bx = x0 + i * CELL + LANE / 2 + edge(),
        bz = z0 + k * CELL + LANE / 2 + edge(),
        sx = x0 + i * CELL + LANE / 2 + BLOCK + edge() - bx,
        sz = z0 + k * CELL + LANE / 2 + BLOCK + edge() - bz;
      if (k === 3 && (i === 3 || i === 4)) continue;
      block(ground, things, bx, bz, sx, sz, r);
    }
  // the square: stalls in two loose rows, trees at its edge
  const sx = x0 + 3 * CELL + LANE / 2,
    sz = z0 + 3 * CELL + LANE / 2,
    rs = seeded(22);
  for (let k = 0; k < 9; k++) stall(things, sx + 2 + rs.range(0, 2 * CELL - 6), sz + 2 + rs.range(0, BLOCK - 4), rs);
  for (let k = 0; k < 8; k++)
    tree(
      things,
      sx + rs.range(0.5, 2 * CELL - 2),
      LAND_Y,
      sz + rs.pick([0.6, BLOCK - 0.6]),
      rs,
      rs.range(1.2, 1.6),
      OLIVE,
    );
  // people in the lanes and on the square
  const rf = seeded(23);
  for (let k = 0; k < 160; k++) {
    const lane = x0 + rf.int(0, 7) * CELL + rf.range(-0.9, 0.9),
      along = z0 + rf.range(0, size);
    if (rf.chance(0.5)) folk(things, lane, along, rf);
    else folk(things, along, lane, rf);
  }
  for (let k = 0; k < 40; k++) folk(things, sx + rf.range(0.5, 2 * CELL - 1), sz + rf.range(0.5, BLOCK - 0.5), rf);
  return { ground, things, water, counts: { triangles: ground.triangles + things.triangles + water.triangles } };
}

/**
 * the light of the near view (stage/look.ts) as the Paris gauntlet's search found it closest to the picture
 * (tools/lookprobe/search_paris.py, 21 Nov 2026), seen through `?tone=neutral&exposure=1.19&saturation=0.88` (the
 * game's own tone stays AgX); each strength can be tried out from the address, as in near.ts
 */
const FOUND = { ...NEAR_LIGHT, sun: 1.35, side: 0.95, sky: 0.75, bounce: 0.31, fill: 0.55, skyColor: 0xc4d1f0 };
const LIGHT = { ...FOUND };
for (const k of ['sun', 'side', 'sky', 'bounce', 'fill'] as const) LIGHT[k] = num(k, FOUND[k]);
LIGHT.skyColor = colour('skycol') ?? FOUND.skyColor;
LIGHT.sunColor = colour('suncol') ?? FOUND.sunColor;

stage(build, {
  frameW: num('across', 63),
  elevation: num('elev', 36),
  tall: 14,
  light: LIGHT,
  shadowRadius: Number(q.get('soft')) || NEAR_SHADOW,
}).catch(showError);
