// The stage of the look: renderer, light rig, camera and picture pipeline. A scene (ground, things, water) is put on
// it and shown with the camera of Ramon's reference image.
// The parts: api.ts (what a page sees), look.ts (the look in numbers), rig.ts (the lights), materials.ts, geometry.ts,
// meshes.ts, pilots.ts, picture.ts (the picture pipeline: creases.ts, paper.ts), kept_shadow.ts, sending.ts (?send=1),
// counts.ts (for the tools), address.ts; this file puts them together into a Stage.
// Address options: ?webgl=1 (WebGL 2 instead of WebGPU), ?w=1672&h=941 (fixed picture size), ?blur=1 (miniature blur,
// which the reference does not have), ?shadows=0, ?mirror=0 (no mirror image on the water), ?sky=0 (without the baked sky share: light step 1 only),
// ?ao=0 (without the darkening of creases and corners; ?aoscale, ?aosamples, ?aosmooth: see there). ?small=0: the pieces' directions and
// colours come as floats, not as bytes (worldprobe/small.ts). ?faces=0: their rectangles on the grid of blocks come as
// triangles in those lists, not as faces (faces.ts); ?free=0: the rectangles on no grid of what stands on them do.
// ?pilots=0: the shaders of a kind of mesh are made when its first mesh is drawn, not at the start (pilots.ts).
// ?seatime=<seconds>: the moment a still of fixed size shows the moving water at (../sea.ts, 0).
import * as THREE from 'three/webgpu';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { FRAME_W, LAND_Y, N, NEAR, SEA_Y, VIEW } from '../layout';
import {
  type Figures,
  anyFigures,
  disposeFigures,
  figureMeshes,
  figuresIn,
  keepFigures,
  showFigures,
  warmFigures,
} from '../../figures/stage';
import { OPEN_WATER } from '../terrain';
import type { StageScene } from '../shape';
import type { Stage, StageOptions } from './api';
import { flag, q } from './address';
import { countPictures, countShaders } from './counts';
import { FIGURES_GONE, FIGURES_LAYER, LOOK } from './look';
import { createMaterials } from './materials';
import { createMeshes } from './meshes';
import { addPilots } from './pilots';
import { createPicture } from './picture';
import { createRig } from './rig';
import { createSender } from './sending';

export type { Shape, StageScene } from '../shape';
export type { Stage, StageOptions } from './api';
export { NEAR_LIGHT, NEAR_SHADOW, type Light } from './look';
export { fieldsOnDay } from './seasons';

