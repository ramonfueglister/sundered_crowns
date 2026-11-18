// A still of the far map as a landscape, as the great strategy games show it between the diorama and the paper map:
// the land's own heights as a relief under a tilted camera, lit from the north-west with shadows, its skin the
// painted map (tools/atlas/probe.py with ATLAS_3D=1, names by tools/atlas/labels.ts), the woods as clumps of blocks
// and the towns as little groups of houses, larger than life. A probe of the look, outside the game.
// Run: node tools/atlas/land3d.mjs <out> [elevation in degrees = 48] [exaggeration = by the view]
//   reads <out>.base.png, <out>.names.png, <out>.frame.json, <out>.height.f32, <out>.trees.f32, <out>.towns.json; writes <out>.3d.png
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [out, elevation = '48', steep = ''] = process.argv.slice(2);
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), dir = dirname(out), name = basename(out);
const W = 1280, H = 720;
const page = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#000;overflow:hidden}canvas{display:block}
@font-face{font-family:'EB Garamond';font-weight:500;src:url('/font/eb-garamond-latin-500-normal.woff2')}@font-face{font-family:'EB Garamond';font-weight:600;src:url('/font/eb-garamond-latin-600-normal.woff2')}
@font-face{font-family:'EB Garamond';font-weight:500;unicode-range:U+0100-024F;src:url('/font/eb-garamond-latin-ext-500-normal.woff2')}
#names{position:fixed;left:0;top:0;font-family:'EB Garamond',serif;font-weight:500;fill:#1f1a10;stroke:rgba(255,250,238,0.78);stroke-width:2.6px;stroke-linejoin:round;paint-order:stroke fill}#names .big{font-weight:600}
#v{position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 55%,rgba(0,0,0,0) 55%,rgba(10,14,22,0.28) 100%)}</style>
<div id="v"></div><svg id="names" width="${W}" height="${H}"></svg>
<script type="importmap">{"imports":{"three":"/three/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';
const get = (f) => fetch('/data/${name}' + f);
const frame = await (await get('.frame.json')).json(), towns = await (await get('.towns.json')).json();
const heights = new Float32Array(await (await get('.height.f32')).arrayBuffer()), trees = new Float32Array(await (await get('.trees.f32')).arrayBuffer());
const S = frame.w, G = Math.round(Math.sqrt(heights.length)), half = S / 2;
// the picture shows, at its middle, as many pixels of the skin as it is wide: a pixel of the skin is a pixel there
const shown = (frame.wide * ${W}) / S, steep = ${steep || 'null'} ?? 6.5 * (shown / 6000) ** 0.6, up = (m) => (m / frame.metres) * steep;
const heightAt = (x, y) => { const gx = Math.min(G - 1.001, Math.max(0, (x / (S - 1)) * (G - 1))), gy = Math.min(G - 1.001, Math.max(0, (y / (S - 1)) * (G - 1))), ix = Math.floor(gx), iy = Math.floor(gy), tx = gx - ix, ty = gy - iy, at = (j, i) => heights[j * G + i]; return (at(iy, ix) * (1 - tx) + at(iy, ix + 1) * tx) * (1 - ty) + (at(iy + 1, ix) * (1 - tx) + at(iy + 1, ix + 1) * tx) * ty; };

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(${W}, ${H}); renderer.setPixelRatio(1); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);
const scene = new THREE.Scene(), haze = new THREE.Color(0.56, 0.63, 0.7);
scene.background = haze;
const fov = 28, aspect = ${W} / ${H}, away = ${W} / (2 * aspect * Math.tan((fov / 2) * Math.PI / 180)), el = ${Number(elevation)} * Math.PI / 180;
const camera = new THREE.PerspectiveCamera(fov, aspect, away * 0.2, away * 4);
camera.position.set(0, away * Math.sin(el), away * Math.cos(el)); camera.lookAt(0, 0, 0);
scene.fog = new THREE.Fog(haze, away * 1.2, away * 5);

// the land: its heights under its painted skin
const skin = await new THREE.TextureLoader().loadAsync('/data/${name}.base.png');
skin.colorSpace = THREE.SRGBColorSpace; skin.anisotropy = renderer.capabilities.getMaxAnisotropy(); skin.generateMipmaps = true; skin.minFilter = THREE.LinearMipmapLinearFilter;
const ground = new THREE.PlaneGeometry(S, S, G - 1, G - 1); ground.rotateX(-Math.PI / 2);
const pos = ground.attributes.position; for (let i = 0; i < pos.count; i++) pos.setY(i, up(heights[i]));
ground.computeVertexNormals();
const land = new THREE.Mesh(ground, new THREE.MeshStandardMaterial({ map: skin, roughness: 1, metalness: 0 }));
land.receiveShadow = true; land.castShadow = true; scene.add(land);
// the realms' names lie on the land, over its woods: the same shape a little higher, drawn last
const written = await new THREE.TextureLoader().loadAsync('/data/${name}.names.png');
written.colorSpace = THREE.SRGBColorSpace; written.anisotropy = skin.anisotropy;
const names = new THREE.Mesh(ground, new THREE.MeshBasicMaterial({ map: written, transparent: true, depthTest: false, depthWrite: false }));
names.position.y = 3; names.renderOrder = 10; scene.add(names);

// light from the north-west, as on a shaded map; the sky fills the shadows
const altitude = 40 * Math.PI / 180, sun = new THREE.DirectionalLight(new THREE.Color(1, 0.97, 0.9), (0.8 * Math.PI) / Math.sin(altitude));
sun.position.set(-Math.cos(altitude) * Math.SQRT1_2, Math.sin(altitude), -Math.cos(altitude) * Math.SQRT1_2).multiplyScalar(S);
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.intensity = 0.7; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6; sun.shadow.radius = 3;
Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: S * 0.1, far: S * 2.2 });
scene.add(sun, new THREE.HemisphereLight(new THREE.Color(0.8, 0.88, 1), new THREE.Color(0.7, 0.62, 0.52), 0.36 * Math.PI));

