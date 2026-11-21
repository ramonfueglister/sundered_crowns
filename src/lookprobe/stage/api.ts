// What a page sees of the stage: its options and the stage itself (the scene it puts on it: ../shape.ts).
import type * as THREE from 'three/webgpu';
import type { Figures } from '../../figures/stage';
import type { Shape, StageScene } from '../shape';
import type { Light } from './look';

export interface StageOptions {
  /** ground units across the picture (default: the frame of the reference) */
  frameW?: number;
  /** how far the camera looks down, in degrees (default: as in the reference) */
  elevation?: number;
  /** the picture is moved by the page itself (`Stage.aim`), not by the stage's own mouse controls */
  fixed?: boolean;
  /** height in blocks of the tallest thing that casts a shadow into the picture */
  tall?: number;
  /** the light strengths of this page where they differ from the look's (the near view is lit softer than the far view) */
  light?: Partial<Light>;
  /** softness of the cast shadows (the look's is 2) */
  shadowRadius?: number;
  /** the canvas to draw on (default: the page's first); the picture is as large as the canvas lies on the page */
  canvas?: HTMLCanvasElement;
}
export interface Stage {
  canvas: HTMLCanvasElement;
  /** Puts a scene on the stage, moved by (x, z) blocks. */
  add(built: StageScene<Shape>, x?: number, z?: number): THREE.Group;
  remove(group: THREE.Group): void;
  /** Puts these figures on a group on the stage in place of those it has (the persons of its towns changed). */
  swapFigures(group: THREE.Group, figures: Figures | undefined): void;
  /**
   * Adds more things to a group on the stage, as a mesh of its own that is shown, hidden and dissolved by itself;
   * `drop` takes it off again. The things as lists, or as faces of floats alone (faces.ts `Free`, with no lists
   * beside them).
   */
  more(group: THREE.Group, things: Shape): THREE.Mesh;
  drop(mesh: THREE.Mesh): void;
  /**
   * `?send=1`: the stage sends the lists of new meshes to the graphics card itself, a few to a picture, before they
   * are shown (`sent`, `room`). Off by default: measured on a Mac it took the single pictures of over 100 ms away
   * but left the zoom at 60 pictures a second where it had 120, and made a cold start and a leap in half a second
   * longer (the stand-ins are meshes of their own to the renderer, which sets each up as it does the mesh itself).
   */
  staged: boolean;
  /**
   * Whether the lists of a group's meshes, or of one mesh, are on the graphics card (always, unless `staged`). A
   * mesh shown before that sends its lists in the picture that first draws it, however long that picture then takes.
   */
  sent(thing: THREE.Group | THREE.Mesh): boolean;
  /** Whether the next picture could send more lists than are waiting to be sent: then the next meshes may as well be put on the stage now. */
  room(): boolean;
  /**
   * Draws a group, or one mesh of it, on a share of the picture's dots only, to dissolve it into the picture or out of it: of a fine
   * pattern that gives every dot a value from 0 to 1, those from `from` up to `until` (0 and 1: all of the group).
   * Two groups whose shares meet take each other's place dot by dot; the picture is then put together from the two,
   * each made whole from its own dots and mixed by the share, so that they blend and no pattern of dots shows.
   */
  dissolve(thing: THREE.Group | THREE.Mesh, from: number, until: number): void;
  /**
   * `on`: the meshes of a group are drawn whether they lie in the picture or not. A group that is drawn so, on none
   * of the picture's dots, has all its lists sent to the graphics card in that picture.
   */
  whole(group: THREE.Group, on: boolean): void;
  /**
   * How far the meshes of a group that glide to the shape of the next coarser step have come, 0 … 1: at 1 each of
   * their faces lies and looks as that step has it there (worldprobe/glide.ts).
   */
  glide(group: THREE.Group, share: number): void;
  /** How many pictures the stage has drawn. */
  pictures(): number;
  /** Puts a thing of the page's own making on the stage, or takes it off again (the page lets go of what it is made of). */
  put(thing: THREE.Object3D): void;
  take(thing: THREE.Object3D): void;
  /** How deep creases and corners are drawn, as a share of the look's own depth (1: as in the reference, 0: not at all), and how far they reach, as a share of the look's own reach in the stage's blocks. */
  creases(share: number, reach?: number): void;
  /** Softens the light towards the near view's, by a share (0: the page's own light, 1: the light of the near view). */
  soften(share: number): void;
  /** How much of the mirror image of what stands by the water shows (1: all; 0: none, the water mirrors the sky alone and the mirror is not drawn). */
  mirror(share: number): void;
  /**
   * The map's paper: what is put on it (the realms' colours, realms.ts) is seen from straight above and laid onto the
   * ground of the picture where it really lies, over relief, houses and trees alike, as the map modes of EU5 lie on
   * its land. Its pictures hold colour times cover and the cover, in linear light.
   */
  paper: THREE.Scene;
  /**
   * How the paper lies on the picture: `strength` how much it covers (0: not at all); `flat` how much of the land's own
   * light and shade it hides and whether it covers the sea too (0: the land shows through it and the sea is left
   * free, 1: the paper's colours as they are, sea and all, as on a printed map); the water's surface lies below `seaTop`.
   * `things`: how much of it lies on what stands on the ground (houses, trees, fields), as a share of what lies on the
   * ground itself (default: as much). `calm`: how far the land's light and shade are evened out under it, 0 … 1: from
   * afar woods and fields are many small blocks, which would speckle the realm's colour.
   */
  lay(strength: number, flat: number, seaTop: number, things?: number, calm?: number): void;
  /** Points camera and lights at a ground point, with `frameW` blocks across the picture, looking down by `elevation` degrees, from `away` times the look's own distance (the farther, the less the far side of the picture is drawn smaller than the near). */
  aim(x: number, z: number, frameW: number, elevation: number, away?: number): void;
  /**
   * Where the stage lies on the world, for the sea's depth and waves (sea.ts `Sea.place`): the depth picture, how a
   * point (x, z) of the stage lies on it, after how many of its widths it comes round, how many finest blocks a block of
   * the stage is, and the stage's (0, 0) in finest blocks.
   */
  sea(
    depths: THREE.Texture | null,
    toMap: readonly number[],
    round: number,
    blocks: number,
    homeX: number,
    homeZ: number,
  ): void;
  /** Asks for a new picture. */
  redraw(): void;
  /** Stops drawing and lets go of the renderer; the stage is not used after that. */
  dispose(): void;
  /** The point of the ground under a point of the page, in the stage's blocks; none where the picture shows no ground. */
  pick(px: number, py: number): [number, number, number] | null;
  /** The point of the page a point of the stage (in its blocks) is drawn at, as of the last aim; null behind the camera. */
  toScreen(x: number, y: number, z: number): [number, number] | null;
  /** what the page reports to the tools that take pictures of it; `ready` is set once a picture is drawn while `busy` is false */
  probe: {
    ready: boolean;
    counts: Record<string, number>;
    backend: string;
    /** pictures drawn in the last second, while figures walk */
    fps?: number;
  };
  /** more is still to come onto the stage (true until the page says otherwise) */
  busy: boolean;
}
