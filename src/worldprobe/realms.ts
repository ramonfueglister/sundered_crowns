// The realms' map: once the world lies flat under a camera that looks straight down (zoom.ts), the realms colour it
// as a 2D map; with the political map mode on, their colours lie on the land at every distance, over
// its relief, as EU5's map modes do (`mode`). Their colours are painted tile by tile (paint.ts) by a worker, at the level whose
// dots are about a pixel wide, put on the stage's paper and laid by it onto the ground where they lie (stage/picture.ts). The tiles form a pyramid (pyramid.ts), so that a coarser tile stands in for finer ones
// that are not there yet. The realms lie on the game map only; round the globe they come again with it, and between
// its laps the map goes on as land and water.
import { LAND_Y, SEA_Y } from '../lookprobe/layout';
import type { Stage } from '../lookprobe/stage';
import { blockOfCell } from './land';
import type { Layout, View } from './pieces';
import { cover, keyOf } from './pyramid';
import { createDirt } from './realm_dirt';
import type { RealmName } from './realm_names';
import { RANK, type Want, bareIn, sightOf, wantedOf } from './realm_sight';
import { type Held, TILE, createTiles } from './realm_tiles';
import type { RealmsDone, RealmsJob, RealmsNow } from './realms.worker';
import { PAPER_COARSEST, paperLevelOf, paperOf, reliefOf } from './zoom';

/** the realms are fetched and painted from when the view is within this factor of the width at which they show */
const SOON = 2;
/** tiles kept beyond those the view asks for, and how many the worker is given at once */
const SPARE = 16,
  AT_ONCE = 4;
/** the realms' names are found anew at most this often (ms) */
const NAMES_EVERY = 700;

/** what the worker was asked for: a tile, the names, to draw other realms or pick another place out (with the age
 *  they begin), or which place lies somewhere */
type Asked = Want | 'names' | { realms: number } | ((place: number) => void);

interface RealmsMap {
  /** Brings the map to the view. Returns how many tiles of what the picture shows of it are still to come. */
  look(view: View, at: Layout): number;
  /** where the realms' names are written; empty until the realms have been near once */
  names: (RealmName & { name: string })[];
  /** cells from the game map as the names know it to the lap of the globe the view shows */
  lap: number;
  /** the first error of the worker, if any */
  failed: string;
  /** Draws these realms from now on, in place of those the game sets up. */
  set(now: RealmsNow): void;
  /** Picks a place of the game map out on the map from now on (counted from 0; -1: none). */
  choose(place: number): void;
  /** where the realms' colours lie: on the land at every distance, nowhere, or only on the flat world far out (zoom.ts `paperOf`) */
  mode: 'political' | 'terrain' | 'far';
  /** how strongly the realms' names are written over the view last looked at, 0 … 1 */
  named: number;
  /** The place of the game map at a cell of the world (-1: none, sea or beyond the game map), counted from 0. */
  placeAt(u: number, v: number): Promise<number>;
  /** Stops the worker; the map is not used after that. */
  dispose(): void;
}

/**
 * `map`: the game map's width and height in cells, of which `cells` lie along a map pixel; `round`: the cells after
 * which the world begins again.
 * `ahead`: paint the surroundings of the picture too. `changed` is called whenever a tile has arrived.
 */
