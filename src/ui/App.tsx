// Application shell: the world (WorldView) with the HUD (banner, value bar, map tools) and the panel of the selected place.
// For now everyone only watches the world (Ramon, 15 November 2026: "im moment nur zuschauer möglichkeit"): the game opens at
// once as an observer and offers no sign-in. The server still knows players (src/online, server/auth.ts) for later.
import { useEffect, useState } from 'preact/hooks';
import { computed } from '@preact/signals';
import { status, refusal, me, world, realms, placeInfo, connect, disconnect, claim, abdicate, askPlace } from '../net/client';
import { MapView, selectedPlace, mapCtl } from './MapView';
import { WorldView } from './WorldView';
import { IconDefs, IconPlaces, IconCalendar, IconGear, IconPolitical, IconTerrain, IconClose, IconReplay } from './icons';
import { replay, startReplay, stopReplay } from './replay';
import { type TextKey, t, L, lang, setLang, terrainName, resourceName, num, heads, pct, kcalText, pounds, index } from './i18n';
import { fmtDate } from '../sim/calendar';
import type { RealmInfo } from '../net/protocol';
import { MAP_MODES, mapMode, mapModeKey, setMapMode } from './mapmode';
import { startMusic, musicKey, musicMuted, musicVolume, nowPlaying, musicWaiting, setMuted, setVolume, skip } from '../audio/music';

const realmById = computed(() => { const m = new Map<number, RealmInfo>(); for (const r of realms.value) m.set(r.id, r); return m; });
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
/** the address option ?map=2d shows the earlier flat map in place of the world (kept until the world has all it showed) */
const FLAT_MAP = new URLSearchParams(location.search).get('map') === '2d';


export function App() {
  const st = status.value;
  // watch at once, as an observer
  useEffect(() => { connect({}); return () => disconnect(); }, []);
  return <div class={`app lang-${lang.value}`}>
    <IconDefs />
    {st === 'refused' ? <Refused /> : <>
      {FLAT_MAP ? <MapView /> : <WorldView />}
      <Music />
      <TopBar />
      <RealmBanner />
      {st !== 'open' && <div class="notice">{st === 'connecting' ? t('connecting') : t('disconnected')}</div>}
      {selectedPlace.value >= 0 && <PlacePanel />}
    </>}
  </div>;
}

/** The realm the player rules (undefined: none). */
const myRealm = computed(() => { const m = me.value; return m && m.realm >= 0 ? realmById.value.get(m.realm) : undefined; });

/** Realms with a drawn coat of arms; the others show their initial. */
const ARMS: Record<string, string> = { venice: '/ui/arms/venice.svg' };

/** A share in percent: one decimal below 1 %, else whole. */
const share = (n: number, of: number) => { const p = 100 * n / Math.max(1, of); return (p < 1 ? p.toFixed(1) : Math.round(p).toString()).replace('.', lang.value === 'de' ? ',' : '.'); };

function RealmBanner() {
  const r = myRealm.value;
  if (!r) return null;
  const arms = ARMS[r.key];
  return <button class="realm-banner" title={L(r.name)} aria-label={L(r.name)} onClick={() => mapCtl.home(r.capital)}>
    <svg width="145" height="104" viewBox="0 0 150 104" preserveAspectRatio="none" aria-hidden="true">
      <path d="M5 0h141v80c-14-6-28 4-46 0s-30-8-48-2-34 6-47 2z" fill="#1450a0" stroke="#e8c35a" stroke-width="3.5" />
      <path d="M5 0h141v80c-14-6-28 4-46 0s-30-8-48-2-34 6-47 2z" fill="url(#flagshade)" />
      <path d="M7 2h137v10c-18 7-38-5-68 1S30 17 7 11z" fill="#0a2e60" opacity=".6" />
      <path d="M0 82l20 3-5 6 5 6-20-3z" fill="#c99a32" stroke="#8a6a1c" stroke-width=".8" />
      <rect x="0" y="0" width="6" height="100" fill="#d4a93f" /><path d="M0 100h6l-3 4z" fill="#d4a93f" />
    </svg>
    {arms ? <img class="arms" src={arms} alt="" /> : <span class="initial">{L(r.short).slice(0, 1)}</span>}
  </button>;
}

