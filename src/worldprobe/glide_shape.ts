// How a shape grows on the glide (glide.ts): lists added after its own, the heights its corners end at, and the ball
// round it, in which the stage looks whether to draw it, made wide enough to hold it all the way.
import type { Shape } from '../lookprobe/shape';
import { ballOf } from './ball';

export type Ball = [number, number, number, number];
/** The ball that holds two balls (a ball of no size holds nothing). */
export function both(a: Ball | undefined, b: Ball): Ball {
  if (!a?.[3]) return b;
  if (!b[3]) return a;
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  if (d + b[3] <= a[3]) return a;
  if (d + a[3] <= b[3]) return b;
  const r = (d + a[3] + b[3]) / 2,
    k = (r - a[3]) / d;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, r];
}
/** How far the corners of a list move at most: from where they lie to the heights they end up at. */
export function reach(pos: ArrayLike<number>, ends: Float32Array, from = 0): number {
  let most = 0;
  for (let v = 0; v < ends.length; v++) most = Math.max(most, Math.abs(ends[v] - pos[(from + v) * 3 + 1]));
  return most;
}
/**
 * The lists of a shape with more triangles after them; `ends` are the heights the new corners end up at, where the
 * shape tells them. The ball round the shape (in which the stage looks whether to draw it) then holds what it held,
 * the shape's faces too, and the new corners all the way.
 */
export function join(shape: Shape, add: Shape, ends?: Float32Array) {
  const all = <T extends Float32Array | Int8Array | Uint8Array>(a: T, b: T): T => {
    const c = new (a.constructor as new (n: number) => T)(a.length + b.length);
    c.set(a);
    c.set(b, a.length);
    return c;
  };
  if (shape.sink || ends) {
    const was = shape.sink ?? Float32Array.from({ length: shape.pos.length / 3 }, (_, v) => shape.pos[v * 3 + 1]);
    shape.sink = all(was, ends ?? Float32Array.from({ length: add.pos.length / 3 }, (_, v) => add.pos[v * 3 + 1]));
  }
  const more = ballOf(add.pos);
  if (ends) more[3] += reach(add.pos, ends);
  shape.ball = both(shape.pos.length || shape.faces ? (shape.ball as Ball | undefined) : undefined, more);
  shape.pos = all(shape.pos as Float32Array, add.pos as Float32Array);
  shape.nor = all(shape.nor as Int8Array, add.nor as Int8Array);
  shape.col = all(shape.col as Uint8Array, add.col as Uint8Array);
}
/** The ball round a shape made wider by as far as its corners move. */
export function wider(shape: Shape, by: number) {
  if (by > 0 && shape.ball) shape.ball = [shape.ball[0], shape.ball[1], shape.ball[2], shape.ball[3] + by];
}
