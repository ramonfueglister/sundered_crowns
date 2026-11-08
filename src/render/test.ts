// Dev harness for the map renderer: /render-test.html?q=high&mode=political&loop=1
import { loadMapAssets, MapRenderer, type MapLabel, type MapUnit, type Quality } from './index';

interface SetupState { id: string; short: { en: string }; color: string; capital_loc?: number }
interface Setup { states: SetupState[]; owner: number[] }

declare global {
  interface Window { __ready?: boolean; __error?: string; __r?: MapRenderer; __log?: string[] }
}

const hud = document.getElementById('hud')!;
const log = (s: string) => { (window.__log ??= []).push(s); hud.textContent = window.__log.slice(-8).join('\n'); console.log(s); };

function hex(c: string): [number, number, number] {
  const v = parseInt(c.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

async function main() {
  const params = new URLSearchParams(location.search);
  const quality = (params.get('q') as Quality) || 'high';
  let t = performance.now();
  const assets = await loadMapAssets('/');
  log(`assets ${(performance.now() - t).toFixed(0)} ms  ${assets.W}x${assets.H}  L=${assets.geo.L} S=${assets.geo.S}`);
  const setup: Setup = await fetch('/data/setup_1356.json').then((r) => r.json());
  const canvas = document.getElementById('map') as HTMLCanvasElement;
  t = performance.now();
  const r = await MapRenderer.create(canvas, assets, quality);
  log(`renderer ${(performance.now() - t).toFixed(0)} ms  quality=${quality}`);
  window.__r = r;
  const g = assets.geo, L = g.L, N = g.L + g.S;

  // political state from the 1356 setup (owner = 0-based index into states, -1 none)
  const nS = setup.states.length;
  const nationColors = new Uint8Array(nS * 3);
  setup.states.forEach((s, i) => nationColors.set(hex(s.color), i * 3));
  const owner = new Int16Array(N).fill(-1), ctrl = new Int16Array(N).fill(-1);
  for (let i = 0; i < L; i++) owner[i] = setup.owner[i] ?? -1;
  ctrl.set(owner);
  const idx = (id: string) => setup.states.findIndex((s) => s.id === id);
  const eng = idx('england'), fra = idx('france');
  // fake occupation: English troops hold French locations around Normandy; a rebel pocket in Hungary
  for (let i = 0; i < L; i++) {
    if (owner[i] === fra && g.loc.x[i] < 3640 && g.loc.y[i] < 1800) ctrl[i] = eng;
    if (owner[i] === idx('hungary') && Math.hypot(g.loc.x[i] - 4720, g.loc.y[i] - 1960) < 40) ctrl[i] = -2;
  }
  r.setPolitical(owner, ctrl, nationColors);
  // ink-spread demo: England takes the French locations within 260 px of Paris, animated from Rouen
  (window as unknown as { __ink: (advance: number) => void }).__ink = (advance: number) => {
    const o2 = owner.slice(), changes: { loc: number; order: number }[] = [];
    const pi = g.loc.name.indexOf('Paris'), ri = g.loc.name.indexOf('Rouen');
    for (let i = 0; i < L; i++) {
      const d = Math.hypot(g.loc.x[i] - g.loc.x[pi], g.loc.y[i] - g.loc.y[pi]);
      if (owner[i] === fra && d < 260) { o2[i] = eng; changes.push({ loc: i, order: Math.floor(d / 60) }); }
    }
    r.setPolitical(o2, o2, nationColors);
    r.animateOwnerChange(changes, g.loc.x[ri], g.loc.y[ri]);
    for (let t = 0; t < advance; t += 0.1) r.render(100);
  };

  // map-mode colours: a development-like gradient for the flat mode
  const rgba = new Uint8Array(N * 4);
  for (let i = 0; i < L; i++) {
    const v = Math.min(1, Math.log10((g.loc.pop[i] ?? 1000) + 1) / 5.5);
    rgba.set([Math.round(60 + 190 * v), Math.round(40 + 150 * (1 - Math.abs(v - 0.6))), Math.round(140 * (1 - v)), 255], i * 4);
  }
  r.setLocationColors(rgba);

  // snow: winter in the north-east
  const snow = new Float32Array(L);
  for (let i = 0; i < L; i++) snow[i] = Math.max(0, Math.min(1, (g.loc.lat[i] - 52) / 10 + (g.loc.lon[i] - 15) / 60));
  r.setSnow(snow);

  // nation labels: centroid + principal axis of the owned locations
  const acc = new Map<number, number[]>();
  for (let i = 0; i < L; i++) if (owner[i] >= 0) { const a = acc.get(owner[i]) ?? []; a.push(i); acc.set(owner[i], a); }
  const labels: MapLabel[] = [];
  for (const [n, locs] of acc) {
    if (locs.length < 6) continue;
    let mx = 0, my = 0;
    for (const l of locs) { mx += g.loc.x[l]; my += g.loc.y[l]; }
    mx /= locs.length; my /= locs.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const l of locs) { const dx = g.loc.x[l] - mx, dy = g.loc.y[l] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    let ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    ang = Math.max(-0.5, Math.min(0.5, ang));
    const ext = Math.sqrt((sxx + syy) / locs.length);
    const name = setup.states[n].short.en.toUpperCase();
    labels.push({ text: name, x: mx, y: my, angle: ang, size: Math.max(4, Math.min(Math.sqrt(locs.length) * 1.5, (ext * 2.4) / Math.max(4, name.length))) });
  }
  // a few town labels
  for (const nm of ['Paris', 'London', 'Prague', 'Vienna', 'Venice', 'Rome', 'Constantinople', 'Lübeck', 'Cologne', 'Rouen']) {
    const i = g.loc.name.indexOf(nm);
    if (i >= 0) labels.push({ text: nm, x: g.loc.x[i], y: g.loc.y[i] - 4, angle: 0, size: 3.2, color: '#2b1d10' });
  }
  r.setLabels(labels);

  const paris = g.loc.name.indexOf('Paris');
  const px = g.loc.x[paris], py = g.loc.y[paris];
  const units: MapUnit[] = [
    { id: 1, x: px - 30, y: py - 28, color: hex(setup.states[eng].color), label: '12k', kind: 'army', selected: true, moving: true, path: [[px - 12, py - 10], [px + 2, py + 2]] },
    { id: 2, x: px + 30, y: py + 12, color: hex(setup.states[fra].color), label: '18k', kind: 'army' },
    { id: 3, x: px - 98, y: py - 72, color: hex(setup.states[eng].color), label: '24', kind: 'fleet' },
    { id: 4, x: px - 55, y: py + 40, color: hex(setup.states[fra].color), label: '6k', kind: 'siege' },
    { id: 5, x: px + 75, y: py - 40, color: hex(setup.states[fra].color), label: '9k', kind: 'battle' },
  ];
  r.setUnits(units);

  // selection: Paris plus its province highlighted
  const prov = g.provinces.find((p) => p.locs.includes(paris + 1));
  r.setSelection(paris, prov ? prov.locs.map((l) => l - 1).filter((l) => l !== paris) : []);

  const mode = params.get('mode');
  if (mode === 'terrain' || mode === 'flat' || mode === 'political') r.setMode(mode);

  r.attachControls(canvas);
  r.onClick = (loc) => { log(`click ${loc} ${loc >= 0 ? g.loc.name[loc] : ''}`); r.setSelection(loc); };
  r.onRightClick = (loc) => log(`right ${loc}`);
  r.onHover = (loc) => { hud.dataset.hover = String(loc); };
  if (params.get('loop') !== '0') r.start();
  window.__ready = true;
  log('ready');
}

main().catch((e) => { window.__error = String(e?.stack || e); log('ERROR ' + e); });
