// Application shell: sign in, then the map of the world with the HUD (banner, value bar, map tools) and the panel of the selected place.
import { useEffect, useState } from 'preact/hooks';
import { computed } from '@preact/signals';
import { status, refusal, me, world, realms, placeInfo, connect, disconnect, claim, abdicate, askPlace } from '../net/client';
import { online, session, profile, signInWithEmail, signOut, accessToken } from '../online/supabase';
import { MapView, selectedPlace, mapCtl } from './MapView';
import { IconDefs, IconPlaces, IconPlayers, IconCalendar, IconGear, IconCrown, IconGlobe, IconFullscreen, IconClose } from './icons';
import { t, L, lang, setLang, terrainName, resourceName, num, pct, kcalText, pounds, index } from './i18n';
import { fmtDate } from '../sim/calendar';
import type { RealmInfo } from '../net/protocol';
import { startMusic, musicKey, musicMuted, musicVolume, nowPlaying, musicWaiting, setMuted, setVolume, skip } from '../audio/music';

const realmById = computed(() => { const m = new Map<number, RealmInfo>(); for (const r of realms.value) m.set(r.id, r); return m; });
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export function App() {
  const st = status.value;
  return <div class={`app lang-${lang.value}`}>
    <IconDefs />
    {st === 'idle' || st === 'refused' ? <SignIn /> : <>
      <MapView />
      <Music />
      <TopBar />
      <RealmBanner />
      <MapTools />
      {st !== 'open' && <div class="notice">{st === 'connecting' ? t('connecting') : t('disconnected')}</div>}
      {selectedPlace.value >= 0 && <PlacePanel />}
    </>}
  </div>;
}

/** The realm the player rules (undefined: none). */
const myRealm = computed(() => { const m = me.value; return m && m.realm >= 0 ? realmById.value.get(m.realm) : undefined; });

/** Realms with a drawn coat of arms; the others show their initial. */
const ARMS: Record<string, string> = { venice: '/ui/arms/venice.svg' };

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

function MapTools() {
  const r = myRealm.value;
  const full = () => { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.(); };
  return <div class="maptools" role="toolbar" aria-label={t('map_tools')}>
    {r && <><button class="tool" title={t('to_my_realm')} aria-label={t('to_my_realm')} onClick={() => mapCtl.home(r.capital)}><IconCrown /></button><i /></>}
    <button class="tool" title={t('whole_map')} aria-label={t('whole_map')} onClick={() => mapCtl.overview()}><IconGlobe /></button><i />
    <button class="tool" title={t('fullscreen')} aria-label={t('fullscreen')} onClick={full}><IconFullscreen /></button>
  </div>;
}

function LangSwitch() {
  return <button class="btn small" onClick={() => setLang(lang.value === 'de' ? 'en' : 'de')}>{lang.value === 'de' ? 'EN' : 'DE'}</button>;
}

function SignIn() {
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [note, setNote] = useState<string | null>(null);
  // a Supabase session (after the magic link) connects at once
  useEffect(() => {
    if (!online.available || !session.value) return;
    accessToken().then((token) => { if (token) connect({ token }); });
  }, [session.value]);
  return <div class="menu">
    <div class="menu-bg" />
    <div class="menu-box">
      <h1>{t('title')}</h1>
      <p class="muted">{t('tagline')}</p>
      {refusal.value && <p class="neg">{refusal.value}</p>}
      {online.available ? <>
        {session.value
          ? <><p>{profile.value?.display_name ?? session.value.user.email}</p><button class="btn" onClick={() => signOut()}>{t('sign_out')}</button></>
          : <form onSubmit={async (e) => { e.preventDefault(); const er = await signInWithEmail(email); setNote(er ?? t('link_sent')); }}>
            <input class="field" type="email" placeholder={t('email')} value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
            <button class="btn big gold" type="submit">{t('send_link')}</button>
            {note && <p class="muted">{note}</p>}
          </form>}
      </> : <form onSubmit={(e) => { e.preventDefault(); connect({ name }); }}>
        <p class="muted">{t('dev_login')}</p>
        <input class="field" placeholder={t('display_name')} value={name} maxLength={24} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <button class="btn big gold" type="submit" disabled={name.trim().length < 3}>{t('enter')}</button>
      </form>}
      <div class="menu-foot"><LangSwitch /></div>
    </div>
  </div>;
}

