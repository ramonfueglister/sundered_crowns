// Online panel: account, worlds (status, join, enter), standing orders, messages and offers, leaderboard,
// achievements, admin tools, cloud saves. Works (and explains itself) when online features are not configured.
import { useEffect, useMemo, useState } from 'preact/hooks';
import * as gameClient from '../../game/client';
import { nations, view } from '../../game/client';
import { online, session, profile, isAdmin, signInWithEmail, signInWithOAuth, signOut, setDisplayName, accessToken, listWorlds, seasonLeaderboard, myAchievements, type WorldRow, type LeaderboardRow } from '../../online/supabase';
import {
  onlineClient, currentOnlineClient, connState, onlineError, me, worldInfo, seat, freeNations, chat, offers, roster, earned, leaderboard, DEFAULT_WORLD_URL, type OnlineClient,
} from '../../online/worldClient';
import { ACHIEVEMENTS } from '../../online/achievements';
import { OFFER_ACTIONS, type OfferAction, type FreeNation } from '../../online/protocol';
import type { StandingOrders } from '../../sim/types';
import { screen, selectedNation, showToast } from '../store';
import { L, lang } from '../i18n';
import { rgb, num } from '../format';
import { fmtDate } from '../../sim/calendar';
import { Coa } from '../panels';
import { rendererRef } from '../MapView';
import { WorldClock } from './WorldClock';
import { CloudSavesPanel } from './CloudSavesPanel';
import { tt, fmtDuration } from './strings';
import './online.css';

import { onlineOpen, onlineTab, openOnline, type OnlineTab } from './state';
export { onlineOpen, onlineTab, openOnline, type OnlineTab };

/** Switches the game's client (sim()) to the online world. Needs `setClient` in src/game/client.ts. */
function useClient(c: OnlineClient | null): boolean {
  const set = (gameClient as any).setClient as ((c: any) => void) | undefined;
  if (typeof set !== 'function') return false;
  set(c); return true;
}
export async function enterWorld(oc: OnlineClient) {
  if (!useClient(oc)) { showToast(tt('wiring_missing'), 'err'); return; }
  await oc.init();
  const s = seat.value; if (s) selectedNation.value = s.nation;
  screen.value = 'game'; onlineOpen.value = false;
  setTimeout(() => {
    const n = s ? nations.value[s.nation] : null; const g = rendererRef.assets?.geo;
    if (n && n.capital >= 0 && rendererRef.r && g) rendererRef.r.flyTo(g.loc.x[n.capital], g.loc.y[n.capital], 3);
  }, 400);
}
export function leaveWorld() {
  currentOnlineClient()?.disconnect();
  useClient(null);
  screen.value = 'menu';
}

export function OnlinePanel() {
  const connected = connState.value === 'open' || connState.value === 'reconnecting';
  const inGame = screen.value === 'game' && connected;
  const tabs: OnlineTab[] = ['world', ...(connected && seat.value ? ['orders', 'messages'] as OnlineTab[] : []), 'leaderboard', 'achievements', ...(!inGame ? ['saves'] as OnlineTab[] : []), 'account', ...(connected && me.value?.admin ? ['admin'] as OnlineTab[] : [])];
  const tab = tabs.includes(onlineTab.value) ? onlineTab.value : 'world';
  return <div class="parch sc-online" role="dialog" aria-label={tt('online_world')}>
    <div class="sc-online-head">
      <h2>{tt('online_world')}</h2>
      <WorldClock compact />
      <button class="btn small" onClick={() => (onlineOpen.value = false)} aria-label={tt('close')}>✕</button>
    </div>
    {!online.available && <div class="sc-note">{tt('not_configured')}</div>}
    {onlineError.value && <div class="sc-note err">{onlineError.value}</div>}
    <div class="sc-tabs">{tabs.map((k) => <button class={k === tab ? 'on' : ''} onClick={() => (onlineTab.value = k)}>{tt(k === 'saves' ? 'cloud_saves' : k)}</button>)}</div>
    <div class="sc-online-body">
      {tab === 'account' && <AccountTab />}
      {tab === 'world' && <WorldTab />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'messages' && <MessagesTab />}
      {tab === 'leaderboard' && <LeaderboardTab />}
      {tab === 'achievements' && <AchievementsTab />}
      {tab === 'saves' && <CloudSavesPanel />}
      {tab === 'admin' && <AdminTab />}
    </div>
  </div>;
}

