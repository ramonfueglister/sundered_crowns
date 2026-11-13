// Application shell: main menu, realm selection, game screen, end screen.
import { useEffect, useState } from 'preact/hooks';
import { sim, view, nations, ready, workerError } from '../game/client';
import { screen, startYear, selectedNation, selectedLoc, selectedArmies, panel, mapMode, uiHidden, toast, settings, playerId, lastSpeed, openPanel, tutorialStep, showToast } from './store';
import { t, L, lang, setLang } from './i18n';
import { MapView, mapReady, rendererRef } from './MapView';
import { MapTip } from './MapTip';
import { timelapse, stopTimelapse } from './timelapse';
import { MenuMap, menuMapReady } from './MenuMap';
import { TopBar } from './TopBar';
import { TooltipLayer, Tip } from './Tip';
import { MAP_MODES, type MapMode } from '../game/protocol';
import * as P from './panels';
import { initAudio, setMood, setVolumes, sfx } from './audio';
import { autosaveTick, listSaves, loadSave, saveLabel } from './saves';
import { rgb, num } from './format';
import { OnlineHud } from './online/OnlineButton';
import { actionFor, keyFor, keyLabel } from './keys';
import { keyCapture } from './panels/settings';
import { VictoryChooser } from './panels/victory';
import type { VictoryKind } from '../sim/victoryRules';
import { startNotifications } from './notify';

const LORE = [
  { en: 'The Great Mortality has passed, but it will return.', de: 'Das große Sterben ist vorüber, doch es wird wiederkehren.' },
  { en: 'Kings borrow from Florentine bankers and forget to repay.', de: 'Könige leihen bei Florentiner Bankiers und vergessen das Zurückzahlen.' },
  { en: 'A fortress is only as strong as the bread in its cellars.', de: 'Eine Festung ist nur so stark wie das Brot in ihren Kellern.' },
  { en: 'Winter has defeated more armies than any general.', de: 'Der Winter hat mehr Heere besiegt als jeder Feldherr.' },
  { en: 'Tip: right-click with an army selected to march; hold Shift to select several.', de: 'Tipp: Mit gewähltem Heer rechtsklicken zum Marschieren; Shift wählt mehrere.' },
  { en: 'Tip: hover over any number to see where it comes from.', de: 'Tipp: Fahre über eine Zahl, um zu sehen, woher sie kommt.' },
];

