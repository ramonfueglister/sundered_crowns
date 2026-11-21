// The riders on the map (WorldView.setRiders; the map mode of the rulers, src/people/rulers_mode.ts): a ruler on the
// way between two places of the itinerary rides it as a horseman, drawn as the figures are (src/figures/horse.ts).
// The page tells now and then where each rider is and where they will be a few seconds on; between its tellings the
// rider goes on by itself, in the figures' vertex stage. Far out a rider is drawn larger than true, as the rulers'
// dots are drawn larger than a town, so that the journey shows. Main thread only.
import { RIDER_HEIGHT } from '../figures/horse';
import { NEAR_UNTIL, disposeFigures, figureSeconds, riders as riderMesh } from '../figures/stage';
import { LAND_Y, SEA_Y } from '../lookprobe/layout';
import type { Stage } from '../lookprobe/stage';
import { FIGURES_LAYER } from '../lookprobe/stage/look';
import type { Layout } from './pieces';
import { reliefOf } from './zoom';

/** A ruler riding on the map (WorldView.setRiders). */
export interface WorldRider {
  /** where the rider is now, in degrees */
  lon: number;
  lat: number;
  /** where the rider will be after `seconds` of real time; with 0 the rider stands (the world is paused), facing it */
  toLon: number;
  toLat: number;
  seconds: number;
  /** the colour of the realm (0xRRGGBB): the rider's garment and the horse's cloth */
  color: number;
}

/**
 * OWN RULE, a drawing value: far out a rider is drawn this many dots tall, three times the rulers' dots
 * (view_marks.ts), from four times the width at which the figures are drawn with their full kit on (NEAR_UNTIL);
 * below that width the rider grows less and less larger than true, and is true to size there.
 */
export const RIDER_PX = 28;
const LARGER_FROM = NEAR_UNTIL,
  LARGER_UNTIL = 4 * NEAR_UNTIL;
/** OWN RULE: at most this many riders are drawn (the itineraries name the ways of a few rulers at a time). */
const ROOM = 32;
/** The colours of a rider that are not the realm's: skin, hose, crown, the horse's coat (a bay) and the hair. Drawing
 *  values in the palette of the figures (src/figures/estates.ts SKIN, HAIR; the gold of a headwear there). */
const SKIN = 0xd9a47e,
  HOSE = 0x3a3430,
  GOLD = 0xd9a43a,
  BAY = 0x6b4226,
  HAIR = 0x2a2420;
/** The ground under a rider is looked for again after this many seconds: `Stage.pick` goes through the scene. */
const LOOK_AGAIN = 0.5;
/** A rider told this many finest blocks from where the one before it in the list was is taken for another. */
const SAME = 64;

interface Riding {
  r: WorldRider;
  /** where the rider is and will be, in finest blocks, and when the page told it (figureSeconds) */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  at: number;
  /** which way the rider faces (as material.ts takes it: the angle of the way from +z towards +x) */
  facing: number;
  /** the ground under the rider as built (blocks above the stage's floor before the relief is scaled: view.ts
   *  `groundAt`), when it was looked for and on which step */
  y?: number;
  seen: number;
  step: number;
}

interface Riders {
  /** Shows these riders from now on, in place of those before (an empty list takes them away). */
  set(now: readonly WorldRider[]): void;
  /** Puts the riders where they ride, in a view `wide` finest blocks across that the stage lays out so. */
  place(laid: Layout, wide: number): void;
  dispose(): void;
}

/** How much larger than true a rider is drawn in a view `wide` finest blocks across (1: true to size). */
function largerOf(wide: number, dots: number): number {
  const far = (RIDER_PX * wide) / dots / RIDER_HEIGHT,
    share = Math.min(1, Math.max(0, Math.log(wide / LARGER_FROM) / Math.log(LARGER_UNTIL / LARGER_FROM)));
  return Math.max(1, 1 + (far - 1) * share);
}