// ------------------------------------------------------------------ account
function AccountTab() {
  const [email, setEmail] = useState(''); const [msg, setMsg] = useState<string | null>(null); const [name, setName] = useState(profile.value?.display_name ?? '');
  useEffect(() => { setName(profile.value?.display_name ?? ''); }, [profile.value?.display_name]);
  if (!online.available) return <p class="muted">{tt('dev_hint')}</p>;
  if (!session.value) return <form class="sc-form" onSubmit={async (e) => { e.preventDefault(); const r = await signInWithEmail(email); setMsg(r ?? tt('link_sent')); }}>
    <label>{tt('email')}<input type="email" required value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} autocomplete="email" /></label>
    <button class="btn gold" type="submit">{tt('send_link')}</button>
    {online.oauth.length > 0 && <div class="sc-oauth"><span class="muted">{tt('or_with')}</span>{online.oauth.map((p) => <button type="button" class="btn small" onClick={async () => { const r = await signInWithOAuth(p); if (r) setMsg(r); }}>{p[0].toUpperCase() + p.slice(1)}</button>)}</div>}
    {msg && <p class="sc-note">{msg}</p>}
  </form>;
  return <div class="sc-form">
    <p>{tt('signed_in_as')} <b>{profile.value?.display_name ?? session.value.user.email}</b>{isAdmin.value ? ' · admin' : ''}</p>
    <label>{tt('display_name')}<input value={name} maxLength={24} onInput={(e) => setName((e.target as HTMLInputElement).value)} /></label>
    <button class="btn" onClick={async () => { const r = await setDisplayName(name); setMsg(r ?? tt('name_saved')); }}>{tt('save_name')}</button>
    <button class="btn danger" onClick={() => { leaveWorld(); signOut(); }}>{tt('sign_out')}</button>
    {msg && <p class="sc-note">{msg}</p>}
  </div>;
}