export function createRealms(
  stage: Stage,
  o: {
    region: string;
    base: string;
    year?: number;
    map: readonly [number, number];
    cells: number;
    round: number;
    rows?: number;
    ahead: boolean;
    changed(): void;
  },
): RealmsMap {
  const held = new Map<string, Held>(),
    asked = new Map<number, Asked>(),
    busy = new Set<string>();
  const realms: RealmsMap = {
    look,
    names: [],
    lap: 0,
    failed: '',
    mode: 'far',
    named: 0,
    set,
    choose,
    placeAt,
    dispose: () => {
      if (namesLater) clearTimeout(namesLater);
      worker.terminate();
      tiles.dispose();
    },
  };
  let nextId = 1,
    looks = 0,
    named = false,
    age = 0,
    chosen = -1,
    naming = false,
    namesAt = -Infinity,
    namesLater: ReturnType<typeof setTimeout> | 0 = 0;
  const dirt = createDirt(o),
    tiles = createTiles(stage);

  const worker = new Worker(new URL('./realms.worker.ts', import.meta.url), { type: 'module' });
  type Job = RealmsJob extends infer J
    ? J extends unknown
      ? Omit<J, 'id' | 'region' | 'base' | 'year'>
      : never
    : never;
  const ask = (job: Job, what: Asked) => {
    const id = nextId++;
    asked.set(id, what);
    worker.postMessage({ id, region: o.region, base: o.base, year: o.year, ...job } satisfies RealmsJob);
  };
  worker.onmessage = (e: MessageEvent<RealmsDone>) => {
    const what = asked.get(e.data.id)!;
    asked.delete(e.data.id);
    if (typeof what === 'function') return what(e.data.place ?? -1);
    if (e.data.error) realms.failed ||= e.data.error;
    else if (what === 'names') {
      realms.names = e.data.names ?? [];
      namesAt = performance.now();
    } else if ('realms' in what) {
      // the worker works through what it is asked in turn: tiles asked for from now on show the new realms; those
      // painted before, where the map changed, are painted anew (and shown until then)
      dirt.soil(what.realms, e.data.dirty, held.values());
      if (e.data.renamed) named = false;
    } else {
      // a tile painted for older realms than the one it would replace comes too late; one painted for realms that
      // have changed since where it lies is shown, and painted anew
      const before = held.get(what.key);
      if (before && before.age > what.age) {
        busy.delete(what.key);
        o.changed();
        return;
      }
      const h: Held = {
        level: what.level,
        x: what.x,
        y: what.y,
        seen: looks,
        age: what.age,
        old: dirt.outdated(what.level, what.x, what.y, what.age),
      };
      if (e.data.tile) tiles.put(h, e.data.tile);
      if (before) tiles.drop(before);
      held.set(what.key, h);
    }
    if (typeof what === 'object' && 'key' in what) busy.delete(what.key);
    if (what === 'names') naming = false;
    o.changed();
  };
  worker.onerror = (e) => {
    realms.failed ||= e.message;
    o.changed();
  };

  function set(now: RealmsNow) {
    // tiles asked for from now on are of these realms
    age++;
    ask({ kind: 'realms', ...now }, { realms: age });
  }
  function choose(place: number) {
    if (place === chosen) return;
    chosen = place;
    age++;
    ask({ kind: 'choose', place }, { realms: age });
  }
  function placeAt(u: number, v: number): Promise<number> {
    const x = Number.isFinite(o.round) ? ((u % o.round) + o.round) % o.round : u;
    return new Promise((found) => ask({ kind: 'place', x: x / o.cells, y: v / o.cells }, found));
  }
  /** the names anew once the realms changed: one asking at a time and not more often than NAMES_EVERY, so that while the borders move quickly (the replay, a fast clock) the tiles are painted between */
  const askNames = () => {
    const wait = NAMES_EVERY - (performance.now() - namesAt);
    if (!named && !naming && wait <= 0) {
      named = true;
      naming = true;
      ask({ kind: 'names' }, 'names');
    } else if (!named && !naming && !namesLater)
      namesLater = setTimeout(() => {
        namesLater = 0;
        o.changed();
      }, wait);
  };

  function look(v: View, at: Layout): number {
    const s = sightOf(v, o),
      level = paperLevelOf(v.wide, v.pixels),
      lies = paperOf(v.wide, realms.mode),
      soon = paperOf(v.wide * SOON, realms.mode).strength > 0;
    realms.lap = s.lap;
    looks++;
    // the land's own light shows through the colours until the world lies flat; there the sea is part of the map
    stage.lay(
      lies.strength,
      lies.flat,
      SEA_Y + 0.3 * (LAND_Y - SEA_Y) * reliefOf(v.wide, at.step),
      lies.things,
      lies.calm,
    );
    realms.named = lies.names;
    const wanted = soon ? wantedOf(s, level, o.ahead, v.wide, age) : [];
    if (soon) askNames();
    // for measuring (`__probe.counts`): the most tiles of a picture that lay under no painted tile of any level, so
    // that the land showed there without the realms' colours
    if (lies.strength > 0)
      stage.probe.counts['paper bare most'] = Math.max(
        stage.probe.counts['paper bare most'] ?? 0,
        bareIn(s, level, (key) => held.has(key)),
      );
    let missing = 0;
    for (const w of wanted) {
      const h = held.get(w.key);
      if (h) h.seen = looks;
      else if (lies.strength > 0 && w.level === level && w.rank < RANK.around) missing++;
    }
    // to paint: what is not there yet, and what still shows the old realms
    const queue = wanted
      .filter((w) => {
        const h = held.get(w.key);
        return (!h || h.old) && !busy.has(w.key);
      })
      .sort((a, b) => b.rank - a.rank);
    while (busy.size < AT_ONCE && queue.length) {
      const next = queue.pop()!;
      busy.add(next.key);
      ask({ kind: 'tile', level: next.level, tx: next.x, ty: next.y, cells: o.cells }, next);
    }

    // what is shown: every part of the picture once, from the tiles nearest the view's level that are there
    const shown =
      lies.strength > 0
        ? cover(
            level,
            PAPER_COARSEST,
            s.near(PAPER_COARSEST, 0).map((t) => [t.x, t.y] as const),
            (l, x, y) => held.get(keyOf(l, x, y)),
            (l, x, y) => s.outside(l, x, y) <= 0,
          )
        : new Set<Held>();
    for (const h of held.values()) {
      const show = shown.has(h);
      if (show) h.seen = looks;
      if (!h.mesh) continue;
      h.mesh.visible = show;
      if (!show) continue;
      const side = TILE * 2 ** h.level,
        [bx, bz] = blockOfCell(h.x * side + realms.lap, h.y * side);
      h.mesh.position.set(bx / at.coarse - at.homeX, 0, bz / at.coarse - at.homeZ);
      h.mesh.scale.set(1 / at.coarse, 1, 1 / at.coarse);
    }
    // tiles the view no longer asks for leave the stage, those unused the longest first
    const spare = [...held].filter(([, h]) => h.seen !== looks).sort((a, b) => a[1].seen - b[1].seen);
    for (const [key, h] of spare.slice(0, Math.max(0, spare.length - SPARE))) {
      tiles.drop(h);
      held.delete(key);
    }
    stage.redraw();
    return missing;
  }
  return realms;
}
