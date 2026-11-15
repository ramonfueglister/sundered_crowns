// The painted map on the stage: the flat picture of the world that lies under the blocks at every distance and takes
// over from them as the view widens (zoom.ts), then takes on the colours of the realms. It is painted tile by tile
// (paint.ts) by a worker, at the level whose dots are about a pixel wide. The tiles form a pyramid (pyramid.ts) whose
// top, one tile for the whole world, is always there, so that the map never shows a hole; where the blocks of a place
// are not built yet, the map shows through.
import * as THREE from 'three/webgpu';
import { dot, texture, uniform, vec3 } from 'three/tsl';
import { LAND_Y, SEA_Y } from '../lookprobe/layout';
import type { Stage } from '../lookprobe/stage';
import { blockOfCell, cellOfBlock } from './land';
import type { RealmName } from './paint';
import type { PaperDone, PaperJob } from './paper.worker';
import type { Layout, View } from './pieces';
import { cover, keyOf } from './pyramid';
import { PAPER_COARSEST, paperLevelOf, paperOf, realmsOf, reliefOf } from './zoom';

/** dots along the side of a tile: the tiles of the region (region.ts) */
const TILE = 512;
/** tiles are painted ahead of need this far around the picture, as a share of its width */
const AHEAD = 0.3;
/** how bright open land is on the map (linear light), and how much of the land's light and shade a realm's colour keeps */
const LAND_LIGHT = 0.5, SHADE_KEPT = 0.6;
/** tiles kept beyond those the view asks for, and how many the worker is given at once */
const SPARE = 16, AT_ONCE = 4;

interface Held {
  level: number; x: number; y: number; seen: number;
  /** the tile under the blocks and once more over them, to fade them out, and its pictures; none where the tile is open sea */
  drawn?: { under: THREE.Mesh; over: THREE.Mesh; land: THREE.Texture; realms: ReturnType<typeof texture> };
  /** the realms' picture: not asked for yet, there, or known to be empty */
  realms?: 'there' | 'none';
}
type Want = { key: string; kind: 'land' | 'realms'; level: number; x: number; y: number; rank: number };

export interface Paper {
  /** Brings the map to the view. Returns how many tiles of what the picture shows of it are still to come. */
  look(view: View, at: Layout): number;
  /** where the realms' names are written; empty until the map has taken on the realms' colours once */
  names: (RealmName & { name: string })[];
  /** the first error of the worker, if any */
  failed: string;
}

