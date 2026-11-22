// The wall of a town along its ring (settlement feature 6, src/sim/settlement/walls.ts): the pieces the simulation
// lays, each straight, wall, gate or postern. The wall steps with the ground, a tower stands at each corner, at each
// end and beside each gate, and along the runs between them; a gatehouse spans each gate, a low arch each postern.
// OWN RULE: the height and thickness of the wall are those of the square wall it replaces (town-wall.ts), and a tower
// every TOWER_EVERY blocks; no source in hand gives one measure for the walls of all towns.
import { Batch, type RGB, rgb, shade } from '../../lookprobe/batch';
import { battlements } from '../core/solids';
import { along } from '../core/along';

/** what a piece of the ring is (src/sim/settlement/walls.ts WALL_PIECE) */
const GATE = 1,
  POSTERN = 2;
/** finest blocks: the wall's thickness and height above the ground, the stretch the ground is asked along the wall,
 *  the run between two towers at the most, and the room a tower keeps from the next */
const T = 0.8,
  H = 2,
  SEG = 3,
  TOWER_EVERY = 25,
  TOWER_ROOM = 5;
/** finest blocks: the gatehouse's arch springs this high and its top stands this far above the wall; a postern's arch */
const GATE_CROWN = 1.4,
  GATE_OVER = 0.8,
  POSTERN_CROWN = 1.1;
/** finest blocks: a merlon's side and height (those of town-wall.ts) */
const MERLON = 0.4,
  MERLON_UP = 0.45;

/**
 * The ring of a town from its pieces ([x0, z0, x1, z1, kind] in the units of the ground it stands on, from where the
 * batch is set), `size` of those units to a finest block across and `up` upright. `ground(x, z)` is the height the
 * wall stands on there, or null where this ground does not draw it (another piece of the world owns it, or water).
 */
export function ringWall(
  pieces: readonly (readonly number[])[],
  ground: (x: number, z: number) => number | null,
  size = 1,
  up = 1,
): Batch {
  const b = new Batch(),
    c = rgb(0xcdb89c),
    t = T * size;
  const top = shade(c, 0.94),
    low = shade(c, 0.82);
  /** a straight block from a to b, `w` thick, from y0 to y1, its top with merlons along both sides where `crenel`;
   *  `bottom`: its lower face drawn (it spans a passage) */
  const run = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    w: number,
    y0: number,
    y1: number,
    crenel: boolean,
    bottom = false,
  ) => {
    const line = along(b, ax, az, bx, bz);
    if (!line) return;
    const { len } = line,
      block = (u0: number, v0: number, u1: number, v1: number, lo: number, hi: number, foot: RGB) =>
        line.box(u0, v0, u1, v1, lo, hi, { side: c, foot, top }, bottom);
    block(0, -w / 2, len, w / 2, y0, y1, bottom ? c : low);
    if (!crenel) return;
    const m = MERLON * size,
      n = Math.max(2, Math.round(len / (2 * m)));
    for (let k = 0; k < n; k++) {
      const u = (len - m) * (k / (n - 1));
      for (const v of [-w / 2, w / 2 - m]) block(u, v, u + m, v + m, y1, y1 + MERLON_UP * up, c);
    }
  };
  const tower = (x: number, z: number, r: number, top: number, col: RGB) => {
    const y = ground(x, z);
    if (y === null) return;
    b.box(x - r * size, y - up, z - r * size, x + r * size, y + top * up, z + r * size, col, {
      foot: 0.82,
      top: shade(c, 0.94),
    });
    battlements(b, x - r * size, z - r * size, x + r * size, z + r * size, y + top * up, c, 0.4 * size, 0.45 * up);
  };
  const walls = pieces.filter((p) => p[4] !== GATE && p[4] !== POSTERN);
  for (const [x0, z0, x1, z1] of walls) {
    // in stretches that step with the ground, each on the lowest of its ends and its middle
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (SEG * size)));
    for (let k = 0; k < n; k++) {
      const ax = x0 + ((x1 - x0) * k) / n,
        az = z0 + ((z1 - z0) * k) / n,
        bx = x0 + ((x1 - x0) * (k + 1)) / n,
        bz = z0 + ((z1 - z0) * (k + 1)) / n,
        ys = [ground(ax, az), ground((ax + bx) / 2, (az + bz) / 2), ground(bx, bz)];
      if (ys[1] === null) continue;
      const y = Math.min(...ys.filter((v): v is number => v !== null));
      run(ax, az, bx, bz, t, y - up, y + H * up, true);
    }
  }
  // gatehouses and posterns: the wall goes on over the passage, higher and thicker over a gate
  for (const [x0, z0, x1, z1, kind] of pieces) {
    if (kind !== GATE && kind !== POSTERN) continue;
    const y = ground((x0 + x1) / 2, (z0 + z1) / 2);
    if (y === null) continue;
    if (kind === GATE) run(x0, z0, x1, z1, t * 2, y + GATE_CROWN * up, y + (H + GATE_OVER) * up, true, true);
    else run(x0, z0, x1, z1, t, y + POSTERN_CROWN * up, y + H * up, true, true);
  }
  // the towers: beside each gate, at each corner and each open end of the wall, and along the runs between them
  const towers: { x: number; z: number; rank: number }[] = [];
  const key = (x: number, z: number) => `${Math.round(x * 100)},${Math.round(z * 100)}`;
  const ends = new Map<string, { x: number; z: number; dirs: number[]; gate: boolean }>();
  const end = (x: number, z: number, dir: number | null, gate: boolean) => {
    const k = key(x, z),
      e = ends.get(k) ?? { x, z, dirs: [], gate: false };
    if (dir !== null) e.dirs.push(dir);
    e.gate ||= gate;
    ends.set(k, e);
  };
  for (const [x0, z0, x1, z1, kind] of pieces) {
    const gate = kind === GATE;
    const dir = kind === GATE || kind === POSTERN ? null : Math.atan2(z1 - z0, x1 - x0);
    end(x0, z0, dir, gate);
    end(x1, z1, dir, gate);
  }
  for (const e of ends.values()) {
    const turn = e.dirs.length === 2 ? Math.abs(Math.sin(e.dirs[0] - e.dirs[1])) : 0;
    if (e.gate) towers.push({ x: e.x, z: e.z, rank: 0 });
    else if (e.dirs.length === 1) towers.push({ x: e.x, z: e.z, rank: 1 });
    else if (turn > 0.26) towers.push({ x: e.x, z: e.z, rank: 1 });
  }
  for (const [x0, z0, x1, z1] of walls) {
    const len = Math.hypot(x1 - x0, z1 - z0) / size,
      n = Math.floor(len / TOWER_EVERY);
    for (let k = 1; k <= n; k++)
      towers.push({ x: x0 + ((x1 - x0) * k) / (n + 1), z: z0 + ((z1 - z0) * k) / (n + 1), rank: 2 });
  }
  towers.sort((p, q) => p.rank - q.rank);
  const kept: { x: number; z: number; rank: number }[] = [];
  for (const q of towers)
    if (q.rank === 0 || !kept.some((p) => Math.hypot(p.x - q.x, p.z - q.z) < TOWER_ROOM * size)) kept.push(q);
  for (const q of kept) tower(q.x, q.z, q.rank === 2 ? 0.8 : 1, q.rank === 2 ? 3 : 3.4, shade(c, 1.04));
  return b;
}
