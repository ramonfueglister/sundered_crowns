// The world to travel through, on a canvas: the real world of 1356 in the look of the look probe, from a single town
// to the whole width of its frame. It is a diorama of blocks, built in pieces around the place the camera looks at (pieces.ts);
// farther out the same world is seen from farther away, with less and less detail and relief, until it lies flat
// and the realms and their names show on it (realms.ts, names.ts). zoom.ts holds the rules of the change. To the
// east and west the data go round the globe, but the world ends at its frame (data/content/world_extent.json): the
// picture stops at its edges.
// Drag moves the picture and lets it glide on, the wheel or two fingers zoom about the pointer, the arrow keys move,
// + and - zoom. A click on the ground is told to the page as the event `world-click` (see `click` below).
// The probe's own page (main.ts) and the game (ui/WorldView.tsx) both show the world through this.
import * as THREE from 'three/webgpu';
import type { PlacePeopleList } from '../figures';
import type { Figures } from '../figures/stage';
import { NEAR, RIGHT, SEA_Y } from '../lookprobe/layout';
import { type Stage, bakedSky, createStage } from '../lookprobe/stage';
import { withCoast } from '../lookprobe/sea_coast';
import { createNames } from './names';
// the face of the realms' names (names.ts), bundled: no requests to a font service
import '@fontsource/eb-garamond/latin-500.css';
import '@fontsource/eb-garamond/latin-ext-500.css';
import { type Layout, createPieces } from './pieces';
import { createRealms } from './realms';
import type { RealmsNow } from './realms.worker';
import { extentOf, heldIn } from './extent';
import { type Projection, projectionOf } from './region';
import { FINER, blockOfCell, cellOfBlock } from './land';
import { type WorldMark, createMarks } from './view_marks';
import { type Place, createMotion } from './view_motion';
import { type WorldClick, createPointer } from './view_pointer';
import { FARTHEST, NEAREST, awayOf, creaseReachOf, creasesOf, elevationOf, mirrorOf, nearOf, reliefOf } from './zoom';

export type { WorldHover } from './view_pointer';
export type { WorldMark };

interface WorldViewOptions {
  /** the canvas to draw on (default: the page's first, filling the window) */
  canvas?: HTMLCanvasElement;
  /** the cut of the world to show */
  region?: string;
  /** the world's start year: its setup colours the far map until setRealms, its towns are built (default 1356) */
  year?: number;
  /** the place at the middle of the picture, in degrees, and the finest blocks across the picture */
  lon: number;
  lat: number;
  wide: number;
  /** a tool takes one picture: the view is shown as asked for, at once, with nothing built ahead */
  still?: boolean;
  /** where the realms' names are written (default: the page's body) */
  names?: HTMLElement;
  /** told what the view is waiting for or failed at (empty: nothing) */
  status?(text: string): void;
  /** told where the view is, whenever it has changed */
  moved?(lon: number, lat: number, wide: number): void;
  /** told of a click on the ground, with a way to ask which place of the game map lies there (-1: none) */
  clicked?(hit: WorldClick, place: () => Promise<number>): void;
}

/** The map modes, as EU5's: what the land is coloured by. */
export type MapMode = 'political' | 'terrain';

export interface WorldView {
  /** Flies to a place, to show `wide` finest blocks across the picture there. */
  flyTo(lon: number, lat: number, wide: number): void;
  /** Colours the far map by these realms from now on, in place of those the game sets up. */
  setRealms(now: RealmsNow): void;
  /** Picks a place of the game map out on the far map (counted from 0; -1: none). */
  choose(place: number): void;
  /** Sets the map mode: `political` lays the realms' colours on the land at every distance, `terrain` shows the land alone (until it is set, they show only on the flat world far out). */
  mapMode(mode: MapMode): void;
  /**
   * Marks points of the world with dots (the map mode of the rulers): each at its degrees, with a colour, a title
   * for the pointer and what a click on it does. Shown while the view is drawn coarser than its finest step: near,
   * the figures themselves stand there. An empty list takes them away.
   */
  setMarks(marks: readonly WorldMark[]): void;
  /** Asks for a new picture (something drawn changed that the view does not know of, such as the figures' colours). */
  redraw(): void;
  /** The persons of the towns changed (src/people/town_rolls.ts): see pieces.ts `tellPersons` and `renewFigures`. */
  tellPersons(lists: readonly PlacePeopleList[]): void;
  renewFigures(stale: (f: Figures) => boolean, version: number): void;
  /** Stops the view and lets go of all it holds. */
  dispose(): void;
}

/**
 * The name under which the pieces are kept on disk (store.ts), or none where they are not: a stamp of the code and
 * data the pieces are made of (tools/stamp/piece_key.ts), so that a build which changes them does not read the pieces
 * of an old one, and a build which changes neither keeps them all. While the game is being worked on (the dev server) its
 * code changes without a new build, so there the pieces are kept only where the address asks for it: `?keep=<name>`
 * (and `?keep=0` keeps nothing in a build either).
 */