/** Starts the background music with the game view and listens for M (on/off) and N (next piece). */
function Music() {
  useEffect(() => {
    startMusic();
    const key = (e: KeyboardEvent) => { if (musicKey(e)) e.preventDefault(); };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);
  return null;
}

/** Music settings in the settings menu: on/off, volume, the piece now playing and the next one. */
function MusicSettings() {
  const off = musicMuted.value;
  return <div class="music-set" onClick={(e) => e.stopPropagation()}>
    <div class="music-row">
      <span class="music-label">{t('music')}</span>
      <button class="btn small" aria-pressed={!off} title={`${t(off ? 'music_on' : 'music_off')} (M)`} onClick={() => setMuted(!off)}>{t(off ? 'music_on' : 'music_off')}</button>
    </div>
    <input class="music-vol" type="range" min={0} max={100} step={1} value={musicVolume.value} aria-label={t('music_volume')} title={`${t('music_volume')}: ${musicVolume.value}`}
      onInput={(e) => setVolume(Number((e.target as HTMLInputElement).value))} />
    <div class="music-row">
      <small class="music-now">{off ? t('music_is_off') : musicWaiting.value ? t('music_waiting') : nowPlaying.value ?? '…'}</small>
      {!off && <button class="btn small" title={`${t('music_next')} (N)`} aria-label={t('music_next')} onClick={() => skip()}>»</button>}
    </div>
  </div>;
}

const MODE_ICON = { political: IconPolitical, terrain: IconTerrain } as const;

/** The map modes in the top bar (Ramon, 16 November 2026: "die umschaltmöglichkeiten der karte kommen dafür nach oben"): the one shown is lit in gold; keys 1 and 2. */
function MapModes() {
  const now = mapMode.value;
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (mapModeKey(e)) e.preventDefault(); };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);
  return <div class="mapmodes" role="radiogroup" aria-label={t('map_modes')}>
    {MAP_MODES.map(({ mode, key }) => {
      const Icon = MODE_ICON[mode], name = t(`map_mode_${mode}` as TextKey);
      return <button key={mode} class="tool mode" role="radio" aria-checked={now === mode} aria-label={name}
        title={`${name} (${t('key')} ${key})\n${t(`map_mode_${mode}_hint` as TextKey)}`} onClick={() => setMapMode(mode)}><Icon /></button>;
    })}
  </div>;
}

function LangSwitch() {
  return <button class="btn small" onClick={() => setLang(lang.value === 'de' ? 'en' : 'de')}>{lang.value === 'de' ? 'EN' : 'DE'}</button>;
}

/** What the server said when it turned the game away (an old client after an update, too many connections). */
function Refused() {
  return <div class="menu">
    <div class="menu-bg" />
    <div class="menu-box">
      <h1>{t('title')}</h1>
      <p class="muted">{t('tagline')}</p>
      {refusal.value && <p class="neg">{refusal.value}</p>}
      <button class="btn big gold" onClick={() => location.reload()}>{t('reload')}</button>
      <div class="menu-foot"><LangSwitch /></div>
    </div>
  </div>;
}