function TopBar() {
  const wi = world.value, mine = myRealm.value;
  const [menu, setMenu] = useState(false);
  return <header class="hud-top">
    <div class="hud-values">
      {mine ? <>
        <span class="realm-name">{L(mine.short)}</span>
        <span class="val" title={t('places')}><IconPlaces /><span><b>{num(mine.places)}</b><small>{t('places')}</small></span></span>
      </> : <span class="hint">{t('no_realm')}</span>}
      <span class="val" title={t('players')}><IconPlayers /><span><b>{num(wi?.players ?? 0)} / {num(wi?.maxPlayers ?? 0)}</b><small>{t('players')}</small></span></span>
    </div>
    <div class="hud-date"><IconCalendar /><span>{wi ? fmtDate(wi.day, wi.startYear, lang.value) : ''}</span>{wi?.paused && <small>{t('paused')}</small>}</div>
    <button class="tb lang" title={t('language')} onClick={() => setLang(lang.value === 'de' ? 'en' : 'de')}>{lang.value === 'de' ? 'EN' : 'DE'}</button>
    <button class="tb" title={t('settings')} aria-label={t('settings')} aria-expanded={menu} onClick={() => setMenu(!menu)}><IconGear /></button>
    {menu && <div class="hud-menu" onClick={() => setMenu(false)}>
      <MusicSettings />
      {mine && <button class="menu-item danger" onClick={() => abdicate()}>{t('abdicate')}</button>}
      <button class="menu-item" onClick={() => { disconnect(); if (online.available) signOut(); }}>{t('sign_out')}</button>
      {mine && ARMS[mine.key] && <p class="credit">{t('arms_credit')} <a href="https://commons.wikimedia.org/wiki/File:Variant_war_flag_of_the_Serene_Republic_of_Venice.svg" target="_blank" rel="noreferrer">Wikimedia Commons</a>, <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">CC BY-SA 3.0</a></p>}
      <p class="credit">{t('music_credit')}</p>
    </div>}
  </header>;
}

function PlacePanel() {
  const p = selectedPlace.value;
  useEffect(() => { placeInfo.value = null; askPlace(p); }, [p]);
  const d = placeInfo.value?.id === p ? placeInfo.value : null;
  const r = d && d.owner >= 0 ? realmById.value.get(d.owner) : undefined;
  const m = me.value;
  return <aside class="side pnl">
    <div class="side-head"><b>{d ? (lang.value === 'de' ? d.nameDe : d.name) : '…'}</b><button class="close" title={t('close')} aria-label={t('close')} onClick={() => { selectedPlace.value = -1; }}><IconClose /></button></div>
    {d && <table class="facts"><tbody>
      <tr><th>{t('owner')}</th><td>{r ? <><i class="swatch" style={{ background: hex(r.color) }} />{L(r.name)}</> : t('nobody')}</td></tr>
      <tr><th>{t('population')}</th><td>{num(d.pop)}</td></tr>
      <tr><th>{t('culture')}</th><td>{L(d.culture)}</td></tr>
      <tr><th>{t('faith')}</th><td>{L(d.faith)}</td></tr>
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
        <tr><th>{t('harvest_farmers')}</th><td>{num(d.harvest.farmers)}</td></tr>
      </tbody></table>
    </div>}
    {d?.economy && <div class="section">
      <h3>{t('economy_england')}</h3>
      <p class="muted">{t('economy_note', { year: d.economy.year })}</p>
      {d.economy.halted && <p class="muted">{t('economy_halted', { why: d.economy.halted })}</p>}
      <table class="facts"><tbody>
        <tr><th>{t('economy_gdp')}</th><td>{pounds(d.economy.realGdp)}</td></tr>
        <tr><th>{t('economy_level', { base: d.economy.baseYear })}</th><td>{index(d.economy.realGdpIndex)}</td></tr>
        <tr><th>{t('economy_prices', { base: d.economy.baseYear })}</th><td>{index(d.economy.priceIndex)}</td></tr>
        <tr><th>{t('economy_consumption')}</th><td>{pounds(d.economy.consumption)}</td></tr>
        <tr><th>{t('economy_crown')}</th><td>{pounds(d.economy.crown)}</td></tr>
        <tr><th>{t('economy_investment')}</th><td>{pounds(d.economy.investment)}</td></tr>
        <tr><th>{t('economy_exports')}</th><td>{pounds(d.economy.exports)}</td></tr>
        <tr><th>{t('economy_imports')}</th><td>{pounds(d.economy.imports)}</td></tr>
        <tr><th>{t('economy_employed')}</th><td>{num(d.economy.employed)}</td></tr>
        <tr><th>{t('economy_unemployed')}</th><td>{num(d.economy.unemployed)}</td></tr>
        <tr><th>{t('economy_coin_households')}</th><td>{pounds(d.economy.coinHouseholds)}</td></tr>
        <tr><th>{t('economy_coin_firms')}</th><td>{pounds(d.economy.coinFirms)}</td></tr>
      </tbody></table>
    </div>}
    {r && <div class="section">
      <h3>{L(r.name)}</h3>
      <p>{t('places')}: {num(r.places)}</p>
      <p>{t('ruled_by')}: {r.ruler ?? <span class="muted">{t('no_player')}</span>}</p>
      {!r.ruler && m && m.realm < 0 && <button class="btn big gold" onClick={() => claim(r.id)}>{t('claim')}</button>}
    </div>}
  </aside>;
}

