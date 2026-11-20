// `?send=1`: the stage sends the lists of new meshes to the graphics card itself, a few to a picture, before they are
// shown (see Stage.staged for what it measured, and why it is off by default).
import * as THREE from 'three/webgpu';
import type { Shape } from '../shape';
import { flag } from './address';
import { FIGURES_LAYER } from './look';
import type { Materials } from './materials';

type MakeMesh = (shape: Shape, material: THREE.Material, casts: boolean) => THREE.Mesh;

/** The sending of lists for the stage of `scene` seen by `camera` (`fixedW`: a picture of fixed size, see below). */
export function createSender(
  scene: THREE.Scene,
  camera: THREE.Camera,
  fixedW: number,
  mesh: MakeMesh,
  m: Pick<
    Materials,
    'solid' | 'faced' | 'fieldFaced' | 'fieldGliding' | 'seaFaced' | 'gliding' | 'freed' | 'smallLists'
  >,
) {
  const { solid, faced, fieldFaced, fieldGliding, seaFaced, gliding, freed, smallLists } = m;
  // A mesh's lists go to the graphics card in the picture that first draws it, and that takes the page's thread a
  // millisecond or two for every megabyte and more for every list (measured on a Mac: the 49 meshes of one piece
  // of a town 77 ms; 27 meshes that came into the picture together, one picture of 247 ms). So the lists are sent
  // before their mesh is shown, a few to a picture: by stand-ins that share them, are drawn on none of the picture's
  // dots and are not left out for lying outside the picture. While the view moves a picture takes SEND_MOVING bytes,
  // which it can without a jolt; while it rests, where a longer picture does not show, SEND_RESTING. A machine whose
  // pictures take SLOW ms and more each sends as much as would have gone in that time. A picture of fixed size is a
  // tool's still, drawn once when the scene is whole: there the lists go as they are drawn.
  // All this only with `?send=1` (see Stage.staged for what it measured).
  const staged = flag('send', false);
  const SEND_MOVING = 4e6,
    SEND_RESTING = 16e6,
    SEND_LEAST = 0.25e6,
    SLOW = 250,
    RESTS_AFTER = 300;
  /** the meshes whose lists are still to be sent, in the order they were made; the stand-ins of this picture, and whose they are */
  const cold = new Set<THREE.Mesh>(),
    standIns = new THREE.Group();
  /** the bytes of their lists in all, and what the last picture that sent some could take */
  let sending: THREE.Mesh[] = [],
    sentAt = 0,
    movedAt = 0,
    waiting = 0,
    share = SEND_RESTING;
  const eye = new Float64Array(32);
  scene.add(standIns);
  // (one mesh of their kind is always there, on none of the dots: so what the renderer makes for the kind is made
  // in the first picture, and is not let go and made again between the stand-ins of two pictures)
  if (staged) {
    const pilot = mesh(
      { pos: [0, 0, 0, 0, 0, 1, 1, 0, 0], nor: [0, 1, 0, 0, 1, 0, 0, 1, 0], col: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
      solid,
      false,
    );
    (pilot.userData.dots as THREE.Vector2).set(0, 0);
    pilot.frustumCulled = false;
    pilot.layers.set(FIGURES_LAYER);
    scene.add(pilot);
  }
  // (and one of small lists, whose pipeline is another)
  if (staged && smallLists) {
    const pilotSmall = mesh(
      { pos: new Float32Array(9), nor: new Int8Array(12), col: new Uint8Array(12), small: true },
      solid,
      false,
    );
    (pilotSmall.userData.dots as THREE.Vector2).set(0, 0);
    pilotSmall.frustumCulled = false;
    pilotSmall.layers.set(FIGURES_LAYER);
    scene.add(pilotSmall);
  }
  const weight = (g: THREE.BufferGeometry) => {
    const lists = new Set<Float32Array>();
    for (const name in g.attributes) lists.add(g.attributes[name].array as Float32Array);
    let bytes = 0;
    for (const list of lists) bytes += list.byteLength;
    return Math.max(SEND_LEAST, bytes);
  };
  const cool = <M extends THREE.Mesh>(made: M): M => {
    if (staged && !fixedW) {
      cold.add(made);
      waiting += weight(made.geometry);
    }
    return made;
  };
  const warm = (made: THREE.Mesh) => {
    if (cold.delete(made)) waiting -= weight(made.geometry);
  };
  /** Puts the stand-ins of the next meshes into the picture about to be drawn. */
  const send = () => {
    const now = performance.now();
    // (the view moves while the camera's place or lens changes, and for a moment after: a zoom comes in ticks)
    const lens = [...camera.matrixWorld.elements, ...camera.projectionMatrix.elements];
    if (lens.some((v, k) => v !== eye[k])) {
      eye.set(lens);
      movedAt = now;
    }
    // (the time since the last picture counts only from one sending picture to the next, not across a rest)
    const since = sentAt ? now - sentAt : 0;
    share = (now - movedAt < RESTS_AFTER ? SEND_MOVING : SEND_RESTING) * (since > SLOW ? since / (1000 / 60) : 1);
    let room = share;
    for (const made of cold) {
      const bytes = weight(made.geometry);
      if (sending.length && bytes > room) break;
      const standIn = new THREE.Mesh(
        made.geometry,
        made.material === seaFaced
          ? faced
          : made.material === faced ||
              made.material === fieldFaced ||
              made.material === fieldGliding ||
              made.material === gliding ||
              made.material === freed
            ? made.material
            : solid,
      );
      // (all that the material reads of a mesh, as its own mesh has it)
      standIn.userData = { ...made.userData, ground: false, dots: new THREE.Vector2(0, 0) };
      // (it lies on the layer the water's mirror does not draw, and casts no shadow: one pass sends the lists)
      standIn.frustumCulled = false;
      standIn.receiveShadow = true;
      standIn.layers.set(FIGURES_LAYER);
      standIns.add(standIn);
      sending.push(made);
      room -= bytes;
    }
    sentAt = sending.length ? now : 0;
  };
  /** After the picture: its stand-ins have done their work. */
  const haveSent = () => {
    for (const standIn of [...standIns.children]) {
      standIns.remove(standIn);
      standIn.dispatchEvent({ type: 'dispose' } as never);
    }
    for (const made of sending) warm(made);
    sending = [];
  };
  /** A shape as meshes of no more than 4 MB of lists each, the share of one picture while the view moves; they share its lists. */
  const parts = (shape: Shape): Shape[] => {
    const { pos, nor, col } = shape,
      n = pos.length / 9,
      per = shape.small ? 12 : 9;
    if (!staged || !ArrayBuffer.isView(pos) || !ArrayBuffer.isView(nor) || !ArrayBuffer.isView(col)) return [shape];
    const most = Math.floor(SEND_MOVING / ((pos.byteLength + nor.byteLength + col.byteLength) / Math.max(1, n)));
    if (n <= most) return [shape];
    const list: Shape[] = [],
      cut = <T extends ArrayLike<number>>(a: T, from: number, to: number) =>
        (a as unknown as Float32Array).subarray(from, to) as unknown as T;
    // (each keeps the ball of the whole: it is left out of a picture only where the whole would be)
    for (let from = 0; from < n; from += most) {
      const to = Math.min(n, from + most);
      list.push({
        ...shape,
        pos: cut(pos, from * 9, to * 9),
        nor: cut(nor, from * per, to * per),
        col: cut(col, from * per, to * per),
        sink: shape.sink && cut(shape.sink, from * 3, to * 3),
      });
    }
    return list;
  };
  return {
    staged,
    cold,
    cool,
    warm,
    parts,
    /** Whether the next picture could send more lists than are waiting to be sent (Stage.room). */
    room: () => waiting < share,
    /** Before a picture: the stand-ins of the next meshes go into it, or the time between sending pictures starts anew. */
    beforePicture() {
      if (cold.size) send();
      else sentAt = 0;
    },
    /** After a picture: its stand-ins have done their work. */
    afterPicture() {
      if (sending.length) haveSent();
    },
  };
}