// ------------------------------------------------------------------ worlds
function WorldTab() {
  const st = connState.value;
  if (st === 'open' || st === 'reconnecting') return <ConnectedWorld />;
  return <WorldList />;
}
function WorldList() {
  const [worlds, setWorlds] = useState<WorldRow[]>([]); const [name, setName] = useState(() => { try { return localStorage.getItem('sc.devname') || ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false);
  useEffect(() => { listWorlds().then(setWorlds).catch(() => setWorlds([])); }, []);
  const connect = async (url: string, devName?: string) => {
    setBusy(true); onlineError.value = null;
    try {
      const oc = onlineClient(url);
      if (devName) { try { localStorage.setItem('sc.devname', devName); } catch { /* ignore */ } await oc.connect({ name: devName }); }
      else await oc.connect({ getToken: accessToken });
    } catch (e: any) { onlineError.value = String(e?.message ?? e); }
    setBusy(false);
  };
  const st = connState.value;
  return <div>
    {online.available && <>
      {!session.value && <p class="sc-note">{tt('sign_in_first')} <button class="btn small" onClick={() => (onlineTab.value = 'account')}>{tt('account')}</button></p>}
      {worlds.length === 0 && <p class="muted">{tt('no_worlds')}</p>}
      <table class="sc-table">
        <tbody>{worlds.map((w) => <tr>
          <td><b>{w.name}</b><div class="muted">{tt('season')} {w.season} · {w.status}</div></td>
          <td>{fmtDate(w.game_day, w.start_year, lang.value)}</td>
          <td>{w.players}/{w.max_players} {tt('players')}</td>
          <td>{w.speed_seconds_per_day}{tt('per_day')}</td>
          <td>{w.ends_at ? `${tt('season_ends')} ${new Date(w.ends_at).toLocaleDateString(lang.value === 'de' ? 'de-DE' : 'en-GB')}` : ''}</td>
          <td><button class="btn small gold" disabled={!session.value || busy} onClick={() => connect(w.server_url || online.worldUrl)}>{tt('connect')}</button></td>
        </tr>)}</tbody>
      </table>
      {worlds.length === 0 && <button class="btn gold" disabled={!session.value || busy} onClick={() => connect(online.worldUrl)}>{tt('connect')} · {online.worldUrl}</button>}
    </>}
    {!online.available && <div class="sc-dev">
      <h3>{tt('dev_world')}</h3>
      <p class="muted">{tt('dev_hint')}</p>
      <form class="sc-form row" onSubmit={(e) => { e.preventDefault(); connect(DEFAULT_WORLD_URL, name.trim()); }}>
        <input placeholder={tt('display_name')} value={name} minLength={3} maxLength={24} required onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <button class="btn gold" disabled={busy} type="submit">{tt('connect')}</button>
        <span class="muted">{tt('world_server')}: {DEFAULT_WORLD_URL}</span>
      </form>
    </div>}
    {(busy || st === 'connecting') && <p class="muted">{tt('connecting')}</p>}
  </div>;
}

let autoEnter = false; // set when the player picks a realm: enter the map as soon as the seat is confirmed
function ConnectedWorld() {
  const w = worldInfo.value!; const s = seat.value; const oc = currentOnlineClient();
  const inGame = screen.value === 'game';
  useEffect(() => { if (s && oc && autoEnter && !inGame) { autoEnter = false; enterWorld(oc); } }, [s?.nation]);
  return <div>
    {connState.value === 'reconnecting' && <p class="sc-note err">{tt('reconnecting')}</p>}
    <div class="sc-world-stats">
      <div><b>{w.name}</b> · {tt('season')} {w.season}</div>
      <div>{fmtDate(view.value?.day ?? w.day, w.startYear, lang.value)} · {w.secondsPerDay}{tt('per_day')}</div>
      <div>{w.players}/{w.maxPlayers} {tt('players')} · {w.online} {tt('online_now')}</div>
      <div>{tt('season_ends')}: {fmtDate(w.seasonEndDay, w.startYear, lang.value)} (≈ {fmtDuration(w.projectedEnd - Date.now())})</div>
    </div>
    {s ? <div class="sc-seat">
      <h3>{tt('your_realm')}: {L(nations.value[s.nation]?.short)}</h3>
      {s.protectedUntil > (view.value?.day ?? w.day) && <p class="muted">{tt('protected_until')} {fmtDate(s.protectedUntil, w.startYear, lang.value)}</p>}
      {!inGame && <button class="btn big gold" onClick={() => oc && enterWorld(oc)}>{tt('enter_world')}</button>}
      <button class="btn danger small" onClick={() => { if (confirm(tt('abdicate') + '?')) oc?.leave(); }}>{tt('abdicate')}</button>
    </div> : <FreeNationPicker oc={oc} />}
    <div class="sc-row-end"><button class="btn small" onClick={leaveWorld}>{tt('disconnect')}</button></div>
  </div>;
}

function FreeNationPicker({ oc }: { oc: OnlineClient | null }) {
  const [q, setQ] = useState(''); const [sel, setSel] = useState<FreeNation | null>(null);
  useEffect(() => { oc?.requestFree(); }, []);
  const list = useMemo(() => { const k = q.trim().toLowerCase(); return freeNations.value.filter((n) => !k || L(n.name).toLowerCase().includes(k) || n.key.includes(k)).slice(0, 200); }, [q, freeNations.value, lang.value]);
  return <div class="sc-free">
    <h3>{tt('choose_free')} ({freeNations.value.length})</h3>
    <input placeholder={tt('search')} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
    <div class="sc-free-grid">
      <ul class="sc-free-list">{list.map((n) => <li class={sel?.id === n.id ? 'on' : ''} onClick={() => setSel(n)}>
        <Coa coa={n.coa} color={n.color} size={22} /><span class="sw" style={{ background: rgb(n.color) }} /><span>{L(n.short)}</span><small class="muted">{n.locs} · {num(n.dev)}</small>
      </li>)}</ul>
      {sel && <div class="sc-free-card">
        <Coa coa={sel.coa} color={sel.color} size={56} />
        <h3>{L(sel.name)}</h3>
        <div class="muted">{sel.rank} · {sel.locs} {lang.value === 'de' ? 'Orte' : 'locations'} · {num(sel.dev)} dev · {'★'.repeat(Math.max(1, Math.min(5, sel.difficulty || 3)))}</div>
        <button class="btn gold" onClick={() => { autoEnter = true; oc?.join(sel.id); }}>{tt('join')}</button>
      </div>}
    </div>
  </div>;
}

// ------------------------------------------------------------------ standing orders
const ORDER_KEYS: (keyof StandingOrders)[] = ['defendOnly', 'balanceBudget', 'autoBuild', 'autoRecruit'];
function OrdersTab() {
  const s = seat.value; const oc = currentOnlineClient();
  const [o, setO] = useState<StandingOrders | null>(s?.orders ?? null); const [state, setState] = useState<string | null>(null);
  useEffect(() => { if (s) setO(s.orders); }, [s?.nation]);
  if (!s || !o || !oc) return null;
  const save = async () => {
    setState(tt('queued'));
    const r = await oc.cmd({ t: 'orders', n: s.nation, orders: o });
    setState(r.ok ? tt('saved') : r.err ?? 'error');
    if (r.ok) seat.value = { ...s, orders: o };
  };
  return <div class="sc-form">
    <p class="muted">{tt('orders_hint')}</p>
    {ORDER_KEYS.map((k) => <label class="sc-check"><input type="checkbox" checked={!!o[k]} onChange={(e) => setO({ ...o, [k]: (e.target as HTMLInputElement).checked })} />{tt(k)}</label>)}
    <label>{tt('acceptPeaceBelow')}: <b>{o.acceptPeaceBelow}</b>
      <input type="range" min={0} max={100} step={5} value={o.acceptPeaceBelow} onInput={(e) => setO({ ...o, acceptPeaceBelow: Number((e.target as HTMLInputElement).value) })} /></label>
    <button class="btn gold" onClick={save}>{tt('save_orders')}</button>
    {state && <span class="muted"> {state}</span>}
  </div>;
}

// ------------------------------------------------------------------ messages & offers
function MessagesTab() {
  const oc = currentOnlineClient(); const s = seat.value; const [text, setText] = useState(''); const [to, setTo] = useState<number | null>(null);
  const [action, setAction] = useState<OfferAction>('alliance'); const [target, setTarget] = useState<number>(-1);
  const others = roster.value.filter((r) => r.nation !== s?.nation);
  const day = view.value?.day ?? 0; const w = worldInfo.value;
  const inc = offers.value.filter((x) => x.to === s?.nation), out = offers.value.filter((x) => x.from === s?.nation);
  const name = (n: number) => L(nations.value[n]?.short) || '?';
  const msgs = chat.value.filter((m) => to === null ? m.to === null : (m.to === to || (m.to === s?.nation && m.fromNation === to)));
  return <div class="sc-msgs">
    <div class="sc-chat">
      <div class="sc-chat-to">{tt('to')}: <select value={to === null ? '' : String(to)} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; setTo(v === '' ? null : Number(v)); }}>
        <option value="">{tt('chat_world')}</option>{others.map((r) => <option value={r.nation}>{r.name} ({name(r.nation)}){r.online ? ' ●' : ''}</option>)}
      </select></div>
      <div class="sc-chat-log">{msgs.slice(-80).map((m) => <div class={`sc-chat-line ${m.system ? 'sys' : ''}`}>
        <span class="muted">{w ? fmtDate(m.day, w.startYear, lang.value) : ''}</span> <b>{m.system ? tt('herald') : m.fromName}</b>{m.fromNation >= 0 ? <span class="muted"> ({name(m.fromNation)})</span> : null}: {m.text}
      </div>)}</div>
      <form class="sc-form row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { oc?.say(text, to ?? undefined); setText(''); } }}>
        <input value={text} maxLength={500} onInput={(e) => setText((e.target as HTMLInputElement).value)} /><button class="btn small" type="submit">{tt('say')}</button>
      </form>
    </div>
    <div class="sc-offers">
      <h3>{tt('offers')}</h3>
      <h4>{tt('incoming')}</h4>
      {inc.length === 0 && <p class="muted">—</p>}
      {inc.map((x) => <div class="sc-offer"><b>{name(x.from)}</b>: {tt(x.action)}{x.text ? ` – “${x.text}”` : ''} <span class="muted">({tt('expires')} {w ? fmtDuration((x.expires - day) * w.secondsPerDay * 1000) : ''})</span>
        <button class="btn small gold" onClick={() => oc?.answerOffer(x.id, true)}>{tt('accept')}</button><button class="btn small" onClick={() => oc?.answerOffer(x.id, false)}>{tt('decline')}</button></div>)}
      <h4>{tt('outgoing')}</h4>
      {out.length === 0 && <p class="muted">—</p>}
      {out.map((x) => <div class="sc-offer">→ <b>{name(x.to)}</b>: {tt(x.action)} <span class="muted">({tt('expires')} {w ? fmtDuration((x.expires - day) * w.secondsPerDay * 1000) : ''})</span></div>)}
      <h4>{tt('make_offer')}</h4>
      {others.length === 0 ? <p class="muted">{tt('no_players')}</p> : <div class="sc-form row">
        <select value={target} onChange={(e) => setTarget(Number((e.target as HTMLSelectElement).value))}><option value={-1}>—</option>{others.map((r) => <option value={r.nation}>{name(r.nation)} ({r.name})</option>)}</select>
        <select value={action} onChange={(e) => setAction((e.target as HTMLSelectElement).value as OfferAction)}>{OFFER_ACTIONS.map((a) => <option value={a}>{tt(a)}</option>)}</select>
        <button class="btn small gold" disabled={target < 0} onClick={() => oc?.offer(target, action)}>{tt('send')}</button>
      </div>}
    </div>
  </div>;
}

