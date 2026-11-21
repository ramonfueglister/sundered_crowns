// The meshes the stage draws a shape with: its lists of triangles, its faces on the grid of blocks, its joined tops
// (their colours read from the shape's field) and its faces on no grid (../faces.ts).
import * as THREE from 'three/webgpu';
import { faceHit, freeHit } from '../faces';
import { coastOf } from '../sea_corners';
import type { Shape } from '../shape';
import { faceGeometry, fieldGeometry, freeGeometry, geometry } from './geometry';
import type { Materials } from './materials';

/** a mesh that takes shadows, casts them if `casts`, and is drawn on all of the picture's dots (see `marked`) */
function onStage(lists: THREE.BufferGeometry, material: THREE.Material, casts: boolean) {
  const made = new THREE.Mesh(lists, material);
  made.castShadow = casts;
  made.receiveShadow = true;
  made.userData.dots = new THREE.Vector2(0, 1);
  made.userData.ink = 1;
  return made;
}

/**
 * A ray finds the faces of `made` by their rows, with `hit` in the mesh's own room: the mesh's own corners are not
 * where they are drawn.
 */
function hitBy(made: THREE.Mesh, hit: (from: ArrayLike<number>, along: ArrayLike<number>) => number | null) {
  made.raycast = (ray, hits) => {
    const own = ray.ray.clone().applyMatrix4(new THREE.Matrix4().copy(made.matrixWorld).invert()),
      t = hit(own.origin.toArray(), own.direction.toArray());
    if (t === null) return;
    const point = own.at(t, new THREE.Vector3()).applyMatrix4(made.matrixWorld),
      distance = ray.ray.origin.distanceTo(point);
    if (distance >= ray.near && distance <= ray.far) hits.push({ distance, point, object: made });
  };
}

/** The stage's ways of making a mesh of a shape, with the materials it draws them with. */
export function createMeshes(
  m: Pick<
    Materials,
    'faced' | 'gliding' | 'seaFaced' | 'fieldFaced' | 'fieldGliding' | 'fields' | 'freed' | 'lakeFreed'
  >,
) {
  const { faced, gliding, seaFaced, fieldFaced, fieldGliding, fields, freed, lakeFreed } = m;
  const mesh = (shape: Shape, material: THREE.Material, casts: boolean) => onStage(geometry(shape), material, casts);
  /** The faces of a shape as a mesh: one drawing of the four corners and their two triangles for every face. */
  const faceMesh = (shape: Shape, casts: boolean, sea = false) => {
    const f = shape.faces!,
      lists = faceGeometry(shape);
    // (the sea's faces know how far from the coast their corners lie: sea_corners.ts)
    if (sea) lists.setAttribute('coast', new THREE.InstancedBufferAttribute(coastOf(f), 4, true));
    const made = onStage(lists, sea ? seaFaced : f.aim && f.aimCol ? gliding : faced, casts);
    made.userData.glide = 0;
    made.userData.lift = f.lift ?? 0;
    hitBy(made, (from, along) => faceHit(f, from, along));
    return made;
  };
  /**
   * The joined tops of a shape as a mesh, drawn as its faces are, their colours read from the shape's field: its
   * layer of the texture all such meshes share is taken here (`own`: a pilot takes none) and given back as it goes.
   */
  const fieldMesh = (shape: Shape, casts: boolean, own = true) => {
    const f = shape.tops!,
      ends = !!(f.aim && f.aimTones),
      made = onStage(fieldGeometry(shape), ends ? fieldGliding : fieldFaced, casts);
    made.userData.glide = 0;
    made.userData.field = new THREE.Vector3(f.x0, f.z0, own ? fields.take(f.tones) : 0);
    made.userData.ownField = own;
    made.userData.fieldEnd = ends && own ? fields.take(f.aimTones!) : 0;
    hitBy(made, (from, along) => faceHit(f, from, along));
    return made;
  };
  /** The faces on no grid of a shape as a mesh, drawn as the faces on the grid are (`lake`: as water above the sea). */
  const freeMesh = (shape: Shape, casts: boolean, lake = false) => {
    const f = shape.free!,
      made = onStage(freeGeometry(shape), lake ? lakeFreed : freed, casts);
    hitBy(made, (from, along) => freeHit(f, from, along));
    return made;
  };
  /** Gives the layers of the field's texture a mesh of joined tops took back, once, as the mesh leaves the stage. */
  const giveBack = (made: THREE.Mesh) => {
    if (!made.userData.ownField) return;
    // (three keeps userData untyped: `field` and `fieldEnd` are what fieldMesh put there)
    fields.give((made.userData.field as THREE.Vector3).z);
    if (made.material === fieldGliding) fields.give(made.userData.fieldEnd as number);
    made.userData.ownField = false;
  };
  return { mesh, faceMesh, fieldMesh, freeMesh, giveBack };
}

export type Meshes = ReturnType<typeof createMeshes>;