function TopBar() {
  const wi = world.value, mine = myRealm.value;
  const [menu, setMenu] = useState(false);
  // no texts in the bar but the date (Ramon, 16 November 2026): the map modes, the date and the settings
  return <header class="hud-top">
    <div class={`hud-values${mine ? ' ruled' : ''}`}>
      <MapModes />
      <button class={`tool mode${replay.value ? ' on' : ''}`} aria-pressed={!!replay.value} aria-label={t(replay.value ? 'replay_stop' : 'replay')}
        title={replay.value ? t('replay_stop') : `${t('replay')}\n${t('replay_hint')}`}
        onClick={() => { if (replay.value) stopReplay(); else startReplay(world.value?.startYear ?? 1291).catch((e) => { console.error(e); stopReplay(); }); }}><IconReplay /></button>
      {mine && <span class="val" title={`${L(mine.name)}: ${num(mine.places)} ${t('places')}`}><IconPlaces /><b>{num(mine.places)}</b></span>}
    </div>
    <div class="hud-date"><IconCalendar /><span>{replay.value ? String(replay.value.year) : wi ? fmtDate(wi.day, wi.startYear, lang.value) : ''}</span>{replay.value ? <small>{t('replay')}</small> : wi?.paused && <small>{t('paused')}</small>}</div>
    <button class="tb" title={t('settings')} aria-label={t('settings')} aria-expanded={menu} onClick={() => setMenu(!menu)}><IconGear /></button>
    {menu && <div class="hud-menu" onClick={() => setMenu(false)}>
      <MusicSettings />
      <div class="music-row lang-row" onClick={(e) => e.stopPropagation()}><span class="music-label">{t('language')}</span><LangSwitch /></div>
      {mine && <button class="menu-item danger" onClick={() => abdicate()}>{t('abdicate')}</button>}
      {mine && ARMS[mine.key] && <p class="credit">{t('arms_credit')} <a href="https://commons.wikimedia.org/wiki/File:Variant_war_flag_of_the_Serene_Republic_of_Venice.svg" target="_blank" rel="noreferrer">Wikimedia Commons</a>, <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">CC BY-SA 3.0</a></p>}
    </div>}
  </header>;
}

function PlacePanel() {
  const p = selectedPlace.value;
  useEffect(() => { placeInfo.value = null; askPlace(p); }, [p]);
  const d = placeInfo.value?.id === p ? placeInfo.value : null;
  const wi = world.value, day = wi?.day;
  // the economy of a city computes every day: an open panel that shows it asks again on each new day
  useEffect(() => { if (placeInfo.value?.id === p && placeInfo.value.cityEconomy) askPlace(p); }, [day]);
  const r = d && d.owner >= 0 ? realmById.value.get(d.owner) : undefined;
  const m = me.value;
  return <aside class="side pnl">
    <div class="side-head"><b>{d ? (lang.value === 'de' ? d.nameDe : d.name) : '…'}</b><button class="close" title={t('close')} aria-label={t('close')} onClick={() => { selectedPlace.value = -1; }}><IconClose /></button></div>
    {d && <table class="facts"><tbody>
      <tr><th>{t('owner')}</th><td>{r ? <><i class="swatch" style={{ background: hex(r.color) }} />{L(r.name)}</> : t('nobody')}</td></tr>
      <tr><th>{t('population')}</th><td>{heads(d.pop)}</td></tr>
      {d.peoples && d.peoples.length > 1
        ? <tr><th>{t('culture')}</th><td>{d.peoples.map((x) => `${L(x.culture)}, ${L(x.faith)} ${share(x.persons, d.pop)} %`).join(' · ')}</td></tr>
        : <><tr><th>{t('culture')}</th><td>{L(d.culture)}</td></tr><tr><th>{t('faith')}</th><td>{L(d.faith)}</td></tr></>}
      <tr><th>{t('terrain')}</th><td>{terrainName(d.terrain)}</td></tr>
      <tr><th>{t('resource')}</th><td>{resourceName(d.resource)}</td></tr>
    </tbody></table>}
    {d?.harvest && <div class="section">
      <h3>{t('harvest')}</h3>
      <table class="facts"><tbody>
        <tr><th>{t('harvest_year')}</th><td>{kcalText(d.harvest.kcal)}</td></tr>
        <tr><th>{t('harvest_head')}</th><td>{num(d.harvest.perHeadDay)} kcal</td></tr>
        <tr><th>{t('harvest_land')}</th><td>{num(d.harvest.hectares)} ha</td></tr>
        {d.harvest.arable
          ? <>
            <tr><th>{t('arable')}</th><td>{num(d.harvest.arable.hectares)} ha ({pct(d.harvest.arable.share)})</td></tr>
            <tr><th>{t('arable_state')}</th><td>{t(d.harvest.arable.hectares <= 0 ? 'arable_none' : d.harvest.arable.atLimit ? 'arable_limit' : 'arable_free')}</td></tr>
            <tr><th>{t('arable_yield')}</th><td>{d.harvest.arable.landYield === null ? '–' : num(d.harvest.arable.landYield)}</td></tr>
          </>
          : <tr><th>{t('harvest_yield')}</th><td>{d.harvest.landYield === null ? t('no_data') : num(d.harvest.landYield)}</td></tr>}
        <tr><th>{t('harvest_farmers')}</th><td>{heads(d.harvest.farmers)}</td></tr>
      </tbody></table>
    </div>}
    {d?.cityEconomy && wi && <div class="section">
      <h3>{t('economy_city')}</h3>
      <p class="muted">{t('economy_note_city', { date: fmtDate(d.cityEconomy.day, wi.startYear, lang.value) })}</p>
      {d.cityEconomy.halted && <p class="muted">{t('economy_halted', { why: d.cityEconomy.halted })}</p>}
      <table class="facts"><tbody>
        <tr><th>{t('economy_gdp')}</th><td>{pounds(d.cityEconomy.realGdp)}</td></tr>
        <tr><th>{t('economy_level')}</th><td>{index(d.cityEconomy.realGdpIndex)}</td></tr>
        <tr><th>{t('economy_prices_today')}</th><td>{index(d.cityEconomy.priceToday)}</td></tr>
        <tr><th>{t('economy_consumption')}</th><td>{pounds(d.cityEconomy.consumption)}</td></tr>
        <tr><th>{t('economy_crown')}</th><td>{pounds(d.cityEconomy.crown)}</td></tr>
        <tr><th>{t('economy_investment')}</th><td>{pounds(d.cityEconomy.investment)}</td></tr>
        <tr><th>{t('economy_exports')}</th><td>{pounds(d.cityEconomy.exports)}</td></tr>
        <tr><th>{t('economy_imports')}</th><td>{pounds(d.cityEconomy.imports)}</td></tr>
        <tr><th>{t('economy_employed')}</th><td>{num(d.cityEconomy.employed)}</td></tr>
        <tr><th>{t('economy_unemployed')}</th><td>{num(d.cityEconomy.unemployed)}</td></tr>
        <tr><th>{t('economy_coin_households')}</th><td>{pounds(d.cityEconomy.coinHouseholds)}</td></tr>
        <tr><th>{t('economy_coin_firms')}</th><td>{pounds(d.cityEconomy.coinFirms)}</td></tr>
      </tbody></table>
    </div>}
    {r && <div class="section">
      <h3>{L(r.name)}</h3>
      <p>{t('places')}: {num(r.places)}</p>
      <p>{t('ruled_by')}: {r.ruler ?? <span class="muted">{t('no_player')}</span>}</p>
      {!r.ruler && m && m.realm < 0 && !m.observer && <button class="btn big gold" onClick={() => claim(r.id)}>{t('claim')}</button>}
    </div>}
  </aside>;
}