// ------------------------------------------------------------------ leaderboard
function LeaderboardTab() {
  const oc = currentOnlineClient(); const w = worldInfo.value; const [past, setPast] = useState<LeaderboardRow[]>([]);
  useEffect(() => { oc?.requestLeaderboard(); const id = w?.id; if (id) seasonLeaderboard(id).then(setPast).catch(() => setPast([])); }, [w?.id]);
  const lb = leaderboard.value;
  const seasons = [...new Set(past.map((r) => r.season))];
  return <div>
    {lb && <><h3>{lb.final ? `${tt('season')} ${lb.season}` : tt('live')}</h3>
      <table class="sc-table"><thead><tr><th>{tt('rank')}</th><th>{tt('realm')}</th><th>{tt('player')}</th><th>{tt('score')}</th></tr></thead>
        <tbody>{lb.rows.slice(0, 30).map((r) => <tr class={r.player ? 'player' : ''}><td>{r.rank}</td><td><span class="sw" style={{ background: rgb(nations.value[r.nation]?.color ?? [128, 128, 128]) }} /> {L(r.name)}</td><td>{r.player ?? '—'}</td><td>{num(r.score)}</td></tr>)}</tbody></table></>}
    {!lb && !oc && past.length === 0 && <p class="muted">—</p>}
    {seasons.length > 0 && <h3>{tt('past')}</h3>}
    {seasons.map((se) => <details><summary>{tt('season')} {se}</summary><table class="sc-table"><tbody>{past.filter((r) => r.season === se).slice(0, 20).map((r) => <tr><td>{r.rank}</td><td>{r.nation_key}</td><td>{r.display_name ?? '—'}</td><td>{num(Number(r.score))}</td></tr>)}</tbody></table></details>)}
  </div>;
}