/** `ahead`: paint the surroundings of the picture too. `changed` is called whenever a tile has arrived. */
export function createPaper(stage: Stage, o: { region: string; base: string; ahead: boolean; changed(): void }): Paper {
  const held = new Map<string, Held>(), asked = new Map<number, Want | 'names'>(), busy = new Set<string>();
  const paper: Paper = { look, names: [], failed: '' };
  /** how strongly the map covers the blocks, and the realms' colours the land */
  const strength = uniform(0), wash = uniform(0), nothing = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  nothing.needsUpdate = true;
  let nextId = 1, looks = 0, named = false;

  const picture = (pixels: Uint8ClampedArray, colours: boolean) => {
    const t = new THREE.DataTexture(new Uint8Array(pixels.buffer), TILE, TILE, THREE.RGBAFormat);
    if (colours) t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
    return t;
  };
  /** the tile as a square on the ground, in finest blocks from its north-west corner */
  const square = (level: number) => {
    const side = TILE * 2 ** level, e = blockOfCell(side, 0), s = blockOfCell(0, side), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, s[0], 0, s[1], e[0], 0, e[1], s[0], 0, s[1], e[0] + s[0], 0, e[1] + s[1], e[0], 0, e[1]], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 0], 2));
    return g;
  };

  const worker = new Worker(new URL('./paper.worker.ts', import.meta.url), { type: 'module' });
  const ask = (job: { kind: 'names' } | { kind: 'land' | 'realms'; level: number; tx: number; ty: number }, what: Want | 'names') => {
    const id = nextId++;
    asked.set(id, what);
    worker.postMessage({ id, region: o.region, base: o.base, ...job } satisfies PaperJob);
  };
  worker.onmessage = (e: MessageEvent<PaperDone>) => {
    const what = asked.get(e.data.id)!;
    asked.delete(e.data.id);
    if (e.data.error) paper.failed ||= e.data.error;
    else if (what === 'names') paper.names = e.data.names ?? [];
    else if (what.kind === 'land') {
      const h: Held = { level: what.level, x: what.x, y: what.y, seen: looks };
      if (e.data.pixels) {
        // the realms' picture holds colour times cover and the cover: it is laid over the land as far as `wash` says,
        // and keeps the land's light and shade, so that mountains and rivers still show through a realm's colour
        const land = picture(e.data.pixels, true), realms = texture(nothing), ground = texture(land).rgb;
        const shade = dot(ground, vec3(0.2126, 0.7152, 0.0722)).div(LAND_LIGHT).clamp(0, 1.5).mul(SHADE_KEPT).add(1 - SHADE_KEPT);
        const colour = ground.mul(realms.a.mul(wash).oneMinus()).add(realms.rgb.mul(shade).mul(wash));
        const below = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false }), above = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false, transparent: true });
        below.colorNode = colour; above.colorNode = colour; above.opacityNode = strength;
        const g = square(what.level), under = new THREE.Mesh(g, below), over = new THREE.Mesh(g, above);
        // drawn before the blocks and after them, whatever their heights
        under.renderOrder = -1; over.renderOrder = 1;
        for (const m of [under, over]) { m.frustumCulled = false; m.visible = false; stage.put(m); }
        h.drawn = { under, over, land, realms };
      } else h.realms = 'none';
      held.set(what.key, h);
    } else {
      const h = held.get(what.key);
      if (h?.drawn && e.data.pixels) h.drawn.realms.value = picture(e.data.pixels, false);
      if (h) h.realms = h.drawn && e.data.pixels ? 'there' : 'none';
    }
    if (what !== 'names') busy.delete(`${what.kind} ${what.key}`);
    o.changed();
  };
  worker.onerror = (e) => { paper.failed ||= e.message; o.changed(); };
  const drop = (h: Held) => {
    if (!h.drawn) return;
    for (const m of [h.drawn.under, h.drawn.over]) { stage.take(m); (m.material as THREE.Material).dispose(); }
    h.drawn.under.geometry.dispose(); h.drawn.land.dispose();
    if (h.drawn.realms.value !== nothing) h.drawn.realms.value.dispose();
  };

  function look(v: View, at: Layout): number {
    const [cu, cv] = cellOfBlock(v.x, v.z), halfW = v.wide / 2, halfD = v.wide / v.aspect / Math.sin((v.elevation * Math.PI) / 180) / 2;
    const level = paperLevelOf(v.wide, v.pixels), covers = paperOf(v.wide), realms = realmsOf(v.wide);
    looks++;
    /** how far a tile lies outside the picture, in finest cells (0: it reaches into it); the map's cells run with the picture's sides */
    const outside = (l: number, x: number, y: number) => { const side = TILE * 2 ** l; return Math.max(0, Math.abs((x + 0.5) * side - cu) - halfW - side / 2, Math.abs((y + 0.5) * side - cv) - halfD - side / 2); };
    const near = (l: number, around: number) => {
      const side = TILE * 2 ** l, list: { x: number; y: number; out: number; far: number }[] = [];
      for (let y = Math.floor((cv - halfD - around) / side); y * side <= cv + halfD + around; y++) for (let x = Math.floor((cu - halfW - around) / side); x * side <= cu + halfW + around; x++)
        list.push({ x, y, out: outside(l, x, y), far: Math.hypot((x + 0.5) * side - cu, (y + 0.5) * side - cv) });
      return list;
    };

    // what the view asks for: the top of the pyramid first, the coarser level under the picture, its own level in the
    // picture and around it, and the realms once they show
    const wanted: Want[] = [], want = (kind: 'land' | 'realms', l: number, t: { x: number; y: number }, rank: number) => wanted.push({ key: keyOf(l, t.x, t.y), kind, level: l, x: t.x, y: t.y, rank });
    const roots = near(PAPER_COARSEST, 0);
    for (const t of roots) want('land', PAPER_COARSEST, t, -1);
    if (o.ahead && level + 1 < PAPER_COARSEST) for (const t of near(level + 1, 0)) want('land', level + 1, t, t.far);
    for (const t of near(level, o.ahead ? AHEAD * v.wide : 0)) want('land', level, t, (t.out > 0 ? 2e9 : 1e9) + t.far);
    let missing = 0;
    const colours: Want[] = [];
    for (const w of wanted) {
      const h = held.get(w.key), inPicture = w.level === level && w.rank < 2e9;
      if (h) h.seen = looks; else if (covers > 0 && inPicture) missing++;
      // the realms of a tile are painted once its land is there
      if (realms > 0 && inPicture && !h?.realms) { missing++; if (h) colours.push({ ...w, kind: 'realms', rank: 3e9 + w.rank }); }
    }
    wanted.push(...colours);
    if (realms > 0 && !named) { named = true; ask({ kind: 'names' }, 'names'); }
    const queue = wanted.filter((w) => (w.kind === 'realms' || !held.has(w.key)) && !busy.has(`${w.kind} ${w.key}`)).sort((a, b) => b.rank - a.rank);
    while (busy.size < AT_ONCE && queue.length) {
      const next = queue.pop()!;
      busy.add(`${next.kind} ${next.key}`);
      ask({ kind: next.kind, level: next.level, tx: next.x, ty: next.y }, next);
    }

    // what is shown: every part of the picture once, by the finest tile there is of it up to the view's level
    const shown = cover(level, PAPER_COARSEST, roots.map((t) => [t.x, t.y] as const), (l, x, y) => held.get(keyOf(l, x, y)), (l, x, y) => outside(l, x, y) <= 0);
    strength.value = covers; wash.value = realms;
    // the map lies at the height of the plains, which sink towards the sea's level as the view widens
    const ground = SEA_Y + (LAND_Y - SEA_Y) * reliefOf(v.wide, at.step);
    for (const h of held.values()) {
      const show = shown.has(h);
      if (show) h.seen = looks;
      if (!h.drawn) continue;
      h.drawn.under.visible = show; h.drawn.over.visible = show && covers > 0 && covers < 1;
      if (!show) continue;
      const side = TILE * 2 ** h.level, [bx, bz] = blockOfCell(h.x * side, h.y * side);
      for (const m of [h.drawn.under, h.drawn.over]) { m.position.set(bx / at.coarse - at.homeX, ground, bz / at.coarse - at.homeZ); m.scale.set(1 / at.coarse, 1, 1 / at.coarse); }
    }
    // tiles the view no longer asks for leave the stage, those unused the longest first
    const spare = [...held].filter(([, h]) => h.seen !== looks).sort((a, b) => a[1].seen - b[1].seen);
    for (const [key, h] of spare.slice(0, Math.max(0, spare.length - SPARE))) { drop(h); held.delete(key); }
    stage.redraw();
    return missing;
  }
  return paper;
}
