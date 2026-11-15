// The materials of a portrait, as Apoleia's bridge set them in Godot (sim/godot/src/portrait.rs): which surface is
// skin, eye, hair card, painted cap, brow or cloth is read from the name of its image, as there.
//
// Godot's settings in three.js terms: "specular" s is a reflectance at normal incidence of 0.16 s² (0.04 at the
// default 0.5), which three.js sets through the index of refraction; hair cards are blended with a depth pass of
// their opaque parts first (two materials); the light scattering inside skin has no counterpart in three.js and is
// left out (docs/PORTRAITS.md lists it as a deviation).
import {
  CustomBlending, DoubleSide, FrontSide, LessEqualDepth, MeshPhysicalMaterial, OneFactor, OneMinusSrcAlphaFactor,
  SrcAlphaFactor, type Texture, Vector2,
} from 'three';
import type { PortraitSurface } from './wire';

/** What kind of surface an image belongs to, in the order Apoleia's bridge asks. */
export type SurfaceKind = 'plain' | 'cloth' | 'cap' | 'eyeball' | 'brow' | 'cards' | 'skin';

export function surfaceKind(s: PortraitSurface): SurfaceKind {
  const path = s.tex;
  if (!path) return 'plain';
  if (path.includes('/cloth_')) return 'cloth';
  if (path.includes('_cap.')) return 'cap';
  if (path.includes('/eyeball')) return 'eyeball';
  if ((s.double && path.includes('/eye')) || path.includes('/Eye')) return 'brow';
  if (s.double) return 'cards';
  return 'skin';
}

/** The order in which the blended surfaces are drawn over the solid ones: the painted cap first, the hair cards
 *  over it, brows and lashes last. */
export function drawOrder(s: PortraitSurface): number {
  return { plain: 0, skin: 0, eyeball: 0, cloth: 0, cap: 1, cards: 2, brow: 3 }[surfaceKind(s)];
}

/** The normal map of a surface: the one it names (skin with age wrinkles), else the one beside its image (name_n). */
export function normalMapOf(s: PortraitSurface, images: Set<string>): string {
  if (!s.tex) return '';
  if (s.nmap) return s.nmap;
  const dot = s.tex.lastIndexOf('.');
  const beside = `${s.tex.slice(0, dot)}_n${s.tex.slice(dot)}`;
  return images.has(beside) ? beside : '';
}

/** The index of refraction whose reflectance at normal incidence is Godot's for a "specular" of `s`. */
function ior(s: number): number {
  const r = Math.sqrt(0.16 * s * s);
  return (1 + r) / (1 - r);
}

/** Blended over what is behind it. The picture has a transparent background, so its own alpha must only ever grow:
 *  three.js' usual blending would make the skin under a half-transparent hair half-transparent too. */
function blended(m: MeshPhysicalMaterial): void {
  m.transparent = true; m.depthWrite = false;
  m.blending = CustomBlending;
  m.blendSrc = SrcAlphaFactor; m.blendDst = OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = OneFactor; m.blendDstAlpha = OneMinusSrcAlphaFactor;
}

/** How strongly the opaque parts of a hair card have to cover to be drawn in the depth pass. */
const CARD_OPAQUE = 0.99;

/** The materials of a surface, drawn in this order (hair cards have two, everything else one). */
export function surfaceMaterials(s: PortraitSurface, map: Texture | null, normalMap: Texture | null): MeshPhysicalMaterial[] {
  const kind = surfaceKind(s);
  const m = new MeshPhysicalMaterial({
    vertexColors: true, roughness: s.rough, metalness: s.metal, ior: ior(0.5),
    side: s.double ? DoubleSide : FrontSide, map,
    normalMap, normalScale: new Vector2(1, 1),
  });
  switch (kind) {
    case 'plain': case 'skin': break;
    case 'cloth': m.side = DoubleSide; m.roughness = 0.95; m.ior = ior(0.15); break;
    case 'cap': blended(m); m.roughness = 0.85; m.ior = ior(0.15); m.side = DoubleSide; break;
    case 'eyeball': m.roughness = 0.08; m.ior = ior(0.6); break;
    case 'brow': blended(m); m.side = DoubleSide; break;
    case 'cards': {
      m.side = DoubleSide; m.roughness = 0.55; m.ior = ior(0.3); m.anisotropy = 0.5;
      const depth = m.clone();
      depth.alphaTest = CARD_OPAQUE; depth.colorWrite = false;
      blended(m); m.depthFunc = LessEqualDepth;
      return [depth, m];
    }
  }
  return [m];
}
