// Dialogs of the realm pass: the assembly's vote (opened when it refuses a tax rise or a war: the player sees each
// Power's stance and why, and may buy votes or offer a privilege), the imperial election for a human elector, and the
// window of a situation (sides, what drives it, its stages and the actions open to us).
import { useState, useEffect } from 'preact/hooks';
import { playerId, realmDialog } from '../store';
import { view, nations } from '../../game/client';
import { CLASSES, CLASS_NAME } from '../../sim/defs';
import { Panel, Section, Row, Bar, Btn, Empty, NLink, NList, Tip, useQuery, act, t, L, num, signed, pct, fmtDateShort, Slider } from './common';
import { Parts, TipHead } from './explain';
import { errText } from '../i18n';
import { MediationOffers, LeagueCalls, fill } from './empire';

type Row2 = [any, number];
const sum = (r: Row2[]) => r.reduce((p, x) => p + x[1], 0);
const date = (d: number) => fmtDateShort(d, view.value?.startYear ?? 1356);

export function RealmDialogs() {
  const d = realmDialog.value;
  return <>
    <ElectionModal />
    <AsksModal />
    {/* keyed by what is asked, so that a new question never inherits the slider of the last one */}
    {d?.kind === 'assembly' && <AssemblyDialog key={JSON.stringify(d.cmd)} cmd={d.cmd} />}
    {d?.kind === 'situation' && <SituationWindow key={d.id} id={d.id} />}
  </>;
}
const close = () => { realmDialog.value = null; };
function Modal({ title, children }: { title: any; children: any }) {
  return <div class="modal-fixed" onClick={close} onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
    <div onClick={(e) => e.stopPropagation()} class="realm-dialog"><Panel title={title} onClose={close} cls="realm-dlg">{children}</Panel></div>
  </div>;
}

// ---------------------------------------------------------------- the assembly
/** The assembly's vote on a war (from the declaration), on a tax (a class rate, or every class to a whole level) or on
 *  a duty (from the duty sliders). The tally is the simulation's (realmview.ts assemblyView): a vote that would fail
 *  is not put, and bribes are paid only for a yes. */
