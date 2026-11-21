// Ground and water of the probe scene as meshes. The ground is made of columns (one height per cell), as the real
// renderer will be: level neighbours form one smooth surface, steps show only where heights differ.
import { Batch, type RGB, fbm2, hash2, mix, noise2, rgb, shade, smooth } from './batch';
import { type Ground, type GroundTraits, Mat, N, SEA_Y, SUMMIT, idx, rockPillar } from './layout';
import { litness } from './light';
import { ISLE_STONE, QUAY, cornerColour, meadowPatch, topColor } from './terrain_colours';
import { type Corners, lightAt, reliefOf } from './terrain_light';
import { FLOOR, coveredBy, drawCrown, wooded, woodsOf } from './terrain_woods';

/** how much the single stones of a cliff differ in brightness, and how much darker its notches are */
const ROCK_GRAIN = 0.3,
  ROCK_NOTCH = 0.3;
const ROCK_SIDE_LOW = rgb(0xa09a9e),
  ROCK_SIDE = rgb(0xc4ac9e),
  ROCK_SIDE_COOL = rgb(0xa8b4c0),
  ROCK_SIDE_HIGH = rgb(0xfff5ed),
  ROCK_SIDE_HIGH_COOL = rgb(0xd0dae6);
const EARTH = rgb(0x9a8450);
export const WATER_SHALLOW = rgb(0x349aa4),
  WATER_DEEP = rgb(0x2b818c),
  FALLS = rgb(0x9fd6d8);
/** A rectangle of columns of the ground: x0 ≤ x < x1, z0 ≤ z < z1. */
export interface Part {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
const whole = (): Part => ({ x0: 0, z0: 0, x1: N, z1: N });

/** a column is what it carries, and not ground, from this share of cover on (GroundTraits.cover) */
const CARRIED_FROM = 0.5;

/**
 * How far the sides of meadow steps take the colour of the meadow above them at each step of the map
 * (GroundTraits.sideTop), lifted so that a side would be as bright as the meadow above it (`LIFT`): less at the
 * finest step, where a step is a bank one sees up close, and more the farther out, where the sides drew a dark line
 * along every step across the land.
 */
const SIDE_TOP = [0.45, 0.6, 0.7, 0.8, 0.85, 0.9, 0.9, 0.9];
/**
 * A side lies in less light than a top: the colour that makes a side facing each way (east, west, south, north) as
 * bright as the top above it under the stage's lights, as a factor of the top's colour (no more than SIDE_MOST allows).
 */
const LIFT = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
].map((n) => litness([0, 1, 0]) / litness(n as [number, number, number]));
/** the brightest a side's colour may become (below worldprobe/small.ts BRIGHTEST, 2) */
const SIDE_MOST = 1.9;
export const sideTopAt = (step: number) => SIDE_TOP[Math.max(0, Math.min(SIDE_TOP.length - 1, step))];

/** the four columns beside a column: east, west, south, north */
const NB_X = [1, -1, 0, 0],
  NB_Z = [0, 0, 1, -1];
/**
 * `baked` switches the sky share on (light step 2); without it the ground has only the live sun and sky of step 1.
 * `part` limits the mesh to a rectangle of columns, for a ground that is one piece of a larger world.
 * With `carried` the tops and sides of what the columns carry as part of themselves (houses, trees and fields of a
 * far step, `cover`) are put there instead of into the ground: a mesh of its own, which the stage treats as what
 * stands on the ground (Stage.lay).
 */
