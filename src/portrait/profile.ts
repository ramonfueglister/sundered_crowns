// How a portrait is lit and what its surfaces are made of, per set of dress. Apoleia's Roman portraits keep exactly
// what Apoleia had in Godot (the comparison in tools/portrait/compare.mjs holds them to it). A set of dress of the
// game's own (portrait/src/dress.rs) names itself in front of the look ("england1356/...") and may bring its own
// profile here.
//
// The profile of 1356 was set by eye in rounds against screenshots of Crusader Kings III (docs/PORTRAITS.md), so
// every number in it is a PLACEHOLDER in the project's sense: chosen, not measured or sourced.

/** A light: where it stands seen from the point the camera looks at, its colour, Godot's energy. */
export interface StageLight { from: readonly [number, number, number]; colour: string; energy: number }

export interface StageProfile {
  key: string;
  lights: { key: StageLight; rim: StageLight; fill: StageLight };
  sky: { top: string; ground: string; energy: number };
  exposure: number;
  /** Sharpness of the images seen at a slant (anisotropic filtering, 1 = off). */
  anisotropy: number;
  /** Skin: null leaves it as the builder gives it. Else roughness, Godot's "specular", strength of the pores'
   *  normal map; how far light bleeds round the edge of its shadow per colour (wrap lighting, the usual stand-in
   *  for scattering inside skin); how blotchy (broad patches redder or paler) and speckled (fine, in brightness). */
  skin: null | { rough: number; specular: number; pores: number; wrap: readonly [number, number, number]; blotch: number; speckle: number };
  /** The eyeball: null as it is. Else the upper lid's shadow (darkening to `dark` between these heights of the
   *  ball's normal), a tint, and how much of its colour is left (1 = all). */
  eye: null | { lid: { from: number; to: number; dark: number }; tint: readonly [number, number, number]; colour: number };
  /** Lashes and brows: null as they are. Else roughness, "specular", and how dense the lashes are (1 = as painted). */
  brow: null | { rough: number; specular: number; lashes: number };
  /** Hair cards: roughness, "specular", anisotropy of the glint. */
  cards: { rough: number; specular: number; anisotropy: number };
}

/** Apoleia's stage (app/scripts/ui/portrait_cache.gd) and materials (sim/godot/src/portrait.rs). */
export const APOLEIA: StageProfile = {
  key: 'apoleia',
  lights: {
    key: { from: [-3.5, 4.5, 5.0], colour: '#fff0dc', energy: 2.0 },
    rim: { from: [3.5, 2.5, -4.0], colour: '#bcd0ff', energy: 1.4 },
    fill: { from: [3.0, -1.0, 5.0], colour: '#ffe2c8', energy: 0.35 },
  },
  sky: { top: '#e6ecff', ground: '#5a3d2a', energy: 0.75 },
  exposure: 0.92,
  anisotropy: 1,
  skin: null, eye: null, brow: null,
  cards: { rough: 0.55, specular: 0.3, anisotropy: 0.5 },
};

/** England 1356: the key light more from the side and less light from all round, so that a face has a lit and a
 *  shaded half; matt, blotchy skin with a soft edge of the shadow; eyes shaded by the lid and less white; thin
 *  lashes; matt hair. All PLACEHOLDER (see above). */
export const ENGLAND_1356: StageProfile = {
  key: 'england1356',
  lights: {
    key: { from: [-4.5, 4.5, 4.0], colour: '#fff0de', energy: 2.15 },
    rim: { from: [3.5, 2.5, -4.0], colour: '#bcd0ff', energy: 1.8 },
    fill: { from: [3.0, -1.0, 5.0], colour: '#ffe2c8', energy: 0.2 },
  },
  sky: { top: '#e6ecff', ground: '#5a3d2a', energy: 0.42 },
  exposure: 0.86,
  anisotropy: 8,
  skin: { rough: 0.72, specular: 0.35, pores: 1.5, wrap: [0.26, 0.13, 0.08], blotch: 0.11, speckle: 0.10 },
  eye: { lid: { from: -0.35, to: 0.05, dark: 0.7 }, tint: [0.95, 0.93, 0.91], colour: 0.8 },
  brow: { rough: 1, specular: 0.05, lashes: 0.45 },
  cards: { rough: 0.72, specular: 0.2, anisotropy: 0.3 },
};

const PROFILES = [ENGLAND_1356];

/** The profile of a portrait, from the name of its look: the set of dress in front of the slash, else Apoleia's. */
export function profileOf(look: string): StageProfile {
  const slash = look.indexOf('/');
  return (slash > 0 && PROFILES.find(p => p.key === look.slice(0, slash))) || APOLEIA;
}