function AssemblyDialog({ cmd }: { cmd: any }) {
  const pid = playerId.value;
  const war = cmd.t === 'declare' || (cmd.t === 'assembly' && cmd.kind === 'war');
  const dutyId: string | undefined = cmd.t === 'budget' ? cmd.key : cmd.duty;
  const [bribe, setBribe] = useState<string[]>([]);
  const [concede, setConcede] = useState<string | undefined>(undefined);
  const [cls, setCls] = useState<number>(cmd.cls ?? 0);
  const [rate, setRate] = useState<number>(cmd.rate ?? 0.1);
  const [value, setValue] = useState<number>(cmd.value ?? 0);
  const [busy, setBusy] = useState(false);
  const q: any = war ? { q: 'assembly', kind: 'war', target: cmd.target, goal: cmd.goal, bribe, concede }
    : dutyId ? { q: 'assembly', kind: 'tax', duty: dutyId, value, bribe, concede } : { q: 'assembly', kind: 'tax', cls, rate, bribe, concede };
  const [a] = useQuery<any>(q, [pid, JSON.stringify(bribe), concede, cls, rate, value, dutyId], 1000);
  if (!a) return <Modal title={t('x_asm_title')}><Empty>{t('loading')}…</Empty></Modal>;
  const toggle = (id: string) => setBribe(bribe.includes(id) ? bribe.filter((x) => x !== id) : [...bribe, id]);
  const okText = war ? fill('x_asm_war_granted', { realm: L(nations.value[cmd.target]?.short) ?? '' }) : a.needed ? fill('x_asm_tax_granted', { p: pct(a.tax?.grant ?? 0, 1) }) : t('x_asm_applied');
  const vote = async () => {
    if (busy) return; setBusy(true);
    // a war the assembly has already approved is simply declared
    if (war && a.needed === false && cmd.t === 'declare') { const r = await act(cmd, 'war', t('war_declared')); setBusy(false); if (r.ok) close(); return; }
    const c: any = war ? { t: 'assembly', kind: 'war', target: cmd.target, goal: cmd.goal, bribe, concede }
      : dutyId ? { t: 'assembly', kind: 'tax', duty: dutyId, value, bribe, concede } : { t: 'assembly', kind: 'tax', cls, rate, bribe, concede };
    const r = await act(c, 'click', okText);
    setBusy(false);
    if (!r.ok) return;
    if (war && cmd.t === 'declare') await act(cmd, 'war', t('war_declared'));
    close();
  };
  const total = a.yes + a.no;
  const dd = dutyId ? (a.dutyDefs ?? []).find((x: any) => x.id === dutyId) : null;
  const fmtDuty = (v: number) => (dutyId === 'hearth' ? num(v, 2) : pct(v, 1));
  const why = busy ? '…' : a.cost > a.treasury ? errText('not enough gold') : a.needed !== false && !a.passes ? t('x_asm_would_fail') : null;
  return <Modal title={t('x_asm_title')}>
    <div class="small">{war ? warQuestion(cmd) : dutyId ? fill('x_asm_duty_q', { duty: t(`duty_${dutyId}`) }) : t('x_asm_tax_q')}</div>
    {!war && <div class="asm-tax">
      {dutyId ? <>
        <Row k={t(`duty_${dutyId}`)} v={fmtDuty(value)} />
        {dd && <Slider value={value} min={0} max={dd.max} step={dd.step} onCommit={setValue} fmt={fmtDuty} />}
      </> : <>
        <div class="chips"><span class={`chip ${cls === -1 ? 'on' : ''}`} onClick={() => setCls(-1)}>{t('x_asm_all_level')}</span>{CLASSES.map((k, i) => <span class={`chip ${i === cls ? 'on' : ''}`} onClick={() => setCls(i)}>{L(CLASS_NAME[k])}</span>)}</div>
        <Row k={cls === -1 ? t('x_asm_level') : L(CLASS_NAME[CLASSES[cls]])} v={pct(rate, 1)} />
        <Slider value={rate} min={0} max={0.5} step={0.005} onCommit={setRate} fmt={(v) => pct(v, 1)} />
      </>}
      {a.tax && <Row k={t('x_asm_level')} v={`${pct(a.tax.now, 1)} → ${pct(a.level, 1)} (${t('x_asm_tax_ceiling')} ${pct(a.ceiling, 1)})`} tip={() => <div>
        <TipHead name={t('x_asm_level')} value={pct(a.level, 1)} hint={t('x_asm_level_hint')} />
        <Parts title={t('x_asm_level_asked')} rows={a.tax.rows} total={a.level} fmt={(v) => pct(v, 2)} />
        <Parts title={t('x_asm_level_now')} rows={a.tax.nowRows} total={a.tax.now} fmt={(v) => pct(v, 2)} />
      </div>} />}
      {!a.needed && <div class="muted small">{t('x_asm_not_needed2')}</div>}
    </div>}
    <Bar value={total > 0 ? a.yes / total : 0} max={1} color={a.passes ? '#4d8a3a' : '#a8331f'} label={`${t('yes')} ${num(a.yes)} · ${t('no')} ${num(a.no)}`} />
    <div class={a.passes ? 'pos small' : 'neg small'}>{a.passes ? t('x_asm_would_pass') : t('x_asm_would_fail')}</div>
    <div class="asm-estates">{a.estates.map((e: any) => <div class="kv">
      <span class="k"><b>{L(e.name)}</b> <span class="muted small">{t('influence')} {num(e.influence)}</span></span>
      <span class="v">
        <Tip content={() => <Parts title={`${L(e.name)}: ${e.yes ? t('yes') : t('no')}`} rows={e.rows} total={e.sum} digits={0} />}><span class={`has-tip ${e.yes ? 'pos' : 'neg'}`}>{e.yes ? t('yes') : t('no')} ({signed(e.sum, 0)})</span></Tip>
        <label class="small"><input type="checkbox" checked={bribe.includes(e.id)} onChange={() => toggle(e.id)} /> {t('x_asm_bribe')} ({num(a.bribeCost)})</label>
        {e.concession && <label class="small"><input type="radio" name="concede" checked={concede === e.concession} onChange={() => setConcede(concede === e.concession ? undefined : e.concession)} onClick={() => { if (concede === e.concession) setConcede(undefined); }} /> {t('x_asm_concede')}: {L(e.concessionName)}</label>}
      </span>
    </div>)}</div>
    <div class="muted small">{t('x_asm_rule2')}</div>
    <div class="btn-row">
      <Btn small={false} disabled={why} onClick={vote}>{a.needed === false ? (war ? t('declare_war') : t('x_asm_apply')) : t('x_asm_put')}{a.cost && a.needed !== false ? ` (${num(a.cost)})` : ''}</Btn>
      <Btn small={false} onClick={close}>{t('cancel')}</Btn>
    </div>
  </Modal>;
}

