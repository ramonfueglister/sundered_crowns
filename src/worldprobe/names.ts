// The names of the realms, written across their lands on the 2D map (realms.ts) as in a printed atlas: in a Garamond
// (EB Garamond, the face nearest to the EU5 reference's; bundled through view.ts), dark ink without a halo, each along the curve through its realm that paint.ts finds, spread to fill
// it and as large as the realm's breadth allows. Shown as far as the realms colour the map.
//
// `layoutNames` is pure (no page): the game and the map's still (tools/map/still.ts) lay the names out the same way.
import type { RealmName } from './paint';

/** a name fills this share of its curve; letters are about this wide for their height (Crimson Pro, mixed case) */
const FILL = 0.84, ASPECT = 0.46;
/** names smaller than this many pixels are left out; none is written larger than this share of the picture's height */
const SMALLEST = 11, LARGEST = 0.11;
/** letters stand no further apart than this many times their height */
const SPREAD_MOST = 0.9;
/** on the page the letters are never drawn flatter than this share of their height, however low the camera looks: flatter they could not be read */
const LIE_LEAST = 0.3;
/** two names keep this share of their summed heights apart (between points along them) */
const CLEAR = 0.5;

export interface LaidName { realm: number; name: string; /** SVG path of the curve in pixels of the picture, west to east */ d: string; size: number; /** length the name is spread over, in pixels */ length: number }

/**
 * The names over a picture `w` × `h` pixels whose middle shows the map pixel (x, y), with `scale` pixels to a map pixel
 * across and `squash` times that down the picture. Names that would be too small (below `smallest` pixels), or lie
 * outside, are left out.
 */
export function layoutNames(names: readonly (RealmName & { name: string })[], w: number, h: number, x: number, y: number, scale: number, squash: number, smallest = SMALLEST): LaidName[] {
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
    if (size < smallest) continue;
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

/**
 * how the names look, as measured on the EU5 reference (karte/referenz-eu5): EB Garamond medium, ink 53,46,28; a breath
 * of pale halo keeps them readable over the woods of the diorama (on the printed map it is the paper's own colour)
 */
/**
 * The halo is a stroke round every letter, which a browser draws anew, letter by letter, whenever the names move:
 * with it a picture of the moving map took more than twice as long (36 ms against under 17 for ninety names at two
 * device pixels to one). So the names move without it, and it comes back this many ms after the view has come to rest.
 */
const HALO_AFTER = 200;
export const NAME_STYLE = { font: "'EB Garamond',Garamond,'Palatino Linotype',serif", weight: 500, ink: '#352e1c', opacity: 1, halo: 'rgba(255,248,232,0.45)' } as const;

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
  layer.setAttribute('style', `position:fixed;overflow:hidden;pointer-events:none;font-family:${NAME_STYLE.font};font-weight:${NAME_STYLE.weight};fill:${NAME_STYLE.ink};stroke:${NAME_STYLE.halo};stroke-width:0.1em;stroke-linejoin:round;paint-order:stroke fill`);
  into.append(layer);
  let last = '', rest: ReturnType<typeof setTimeout> | undefined;
  return {
    remove() { clearTimeout(rest); layer.remove(); },
    show(names, box, x, y, scale, squash, strength) {
      layer.style.display = strength > 0 ? '' : 'none';
      if (strength <= 0) return;
      layer.style.left = `${box.left}px`; layer.style.top = `${box.top}px`; layer.style.width = `${box.width}px`; layer.style.height = `${box.height}px`; layer.style.opacity = String(strength * NAME_STYLE.opacity);
      // the names lie on the land: they are laid out on the ground as seen from straight above, and the whole of it
      // is drawn as flat as the slanted camera sees the ground, letters and all (the lens is long, so the ground is
      // squashed evenly down the picture)
      const lie = Math.max(LIE_LEAST, Math.min(1, squash)), tall = box.height / lie;
      const laid = layoutNames(names, box.width, tall, x, y, scale, squash / lie, SMALLEST / lie).map((n) => nameSvg(n, `realm-name-${n.realm}`)).join('');
      const svg = `<g transform="translate(0 ${(box.height / 2).toFixed(1)}) scale(1 ${lie.toFixed(4)}) translate(0 ${(-tall / 2).toFixed(1)})">${laid}</g>`;
      // the names are laid out anew only when the view has changed them
      if (svg !== last) {
        layer.innerHTML = svg; last = svg;
        layer.style.stroke = 'none'; clearTimeout(rest);
        rest = setTimeout(() => { layer.style.stroke = NAME_STYLE.halo; }, HALO_AFTER);
      }
    },
  };
}
