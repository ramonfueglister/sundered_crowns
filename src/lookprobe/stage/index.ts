// The stage of the look: renderer, light rig, camera and picture pipeline. A scene (ground, things, water) is put on
// it and shown with the camera of Ramon's reference image.
// The parts: api.ts (what a page sees), look.ts (the look in numbers), materials.ts, geometry.ts, picture.ts (the
// picture pipeline), kept_shadow.ts, sending.ts (?send=1), address.ts; this file puts them together into a Stage.
// Address options: ?webgl=1 (WebGL 2 instead of WebGPU), ?w=1672&h=941 (fixed picture size), ?blur=1 (miniature blur,
// which the reference does not have), ?shadows=0, ?mirror=0 (no mirror image on the water), ?sky=0 (without the baked sky share: light step 1 only),
// ?ao=0 (without the darkening of creases and corners; ?aoscale, ?aosamples, ?aosmooth: see there). ?small=0: the pieces' directions and
// colours come as floats, not as bytes (worldprobe/small.ts). ?faces=0: their rectangles on the grid of blocks come as
// triangles in those lists, not as faces (faces.ts); ?free=0: the rectangles on no grid of what stands on them do.
// ?pilots=0: the shaders of a kind of mesh are made when its first mesh is drawn, not at the start (see there).
// ?seatime=<seconds>: the moment a still of fixed size shows the moving water at (../sea.ts, 0).
import * as THREE from 'three/webgpu';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { FRAME_W, LAND_Y, N, NEAR, RIGHT, SEA_Y, VIEW } from '../layout';
import { RIG, towards } from '../light';
import { anyFigures, disposeFigures, figureMeshes, keepFigures, showFigures, warmFigures } from '../../figures/stage';
import { OPEN_WATER } from '../terrain';
import { FACE_COL, FACE_GEO, FREE_GEO, faceHit, freeHit } from '../faces';
import type { Shape, StageScene } from '../shape';
import type { Stage, StageOptions } from './api';
import { flag, q } from './address';
import { FAR_SHADOW, FIGURES_GONE, FIGURES_LAYER, LOOK, NEAR_LIGHT, NEAR_SHADOW } from './look';
import { KeptShadow } from './kept_shadow';
import { faceGeometry, fieldGeometry, freeGeometry, geometry } from './geometry';
import { createMaterials } from './materials';
import { createPicture } from './picture';
import { createSender } from './sending';

