// Application shell: main menu, realm selection, game screen, end screen.
import { useEffect, useState } from 'preact/hooks';
import { sim, view, nations, ready, workerError } from '../game/client';
import { screen, startYear, selectedNation, selectedLoc, panel, mapMode, uiHidden, toast, settings, playerId, lastSpeed, openPanel, tutorialStep, showToast } from './store';
import { t, L, lang, setLang } from './i18n';
import { MapView, mapReady, rendererRef } from './MapView';
import { timelapse, stopTimelapse } from './timelapse';
import { MenuMap, menuMapReady } from './MenuMap';
import { TopBar } from './TopBar';
import { TooltipLayer } from './Tip';
import { MAP_MODES, type MapMode } from '../game/protocol';
import * as P from './panels';
import { initAudio, setMood, setVolumes, sfx } from './audio';
import { autosaveTick, listSaves, loadSave } from './saves';
import { rgb, num } from './format';
import { OnlineHud } from './online/OnlineButton';

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
    {s === 'menu' && <MainMenu />}
    {s === 'loading' && <Loading />}
    {s === 'select' && <SelectScreen />}
    {s === 'game' && !uiHidden.value && <GameUI />}
    {s === 'game' && uiHidden.value && <div class="photo-hint">{t('photo')} — H</div>}
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
    await sim().init({ seed: (Date.now() & 0xffff) ^ year, year, player: null, devtools: true });
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
      {saves[0] && <button class="btn big" onClick={() => cont(saves[0].id)}>{t('continue')} <small>{saves[0].label}</small></button>}
      <button class="btn big" onClick={() => start(1356)}>{t('new_game')} — {t('start_1356')}</button>
      <button class="btn big" onClick={() => start(1492)}>{t('new_game')} — {t('start_1492')}</button>
      <button class="btn" onClick={() => { tutorialStep.value = 0; start(1356); }}>{t('tutorial')}</button>
      <button class="btn" onClick={() => start(1356, true)}>{t('observer')}</button>
      <button class="btn" onClick={() => openPanel('saves')}>{t('load')}</button>
      <button class="btn" onClick={() => openPanel('settings')}>{t('settings')}</button>
      <P.OnlineButton />
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
function SelectScreen() {
  const ns = nations.value; const sel = ns[selectedNation.value];
  const [diff, setDiff] = useState(1);
  const play = async () => {
    if (!sel) return;
    sim().setPlayer(sel.id); sfx('bell');
    const cap = sel.capital; const g = rendererRef.assets?.geo;
    if (cap >= 0 && rendererRef.r && g) rendererRef.r.flyTo(g.loc.x[cap], g.loc.y[cap], 3);
    screen.value = 'game';
    if (tutorialStep.value >= 0) tutorialStep.value = 0;
    void diff;
  };
  const rec = RECOMMENDED.map((k) => ns.find((n) => n.key === k && n.alive)).filter(Boolean) as typeof ns;
  return <div class="select">
    <div class="select-top">{t('choose_realm')}</div>
    <div class="select-side">
      <div class="rec"><h3>{t('recommended')}</h3>{rec.map((n) => <button class="nation-chip" onClick={() => { selectedNation.value = n.id; const g = rendererRef.assets?.geo; if (g && n.capital >= 0) rendererRef.r?.flyTo(g.loc.x[n.capital], g.loc.y[n.capital], 2.5); }}><span class="sw" style={{ background: rgb(n.color) }} />{L(n.short)}</button>)}</div>
      <div class="rec"><h3>{lang.value === 'de' ? 'Großmächte' : 'Great powers'}</h3>{[...ns].filter((n) => n.alive).sort((a, b) => b.score - a.score).slice(0, 10).map((n) => <button class="nation-chip" onClick={() => { selectedNation.value = n.id; }}><span class="sw" style={{ background: rgb(n.color) }} />{L(n.short)}</button>)}</div>
    </div>
    {sel && <div class="select-card">
      <P.Coa coa={sel.coa} color={sel.color} size={72} />
      <h2>{L(sel.name)}</h2>
      <div class="muted">{t('ruler')}: {sel.ruler}</div>
      <div class="row"><span>{t('development')}</span><b>{num(sel.dev)}</b></div>
      <div class="row"><span>{lang.value === 'de' ? 'Orte' : 'Locations'}</span><b>{sel.locs}</b></div>
      <div class="row"><span>{t('difficulty')}</span><b>{'★'.repeat(Math.max(1, Math.min(5, sel.difficulty || 3)))}</b></div>
      <p class="summary">{L(sel.summary)}</p>
      <div class="diff">{['easy', 'normal', 'hard', 'very_hard'].map((d, k) => <button class={diff === k ? 'on' : ''} onClick={() => setDiff(k)}>{t(d)}</button>)}</div>
      <button class="btn big gold" onClick={play}>{t('play_as')} {L(sel.short)}</button>
    </div>}
    <button class="btn back" onClick={() => { screen.value = 'menu'; }}>←</button>
  </div>;
}