/** Sets up the stage: renderer, light, camera and picture pipeline, with nothing on it yet. */
export async function createStage(o: StageOptions = {}): Promise<Stage> {
  const canvas = o.canvas ?? document.querySelector('canvas')!;
  const fixedW = Number(q.get('w')) || 0,
    fixedH = Number(q.get('h')) || 0;
  // `?gpu=1`: the graphics card's own time for each pass of a picture is measured (the counts `gpu …`), for the tools
  const timed = flag('gpu', false);
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: true,
    forceWebGL: flag('webgl', false),
    trackTimestamp: timed,
  });
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = flag('shadows', true);
  renderer.shadowMap.type = THREE.PCFShadowMap;
  await renderer.init();

  const scene = new THREE.Scene();
  let pending = 3;
  /** asks for one more picture */
  const redraw = () => {
    pending = Math.max(pending, 1);
  };
  scene.background = new THREE.Color(...OPEN_WATER);
  const {
    smallLists,
    solid,
    water,
    faced,
    fieldFaced,
    fieldGliding,
    fields,
    seasons,
    seaFaced,
    freed,
    gliding,
    sinking,
    surface,
    mirrored,
    tint,
    mirrorShare,
    shareCode,
    inkOf,
    marked,
  } = createMaterials(scene);

  const rig = createRig(scene, o, { tint, water, solid, seaFaced }, redraw);
  const rad = THREE.MathUtils.degToRad;

  // the camera: far away with a long lens, so that the whole picture has one scale (the "parallel" look of the reference)
  const camera = new THREE.PerspectiveCamera(6.5, 1672 / 941, 1, LOOK.distance * 2);
  // The figures are not in the water's mirror image: there they are smaller than its blur, and the frame in which
  // the mirror was first drawn stood for 70 to 90 ms building their shader for its pass (Chrome on a Mac, 16 November 2026).
  camera.layers.enable(FIGURES_LAYER);
  mirrored?.reflector.getVirtualCamera(camera).layers.set(0);
  // one figure of each kit stands out of sight below the stage from the start, so that the figures' shaders are
  // built while the world loads and not in the frame in which a piece's figures or the other kit first show
  {
    const warm = warmFigures();
    warm.position.y = -5000;
    marked(warm);
    scene.add(warm);
  }
  const controls = o.fixed ? null : new MapControls(camera, canvas);
  if (controls) {
    controls.minDistance = 600;
    controls.maxDistance = 4200;
    controls.maxPolarAngle = rad(80);
  }
  let frameW = o.frameW ?? FRAME_W,
    distance: number = LOOK.distance;
  const lens = () => {
    // frameW ground units across the picture at the middle distance, whatever the window shape
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(frameW / camera.aspect / 2 / distance));
    camera.updateProjectionMatrix();
  };
  /** the ground the picture shows, last laid out by `aim` (see `aimPaper`) */
  let ground = { x: 0, z: 0, wide: 1, elev: 1 };
  const aim = (x: number, z: number, across: number, elevation: number, away = 1) => {
    // the picture's middle lies on the land, above the sea by the look's own height times `away`: as far above it in the world at every size of the stage's blocks
    frameW = across;
    distance = LOOK.distance * away;
    const elev = rad(elevation),
      frameD = (frameW * 941) / 1672 / Math.sin(elev),
      landY = SEA_Y + (LAND_Y - SEA_Y) * away,
      centre = new THREE.Vector3(x, landY, z);
    rig.place(centre, frameW, frameD, landY);
    const reach = (frameD / 2) * Math.cos(elev) + 80 + (o.tall ?? 0);
    camera.near = distance - reach;
    camera.far = distance + reach;
    camera.position
      .copy(centre)
      .add(
        new THREE.Vector3(NEAR[0] * Math.cos(elev), Math.sin(elev), NEAR[1] * Math.cos(elev)).multiplyScalar(distance),
      );
    camera.lookAt(centre);
    ground = { x, z, wide: frameW, elev };
    if (controls) {
      controls.target.copy(centre);
      controls.update();
    }
    lens();
    showFigures(frameW);
    redraw();
  };
  aim(N / 2, N / 2, frameW, o.elevation ?? VIEW.elevation);
  rig.soften(0);

  const { pipeline, creased, reached, dissolving, paper, paperEye, paperPicture, laid, aimPaper } = createPicture(
    renderer,
    scene,
    camera,
    o,
    { shareCode, inkOf },
    () => ({ ground, distance }),
  );

  const resize = () => {
    // a canvas of the page's own is laid out by the page; the stage only follows its size
    const w = fixedW || (o.canvas?.clientWidth ?? innerWidth) || 1,
      h = fixedH || (o.canvas?.clientHeight ?? innerHeight) || 1;
    renderer.setPixelRatio(fixedW ? 1 : Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h, !o.canvas || !!fixedW);
    camera.aspect = w / h;
    lens();
    redraw();
  };
  addEventListener('resize', resize);
  controls?.addEventListener('change', redraw);
  resize();

  const meshes = createMeshes({ faced, gliding, seaFaced, fieldFaced, fieldGliding, fields, freed }),
    { mesh, faceMesh, fieldMesh, freeMesh } = meshes;
  const probe: Stage['probe'] = { ready: false, counts: {}, backend: flag('webgl', false) ? 'webgl2' : 'webgpu' };
  countShaders(renderer, probe);
  /** the sea's pilots (pilots.ts), while they are still drawn */
  let seaPilots = flag('pilots', true) && smallLists ? addPilots(scene, meshes, { water, solid, sinking }) : [];
  /** the meshes on the stage that are drawn on a share of the picture's dots, neither all nor none (see `dissolving`) */
  const partial = new Set<THREE.Object3D>();
  // The renderer keeps a record of every mesh it has drawn, and each record hangs on the material, which all pieces
  // share and which is never let go: only the mesh's own 'dispose' takes the record, and with it the mesh and its
  // numbers, out of the renderer. Letting go of the geometry alone leaves them held for good.
  const gone = (made: THREE.Mesh) => {
    warm(made);
    partial.delete(made);
    meshes.giveBack(made);
    made.dispatchEvent({ type: 'dispose' } as never);
    made.geometry.dispose();
  };
  const sender = createSender(scene, camera, fixedW, mesh, {
      solid,
      faced,
      fieldFaced,
      fieldGliding,
      seaFaced,
      gliding,
      freed,
      smallLists,
    }),
    { staged, cold, cool, warm, parts } = sender;
  /** puts the figures of a piece on its group, of which the share `kept` is drawn */
  const addFigures = (group: THREE.Group, figures: Figures | undefined, kept = 1) => {
    if (!figures?.count) return;
    const f = figureMeshes(figures);
    f.near.layers.set(FIGURES_LAYER);
    f.far.layers.set(FIGURES_LAYER);
    group.add(f.near, f.far);
    marked(group);
    keepFigures(f.near, kept);
    showFigures(frameW);
  };
  const stage: Stage = {
    canvas,
    aim,
    soften: rig.soften,
    busy: true,
    staged,
    probe,
    add(built, x = 0, z = 0) {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      // the piece's season map, which its ground and what stands on it read (seasons.ts)
      const season = built.season ? seasons.take(built.season) : null;
      if (season) group.userData.season = season.z;
      for (const [shape, material, casts] of [
        [built.ground, solid, true],
        [built.carried, solid, true],
        [built.things, solid, true],
        [built.water, water, false],
        [built.raised, solid, false],
      ] as const) {
        if (!shape) continue;
        for (const part of [
          ...(shape.faces?.geo.length ? [cool(faceMesh(shape, casts, shape === built.water))] : []),
          ...(shape.tops?.geo.length ? [cool(fieldMesh(shape, casts))] : []),
          ...(shape.free?.geo.length ? [cool(freeMesh(shape, casts))] : []),
          ...(shape.pos.length
            ? parts(shape).map((some) => cool(mesh(some, some.sink && material === solid ? sinking : material, casts)))
            : []),
        ]) {
          if (part.material === sinking) part.userData.glide = 0;
          part.userData.ground = shape === built.ground || shape === built.carried;
          if (shape === built.things || shape === built.carried) part.userData.ink = 0;
          if (season && shape !== built.water && shape !== built.raised)
            part.userData.season = season.clone().setW(shape === built.things ? 1 : 0);
          if (shape === built.water) part.layers.set(FIGURES_LAYER);
          group.add(part);
        }
      }
      addFigures(group, built.figures);
      scene.add(group);
      pending = Math.max(pending, 3);
      return group;
    },
    remove(group) {
      scene.remove(group);
      // (three keeps userData untyped: `season` is the layer `add` took)
      if (group.userData.season !== undefined) seasons.give(group.userData.season as number);
      // the figures' kit is shared by every piece: only their own mesh is let go (figures/stage.ts)
      for (const mesh of group.children)
        if (mesh.userData.figures === 'near') disposeFigures(mesh);
        else if (!mesh.userData.figures) gone(mesh as THREE.Mesh);
      redraw();
    },
    swapFigures(group, figures) {
      // (as many of the new figures are drawn as were of the old: the group may be dissolving)
      const kept = figuresIn(group)?.kept ?? 1;
      for (const mesh of [...group.children])
        if (mesh.userData.figures) {
          if (mesh.userData.figures === 'near') disposeFigures(mesh);
          group.remove(mesh);
        }
      addFigures(group, figures, kept);
      redraw();
    },
    more(group, things) {
      const part = cool(
        things.free?.geo.length && !things.pos.length ? freeMesh(things, true) : mesh(things, solid, true),
      );
      part.userData.ink = 0;
      group.add(part);
      pending = Math.max(pending, 3);
      return part;
    },
    drop(part) {
      part.removeFromParent();
      gone(part);
      redraw();
    },
    sent(thing) {
      return (thing as THREE.Mesh).isMesh
        ? !cold.has(thing as THREE.Mesh)
        : !thing.children.some((part) => cold.has(part as THREE.Mesh));
    },
    room: sender.room,
    dissolve(thing, from, until) {
      // the figures are too small to dissolve dot by dot: they come and go one by one instead, and are all gone
      // well before the other layer has taken a third of the dots, so that it is not seen through them
      const kept = Math.max(0, Math.min(1, until) * (1 - from / FIGURES_GONE));
      for (const part of (thing as THREE.Mesh).isMesh ? [thing] : thing.children) {
        if (part.userData.figures) keepFigures(part, kept);
        else {
          (part.userData.dots as THREE.Vector2).set(from, until);
          if (until > from && (from > 0 || until < 1)) partial.add(part);
          else partial.delete(part);
        }
      }
      redraw();
    },
    whole(group, on) {
      for (const part of group.children) if (!part.userData.figures) part.frustumCulled = !on;
      redraw();
    },
    glide(group, share) {
      for (const part of group.children)
        if (part.userData.glide !== undefined && part.userData.glide !== share) {
          part.userData.glide = share;
          redraw();
        }
    },
    pictures: () => pictures,
    put(thing) {
      marked(thing);
      scene.add(thing);
      redraw();
    },
    take(thing) {
      scene.remove(thing);
      thing.traverse((part) => partial.delete(part));
      redraw();
    },
    paper,
    lay(strength, flat, seaTop, things = 1, calm = 0) {
      if (
        laid.strength.value === strength &&
        laid.flat.value === flat &&
        laid.seaTop.value === seaTop &&
        laid.things.value === things &&
        laid.calm.value === calm
      )
        return;
      laid.strength.value = strength;
      laid.flat.value = flat;
      laid.seaTop.value = seaTop;
      laid.things.value = things;
      laid.calm.value = calm;
      redraw();
    },
    mirror(share) {
      if (mirrorShare.value !== share) {
        mirrorShare.value = share;
        redraw();
      }
    },
    creases(share, reach = 1) {
      if (creased.value !== share) {
        creased.value = share;
        redraw();
      }
      if (reached && reached.value !== LOOK.creaseReach * reach) {
        reached.value = LOOK.creaseReach * reach;
        redraw();
      }
    },
    sea(depths, toMap, round, blocks, homeX, homeZ) {
      surface?.place(depths, toMap, round, blocks, homeX, homeZ);
      redraw();
    },
    redraw,
    dispose() {
      renderer.setAnimationLoop(null);
      removeEventListener('resize', resize);
      renderer.dispose();
    },
    toScreen(x, y, z) {
      camera.updateMatrixWorld();
      const box = canvas.getBoundingClientRect(),
        v = new THREE.Vector3(x, y, z).project(camera);
      if (v.z > 1) return null;
      return [box.left + ((v.x + 1) / 2) * box.width, box.top + ((1 - v.y) / 2) * box.height];
    },
    pick(px, py) {
      const box = canvas.getBoundingClientRect(),
        ray = new THREE.Raycaster(),
        grounds: THREE.Object3D[] = [];
      ray.setFromCamera(
        new THREE.Vector2(((px - box.left) / box.width) * 2 - 1, 1 - ((py - box.top) / box.height) * 2),
        camera,
      );
      scene.traverseVisible((thing) => {
        if (thing.userData.ground) grounds.push(thing);
      });
      const hit = ray.intersectObjects(grounds, false)[0];
      return hit ? [hit.point.x, hit.point.y, hit.point.z] : null;
    },
  };
  (window as unknown as { __probe: Stage['probe'] }).__probe = stage.probe;
  const counting = countPictures(renderer, probe, timed);
  let pictures = 0;
  renderer.setAnimationLoop(() => {
    // a picture of fixed size is taken by a tool, which waits for the finished scene: nothing is drawn before
    // walking figures keep the picture moving; a picture of fixed size is a still, so that a tool's picture comes
    // (a picture that something other than the walking figures asks for draws the shadows of all that stands still anew: see KeptShadow)
    const full = pending > 0 || cold.size > 0;
    if (!fixedW && (anyFigures() || cold.size || surface?.moving(frameW, renderer.domElement.width))) redraw();
    if (pending <= 0 || (fixedW && stage.busy)) return;
    rig.shadows(full);
    sender.beforePicture();
    if (laid.strength.value > 0) {
      aimPaper();
      renderer.setRenderTarget(paperPicture);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(paper, paperEye);
      renderer.setRenderTarget(null);
    }
    counting.before();
    dissolving.value = partial.size ? 1 : 0;
    pipeline.render();
    sender.afterPicture();
    pictures++;
    if (seaPilots.length && pictures >= 2) {
      for (const pilot of seaPilots) pilot.visible = false;
      seaPilots = [];
    }
    counting.after(pictures);
    if (--pending === 0 && !stage.busy) stage.probe.ready = true;
  });
  return stage;
}

/** Builds the scene with `build` (told whether the sky share is to be baked in) and shows it. */
export async function stage(build: (bakedSky: boolean) => StageScene | Promise<StageScene>, o: StageOptions = {}) {
  const st = await createStage(o),
    built = await build(flag('sky', true));
  st.add(built);
  st.probe.counts = built.counts;
  st.busy = false;
}
/** Whether the sky share is to be baked into the ground (address option ?sky=0 switches it off). */
export const bakedSky = () => flag('sky', true);

/** Shows an error of the stage on the page instead of a blank picture. */
export function showError(e: unknown): never {
  document.body.insertAdjacentHTML(
    'beforeend',
    `<pre style="position:fixed;inset:auto 0 0 0;margin:0;padding:12px;background:#400;color:#fff">${String(e)}</pre>`,
  );
  throw e;
}