// the woods: clumps of blocks, each in its own green
const count = trees.length / 7, clump = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 1 }), count), m = new THREE.Matrix4(), c = new THREE.Color();
for (let i = 0; i < count; i++) {
  const [x, y, h, s, r, g, b] = trees.subarray(i * 7, i * 7 + 7), wide = 3.5 * s, tall = 1.9 * s;
  m.makeScale(wide, tall, wide).setPosition(x - half, up(Math.max(h, heightAt(x, y))) + tall / 2 - 0.2, y - half); clump.setMatrixAt(i, m); clump.setColorAt(i, c.setRGB(r, g, b, THREE.LinearSRGBColorSpace));
}
clump.castShadow = true; clump.receiveShadow = true; scene.add(clump);

// the towns: houses round a middle, the more the more people; a tower where a realm has its seat or the town is great
const spots = []; let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (const t of towns) {
  const n = Math.max(3, Math.min(22, Math.round(2 + Math.sqrt(t.people) / 16)));
  for (let k = 0; k < n; k++) { const a = k * 2.39996, r = 3.4 * Math.sqrt(k + 0.4); spots.push({ x: t.x + Math.cos(a) * r, y: t.y + Math.sin(a) * r, s: 0.85 + 0.4 * rnd(), tower: k === 0 && (t.capital || t.people >= 40000), turn: rnd() * Math.PI }); }
}
const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 1 }), spots.length), roof = new THREE.InstancedMesh(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4), new THREE.MeshStandardMaterial({ roughness: 1 }), spots.length);
const q = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0), at = new THREE.Vector3(), size = new THREE.Vector3();
spots.forEach((p, i) => {
  const base = up(heightAt(p.x, p.y)), w = (p.tower ? 2.6 : 3.1) * p.s, tall = p.tower ? 8.5 : 2.2 * p.s, top = p.tower ? 4.2 : 2.0 * p.s;
  q.setFromAxisAngle(yAxis, p.tower ? 0 : p.turn);
  wall.setMatrixAt(i, m.compose(at.set(p.x - half, base + tall / 2, p.y - half), q, size.set(w, tall, w))); wall.setColorAt(i, p.tower ? c.setRGB(0.8, 0.77, 0.7) : c.setRGB(0.86 + 0.08 * rnd(), 0.8, 0.66));
  roof.setMatrixAt(i, m.compose(at.set(p.x - half, base + tall + top / 2, p.y - half), q, size.set(w * 1.15, top, w * 1.15))); roof.setColorAt(i, p.tower ? c.setRGB(0.3, 0.33, 0.4) : c.setRGB(0.58 + 0.1 * rnd(), 0.27, 0.17));
});
for (const mesh of [wall, roof]) { mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); }

