// The short card a figure shows while the pointer rests on it: who the person is in a few lines, from what the
// person system knows (GET /person/<id>, src/net/people.ts): name or sex, age, work, where and with whom the person
// lives, and the traits that stand out. A click opens the full panel (panel.ts). An HTML layer over the canvas, in
// the game's navy and gold HUD (hover.css). Main thread only.
//
// The world graphic tells where the pointer rests (the event `world-hover`, src/worldprobe/view.ts); src/figures says
// which person's figure stands there.
import { personAt } from '../figures/stage';
import { httpOf } from '../figures/people';
import type { PersonDetail } from '../net/people';
import { hoverLines } from './hover_lines';
import type { WorldHover } from '../worldprobe/view';
import './hover.css';

/** The card follows a walking figure: who stands under the pointer is looked up again this often, in milliseconds. */
const RECHECK = 350;
/** A person's data are kept this long, in milliseconds, and no more of them than this (the world moves on a day at a time). */
const KEEP_MS = 20_000, KEEP_MAX = 300;

export interface PersonHover { dispose(): void }

/** Shows the card over `host` while the pointer rests on a figure of a person. Without a world server it never shows. */
export function listenForWorldHover(host: HTMLElement = document.body, worldUrl: string | undefined = (import.meta as { env?: Record<string, string> }).env?.VITE_WORLD_URL): PersonHover {
  const card = document.createElement('div');
  card.className = 'person-hover'; card.hidden = true; card.setAttribute('role', 'tooltip');
  host.append(card);
  const known = new Map<number, { at: number; p: Promise<PersonDetail | null> }>();
  let shown = -1, last: WorldHover | null = null, timer = 0;

  const fetchPerson = (id: number) => {
    const now = performance.now(), had = known.get(id);
    if (had && now - had.at < KEEP_MS) return had.p;
    if (known.size >= KEEP_MAX) known.delete(known.keys().next().value!);
    const p = fetch(`${httpOf(worldUrl!)}/person/${id}`).then((r) => (r.ok ? (r.json() as Promise<PersonDetail>) : null), () => null);
    known.delete(id); known.set(id, { at: now, p });
    return p;
  };
  const place = (px: number, py: number) => {
    const box = host.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight;
    let x = px - box.left + 18, y = py - box.top + 18;
    if (x + w > box.width - 8) x = px - box.left - w - 14;
    if (y + h > box.height - 8) y = py - box.top - h - 14;
    card.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  };
  const hide = () => { shown = -1; card.hidden = true; clearInterval(timer); timer = 0; };
  const at = async (d: WorldHover) => {
    const id = personAt(d.x, d.y, d.z);
    if (id === null) { hide(); return; }
    if (id === shown) { place(d.px, d.py); return; }
    shown = id;
    const p = await fetchPerson(id);
    // the pointer moved on to somebody else, or off, while the person was asked for
    if (shown !== id || !last) return;
    if (!p) { hide(); return; }
    const { title, rows } = hoverLines(p), head = document.createElement('b'), table = document.createElement('table');
    head.textContent = title;
    for (const [k, v] of rows) {
      const tr = table.insertRow(), th = document.createElement('th'), td = tr.insertCell();
      th.textContent = k; td.textContent = v; tr.prepend(th);
    }
    const hint = document.createElement('small');
    hint.textContent = 'Klicken für mehr';
    card.replaceChildren(head, table, hint);
    card.hidden = false;
    place(last.px, last.py);
    // the figure walks on: who stands under the resting pointer is looked up again
    timer ||= window.setInterval(() => { if (last) void at(last); }, RECHECK);
  };
  const on = (e: Event) => {
    const d = (e as CustomEvent<WorldHover | null>).detail;
    last = d;
    if (d?.step !== 0 || !worldUrl) { hide(); return; }
    void at(d);
  };
  window.addEventListener('world-hover', on);
  return { dispose() { window.removeEventListener('world-hover', on); hide(); card.remove(); } };
}
