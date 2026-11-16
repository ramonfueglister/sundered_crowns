// The panel a click on a figure opens: the person behind it, with the portrait drawn from their genes, sex, age and
// city (src/portrait), and what the person system knows of them (src/sim/systems/people.ts): age, IQ, the Big Five,
// mother and father, who open in the same panel. An HTML layer over the canvas, like the realm names of the world
// graphic, in the game's navy and gold HUD (panel.css, docs/ui/HUD.md). Main thread only.
//
// The world graphic gives it a click that was not a drag (openPersonAt); src/figures says which person's figure stands
// there; the world server (GET /person/<id>, src/net/people.ts) gives the person in full.
import { personAt } from '../figures/stage';
import { httpOf } from '../figures/people';
import type { PersonDetail } from '../net/people';
import type { PortraitAssets } from '../portrait/assets';
import type { PortraitPerson } from '../portrait/wire';
import '../ui/fonts';
import './panel.css';
import { economyRows, householdRows } from './economy_rows';

/** The dress of a culture in the portraits. Only England 1356 has its own so far (portrait/src/dress.rs); every other
 *  string falls back to Apoleia's Roman dress until the portrait thread draws more. */
const DRESS: Record<string, string> = { english: 'England' };
/** A portrait of a person neutral in all the portrait reads beyond the person system (portrait thread, 15 Nov 2026). */
const NEUTRAL = { stand: 1, job: 'Bauern', health: 1000, fed: 1000 } as const;
const BIG5 = ['Offenheit', 'Gewissenhaftigkeit', 'Extraversion', 'Verträglichkeit', 'Neurotizismus'] as const;
/** The portrait input of a person. */
export function portraitPerson(p: PersonDetail): PortraitPerson {
  return { pid: p.id, dna: p.genes, female: p.female, age: Math.floor(p.age), origin: DRESS[p.culture] ?? p.culture, ...NEUTRAL };
}

export interface PersonPanel {
  /** Opens the person whose figure stands nearest a point of the world (finest blocks, see personAt); false when none. */
  openAt(x: number, y: number, z: number, step: number): boolean;
  show(id: number): Promise<void>;
  close(): void;
}

/** Makes the panel over `host`. `worldUrl` is the world server (the game's VITE_WORLD_URL), `portraitBase` the address of
 *  public/portrait. Without a server the panel never opens. */
export function createPersonPanel(host: HTMLElement, worldUrl: string | undefined, portraitBase: string): PersonPanel {
  const box = el('aside', 'person-panel');
  box.hidden = true;
  host.append(box);
  let assets: Promise<PortraitAssets> | null = null, stage: Promise<import('../portrait/stage').PortraitStage> | null = null, asked = 0;

  const portrait = async (p: PersonDetail, into: HTMLCanvasElement) => {
    assets ??= import('../portrait/assets').then((m) => m.loadPortraitAssets(portraitBase));
    const a = await assets;
    stage ??= import('../portrait/stage').then((m) => new m.PortraitStage({ width: into.width, height: into.height, images: a.images, url: a.url }));
    const st = await stage;
    await st.draw(a.builder.build(portraitPerson(p)));
    into.getContext('2d')!.drawImage(st.renderer.domElement, 0, 0);
  };
  const kin = (label: string, id: number) => {
    const b = el('button', 'btn', label);
    b.onclick = () => void panel.show(id);
    return b;
  };

  const panel: PersonPanel = {
    openAt(x, y, z, step) {
      if (step !== 0 || !worldUrl) return false;
      const id = personAt(x, y, z);
      if (id === null) return false;
      void panel.show(id);
      return true;
    },
    async show(id) {
      if (!worldUrl) return;
      const me = ++asked, r = await fetch(`${httpOf(worldUrl)}/person/${id}`);
      if (!r.ok || me !== asked) return;
      const p: PersonDetail = await r.json();
      const close = el('button', 'close', '×');
      close.title = 'Schliessen'; close.setAttribute('aria-label', 'Schliessen');
      close.onclick = () => panel.close();
      const head = el('div', 'head');
      head.append(el('b', '', `${p.female ? 'Frau' : 'Mann'}${p.alive ? '' : ' (verstorben)'}`), close);
      const pic = el('canvas', 'portrait');
      pic.width = 224; pic.height = 280;
      const facts = el('table', 'facts'), body = el('tbody');
      for (const [k, v] of [['Alter', `${Math.floor(p.age)} Jahre`], ['IQ', String(p.iq)]]) {
        const tr = el('tr');
        tr.append(el('th', '', k), el('td', '', v));
        body.append(tr);
      }
      facts.append(body);
      const traits = el('div', 'section');
      traits.append(el('h3', '', 'Persönlichkeit'));
      p.big5.forEach((v, k) => {
        const row = el('div', 'trait'), bar = el('span', 'bar'), fill = el('i');
        fill.style.width = `${Math.max(0, Math.min(100, v))}%`;
        bar.append(fill);
        row.append(el('span', '', BIG5[k]), bar, el('span', '', String(v)));
        traits.append(row);
      });
      const work = el('div', 'section'), rows = economyRows(p);
      if (rows.length) {
        const table = el('table', 'facts'), tb = el('tbody');
        for (const [k, v] of rows) { const tr = el('tr'); tr.append(el('th', '', k), el('td', '', v)); tb.append(tr); }
        table.append(tb);
        work.append(el('h3', '', 'Wirtschaft'), table);
        const e = p.economy!;
        if (e.role === 'worker' && e.firmOwner >= 0) { const l = el('div', 'kin'); l.append(kin('Inhaber des Betriebs', e.firmOwner)); work.append(l); }
      }
      const house = el('div', 'section'), purse = householdRows(p);
      if (purse.length) {
        const table = el('table', 'facts'), tb = el('tbody');
        for (const [k, v] of purse) { const tr = el('tr'); tr.append(el('th', '', k), el('td', '', v)); tb.append(tr); }
        table.append(tb);
        house.append(el('h3', '', 'Haushalt'), table);
      }
      const family = el('div', 'section'), links = el('div', 'kin');
      if (p.mother >= 0) links.append(kin('Mutter', p.mother));
      if (p.father >= 0) links.append(kin('Vater', p.father));
      if (links.childElementCount) family.append(el('h3', '', 'Eltern'), links);
      box.replaceChildren(head, pic, facts, ...(rows.length ? [work] : []), ...(purse.length ? [house] : []), traits, ...(links.childElementCount ? [family] : []));
      box.hidden = false;
      await portrait(p, pic).catch((e) => console.warn('portrait', e));
    },
    close() { asked++; box.hidden = true; },
  };
  return panel;
}

/** An element with a class and a text. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Hangs the panel on the world graphic's clicks (world-probe.html loads this module; the page fires 'world-click'
 *  with { x, y, z, step } for a click that was not a drag). */
export function listenForWorldClicks(host: HTMLElement = document.body): PersonPanel {
  const env = (import.meta as { env?: Record<string, string> }).env ?? {};
  const panel = createPersonPanel(host, env.VITE_WORLD_URL, `${env.BASE_URL ?? '/'}portrait`);
  window.addEventListener('world-click', (e) => {
    const d = (e as CustomEvent<{ x: number; y: number; z: number; step: number }>).detail;
    if (!panel.openAt(d.x, d.y, d.z, d.step)) panel.close();
  });
  return panel;
}