renderer.render(scene, camera); renderer.render(scene, camera);
// the towns' names face the viewer, beside their houses; the greater town first, a name that finds no room is left out
await document.fonts.load("500 14px 'EB Garamond'"); await document.fonts.load("600 14px 'EB Garamond'");
const svg = document.getElementById('names'), boxes = [], v = new THREE.Vector3();
for (const t of towns) {
  v.set(t.x - half, up(heightAt(t.x, t.y)) + 3, t.y - half).project(camera);
  const sx = (v.x + 1) / 2 * ${W}, sy = (1 - v.y) / 2 * ${H}, size = [12, 13.5, 16][t.rank ?? 0], wide = t.name.length * size * 0.47, reach = 6 + 3.4 * Math.sqrt(Math.max(3, Math.min(22, Math.round(2 + Math.sqrt(t.people) / 16))));
  if (v.z > 1 || sx < 0 || sy < 0 || sx > ${W} || sy > ${H}) continue;
  for (const [x, y, anchor] of [[sx + reach, sy + size * 0.3, 'start'], [sx - reach, sy + size * 0.3, 'end'], [sx, sy - reach - 3, 'middle'], [sx, sy + reach + size * 0.8, 'middle']]) {
    const x0 = anchor === 'start' ? x : anchor === 'end' ? x - wide : x - wide / 2, box = [x0 - 3, y - size * 0.85, x0 + wide + 3, y + size * 0.3];
    if (box[0] < 2 || box[2] > ${W} - 2 || box[1] < 2 || box[3] > ${H} - 2 || boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
    boxes.push(box);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x.toFixed(1)); text.setAttribute('y', y.toFixed(1)); text.setAttribute('font-size', size); text.setAttribute('text-anchor', anchor); if (t.rank === 2) text.setAttribute('class', 'big');
    text.textContent = t.name; svg.append(text); break;
  }
}
globalThis.__done = { clumps: count, houses: spots.length, steep };
</script>`;
const types = { woff2: 'font/woff2', js: 'text/javascript', json: 'application/json', png: 'image/png', f32: 'application/octet-stream' };
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = url === '/' ? null : url.startsWith('/three/') ? join(root, 'node_modules/three/build', url.slice(7)) : url.startsWith('/font/') ? join(root, 'node_modules/@fontsource/eb-garamond/files', url.slice(6)) : url.startsWith('/data/') ? join(dir, url.slice(6)) : '';
  if (file === null) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page); }
  if (!file || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[file.split('.').pop()] ?? 'application/octet-stream' }); res.end(readFileSync(file));
}).listen(0);
const port = server.address().port;
let playwright; try { playwright = createRequire(import.meta.url)('playwright'); } catch { playwright = createRequire('/opt/node22/lib/node_modules/')('playwright'); }
const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const tab = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
tab.on('pageerror', (e) => console.log('[pageerror]', e.message)); tab.on('console', (msg) => { if (msg.type() === 'error') console.log('[console]', msg.text()); });
await tab.goto(`http://localhost:${port}/`);
await tab.waitForFunction(() => globalThis.__done, null, { timeout: 600000 });
console.log(`${out}.3d.png`, JSON.stringify(await tab.evaluate(() => globalThis.__done)));
await tab.screenshot({ path: `${out}.3d.png` });
await browser.close(); server.close();
