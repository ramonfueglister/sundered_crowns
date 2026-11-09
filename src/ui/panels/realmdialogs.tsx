// Dialogs of the realm pass: the assembly's vote (opened when it refuses a tax rise or a war: the player sees each
// Power's stance and why, and may buy votes or offer a privilege), the imperial election for a human elector, and the
// window of a situation (sides, what drives it, its stages and the actions open to us).
import { useState, useEffect } from 'preact/hooks';
import { playerId, realmDialog } from '../store';
import { view } from '../../game/client';
import { Panel, Section, Row, Bar, Btn, Empty, NLink, NList, Tip, useQuery, act, realm, t, L, num, signed, pct, fmtDateShort, Slider } from './common';
import { Parts, TipHead } from './explain';
import { errText } from '../i18n';

type Row2 = [any, number];
const sum = (r: Row2[]) => r.reduce((p, x) => p + x[1], 0);
const date = (d: number) => fmtDateShort(d, view.value?.startYear ?? 1356);
const CLASS_KEYS = ['cls_peasants', 'cls_labourers', 'cls_artisans', 'cls_burghers', 'cls_clergy', 'cls_nobles', 'cls_wage_workers'];

export function RealmDialogs() {
  const d = realmDialog.value;
  return <>
    <ElectionModal />
    {d?.kind === 'assembly' && <AssemblyDialog cmd={d.cmd} />}
    {d?.kind === 'situation' && <SituationWindow id={d.id} />}
  </>;
}
const close = () => { realmDialog.value = null; };
function Modal({ title, children }: { title: any; children: any }) {
  return <div class="modal-fixed" onClick={close} onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
    <div onClick={(e) => e.stopPropagation()} class="realm-dialog"><Panel title={title} onClose={close} cls="realm-dlg">{children}</Panel></div>
  </div>;
}

