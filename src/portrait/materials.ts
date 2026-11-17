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
  ShaderChunk, SrcAlphaFactor, type Texture, Vector2, Vector3,
} from 'three';
import { APOLEIA, type StageProfile } from './profile';
import type { PortraitSurface } from './wire';

/** What kind of surface an image belongs to, in the order Apoleia's bridge asks. Brows and lashes are known by
 *  their image's name alone (`eyebrow...`, `Eyelashes...`): an image of them under another name is drawn as a
 *  hair card. The round strands of a plait (`..._rope`) and the locks of a head's hair (`..._locks`) are hair that
 *  is solid: no card, nothing shows through but where the image is empty (a lock's frayed ends). */
export type SurfaceKind = 'plain' | 'cloth' | 'metal' | 'cap' | 'eyeball' | 'brow' | 'cards' | 'rope' | 'skin';

export function surfaceKind(s: PortraitSurface): SurfaceKind {
  const path = s.tex;
  if (!path) return 'plain';
  if (path.includes('/cloth_')) return 'cloth';
  // helms, mail and crowns (portrait/src/dress.rs `HEADWEAR`): metal that mirrors the stage's surroundings
  if (path.includes('/metal_')) return 'metal';
  if (path.includes('_cap.')) return 'cap';
  if (path.includes('_rope.') || path.includes('_locks.')) return 'rope';
  if (path.includes('/eyeball')) return 'eyeball';
  if ((s.double && path.includes('/eye')) || path.includes('/Eye')) return 'brow';
  if (s.double) return 'cards';
  return 'skin';
}

/** The order in which the blended surfaces are drawn over the solid ones: the painted cap first, the hair cards
 *  over it, brows and lashes last. */
