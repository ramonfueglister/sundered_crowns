// Round and toothed solids: drums (upright prisms), domes, battlements.
import { type Batch, type RGB, type V3, shade } from '../../lookprobe/batch';
import { SIDES, wallOf } from './wall';

/** An upright prism with `segs` sides, closed at the top. */
export function drum(b: Batch, cx: number, y0: number, cz: number, r: number, y1: number, c: RGB, segs = 10, foot = 1) {
  const p = (i: number, y: number): V3 => [
    cx + Math.cos((i / segs) * Math.PI * 2) * r,
    y,
    cz + Math.sin((i / segs) * Math.PI * 2) * r,
  ];
  const lo = shade(c, foot),
    rim: V3[] = [];
  for (let i = 0; i < segs; i++) {
    const am = ((i + 0.5) / segs) * Math.PI * 2;
    b.quad(p(i, y0), p(i + 1, y0), p(i + 1, y1), p(i, y1), [lo, lo, c, c], [Math.cos(am), 0, Math.sin(am)]);
  }
  for (let i = 0; i <= segs; i++) rim.push(p(i, y1));
  b.fan([cx, y1, cz], rim, c, [0, 1, 0]);
}

/** A dome; `squash` above 1 makes it taller than a half sphere. */
export function dome(
  b: Batch,
  cx: number,
  y: number,
  cz: number,
  r: number,
  c: RGB,
  squash = 1.1,
  segs = 12,
  rings = 4,
) {
  const p = (i: number, k: number): V3 => {
    const a = (i / segs) * Math.PI * 2,
      e = ((k / rings) * Math.PI) / 2;
    return [cx + Math.cos(a) * Math.cos(e) * r, y + Math.sin(e) * r * squash, cz + Math.sin(a) * Math.cos(e) * r];
  };
  for (let i = 0; i < segs; i++) {
    const am = ((i + 0.5) / segs) * Math.PI * 2;
    // every other gore a touch darker: the ribs of a lead roof
    for (let k = 0; k < rings; k++)
      b.quad(p(i, k), p(i + 1, k), p(i + 1, k + 1), p(i, k + 1), shade(c, i % 2 ? 0.93 : 1.03), [
        Math.cos(am),
        0.4,
        Math.sin(am),
      ]);
  }
}

/** A row of small blocks along the top edge of a box (battlements), one every `pitch`. */
export function battlements(
  b: Batch,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  c: RGB,
  size = 0.5,
  h = 0.5,
  pitch = size * 2,
) {
  for (const s of SIDES) {
    const w = wallOf(x0, z0, x1, z1, s),
      n = Math.max(2, Math.round(w.len / pitch));
    for (let k = 0; k < n; k++) {
      const t = (w.len - size) * (k / (n - 1)),
        px = w.o[0] + w.u[0] * (t + size / 2) - (w.n[0] * size) / 2,
        pz = w.o[2] + w.u[2] * (t + size / 2) - (w.n[2] * size) / 2;
      b.box(px - size / 2, y, pz - size / 2, px + size / 2, y + h, pz + size / 2, c);
    }
  }
}
