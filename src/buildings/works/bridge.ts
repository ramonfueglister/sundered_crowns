// Bridges over canals and rivers.
import { Batch, rgb, shade } from '../../lookprobe/batch';

/** A stone bridge along x over `span` units of water, deck humped above its ends. */
export function bridge(span: number, width = 3): Batch {
  const b = new Batch(),
    half = span / 2 + 1.6,
    hw = width / 2,
    c = rgb(0xd3c7b4),
    steps = 5;
  for (let k = 0; k < steps; k++) {
    // a stepped hump: the middle pieces lie highest
    const t0 = -half + (2 * half * k) / steps,
      t1 = -half + (2 * half * (k + 1)) / steps,
      y = 0.25 + 0.5 * (1 - Math.abs((k + 0.5) / steps - 0.5) * 2);
    b.box(t0, -1.6, -hw, t1, y, hw, shade(c, 0.9), { top: c, foot: 0.7 });
    for (const z of [-hw - 0.2, hw]) b.box(t0, y - 0.3, z, t1, y + 0.55, z + 0.2, shade(c, 0.96), { bottom: true });
  }
  return b;
}