export function drawOrder(s: PortraitSurface): number {
  return { plain: 0, skin: 0, eyeball: 0, cloth: 0, metal: 0, rope: 0, cap: 1, cards: 2, brow: 3 }[surfaceKind(s)];
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

/** How far the image of solid hair has to cover for the hair to be there: below it, nothing is drawn. */
export const LOCK_OPAQUE = 0.5;

const f = (v: number): string => v.toFixed(3);
const DIFFUSE = 'reflectedLight.directDiffuse += irradiance * diffuseBRDF * ( 1.0 - F );';
/** three.js' direct lighting with the light bleeding round the edge of the shadow by `wrap` (a vec3 in GLSL), in
 *  the diffuse part only: the highlight keeps to the lit side (lit by the wrapped light as well, its term for
 *  grazing angles, which divides by N.L, turned single pixels at the head's outline white). With `gloss` the
 *  highlight is multiplied by the shader's `skinGloss` (see `hidden`). */
function wrapped(wrap: string, gloss = false): string {
  const code = swap(ShaderChunk.lights_physical_pars_fragment, DIFFUSE,
    `vec3 wrapBy = ${wrap}; reflectedLight.directDiffuse += saturate( ( dot( geometryNormal, directLight.direction ) + wrapBy ) / ( 1.0 + wrapBy ) ) * directLight.color * diffuseBRDF * ( 1.0 - F );`);
  return gloss ? swap(code, SPECULAR, SPECULAR.replace(';', ' * skinGloss * skinOil;')) : code;
}
const SPECULAR = 'reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;';
const DIR_LIGHT = 'getDirectionalLightInfo( directionalLight, directLight );';
const DIR_SHADOW = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
/** three.js' loop over the lights, telling the shader's `skinGloss` how much of each light's highlight is left
 *  beside its light. A shadow that is not full (profile.ts `shadow.strength`, `rimShadow`) lets a share of the
 *  light through, which stands for light that reaches the place by other ways (off a wall, off the cheek,
 *  through the nose). Such light is there, but it has no highlight where the lamp's would be: from that place
 *  the lamp is hidden. The highlight takes the shadow whole (`skinLit` is three.js' shadow, 1 = lit; in the
 *  soft edge of a shadow the highlight fades with the share of the lamp still seen). Until round 94 the rim
 *  light's highlight came through the head at half strength: a pale grey patch between the nose and the far
 *  eye, on skin the lamp would skim, where a highlight is at its strongest. */
function hidden(): string {
  return swap(swap(ShaderChunk.lights_fragment_begin, DIR_LIGHT, `${DIR_LIGHT} skinGloss = 1.0;`),
    DIR_SHADOW, `skinLit = ${DIR_SHADOW.slice('directLight.color *= '.length)}
		directLight.color *= skinLit;
		skinGloss = saturate( 1.0 - ( 1.0 - skinLit ) / max( directionalLightShadow.shadowIntensity, 1e-4 ) ) / max( skinLit, 1e-4 );`);
}
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

/** Where the face's middle line lies on the skin's image (its second coordinate; MakeHuman's layout, the same for
 *  every skin: the sellion is at 0.8350, the nose's tip at 0.8732 of the first). */
const FACE_MIDDLE = 0.5168;

/** Skin of a profile: light bleeds round the edge of its shadow, reddest furthest (three.js has no scattering
 *  inside skin as Godot has); and living skin is blotchy where the images of the young are nearly flat: broad
 *  patches a little redder or paler and a fine speckle in brightness, as noise over the head. */
function skinLook(m: MeshPhysicalMaterial, p: StageProfile, k: NonNullable<StageProfile['skin']>, tone: number, young = 0): void {
  // a child's skin has less of the fine structure the images and the noise give a grown person's (`skin.child`)
  const fine = 1 + (k.child - 1) * Math.min(1, Math.max(0, young));
  m.roughness = k.rough; m.ior = ior(k.specular); m.normalScale.set(k.pores * fine, k.pores * fine);
  // the down on skin: light that skims it is thrown back towards whoever looks along it (three.js' sheen)
  if (k.fuzz > 0) { m.sheen = k.fuzz; m.sheenRoughness = 0.6; m.sheenColor.setRGB(1, 0.86, 0.78); }
  const lights = wrapped(`vec3( ${k.wrap.map(f).join(', ')} )`, true), loop = hidden();
  // the tint by the person's skin as a whole (none on dark skin, all of it on light skin), the same over the whole
  // head: taken point by point (until round 54) everything painted darker on light skin lost its red and turned
  // olive, the shadow of a beard most of all, where in living skin the darker places are the redder ones
  const t = Math.min(1, Math.max(0, (tone - 0.12) / (0.45 - 0.12))), share = t * t * (3 - 2 * t);
  const tint = new Vector3(...k.tint.map(c => 1 + (c - 1) * share));
  m.onBeforeCompile = shader => {
    shader.uniforms.skinTint = { value: tint };
    shader.uniforms.skinFine = { value: fine };
    shader.vertexShader = swap(swap(shader.vertexShader, '#include <common>', '#include <common>\nvarying vec3 vSkinP;\nvarying vec2 vSkinUv;'),
      '#include <begin_vertex>', '#include <begin_vertex>\nvSkinP = position;\nvSkinUv = uv;');
    let code = swap(shader.fragmentShader, '#include <lights_physical_pars_fragment>', lights);
    code = swap(code, '#include <lights_fragment_begin>', loop);
    code = swap(code, '#include <common>', `#include <common>${NOISE}\nvarying vec2 vSkinUv;\nuniform vec3 skinTint;\nuniform float skinFine;\nfloat skinGloss = 1.0;\nfloat skinLit = 1.0;\nfloat skinOil = 1.0;`);
    // the skin's fine relief: no skin is a smooth surface, and a highlight on a smooth surface is one pale patch
    // with a soft edge, as on vinyl. The relief is noise over the head at two sizes (4 and 2 mm), as a height
    // whose slope leans the normal (three.js' bump mapping, with the height reckoned instead of read from an
    // image); and the skin's film of oil is not even: the highlight is weaker and stronger in patches
    if (k.relief > 0 || k.oil > 0) code = swap(code, '#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float skinH = ${f(k.relief)} * skinFine * ( skinNoise( vSkinP * 24.0 ) * 0.6 + skinNoise( vSkinP * 51.0 ) * 0.4 );
  vec3 skinDx = dFdx( - vViewPosition ), skinDy = dFdy( - vViewPosition );
  vec3 skinR1 = cross( skinDy, normal ), skinR2 = cross( normal, skinDx );
  float skinDet = dot( skinDx, skinR1 );
  vec3 skinGrad = sign( skinDet ) * ( dFdx( skinH ) * skinR1 + dFdy( skinH ) * skinR2 );
  normal = normalize( abs( skinDet ) * normal - skinGrad );
  skinOil = 1.0 + ${f(k.oil)} * ( skinNoise( vSkinP * 9.0 ) * 0.5 + skinNoise( vSkinP * 33.0 ) * 0.5 - 0.5 ) * 2.0;
  // the face's middle is oilier than its sides: the forehead's middle and the nose's back down to its tip, as
  // places on the skin's image (the face's middle line and the heights of hairline, sellion and nose's tip there)
  skinOil *= 1.0 + ${f(k.zone)} * exp( - pow( ( vSkinUv.y - ${f(FACE_MIDDLE)} ) / 0.017, 2.0 ) ) * smoothstep( 0.775, 0.805, vSkinUv.x ) * ( 1.0 - smoothstep( 0.868, 0.884, vSkinUv.x ) );
}`);
    shader.fragmentShader = swap(code, '#include <color_fragment>', `#include <color_fragment>
float skinA = skinNoise( vSkinP * 7.0 ) * 0.6 + skinNoise( vSkinP * 15.0 ) * 0.4 - 0.5;
float skinB = skinNoise( vSkinP * 60.0 ) * 0.5 + skinNoise( vSkinP * 130.0 ) * 0.5 - 0.5;
diffuseColor.rgb *= vec3( 1.0, 1.0 - ${f(k.blotch * 0.9)} * skinFine * skinA, 1.0 - ${f(k.blotch * 1.1)} * skinFine * skinA ) * ( 1.0 + ${f(k.speckle)} * skinFine * skinB );
float skinGrey = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
diffuseColor.rgb = mix( vec3( skinGrey ), diffuseColor.rgb, ${f(k.colour)} ) * skinTint;`);
  };
  m.customProgramCacheKey = () => `portrait-skin-${p.key}`;
}

/** The painted layer of short hairs of a profile (under the cards, and the beards): lighter, and lit round its
 *  shaded side as the cards are. Its image is far darker than the cards' (it holds the shade between the hairs),
 *  which at a low exposure turns a brown beard black. Under a head of hair the layer is that shade; a beard is
 *  its layer alone and has values of its own (profile.ts `cap.beard`): lighter still, and with a shaded side. */
function capLook(m: MeshPhysicalMaterial, p: StageProfile, k: NonNullable<StageProfile['cap']>, image: string): void {
  const stubble = image.includes('/beard_stubble'), v = !stubble && image.includes('/beard_') ? k.beard : k;
  const lights = wrapped(`vec3( ${f(v.wrap)} )`);
  // stubble lies on skin, which shows between its hairs: drawn lighter it is a pale dust on the face
  const tone = stubble ? 1 + (k.tone - 1) * k.stubble : v.tone, light = stubble ? 1 + (k.light - 1) * k.stubble : v.light;
  m.onBeforeCompile = shader => {
    const code = swap(shader.fragmentShader, '#include <lights_physical_pars_fragment>', lights);
    shader.fragmentShader = swap(code, '#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= mix( ${f(tone)}, ${f(light)}, smoothstep( 0.08, 0.45, dot( vColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ) );
diffuseColor.rgb = mix( vec3( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ), diffuseColor.rgb, ${f(v.colour)} );`);
  };
  m.customProgramCacheKey = () => `portrait-cap-${p.key}-${stubble ? 'stubble' : v === k ? 'hair' : 'beard'}`;
}