declare const __BUILD__: string;
function keepAs(): string | undefined {
  const asked = new URLSearchParams(location.search).get('keep');
  if (asked === '0') return undefined;
  return asked ?? (import.meta.env.DEV ? undefined : __BUILD__);
}
export async function createWorldView(o: WorldViewOptions): Promise<WorldView> {
  const name = o.region ?? 'world',
    base = import.meta.env.BASE_URL,
    still = o.still ?? false,
    asked = new URLSearchParams(location.search);
  const stage = await createStage({ fixed: true, tall: 70, canvas: o.canvas }),
    canvas = stage.canvas;
  // the world's cells are its finest blocks, FINER to a cell of the land's data (land.ts)
  // and the depth of the sea under the game map (sea.ts), read beside them; without it the sea keeps its own colours
  const [projection, depths] = await Promise.all([projectionOf(name, base, FINER), depthsOf(base)]);
  const blockOf = (lon: number, lat: number) => blockOfCell(...projection.cellOf(lon, lat));
  // the world's frame in cells (they run with the picture's sides), and the widest view: the frame's whole width
  const frame = extentOf(projection),
    farthest = Math.min(FARTHEST, frame.east - frame.west);
  // the view: the place at the middle of the picture in the finest blocks, and how many of them lie across the picture
  const [x0, z0] = blockOf(o.lon, o.lat),
    place: Place = { x: x0, z: z0, wide: Math.min(farthest, Math.max(NEAREST, o.wide)) };
  const pieces = createPieces(stage, {
    region: name,
    base,
    bakedSky: bakedSky(),
    ahead: !still,
    changed: () => look(),
    workers: +(asked.get('workers') ?? 0) || undefined,
    keep: keepAs(),
    small: asked.get('small') !== '0',
    faces: asked.get('faces') !== '0',
    free: asked.get('free') !== '0',
    tables: asked.get('tables') !== '0',
    glide: asked.get('glide') !== '0',
    tops: asked.get('tops') !== '0',
    margin: +(asked.get('margin') ?? 0) || undefined,
    year: o.year,
    mean: asked.get('mean') === 'compare' ? 'compare' : asked.get('mean') === '1',
  });
  const realms = createRealms(stage, {
      region: name,
      base,
      year: o.year,
      map: projection.map,
      cells: projection.cells,
      round: projection.round,
      rows: projection.rows,
      ahead: !still,
      changed: () => look(),
    }),
    names = createNames(o.names);
  const marks = createMarks(o.names ?? document.body, stage, blockOf);
  const middle = (): [number, number] => {
    const box = canvas.getBoundingClientRect();
    return [box.left + box.width / 2, box.top + box.height / 2];
  };

  /** how the stage is laid out for the view, as of the last look */
  let laid: Layout = { step: 0, coarse: 1, homeX: 0, homeZ: 0 };
  /** what the pointer at rest wants to know when the view moved (set below, with the pointer) */
  let moved = () => {};
  const look = () => {
    const { wide } = place,
      elevation = elevationOf(wide),
      aspect = canvas.clientWidth / canvas.clientHeight,
      squash = Math.sin((elevation * Math.PI) / 180);
    // the picture stops at the edges of the world's frame (the map's rows and columns run with the picture's sides)
    const [u0, v0] = cellOfBlock(place.x, place.z),
      [u, held] = heldIn(frame, u0, v0, wide, wide / aspect / squash);
    if (held !== v0 || u !== u0) [place.x, place.z] = blockOfCell(u, held);
    const { x, z } = place,
      view = { x, z, wide, aspect, pixels: canvas.clientWidth, elevation, to: motion.toward() };
    const at = pieces.look(view),
      missing = at.missing + realms.look(view, at),
      failed = pieces.failed || realms.failed;
    stage.aim(
      x / at.coarse - at.homeX,
      z / at.coarse - at.homeZ,
      wide / at.coarse,
      elevation,
      awayOf(wide) / at.coarse,
    );
    stage.creases(creasesOf(wide), creaseReachOf(wide) / at.coarse);
    stage.soften(nearOf(wide));
    stage.mirror(mirrorOf(wide));
    laid = at;
    seaUnder(stage, depths, projection, at);
    const box = canvas.getBoundingClientRect();
    names.show(
      realms.names,
      box,
      (u - realms.lap) / projection.cells,
      held / projection.cells,
      (box.width / wide) * projection.cells,
      squash,
      realms.named,
    );
    stage.busy = missing > 0 && !failed;
    if (stage.busy) stage.probe.ready = false;
    o.status?.(failed || (still && missing ? `Lade ${missing} ${missing === 1 ? 'Stück' : 'Stücke'} der Welt …` : ''));
    marks.place(laid, wide);
    moved();
  };
  const note = () => {
    if (o.moved) {
      const [lon, lat] = projection.placeOf(...cellOfBlock(place.x, place.z));
      o.moved(lon, lat, place.wide);
    }
  };

  /** ground offset from the middle of the picture to a point of the page, in finest blocks to the right and towards the viewer */
  const offset = (px: number, py: number, across = place.wide): [number, number] => {
    const box = canvas.getBoundingClientRect(),
      perPixel = across / box.width;
    return [
      (px - box.left - box.width / 2) * perPixel,
      ((py - box.top - box.height / 2) * perPixel) / Math.sin((elevationOf(across) * Math.PI) / 180),
    ];
  };
  const move = (right: number, near: number) => {
    place.x += right * RIGHT[0] + near * NEAR[0];
    place.z += right * RIGHT[1] + near * NEAR[1];
    look();
    note();
  };
  /** zooms so that the ground under a point of the page stays under it */
  const zoom = (to: number, px: number, py: number) => {
    const before = offset(px, py);
    place.wide = Math.min(farthest, Math.max(NEAREST, to));
    const after = offset(px, py);
    move(before[0] - after[0], before[1] - after[1]);
  };
  const motion = createMotion({ place, still, farthest, middle, offset, look, note, move, zoom, blockOf });

  /**
   * Tells the page that the ground was clicked: the event `world-click` on the window, whose detail holds the point in
   * finest world blocks (x, z; y in blocks above the stage's floor as the land was built, before the relief was
   * scaled), the step the view is drawn in and the place in degrees. Who wants to know what stands there listens for it.
   */
  const groundAt = (px: number, py: number): { at: WorldClick; u: number; v: number } | null => {
    const hit = stage.pick(px, py),
      tall = reliefOf(place.wide, laid.step);
    if (!hit) return null;
    const wx = (hit[0] + laid.homeX) * laid.coarse,
      wz = (hit[2] + laid.homeZ) * laid.coarse,
      [u, v] = cellOfBlock(wx, wz),
      [lon, lat] = projection.placeOf(u, v);
    return { at: { x: wx, y: (hit[1] - SEA_Y * (1 - tall)) / tall, z: wz, step: laid.step, lon, lat }, u, v };
  };
  const click = (px: number, py: number) => {
    const g = groundAt(px, py);
    if (!g) return;
    window.dispatchEvent(new CustomEvent('world-click', { detail: g.at }));
    o.clicked?.(g.at, () => realms.placeAt(g.u, g.v));
  };
  const pointer = createPointer(canvas, {
    place,
    still,
    motion,
    step: () => laid.step,
    offset,
    move,
    groundAt,
    click,
  });
  moved = pointer.hover;
  // the canvas may change its size without the window doing so
  const sized = new ResizeObserver(() => {
    window.dispatchEvent(new Event('resize'));
  });
  if (o.canvas) sized.observe(canvas);
  window.addEventListener('resize', look);
  look();
  return {
    flyTo: motion.flyTo,
    setRealms(now) {
      realms.set(now);
    },
    choose(chosen) {
      realms.choose(chosen);
    },
    mapMode(mode) {
      if (realms.mode !== mode) {
        realms.mode = mode;
        look();
      }
    },
    redraw() {
      stage.redraw();
    },
    tellPersons: (lists) => pieces.tellPersons(lists),
    renewFigures: (stale, version) => pieces.renewFigures(stale, version),
    setMarks(now) {
      marks.set(now);
      marks.place(laid, place.wide);
    },
    dispose() {
      motion.stop();
      pointer.hoverOff();
      marks.dispose();
      pointer.dispose();
      window.removeEventListener('resize', look);
      sized.disconnect();
      pieces.dispose();
      realms.dispose();
      names.remove();
      stage.dispose();
    },
  };
}