/** "The assembly votes on the war (humiliation) against Padua": the goal it votes on and the realm as a link. */
function warQuestion(cmd: any) {
  const [pre, post] = fill('x_asm_war_q', { goal: t(`goal_${cmd.goal ?? 'conquest'}`) }).split('{realm}');
  return <>{pre}<NLink id={cmd.target} />{post ?? ''}</>;
}

/** A situation's standing between the two levels at which it turns (its drivers' range): filled from zero, green
 *  toward the upper level and red toward the lower, with both levels and zero marked. */
function LevelBar({ value, min, max }: { value: number; min: number; max: number }) {
  const at = (v: number) => Math.max(0, Math.min(1, (v - min) / Math.max(1e-9, max - min))) * 100;
  const z = at(0), p = at(value);
  return <div class="bar-wrap">
    <div class="bar" style={{ height: 10 }}>
      <div class="bar-fill" style={{ left: `${Math.min(z, p)}%`, width: `${Math.abs(p - z)}%`, background: value >= 0 ? '#4d8a3a' : '#a8331f' }} />
      <div style={{ position: 'absolute', left: `${z}%`, top: -1, bottom: -1, width: 2, background: '#4a3218' }} />
    </div>
    <div class="small muted" style={{ position: 'relative', height: '1.3em' }}>
      <span style={{ position: 'absolute', left: 0 }}>{num(min)}</span>
      <span style={{ position: 'absolute', left: `${z}%`, transform: 'translateX(-50%)' }}>0</span>
      <span style={{ position: 'absolute', right: 0 }}>{num(max)}</span>
    </div>
  </div>;
}

