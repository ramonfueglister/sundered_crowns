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
import { rankOfHistory, type PortraitPerson } from '../portrait/wire';
import '../ui/fonts';
import './panel.css';
import { economyRows, householdRows, farmRows } from './economy_rows';
import { dressOf } from '../sim/people/pools';
import { status } from '../net/client';
import { createTalkBox } from './talk';

/** A portrait of a person neutral in all the portrait reads beyond the person system (portrait thread, 15 Nov 2026). */
const NEUTRAL = { stand: 1, job: 'Bauern', health: 1000, fed: 1000 } as const;
const BIG5 = ['Offenheit', 'Gewissenhaftigkeit', 'Extraversion', 'Verträglichkeit', 'Neurotizismus'] as const;
/** The portrait input of a person. */
export function portraitPerson(p: PersonDetail): PortraitPerson {
  // (portrait round 144) a person of history is dressed as people of rank are
  const rank = p.history ? rankOfHistory(p.history.crowns) : {};
  // a ruler whose birthday no source gives is drawn as a grown person of 40 (the portrait needs an age)
  return { pid: p.id, dna: p.genes, female: p.female, age: Math.floor(p.age ?? 40), origin: dressOf(p.culture), ...NEUTRAL, ...rank };
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
  const talkBox = createTalkBox(host);
  let shown = -1;
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
      const h = p.history;
      const name = h ? h.name : p.female ? 'Frau' : 'Mann';
      head.append(el('b', '', `${name}${p.alive ? '' : ' (verstorben)'}`), close);
      // a living person can be spoken to while the game is connected to its world server (server/talk, docs/TALK.md)
      const speak = el('button', 'btn speak', 'Sprechen');
      speak.onclick = () => talkBox.open(p.id, name === 'Frau' ? 'der Frau' : name === 'Mann' ? 'dem Mann' : name);
      const canSpeak = p.alive && status.value === 'open';
      if (id !== shown) talkBox.close();
      shown = id;
      const pic = el('canvas', 'portrait');
      // drawn at twice the size the panel shows it at (about 268 px wide, panel.css): scaled up from 224 px it was soft
      pic.width = 448; pic.height = 560;
      const facts = el('table', 'facts'), body = el('tbody');
      const known: [string, string][] = [['Alter', p.age === null ? 'unbekannt' : `${Math.floor(p.age)} Jahre`]];
      if (h?.house) known.push(['Haus', h.house]);
      if (h?.crowns.length) known.push([h.crowns.length > 1 ? 'Kronen' : 'Krone', h.crowns.map((c) => c.name).join(', ')]);
      for (const [k, v] of [...known, ['IQ', String(p.iq)]]) {
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
      const farm = el('div', 'section'), land = farmRows(p);
      if (land.length) {
        const table = el('table', 'facts'), tb = el('tbody');
        for (const [k, v] of land) { const tr = el('tr'); tr.append(el('th', '', k), el('td', '', v)); tb.append(tr); }
        table.append(tb);
        farm.append(el('h3', '', 'Hof'), table);
      }
      const family = el('div', 'section'), links = el('div', 'kin');
      if (p.mother >= 0) links.append(kin('Mutter', p.mother));
      if (p.father >= 0) links.append(kin('Vater', p.father));
      if (links.childElementCount) family.append(el('h3', '', 'Eltern'), links);
      const own = el('div', 'kin');
      if (p.spouse >= 0) own.append(kin(p.female ? 'Ehemann' : 'Ehefrau', p.spouse));
      for (const [k, c] of (p.children ?? []).entries()) own.append(kin(`Kind ${k + 1}`, c));
      if (own.childElementCount) family.append(el('h3', '', 'Familie'), own);
      box.replaceChildren(head, pic, ...(canSpeak ? [speak] : []), facts, ...(rows.length ? [work] : []), ...(purse.length ? [house] : []), ...(land.length ? [farm] : []), traits, ...(family.childElementCount ? [family] : []));
      box.hidden = false;
      await portrait(p, pic).catch((e) => console.warn('portrait', e));
    },
    close() { asked++; box.hidden = true; talkBox.close(); shown = -1; },
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
