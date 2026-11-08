// Selected armies (bottom) and the outliner (right column).
import { useEffect, useRef, useState } from 'preact/hooks';
import { sim, view, nations } from '../../game/client';
import { selectedArmies, playerId, hoverLoc, openPanel, panel } from '../store';
import { Panel, Section, Bar, NLink, Btn, LocName, act, t, L, num, signed, pct, Tip, useRealm, selectArmy, flyToLoc, daysText, locName, namesVersion, selectLoc } from './common';
import { sfx } from '../audio';

export function ArmyPanel() {
  const ids = selectedArmies.value; const v = view.value; const pid = playerId.value;
  const armies = (v?.armies ?? []).filter((a) => ids.includes(a.id) && a.owner === pid);
  const [path, setPath] = useState<{ to: number; days: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const timer = useRef<any>(null);
  const first = armies[0];
  const hov = hoverLoc.value;
  useEffect(() => {
    clearTimeout(timer.current);
    if (!first || hov < 0 || hov === first.loc) { setPath(null); return; }
    timer.current = setTimeout(() => { sim().query<any>({ q: 'path', army: first.id, to: hov }).then((r) => setPath(r ? { to: hov, days: r.days } : { to: hov, days: -1 })); }, 160);
    return () => clearTimeout(timer.current);
  }, [first?.id, hov]);
  useEffect(() => setConfirm(false), [ids.join(',')]);
  if (!armies.length) return null;
  const men = armies.reduce((p, a) => p + a.men, 0);
  const fleet = armies.every((a) => a.fleet);
  const sameLoc = armies.every((a) => a.loc === armies[0].loc && a.fleet === armies[0].fleet);
  const myFleets = (v?.armies ?? []).filter((a) => a.owner === pid && a.fleet && !armies.includes(a));
  void namesVersion.value;
  const close = () => { selectedArmies.value = []; };
  const all = (f: (id: number) => Promise<any>) => Promise.all(armies.map((a) => f(a.id)));
  return <div class="army-wrap"><Panel cls="army-pnl" onClose={close}
    title={armies.length === 1 ? (first.name || (first.fleet ? t('fleet') : t('army'))) : `${armies.length} ${fleet ? t('fleets') : t('armies')}`}
    sub={<>{num(men)} {fleet ? t('ships') : t('men')} · <LocName id={first.loc} /></>}>
    <div class="army-list">{armies.map((a) => {
      const dest = a.path.length ? a.path[a.path.length - 1] : -1;
      return <div class="army-row">
        <Tip content={<div><b>{a.name}</b><div>{t('general')}: {a.general || t('none')}</div>{a.mercenary && <div>{t('mercenary')}</div>}</div>}>
          <span class={`unit-ic ${a.fleet ? 'ship' : 'land'}`}>{a.fleet ? '⚓' : '⚔'}</span>
        </Tip>
        <span class="aname">{a.name}{a.mercenary && <small class="muted"> ({t('mercenary')})</small>}</span>
        <span class="amen">{num(a.men)}</span>
        <span class="amorale"><Bar value={a.morale} color="#4d7a3a" tip={<div><b>{t('morale')}</b> {pct(a.morale)}</div>} /></span>
        <span class="astate muted">{a.battle ? <span class="neg">{t('in_battle')}</span> : a.siege >= 0 ? <>{t('besieging')} <LocName id={a.siege} /></> : dest >= 0 ? <>→ <LocName id={dest} /></> : a.embarked ? t('embarked') : t('idle')}</span>
      </div>;
    })}</div>
    <div class="army-meta">
      <span>{t('general')}: <b>{armies.map((a) => a.general).filter(Boolean).join(', ') || t('none')}</b></span>
      {path && <span class="path-prev">{path.days >= 0 ? <>→ {locName(path.to)}: <b>{daysText(path.days)}</b></> : <span class="neg">{t('no_route')} {locName(path.to)}</span>}</span>}
      {!path && <span class="muted small">{t('rightclick_hint')}</span>}
    </div>
    <div class="army-btns">
      <Btn disabled={armies.length < 2 ? 'need two armies' : !sameLoc ? 'not in the same place' : null} onClick={() => act({ t: 'merge', armies: armies.map((a) => a.id) }).then((r) => { if (r.ok) selectedArmies.value = [armies[0].id]; })}>{t('merge')}</Btn>
      <Btn disabled={armies.length !== 1 ? 'select one army' : first.men < 2 ? 'too small' : null} onClick={() => act({ t: 'split', army: first.id })}>{t('split')}</Btn>
      {!fleet && <Btn tip={t('auto_general_hint')} onClick={() => all((id) => act({ t: 'general', army: id, char: 0 }))}>{t('assign_general')}</Btn>}
      {!fleet && myFleets.length > 0 && <select class="embark-sel" value="" onChange={(e) => { const f = Number((e.target as HTMLSelectElement).value); if (f) all((id) => act({ t: 'embark', army: id, fleet: f }, 'march')); }}>
        <option value="">{t('embark')}…</option>{myFleets.map((f) => <option value={f.id}>{f.name} ({num(f.men)} {t('ships')}) · {locName(f.loc)}</option>)}
      </select>}
      {!fleet && armies.length === 1 && <Btn tip={t('stop_hint')} onClick={() => act({ t: 'move', army: first.id, to: first.loc })}>{t('stop')}</Btn>}
      <Btn cls="danger" onClick={() => { if (!confirm) { setConfirm(true); sfx('click'); return; } all((id) => act({ t: 'disband', army: id })).then(() => { selectedArmies.value = []; }); }}>{confirm ? t('confirm_disband') : t('disband')}</Btn>
    </div>
  </Panel></div>;
}

export function Outliner() {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('sc.outliner') !== '0'; } catch { return true; } });
  const v = view.value; const pid = playerId.value;
  const r = useRealm(1200);
  void namesVersion.value;
  if (!v || pid < 0) return null;
  const toggle = () => { const x = !open; setOpen(x); sfx('click'); try { localStorage.setItem('sc.outliner', x ? '1' : '0'); } catch { /* ignore */ } };
  const mine = v.armies.filter((a) => a.owner === pid);
  const land = mine.filter((a) => !a.fleet), fleets = mine.filter((a) => a.fleet);
  const ns = nations.value;
  const sieges = v.sieges.filter((s) => s.nation === pid || (v.owner?.[s.loc] === pid));
  const wars = v.wars.filter((w) => w.att.includes(pid) || w.def.includes(pid));
  const sel = new Set(selectedArmies.value);
  const total = land.reduce((p, a) => p + a.men, 0);
  return <div class={`outliner ${open ? '' : 'shut'}`} onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
    <div class="ol-head" onClick={toggle}><span>{t('outliner')}</span><span>{open ? '▾' : '◂'}</span></div>
    {open && <div class="ol-body">
      {wars.length > 0 && <Section title={<>{t('wars')} <small>({wars.length})</small></>} id="ol-wars">
        {wars.map((w) => { const sc = w.att.includes(pid) ? w.score : -w.score; const foe = w.att.includes(pid) ? w.defLead : w.attLead; const offers = w.offers.filter((o) => o.to === pid).length;
          return <div class="ol-row click" onClick={() => { sfx('open'); openPanel('peace', { war: w.id }); }}>
            <NLink id={foe} size={14} name={false} /><span class="ol-name">{L(w.name)}</span>
            {offers > 0 && <span class="badge">{offers}</span>}
            <Tip content={<div><b>{t('war_score')}</b> {signed(sc)}<div class="muted">{t('war_score_hint')}</div></div>}><span class={`ol-v ${sc >= 0 ? 'pos' : 'neg'}`}>{signed(sc)}</span></Tip>
          </div>; })}
      </Section>}
      <Section title={<>{t('armies')} <small>({land.length} · {num(total)})</small></>} id="ol-armies">
        {land.length === 0 && <div class="muted small">{t('no_armies')}</div>}
        {land.map((a) => <div class={`ol-row click ${sel.has(a.id) ? 'sel' : ''}`} onClick={(e) => { if ((e as MouseEvent).shiftKey) { selectedArmies.value = [...new Set([...selectedArmies.value, a.id])]; return; } selectArmy(a.id); }}>
          <span class={`dot ${a.battle ? 'bat' : a.siege >= 0 ? 'sie' : a.path.length ? 'mov' : ''}`} />
          <span class="ol-name">{a.name}</span><span class="ol-sub">{locName(a.loc)}</span><span class="ol-v">{num(a.men)}</span>
          <span class="ol-bar"><i style={{ width: `${Math.round(a.morale * 100)}%` }} /></span>
        </div>)}
      </Section>
      {fleets.length > 0 && <Section title={<>{t('fleets')} <small>({fleets.length})</small></>} id="ol-fleets">
        {fleets.map((a) => <div class={`ol-row click ${sel.has(a.id) ? 'sel' : ''}`} onClick={() => selectArmy(a.id)}>
          <span class={`dot ${a.battle ? 'bat' : a.path.length ? 'mov' : ''}`} /><span class="ol-name">{a.name}</span><span class="ol-sub">{locName(a.loc)}</span><span class="ol-v">{num(a.men)}</span>
        </div>)}
      </Section>}
      {sieges.length > 0 && <Section title={t('sieges')} id="ol-sieges">
        {sieges.map((s) => <div class="ol-row click" onClick={() => selectLoc(s.loc)}>
          <NLink id={s.nation} size={14} name={false} /><span class="ol-name">{locName(s.loc)}</span>
          <span class="ol-bar wide"><i class={s.nation === pid ? '' : 'neg'} style={{ width: `${Math.round(s.progress)}%` }} /></span><span class="ol-v">{num(s.progress)}%</span>
        </div>)}
      </Section>}
      {r && (r.constructions.length > 0 || r.recruits.length > 0) && <Section title={t('works')} id="ol-works">
        {r.constructions.map((c: any) => <div class="ol-row click" onClick={() => selectLoc(c.loc)}><span class="ico">⚒</span><span class="ol-name">{L(c.building)}</span><span class="ol-sub">{c.name}</span><span class="ol-v">{daysText(c.left)}</span></div>)}
        {r.recruits.map((c: any) => <div class="ol-row click" onClick={() => selectLoc(c.loc)}><span class="ico">⚔</span><span class="ol-name">{L(c.unit)}</span><span class="ol-sub">{c.name}</span><span class="ol-v">{daysText(c.left)}</span></div>)}
      </Section>}
      {v.player && <div class="ol-foot"><Tip content={t('ledger_hint')}><a class="lk" onClick={() => openPanel('military')}>{t('military')} →</a></Tip></div>}
    </div>}
    {void ns}{void panel.value}{void flyToLoc}
  </div>;
}
