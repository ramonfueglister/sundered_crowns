// Settings, saves, pause menu, developer panel, online button and the end screen.
import { useEffect, useRef, useState } from 'preact/hooks';
import { sim, view, nations } from '../../game/client';
import { screen, panel, settings, saveSettings, selectedLoc, selectedNation, playerId, showToast, lastSpeed, openPanel, type Settings } from '../store';
import { listSaves, loadSave, deleteSave, saveNow, importSave, type SaveMeta } from '../saves';
import { setLang } from '../i18n';
import { rendererRef } from '../MapView';
import { timelapse, playTimelapse, abortTimelapse } from '../timelapse';
import { Panel, Section, Row, Btn, Empty, NLink, act, t, L, lang, num, pct, Coa, Tip } from './common';
import { sfx } from '../audio';
import { CHARGE_TYPES } from './coa';
import { EventArt, ART_LIST } from './art';
import { KeyBindings, AccessSettings, DisplaySettings } from './settings';
import { DevTools } from './devtools';
import { HistoryCharts, ChronicleExport, endingText, victoryName, victoryDesc } from './victory';
import { TipHead } from './explain';
import { dayToDate } from '../../sim/calendar';

// ---------------------------------------------------------------- settings
export function SettingsPanel() {
  const s = settings.value;
  const close = () => { panel.value = screen.value === 'game' ? 'pause' : 'none'; };
  const set = (p: Partial<Settings>) => saveSettings(p);
  return <Panel title={t('settings')} cls="sys-pnl" onClose={() => { panel.value = 'none'; }}>
    <Section title={t('graphics')} id="set-gfx">
      <div class="seg wide">{(['low', 'medium', 'high', 'ultra'] as const).map((q) => <button class={s.quality === q ? 'on' : ''} onClick={() => { sfx('click'); set({ quality: q }); }}>{t(`q_${q}`)}</button>)}</div>
      <div class="muted small">{t(`qhint_${s.quality}`)}</div>
      <div class="slider-row"><span class="k">{t('ui_scale')}</span><span class="slider"><input type="range" min={0.75} max={1.5} step={0.05} value={s.uiScale} onChange={(e) => set({ uiScale: Number((e.target as HTMLInputElement).value) })} /><span class="slider-v">{pct(s.uiScale)}</span></span></div>
      <DisplaySettings />
    </Section>
    <AccessSettings />
    <KeyBindings />
    <Section title={t('volume')} id="set-vol">
      <div class="slider-row"><span class="k">{t('music')}</span><span class="slider"><input type="range" min={0} max={1} step={0.05} value={s.music} onInput={(e) => set({ music: Number((e.target as HTMLInputElement).value) })} /><span class="slider-v">{pct(s.music)}</span></span></div>
      <div class="slider-row"><span class="k">{t('effects')}</span><span class="slider"><input type="range" min={0} max={1} step={0.05} value={s.sfx} onInput={(e) => set({ sfx: Number((e.target as HTMLInputElement).value) })} onChange={() => sfx('click')} /><span class="slider-v">{pct(s.sfx)}</span></span></div>
    </Section>
    <Section title={t('gameplay')} id="set-play">
      <div class="slider-row"><span class="k">{t('autosave')}</span><select value={s.autosaveMonths} onChange={(e) => set({ autosaveMonths: Number((e.target as HTMLSelectElement).value) })}>{[1, 3, 6, 12, 24].map((m) => <option value={m}>{m} {t('months')}</option>)}</select></div>
      <label class="chk"><input type="checkbox" checked={s.edgePan} onChange={(e) => set({ edgePan: (e.target as HTMLInputElement).checked })} /> {t('edge_pan')}</label>
      <label class="chk"><input type="checkbox" checked={s.pauseOnEvents} onChange={(e) => set({ pauseOnEvents: (e.target as HTMLInputElement).checked })} /> {t('pause_on_events')}</label>
    </Section>
    <Section title={t('language')} id="set-lang">
      <div class="seg wide"><button class={lang.value === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button><button class={lang.value === 'de' ? 'on' : ''} onClick={() => setLang('de')}>Deutsch</button></div>
    </Section>
    <div class="act-row"><span class="spacer" /><Btn small={false} onClick={close}>{t('done')}</Btn></div>
  </Panel>;
}

// ---------------------------------------------------------------- saves
export async function loadAndPlay(id: string) {
  const data = await loadSave(id); if (!data) { showToast(t('save_missing'), 'err'); return; }
  panel.value = 'none'; selectedLoc.value = -1; selectedNation.value = -1;
  screen.value = 'loading';
  await sim().init({ seed: 0, year: 1356, player: null, save: data, devtools: true });
  screen.value = 'game';
}

export function SavesPanel({ onLoad }: { onLoad?: (id: string) => void }) {
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const [name, setName] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const reload = () => listSaves().then(setSaves).catch(() => setSaves([]));
  useEffect(() => { reload(); }, []);
  const inGame = screen.value === 'game' && !!view.value;
  const load = (id: string) => { sfx('open'); (onLoad ?? loadAndPlay)(id); };
  const exportSave = async (m: SaveMeta) => {
    const data = await loadSave(m.id); if (!data) return;
    const blob = new Blob([data as BlobPart], { type: 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${m.label.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'save'}.scsave`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const onFile = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    const buf = new Uint8Array(await f.arrayBuffer());
    await importSave(buf, f.name); showToast(t('save_imported')); reload();
    (e.target as HTMLInputElement).value = '';
  };
  return <Panel title={t('saves')} cls="sys-pnl saves-pnl" onClose={() => { panel.value = 'none'; }}>
    {inGame && <div class="act-row save-new">
      <input class="txt" placeholder={t('save_name')} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} maxLength={60} />
      <Btn small={false} cls="gold" onClick={() => saveNow(name.trim() || undefined).then(() => { showToast(t('saved')); sfx('page'); setName(''); reload(); }).catch((x) => showToast(String(x), 'err'))}>{t('save')}</Btn>
    </div>}
    {!saves ? <Empty>{t('loading')}…</Empty> : !saves.length ? <Empty>{t('no_saves')}</Empty> : <div class="save-list">{saves.map((m) => <div class="save-row">
      <div class="sv-main"><div class="sv-label">{m.auto && <span class="tag">{t('auto')}</span>} {m.label}</div><div class="muted small">{m.date && <>{m.date} · </>}{new Date(m.real).toLocaleString(lang.value === 'de' ? 'de-DE' : 'en-GB')} · {num(m.size / 1024)} KB</div></div>
      <div class="sv-btns">
        <Btn cls="gold" onClick={() => load(m.id)}>{t('load_short')}</Btn>
        <Btn onClick={() => exportSave(m)}>{t('export')}</Btn>
        {del === m.id ? <Btn cls="danger" onClick={() => deleteSave(m.id).then(() => { setDel(null); reload(); })}>{t('confirm_delete')}</Btn> : <Btn cls="danger" onClick={() => setDel(m.id)}>{t('delete')}</Btn>}
      </div>
    </div>)}</div>}
    <div class="act-row"><input ref={file} type="file" accept=".scsave,application/octet-stream" style={{ display: 'none' }} onChange={onFile} /><Btn onClick={() => file.current?.click()}>{t('import')}…</Btn><span class="spacer" /><span class="muted small">{t('saves_hint')}</span></div>
  </Panel>;
}

// ---------------------------------------------------------------- pause
export function PausePanel() {
  useEffect(() => { const sp = view.value?.speed ?? 0; if (sp > 0) { lastSpeed.value = sp; sim().speed(0); } }, []);
  const resume = () => { panel.value = 'none'; sim().speed(lastSpeed.value || 2); sfx('click'); };
  return <div class="pause-menu" onPointerDown={(e) => e.stopPropagation()}>
    <h2>{t('paused')}</h2>
    <button class="btn big gold" onClick={resume}>{t('resume')}</button>
    <button class="btn big" onClick={() => saveNow().then(() => { showToast(t('saved')); sfx('page'); })}>{t('save')}</button>
    <button class="btn big" onClick={() => openPanel('saves')}>{t('load')}</button>
    <button class="btn big" onClick={() => openPanel('settings')}>{t('settings')}</button>
    <button class="btn big" onClick={() => { panel.value = 'none'; void playTimelapse(false); }}>{t('timelapse')}</button>
    <button class="btn big" onClick={() => { panel.value = 'none'; void playTimelapse(true); }}>{t('timelapse_video')}</button>
    <button class="btn big" onClick={() => { abortTimelapse(); panel.value = 'none'; sim().speed(0); screen.value = 'menu'; }}>{t('quit')}</button>
  </div>;
}

// ---------------------------------------------------------------- developer panel
export function DevPanel() {
  const v = view.value; const [gal, setGal] = useState<'' | 'coa' | 'art'>('');
  const dev = (action: string, payload?: any) => act({ t: 'dev', action, payload }, 'click', `dev: ${action}`);
  const loc = selectedLoc.value, nat = selectedNation.value;
  return <Panel title={t('dev_tools')} cls="dev-pnl" onClose={() => { panel.value = 'none'; }}>
    <div class="dev-grid">
      <Btn onClick={() => dev('gold', { amount: 1000 })}>+1000 {t('treasury')}</Btn>
      <Btn onClick={() => dev('manpower')}>{t('manpower')} max</Btn>
      <Btn onClick={() => dev('authority')}>+100 {t('authority')}</Btn>
      <Btn onClick={() => dev('tech')}>+1 {t('technology')}</Btn>
      <Btn disabled={loc < 0 ? 'select a location' : null} onClick={() => dev('annex', { loc })}>{t('dev_annex')} {loc >= 0 ? `#${loc}` : ''}</Btn>
      <Btn onClick={() => dev('army', { loc: loc >= 0 ? loc : undefined, men: 10000 })}>+10k {t('army')}</Btn>
      <Btn onClick={() => dev('reveal')}>{t('dev_reveal')}</Btn>
      <Btn onClick={() => dev('observer')}>{t('dev_observer')}</Btn>
      <Btn disabled={nat < 0 ? 'select a realm' : null} onClick={() => dev('switch', { nation: nat }).then((r) => { if (r.ok) sim().setPlayer(nat); })}>{t('dev_switch')} {nat >= 0 ? L(nations.value[nat]?.short) : ''}</Btn>
    </div>
    <Section title={t('speed')} id="dev-speed">
      <div class="seg wide">{[0, 1, 2, 3, 4, 5].map((x) => <button class={v?.speed === x ? 'on' : ''} onClick={() => sim().speed(x)}>{x || '⏸'}</button>)}</div>
      <Row k={t('dev_ms_day')} v={num(v?.msPerDay ?? 0, 2)} />
      <Row k={t('day')} v={v?.day ?? 0} />
      <Row k={t('armies')} v={v?.armies.length ?? 0} />
      <Row k={t('wars')} v={v?.wars.length ?? 0} />
      <Row k={t('dev_renderer')} v={rendererRef.r ? 'WebGPU' : '—'} />
    </Section>
    <DevTools />
    <Section title={t('dev_gallery')} id="dev-gal" open={false}>
      <div class="seg gal-seg"><button class={gal === 'coa' ? 'on' : ''} onClick={() => setGal(gal === 'coa' ? '' : 'coa')}>{t('heraldry')}</button><button class={gal === 'art' ? 'on' : ''} onClick={() => setGal(gal === 'art' ? '' : 'art')}>{t('illustrations')}</button></div>
      {gal === 'coa' && <><div class="coa-gallery">{nations.value.filter((n) => n.alive).map((n) => <span title={`${L(n.short)} – ${n.coa?.blazon ?? ''}`} onClick={() => { selectedNation.value = n.id; }}><Coa coa={n.coa} color={n.color} size={44} /></span>)}</div>
        <div class="coa-gallery">{CHARGE_TYPES.map((c) => <span title={c}><Coa coa={{ field: 'azure', division: 'plain', charges: [{ type: c, tincture: 'or', count: 1 }] }} color={[0, 0, 0]} size={44} /></span>)}</div></>}
      {gal === 'art' && <div class="art-gallery">{ART_LIST.map((a, i) => <div><div class="muted small">{a}</div><EventArt art={a} seed={i + 1} /></div>)}</div>}
    </Section>
  </Panel>;
}

// ---------------------------------------------------------------- online
export function OnlineButton() {
  const [open, setOpen] = useState(false);
  return <>
    <button class="btn" onClick={() => { sfx('open'); setOpen(true); }}>{t('online')}</button>
    {open && <div class="modal-wrap" onClick={() => setOpen(false)}>
      <div onClick={(e) => e.stopPropagation()}><Panel title={t('online')} cls="sys-pnl online-pnl" onClose={() => setOpen(false)}>
        <div class="online-note">{t('online_not_configured')}</div>
      </Panel></div>
    </div>}
  </>;
}

// ---------------------------------------------------------------- end screen
export function EndScreen() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { sim().query({ q: 'endstats' }).then(setD); sfx('victory'); }, []);
  const v = view.value; const pid = playerId.value; const p = v?.player;
  const tl = timelapse.value;
  const win = d?.victory ?? v?.victory;
  const endYear = v ? dayToDate(v.day, v.startYear).y : 0;
  const alive = nations.value.filter((n) => n.alive).sort((a, b) => b.score - a.score);
  const rank = alive.findIndex((n) => n.id === pid);
  const ending = win ? endingText(win, pid) : '';
  return <div class="end-screen">
    <div class="end-box wide pnl">
      <div class="pnl-head"><div class="pnl-titles"><h2>{t('end_title')}</h2><div class="pnl-sub">{v ? `${v.startYear} – ${endYear}` : ''}</div></div></div>
      <div class="pnl-body">
        {win && <Tip content={<div><TipHead name={victoryName(win.kind)} hint={victoryDesc(win.kind)} /></div>} tag="div"><div class="victory"><NLink id={win.nation} size={56} full /><div>{ending}</div></div></Tip>}
        {pid >= 0 && <div class="end-rank-line">{rank >= 0 ? t('x_end_rank').replace('{rank}', String(rank + 1)).replace('{n}', String(alive.length)) : t('x_end_fallen')}</div>}
        <Section title={t('x_hist_title')} id="end-hist"><HistoryCharts /></Section>
        <div class="end-cols">
          {p && <Section title={t('your_reign')} id="end-me">
            <div class="grid2">
              <Row k={t('battles_won')} v={p.stats.battlesWon ?? 0} /><Row k={t('battles_lost')} v={p.stats.battlesLost ?? 0} />
              <Row k={t('wars_won')} v={p.stats.warsWon ?? 0} /><Row k={t('locs_gained')} v={p.stats.locsGained ?? 0} />
              <Row k={t('locs_lost')} v={p.stats.locsLost ?? 0} /><Row k={t('treasury')} v={num(p.treasury)} />
            </div>
          </Section>}
          <Section title={t('final_ranking')} id="end-rank">
            {!d ? <Empty>{t('loading')}…</Empty> : <table class="tbl"><tbody>{d.ranking.slice(0, 10).map((r: any, i: number) => <tr class={r.id === pid ? 'me' : ''}><td class="r muted">{i + 1}</td><td><NLink id={r.id} size={18} /></td><td class="r">{num(r.score)}</td></tr>)}{(() => {
              if (d.ranking.slice(0, 10).some((r: any) => r.id === pid) || rank < 0) return null;
              return <><tr><td /><td class="muted">…</td><td /></tr><tr class="me"><td class="r muted">{rank + 1}</td><td><NLink id={pid} size={18} /></td><td class="r">{num(alive[rank].score)}</td></tr></>;
            })()}</tbody></table>}
          </Section>
        </div>
        {tl && <div class="tl-bar"><b>{tl.year}</b><span class="bar"><i class="bar-fill" style={{ width: `${(tl.i / Math.max(1, tl.n - 1)) * 100}%` }} /></span></div>}
        <div class="act-row"><Btn small={false} onClick={() => playTimelapse(false)}>{t('timelapse')}</Btn><Btn small={false} onClick={() => playTimelapse(true)}>{t('timelapse_video')}</Btn>
          <span class="muted small">{t('x_chron_export')}</span><ChronicleExport ending={ending} />
          <span class="spacer" /><Btn small={false} cls="gold" onClick={() => { abortTimelapse(); screen.value = 'menu'; }}>{t('quit')}</Btn></div>
      </div>
    </div>
  </div>;
}
