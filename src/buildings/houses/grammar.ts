// The house of the near view as a split grammar (Wonka 2003, Müller 2006): the plot becomes a body of storeys, each
// storey's wall is split into axes, each axis gets a part from parts.ts, the roof gets its tiles, chimneys and
// terrace. Every size comes from the tradition (a measure file with sources); the grammar draws from the random
// source in a fixed order, so a house is the same for the same seed. Fine blocks (VOXEL) are the unit of every part.
import { Batch, type RGB, type Rnd, shade } from '../../lookprobe/batch';
import { gableRoof, hipRoof, roofAt } from '../core/roofs';
import { SIDES, type Side, arch, wallOf } from '../core/wall';
import { WINDOW_WARM } from '../palette';
import type { Tradition } from '../traditions/tradition';
import { awning, jar } from './clutter';
import { type Materials, ashlar, corbels, door, gate, jointOf, shop, shutters, washing, window } from './parts';
import { altana, chimney, stack, tiledGable, tiledHip } from './roof_parts';
import { dormers } from './dormer';
import { gableFrame, timberFrame } from './timber';
import { VOXEL as V } from './style';

export interface HouseOptions {
  /** 1 draws the near view (ashlar grid, frames, hoods, tiles, awnings), 0 only what the world needs from afar */
  detail?: 0 | 1;
  /** the side with the door, towards the street or quay; `canal` the side with the water gate; `blind` party walls without openings */
  front?: Side;
  canal?: Side | null;
  blind?: readonly Side[];
  /** a shop on the ground floor of the front; a great (merchant's) house with a hall storey over the ground floor */
  shop?: boolean;
  great?: boolean;
}

