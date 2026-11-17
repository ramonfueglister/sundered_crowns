// The ball around a mesh, worked out where the mesh is built: off the page's thread.

/** The ball around the points of a list: about the middle of their box, as the stage would work it out on the page's thread. */
export function ballOf(pos: Float32Array): [number, number, number, number] {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i++) { const v = pos[i], k = i % 3; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  if (!pos.length) return [0, 0, 0, 0];
  const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2, cz = (lo[2] + hi[2]) / 2;
  let far = 0;
  for (let i = 0; i < pos.length; i += 3) far = Math.max(far, (pos[i] - cx) ** 2 + (pos[i + 1] - cy) ** 2 + (pos[i + 2] - cz) ** 2);
  return [cx, cy, cz, Math.sqrt(far)];
}
