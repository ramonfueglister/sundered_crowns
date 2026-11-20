// The pieces that have arrived from the workers go on the stage, for pieces.ts: one to a picture, so that no
// picture has the lists of two to send to the graphics card; or, where the stage sends the lists itself (`?send=1`,
// stage/api.ts `staged`), as the stage has room, and a piece joins those the view can show once its lists are sent.
import type * as THREE from 'three/webgpu';
import type { Stage } from '../lookprobe/stage';
import type { HouseCell } from './fine';
import type { PieceDone } from './piece.worker';
import { PIECE, type Spot } from './piece_sight';

/** a picture every this many milliseconds is what the stage aims for: a piece that has arrived is put on it in a picture of its own */
const PICTURE = 1000 / 60;
/** where pictures take longer than this many milliseconds, they cannot be what holds the arrived pieces back */
const SLOW = 250;

/** what a worker built of a piece */
type PieceScene = NonNullable<PieceDone['scene']>;

/** a piece on the stage */
export interface Held {
  group: THREE.Group;
  step: number;
  px: number;
  pz: number;
  /** the cells of its towns, with their middles in finest blocks */
  cells: (Pick<HouseCell, 'key' | 'far' | 'lots' | 'ground'> & { x: number; z: number })[];
  /** the share of the picture's dots it is drawn on, while it dissolves into the picture or out of it */
  dots: [number, number];
  /** the last look that showed or asked for it */
  seen: number;
  /** whether the piece is part of the picture */
  on: boolean;
  /** the share of the picture's dots on which the piece, of the next coarser step, is laid into the picture in place of the view's own step, as the view nears that step (zoom.ts `blendOf`) */
  laid: number;
  /** the piece is dissolving into the picture (`rising`) or out of it since this time */
  fade?: { since: number; rising: boolean };
  /** the piece glides to the shape of the next coarser step (glide.ts) */
  glides: boolean;
  /**
   * the piece took the place of a coarser one that stood in for it, at this time and `by` short of that step's
   * shape: it shows first as that step has the land and comes to its own shape from there (`settleOf`), so that the
   * land grows finer where it stood and does not change at once
   */
  settle?: { since: number; by: number };
  /**
   * the piece is still to be drawn once without showing, so that its lists are on the graphics card before it
   * shows: -1 until a look puts it into the picture to come, then the number of pictures the stage had drawn by
   * then, and none once the stage has drawn that picture
   */
  warm?: number;
}

interface Arrival {
  /** A piece the view asks for has arrived: it goes on the stage as `schedule` says. */
  take(spot: Spot, scene: PieceScene): void;
  /** After a worker's answer: what has arrived goes on the stage, at once or from the next picture on. */
  schedule(): void;
}

/**
 * The pieces go into `held` once on the stage, and leave `building` then. `ahead`: the view moves and has pictures to
 * spread the pieces over (a tool that takes one picture puts them all on at once). `asked` holds what the last look
 * asked for, `looks` counts the looks; `marginOf` gives the blocks of land around a piece of a step.
 */
export function createArrival(
  stage: Stage,
  o: { ahead: boolean; changed(): void },
  held: Map<string, Held>,
  building: Set<string>,
  asked: ReadonlySet<string>,
  looks: () => number,
  marginOf: (step: number) => number,
): Arrival {
  /** pieces that have arrived and wait to go on the stage; and those on it whose lists are on their way to the graphics card, in the order they were put there */
  const arrived: { spot: Spot; scene: PieceScene }[] = [],
    sending: { spot: Spot; h: Held }[] = [];
  let admitting = false,
    admitted = 0,
    followed = false;
  const put = ({ spot, scene }: (typeof arrived)[number]) => {
    const group = stage.add(scene);
    group.visible = false;
    const cells = scene.cells.map((c, k) => ({
      key: `${spot.key}/${k}`,
      far: c.far.pos.length ? stage.more(group, c.far) : undefined,
      lots: c.lots,
      ground: c.ground,
      x: spot.px * PIECE - marginOf(spot.step) + c.x,
      z: spot.pz * PIECE - marginOf(spot.step) + c.z,
    }));
    const h: Held = {
      group,
      step: spot.step,
      px: spot.px,
      pz: spot.pz,
      cells,
      dots: [0, 1],
      seen: looks(),
      on: false,
      laid: 0,
      glides: !!scene.ground.faces?.aim,
      warm: o.ahead && !stage.staged ? -1 : undefined,
    };
    if (stage.staged) sending.push({ spot, h });
    else {
      held.set(spot.key, h);
      building.delete(spot.key);
    }
    for (const [name, n] of Object.entries(scene.counts))
      stage.probe.counts[name] = (stage.probe.counts[name] ?? 0) + n;
  };
  /** the pieces go on one to a picture */
  const admitOne = () => {
    admitting = false;
    // one to a picture, so that no picture has the lists of two to send to the graphics card (measured: where
    // pieces read from disk arrived four at a time and were put on the stage together, pictures took up to 170 ms).
    // Only a machine whose pictures take a quarter of a second and more each puts on as many as would have had a
    // picture of their own in that time; and a tool that takes one picture has no pictures to spread them over.
    const now = performance.now(),
      took = now - admitted;
    const due = !o.ahead ? arrived.length : followed && took > SLOW ? Math.floor(took / PICTURE) : 1;
    admitted = now;
    for (let k = due; k > 0 && arrived.length; k--) put(arrived.shift()!);
    // (the time since the last piece counts only from one picture to the next, not across a rest)
    followed = arrived.length > 0;
    if (arrived.length) {
      admitting = true;
      requestAnimationFrame(admit);
    }
    o.changed();
  };
  /** the pieces go on as the stage has room, and join those the view can show once their lists are sent */
  const admitAsSent = () => {
    admitting = false;
    // the next go on the stage as those before them get through (the others wait, so that the ones the view asks
    // for by then go first)
    const more = () => {
      while (arrived.length && stage.room()) {
        const k = arrived.findIndex((a) => asked.has(a.spot.key));
        put(arrived.splice(Math.max(0, k), 1)[0]);
      }
    };
    more();
    // A piece whose lists are on the graphics card joins those the view can show. Shown before that, its lists
    // would all go in the picture that first draws it (measured: where pieces read from disk came into the picture
    // together, or one piece of a town with its 49 meshes, pictures took 110 to 250 ms).
    let joined = false;
    for (let k = 0; k < sending.length; k++) {
      const { spot, h } = sending[k];
      if (!stage.sent(h.group)) continue;
      sending.splice(k--, 1);
      h.seen = looks();
      held.set(spot.key, h);
      building.delete(spot.key);
      joined = true;
    }
    more();
    if (arrived.length || sending.length) {
      admitting = true;
      requestAnimationFrame(admit);
    }
    if (joined) o.changed();
  };
  const admit = () => (stage.staged ? admitAsSent() : admitOne());
  return {
    take: (spot, scene) => {
      arrived.push({ spot, scene });
    },
    schedule() {
      if (stage.staged) {
        if (!admitting && arrived.length) admitAsSent();
        o.changed();
      } else if (!o.ahead) admitOne();
      else {
        if (!admitting && arrived.length) {
          admitting = true;
          requestAnimationFrame(admit);
        }
        o.changed();
      }
    },
  };
}
