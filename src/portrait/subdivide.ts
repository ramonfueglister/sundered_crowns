// Finer skin. The builder's head is a net of some eleven thousand triangles for the whole body; along the back of a
// nose they are 8 mm long. Lit square on, that does not show: the light is passed evenly from corner to corner. But
// the edge of a shadow and a highlight are lines on the surface, and on such a net they are bent at every edge of a
// triangle (round 84: the pale streak a light from behind draws down a man's nose ran in zigzag, and a bald head
// had corners in its outline).
//
// The stage therefore draws the skin as the smooth surface that the net stands for: Loop's subdivision surface
// (Charles Loop, Smooth Subdivision Surfaces Based on Triangles, 1987), which is what film and games draw a net of
// triangles as. Each triangle is split in four, the corners are moved by Loop's rules, and in the end every corner
// is set on the surface the splitting would arrive at if it went on for ever (the limit position), with that
// surface's own normal (from the tangent masks): the normals turn evenly, with no bend at an edge. The weights are
// those of Pixar's OpenSubdiv (opensubdiv/sdc/loopScheme.h, read for this): a neighbour's share in a step is
// (5/8 - (3/8 + cos(2π/n)/4)²) / n for a corner with n neighbours, a new corner on an edge takes 3/8 of each end
// and 1/8 of each corner opposite, a neighbour's share in the limit position is 1 / (n + 3 / (8 × its share in a
// step)), and the two tangents are the neighbours in their order round the corner weighted by cos(2πi/n) and
// sin(2πi/n).
//
// Loop's surface lies inside its net where the net is rounded outwards: on the builder's heads a corner of the
// face ends 0.7 mm off its place in the mean and 2 mm at the twentieth worst (a nose's tip, where the net is
// fine, 0.3 mm).
// `fit` moves the net's corners towards the outside first, in rounds: each corner by what its limit position is off
// (progressive interpolation: Cheng, Fan, Lai, Huang, Wang & Yong, Loop Subdivision Surface Based Progressive
// Interpolation, Journal of Computer Science and Technology 24(1), 2009, read for this). Carried on to the end,
// the surface goes through every corner, but then it waves between them wherever the net is uneven (round 84:
// ripples round the eyes and along the nose from the second round on). One round brings the broad forms back (a
// corner of the face is then 0.3 mm off in the mean, 1 mm at the twentieth worst) and does not follow the net's
// own unevenness: after k rounds a wave of the net that the limit position keeps the share λ of is kept to
// 1 - (1 - λ)^(k+1), which is never more than was given.
//
// Corners written out singly are one corner where they lie at one place (`weld`); an edge with one triangle or
// more than two on it is a border and keeps to the rules of a border curve (3/4 and 1/8 in a step, 2/3 and 1/6 in
// the limit); where borders meet, the corner stays. What a corner carries besides its place (colour, the place in
// its image) is halved along the edges of its own triangle, so a seam in the image stays where it is.

/** Which corners lie at one place: per corner the number of its place, and how many places there are. Corners
 *  within 0.0004 of the unit of each other are one place (three numbers of 17 bits in one key: places up to 26
 *  units from the origin, which is a person of 2.6 m in the builder's unit of 10 cm). */
export function weld(pos: ArrayLike<number>): { place: Int32Array; places: number } {
  const n = Math.floor(pos.length / 3), place = new Int32Array(n), seen = new Map<number, number>();
  const grid = (v: number): number => Math.round(v * 2500) + 65536;
  for (let i = 0; i < n; i++) {
    const key = (grid(pos[3 * i]!) * 131072 + grid(pos[3 * i + 1]!)) * 131072 + grid(pos[3 * i + 2]!);
    let at = seen.get(key);
    if (at === undefined) { at = seen.size; seen.set(key, at); }
    place[i] = at;
  }
  return { place, places: seen.size };
}

/** What a corner carries besides its place: `size` numbers per corner. */
export interface CornerData { data: Float32Array; size: number }

/** A net: its triangles by the numbers of their corners' places, and around them who neighbours whom. */
interface Net {
  /** per edge its two ends */
  ends: Int32Array;
  /** per edge the corners opposite it in its first two triangles (-1 = none) */
  opposite: Int32Array;
  /** per edge how many triangles lie on it */
  faces: Int32Array;
  /** per triangle and corner k: the edge from corner k to corner k + 1 */
  edgeOf: Int32Array;
  /** per place: the places an edge away, and those of them along a border */
  around: number[][];
  border: number[][];
}