// ------------------------------------------------------------------ achievements
function AchievementsTab() {
  const [cloud, setCloud] = useState<{ key: string; earned_at: string }[]>([]);
  useEffect(() => { myAchievements().then(setCloud).catch(() => setCloud([])); }, [session.value?.user.id]);
  const have = new Map<string, string>();
  for (const c of cloud) have.set(c.key, new Date(c.earned_at).toLocaleDateString(lang.value === 'de' ? 'de-DE' : 'en-GB'));
  const w = worldInfo.value;
  for (const e of earned.value) if (!have.has(e.key)) have.set(e.key, w ? `${tt('season')} ${e.season}, ${fmtDate(e.day, w.startYear, lang.value)}` : tt('earned'));
  return <div>
    <p class="muted">{tt('cosmetic')} · {have.size}/{ACHIEVEMENTS.length}</p>
    <ul class="sc-ach">{ACHIEVEMENTS.map((a) => <li class={have.has(a.key) ? 'on' : ''}>
      <span class="sc-ach-ic">{a.icon}</span><div><b>{L(a.name)}</b><div class="muted">{L(a.desc)}</div></div><small>{have.get(a.key) ?? tt('locked')}</small>
    </li>)}</ul>
  </div>;
}

// ------------------------------------------------------------------ admin
function AdminTab() {
  const oc = currentOnlineClient(); const w = worldInfo.value; const [spd, setSpd] = useState(String(w?.secondsPerDay ?? 36)); const [text, setText] = useState('');
  if (!oc || !w) return null;
  return <div class="sc-form">
    <div class="row">{w.paused ? <button class="btn gold" onClick={() => oc.admin('resume')}>{tt('resume')}</button> : <button class="btn" onClick={() => oc.admin('pause')}>{tt('pause')}</button>}
      <button class="btn" onClick={() => oc.admin('snapshot')}>{tt('snapshot')}</button></div>
    <label>{tt('set_speed')}<input type="number" min={0.05} step={1} value={spd} onInput={(e) => setSpd((e.target as HTMLInputElement).value)} /><button class="btn small" onClick={() => oc.admin('speed', { secondsPerDay: Number(spd) })}>OK</button></label>
    <label>{tt('broadcast')}<input value={text} maxLength={500} onInput={(e) => setText((e.target as HTMLInputElement).value)} /><button class="btn small" onClick={() => { oc.admin('broadcast', { text }); setText(''); }}>{tt('send')}</button></label>
    <table class="sc-table"><tbody>{roster.value.map((r) => <tr><td>{r.name}{r.online ? ' ●' : ''}</td><td>{L(nations.value[r.nation]?.short)}</td>
      <td><button class="btn small" onClick={() => oc.admin('kick', { nation: r.nation })}>{tt('kick')}</button> <button class="btn small danger" onClick={() => oc.admin('release', { nation: r.nation })}>{tt('release')}</button></td></tr>)}</tbody></table>
    {seat.value && <button class="btn small" onClick={() => oc.admin('dev', { cmd: { t: 'dev', n: seat.value!.nation, action: 'gold', payload: { amount: 1000 } } })}>{tt('dev_gold')}</button>}
  </div>;
}