// ---------------------------------------------------------------- the imperial election
function ElectionModal() {
  const pid = playerId.value;
  const [hidden, setHidden] = useState(-1);
  // (from every tick, so that the dialog opens whichever panel is shown)
  const open = (view.value?.player?.electionCloses ?? 0) > 0;
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

// ---------------------------------------------------------------- requests that await our answer
/** Offers of mediation in a war we lead and calls of the league to defend a member town: they lapse (as a refusal)
 *  at their date, so they open a dialog from every tick, like the election. */
function AsksModal() {
  const pid = playerId.value;
  const n = view.value?.player?.asks ?? 0;
  const [hidden, setHidden] = useState(-1);
  const [g, refreshG] = useQuery<any>(n > 0 ? { q: 'powers' } : null, [pid, n], 1500);
  const [e, refreshE] = useQuery<any>(n > 0 ? { q: 'empire' } : null, [pid, n], 1500);
  useEffect(() => { if (!n) setHidden(-1); }, [n]);
  if (!n || hidden === n || realmDialog.value || (view.value?.player?.electionCloses ?? 0) > 0) return null;
  const offers = g?.offers ?? [], calls = e?.league?.calls ?? [];
  if (!offers.length && !calls.length) return null;
  const done = () => { refreshG(); refreshE(); };
  return <div class="modal-fixed" onPointerDown={(ev) => ev.stopPropagation()} onWheel={(ev) => ev.stopPropagation()}>
    <div class="realm-dialog"><Panel title={t('x_asks_title')} onClose={() => setHidden(n)} cls="realm-dlg">
      {offers.length > 0 && <MediationOffers offers={offers} spurned={g.spurned} onDone={done} />}
      {calls.length > 0 && <Section title={L(e.league.name)} id="asks-league"><LeagueCalls calls={calls} terms={e.league} onDone={done} /></Section>}
      <div class="btn-row"><Btn small={false} onClick={() => setHidden(n)}>{t('x_el_later')}</Btn></div>
    </Panel></div>
  </div>;
}

// ---------------------------------------------------------------- the window of a situation
function SituationWindow({ id }: { id: string }) {
  const pid = playerId.value;
  const [x, refresh] = useQuery<any>({ q: 'situation', id }, [pid, id], 1000);
  const [target, setTarget] = useState<Record<string, number>>({});
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!x) return <Modal title={t('situations')}><Empty>{t('loading')}…</Empty></Modal>;
  const dr = x.drivers;
  const cost = (c: any) => [c.gold ? `${num(c.gold)} ${t('gold')}` : '', c.authority ? `${c.authority} ${t('authority')}` : '', c.prestige ? `${c.prestige} ${t('prestige')}` : ''].filter(Boolean).join(', ');
  return <Modal title={L(x.name)}>
    <div class="muted small">{L(x.desc)}</div>
    {/* the header shows the progress to a tenth, as its breakdown adds up */}
    <Row k={t('progress')} v={num(x.progress, 1)} tip={() => dr ? <div><TipHead name={t('progress')} value={num(x.progress, 1)} />
      <Parts title={dr.kind === 'monthly' ? t('x_sit_monthly') : t('x_sit_level')} rows={dr.rows} total={sum(dr.rows)} digits={1} />{dr.note && <div class="muted">{L(dr.note)}</div>}</div> : null} />
    {dr?.range ? <LevelBar value={x.progress} min={dr.range[0]} max={dr.range[1]} /> : <Bar value={Math.abs(x.progress)} max={100} color="#7a4e1c" />}
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
          <Btn disabled={a.refusal ? errText(a.refusal) : null} onClick={async () => {
            // an action that costs something or closes something for good is confirmed first; every action says what it did
            if ((cost(a.cost) || a.final) && confirm !== a.id) { setConfirm(a.id); return; }
            setConfirm(null);
            const day = view.value?.day ?? 0;
            const ok = a.cooldown > 0 ? fill('x_sit_done_again', { a: L(a.name), d: date(day + a.cooldown) }) : fill('x_sit_done', { a: L(a.name) });
            await act({ t: 'situation', id: x.id, action: a.id, target: a.targets ? (target[a.id] ?? a.targets[0]) : undefined }, 'click', ok); refresh();
          }}>{confirm === a.id ? t('x_sit_confirm_yes') : t('x_sit_do')}</Btn>
          {confirm === a.id && <Btn onClick={() => setConfirm(null)}>{t('cancel')}</Btn>}
          {a.ready > (view.value?.day ?? 0) && <span class="muted small">{t('x_sit_again')} {date(a.ready)}</span>}
        </div>
        {confirm === a.id && <div class="warn-box small">{a.final ? <>{cost(a.cost) ? `${fill('x_sit_confirm_pay', { cost: cost(a.cost) })} ` : ''}{fill('x_sit_confirm_final', { what: L(a.final) })}</> : fill('x_sit_confirm', { cost: cost(a.cost) })} {a.cost.gold && x.treasury > 0 ? fill('x_sit_confirm_share', { p: pct(a.cost.gold / x.treasury, 0) }) : ''}</div>}
      </div>) : <div class="muted small">{t('x_sit_no_actions')}</div>}
    </Section>
  </Modal>;
}
