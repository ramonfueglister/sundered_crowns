// The dots of the marks on the map (WorldView.setMarks), for view.ts: buttons over the canvas, put where their point
// is drawn whenever the view moves.
import { LAND_Y, SEA_Y } from '../lookprobe/layout';
import type { Stage } from '../lookprobe/stage';
import type { Layout } from './pieces';
import { RIDER_PX } from './view_riders';
import { reliefOf } from './zoom';

/** A dot on the map (WorldView.setMarks). */
export interface WorldMark {
  lon: number;
  lat: number;
  color: string;
  title: string;
  open?(): void;
  /** the mark of a rider (view_riders.ts): no dot, only a place to point at over the horseman, at every distance */
  rider?: boolean;
}
/** the dots of the marks, in pixels across, and how far apart dots of one place are pushed */
const MARK_SIZE = 9,
  MARK_SPREAD = 7;

interface Marks {
  /** Shows these marks from now on, in place of those before (an empty list takes them away). */
  set(now: readonly WorldMark[]): void;
  /** Puts the dots where their points are drawn, in a view `wide` finest blocks across that the stage lays out so. */
  place(laid: Layout, wide: number): void;
  dispose(): void;
}

/** The marks' dots, in a layer over the canvas in `parent`; `blockOf` gives the finest block of a place in degrees. */
export function createMarks(
  parent: HTMLElement,
  stage: Stage,
  blockOf: (lon: number, lat: number) => [number, number],
): Marks {
  const markLayer = document.createElement('div');
  markLayer.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:4';
  parent.append(markLayer);
  let marks: { m: WorldMark; dot: HTMLButtonElement; x: number; z: number; k: number }[] = [];
  const looks = (m: WorldMark) =>
    m.rider
      ? `width:${RIDER_PX}px;height:${RIDER_PX}px;border:0;background:transparent;margin:${MARK_SIZE / 2 - RIDER_PX}px 0 0 ${(MARK_SIZE - RIDER_PX) / 2}px`
      : `width:${MARK_SIZE}px;height:${MARK_SIZE}px;border-radius:50%;border:1.5px solid ${m.color};background:#111;box-shadow:0 0 0 1px rgba(255,255,255,.7)`;
  return {
    set(now) {
      const seen = new Map<string, number>(),
        old = marks;
      marks = now.map((m, i) => {
        const [x, z] = blockOf(m.lon, m.lat),
          at = `${Math.round(x)},${Math.round(z)}`,
          k = seen.get(at) ?? 0;
        seen.set(at, k + 1);
        // the dots shown are used again: the marks of travelling rulers are set anew on every day of the world
        const dot = old[i]?.dot ?? document.createElement('button');
        dot.type = 'button';
        dot.className = 'world-mark';
        dot.title = m.title;
        dot.setAttribute('aria-label', m.title);
        dot.style.cssText = `position:absolute;left:0;top:0;padding:0;${looks(m)};cursor:pointer;pointer-events:auto`;
        dot.onclick = m.open ?? null;
        return { m, dot, x, z, k };
      });
      if (marks.length !== old.length) markLayer.replaceChildren(...marks.map((d) => d.dot));
    },
    place(laid, wide) {
      // (near, the figures themselves stand where the dots would be; the riders ride at every distance)
      const show = marks.some(({ m }) => laid.step > 0 || m.rider);
      markLayer.style.display = show ? '' : 'none';
      if (!show) return;
      const tall = reliefOf(wide, laid.step),
        y = LAND_Y * tall + SEA_Y * (1 - tall);
      for (const { m, dot, x, z, k } of marks) {
        const at = stage.toScreen(x / laid.coarse - laid.homeX, y, z / laid.coarse - laid.homeZ);
        if (!at || (laid.step === 0 && !m.rider)) {
          dot.style.display = 'none';
          continue;
        }
        dot.style.display = '';
        dot.style.transform = `translate(${(at[0] - MARK_SIZE / 2 + k * MARK_SPREAD).toFixed(1)}px, ${(at[1] - MARK_SIZE / 2).toFixed(1)}px)`;
      }
    },
    dispose: () => markLayer.remove(),
  };
}