export function buildTerrain(g: Ground, t: GroundTraits, baked = true, part: Part = whole(), carried?: Batch): Batch {
  const ox = g.ox ?? 0,
    oz = g.oz ?? 0;
  const b = new Batch();
  // (a top to each column and, on land that is not level, about as much again in sides)
  b.reserve((part.x1 - part.x0) * (part.z1 - part.z0) * 4);
  // A corner of the grid is asked for its light by each of the four columns around it, at that column's height:
  // where they are level, as most land is, the answer is the one given before (a seventh of a piece's building
  // time went into working it out four times).
  // So with the colour of the ground at a corner of the grid: the four columns around it ask for it, and where they
  // are of one kind of ground the answer is the same (a ninth of a near piece's building time went into it).
  const side = N + 1,
    woods = woodsOf(g, t),
    tops = woods ? woods.tops : g.h;
  const c: Corners = {
    g: woods ? { ...g, occ: woods.occ } : g,
    t,
    ox,
    oz,
    side,
    askedAt: baked ? new Float64Array(side * side).fill(NaN) : null,
    answer: baked ? new Float64Array(side * side) : null,
    groundAt: new Array(side * side),
    kindAt: new Int8Array(side * side).fill(-1),
  };
  const relief = reliefOf(g, tops),
    towardsTop = t.sideTop ?? 0;
  for (let z = part.z0; z < part.z1; z++)
    for (let x = part.x0; x < part.x1; x++) {
      const i = idx(x, z),
        h = tops[i],
        mat = g.mat[i],
        wx = x + ox,
        wz = z + oz;
      // every cell is a touch lighter or darker than its neighbours: the fine grain of the reference's ground
      // paving lies in slabs of two by two cells, every other row shifted by one
      const col = Math.floor(wx / 2),
        slab = hash2(col, Math.floor((wz + (col % 2)) / 2), 47) - 0.5;
      const grain =
        mat === Mat.Rock
          ? 1
          : mat === Mat.Paved
            ? (1.03 + slab * 0.22 + (hash2(wx, wz, 45) - 0.5) * 0.1) *
              (hash2(wx, wz, 46) < 0.06 ? 0.8 : hash2(wx, wz, 46) > 0.95 ? 1.1 : 1)
            : 1 + (hash2(wx, wz, 45) - 0.5) * (t.road(x + 0.5, z + 0.5) < 1.7 ? 0.16 : 0.1);
      // a rock column has one colour over its whole top, so that the cubes stay crisp
      const rockTop = mat === Mat.Rock ? topColor(t, x, z, mat, wx, wz) : null,
        pale = mat === Mat.Rock && t.summit(x, z) > SUMMIT;
      const tint = mat === Mat.Grass || mat === Mat.Soil ? (t.tint?.(x + 0.5, z + 0.5) ?? null) : null;
      // a column that carries a house, a tree or a field as part of itself has their colour over its whole top; the
      // floor of a wood is darker than its crowns, and where its trees cover part of the column the ground's own
      const carries = g.wet[i] ? null : (t.cover?.(x, z) ?? null),
        crowned = !!woods && !Number.isNaN(woods.crowns[i * 5]);
      const part = !!carries && coveredBy(carries) < 1,
        cover =
          !woods || !wooded(carries) || (!crowned && part)
            ? carries
            : crowned && part
              ? null
              : { ...carries!, top: shade(carries!.top, FLOOR) };
      // the tiled meadow belongs to green land
      const patch =
        !cover &&
        mat === Mat.Grass &&
        t.road(x + 0.5, z + 0.5) > 2.2 &&
        !t.city(x + 0.5, z + 0.5) &&
        !(tint && tint[1] > 0.4)
          ? meadowPatch(wx, wz)
          : null;
      const r00 = cornerColour(c, x, z, h, mat, grain, cover, rockTop, patch),
        r10 = cornerColour(c, x + 1, z, h, mat, grain, cover, rockTop, patch);
      const r11 = cornerColour(c, x + 1, z + 1, h, mat, grain, cover, rockTop, patch),
        r01 = cornerColour(c, x, z + 1, h, mat, grain, cover, rockTop, patch);
      // (the relief lightens or darkens the tops alone: the sides keep the light of their own direction)
      const q = z * side + x,
        c00 = shade(r00, relief[q]),
        c10 = shade(r10, relief[q + 1]),
        c11 = shade(r11, relief[q + side + 1]),
        c01 = shade(r01, relief[q + side]);
      const on = carried && cover && cover.stands !== false && !(cover.share! < CARRIED_FROM) ? carried : b;
      // (a wooded column is drawn at its ground: what it carries has no sides of its own but its crown's)
      const rise = woods && wooded(carries) ? 0 : cover ? cover.rise : 0;
      if (!g.wet[i]) on.quadAt(x, h, z, x, h, z + 1, x + 1, h, z + 1, x + 1, h, z, c00, c01, c11, c10, 0, 1, 0);
      if (g.wet[i]) continue;
      if (crowned) drawCrown(carried ?? b, c, woods!.crowns, i, h, carries!, grain, wx, wz);
      for (let k = 0; k < 4; k++) {
        const dx = NB_X[k],
          dz = NB_Z[k],
          nx = x + dx,
          nz = z + dz;
        const out = nx < 0 || nz < 0 || nx >= N || nz >= N;
        const nh = out ? 0 : tops[idx(nx, nz)];
        if (nh >= h) continue;
        const wetSide = !out && g.wet[idx(nx, nz)] === 1;
        let side: RGB;
        // rock: on the faces towards the sun grey stone that turns warm and light towards the summits, slate blue on
        // those turned away, each pillar lighter or darker than the next and a third of the slate ones dark
        if (mat === Mat.Rock) {
          const [rx, rz] = rockPillar(wx, wz),
            lot = hash2(rx, rz, 35);
          side =
            dx === 1
              ? shade(mix(ROCK_SIDE_LOW, ROCK_SIDE, smooth(0.2, SUMMIT, t.summit(x, z))), 0.86 + 0.24 * lot)
              : shade(ROCK_SIDE_COOL, lot < 0.35 ? 0.42 + 0.3 * lot : 0.6 + 0.4 * lot);
        } else if (mat === Mat.Paved && !t.city(x + 0.5, z + 0.5))
          side = shade(ISLE_STONE, 0.9 + 0.12 * hash2(Math.floor(wx / 2), Math.floor(wz / 2), 37));
        else if (wetSide || mat === Mat.Paved) side = shade(QUAY, 0.9 + 0.2 * hash2(wx, wz, 37));
        else side = t.slope ? shade(t.slope, 0.9 + 0.2 * hash2(wx, wz, 37)) : EARTH;
        // from afar a meadow step takes the colour of the meadow above it (GroundTraits.sideTop)
        const meadowSide = towardsTop > 0 && !wetSide && (mat === Mat.Grass || mat === Mat.Soil);
        if (meadowSide) {
          // (no brighter than a corner's colour can be told: worldprobe/small.ts BRIGHTEST)
          const r = r00[0] + r10[0] + r11[0] + r01[0],
            gr = r00[1] + r10[1] + r11[1] + r01[1],
            bl = r00[2] + r10[2] + r11[2] + r01[2];
          const lift = Math.min(LIFT[k], (4 * SIDE_MOST) / Math.max(r, gr, bl, 1e-6)) / 4;
          side = mix(side, [r * lift, gr * lift, bl * lift], towardsTop);
        }
        if (tint && !wetSide) side = mix(side, shade(tint[0], 0.8), tint[1]);
        // the two top corners of this side, in the order that keeps the face turned outwards
        const ax = dx === 1 ? x + 1 : dx === -1 ? x : dz === 1 ? x : x + 1,
          az = dz === 1 ? z + 1 : dz === -1 ? z : dx === 1 ? z : z + 1;
        const bx = dx === 1 ? x + 1 : dx === -1 ? x : dz === 1 ? x + 1 : x,
          bz = dz === 1 ? z + 1 : dz === -1 ? z : dx === 1 ? z + 1 : z;
        let la = lightAt(c, ax + dx * 0.3, az + dz * 0.3, h - 0.2),
          lb = lightAt(c, bx + dx * 0.3, bz + dz * 0.3, h - 0.2);
        // (and where it takes the meadow's colour, the sky's light of the meadow too: in the corner under a step the
        // sky's share was what drew the line)
        if (meadowSide) {
          la += (1 - la) * towardsTop;
          lb += (1 - lb) * towardsTop;
        }
        const foot = meadowSide ? 0.7 + 0.3 * towardsTop : 0.7;
        if (mat === Mat.Rock) {
          // cliffs: flat faces without a gradient, pale for the upper two or four blocks of a pale pillar, grey below
          const [sx, sz] = rockPillar(wx, wz),
            split = pale ? Math.max(nh, h - 2 - 2 * Math.floor(hash2(sx, sz, 38) * 2)) : h,
            la2 = 0.5 + 0.5 * la,
            lb2 = 0.5 + 0.5 * lb;
          // the wall is built of stones half a block wide and one to three high, each a touch lighter or darker than
          // the next and a few of them dark, as notches: the fine drawing of the reference's cliffs
          const mx = (ax + bx) / 2,
            mz = (az + bz) / 2,
            lm2 = (la2 + lb2) / 2;
          for (let half = 0; half < 2; half++)
            for (let y = nh; y < h; ) {
              const key = wx * 4 + dx + half,
                lot = hash2(key, wz * 4 + dz, 100 + y),
                top = Math.min(y < split ? split : h, y + 1 + Math.floor(lot * 3));
              const tone =
                1 +
                (y < split ? 1 : 0.4) *
                  ((hash2(key, wz * 4 + dz, 300 + y) - 0.5) * ROCK_GRAIN - (lot > 0.9 ? ROCK_NOTCH : 0));
              const base = y < split ? side : dx === 1 ? ROCK_SIDE_HIGH : ROCK_SIDE_HIGH_COOL;
              const px = half ? mx : ax,
                pz = half ? mz : az,
                qx = half ? bx : mx,
                qz = half ? bz : mz,
                lp = y < split ? (half ? lm2 : la2) : 1,
                lq = y < split ? (half ? lb2 : lm2) : 1;
              b.quadAt(
                px,
                y,
                pz,
                qx,
                y,
                qz,
                qx,
                top,
                qz,
                px,
                top,
                pz,
                shade(base, lp * tone),
                shade(base, lq * tone),
                shade(base, lq * tone),
                shade(base, lp * tone),
                dx,
                0,
                dz,
              );
              y = top;
            }
          continue;
        }
        // what the column carries shows its own sides, down to the ground it stands on
        const ground = cover ? Math.max(nh, h - rise) : h;
        if (ground < h)
          on.quadAt(
            ax,
            ground,
            az,
            bx,
            ground,
            bz,
            bx,
            h,
            bz,
            ax,
            h,
            az,
            shade(cover!.side, la * 0.85),
            shade(cover!.side, lb * 0.85),
            shade(cover!.side, lb),
            shade(cover!.side, la),
            dx,
            0,
            dz,
          );
        if (nh < ground)
          b.quadAt(
            ax,
            nh,
            az,
            bx,
            nh,
            bz,
            bx,
            ground,
            bz,
            ax,
            ground,
            az,
            shade(side, la * foot),
            shade(side, lb * foot),
            shade(side, lb),
            shade(side, la),
            dx,
            0,
            dz,
          );
      }
    }
  return b;
}

