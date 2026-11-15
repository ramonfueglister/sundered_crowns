// The materials of a portrait, as Apoleia's bridge set them in Godot (sim/godot/src/portrait.rs): which surface is
// skin, eye, hair card, painted cap, brow or cloth is read from the name of its image, as there.
//
// Godot's settings in three.js terms: "specular" s is a reflectance at normal incidence of 0.16 s² (0.04 at the
// default 0.5), which three.js sets through the index of refraction; hair cards are blended with a depth pass of
// their opaque parts first (two materials); the light scattering inside skin has no counterpart in three.js and is
// left out for Apoleia's portraits (docs/PORTRAITS.md lists it as a deviation). What a set of dress of the game's
// own does differently stands in its profile (profile.ts).
import {
  CustomBlending, DoubleSide, FrontSide, LessEqualDepth, MeshPhysicalMaterial, OneFactor, OneMinusSrcAlphaFactor,
  ShaderChunk, SrcAlphaFactor, type Texture, Vector2,
} from 'three';
import { APOLEIA, type StageProfile } from './profile';
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

const f = (v: number): string => v.toFixed(3);
const DIRECT = 'vec3 irradiance = dotNL * directLight.color;';
const NOISE = `
varying vec3 vSkinP;
float skinHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float skinNoise( vec3 x ) { vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( skinHash( i ), skinHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( skinHash( i + vec3( 0, 1, 0 ) ), skinHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
    mix( mix( skinHash( i + vec3( 0, 0, 1 ) ), skinHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( skinHash( i + vec3( 0, 1, 1 ) ), skinHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }`;

/** Replaces a piece of three.js' shader; says so when three.js has changed and the piece is no longer there. */
function swap(code: string, piece: string, by: string): string {
  if (!code.includes(piece)) throw new Error(`portrait: three.js' shader has no "${piece}" any more`);
  return code.replace(piece, by);
}

/** Skin of a profile: light bleeds round the edge of its shadow, reddest furthest (three.js has no scattering
 *  inside skin as Godot has); and living skin is blotchy where the images of the young are nearly flat: broad
 *  patches a little redder or paler and a fine speckle in brightness, as noise over the head. */
function skinLook(m: MeshPhysicalMaterial, p: StageProfile, k: NonNullable<StageProfile['skin']>): void {
  m.roughness = k.rough; m.ior = ior(k.specular); m.normalScale.set(k.pores, k.pores);
  const lights = swap(ShaderChunk.lights_physical_pars_fragment, DIRECT,
    `vec3 wrapSkin = vec3( ${k.wrap.map(f).join(', ')} ); vec3 irradiance = saturate( ( dot( geometryNormal, directLight.direction ) + wrapSkin ) / ( 1.0 + wrapSkin ) ) * directLight.color;`);
  m.onBeforeCompile = shader => {
    shader.vertexShader = swap(swap(shader.vertexShader, '#include <common>', '#include <common>\nvarying vec3 vSkinP;'),
      '#include <begin_vertex>', '#include <begin_vertex>\nvSkinP = position;');
    let code = swap(shader.fragmentShader, '#include <lights_physical_pars_fragment>', lights);
    code = swap(code, '#include <common>', `#include <common>${NOISE}`);
    shader.fragmentShader = swap(code, '#include <color_fragment>', `#include <color_fragment>
float skinA = skinNoise( vSkinP * 7.0 ) * 0.6 + skinNoise( vSkinP * 15.0 ) * 0.4 - 0.5;
float skinB = skinNoise( vSkinP * 60.0 ) * 0.5 + skinNoise( vSkinP * 130.0 ) * 0.5 - 0.5;
diffuseColor.rgb *= vec3( 1.0, 1.0 - ${f(k.blotch * 0.9)} * skinA, 1.0 - ${f(k.blotch * 1.1)} * skinA ) * ( 1.0 + ${f(k.speckle)} * skinB );
diffuseColor.rgb = mix( vec3( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ), diffuseColor.rgb, ${f(k.colour)} );`);
  };
  m.customProgramCacheKey = () => `portrait-skin-${p.key}`;
}

/** The eyeball of a profile: the upper lid's shadow (the key light's shadow map is too coarse for a lid, so the
 *  ball darkens towards its top), a tint and less colour. */
function eyeLook(m: MeshPhysicalMaterial, p: StageProfile, k: NonNullable<StageProfile['eye']>): void {
  m.roughness = k.rough; m.ior = ior(k.specular);
  m.onBeforeCompile = shader => {
    shader.vertexShader = swap(swap(shader.vertexShader, '#include <common>', '#include <common>\nvarying float vLidY;'),
      '#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvLidY = objectNormal.y;');
    shader.fragmentShader = swap(swap(shader.fragmentShader, '#include <common>', '#include <common>\nvarying float vLidY;'),
      '#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= vec3( ${k.tint.map(f).join(', ')} ) * mix( 1.0, ${f(k.lid.dark)}, smoothstep( ${f(k.lid.from)}, ${f(k.lid.to)}, vLidY ) );
diffuseColor.rgb = mix( vec3( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ), diffuseColor.rgb, ${f(k.colour)} );`);
  };
  m.customProgramCacheKey = () => `portrait-eye-${p.key}`;
}

/** The materials of a surface, drawn in this order (hair cards have two, everything else one). */
export function surfaceMaterials(s: PortraitSurface, map: Texture | null, normalMap: Texture | null, p: StageProfile = APOLEIA): MeshPhysicalMaterial[] {
  const kind = surfaceKind(s);
  const m = new MeshPhysicalMaterial({
    vertexColors: true, roughness: s.rough, metalness: s.metal, ior: ior(0.5),
    side: s.double ? DoubleSide : FrontSide, map,
    normalMap, normalScale: new Vector2(1, 1),
  });
  switch (kind) {
    case 'plain': break;
    case 'skin': if (p.skin) skinLook(m, p, p.skin); break;
    case 'cloth': m.side = DoubleSide; m.roughness = 0.95; m.ior = ior(0.15); break;
    case 'cap': blended(m); m.roughness = 0.85; m.ior = ior(0.15); m.side = DoubleSide; break;
    case 'eyeball': m.roughness = 0.08; m.ior = ior(0.6); if (p.eye) eyeLook(m, p, p.eye); break;
    case 'brow':
      blended(m); m.side = DoubleSide;
      if (p.brow) {
        m.roughness = p.brow.rough; m.ior = ior(p.brow.specular);
        m.opacity = s.tex.includes('/Eyelashes') ? p.brow.lashes : p.brow.brows;
      }
      break;
    case 'cards': {
      m.side = DoubleSide; m.roughness = p.cards.rough; m.ior = ior(p.cards.specular); m.anisotropy = p.cards.anisotropy;
      const depth = m.clone();
      depth.alphaTest = CARD_OPAQUE; depth.colorWrite = false;
      blended(m); m.depthFunc = LessEqualDepth;
      return [depth, m];
    }
  }
  return [m];
}