function GameUI() {
  useEffect(() => { const h = setInterval(autosaveTick, 5000); return () => clearInterval(h); }, []);
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
    <P.Outliner />
    <MapModes />
    <P.EventModal />
    <P.Tutorial />
  </>;
}

function MapModes() {
  const names: Record<MapMode, [string, string]> = {
    political: ['Political', 'Politisch'], terrain: ['Terrain', 'Gelände'], diplomatic: ['Diplomatic', 'Diplomatisch'], development: ['Development', 'Entwicklung'], population: ['Population', 'Bevölkerung'],
    culture: ['Culture', 'Kultur'], faith: ['Faith', 'Glaube'], trade: ['Trade', 'Handel'], unrest: ['Unrest', 'Unruhe'], control: ['Control', 'Kontrolle'], goods: ['Goods', 'Güter'], explored: ['Explored', 'Erkundet'],
  };
  return <div class="mapmodes">
    {MAP_MODES.map((m, k) => <button class={mapMode.value === m ? 'on' : ''} title={`${names[m][lang.value === 'de' ? 1 : 0]} (${k < 9 ? k + 1 : k === 9 ? 0 : '-'})`} onClick={() => { mapMode.value = m; sfx('click'); }}>{names[m][lang.value === 'de' ? 1 : 0]}</button>)}
    <P.Legend />
  </div>;
}

function useKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (screen.value !== 'game') return;
      const v = view.value; const sp = v?.speed ?? 0;
      if (e.code === 'Space') { e.preventDefault(); if (sp > 0) { lastSpeed.value = sp; sim().speed(0); } else sim().speed(lastSpeed.value || 2); }
      else if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') sim().speed(Math.min(5, Math.max(1, sp + 1)));
      else if (e.key === '-' || e.code === 'NumpadSubtract') sim().speed(Math.max(1, sp - 1));
      else if (e.key === 'Escape') { if (panel.value !== 'none') panel.value = 'none'; else if (selectedLoc.value >= 0) selectedLoc.value = -1; else openPanel('pause'); }
      else if (e.key === 'F2') { e.preventDefault(); openPanel('dev'); }
      else if (e.key === 'h' || e.key === 'H') uiHidden.value = !uiHidden.value;
      else if (e.key === 'F5') { e.preventDefault(); P.quickSave().then(() => showToast(t('saved'))); }
      else if (/^[0-9]$/.test(e.key) && !e.ctrlKey) { const k = e.key === '0' ? 9 : Number(e.key) - 1; if (MAP_MODES[k]) mapMode.value = MAP_MODES[k]; }
      else if (e.key === 'e' && !e.ctrlKey) openPanel('economy');
      else if (e.key === 'g') openPanel('government');
      else if (e.key === 'd' && e.shiftKey) openPanel('diplomacy');
      else if (e.key === 'm' && !e.ctrlKey) openPanel('military');
      else if (e.key === 'k') openPanel('knowledge');
      else if (e.key === 'l') openPanel('ledger');
      else if (e.key === 'c') openPanel('chronicle');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
void ready; void mapReady;