/**
 * the colour of open water as the picture shows it (the blue of the sea's shelf in sea.ts, as lit); the picture uses
 * it as its backdrop so that mirrored sky leaves the water as it is, and beyond the farthest pieces the backdrop does
 * not stand out against the sea
 */
export const OPEN_WATER = rgb(0x006c96);

/** The water as level sheets. `raised` picks the water above sea level (lakes, rivers) instead of the sea. */
export function buildWater(g: Ground, raised = false, part: Part = whole()): Batch {
  const b = new Batch(),
    ox = g.ox ?? 0,
    oz = g.oz ?? 0;
  const depthAt = (cx: number, cz: number) => {
    let sum = 0,
      n = 0;
    for (let dz = -1; dz <= 0; dz++)
      for (let dx = -1; dx <= 0; dx++) {
        const x = cx + dx,
          z = cz + dz;
        if (x < 0 || z < 0 || x >= N || z >= N) continue;
        sum += g.shore[idx(x, z)];
        n++;
      }
    return n ? sum / n : 14;
  };
  // (a corner of the grid is asked for by the four columns of water around it: its colour is worked out once)
  const shades: RGB[] = new Array((N + 1) * (N + 1));
  const corner = (cx: number, cz: number): RGB => {
    const at = cz * (N + 1) + cx,
      known = shades[at];
    if (known) return known;
    const k = smooth(0.4, 8, depthAt(cx, cz) + (noise2((cx + ox) / 5, (cz + oz) / 5, 41) - 0.5) * 2);
    // the open water is calm: broad, soft patches a little lighter or darker, no strokes
    const tone = shade(
      mix(WATER_SHALLOW, WATER_DEEP, k),
      0.91 + 0.14 * fbm2((cx + ox) / 14, (cz + oz) / 14, 43) + 0.05 * hash2(cx + ox, cz + oz, 44),
    );
    shades[at] = tone;
    return tone;
  };
  for (let z = part.z0; z < part.z1; z++)
    for (let x = part.x0; x < part.x1; x++) {
      const i = idx(x, z),
        y = g.surf[i];
      if (!g.wet[i] || y > SEA_Y + 0.01 !== raised) continue;
      b.quadAt(
        x,
        y,
        z,
        x,
        y,
        z + 1,
        x + 1,
        y,
        z + 1,
        x + 1,
        y,
        z,
        corner(x, z),
        corner(x, z + 1),
        corner(x + 1, z + 1),
        corner(x + 1, z),
        0,
        1,
        0,
      );
      // where raised water meets lower water it falls: a pale sheet down to the lower surface
      if (raised)
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx,
            nz = z + dz,
            low = nx >= 0 && nz >= 0 && nx < N && nz < N && g.wet[idx(nx, nz)] ? g.surf[idx(nx, nz)] : y;
          if (low > y - 0.01) continue;
          const ax = dx === 1 ? x + 1 : x,
            az = dz === 1 ? z + 1 : z,
            bx = dx === -1 ? x : x + 1,
            bz = dz === -1 ? z : z + 1;
          b.quadAt(ax, low, az, bx, low, bz, bx, y, bz, ax, y, az, FALLS, FALLS, FALLS, FALLS, dx, 0, dz);
        }
    }
  return b;
}

/**
 * Open sea far from any coast, for a piece of the world without land: the same water in sheets `step` columns wide.
 * (ox, oz) is the world block of the ground's first column.
 */
export function buildOpenSea(ox: number, oz: number, part: Part, step = 8): Batch {
  const b = new Batch(),
    corner = (x: number, z: number): RGB =>
      shade(WATER_DEEP, 0.91 + 0.14 * fbm2((x + ox) / 14, (z + oz) / 14, 43) + 0.025);
  for (let z = part.z0; z < part.z1; z += step)
    for (let x = part.x0; x < part.x1; x += step) {
      const x1 = Math.min(part.x1, x + step),
        z1 = Math.min(part.z1, z + step);
      b.quadAt(
        x,
        SEA_Y,
        z,
        x,
        SEA_Y,
        z1,
        x1,
        SEA_Y,
        z1,
        x1,
        SEA_Y,
        z,
        corner(x, z),
        corner(x, z1),
        corner(x1, z1),
        corner(x1, z),
        0,
        1,
        0,
      );
    }
  return b;
}