function net(places: number, tri: Int32Array): Net {
  const triangles = tri.length / 3, index = new Map<number, number>();
  const ends: number[] = [], opposite: number[] = [], faces: number[] = [], edgeOf = new Int32Array(3 * triangles);
  for (let t = 0; t < triangles; t++) {
    for (let k = 0; k < 3; k++) {
      const a = tri[3 * t + k]!, b = tri[3 * t + (k + 1) % 3]!, c = tri[3 * t + (k + 2) % 3]!;
      const key = a < b ? a * places + b : b * places + a;
      let e = index.get(key);
      if (e === undefined) { e = faces.length; index.set(key, e); ends.push(Math.min(a, b), Math.max(a, b)); opposite.push(-1, -1); faces.push(0); }
      if (faces[e]! < 2) opposite[2 * e + faces[e]!] = c;
      faces[e]!++;
      edgeOf[3 * t + k] = e;
    }
  }
  const around = Array.from({ length: places }, () => [] as number[]), border = Array.from({ length: places }, () => [] as number[]);
  for (let e = 0; e < faces.length; e++) {
    const a = ends[2 * e]!, b = ends[2 * e + 1]!;
    around[a]!.push(b); around[b]!.push(a);
    if (faces[e] !== 2) { border[a]!.push(b); border[b]!.push(a); }
  }
  return { ends: Int32Array.from(ends), opposite: Int32Array.from(opposite), faces: Int32Array.from(faces), edgeOf, around, border };
}

/** Loop's weight of a neighbour when a corner with `n` neighbours is moved in a step of splitting. */
function stepWeight(n: number): number {
  const c = 3 / 8 + Math.cos(2 * Math.PI / n) / 4;
  return (5 / 8 - c * c) / n;
}

/** The weight of a neighbour in the limit position of a corner with `n` neighbours. */
function limitWeight(n: number): number {
  return 1 / (n + 3 / (8 * stepWeight(n)));
}

/** Every place set to (1 - n w) of itself and w of each of its n neighbours; on a border `own` of itself and
 *  `side` of each of its two neighbours along the border; where borders meet (or end) it stays. */
function moved(at: Float64Array, of: Net, weight: (n: number) => number, own: number, side: number): Float64Array {
  const out = new Float64Array(at.length);
  for (let v = 0; v < of.around.length; v++) {
    const border = of.border[v]!, around = of.around[v]!;
    for (let k = 0; k < 3; k++) {
      const p = at[3 * v + k]!;
      if (border.length === 2) out[3 * v + k] = own * p + side * (at[3 * border[0]! + k]! + at[3 * border[1]! + k]!);
      else if (border.length > 0 || around.length < 3) out[3 * v + k] = p;
      else {
        const w = weight(around.length);
        let sum = 0;
        for (const b of around) sum += at[3 * b + k]!;
        out[3 * v + k] = (1 - around.length * w) * p + w * sum;
      }
    }
  }
  return out;
}

/** The surface's normal at every place of a net, from Loop's tangent masks (the neighbours in their order round
 *  the place, weighted by the cosine and the sine of their angle of a full turn); on a border, the mean of the
 *  triangles' normals at the limit positions `on`. */
function normals(at: Float64Array, on: Float64Array, tri: Int32Array, of: Net): Float32Array {
  const places = of.around.length, out = new Float32Array(3 * places), flat = new Float64Array(3 * places);
  // per place the pairs (next, the one after) of its triangles, which chain the neighbours round it
  const fan = Array.from({ length: places }, () => [] as number[]);
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t]!, b = tri[t + 1]!, c = tri[t + 2]!;
    fan[a]!.push(b, c); fan[b]!.push(c, a); fan[c]!.push(a, b);
    const ux = on[3 * b]! - on[3 * a]!, uy = on[3 * b + 1]! - on[3 * a + 1]!, uz = on[3 * b + 2]! - on[3 * a + 2]!;
    const vx = on[3 * c]! - on[3 * a]!, vy = on[3 * c + 1]! - on[3 * a + 1]!, vz = on[3 * c + 2]! - on[3 * a + 2]!;
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    for (const v of [a, b, c]) { flat[3 * v]! += x; flat[3 * v + 1]! += y; flat[3 * v + 2]! += z; }
  }
  const ring: number[] = [];
  for (let v = 0; v < places; v++) {
    let x = flat[3 * v]!, y = flat[3 * v + 1]!, z = flat[3 * v + 2]!;
    const n = of.around[v]!.length, pairs = fan[v]!;
    if (of.border[v]!.length === 0 && n >= 3 && pairs.length === 2 * n) {
      ring.length = 0;
      let next = pairs[0]!;
      for (let i = 0; i < n; i++) {
        ring.push(next);
        let found = -1;
        for (let j = 0; j < pairs.length; j += 2) if (pairs[j] === next) { found = pairs[j + 1]!; break; }
        if (found < 0) break;
        next = found;
      }
      if (ring.length === n && next === pairs[0]) {
        let ax = 0, ay = 0, az = 0, bx = 0, by = 0, bz = 0;
        for (let i = 0; i < n; i++) {
          const c = Math.cos(2 * Math.PI * i / n), s = Math.sin(2 * Math.PI * i / n), p = 3 * ring[i]!;
          ax += c * at[p]!; ay += c * at[p + 1]!; az += c * at[p + 2]!;
          bx += s * at[p]!; by += s * at[p + 1]!; bz += s * at[p + 2]!;
        }
        const tx = ay * bz - az * by, ty = az * bx - ax * bz, tz = ax * by - ay * bx;
        // the triangles' side decides which way is out (a ring runs the way its triangles are wound)
        if (tx * x + ty * y + tz * z > 0) { x = tx; y = ty; z = tz; }
      }
    }
    const l = Math.hypot(x, y, z);
    if (l > 0) { out[3 * v] = x / l; out[3 * v + 1] = y / l; out[3 * v + 2] = z / l; }
  }
  return out;
}

