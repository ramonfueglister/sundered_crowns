// The finish of a portrait: from the picture in linear light, drawn finer than the canvas (stage.ts), to the
// colours on the canvas. Each pixel of the canvas is the mean of the finer picture's pixels under it; the light is
// brought into what a screen shows through a tone curve that keeps a colour's hue (three.js' own curves bend
// each of red, green and blue on its own, which turns lit skin yellow and pale); then the picture as a whole is
// graded, laid on its backdrop and darkened towards its corners. What is measured and what is by eye stands with
// the values, in profile_1356.ts `finish`.
import { Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, type Texture, Vector2, Vector3, type WebGLRenderer, Color } from 'three';
import type { StageProfile } from './profile';

type FinishProfile = NonNullable<StageProfile['finish']>;

const VERTEX = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

/** The tone curve (Uchimura 2017, "HDR theory and practice", the curve of Gran Turismo): a toe (`black`: how
 *  tightly the darks are drawn together), a straight part from `start` on over `length` of the way to white with
 *  the slope `contrast`, and a shoulder that comes to rest at white. Light in, share of the screen's white out. */
export const CURVE = `
float toneCurve( float x, float a, float m, float l, float c ) {
  float l0 = ( 1.0 - m ) * l / a;
  float s0 = m + l0, s1 = m + a * l0;
  float c2 = a / ( 1.0 - s1 );
  float w0 = 1.0 - smoothstep( 0.0, m, x ), w2 = step( s0, x ), w1 = 1.0 - w0 - w2;
  float toe = m * pow( max( x, 0.0 ) / m, c );
  float shoulder = 1.0 - ( 1.0 - s1 ) * exp( - c2 * ( x - s0 ) );
  return toe * w0 + ( m + a * ( x - m ) ) * w1 + shoulder * w2;
}`;

/** The same curve reckoned here, for tests and for whoever sets its values. */
export function toneCurve(x: number, c: FinishProfile['curve']): number {
  const { contrast: a, start: m, length: l, black } = c;
  const l0 = (1 - m) * l / a, s0 = m + l0, s1 = m + a * l0, c2 = a / (1 - s1);
  const t = Math.min(1, Math.max(0, x / m)), w0 = 1 - t * t * (3 - 2 * t), w2 = x >= s0 ? 1 : 0, w1 = 1 - w0 - w2;
  return m * Math.pow(Math.max(x, 0) / m, black) * w0 + (m + a * (x - m)) * w1 + (1 - (1 - s1) * Math.exp(-c2 * (x - s0))) * w2;
}

const FRAGMENT = `
uniform sampler2D scene;
uniform float exposure, contrast, start, len, black, hue, pale, colour, vignette, reach, hasBackdrop;
uniform vec3 shade, light, inner, outer;
uniform vec2 at;
varying vec2 vUv;
${CURVE}
vec3 screen( vec3 c ) { return mix( c * 12.92, 1.055 * pow( max( c, 0.0 ), vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) ); }
float grey( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }
float grain( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
void main() {
  vec4 s = texture2D( scene, vUv );
  float a = clamp( s.a, 0.0, 1.0 );
  // what the picture holds is the colour times how much of the pixel it covers
  vec3 c = a > 1e-4 ? max( s.rgb, 0.0 ) / a * exposure : vec3( 0.0 );
  // the curve on the strongest of the three colours, the other two in step with it (the hue kept), against the
  // curve on each of the three alone
  float top = max( c.r, max( c.g, c.b ) );
  vec3 kept = top > 1e-6 ? c * ( toneCurve( top, contrast, start, len, black ) / top ) : vec3( 0.0 );
  vec3 each = vec3( toneCurve( c.r, contrast, start, len, black ), toneCurve( c.g, contrast, start, len, black ), toneCurve( c.b, contrast, start, len, black ) );
  c = mix( each, kept, hue );
  // what is nearly white loses its colour, as on film
  c = mix( c, vec3( grey( c ) ), pale * smoothstep( 0.55, 1.0, max( c.r, max( c.g, c.b ) ) ) );
  c = screen( c );
  float g = grey( c );
  c = mix( vec3( g ), c, colour ) * mix( shade, light, smoothstep( 0.05, 0.75, g ) );
  // the backdrop: lighter round a point behind the head, darker towards the corners
  vec2 d = ( vUv - at ) * vec2( 0.8, 1.0 );
  vec3 back = mix( inner, outer, smoothstep( 0.0, reach, length( d ) ) );
  c = mix( back, c, mix( 1.0, a, hasBackdrop ) );
  vec2 v = vUv - 0.5;
  c *= 1.0 - vignette * smoothstep( 0.25, 0.85, length( v * vec2( 1.0, 0.9 ) ) * 1.4142 );
  c += ( grain( gl_FragCoord.xy ) - 0.5 ) / 255.0;
  gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), mix( a, 1.0, hasBackdrop ) );
}`;

/** A colour as the screen's three numbers (the backdrop and the tints are set as the screen shows them). */
function shown(hex: string): Vector3 {
  const c = new Color(hex).convertLinearToSRGB();
  return new Vector3(c.r, c.g, c.b);
}

export class Finish {
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material = new ShaderMaterial({
    vertexShader: VERTEX, fragmentShader: FRAGMENT, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: {
      scene: { value: null }, exposure: { value: 1 }, contrast: { value: 1 }, start: { value: 0.22 }, len: { value: 0.4 }, black: { value: 1.33 },
      hue: { value: 1 }, pale: { value: 0 }, colour: { value: 1 }, vignette: { value: 0 }, reach: { value: 1 }, hasBackdrop: { value: 0 },
      shade: { value: new Vector3(1, 1, 1) }, light: { value: new Vector3(1, 1, 1) }, inner: { value: new Vector3() }, outer: { value: new Vector3() },
      at: { value: new Vector2(0.5, 0.5) },
    },
  });
  private readonly quad = new Mesh(new PlaneGeometry(2, 2), this.material);

  constructor() { this.quad.frustumCulled = false; this.scene.add(this.quad); }

  /** Draws the finer picture `scene` onto the canvas of `renderer` as the profile finishes it. */
  draw(renderer: WebGLRenderer, scene: Texture, f: FinishProfile, exposure: number): void {
    const u = this.material.uniforms;
    u.scene!.value = scene;
    u.exposure!.value = exposure;
    u.contrast!.value = f.curve.contrast; u.start!.value = f.curve.start; u.len!.value = f.curve.length; u.black!.value = f.curve.black;
    u.hue!.value = f.hue; u.pale!.value = f.pale; u.colour!.value = f.colour; u.vignette!.value = f.vignette;
    (u.shade!.value as Vector3).set(...f.shade); (u.light!.value as Vector3).set(...f.light);
    u.hasBackdrop!.value = f.backdrop ? 1 : 0;
    if (f.backdrop) {
      (u.inner!.value as Vector3).copy(shown(f.backdrop.inner)); (u.outer!.value as Vector3).copy(shown(f.backdrop.outer));
      (u.at!.value as Vector2).set(f.backdrop.at[0], 1 - f.backdrop.at[1]);
      u.reach!.value = f.backdrop.reach;
    }
    renderer.render(this.scene, this.camera);
  }

  dispose(): void { this.material.dispose(); this.quad.geometry.dispose(); }
}