/** The eyeball of a profile: the upper lid's shadow (the key light's shadow map is too coarse for a lid, so the
 *  ball darkens towards its top), a tint and less colour. */
function eyeLook(m: MeshPhysicalMaterial, p: StageProfile, k: NonNullable<StageProfile['eye']>): void {
  m.roughness = k.rough; m.ior = ior(k.specular);
  const lights = wrapped(`vec3( ${f(k.wrap)} )`);
  m.onBeforeCompile = shader => {
    shader.vertexShader = swap(swap(shader.vertexShader, '#include <common>', '#include <common>\nvarying float vLidY; varying float vLidX;'),
      '#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvLidY = objectNormal.y; vLidX = abs( objectNormal.x );');
    // the white of the eye and the iris are told apart by the image: its white is light in every colour (0.41 in
    // linear light at its dullest), an iris of any colour is dark in at least one (0.17 at its lightest)
    const code = swap(shader.fragmentShader, '#include <map_fragment>', `#include <map_fragment>
float eyeWhite = 1.0;
float eyeRing = 0.0;
#ifdef USE_MAP
  eyeWhite = smoothstep( 0.22, 0.36, min( sampledDiffuseColor.r, min( sampledDiffuseColor.g, sampledDiffuseColor.b ) ) );
  // the iris' rim: a living iris is darkest in a ring where it meets the white (the cornea's edge lies over it)
  eyeRing = smoothstep( 0.62, 0.98, length( fract( vMapUv * 4.0 ) - 0.5 ) / ${f(27.5 / 360)} ) * ( 1.0 - eyeWhite );
#endif`);
    // the cornea: over the iris the eye's surface is a cap of a smaller ball, so its normal leans outward from the
    // iris' middle, the more the nearer its rim, and the key light's glint lies on the iris instead of on the white
    // beside it. The iris' middle is the middle of its cell of the image (4 x 4 cells), its rim at 27.5 degrees of
    // 360 (tools/portrait/pipeline/eye_tex.py); which way is outward is read from the image's own coordinates
    const bulged = k.cornea <= 0 ? code : swap(code, '#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifdef USE_MAP
{
  vec2 eyeC = fract( vMapUv * 4.0 ) - 0.5;
  float eyeR = length( eyeC ) / ${f(27.5 / 360)};
  float eyeLean = ${f(k.cornea)} * eyeR * ( 1.0 - smoothstep( 0.9, 1.15, eyeR ) );
  if ( eyeLean > 0.0 ) {
    vec3 eyeQ0 = dFdx( - vViewPosition ), eyeQ1 = dFdy( - vViewPosition );
    vec2 eyeS0 = dFdx( vMapUv ), eyeS1 = dFdy( vMapUv );
    vec3 eyeP1 = cross( eyeQ1, normal ), eyeP0 = cross( normal, eyeQ0 );
    vec3 eyeOut = ( eyeP1 * eyeS0.x + eyeP0 * eyeS1.x ) * eyeC.x + ( eyeP1 * eyeS0.y + eyeP0 * eyeS1.y ) * eyeC.y;
    if ( dot( eyeOut, eyeOut ) > 0.0 ) normal = normalize( normal + eyeLean * normalize( eyeOut ) );
  }
}
#endif`);
    shader.fragmentShader = swap(swap(swap(bulged, '#include <lights_physical_pars_fragment>', lights), '#include <common>', '#include <common>\nvarying float vLidY; varying float vLidX;'),
      '#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= mix( ${f(k.iris)} * ( 1.0 - ${f(k.ring)} * eyeRing ), ${f(k.white)}, eyeWhite ) * vec3( ${k.tint.map(f).join(', ')} ) * mix( 1.0, ${f(k.lid.dark)}, smoothstep( ${f(k.lid.from)}, ${f(k.lid.to)}, vLidY ) ) * mix( 1.0, ${f(k.corner.dark)}, smoothstep( ${f(k.corner.from)}, ${f(k.corner.to)}, vLidX ) );
diffuseColor.rgb = mix( vec3( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ), pow( diffuseColor.rgb, vec3( ${f(k.lift)} ) ), ${f(k.colour)} );`);
  };
  m.customProgramCacheKey = () => `portrait-eye-${p.key}`;
}

/** Hair of a profile: two bands of sheen along the strands, for every directional light, shifted towards root and
 *  tip, and ragged by the strands' image. The strand's direction is taken as "down along the head" (a card's
 *  normal points away from the head's centre, portrait/src/real_look.rs): the direction read from the card's own
 *  triangles is constant on each triangle and showed as a band of rectangles.
 *
 *  Cards take sheen and the light round their shaded side from every light, in shadow or not: a card knows of no
 *  shadow but its own direction's. `solid` hair (the round strands of a plait, the locks of a head's hair) stands
 *  in the stage's shadows as any solid thing: its sheen and the light round its shaded side are part of each
 *  light's own share, which three.js has darkened by the light's shadow. */
function hairLook(m: MeshPhysicalMaterial, p: StageProfile, k: NonNullable<StageProfile['sheen']>, solid = false): void {
  // the strand's direction and the two directions the bands are measured against
  const strand = (normal: string, eye: string): string => `vec3 hairDown = - normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  vec3 hairT = hairDown - ${normal} * dot( hairDown, ${normal} );
  if ( dot( hairT, hairT ) > 1e-4 ) {
    hairT = normalize( hairT );
    vec3 hairV = ${eye};
    float hairJ = ( hairStrand - 0.5 ) * ${f(k.ragged)};
    vec3 hairT1 = normalize( hairT + ${normal} * ( ${f(k.whiteShift)} + hairJ ) );
    vec3 hairT2 = normalize( hairT + ${normal} * ( ${f(k.ownShift)} + hairJ ) );`;
  // one light's bands, and its light round the shaded side
  const bands = (colour: string, towards: string, normal: string, diffuse: string): string => `vec3 hairL = ${towards};
      vec3 hairH = normalize( hairL + hairV );
      float hairLit = saturate( dot( ${normal}, hairL ) * 0.7 + 0.3 );
      float hairA = dot( hairT1, hairH ), hairB = dot( hairT2, hairH );
      float hairS1 = pow( sqrt( max( 1.0 - hairA * hairA, 0.0 ) ), ${f(k.whiteSharp)} );
      float hairS2 = pow( sqrt( max( 1.0 - hairB * hairB, 0.0 ) ), ${f(k.ownSharp)} );
      reflectedLight.directSpecular += ${colour} * hairLit * hairStrand * ( ${f(k.white)} * hairS1 * 0.08 + ${f(k.own)} * hairS2 * ${diffuse} );
      float hairN = dot( ${normal}, hairL );
      reflectedLight.directDiffuse += ${colour} * ${diffuse} * RECIPROCAL_PI * ( saturate( ( hairN + ${f(k.wrap)} ) / ( 1.0 + ${f(k.wrap)} ) ) - saturate( hairN ) );`;
  const lights = solid && swap(ShaderChunk.lights_physical_pars_fragment, DIFFUSE, `${DIFFUSE}
#ifdef USE_MAP
{
  ${strand('geometryNormal', 'geometryViewDir')}
      ${bands('directLight.color', 'directLight.direction', 'geometryNormal', 'material.diffuseColor')}
  }
}
#endif`);
  m.onBeforeCompile = shader => {
    let code = swap(shader.fragmentShader, '#include <map_fragment>', `#include <map_fragment>
${solid ? '' : 'float '}hairStrand = 1.0;
#ifdef USE_MAP
  hairStrand = dot( sampledDiffuseColor.rgb, vec3( 0.3333 ) );
  diffuseColor.rgb *= pow( max( hairStrand, 0.001 ) / 0.6, ${f(k.strands - 1)} );
#endif`);
    code = swap(code, '#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= pow( min( hairStrand / 0.8, 1.0 ), ${f(k.light)} * smoothstep( 0.08, 0.45, dot( vColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ) );
diffuseColor.rgb = mix( vec3( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ), diffuseColor.rgb, ${f(k.colour)} );`);
    if (lights) {
      // the strands' image is read in the picture's main part and used in each light's share: a value of the
      // whole shader
      code = swap(swap(code, '#include <lights_physical_pars_fragment>', lights), '#include <common>', '#include <common>\nfloat hairStrand;');
    } else {
      code = swap(code, '#include <lights_fragment_end>', `#include <lights_fragment_end>
#if defined( USE_MAP ) && NUM_DIR_LIGHTS > 0
{
  ${strand('normal', 'normalize( vViewPosition )')}
    for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
      ${bands('directionalLights[ i ].color', 'directionalLights[ i ].direction', 'normal', 'diffuseColor.rgb')}
    }
  }
}
#endif`);
    }
    shader.fragmentShader = code;
  };
  m.customProgramCacheKey = () => `portrait-hair-${p.key}${solid ? '-solid' : ''}`;
}

/** How light a person's skin is: the median brightness of the skin's colours (linear light; the skin's images are
 *  near white and hold the detail only). */
export function skinTone(col: Float32Array): number {
  const grey: number[] = [];
  for (let i = 0; i + 2 < col.length; i += 3) grey.push(0.2126 * col[i]! + 0.7152 * col[i + 1]! + 0.0722 * col[i + 2]!);
  if (!grey.length) return 0;
  grey.sort((a, b) => a - b);
  return grey[grey.length >> 1]!;
}

/** How light the skin of a portrait is as a whole: the tone of its largest surface of skin (a scar of the real look
 *  is a small surface of skin of its own and takes the tone of the skin it lies in). */
export function portraitSkinTone(surfaces: readonly PortraitSurface[]): number | undefined {
  let skin: PortraitSurface | undefined;
  for (const s of surfaces) if (surfaceKind(s) === 'skin' && (!skin || s.pos.length > skin.pos.length)) skin = s;
  return skin && skinTone(skin.col);
}

/** The materials of a surface, drawn in this order (hair cards have two, everything else one). `tone`: how light
 *  the person's skin is as a whole (`portraitSkinTone`; left out, the surface's own); `young`: how much of a child's
 *  skin the person has (`Portrait.young`). */
export function surfaceMaterials(s: PortraitSurface, map: Texture | null, normalMap: Texture | null, p: StageProfile = APOLEIA, tone?: number, young = 0): MeshPhysicalMaterial[] {
  const kind = surfaceKind(s);
  const m = new MeshPhysicalMaterial({
    vertexColors: true, roughness: s.rough, metalness: s.metal, ior: ior(0.5),
    side: s.double ? DoubleSide : FrontSide, map,
    normalMap, normalScale: new Vector2(1, 1),
  });
  switch (kind) {
    case 'plain': break;
    case 'skin': if (p.skin) skinLook(m, p, p.skin, tone ?? skinTone(s.col), young); break;
    case 'cloth': m.side = DoubleSide; m.roughness = 0.95; m.ior = ior(0.15); break;
    // metal: the builder says how rough (plate smoother than mail); it mirrors the surroundings the stage hands it
    // (stage.ts `surroundings`), which only a profile with `metal` has: without, it is drawn as Apoleia drew metal
    case 'metal':
      if (p.metal) {
        m.metalness = 1; m.roughness = Math.min(1, s.rough * p.metal.rough); m.envMapIntensity = p.metal.mirror;
        m.side = s.double ? DoubleSide : FrontSide;
      }
      break;
    case 'cap': blended(m); m.roughness = 0.85; m.ior = ior(0.15); m.side = DoubleSide; if (p.cap) capLook(m, p, p.cap, s.tex); break;
    case 'eyeball': m.roughness = 0.08; m.ior = ior(0.6); if (p.eye) eyeLook(m, p, p.eye); break;
    case 'brow':
      blended(m); m.side = DoubleSide;
      if (p.brow) {
        m.roughness = p.brow.rough; m.ior = ior(p.brow.specular);
        m.opacity = s.tex.includes('/Eyelashes') ? p.brow.lashes : p.brow.brows;
      }
      break;
    // the strands of a plait, the locks of a head's hair: hair as the cards are, but solid: drawn with the solid
    // surfaces, it hides what is behind it, throws shadows and takes them. A plait's strand is closed and drawn
    // from outside; a lock is an arched band, open below and drawn from both sides (the builder says which,
    // `double`). Where the image covers less than half there is nothing (a lock's hairs end one after the other:
    // a frayed end), and so in the shadow it throws. Not `alphaToCoverage`: its part-covered edge would be written
    // into the picture as a part-clear pixel, and the picture stands on whatever the page shows behind it
    case 'rope':
      m.roughness = p.cards.rough; m.ior = ior(p.cards.specular); m.anisotropy = p.cards.anisotropy;
      m.alphaTest = LOCK_OPAQUE;
      if (p.sheen) hairLook(m, p, p.sheen, true);
      break;
    case 'cards': {
      m.side = DoubleSide; m.roughness = p.cards.rough; m.ior = ior(p.cards.specular); m.anisotropy = p.cards.anisotropy;
      if (p.sheen) hairLook(m, p, p.sheen);
      const depth = m.clone();
      depth.alphaTest = CARD_OPAQUE; depth.colorWrite = false;
      blended(m); m.depthFunc = LessEqualDepth;
      return [depth, m];
    }
  }
  return [m];
}