/**
 * Lays the depth of the sea (`depthsOf`) under the stage as it is laid out at `at`: a point (x, z) of the stage is
 * the world block ((x + homeX) · coarse, (z + homeZ) · coarse), and that the cell (u, v) of the whole map (land.ts
 * `cellOfBlock`), which lies at (u / map width, v / map height) on the depth picture.
 */
function seaUnder(stage: Stage, depths: THREE.Texture | null, projection: Projection, at: Layout) {
  const c = at.coarse,
    [mw, mh] = projection.map,
    hx = at.homeX * c,
    hz = at.homeZ * c;
  stage.sea(
    depths,
    [
      (RIGHT[0] * c) / mw,
      (RIGHT[1] * c) / mw,
      (RIGHT[0] * hx + RIGHT[1] * hz) / mw,
      (NEAR[0] * c) / mh,
      (NEAR[1] * c) / mh,
      (NEAR[0] * hx + NEAR[1] * hz) / mh,
    ],
    Number.isFinite(projection.round) ? projection.round / mw : 0,
    c,
    hx,
    hz,
  );
}

/** The depth of the sea under the game map (public/map/depth.png, tools/worldprobe/build_depth.py) and the coast's distance (sea.ts `withCoast`); null where it cannot be read. */
async function depthsOf(base: string): Promise<THREE.Texture | null> {
  try {
    // (with the coast's distance beside the depth, for the sea's band of lighter water along the coast)
    const t = await new THREE.TextureLoader().loadAsync(`${base}map/depth.png`);
    return withCoast(t.image as HTMLImageElement);
  } catch {
    return null;
  }
}
