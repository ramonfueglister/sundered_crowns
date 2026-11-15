// The names of the realms, written across their lands on the 2D map (realms.ts) as in a printed atlas: in a book serif
// (Crimson Pro, the HUD's type), dark ink, each along the curve through its realm that paint.ts finds, spread to fill
// it and as large as the realm's breadth allows. Shown as far as the realms colour the map.
//
// `layoutNames` is pure (no page): the game and the map's still (tools/map/still.ts) lay the names out the same way.
import type { RealmName } from './paint';

/** a name fills this share of its curve; letters are about this wide for their height (Crimson Pro, mixed case) */
const FILL = 0.84, ASPECT = 0.5;
/** names smaller than this many pixels are left out; none is written larger than this share of the picture's height */
const SMALLEST = 9, LARGEST = 0.11;
/** letters stand no further apart than this many times their height */
const SPREAD_MOST = 0.9;
/** two names keep this share of their summed heights apart (between points along them) */
const CLEAR = 0.5;

export interface LaidName { realm: number; name: string; /** SVG path of the curve in pixels of the picture, west to east */ d: string; size: number; /** length the name is spread over, in pixels */ length: number }

/**
 * The names over a picture `w` × `h` pixels whose middle shows the map pixel (x, y), with `scale` pixels to a map pixel
 * across and `squash` times that down the picture. Names that would be too small, or lie outside, are left out.
 */
export function layoutNames(names: readonly (RealmName & { name: string })[], w: number, h: number, x: number, y: number, scale: number, squash: number): LaidName[] {
  const laid: (LaidName & { pts: [number, number][] })[] = [], at = ([px, py]: readonly [number, number]): [number, number] => [w / 2 + (px - x) * scale, h / 2 + (py - y) * scale * squash];
  for (const n of names) {
    if (!n.name) continue;
    const a = at(n.from), c = at(n.bend), b = at(n.to);
    // the curve's length, from a few points along it
    let length = 0, prev = a;
    const pts: [number, number][] = [a];
    for (let k = 1; k <= 8; k++) {
      const t = k / 8, p: [number, number] = [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
      length += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p; pts.push(p);
    }
    const letters = [...n.name].length, span = length * FILL;
    // as tall as the realm is broad there, as the curve is long for the letters, and not too large for the picture
    let size = Math.min(n.size * scale, span / (letters * ASPECT), LARGEST * h);
    // a short name in a long realm is spread out, but no further than the spread allows: then the span shrinks
    const spread = Math.min(span, letters * size * (ASPECT + SPREAD_MOST));
    if (size < SMALLEST) continue;
    const lo = Math.min(a[0], b[0], c[0]) - size, hi = Math.max(a[0], b[0], c[0]) + size, top = Math.min(a[1], b[1], c[1]) - size, bottom = Math.max(a[1], b[1], c[1]) + size;
    if (hi < 0 || lo > w || bottom < 0 || top > h) continue;
    size = Math.round(size * 10) / 10;
    const f = (v: number) => v.toFixed(1);
    // the part of the curve the letters cover (they are spread from its middle)
    const cover = spread / length, used = pts.filter((_, k) => Math.abs(k / 8 - 0.5) <= cover / 2 + 0.07);
    laid.push({ realm: n.realm, name: n.name, d: `M${f(a[0])} ${f(a[1])}Q${f(c[0])} ${f(c[1])} ${f(b[0])} ${f(b[1])}`, size, length: Math.round(spread), pts: used });
  }
  // the larger names first; a name that would run into one already written is left out, as on a printed map
  laid.sort((p, q) => q.size - p.size);
  const kept: (LaidName & { pts: [number, number][] })[] = [];
  for (const n of laid) {
    const clash = kept.some((k) => n.pts.some((p) => k.pts.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < (n.size + k.size) * CLEAR)));
    if (!clash) kept.push(n);
  }
  return kept.map(({ pts: _, ...n }) => n);
}

/** how the names look: ink of the atlas (dark sepia), set in the HUD's serif */
export const NAME_STYLE = { font: "'Crimson Pro','Palatino Linotype',Palatino,serif", weight: 600, ink: '#2a241c', opacity: 0.82, halo: 'rgba(235,225,205,0.28)' } as const;

/** One name as SVG: its curve and its letters spread along it from the middle. */
export function nameSvg(n: LaidName, id: string): string {
  const esc = n.name.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<defs><path id="${id}" d="${n.d}"/></defs><text font-size="${n.size}" textLength="${n.length}" lengthAdjust="spacing"><textPath href="#${id}" startOffset="50%" text-anchor="middle" dominant-baseline="central">${esc}</textPath></text>`;
}

export interface Names {
  /** Lays the names over a picture `box` whose middle shows the map pixel (x, y), with `scale` pixels to a map pixel across and `squash` times that down the picture. */
  show(names: readonly (RealmName & { name: string })[], box: DOMRect, x: number, y: number, scale: number, squash: number, strength: number): void;
  /** Takes the names off the page. */
  remove(): void;
}

/** The names are written into `into`, over all of it that the picture's box covers. */
export function createNames(into: HTMLElement = document.body): Names {
  const SVG = 'http://www.w3.org/2000/svg', layer = document.createElementNS(SVG, 'svg');
  layer.setAttribute('style', `position:fixed;overflow:hidden;pointer-events:none;font-family:${NAME_STYLE.font};font-weight:${NAME_STYLE.weight};fill:${NAME_STYLE.ink};paint-order:stroke;stroke:${NAME_STYLE.halo};stroke-width:2px`);
  into.append(layer);
  let last = '';
  return {
    remove() { layer.remove(); },
    show(names, box, x, y, scale, squash, strength) {
      layer.style.display = strength > 0 ? '' : 'none';
      if (strength <= 0) return;
      layer.style.left = `${box.left}px`; layer.style.top = `${box.top}px`; layer.style.width = `${box.width}px`; layer.style.height = `${box.height}px`; layer.style.opacity = String(strength * NAME_STYLE.opacity);
      const svg = layoutNames(names, box.width, box.height, x, y, scale, squash).map((n) => nameSvg(n, `realm-name-${n.realm}`)).join('');
      // the names are laid out anew only when the view has changed them
      if (svg !== last) { layer.innerHTML = svg; last = svg; }
    },
  };
}