/** A surface of triangles (three corners each, written out singly: `pos`, three numbers per corner) as Loop's
 *  smooth surface, each triangle split in four `levels` times: the corners' places on that surface, its normals
 *  there, and what the corners carried (`carried`), halved along the edges. `fit` is how many rounds the net is
 *  moved towards the outside first, so that the surface comes nearer the places of the corners given (0 = the
 *  surface of the net as it is, which lies inside it where it is rounded outwards). Triangles without area are
 *  left out. */
export function smoothSurface(pos: ArrayLike<number>, carried: readonly CornerData[], levels: number, fit: number): { pos: Float32Array; nrm: Float32Array; carried: Float32Array[] } {
  const { place, places } = weld(pos);
  // the triangles by their corners' places, and what the corners carry, without the triangles that have no area
  const kept: number[] = [];
  for (let t = 0; t + 2 < place.length; t += 3) if (place[t] !== place[t + 1] && place[t + 1] !== place[t + 2] && place[t + 2] !== place[t]) kept.push(t);
  let tri = new Int32Array(3 * kept.length);
  let data = carried.map(c => new Float32Array(3 * kept.length * c.size));
  kept.forEach((t, i) => {
    for (let k = 0; k < 3; k++) {
      tri[3 * i + k] = place[t + k]!;
      carried.forEach((c, j) => { for (let m = 0; m < c.size; m++) data[j]![(3 * i + k) * c.size + m] = c.data[(t + k) * c.size + m]!; });
    }
  });
  let at = new Float64Array(3 * places);
  for (let i = place.length - 1; i >= 0; i--) for (let k = 0; k < 3; k++) at[3 * place[i]! + k] = pos[3 * i + k]!;
  let of = net(places, tri);
  const given = Float64Array.from(at);
  for (let round = 0; round < fit; round++) {
    const on = moved(at, of, limitWeight, 2 / 3, 1 / 6);
    for (let i = 0; i < at.length; i++) at[i]! += given[i]! - on[i]!;
  }
  for (let level = 0; level < levels; level++) {
    const before = at.length / 3, edges = of.faces.length, triangles = tri.length / 3;
    const next = new Float64Array(3 * (before + edges));
    next.set(moved(at, of, stepWeight, 3 / 4, 1 / 8));
    for (let e = 0; e < edges; e++) {
      const a = of.ends[2 * e]!, b = of.ends[2 * e + 1]!, c = of.opposite[2 * e]!, d = of.opposite[2 * e + 1]!;
      for (let k = 0; k < 3; k++) {
        next[3 * (before + e) + k] = of.faces[e] === 2
          ? 3 / 8 * (at[3 * a + k]! + at[3 * b + k]!) + 1 / 8 * (at[3 * c + k]! + at[3 * d + k]!)
          : 0.5 * (at[3 * a + k]! + at[3 * b + k]!);
      }
    }
    const split = new Int32Array(12 * triangles);
    for (let t = 0; t < triangles; t++) {
      const a = tri[3 * t]!, b = tri[3 * t + 1]!, c = tri[3 * t + 2]!;
      const ab = before + of.edgeOf[3 * t]!, bc = before + of.edgeOf[3 * t + 1]!, ca = before + of.edgeOf[3 * t + 2]!;
      split.set([a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca], 12 * t);
    }
    data = data.map((old, j) => {
      const size = carried[j]!.size, out = new Float32Array(12 * triangles * size);
      for (let t = 0; t < triangles; t++) {
        for (let m = 0; m < size; m++) {
          const a = old[(3 * t) * size + m]!, b = old[(3 * t + 1) * size + m]!, c = old[(3 * t + 2) * size + m]!;
          const ab = 0.5 * (a + b), bc = 0.5 * (b + c), ca = 0.5 * (c + a);
          [a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca].forEach((v, i) => { out[(12 * t + i) * size + m] = v; });
        }
      }
      return out;
    });
    at = next; tri = split; of = net(at.length / 3, tri);
  }
  const on = moved(at, of, limitWeight, 2 / 3, 1 / 6), normal = normals(at, on, tri, of);
  const outPos = new Float32Array(3 * tri.length), outNrm = new Float32Array(3 * tri.length);
  for (let i = 0; i < tri.length; i++) {
    for (let k = 0; k < 3; k++) { outPos[3 * i + k] = on[3 * tri[i]! + k]!; outNrm[3 * i + k] = normal[3 * tri[i]! + k]!; }
  }
  return { pos: outPos, nrm: outNrm, carried: data };
}