// ---------------------------------------------------------------- the assembly
function AssemblyDialog({ cmd }: { cmd: any }) {
  const pid = playerId.value;
  const war = cmd.t === 'declare' || (cmd.t === 'assembly' && cmd.kind === 'war');
  const [bribe, setBribe] = useState<string[]>([]);
  const [concede, setConcede] = useState<string | undefined>(undefined);
  const [cls, setCls] = useState<number>(cmd.cls ?? 0);
  const [rate, setRate] = useState<number>(cmd.rate ?? 0.1);
  const [busy, setBusy] = useState(false);
  const q: any = war ? { q: 'assembly', kind: 'war', target: cmd.target, goal: cmd.goal, bribe, concede } : { q: 'assembly', kind: 'tax', cls, rate, bribe, concede };
  const [a] = useQuery<any>(q, [pid, JSON.stringify(bribe), concede, cls, rate], 1000);
  if (!a) return <Modal title={t('x_asm_title')}><Empty>{t('loading')}…</Empty></Modal>;
  const toggle = (id: string) => setBribe(bribe.includes(id) ? bribe.filter((x) => x !== id) : [...bribe, id]);
  const vote = async () => {
    if (busy) return; setBusy(true);
    const r = await act(war ? { t: 'assembly', kind: 'war', target: cmd.target, goal: cmd.goal, bribe, concede } : { t: 'assembly', kind: 'tax', cls, rate, bribe, concede }, 'click');
    setBusy(false);
    if (!r.ok) return;
    if (war && cmd.t === 'declare') await act(cmd, 'war');
    close();
  };
  const total = a.yes + a.no;
  return <Modal title={t('x_asm_title')}>
    <div class="small">{war ? <>{t('x_asm_war_q')} <NLink id={cmd.target} /></> : t('x_asm_tax_q')}</div>
    {!war && <div class="asm-tax">
      <div class="chips">{CLASS_KEYS.map((k, i) => <span class={`chip ${i === cls ? 'on' : ''}`} onClick={() => setCls(i)}>{t(k)}</span>)}</div>
      <Row k={t(CLASS_KEYS[cls])} v={pct(rate, 1)} />
      <Slider value={rate} min={0} max={0.5} step={0.005} onCommit={setRate} fmt={(v) => pct(v, 1)} />
      <Row k={t('x_asm_tax_level')} v={`${pct(a.level, 1)} (${t('x_asm_tax_ceiling')} ${pct(a.ceiling, 1)})`} tip={t('x_asm_ceiling_hint')} />
      {!a.needed && <div class="muted small">{t('x_asm_not_needed')}</div>}
    </div>}
    <Bar value={total > 0 ? a.yes / total : 0} max={1} color={a.passes ? '#4d8a3a' : '#a8331f'} label={`${t('yes')} ${num(a.yes)} · ${t('no')} ${num(a.no)}`} />
    <div class="asm-estates">{a.estates.map((e: any) => <div class="kv">
      <span class="k"><b>{L(e.name)}</b> <span class="muted small">{t('influence')} {num(e.influence)}</span></span>
      <span class="v">
        <Tip content={() => <Parts title={`${L(e.name)}: ${e.yes ? t('yes') : t('no')}`} rows={e.rows} total={e.sum} digits={0} />}><span class={`has-tip ${e.yes ? 'pos' : 'neg'}`}>{e.yes ? t('yes') : t('no')} ({signed(e.sum, 0)})</span></Tip>
        <label class="small"><input type="checkbox" checked={bribe.includes(e.id)} onChange={() => toggle(e.id)} /> {t('x_asm_bribe')} ({num(a.bribeCost)})</label>
        {e.concession && <label class="small"><input type="radio" name="concede" checked={concede === e.concession} onChange={() => setConcede(concede === e.concession ? undefined : e.concession)} onClick={() => { if (concede === e.concession) setConcede(undefined); }} /> {t('x_asm_concede')}: {L(e.concessionName)}</label>}
      </span>
    </div>)}</div>
    <div class="muted small">{t('x_asm_rule')}</div>
    <div class="btn-row">
      <Btn small={false} disabled={busy ? '…' : a.cost > a.treasury ? errText('not enough gold') : null} onClick={vote}>{t('x_asm_put')}{a.cost ? ` (${num(a.cost)})` : ''}</Btn>
      <Btn small={false} onClick={close}>{t('cancel')}</Btn>
    </div>
  </Modal>;
}

// ---------------------------------------------------------------- the imperial election
function ElectionModal() {
  const pid = playerId.value; const r = realm.value;
  const [hidden, setHidden] = useState(-1);
  const open = !!r?.empire?.election && (r.empire.electors ?? []).includes(pid);
  const [e, refresh] = useQuery<any>(open ? { q: 'empire' } : null, [pid, open], 1500);
  useEffect(() => { if (!open) setHidden(-1); }, [open]);
  if (!open || !e?.election || e.election.myVote >= 0 || hidden === e.election.closes || realmDialog.value) return null;
  const me = e.electorViews.find((x: any) => x.id === pid);
  return <div class="modal-fixed" onPointerDown={(ev) => ev.stopPropagation()} onWheel={(ev) => ev.stopPropagation()}>
    <div class="realm-dialog"><Panel title={t('x_el_title')} onClose={() => setHidden(e.election.closes)} cls="realm-dlg">
      <div class="small">{t('x_el_modal_hint')} {date(e.election.closes)}.</div>
      {e.candidates.map((c: any) => { const others = e.electorViews.filter((x: any) => x.choice === c.id && x.id !== pid);
        return <div class="kv"><span class="k"><NLink id={c.id} /></span><span class="v">
          <Tip content={() => <div><TipHead name={t('x_el_votes_now')} value={c.votes} />{others.map((x: any) => <Parts title={<NLink id={x.id} size={12} />} rows={x.rows} total={sum(x.rows)} digits={0} />)}</div>}><span class="has-tip">{c.votes} / {e.electors.length}</span></Tip>
          <Btn onClick={async () => { await act({ t: 'empire', action: 'vote', target: c.id }); refresh(); }}>{t('x_el_vote')}</Btn>
        </span></div>; })}
      {me && <div class="muted small">{t('x_el_own_hint')}</div>}
      <div class="btn-row"><Btn small={false} onClick={() => setHidden(e.election.closes)}>{t('x_el_later')}</Btn></div>
    </Panel></div>
  </div>;
}

