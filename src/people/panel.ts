// The panel a click on a figure opens: the person behind it, with the portrait drawn from their genes, sex, age and
// city (src/portrait), and what the person system knows of them (src/sim/systems/people.ts): age, IQ, the Big Five,
// mother and father, who open in the same panel. An HTML layer over the canvas, like the realm names of the world
// graphic. Main thread only.
//
// The world graphic gives it a click that was not a drag (openPersonAt); src/figures says which person's figure stands
// there; the world server (GET /person/<id>, src/net/people.ts) gives the person in full.
import { personAt } from '../figures/stage';
import { httpOf } from '../figures/people';
import type { PersonDetail } from '../net/people';
import type { PortraitAssets } from '../portrait/assets';
import type { PortraitPerson } from '../portrait/wire';

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
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;right:16px;top:16px;width:240px;padding:12px;background:rgba(244,236,218,.96);color:#2b2118;'
    + 'font:13px/1.4 Georgia,serif;border:1px solid #8a6a3a;border-radius:4px;box-shadow:0 2px 12px rgba(0,0,0,.35);display:none;z-index:20';
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
  const link = (label: string, id: number) => {
    const b = document.createElement('button');
    b.textContent = label; b.style.cssText = 'font:inherit;color:#5a2d16;background:none;border:0;padding:0;text-decoration:underline;cursor:pointer';
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
      box.replaceChildren();
      const close = document.createElement('button');
      close.textContent = '×'; close.title = 'Schliessen';
      close.style.cssText = 'position:absolute;right:8px;top:4px;font:18px Georgia,serif;background:none;border:0;cursor:pointer;color:#2b2118';
      close.onclick = () => panel.close();
      const pic = document.createElement('canvas');
      pic.width = 224; pic.height = 280; pic.style.cssText = 'width:224px;height:280px;display:block;background:#d9cbb0;margin-bottom:8px';
      const head = document.createElement('div');
      head.style.fontWeight = 'bold';
      head.textContent = `${p.female ? 'Frau' : 'Mann'}, ${Math.floor(p.age)} Jahre${p.alive ? '' : ' (verstorben)'}`;
      const facts = document.createElement('div');
      facts.textContent = `IQ ${p.iq}`;
      const traits = document.createElement('div');
      traits.style.cssText = 'margin:6px 0;font-size:12px';
      p.big5.forEach((v, k) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px';
        row.innerHTML = `<span style="width:118px">${BIG5[k]}</span><span style="flex:1;height:6px;background:#e6dac0"><span style="display:block;height:6px;width:${Math.max(0, Math.min(100, v))}%;background:#8a6a3a"></span></span><span style="width:20px;text-align:right">${v}</span>`;
        traits.append(row);
      });
      const kin = document.createElement('div');
      kin.style.cssText = 'display:flex;gap:12px';
      if (p.mother >= 0) kin.append(link('Mutter', p.mother));
      if (p.father >= 0) kin.append(link('Vater', p.father));
      box.append(close, pic, head, facts, traits, kin);
      box.style.display = 'block';
      await portrait(p, pic).catch((e) => console.warn('portrait', e));
    },
    close() { asked++; box.style.display = 'none'; },
  };
  return panel;
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