export function App() {
  useEffect(() => {
    const unlock = () => { initAudio(); setVolumes(settings.value.music, settings.value.sfx); };
    window.addEventListener('pointerdown', unlock, { once: false });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);
  useEffect(() => { setVolumes(settings.value.music, settings.value.sfx); }, [settings.value.music, settings.value.sfx]);
  useEffect(() => {
    const v = view.value; if (!v || screen.value !== 'game') { setMood('menu', 0); return; }
    const p = v.player; const crisis = p && (p.concord < -40 || p.treasury < 0 || p.warExhaustion > 60);
    setMood(crisis ? 'crisis' : p?.atWar ? 'war' : 'peace', p?.era ?? 0);
  }, [view.value?.player?.atWar, view.value?.player?.era, screen.value]);
  useKeys();
  const s = screen.value;
  return <div class={`app lang-${lang.value}`} style={{ fontSize: `${settings.value.uiScale * 100}%` }}>
    {(s === 'select' || s === 'game' || s === 'end') && <MapView />}
    {(s === 'select' || s === 'game') && <MapTip />}
    {s === 'menu' && <MainMenu />}
    {s === 'loading' && <Loading />}
    {s === 'select' && <SelectScreen />}
    {s === 'game' && !uiHidden.value && <GameUI />}
    {s === 'game' && uiHidden.value && <div class="photo-hint">{t('photo')} — {keyLabel(keyFor('hide_ui'), lang.value === 'de')}</div>}
    {s === 'end' && <P.EndScreen />}
    {timelapse.value && s === 'game' && <div class="tl-banner pnl"><b>{timelapse.value.year}</b><span class="bar"><i class="bar-fill" style={{ width: `${(timelapse.value.i / Math.max(1, timelapse.value.n - 1)) * 100}%` }} /></span>{timelapse.value.recording && <span class="rec">● {t('timelapse_recording')}</span>}<button class="btn" onClick={stopTimelapse}>{t('timelapse_stop')}</button></div>}
    {workerError.value && <div class="fatal">{workerError.value.slice(0, 400)}</div>}
    {toast.value && <div class={`toast ${toast.value.kind}`}>{toast.value.text}</div>}
    <TooltipLayer />
  </div>;
}

function MainMenu() {
  const [saves, setSaves] = useState<any[]>([]);
  useEffect(() => { listSaves().then(setSaves).catch(() => setSaves([])); }, []);
  const start = async (year: number, observer = false) => {
    sfx('open'); startYear.value = year; screen.value = 'loading';
    const seed = (Date.now() & 0xffff) ^ year; lastStart = { seed, year };
    await sim().init({ seed, year, player: null, devtools: true });
    if (observer) { screen.value = 'game'; sim().speed(3); return; }
    screen.value = 'select';
  };
  const cont = async (id: string) => { screen.value = 'loading'; const data = await loadSave(id); if (!data) { screen.value = 'menu'; return; } await sim().init({ seed: 0, year: 1356, player: null, save: data, devtools: true }); screen.value = 'game'; };
  return <div class="menu">
    <MenuMap />
    <div class={`menu-bg ${menuMapReady.value ? 'over-map' : ''}`} />
    <div class="menu-box">
      <h1 class="title">Sundered Crowns</h1>
      <div class="subtitle">{lang.value === 'de' ? 'Europa 1356 – 1815' : 'Europe 1356 – 1815'}</div>
      {saves[0] && <button class="btn big" onClick={() => cont(saves[0].id)}>{t('continue')} <small>{saveLabel(saves[0])}</small></button>}
      <button class="btn big start" onClick={() => start(1356)}><span>{t('new_game')} · {t('start_1356')}</span><small class="sub">{t('x_start_1356_sub')}</small></button>
      <button class="btn big start" onClick={() => start(1492)}><span>{t('new_game')} · {t('start_1492')}</span><small class="sub">{t('x_start_1492_sub')}</small></button>
      <div class="menu-sec">
        <Tip content={<div><b>{t('tutorial')}</b><div class="tip-hint">{t('x_tutorial_hint')}</div></div>}><button class="btn" onClick={() => { tutorialStep.value = 0; start(1356); }}>{t('tutorial')}</button></Tip>
        <Tip content={<div><b>{t('observer')}</b><div class="tip-hint">{t('x_observer_hint')}</div></div>}><button class="btn" onClick={() => start(1356, true)}>{t('observer')}</button></Tip>
        <button class="btn" onClick={() => openPanel('saves')}>{t('load')}</button>
        <button class="btn" onClick={() => openPanel('settings')}>{t('settings')}</button>
        <P.OnlineButton />
      </div>
      <div class="lang"><button class={lang.value === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button><button class={lang.value === 'de' ? 'on' : ''} onClick={() => setLang('de')}>Deutsch</button></div>
    </div>
    {panel.value === 'settings' && <div class="modal-wrap"><P.SettingsPanel /></div>}
    {panel.value === 'saves' && <div class="modal-wrap"><P.SavesPanel onLoad={cont} /></div>}
  </div>;
}

function Loading() {
  const [i, setI] = useState(Math.floor(Math.random() * LORE.length));
  useEffect(() => { const h = setInterval(() => setI((x) => (x + 1) % LORE.length), 3500); return () => clearInterval(h); }, []);
  return <div class="loading"><div class="loading-box"><div class="spinner" /><div>{t('loading')}…</div><p class="lore">{L(LORE[i])}</p></div></div>;
}

const RECOMMENDED = ['portugal', 'scotland', 'brandenburg', 'venice', 'bavaria_upper', 'hungary', 'denmark', 'navarre'];
/** Seed and year of the world on the select screen: a different game difficulty re-creates the same world with it. */
let lastStart: { seed: number; year: number } | null = null;
/** Game difficulty as the simulation reads it (s.difficulty, systems/ai.ts): 1 easy, 2 normal (the default), 3 hard. */
const GAME_DIFF = [1, 2, 3] as const;
const DIFF_KEY: Record<number, string> = { 1: 'easy', 2: 'normal', 3: 'hard' };
function SelectScreen() {
  const ns = nations.value; const sel = ns[selectedNation.value];
  const [diff, setDiff] = useState(2);
  const [kinds, setKinds] = useState<VictoryKind[]>([]);
  const [goals, setGoals] = useState<any[] | null>(null);
  useEffect(() => { setGoals(null); if (!sel) return; let alive = true; sim().query<any[]>({ q: 'goals', nation: sel.id }).then((g) => { if (alive) setGoals(g ?? []); }).catch(() => {}); return () => { alive = false; }; }, [sel?.id]);
  const play = async () => {
    if (!sel) return;
    const id = sel.id;
    // a different difficulty or chosen victory conditions re-create the same world with them
    if ((diff !== 2 || kinds.length) && lastStart) { screen.value = 'loading'; await sim().init({ ...lastStart, player: null, devtools: true, difficulty: diff, victory: kinds }); }
    sim().setPlayer(id); sfx('bell');
    const n = nations.value[id] ?? sel;
    const cap = n.capital; const g = rendererRef.assets?.geo;
    if (cap >= 0 && rendererRef.r && g) rendererRef.r.flyTo(g.loc.x[cap], g.loc.y[cap], 3);
    screen.value = 'game';
    if (tutorialStep.value >= 0) tutorialStep.value = 0;
  };
  const rec = RECOMMENDED.map((k) => ns.find((n) => n.key === k && n.alive)).filter(Boolean) as typeof ns;
  const emp = ns.filter((n) => n.alive && (n.emperor || n.elector)).sort((a, b) => (b.emperor ? 1 : 0) - (a.emperor ? 1 : 0) || b.dev - a.dev);
  const pick = (n: (typeof ns)[number]) => { selectedNation.value = n.id; const g = rendererRef.assets?.geo; if (g && n.capital >= 0) rendererRef.r?.flyTo(g.loc.x[n.capital], g.loc.y[n.capital], 2.5); };
  const stars = sel ? Math.max(1, Math.min(5, sel.difficulty || 3)) : 3;
  const open = (goals ?? []).filter((g) => g.open).slice(0, 3);
  return <div class="select">
    <div class="select-top">{t('choose_realm')}</div>
    <div class="select-side">
      <div class="rec"><h3>{t('recommended')}</h3>{rec.map((n) => <button class={`nation-chip ${sel?.id === n.id ? 'on' : ''}`} onClick={() => pick(n)}><span class="sw" style={{ background: rgb(n.color) }} />{L(n.short)}<span class="st">{'★'.repeat(Math.max(1, Math.min(5, n.difficulty || 3)))}</span></button>)}</div>
      {/* the Empire: its emperor (the king of Bohemia in 1356) and the electors */}
      {emp.length > 0 && <div class="rec"><h3>{t('x_sel_empire')}</h3>{emp.map((n) => <button class={`nation-chip ${sel?.id === n.id ? 'on' : ''}`} title={n.emperor ? t('emperor') : t('elector')} onClick={() => pick(n)}><span class="sw" style={{ background: rgb(n.color) }} />{n.emperor ? '♛ ' : ''}{L(n.short)}<span class="st">{'★'.repeat(Math.max(1, Math.min(5, n.difficulty || 3)))}</span></button>)}</div>}
      <div class="rec"><h3>{lang.value === 'de' ? 'Großmächte' : 'Great powers'}</h3>{[...ns].filter((n) => n.alive).sort((a, b) => b.score - a.score).slice(0, 10).map((n) => <button class={`nation-chip ${sel?.id === n.id ? 'on' : ''}`} onClick={() => pick(n)}><span class="sw" style={{ background: rgb(n.color) }} />{L(n.short)}<span class="st">{'★'.repeat(Math.max(1, Math.min(5, n.difficulty || 3)))}</span></button>)}</div>
    </div>
    {sel && <div class="select-card">
      <div class="sc-head"><P.Coa coa={sel.coa} color={sel.color} size={64} /><div><h2>{L(sel.name)}</h2><div class="muted">{t('ruler')}: {P.charName(sel.ruler, false, true)}</div></div></div>
      <div class="sc-facts">
        <Tip content={<div><b>{t('development')}</b><div class="tip-hint">{t('x_nat_dev_hint')}</div></div>}><div class="row"><span>{t('development')}</span><b>{num(sel.dev)}</b></div></Tip>
        <div class="row"><span>{lang.value === 'de' ? 'Orte' : 'Locations'}</span><b>{sel.locs}</b></div>
        <Tip content={<div><b>{t('x_start_position')}</b><div class="tip-hint">{t('x_start_position_hint')}</div></div>}><div class="row"><span>{t('x_start_position')}</span><b class="stars" title={t(`x_stars_${stars}`)}>{'★'.repeat(stars)}<span class="off">{'★'.repeat(5 - stars)}</span> <small>{t(`x_stars_${stars}`)}</small></b></div></Tip>
      </div>
      <div class="sc-sec">{t('x_situation')}</div>
      <p class="summary">{L(sel.summary)}</p>
      {goals && open.length > 0 && <><div class="sc-sec">{t('x_first_goals')}</div>
        <ul class="sc-goals">{open.map((g) => <li><Tip content={<div><b>{L(g.name)}</b><div class="tip-hint">{L(g.desc)}</div></div>}><span><b>{L(g.name)}</b><span class="muted"> · {goalReq(L(g.desc))}</span></span></Tip></li>)}</ul></>}
      <div class="sc-sec">{t('x_game_difficulty')}</div>
      <div class="diff">{GAME_DIFF.map((d) => <Tip content={<div><b>{t(DIFF_KEY[d])}</b><div class="tip-hint">{t(`x_diff_${d}`)}</div></div>}><button class={diff === d ? 'on' : ''} onClick={() => setDiff(d)}>{t(DIFF_KEY[d])}</button></Tip>)}</div>
      <div class="muted small diff-note">{t(`x_diff_${diff}`)}</div>
      <div class="sc-sec">{t('x_vic_choose')}</div>
      <VictoryChooser value={kinds} onChange={setKinds} />
      <button class="btn big gold" onClick={play}>{t('play_as')} {L(sel.short)}</button>
    </div>}
    <button class="btn back" onClick={() => { screen.value = 'menu'; }}>←</button>
  </div>;
}
/** The conditions of a goal text ("… Requires: a; b. Reward: …"), shortened for the select screen. */
function goalReq(desc: string): string {
  const m = /(?:Requires|Bedingung):\s*(.*?)\.\s*(?:Reward|Belohnung)/s.exec(desc);
  return m ? m[1].replace(/;\s*/g, ', ') : '';
}

function GameUI() {
  useEffect(() => { const h = setInterval(autosaveTick, 5000); return () => clearInterval(h); }, []);
  useEffect(() => { startNotifications(); }, []);
  const v = view.value;
  useEffect(() => { if (v?.ended) screen.value = 'end'; }, [v?.ended]);
  const pid = playerId.value;
  return <>
    <TopBar />
    <OnlineHud />
    <P.Notices />
    <div class="left-col">
      {panel.value === 'none' && selectedLoc.value >= 0 && <P.LocationPanel loc={selectedLoc.value} />}
      {panel.value === 'none' && selectedLoc.value < 0 && selectedNation.value >= 0 && selectedNation.value !== pid && <P.NationPanel nation={selectedNation.value} />}
    </div>
    <P.ArmyPanel />
    {panel.value !== 'none' && <div class="panel-wrap"><P.MainPanel /></div>}
    <div class="right-col"><P.Outliner /><P.GoalTracker /></div>
    <MapModes />
    <P.EventModal />
    <P.RealmDialogs />
    <P.Tutorial />
  </>;
}

function MapModes() {
  const names: Record<MapMode, [string, string]> = {
    political: ['Political', 'Politisch'], terrain: ['Terrain', 'Gelände'], diplomatic: ['Diplomatic', 'Diplomatisch'], development: ['Development', 'Entwicklung'], population: ['Population', 'Bevölkerung'],
    culture: ['Culture', 'Kultur'], faith: ['Faith', 'Glaube'], trade: ['Trade', 'Handel'], unrest: ['Unrest', 'Unruhe'], control: ['Control', 'Kontrolle'], goods: ['Goods', 'Güter'], explored: ['Explored', 'Erkundet'],
    army_supply: ['Supply', 'Versorgung'],
    prices: ['Prices', 'Preise'], production: ['Production', 'Erzeugung'], markets: ['Markets', 'Märkte'],
  };
  return <div class="mapmodes">
    {MAP_MODES.map((m) => { const k = keyLabel(keyFor(`map_${m}`), lang.value === 'de'); return <button class={mapMode.value === m ? 'on' : ''} title={`${names[m][lang.value === 'de' ? 1 : 0]}${k ? ` (${k})` : ''}`} onClick={() => { mapMode.value = m; sfx('click'); }}>{names[m][lang.value === 'de' ? 1 : 0]}</button>; })}
    <P.Legend />
  </div>;
}

function useKeys() {
  useEffect(() => {
    // every shortcut comes from the key table (src/ui/keys.ts), which the settings let the player rebind
    let pointer: [number, number] | null = null; // where the pointer is, for the zoom keys
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || keyCapture.value) return;
      if (screen.value !== 'game') return;
      const id = actionFor(e); if (!id) return;
      const v = view.value; const sp = v?.speed ?? 0;
      if (id === 'pause' || id === 'quick_save' || id === 'dev') e.preventDefault();
      if (id === 'pause') { if (sp > 0) { lastSpeed.value = sp; sim().speed(0); } else sim().speed(lastSpeed.value || 2); }
      else if (id === 'faster') sim().speed(Math.min(5, Math.max(1, sp + 1)));
      else if (id === 'slower') sim().speed(Math.max(1, sp - 1));
      // Esc: close the panel, then drop the selection (place, the realm shown with it, armies), then the pause menu
      else if (id === 'back') {
        if (panel.value !== 'none') panel.value = 'none';
        else if (selectedLoc.value >= 0 || (selectedNation.value >= 0 && selectedNation.value !== playerId.value) || selectedArmies.value.length) { selectedLoc.value = -1; selectedNation.value = -1; selectedArmies.value = []; }
        else openPanel('pause');
      }
      else if (id === 'dev') openPanel('dev');
      else if (id === 'zoom_in' || id === 'zoom_out') {
        // the keys zoom the map only while the pointer is over the map (or, without a pointer seen yet, while no panel is
        // open); over a panel, the ledger or the chronicle, Page Up/Down page through it instead
        const over = pointer ? document.elementFromPoint(pointer[0], pointer[1]) : null;
        const onMap = over ? !!over.closest('.mapwrap') : panel.value === 'none';
        if (onMap) { e.preventDefault(); rendererRef.r?.zoomStep?.(id === 'zoom_in' ? 1.4 : 1 / 1.4); }
        else if (e.key === 'PageDown' || e.key === 'PageUp') { const sc = scrollerOf(over); if (sc) { e.preventDefault(); sc.scrollBy({ top: (e.key === 'PageDown' ? 1 : -1) * Math.max(40, sc.clientHeight * 0.9) }); } }
      }
      else if (id === 'hide_ui') uiHidden.value = !uiHidden.value;
      else if (id === 'quick_save') P.quickSave().then(() => showToast(t('saved')));
      else if (id.startsWith('map_')) { const m = id.slice(4) as MapMode; if (MAP_MODES.includes(m)) mapMode.value = m; }
      else if (id.startsWith('panel_')) openPanel(id.slice(6) as any);
    };
    const onMove = (e: PointerEvent) => { pointer = [e.clientX, e.clientY]; };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointermove', onMove); };
  }, []);
}
/** The nearest element at or above `el` that scrolls vertically (a panel's table, the chronicle), or null. */
function scrollerOf(el: Element | null): HTMLElement | null {
  for (let x = el as HTMLElement | null; x && x !== document.body; x = x.parentElement) {
    const oy = getComputedStyle(x).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && x.scrollHeight > x.clientHeight + 1) return x;
  }
  return null;
}
void ready; void mapReady;