// ---------------------------------------------------------------- the window of a situation
function SituationWindow({ id }: { id: string }) {
  const pid = playerId.value;
  const [x, refresh] = useQuery<any>({ q: 'situation', id }, [pid, id], 1000);
  const [target, setTarget] = useState<Record<string, number>>({});
  if (!x) return <Modal title={t('situations')}><Empty>{t('loading')}…</Empty></Modal>;
  const dr = x.drivers;
  const cost = (c: any) => [c.gold ? `${num(c.gold)} ${t('gold')}` : '', c.authority ? `${c.authority} ${t('authority')}` : '', c.prestige ? `${c.prestige} ${t('prestige')}` : ''].filter(Boolean).join(', ');
  return <Modal title={L(x.name)}>
    <div class="muted small">{L(x.desc)}</div>
    <Row k={t('progress')} v={num(x.progress)} tip={() => dr ? <div><TipHead name={t('progress')} value={num(x.progress)} />
      <Parts title={dr.kind === 'monthly' ? t('x_sit_monthly') : t('x_sit_level')} rows={dr.rows} total={sum(dr.rows)} digits={1} />{dr.note && <div class="muted">{L(dr.note)}</div>}</div> : null} />
    <Bar value={Math.abs(x.progress)} max={100} color="#7a4e1c" />
    {dr?.note && <div class="small">{L(dr.note)}</div>}
    <Section title={t('x_sit_sides')} id="sit-sides">
      {x.sides.map((s: any) => <div class="kv"><span class="k">{L(s.name)}</span><span class="v">{s.members.length ? <NList ids={s.members.slice(0, 10)} size={14} /> : <span class="muted">{t('none')}</span>}{s.members.includes(pid) && <span class="tag">{t('x_sit_we')}</span>}</span></div>)}
    </Section>
    <Section title={t('x_sit_stages')} id="sit-stages">
      {x.stages.map((s: any, i: number) => <div class={`kv ${i === x.stage ? 'pos' : 'muted'}`}><span class="k">{i === x.stage ? '▶ ' : ''}{L(s.name)}</span><span class="v small">{s.info ? L(s.info) : ''}</span></div>)}
    </Section>
    <Section title={t('x_sit_actions')} id="sit-actions">
      {x.actions.length ? x.actions.map((a: any) => <div class="sit-action">
        <div class="kv"><span class="k"><b>{L(a.name)}</b></span><span class="v small muted">{cost(a.cost) || t('x_sit_free')}</span></div>
        <div class="small">{L(a.desc)}</div>
        <div class="btn-row">
          {a.targets && a.targets.length > 0 && <span class="chips">{a.targets.map((tg: number) => <span class={`chip ${(target[a.id] ?? a.targets[0]) === tg ? 'on' : ''}`} onClick={() => setTarget({ ...target, [a.id]: tg })}><NLink id={tg} size={12} /></span>)}</span>}
          <Btn disabled={a.refusal ? errText(a.refusal) : null} onClick={async () => { await act({ t: 'situation', id: x.id, action: a.id, target: a.targets ? (target[a.id] ?? a.targets[0]) : undefined }); refresh(); }}>{t('x_sit_do')}</Btn>
          {a.ready > (view.value?.day ?? 0) && <span class="muted small">{t('x_sit_again')} {date(a.ready)}</span>}
        </div>
      </div>) : <div class="muted small">{t('x_sit_no_actions')}</div>}
    </Section>
  </Modal>;
}