interface Box {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
const grow = (f: Box, side: Side, by: number): Box => ({
  x0: f.x0 - (side === 'nx' ? by : 0),
  z0: f.z0 - (side === 'nz' ? by : 0),
  x1: f.x1 + (side === 'px' ? by : 0),
  z1: f.z1 + (side === 'pz' ? by : 0),
});
/** a band round the body: `out` proud of its walls */
const ring = (b: Batch, f: Box, y0: number, y1: number, out: number, c: RGB) =>
  b.box(f.x0 - out, y0, f.z0 - out, f.x1 + out, y1, f.z1 + out, c, { bottom: true });
const AWNINGS: readonly RGB[] = [
  [0.72, 0.16, 0.12],
  [0.42, 0.18, 0.5],
  [0.85, 0.6, 0.12],
];
const JAR: RGB = [0.72, 0.36, 0.2],
  WHITE: RGB = [0.92, 0.88, 0.8];
const CLOTHS: readonly RGB[] = [WHITE, [0.96, 0.94, 0.9], [0.86, 0.78, 0.62], [0.62, 0.68, 0.8], [0.8, 0.42, 0.34]];

/** A house of `w` × `d` blocks and `floors` storeys in a tradition, around its origin with the ground at y = 0. */
/** The wall of a tradition's house: the first its source draws. */
export const drawnWall = (tr: Tradition, r: Rnd): RGB => r.pick(tr.walls);

export function fineHouse(w: number, d: number, floors: number, tr: Tradition, r: Rnd, o: HouseOptions = {}): Batch {
  const b = new Batch(),
    detail = o.detail ?? 1,
    front = o.front ?? 'pz',
    blind = new Set(o.blind ?? []);
  const W = Math.max(6, Math.round(w / V)) * V,
    D = Math.max(6, Math.round(d / V)) * V;
  // what the whole house decides, drawn first and in this order
  // the openings are dark and warm, as in the reference class image (not the blue-grey glass of the far view),
  // unless the tradition has a glass of its own
  const wallC = drawnWall(tr, r),
    mt: Materials = { stone: tr.stone, wood: tr.wood, glass: shade(tr.glass ?? WINDOW_WARM, r.range(0.4, 0.65)) };
  // in the near view the body shows in the joint colour between the ashlar panes, from afar in the wall colour
  const bodyC = detail && !tr.plaster ? jointOf(wallC) : wallC;
  const arched = r.chance(tr.arched),
    jetty = detail && floors > tr.jetty.from && r.chance(tr.jetty.share) ? tr.jetty.out * V : 0;
  const altanaOn = r.chance(tr.altana),
    seed = r.int(0, 1e6),
    pitch = r.range(tr.pitch[0], tr.pitch[1]);
  // drawn only when the tradition has them, so that a tradition without them builds the same houses as before
  const hipped = tr.hipped !== undefined && r.chance(tr.hipped),
    arcade = tr.arcade !== undefined && r.chance(tr.arcade),
    roofC = tr.roofs ? r.pick(tr.roofs) : tr.roof,
    frame = tr.timber !== undefined && r.chance(tr.timber.share) ? tr.timber.c : null;
  // storeys: the ground floor, the hall storey of a great house, the upper storeys; the last block of each is its band
  const hs = [
    tr.ground,
    ...(o.great ? [tr.noble] : []),
    ...(Array(Math.max(0, floors - 1 - (o.great ? 1 : 0))).fill(tr.upper) as number[]),
  ];
  const ys = [0];
  for (const h of hs) ys.push(ys[ys.length - 1] + h * V);
  const top = ys[hs.length] + V,
    base: Box = { x0: -W / 2, z0: -D / 2, x1: W / 2, z1: D / 2 };
  const fp = (k: number): Box => (jetty && k >= tr.jetty.from ? grow(base, front, jetty) : base);
  // the body: walls one block into the ground; a jettied house carries its upper storeys on corbels over the front
  if (jetty) {
    const yj = ys[tr.jetty.from],
      u = fp(tr.jetty.from);
    b.box(base.x0, -1, base.z0, base.x1, yj, base.z1, bodyC, { foot: 0.9 });
    b.box(u.x0, yj - V, u.z0, u.x1, top, u.z1, bodyC, { bottom: true });
    corbels(
      b,
      wallOf(base.x0, base.z0, base.x1, base.z1, front),
      yj - V,
      jetty,
      Math.max(2, Math.round(W / (2 * V))),
      tr.wood,
    );
  } else b.box(base.x0, -1, base.z0, base.x1, top, base.z1, bodyC, { foot: 0.9 });
  // plinth, string courses and cornice as rings of stone round the body (Istrian stone: assumption)
  ring(b, fp(0), 0, V, V * 0.25, shade(mt.stone, 0.88));
  for (let k = 1; k < hs.length; k++) ring(b, fp(k), ys[k] - V, ys[k], V * 0.5, mt.stone);
  ring(b, fp(hs.length - 1), top - V, top, V * 0.8, shade(mt.stone, 0.96));
  for (const s of SIDES) {
    if (blind.has(s)) continue;
    for (let k = 0; k < hs.length; k++)
      facade(b, fp(k), s, k, ys[k], hs[k], tr, mt, r, {
        front,
        canal: o.canal ?? null,
        shop: !!o.shop,
        great: !!o.great,
        arched,
        arcade,
        frame,
        detail,
        seed,
        wallC,
      });
  }
  // the roof: a low gable of coppi over an overhang of a block and a half (the wooden gronda: assumption), with a terrace and chimneys
  const f = fp(hs.length - 1),
    ov = V * 1.5,
    rise = Math.max(V, (Math.min(W, D) / 2) * pitch),
    rx0 = f.x0 - ov,
    rz0 = f.z0 - ov,
    rx1 = f.x1 + ov,
    rz1 = f.z1 + ov;
  if (hipped) {
    if (detail) tiledHip(b, rx0, rz0, rx1, rz1, top, rise, roofC, seed, tr.tileShades);
    else hipRoof(b, rx0, rz0, rx1, rz1, top, rise, roofC, 3);
  } else if (detail) tiledGable(b, rx0, rz0, rx1, rz1, top, rise, roofC, wallC, seed, tr.tileShades);
  else gableRoof(b, rx0, rz0, rx1, rz1, top, rise, roofC, wallC, 3);
  // the gable ends of a timber-framed house show their frame too (on the short sides, where tiledGable fills the gable)
  if (frame && detail && !hipped)
    for (const sd of (rx1 - rx0 >= rz1 - rz0 ? ['px', 'nx'] : ['pz', 'nz']) as Side[])
      gableFrame(b, wallOf(rx0, rz0, rx1, rz1, sd), top, rise, frame);
  if (tr.dormers && detail && !hipped)
    dormers(b, rx0, rz0, rx1, rz1, top, rise, r.int(0, Math.round(tr.dormers * 2)), wallC, roofC, mt.glass, r);
  if (altanaOn && detail) {
    const s = Math.min(W, D) * 0.25;
    altana(b, -s, -s, s, s, top + rise, tr.wood);
  }
  const n = Math.floor(tr.chimney.perHouse) + (r.chance(tr.chimney.perHouse % 1) ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const cx = Math.round(r.range(f.x0 + V, f.x1 - V) / V) * V,
      cz = Math.round(r.range(f.z0 + V, f.z1 - V) / V) * V,
      hv = r.int(tr.chimney.height[0], tr.chimney.height[1]);
    (tr.plainChimney ? stack : chimney)(
      b,
      cx,
      cz,
      top + roofAt(rx0, rz0, rx1, rz1, rise, !hipped, cx, cz) - V * 0.5,
      hv,
      tr.chimneyC,
      shade(mt.glass, 0.6),
    );
  }
  return b;
}

interface Facade {
  front: Side;
  canal: Side | null;
  shop: boolean;
  great: boolean;
  arched: boolean;
  arcade: boolean;
  frame: RGB | null;
  detail: number;
  seed: number;
  wallC: RGB;
}

/** One storey of one wall: the axes, and the part each axis gets. */
function facade(
  b: Batch,
  f: Box,
  s: Side,
  k: number,
  y: number,
  h: number,
  tr: Tradition,
  mt: Materials,
  r: Rnd,
  o: Facade,
) {
  const wl = wallOf(f.x0, f.z0, f.x1, f.z1, s),
    bay = tr.bay * V,
    n = Math.max(1, Math.floor((wl.len + V) / bay));
  const axes = Array.from({ length: n }, (_, i) => wl.len / 2 + (i - (n - 1) / 2) * bay),
    [ww, wh] = tr.window;
  if (o.detail && !tr.plaster) ashlar(b, wl, y + V, y + (h - 1) * V, o.wallC, o.seed + k * 7 + SIDES.indexOf(s));
  if (o.detail && o.frame && k >= 1)
    timberFrame(b, wl, y - V, h * V, axes, ww, [V + tr.sill * V, V + (tr.sill + wh) * V], o.frame);
  const win = (t: number, hv = wh) => {
    window(b, wl, t, y + tr.sill * V, ww, hv, mt, o.arched, o.detail);
    if (o.detail && !o.arched && r.chance(tr.shutters))
      shutters(b, wl, t, y + tr.sill * V, ww, hv, tr.shutterC ?? tr.wood, o.seed + Math.round(t * 100));
  };
  if (k === 0 && s === o.front && o.arcade) {
    // an arcade: every axis a round arch in a stone surround, dark under the vault (OWN RULE for the prototype)
    const half = (bay - 2 * V) / 2,
      spring = y + (h - 1) * V - half - V;
    for (const t of axes) {
      arch(b, wl, t, y, half + V * 0.5, spring, tr.stone, 0.05);
      arch(b, wl, t, y, half, spring, shade(mt.glass, 0.55), 0.06);
    }
    return;
  }
  if (k === 0 && s === o.front) {
    // the ground floor of the front: a shop at one end, the door beside it or in the middle, windows elsewhere
    const di = o.shop ? Math.min(1, n - 1) : Math.floor(n / 2);
    axes.forEach((t, i) => {
      if (i === di) {
        door(b, wl, t, y, tr.door[0], tr.door[1], mt, o.detail);
        if (o.detail && r.chance(0.5))
          for (const q of [-1, 1]) {
            const p = wl.o;
            jar(
              b,
              p[0] + wl.u[0] * (t + q * (tr.door[0] / 2 + 1.1) * V) + wl.n[0] * V * 0.6,
              y,
              p[2] + wl.u[2] * (t + q * (tr.door[0] / 2 + 1.1) * V) + wl.n[2] * V * 0.6,
              JAR,
            );
          }
        return;
      }
      if (o.shop && i === 0) {
        shop(b, wl, t, y, 4, 5, mt);
        if (o.detail) awning(b, wl, t, y + 6.5 * V, 4, 3, 1.5, r.pick(AWNINGS), WHITE, tr.wood);
        return;
      }
      win(t);
    });
    return;
  }
  if (k === 0 && s === o.canal) {
    // the canal front: the water gate in the middle, where the goods come in (Venetian Gothic: the portico on the canal)
    axes.forEach((t, i) => {
      if (i === Math.floor(n / 2)) gate(b, wl, t, y, 3, 6, mt);
      else win(t);
    });
    return;
  }
  if (k === 0) {
    for (const t of axes) if (r.chance(0.85)) win(t);
    return;
  }
  if (o.great && k === 1 && s === o.front && n >= 3) {
    // the hall storey of a great house: a group of close-set arched lights in the middle (Ruskin: the arcade of Ca' da Mosto), single windows at the ends
    const g = n >= 5 ? 5 : 3,
      step = (ww + 1) * V,
      tall = h - tr.sill - 2;
    for (let i = 0; i < g; i++)
      window(b, wl, wl.len / 2 + (i - (g - 1) / 2) * step, y + tr.sill * V, ww, tall, mt, true, o.detail);
    if (n >= g + 2) {
      win(axes[0], tall);
      win(axes[n - 1], tall);
    }
    return;
  }
  for (const t of axes) win(t);
  // washing across the upper front now and then, between two window axes above their lintels
  if (o.detail && s === o.front && k >= 1 && n >= 2 && r.chance(tr.washing)) {
    const i = r.int(0, n - 2);
    washing(
      b,
      wl,
      axes[i] + (ww / 2 + 0.5) * V,
      axes[i + 1] - (ww / 2 + 0.5) * V,
      y + (tr.sill + wh + 2.5) * V,
      CLOTHS,
      o.seed + k * 13,
    );
  }
}
