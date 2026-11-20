// The look in numbers: the light, the tone of the picture and the layers of the stage.
import { RIG, CREASES } from '../light';

/** the creases of a dot of the smaller picture count for a dot of the picture whose surface lies within this many blocks of its point */
export const UPSAMPLE_REACH = 0.25;

/**
 * The look in numbers. Light strengths are shares of the brightness of sunlit level ground (= 1), in linear light.
 * Measured on the reference: a cast shadow keeps about a third of the light, a wall turned away from the sun about a
 * quarter of a sunlit wall, and a shadow is a little shorter than the thing that casts it. One sun cannot give all three, so the rig has a high sun that casts the
 * shadows and a level side light without shadows that brightens the walls facing right.
 */
export const LOOK = {
  distance: 3000,
  sun: RIG.sun as number,
  sunElevation: RIG.sunElevation,
  sunTurn: RIG.sunTurn,
  sunColor: 0xffe9c8,
  side: RIG.side as number,
  sideColor: 0xfff0dc,
  sky: RIG.sky as number,
  skyColor: 0xa8c4ff,
  bounce: RIG.bounce as number,
  bounceColor: 0xffe2c0,
  fill: RIG.fill as number,
  fillColor: 0xffe0c4,
  mirror: 0.38,
  mirrorTint: 0x73c0cc,
  mirrorBlur: 0.003,
  creaseReach: CREASES.reach as number,
  creaseDepth: CREASES.depth as number,
  creaseColor: CREASES.colour as number,
  focusRange: 150,
  blur: 2.6,
};

/** The strengths and colours of the light that a page may set for itself. */
export type Light = Pick<
  typeof LOOK,
  'sun' | 'sunColor' | 'side' | 'sky' | 'skyColor' | 'bounce' | 'fill' | 'mirror' | 'mirrorTint'
>;
/**
 * The light of the near view: softer than the far view's, so that the shaded sides keep about two thirds of the sunlit
 * ones, as in the reference class image of the near view; and the softness of its cast shadows (the look's is 2).
 */
export const NEAR_LIGHT: Light = {
    sun: 1.05,
    sunColor: 0xfff2e4,
    side: 0.7,
    sky: 0.4,
    skyColor: 0xc8d4f0,
    bounce: 0.26,
    fill: 0.26,
    mirror: 0.3,
    mirrorTint: 0x1898a8,
  },
  NEAR_SHADOW = 6;
export const FAR_SHADOW = 2;
/** how the picture's light is taken (see the curve before the map's paper below) */
export const TONE = { way: 'agx', exposure: 1.15, saturation: 1.3 };
/** of the land's light and shade this share is left under the map's paper where it is fully calmed (see Stage.lay) */
export const CALM_KEPT = 0.4;
/** how bright level, sunlit ground is drawn (luminance, linear light): the map's ink under the land's own light and shade is as bright as on the paper there */
export const LIT_GROUND = 0.32;
/** the figures of a piece are gone when another layer has taken this share of its dots (see `dissolve`) */
export const FIGURES_GONE = 0.3;
/**
 * the layer of what the water's mirror does not draw, while the picture's camera sees it: the figures, and the sea
 * itself (three hides the material of the mesh that asks for the mirror's picture while it draws that, and no more:
 * the sea has two, its faces' and its lists', and a mesh of the other that is drawn there asks for a mirror image
 * of the mirror's own camera, which leaves the mirror black)
 */
export const FIGURES_LAYER = 1;
