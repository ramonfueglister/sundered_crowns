// A far piece glides to the shape of the coarser piece over it: at the end of the way it shows that piece's land and
// water, column for column, and all the way its land is closed.
import { describe, expect, it } from 'vitest';
import { FACE_COL, FACE_GEO, FLIPPED, RISES, type Faces, glided } from '../../src/lookprobe/faces';
import { faced } from '../../src/worldprobe/small';
import { drawLand } from '../../src/worldprobe/table';
import { LAND_STEP, SIDE, part } from './land';
import { OVER, QUARTER, S, colourAt, fate, inside, piece, shown, tall, topOf, topsAt, topsOf } from './glide_rig';

describe('the glide of a far piece to the coarser one over it', () => {
  it('ends where the coarser piece has its columns: every top at the height of the column over it, land that is water there under that water', () => {
    const { fine, parent, ground, carried, columns } = piece();
    let tops = 0,
      sink = 0,
      come = 0;
    for (const f of [ground, carried])
      for (let k = 0; k < f.geo.length / FACE_GEO; k++) {
        const at = topOf(f, k);
        if (!at || !inside(at[0], at[1])) continue;
        const c = fate(fine, parent, at[0], at[1]);
        if (c.start !== f.geo[k * FACE_GEO + 1]) continue;
        tops++;
        // water in both steps has no top, now or then
        expect(c.wetNow && c.wetThen).toBe(false);
        expect(glided(f, k, 0)[0]).toBe(c.start);
        expect(glided(f, k, 1)[0], `${at}`).toBe(c.end);
        expect(glided(f, k, 0.5)[0]).toBeCloseTo((c.start + c.end) / 2, 6);
        if (c.wetThen) {
          sink++;
          expect(c.end / S).toBeLessThan(c.level - 1);
        }
        // a top that comes starts under the water that is there now
        if (c.wetNow) {
          come++;
          expect(c.start / S).toBeLessThan(fine.surf[c.i] - 0.5);
          expect(f).toBe(ground);
        }
      }
    let moving = 0;
    for (let z = part.z0; z < part.z1; z++)
      for (let x = part.x0; x < part.x1; x++) {
        const c = fate(fine, parent, x, z);
        if (!(c.wetNow && c.wetThen)) moving++;
      }
    expect(tops).toBe(moving);
    expect(columns).toBe(moving);
    expect(columns).toBeGreaterThan(1500);
    expect(sink).toBeGreaterThan(200);
    expect(come).toBeGreaterThan(100);
  });

  it('ends in the colours of the coarser piece: each corner of a top shows what the coarser top shows at that point', () => {
    const { fine, parent, ground, carried, before } = piece(),
      tops = topsOf(parent);
    let corners = 0,
      onGround = 0,
      onCarried = 0,
      turned = 0,
      came = 0;
    for (const [f, own] of [
      [ground, 127],
      [carried, 0],
    ] as [Faces, number][])
      for (let k = 0; k < f.geo.length / FACE_GEO; k++) {
        const at = topOf(f, k);
        if (!at || !inside(at[0], at[1])) continue;
        const c = fate(fine, parent, at[0], at[1]),
          top = tops.get(c.p),
          g = k * FACE_GEO;
        if (c.start !== f.geo[g + 1]) continue;
        // (a top that ends under water keeps what it is)
        if (c.wetThen || !top) {
          expect(f.nor[k * 4 + 3]).toBe(own);
          expect(f.aimCol!.slice(k * FACE_COL, (k + 1) * FACE_COL)).toEqual(
            f.col.slice(k * FACE_COL, (k + 1) * FACE_COL),
          );
          continue;
        }
        // ground to the map's paper where the coarser column is ground, whatever the column itself is
        expect(f.nor[k * 4 + 3], `${at}`).toBe(top.carried ? 0 : 127);
        if (top.carried) onCarried++;
        else onGround++;
        if ((f.nor[k * 4 + 3] === 127) !== (own === 127)) turned++;
        if (f === ground && k >= before.faces) came++;
        for (let n = 0; n < 4; n++) {
          const u = f.geo[g + (n === 1 || n === 2 ? 3 : 2)] / S,
            v = f.geo[g + (n >= 2 ? 5 : 4)] / S;
          const want = colourAt(top, (fine.ox + u) / 2 - parent.ox, (fine.oz + v) / 2 - parent.oz),
            has = shown(f.aimCol!, k * FACE_COL + n * 4);
          expect(
            Math.abs(has[0] - want[0]) + Math.abs(has[1] - want[1]) + Math.abs(has[2] - want[2]),
            `${at} corner ${n}`,
          ).toBeLessThan(0.04);
          corners++;
        }
      }
    expect(corners).toBeGreaterThan(5000);
    expect(onGround).toBeGreaterThan(300);
    expect(onCarried).toBeGreaterThan(100);
    expect(turned).toBeGreaterThan(100);
    expect(came).toBeGreaterThan(100);
  });

  it('keeps the land closed all the way: between two columns stands a side as tall as their tops are apart', () => {
    const { fine, parent, ground, carried } = piece();
    for (const share of [0, 0.25, 0.5, 0.8, 1]) {
      const top = new Float64Array(SIDE * SIDE).fill(NaN),
        sides = new Map<string, number>();
      for (const f of [ground, carried])
        for (let k = 0; k < f.geo.length / FACE_GEO; k++) {
          const g = k * FACE_GEO,
            axis = f.geo[g] % FLIPPED,
            way = f.nor[k * 4 + axis],
            at = topOf(f, k),
            [end0, end1] = glided(f, k, share);
          if (axis === 1) {
            if (at) top[at[1] * SIDE + at[0]] = end0;
            continue;
          }
          const a = axis === 0 ? 4 : 2,
            along = Math.floor(Math.min(f.geo[g + a], f.geo[g + a + 1]) / S),
            across = f.geo[g + 1] / S - (way > 0 ? 1 : 0);
          const key = `${axis === 0 ? across : along},${axis === 0 ? along : across},${axis},${way > 0 ? 1 : -1}`;
          sides.set(
            key,
            (sides.get(key) ?? 0) + Math.abs(end1 - end0) * (Math.abs(f.geo[g + a + 1] - f.geo[g + a]) / S),
          );
        }
      let edges = 0,
        shores = 0;
      for (let z = part.z0; z < part.z1; z++)
        for (let x = part.x0; x < part.x1; x++) {
          const i = z * SIDE + x;
          // (water that stays water has no top: its bed lies where it lay)
          if (Number.isNaN(top[i])) {
            const c = fate(fine, parent, x, z);
            expect(c.wetNow && c.wetThen, `${x}, ${z} has a top`).toBe(true);
            continue;
          }
          for (const [dx, dz, axis] of [
            [1, 0, 0],
            [-1, 0, 0],
            [0, 1, 2],
            [0, -1, 2],
          ] as const) {
            const nx = x + dx,
              nz = z + dz,
              j = nz * SIDE + nx;
            if (!inside(nx, nz)) continue;
            edges++;
            if (Number.isNaN(top[j])) shores++;
            // (the ends of a side are whole 64ths at the two ends of the way and anything between: a side may miss its neighbour's top by the rounding;
            // against water that stays water it stands in the bed, which moves too)
            const bed = fate(fine, parent, nx, nz),
              low = Number.isNaN(top[j]) ? bed.start + (bed.end - bed.start) * share : top[j];
            expect(
              Math.abs(Math.max(0, top[i] - low) - (sides.get(`${x},${z},${axis},${dx + dz}`) ?? 0)),
              `share ${share}: ${x}, ${z} towards ${dx}, ${dz}`,
            ).toBeLessThanOrEqual(1);
          }
        }
      expect(edges).toBeGreaterThan(5000);
      expect(shores).toBeGreaterThan(20);
    }
  });

  it('adds the faces that are to come: sides with no height until the columns part, tops under the water', () => {
    const { fine, parent, ground, before } = piece(),
      count = ground.geo.length / FACE_GEO;
    expect(count).toBeGreaterThan(before.faces + 200);
    // the faces the piece had are where they were, in their own colours
    expect(ground.geo.slice(0, before.faces * FACE_GEO)).toEqual(before.geo);
    expect(ground.col.slice(0, before.faces * FACE_COL)).toEqual(before.col);
    for (let k = 0; k < before.faces; k++) expect(ground.geo[k * FACE_GEO]).toBeLessThan(RISES);
    let sides = 0,
      tops = 0,
      under = 0,
      gone = 0;
    for (let k = before.faces; k < count; k++) {
      const g = k * FACE_GEO,
        kind = ground.geo[g],
        axis = kind % FLIPPED,
        way = ground.nor[k * 4 + axis] > 0 ? 1 : -1,
        a = axis === 0 ? 4 : 2;
      // it shows at once what it will show: a face that comes has no colour of its own to come from
      expect(ground.col.slice(k * FACE_COL, (k + 1) * FACE_COL)).toEqual(
        ground.aimCol!.slice(k * FACE_COL, (k + 1) * FACE_COL),
      );
      if (axis === 1) {
        tops++;
        expect(kind).toBeLessThan(RISES);
        const at = topOf(ground, k)!,
          c = fate(fine, parent, at[0], at[1]);
        expect(c.wetNow && !c.wetThen).toBe(true);
        continue;
      }
      sides++;
      expect(kind).toBeGreaterThanOrEqual(RISES);
      const along = Math.floor(Math.min(ground.geo[g + a], ground.geo[g + a + 1]) / S),
        across = ground.geo[g + 1] / S - (way > 0 ? 1 : 0);
      const x = axis === 0 ? across : along,
        z = axis === 0 ? along : across,
        own = fate(fine, parent, x, z),
        next = fate(fine, parent, axis === 0 ? x + way : x, axis === 0 ? z : z + way);
      const [low0, high0] = glided(ground, k, 0),
        [low1, high1] = glided(ground, k, 1);
      // a column of land: no side now (it is not above its neighbour), one then
      if (!own.wetNow) {
        expect(own.start).toBeLessThanOrEqual(next.start);
        expect(high0 - low0).toBe(0);
        expect(high1 - low1).toBeGreaterThan(0);
      }
      // a column of water that ends as land: a side now where its bed lies above its neighbour's, under the water;
      // one then where it ends above its neighbour; and one of the two at least
      else {
        if (high0 > low0) {
          under++;
          expect(low0).toBe(next.start);
          expect(high0).toBe(own.start);
          expect(high0 / S).toBeLessThan(fine.surf[own.i] - 0.5);
          if (high1 === low1) gone++;
        }
        expect(high0 > low0 || high1 > low1).toBe(true);
      }
      // then: from the neighbour's top up to the column's own, where that is above it
      expect(low1).toBe(next.end);
      expect(high1).toBe(Math.max(own.end, next.end));
    }
    expect(sides).toBeGreaterThan(200);
    expect(tops).toBeGreaterThan(100);
    expect(under).toBeGreaterThan(10);
    expect(gone).toBeGreaterThan(3);
  });

  it('never turns a side over: where the coarser step has the columns the other way round, the side is gone', () => {
    const { ground, carried } = piece();
    let gone = 0;
    for (const f of [ground, carried])
      for (let k = 0; k < f.geo.length / FACE_GEO; k++) {
        const g = k * FACE_GEO,
          kind = f.geo[g],
          axis = kind % FLIPPED;
        if (axis === 1) continue;
        const lo = axis === 0 ? 2 : 4,
          up = kind >= RISES || f.geo[g + lo + 1] >= f.geo[g + lo] ? 1 : -1;
        for (const share of [0, 0.3, 0.7, 1]) {
          const [end0, end1] = glided(f, k, share);
          expect((end1 - end0) * up).toBeGreaterThanOrEqual(0);
        }
        if (kind < RISES && f.geo[g + lo + 1] !== f.geo[g + lo] && glided(f, k, 1)[0] === glided(f, k, 1)[1]) gone++;
      }
    expect(gone).toBeGreaterThan(200);
  });

  it('takes the crowns of its woods down into their columns and brings up those of the coarser piece, where that piece has them', () => {
    const { fine, parent, carried, before } = piece(),
      count = carried.geo.length / FACE_GEO;
    /** a face of a crown: the column it stands inside (x, z), of a ground `side` columns a side; none for any other face */
    const crownOf = (f: Faces, k: number, side: number): [number, number] | null => {
      const g = k * FACE_GEO,
        axis = f.geo[g] % FLIPPED,
        level = f.geo[g + 1],
        u = [f.geo[g + 2], f.geo[g + 3]],
        v = [f.geo[g + 4], f.geo[g + 5]];
      if (axis === 1) {
        if (topOf(f, k)) return null;
        const x = Math.floor(Math.min(...u) / S),
          z = Math.floor(Math.min(...v) / S);
        return Math.max(...u) <= (x + 1) * S && Math.max(...v) <= (z + 1) * S && x < side && z < side ? [x, z] : null;
      }
      if (level % S) {
        const a = axis === 0 ? v : u,
          along = Math.floor(Math.min(...a) / S);
        return axis === 0 ? [Math.floor(level / S), along] : [along, Math.floor(level / S)];
      }
      return null;
    };
    // its own: down into the column, under its top at the end, with no height
    let own = 0;
    for (let k = 0; k < before.carried; k++) {
      const at = crownOf(carried, k, SIDE);
      if (!at || !inside(at[0], at[1])) continue;
      const c = fate(fine, parent, at[0], at[1]),
        axis = carried.geo[k * FACE_GEO] % FLIPPED,
        [end0, end1] = glided(carried, k, 1);
      if (c.wetNow && c.wetThen) continue;
      own++;
      expect(end0, `${at}`).toBeLessThan(c.end);
      expect(end0).toBeGreaterThan(c.end - 0.1 * S);
      if (axis !== 1) expect(end1).toBe(end0);
      // (a crown stands on its column's top, now)
      expect(axis === 1 ? glided(carried, k, 0)[0] : Math.min(...glided(carried, k, 0))).toBeGreaterThanOrEqual(
        c.start,
      );
    }
    expect(own).toBeGreaterThan(500);
    // the coarser piece's: each of its crowns' faces over the piece, under the columns now, where that piece has them then
    const theirs = faced(drawLand(parent, true, QUARTER, LAND_STEP + 1).carried).faces!,
      wanted: string[] = [],
      came: string[] = [];
    for (let k = 0; k < theirs.geo.length / FACE_GEO; k++) {
      const at = crownOf(theirs, k, parent.side);
      if (!at) continue;
      const g = k * FACE_GEO,
        axis = theirs.geo[g] % FLIPPED,
        X = (u: number) => 2 * u + (2 * parent.ox - fine.ox) * S,
        Z = (v: number) => 2 * v + (2 * parent.oz - fine.oz) * S,
        Y = (y: number) => Math.round(tall(y / S) * S);
      const level = axis === 1 ? Y(theirs.geo[g + 1]) : axis === 0 ? X(theirs.geo[g + 1]) : Z(theirs.geo[g + 1]);
      const u =
          axis === 0 ? [Y(theirs.geo[g + 2]), Y(theirs.geo[g + 3])] : [X(theirs.geo[g + 2]), X(theirs.geo[g + 3])],
        v = axis === 2 ? [Y(theirs.geo[g + 4]), Y(theirs.geo[g + 5])] : [Z(theirs.geo[g + 4]), Z(theirs.geo[g + 5])];
      wanted.push([axis, level, ...u, ...v, ...theirs.col.slice(k * FACE_COL, (k + 1) * FACE_COL)].join());
    }
    for (let k = before.carried; k < count; k++) {
      const g = k * FACE_GEO,
        axis = carried.geo[g] % FLIPPED,
        [end0, end1] = glided(carried, k, 1),
        [now0, now1] = glided(carried, k, 0);
      // (where it ends up, as the coarser piece has it)
      const level = axis === 1 ? end0 : carried.geo[g + 1],
        u = axis === 0 ? [end0, end1] : [carried.geo[g + 2], carried.geo[g + 3]],
        v = axis === 2 ? [end0, end1] : [carried.geo[g + 4], carried.geo[g + 5]];
      came.push([axis, level, ...u, ...v, ...carried.aimCol!.slice(k * FACE_COL, (k + 1) * FACE_COL)].join());
      expect(carried.col.slice(k * FACE_COL, (k + 1) * FACE_COL)).toEqual(
        carried.aimCol!.slice(k * FACE_COL, (k + 1) * FACE_COL),
      );
      // now: under the tops of the columns about it, with no height
      if (axis !== 1) expect(now1).toBe(now0);
      const x = Math.floor((axis === 0 ? carried.geo[g + 1] : Math.min(carried.geo[g + 2], carried.geo[g + 3])) / S),
        z = Math.floor((axis === 2 ? carried.geo[g + 1] : Math.min(carried.geo[g + 4], carried.geo[g + 5])) / S);
      expect(now0, `${x}, ${z}`).toBeLessThan(topsAt(fine)[z * SIDE + x] * S);
    }
    expect(wanted.length).toBeGreaterThan(300);
    expect(came.sort()).toEqual(wanted.sort());
  });

  it('keeps every mesh within the ball round it, in which the stage looks whether to draw it: where it lies and where it ends up', () => {
    const { shapes } = piece();
    let corners = 0;
    for (const [name, shape] of Object.entries(shapes)) {
      const [cx, cy, cz, r] = shape.ball!;
      let out = 0;
      const lies = (x: number, y: number, z: number) => {
        out = Math.max(out, Math.hypot(x - cx, y - cy, z - cz) - r);
        corners++;
      };
      for (let v = 0; v < shape.pos.length / 3; v++) {
        lies(shape.pos[v * 3], shape.pos[v * 3 + 1], shape.pos[v * 3 + 2]);
        if (shape.sink) lies(shape.pos[v * 3], shape.sink[v], shape.pos[v * 3 + 2]);
      }
      const f = shape.faces;
      if (f)
        for (let k = 0; k < f.geo.length / FACE_GEO; k++)
          for (const share of [0, 1]) {
            const g = k * FACE_GEO,
              axis = f.geo[g] % FLIPPED,
              [end0, end1] = glided(f, k, share),
              lift = f.lift ?? 0;
            for (const a of [0, 1])
              for (const b of [0, 1]) {
                if (axis === 1) lies(f.geo[g + 2 + a] / S, end0 / S + lift, f.geo[g + 4 + b] / S);
                else if (axis === 0) lies(f.geo[g + 1] / S, (a ? end1 : end0) / S + lift, f.geo[g + 4 + b] / S);
                else lies(f.geo[g + 2 + a] / S, (b ? end1 : end0) / S + lift, f.geo[g + 1] / S);
              }
          }
      expect(out, name).toBeLessThanOrEqual(1e-3);
    }
    expect(corners).toBeGreaterThan(50000);
  });

  it('sets nothing where the coarser piece does not lie over the piece', () => {
    const { ground, carried, shapes, before, columns } = piece({ ox: OVER.ox + 40, oz: OVER.oz });
    expect(columns).toBe(0);
    expect(ground.aim).toBeUndefined();
    expect(carried.aim).toBeUndefined();
    expect(ground.geo.length / FACE_GEO).toBe(before.faces);
    expect(shapes.ground.sink).toBeUndefined();
    expect(shapes.raised.sink).toBeUndefined();
    expect(shapes.water.pos.length / 9).toBe(before.water);
    // such faces are drawn where they are, whatever the share
    expect(glided(ground, 0, 0.6)).toEqual(glided(ground, 0, 0));
  });
});