export type { Shape, StageScene } from '../shape';
export type { Stage, StageOptions } from './api';
export { NEAR_LIGHT, NEAR_SHADOW, type Light } from './look';

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
  scene.background = new THREE.Color(...OPEN_WATER);
  const {
    smallLists,
    solid,
    water,
    faced,
    fieldFaced,
    fieldGliding,
    fields,
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

  // light step 1: sun, side light and sky; strengths are multiplied by π because a Lambert surface returns light / π
  const rad = THREE.MathUtils.degToRad;
  /** a direction on the ground given by its share to the right of the picture and towards its back, raised by `elev` */
  const from = (turn: number, elev: number) => new THREE.Vector3(...towards(turn, elev));
  const L = { ...LOOK, ...o.light };
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  const shade = new KeptShadow(sun);
  const side = new THREE.DirectionalLight(L.sideColor),
    sky = new THREE.HemisphereLight();
  // light thrown back by the sunlit ground and walls: it lifts the walls that face the viewer's left, as in the reference
  const fill = new THREE.DirectionalLight(L.fillColor);
  scene.add(sun, sun.target, side, side.target, fill, fill.target, sky);
  let softened = -1;
  /** the page's own light, mixed towards the near view's by a share */
  const soften = (share: number) => {
    if (share === softened) return;
    softened = share;
    const at = (k: 'sun' | 'side' | 'sky' | 'bounce' | 'fill' | 'mirror') => L[k] + (NEAR_LIGHT[k] - L[k]) * share;
    const colour = (k: 'sunColor' | 'skyColor' | 'mirrorTint') =>
      new THREE.Color(L[k]).lerp(new THREE.Color(NEAR_LIGHT[k]), share);
    sun.color.copy(colour('sunColor'));
    sun.intensity = at('sun') * Math.PI;
    sun.shadow.radius = (o.shadowRadius ?? FAR_SHADOW) + (NEAR_SHADOW - (o.shadowRadius ?? FAR_SHADOW)) * share;
    side.intensity = at('side') * Math.PI;
    fill.intensity = at('fill') * Math.PI;
    sky.color.copy(colour('skyColor'));
    sky.groundColor.set(L.bounceColor).multiplyScalar(at('bounce') / at('sky'));
    sky.intensity = at('sky') * Math.PI;
    // the mirror image is laid over what the water keeps of its own colour
    tint.value.copy(colour('mirrorTint')).multiplyScalar(at('mirror'));
    if (water !== solid) {
      water.color.setRGB(1 - tint.value.r, 1 - tint.value.g, 1 - tint.value.b);
      seaFaced.color.copy(water.color);
    }
    pending = Math.max(pending, 1);
  };

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
    const toSun = from(LOOK.sunTurn, LOOK.sunElevation);
    sun.position.copy(centre).addScaledVector(toSun, 420);
    sun.target.position.copy(centre);
    // the shadow map covers the ground of the picture and what stands on it, seen from the sun
    const sc = sun.shadow.camera,
      wide = new THREE.Vector3().crossVectors(toSun, new THREE.Vector3(0, 1, 0)).normalize(),
      up = new THREE.Vector3().crossVectors(wide, toSun);
    let halfW = 0,
      halfH = 0,
      depth = 0;
    for (const s of [-0.02, 1.02])
      for (const t of [-0.02, 1.02])
        for (const y of [0, o.tall ?? 36]) {
          const u = (s - 0.5) * frameW,
            v = (t - 0.5) * frameD,
            p = new THREE.Vector3(u * RIGHT[0] + v * NEAR[0], y - landY, u * RIGHT[1] + v * NEAR[1]);
          halfW = Math.max(halfW, Math.abs(p.dot(wide)));
          halfH = Math.max(halfH, Math.abs(p.dot(up)));
          depth = Math.max(depth, Math.abs(p.dot(toSun)));
        }
    sc.left = -halfW;
    sc.right = halfW;
    sc.top = halfH;
    sc.bottom = -halfH;
    sc.near = 420 - depth - 10;
    sc.far = 420 + depth + 10;
    sc.updateProjectionMatrix();
    side.position.copy(centre).addScaledVector(from(0, 0), 100);
    side.target.position.copy(centre);
    fill.position.copy(centre).addScaledVector(from(RIG.fillTurn, RIG.fillElevation), 100);
    fill.target.position.copy(centre);
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
    pending = Math.max(pending, 1);
  };
  aim(N / 2, N / 2, frameW, o.elevation ?? VIEW.elevation);
  soften(0);

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
    pending = Math.max(pending, 1);
  };
  addEventListener('resize', resize);
  controls?.addEventListener('change', () => {
    pending = Math.max(pending, 1);
  });
  resize();

  const mesh = (shape: Shape, material: THREE.Material, casts: boolean) => {
    const made = new THREE.Mesh(geometry(shape), material);
    made.castShadow = casts;
    made.receiveShadow = true;
    made.userData.dots = new THREE.Vector2(0, 1);
    made.userData.ink = 1;
    return made;
  };
  /** The faces of a shape as a mesh: one drawing of the four corners and their two triangles for every face. */
  const faceMesh = (shape: Shape, casts: boolean, sea = false) => {
    const f = shape.faces!,
      made = new THREE.Mesh(faceGeometry(shape), sea ? seaFaced : f.aim && f.aimCol ? gliding : faced);
    made.castShadow = casts;
    made.receiveShadow = true;
    made.userData.dots = new THREE.Vector2(0, 1);
    made.userData.ink = 1;
    made.userData.glide = 0;
    made.userData.lift = f.lift ?? 0;
    // (a ray finds the faces by their rows: the mesh's own corners are not where they are drawn)
    made.raycast = (ray, hits) => {
      const own = ray.ray.clone().applyMatrix4(new THREE.Matrix4().copy(made.matrixWorld).invert()),
        t = faceHit(f, own.origin.toArray(), own.direction.toArray());
      if (t === null) return;
      const point = own.at(t, new THREE.Vector3()).applyMatrix4(made.matrixWorld),
        distance = ray.ray.origin.distanceTo(point);
      if (distance >= ray.near && distance <= ray.far) hits.push({ distance, point, object: made });
    };
    return made;
  };
  /**
   * The joined tops of a shape as a mesh, drawn as its faces are, their colours read from the shape's field: its
   * layer of the texture all such meshes share is taken here (`own`: a pilot takes none) and given back as it goes.
   */
  const fieldMesh = (shape: Shape, casts: boolean, own = true) => {
    const f = shape.tops!,
      ends = !!(f.aim && f.aimTones),
      made = new THREE.Mesh(fieldGeometry(shape), ends ? fieldGliding : fieldFaced);
    made.castShadow = casts;
    made.receiveShadow = true;
    made.userData.dots = new THREE.Vector2(0, 1);
    made.userData.ink = 1;
    made.userData.glide = 0;
    made.userData.field = new THREE.Vector3(f.x0, f.z0, own ? fields.take(f.tones) : 0);
    made.userData.ownField = own;
    made.userData.fieldEnd = ends && own ? fields.take(f.aimTones!) : 0;
    made.raycast = (ray, hits) => {
      const local = ray.ray.clone().applyMatrix4(new THREE.Matrix4().copy(made.matrixWorld).invert()),
        t = faceHit(f, local.origin.toArray(), local.direction.toArray());
      if (t === null) return;
      const point = local.at(t, new THREE.Vector3()).applyMatrix4(made.matrixWorld),
        distance = ray.ray.origin.distanceTo(point);
      if (distance >= ray.near && distance <= ray.far) hits.push({ distance, point, object: made });
    };
    return made;
  };
  /** The faces on no grid of a shape as a mesh, drawn as the faces on the grid are. */
  const freeMesh = (shape: Shape, casts: boolean) => {
    const f = shape.free!,
      made = new THREE.Mesh(freeGeometry(shape), freed);
    made.castShadow = casts;
    made.receiveShadow = true;
    made.userData.dots = new THREE.Vector2(0, 1);
    made.userData.ink = 1;
    made.raycast = (ray, hits) => {
      const own = ray.ray.clone().applyMatrix4(new THREE.Matrix4().copy(made.matrixWorld).invert()),
        t = freeHit(f, own.origin.toArray(), own.direction.toArray());
      if (t === null) return;
      const point = own.at(t, new THREE.Vector3()).applyMatrix4(made.matrixWorld),
        distance = ray.ray.origin.distanceTo(point);
      if (distance >= ray.near && distance <= ray.far) hits.push({ distance, point, object: made });
    };
    return made;
  };
  // What the renderer makes for a kind of mesh (the shader of its material for its kind of lists, once for the
  // picture's pass, once for the shadows' and once for the mirror's) it makes on the page's thread in the picture
  // that first draws one, and lets go again when the last mesh of the kind leaves the stage (three's NodeManager
  // counts who uses it). The pieces of the far steps, of the near steps and of the sea are of different kinds: a zoom
  // across the border between two steps would have the next kind's shaders made in the middle of its motion, and
  // made again on every way back. So one mesh of each kind the pieces come as is always on the stage, of no size and
  // on none of the picture's dots: what the kinds take is made in the first pictures, while the world is still
  // loading, and kept. The sea's are drawn in the first pictures only: a mesh of the sea in the picture has the
  // mirror's picture drawn, which a view of the land alone goes without; what was made for them stays as long as
  // they are on the stage, drawn or not. ?pilots=0: without all of them. The counts `shaders built` and `ms shaders`
  // tell how many were made and how long that took the page's thread.
  renderer.debug.onNodeBuilderCreated = (builder: unknown) => {
    const made = builder as { build(): unknown },
      build = made.build.bind(made);
    made.build = () => {
      const began = performance.now(),
        c = stage.probe.counts;
      try {
        return build();
      } finally {
        c['shaders built'] = (c['shaders built'] ?? 0) + 1;
        c['ms shaders'] = Math.round(((c['ms shaders'] ?? 0) + performance.now() - began) * 10) / 10;
      }
    };
  };
  /** the sea's, while they are still drawn */
  let seaPilots: THREE.Mesh[] = [];
  if (flag('pilots', true) && smallLists) {
    const lists = (sink = false): Shape => ({
      pos: new Float32Array(9),
      nor: new Int8Array(12),
      col: new Uint8Array(12),
      small: true,
      ball: [0, 0, 0, 0],
      ...(sink ? { sink: new Float32Array(3) } : {}),
    });
    const none: Shape = {
      pos: new Float32Array(0),
      nor: new Int8Array(0),
      col: new Uint8Array(0),
      small: true,
      ball: [0, 0, 0, 0],
    };
    const face = (aimed = false): Shape => ({
      ...none,
      faces: {
        geo: new Int16Array(FACE_GEO),
        col: new Uint8Array(FACE_COL),
        nor: new Int8Array(4),
        ...(aimed ? { aim: new Int16Array(2), aimCol: new Uint8Array(FACE_COL) } : {}),
      },
    });
    const sea = [...(water !== solid ? [mesh(lists(), water, false)] : []), faceMesh(face(), false, true)];
    for (const pilot of [
      mesh(lists(), solid, true),
      mesh(lists(true), sinking, true),
      faceMesh(face(), true),
      faceMesh(face(true), true),
      fieldMesh(
        {
          ...none,
          tops: { geo: new Int16Array(FACE_GEO), nor: new Int8Array(4), tones: new Uint8Array(0), x0: 0, z0: 0 },
        },
        true,
        false,
      ),
      fieldMesh(
        {
          ...none,
          tops: {
            geo: new Int16Array(FACE_GEO),
            nor: new Int8Array(4),
            tones: new Uint8Array(0),
            x0: 0,
            z0: 0,
            aim: new Int16Array(2),
            aimTones: new Uint8Array(0),
          },
        },
        true,
        false,
      ),
      freeMesh(
        { ...none, free: { geo: new Float32Array(FREE_GEO), col: new Uint8Array(FACE_COL), nor: new Int8Array(4) } },
        true,
      ),
      ...sea,
    ]) {
      (pilot.userData.dots as THREE.Vector2).set(0, 0);
      pilot.userData.glide = 0;
      pilot.frustumCulled = false;
      // (the sea's lie where the sea's meshes lie: on the layer the mirror does not draw)
      if (sea.includes(pilot)) pilot.layers.set(FIGURES_LAYER);
      scene.add(pilot);
    }
    seaPilots = sea;
  }
  /** the meshes on the stage that are drawn on a share of the picture's dots, neither all nor none (see `dissolving`) */
  const partial = new Set<THREE.Object3D>();
  // The renderer keeps a record of every mesh it has drawn, and each record hangs on the material, which all pieces
  // share and which is never let go: only the mesh's own 'dispose' takes the record, and with it the mesh and its
  // numbers, out of the renderer. Letting go of the geometry alone leaves them held for good.
  const gone = (made: THREE.Mesh) => {
    warm(made);
    partial.delete(made);
    if (made.userData.ownField) {
      fields.give((made.userData.field as THREE.Vector3).z);
      if (made.material === fieldGliding) fields.give(made.userData.fieldEnd as number);
      made.userData.ownField = false;
    }
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
  const stage: Stage = {
    canvas,
    aim,
    soften,
    busy: true,
    staged,
    probe: { ready: false, counts: {}, backend: flag('webgl', false) ? 'webgl2' : 'webgpu' },
    add(built, x = 0, z = 0) {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
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
          if (shape === built.water) part.layers.set(FIGURES_LAYER);
          group.add(part);
        }
      }
      if (built.figures?.count) {
        const f = figureMeshes(built.figures);
        f.near.layers.set(FIGURES_LAYER);
        f.far.layers.set(FIGURES_LAYER);
        group.add(f.near, f.far);
        marked(group);
        showFigures(frameW);
      }
      scene.add(group);
      pending = Math.max(pending, 3);
      return group;
    },
    remove(group) {
      scene.remove(group);
      // the figures' kit is shared by every piece: only their own mesh is let go (figures/stage.ts)
      for (const mesh of group.children)
        if (mesh.userData.figures === 'near') disposeFigures(mesh);
        else if (!mesh.userData.figures) gone(mesh as THREE.Mesh);
      pending = Math.max(pending, 1);
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
      pending = Math.max(pending, 1);
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
      pending = Math.max(pending, 1);
    },
    whole(group, on) {
      for (const part of group.children) if (!part.userData.figures) part.frustumCulled = !on;
      pending = Math.max(pending, 1);
    },
    glide(group, share) {
      for (const part of group.children)
        if (part.userData.glide !== undefined && part.userData.glide !== share) {
          part.userData.glide = share;
          pending = Math.max(pending, 1);
        }
    },
    pictures: () => pictures,
    put(thing) {
      marked(thing);
      scene.add(thing);
      pending = Math.max(pending, 1);
    },
    take(thing) {
      scene.remove(thing);
      thing.traverse((part) => partial.delete(part));
      pending = Math.max(pending, 1);
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
      pending = Math.max(pending, 1);
    },
    mirror(share) {
      if (mirrorShare.value !== share) {
        mirrorShare.value = share;
        pending = Math.max(pending, 1);
      }
    },
    creases(share, reach = 1) {
      if (creased.value !== share) {
        creased.value = share;
        pending = Math.max(pending, 1);
      }
      if (reached && reached.value !== LOOK.creaseReach * reach) {
        reached.value = LOOK.creaseReach * reach;
        pending = Math.max(pending, 1);
      }
    },
    sea(depths, toMap, round, blocks, homeX, homeZ) {
      surface?.place(depths, toMap, round, blocks, homeX, homeZ);
      pending = Math.max(pending, 1);
    },
    redraw() {
      pending = Math.max(pending, 1);
    },
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
  /**
   * What a picture took, for the tools: the page's own time to hand it over (`draw ms`), and the graphics card's time
   * for it, in all (`gpu ms`) and pass by pass in the order they are drawn (`gpu pass 0` …); each also summed over
   * the pictures (`… sum`, with `gpu pictures` and `draw pictures`), so that a tool can take means between two reads.
   */
  const clock = (draw: number) => {
    const c = stage.probe.counts,
      add = (name: string, v: number) => {
        c[name] = v;
        c[`${name} sum`] = (c[`${name} sum`] ?? 0) + v;
      };
    add('draw ms', draw);
    c['draw pictures'] = (c['draw pictures'] ?? 0) + 1;
    void renderer.resolveTimestampsAsync('render').then((all) => {
      const pool = (
        renderer.backend as unknown as {
          timestampQueryPool?: { render?: { timestamps: Map<string, number>; frames: number[] } };
        }
      ).timestampQueryPool?.render;
      if (all === undefined || !pool) return;
      add('gpu ms', all);
      c['gpu pictures'] = (c['gpu pictures'] ?? 0) + 1;
      // the passes of the last picture that was measured, as they followed each other
      const last = `:f${pool.frames[pool.frames.length - 1]}`;
      let k = 0;
      for (const [uid, ms] of pool.timestamps) if (uid.endsWith(last)) add(`gpu pass ${k++}`, ms);
      c['gpu passes'] = k;
    });
  };
  let drawn = 0,
    since = performance.now(),
    pictures = 0;
  renderer.setAnimationLoop(() => {
    // a picture of fixed size is taken by a tool, which waits for the finished scene: nothing is drawn before
    // walking figures keep the picture moving; a picture of fixed size is a still, so that a tool's picture comes
    // (a picture that something other than the walking figures asks for draws the shadows of all that stands still anew: see KeptShadow)
    const full = pending > 0 || cold.size > 0;
    if (!fixedW && (anyFigures() || cold.size || surface?.moving(frameW, renderer.domElement.width)))
      pending = Math.max(pending, 1);
    if (pending <= 0 || (fixedW && stage.busy)) return;
    shade.full ||= full;
    sun.shadow.needsUpdate = true;
    sender.beforePicture();
    if (laid.strength.value > 0) {
      aimPaper();
      renderer.setRenderTarget(paperPicture);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(paper, paperEye);
      renderer.setRenderTarget(null);
    }
    const began = timed ? performance.now() : 0,
      had = renderer.info.memory.attributesSize;
    dissolving.value = partial.size ? 1 : 0;
    pipeline.render();
    sender.afterPicture();
    drawn++;
    pictures++;
    if (seaPilots.length && pictures >= 2) {
      for (const pilot of seaPilots) pilot.visible = false;
      seaPilots = [];
    }
    // what the picture sent to the graphics card in lists (a tool sets `MB sent most` to 0 and reads the most a picture has sent since)
    {
      const c = stage.probe.counts,
        sent = (renderer.info.memory.attributesSize - had) / 1e6;
      c.pictures = pictures;
      c['MB sent'] = sent;
      c['MB sent sum'] = (c['MB sent sum'] ?? 0) + sent;
      c['MB sent most'] = Math.max(c['MB sent most'] ?? 0, sent);
      if (sent > 0) c['pictures sending'] = (c['pictures sending'] ?? 0) + 1;
    }
    if (timed) clock(performance.now() - began);
    if (performance.now() - since >= 1000) {
      stage.probe.fps = Math.round((drawn * 1000) / (performance.now() - since));
      drawn = 0;
      since = performance.now();
    }
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
