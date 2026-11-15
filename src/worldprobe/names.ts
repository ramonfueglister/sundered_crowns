// The names of the realms, written across their lands on the 2D map (realms.ts): letters over the picture, spaced out along
// each realm's length as on an old map, shown as far as the realms colour the map.
import type { RealmName } from './paint';

/** a name spans this share of its realm's length and is at most this tall, as a share of the realm's breadth */
const SPAN = 0.62, TALL = 0.34;
/** names smaller than this many pixels are left out; none is written larger than that */
const SMALLEST = 10, LARGEST = 54;
/** a name leans with its realm, but no steeper than this (radians) */
const LEAN_MOST = 0.8;

export interface Names {
  /** Lays the names over a picture `box` whose middle shows the map pixel (x, y), with `scale` pixels to a map pixel across and `squash` times that down the picture. */
  show(names: readonly (RealmName & { name: string })[], box: DOMRect, x: number, y: number, scale: number, squash: number, strength: number): void;
}

export function createNames(): Names {
  const layer = document.createElement('div'), spans = new Map<number, HTMLSpanElement>();
  layer.style.cssText = "position:fixed;overflow:hidden;pointer-events:none;font-family:'Crimson Pro','Palatino Linotype',Palatino,Georgia,serif;font-weight:600;text-transform:uppercase;color:#2a1c10;text-shadow:0 0 3px #fff8e6cc,0 0 1px #fff8e6";
  document.body.append(layer);
  return {
    show(names, box, x, y, scale, squash, strength) {
      layer.style.display = strength > 0 ? '' : 'none';
      if (strength <= 0) return;
      layer.style.left = `${box.left}px`; layer.style.top = `${box.top}px`; layer.style.width = `${box.width}px`; layer.style.height = `${box.height}px`; layer.style.opacity = String(strength);
      for (const n of names) {
        let span = spans.get(n.realm);
        if (!span) { span = document.createElement('span'); span.textContent = n.name; span.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;line-height:1;transform-origin:0 0'; layer.append(span); spans.set(n.realm, span); }
        // the letters are spread over the name's span: each takes about 0.62 of its height, the rest is space between them
        const long = n.long * scale * SPAN, letters = n.name.length, size = Math.min(LARGEST, n.broad * scale * TALL, long / letters / 0.62), gap = Math.min(size * 1.5, long / letters - size * 0.62);
        const px = box.width / 2 + (n.x - x) * scale, py = box.height / 2 + (n.y - y) * scale * squash;
        const seen = size >= SMALLEST && px > -long && py > -long && px < box.width + long && py < box.height + long;
        span.style.display = seen ? '' : 'none';
        if (!seen) continue;
        const lean = Math.max(-LEAN_MOST, Math.min(LEAN_MOST, n.turn > Math.PI / 2 ? n.turn - Math.PI : n.turn < -Math.PI / 2 ? n.turn + Math.PI : n.turn));
        span.style.fontSize = `${size}px`; span.style.letterSpacing = `${gap}px`;
        // the last letter's spacing hangs over the end: the name is centred without it
        span.style.transform = `translate(${px}px,${py}px) rotate(${lean}rad) translate(calc(-50% + ${gap / 2}px),-50%)`;
      }
    },
  };
}
