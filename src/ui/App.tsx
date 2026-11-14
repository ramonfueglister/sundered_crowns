// Application shell: sign in, then the map of the world with the top bar and the panel of the selected place.
import { useEffect, useState } from 'preact/hooks';
import { computed } from '@preact/signals';
import { status, refusal, me, world, realms, placeInfo, connect, disconnect, claim, abdicate, askPlace } from '../net/client';
import { online, session, profile, signInWithEmail, signOut, accessToken } from '../online/supabase';
import { MapView, selectedPlace } from './MapView';
import { t, L, lang, setLang, terrainName, resourceName, num, kcalText } from './i18n';
import { fmtDate } from '../sim/calendar';
import type { RealmInfo } from '../net/protocol';

const realmById = computed(() => { const m = new Map<number, RealmInfo>(); for (const r of realms.value) m.set(r.id, r); return m; });
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export function App() {
  const st = status.value;
  return <div class={`app lang-${lang.value}`}>
    {st === 'idle' || st === 'refused' ? <SignIn /> : <>
      <MapView />
      <TopBar />
      {st !== 'open' && <div class="banner">{st === 'connecting' ? t('connecting') : t('disconnected')}</div>}
      {selectedPlace.value >= 0 && <PlacePanel />}
    </>}
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
  const wi = world.value, m = me.value;
  const mine = m && m.realm >= 0 ? realmById.value.get(m.realm) : undefined;
  return <div class="topbar pnl">
    {mine ? <span class="realm"><i class="swatch" style={{ background: hex(mine.color) }} />{L(mine.short)}</span> : <span class="muted">{t('no_realm')}</span>}
    <span class="date">{wi ? fmtDate(wi.day, wi.startYear, lang.value) : ''}{wi?.paused ? ` · ${t('paused')}` : ''}</span>
    <span class="muted">{t('players')}: {wi?.players ?? 0}/{wi?.maxPlayers ?? 0}</span>
    <span class="grow" />
    {mine && <button class="btn small danger" onClick={() => abdicate()}>{t('abdicate')}</button>}
    <LangSwitch />
    <button class="btn small" onClick={() => { disconnect(); if (online.available) signOut(); }}>{t('sign_out')}</button>
  </div>;
}

function PlacePanel() {
  const p = selectedPlace.value;
  useEffect(() => { placeInfo.value = null; askPlace(p); }, [p]);
  const d = placeInfo.value?.id === p ? placeInfo.value : null;
  const r = d && d.owner >= 0 ? realmById.value.get(d.owner) : undefined;
  const m = me.value;
  return <div class="side pnl">
    <div class="side-head"><b>{d ? (lang.value === 'de' ? d.nameDe : d.name) : '…'}</b><button class="btn small" onClick={() => { selectedPlace.value = -1; }}>{t('close')}</button></div>
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
        <tr><th>{t('harvest_yield')}</th><td>{d.harvest.landYield === null ? t('no_data') : num(d.harvest.landYield)}</td></tr>
        <tr><th>{t('harvest_farmers')}</th><td>{num(d.harvest.farmers)}</td></tr>
      </tbody></table>
    </div>}
    {r && <div class="section">
      <h3>{L(r.name)}</h3>
      <p>{t('places')}: {num(r.places)}</p>
      <p>{t('ruled_by')}: {r.ruler ?? <span class="muted">{t('no_player')}</span>}</p>
      {!r.ruler && m && m.realm < 0 && <button class="btn big gold" onClick={() => claim(r.id)}>{t('claim')}</button>}
    </div>}
  </div>;
}