/** The riders, on `stage`; `blockOf` gives the finest block of a place in degrees. */
export function createRiders(stage: Stage, blockOf: (lon: number, lat: number) => [number, number]): Riders {
  const { mesh, numbers } = riderMesh(ROOM),
    // (material.ts riderMesh makes the riders' numbers a Float32Array)
    arr = numbers.array as Float32Array,
    drawn = new Float32Array(arr.length);
  mesh.layers.set(FIGURES_LAYER);
  // (the map's paper is not laid on a rider, as not on the rulers' dots: an ink below 0, lookprobe/stage/paper.ts)
  mesh.userData.ink = -1;
  stage.put(mesh);
  let riding: Riding[] = [],
    laid: Layout | null = null,
    wide = 0,
    timer = 0;

  /** the height of the ground under (sx, sz) of the stage, as built (`Riding.y`), where the picture shows it */
  const groundOf = (sx: number, sz: number, tall: number): number | undefined => {
    let y = LAND_Y * tall + SEA_Y * (1 - tall),
      found = false;
    // (the ground hit along the line of sight through the point at a guessed height, twice: hills are low)
    for (let k = 0; k < 2; k++) {
      const p = stage.toScreen(sx, y, sz),
        hit = p && stage.pick(p[0], p[1]);
      if (!hit) break;
      y = hit[1];
      found = true;
    }
    return found ? (y - SEA_Y * (1 - tall)) / tall : undefined;
  };

  const write = () => {
    clearTimeout(timer);
    const at = laid,
      n = at ? riding.length : 0;
    if (mesh.geometry.instanceCount !== n) stage.redraw();
    mesh.geometry.instanceCount = n;
    if (!at || !n) return;
    const t = figureSeconds(),
      tall = reliefOf(wide, at.step),
      c = at.coarse,
      s = largerOf(wide, stage.canvas.clientWidth) / c;
    mesh.scale.setScalar(s);
    let soonest = Number.POSITIVE_INFINITY;
    for (const [i, d] of riding.entries()) {
      // where the rider is now on the way told, and how many seconds of it are left
      const left = Math.max(0, d.r.seconds - (t - d.at)),
        f = d.r.seconds > 0 ? 1 - left / d.r.seconds : 0,
        x = d.x0 + (d.x1 - d.x0) * f,
        z = d.z0 + (d.z1 - d.z0) * f,
        sx = x / c - at.homeX,
        sz = z / c - at.homeZ;
      if (d.y === undefined || t - d.seen > LOOK_AGAIN || d.step !== at.step) {
        d.y = groundOf(sx, sz, tall) ?? LAND_Y;
        d.seen = t;
        d.step = at.step;
      }
      const sy = d.y * tall + SEA_Y * (1 - tall),
        dx = (d.x1 - x) / c / s,
        dz = (d.z1 - z) / c / s,
        long = Math.hypot(dx, dz),
        going = left > 0 && long > 1e-4;
      if (going) soonest = Math.min(soonest, left);
      // material.ts: the figure is at a (x, y, z), goes towards b (x, y, z) at the pace b.w, and has gone the share
      // fract(time × pace / (2 × length) + phase) × 2 of the way; the phase a.w has the way begin now, and the pace
      // takes the rider to its end in the seconds left (a figure that stands faces the angle e.z)
      const k = i * 20,
        dir = going ? [dx / long, dz / long] : [Math.sin(d.facing), Math.cos(d.facing)];
      arr.set([sx / s, sy / s, sz / s, going ? 1 - ((t / (2 * left)) % 1) : 0], k);
      arr.set([sx / s + dir[0] * (going ? long : 0.01), sy / s, sz / s + dir[1] * (going ? long : 0.01)], k + 4);
      arr[k + 7] = going ? long / left : 0;
      arr.set([going ? 1 : 0, 0, -1, 0], k + 8);
      arr.set([SKIN, d.r.color, HOSE, GOLD], k + 12);
      arr.set([BAY, HAIR, d.facing, 0], k + 16);
    }
    // (a picture only where a rider moved: a still taken by a tool is not drawn anew every second)
    if (arr.some((v, k) => k < n * 20 && v !== drawn[k])) {
      drawn.set(arr);
      numbers.needsUpdate = true;
      stage.redraw();
    }
    // a rider at the end of its way stands there until the page tells more: it would turn back (material.ts goes
    // there and back again)
    if (soonest < 2) timer = window.setTimeout(write, soonest * 1000 + 20);
  };

  return {
    set(now) {
      const t = figureSeconds(),
        old = riding;
      riding = now.slice(0, ROOM).map((r, i) => {
        const [x0, z0] = blockOf(r.lon, r.lat),
          [x1, z1] = blockOf(r.toLon, r.toLat),
          was = old[i],
          // (the ground looked for under the rider told before at this place in the list, if it is the same rider)
          same = was !== undefined && Math.hypot(was.x0 - x0, was.z0 - z0) < SAME;
        // (a rider that stands keeps facing the way it rode)
        const facing = Math.hypot(x1 - x0, z1 - z0) > 1e-6 ? Math.atan2(x1 - x0, z1 - z0) : (was?.facing ?? 0);
        return same
          ? { ...was, r, x0, z0, x1, z1, at: t, facing }
          : { r, x0, z0, x1, z1, at: t, facing, seen: 0, step: -1 };
      });
      write();
    },
    place(at, across) {
      laid = at;
      wide = across;
      write();
    },
    dispose() {
      clearTimeout(timer);
      stage.take(mesh);
      disposeFigures(mesh);
    },
  };
}
