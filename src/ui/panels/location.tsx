// Location panel: everything about one land location or sea zone, with building, recruiting and agents.
import { useState } from 'preact/hooks';
import { nations, view } from '../../game/client';
import { selectedLoc, playerId, openPanel } from '../store';
import { RECIPES, UNITS, BUILDINGS } from '../../sim/defs';
import { Parts, TipHead, Drift, AgentsTip } from './explain';
import { Panel, Section, Row, Bar, NLink, Btn, Empty, useQuery, act, t, L, lang, num, pct, signed, Tip, Coa, daysText, realm, selectArmy, placeName, Effects } from './common';
import { sfx } from '../audio';
import { ScopeOrders, MatsTip } from './works';
import { Methods, Migration } from './statecraft';
import { LocWar } from './war';

const TERRAIN: Record<string, [string, string]> = {
  plains: ['Plains', 'Ebene'], farmland: ['Farmland', 'Ackerland'], forest: ['Forest', 'Wald'], hills: ['Hills', 'Hügelland'], mountains: ['Mountains', 'Gebirge'],
  marsh: ['Marsh', 'Sumpf'], steppe: ['Steppe', 'Steppe'], desert: ['Desert', 'Wüste'], jungle: ['Jungle', 'Dschungel'], tundra: ['Tundra', 'Tundra'], wasteland: ['Wasteland', 'Ödland'],
};
export const terrainName = (k: string) => (TERRAIN[k] ? TERRAIN[k][lang.value === 'de' ? 1 : 0] : k);

const solColor = (v: number) => (v < 0.35 ? '#a8331f' : v < 0.55 ? '#c08a2a' : '#4d8a3a');

export function LocationPanel({ loc }: { loc: number }) {
  const [d, refresh] = useQuery<any>({ q: 'loc', loc }, [loc], 500);
  const close = () => { selectedLoc.value = -1; };
  if (!d) return <Panel title={t('location')} onClose={close} cls="loc-pnl"><Empty>{t('loading')}…</Empty></Panel>;
  // fog of war (src/game/fog.ts): an unexplored place answers with its name only
  if (d.unknown) return <Panel title={placeName(d.name)} sub={d.sea ? t('sea_zone') : undefined} onClose={close} cls="loc-pnl"><Empty>{t('terra_incognita')}</Empty><div class="muted small">{t('terra_incognita_hint')}</div></Panel>;
  if (d.sea) return <SeaPanel d={d} close={close} />;
  const pid = playerId.value;
  const own = d.owner === pid && pid >= 0;
  const owner = nations.value[d.owner];
  const ctrlN = d.ctrl >= 0 && d.ctrl !== d.owner ? nations.value[d.ctrl] : null;
  const pop = d.pops.reduce((p: number, x: any) => p + x.pop, 0);
  const unrestTotal = d.unrestWhy.reduce((p: number, x: [string, number]) => p + x[1], 0);
  return <Panel cls="loc-pnl" onClose={close}
    coa={owner ? <Coa coa={owner.coa} color={owner.color} size={44} /> : <div class="coa-empty" />}
    title={<>{placeName(d.name)}{d.alt && d.alt !== d.name && d.alt !== placeName(d.name) && <small class="alt"> ({d.alt})</small>}</>}
    sub={[placeName(d.province), placeName(d.area), d.region && regionName(d.region)].filter(Boolean).join(' · ')}>
    <div class="loc-owner">
      {owner ? <NLink id={d.owner} size={20} full /> : <span class="muted">{t('unclaimed')}</span>}
      {d.ctrl === -2 && <span class="tag neg">{t('rebels_hold')}</span>}
      {ctrlN && <span class="tag neg">{t('occupied_by')} <NLink id={d.ctrl} size={14} /></span>}
      {d.core >= 0 && d.core !== d.owner && <span class="tag">{t('core_of')} <NLink id={d.core} size={14} /></span>}
    </div>
    <div class="loc-id">
      <Tip content={<div><TipHead name={terrainName(d.terrain)} value={`${num(d.elev)} m`} hint={<>{d.coastal ? t('coastal') + ' · ' : ''}{num(d.lat, 1)}° {num(d.lon, 1)}°</>} /></div>}><span class="chip"><small>{t('terrain')}</small>{terrainName(d.terrain)}{d.coastal && ' ≈'}</span></Tip>
      <Tip content={<div><TipHead name={L(d.culture)} hint={<>{t('culture_group')}: {d.cultureGroup ?? '—'}</>} />{d.minority && <div class="muted">{t('minority')}: {L(d.minority.culture)} / {L(d.minority.faith)} · {pct(d.minority.share)} {t('of_population')}</div>}</div>}><span class="chip"><small>{t('culture')}</small>{L(d.culture)}</span></Tip>
      <Tip content={<div><TipHead name={L(d.faith)} hint={t('x_loc_faith_hint')} /></div>}><span class="chip"><small>{t('faith')}</small>{L(d.faith)}</span></Tip>
      <Tip content={<div><TipHead name={L(d.resource)} hint={t('x_loc_resource_hint')} />{d.market && <div class="breakdown"><div class="bd-row"><span>{t('market')}</span><span>{d.market.name}</span></div><div class="bd-row"><span>{t('price')}</span><span>{num(d.market.price, 2)}</span></div></div>}</div>}><span class="chip"><small>{t('resource')}</small>{L(d.resource)}</span></Tip>
      {d.food && <Tip content={<FoodTip f={d.food} />}><span class={`chip ${d.food.security !== null && d.food.security < d.food.famine ? 'neg' : ''}`}><small>{t('x_food')}</small>{num(d.food.store / d.food.need, 1)} {t('months')}</span></Tip>}
      {d.access && <Tip content={<AccessTip a={d.access} market={d.market?.name} />}><span class={`chip ${d.access.access < 0.6 ? 'neg' : ''}`}><small>{t('x_mkt_access')}</small>{pct(d.access.access, 0)}</span></Tip>}
    </div>
    <div class="grid2">
      <Row k={t('development')} v={num(d.dev, 1)} tip={() => <DevTip d={d} />} />
      <Row k={t('population')} v={num(pop)} tip={<div><TipHead name={t('population')} value={num(pop)} /><div class="breakdown">{d.pops.filter((p: any) => p.pop > 0.5).map((p: any) => <div class="bd-row"><span>{L(p.name)}</span><span>{num(p.pop)}</span></div>)}</div></div>} />
      <Row k={t('tax')} v={<>{num(d.tax, 1)} <i class="ic gold sm" /></>} tip={() => <TaxTip d={d} />} />
      <Row k={t('control')} v={pct(d.control)} tip={() => <ControlTip d={d} />} />
      <Row k={t('integration')} v={pct(d.integ)} tip={() => <IntegTip d={d} />} />
      <Migration d={d} />
      <Row k={t('unrest')} v={<span class={d.unrest > 10 ? 'neg' : d.unrest > 4 ? 'warn' : ''}>{num(d.unrest, 1)}</span>} tip={() => <div><TipHead name={t('unrest')} value={num(d.unrest, 1)} hint={t('unrest_hint')} /><Parts title={t('x_target_from')} rows={d.unrestWhy} total={unrestTotal} totalLabel={t('x_target')} bad /><Drift target={Math.max(0, unrestTotal)} monthly={Math.min(100, Math.max(0, d.unrest * 0.7 + unrestTotal * 0.3)) - d.unrest} bad /><div class="muted small">{t('x_unrest_drift')}</div></div>} />
      <Row k={t('literacy')} v={pct(d.literacy)} tip={() => <div><TipHead name={t('literacy')} value={pct(d.literacy, 1)} /><Parts title={t('x_target_from')} rows={d.why.litParts} total={d.why.litTarget} totalLabel={t('x_target')} fmt={(v) => `${v >= 0 ? '+' : ''}${num(v * 100, 1)} %`} /><Drift monthly={(d.why.litTarget - d.literacy) * 0.01 * 100} digits={2} fmt={(v) => `${v >= 0 ? '+' : ''}${num(v, 2)} %`} /><div class="muted small">{t('x_lit_drift')}</div></div>} />
      <Row k={t('harvest')} v={<span class={d.harvest < 0.8 ? 'neg' : d.harvest > 1.1 ? 'pos' : ''}>{pct(d.harvest)}</span>} tip={<div><TipHead name={t('harvest')} value={pct(d.harvest)} hint={t('harvest_hint')} /></div>} />
      <Row k={t('garrison')} v={num(d.garrison)} tip={<div><TipHead name={t('garrison')} value={num(d.garrison)} hint={t('x_garrison_hint')} /></div>} />
      {d.plague > 0.01 && <Row k={t('plague')} v={<span class="neg">{pct(d.plague)}</span>} tip={t('plague_hint')} />}
      {d.snow > 0.05 && <Row k={t('snow')} v={pct(d.snow)} tip={t('snow_hint')} />}
      {d.devast > 0.01 && <Row k={t('devastation')} v={<span class="neg">{pct(d.devast)}</span>} tip={<div><TipHead name={t('devastation')} value={pct(d.devast)} hint={t('x_devast_hint')} /></div>} />}
    </div>
    {d.landmark && <Landmark d={d} own={own} refresh={refresh} />}
    <LocWar d={d} refresh={refresh} />

    <Section title={t('population')} id="loc-pop">
      <table class="tbl pops">
        <thead><tr><th>{t('class')}</th><th class="r">{t('people')}</th><th>{t('standard_of_living')}</th><th class="r">{t('wealth')}</th></tr></thead>
        <tbody>{d.pops.filter((p: any) => p.pop > 0.5).map((p: any) => <tr>
          <td>{L(p.name)}</td><td class="r"><Tip content={<div><TipHead name={L(p.name)} value={num(p.pop)} /><div class="breakdown"><div class="bd-row"><span>{t('x_share_here')}</span><span>{pct(p.pop / Math.max(1, pop), 1)}</span></div></div></div>}>{num(p.pop)}</Tip></td>
          <td><Bar value={p.sol} color={solColor(p.sol)} tip={<div><b>{t('standard_of_living')}</b> {pct(p.sol)}<div class="muted">{t('sol_hint')}</div></div>} /></td>
          <td class="r"><Tip content={<div>{t('wealth_hint')}<br />{num(p.wealth, 2)} × {num(p.pop)} = {num(p.wealth * p.pop)}</div>}>{num(p.wealth, 1)}</Tip></td>
        </tr>)}</tbody>
      </table>
    </Section>

    {own && <Buildings d={d} refresh={refresh} />}
    {own && <ScopeOrders loc={d.id} />}
    {!own && d.owner >= 0 && <Section title={t('buildings')} id="loc-bld-other" open={false}>
      <div class="chips">{d.buildings.filter((b: any) => b.level > 0).map((b: any) => <Tip content={L(b.desc)}><span class="chip">{L(b.name)} {b.level > 1 ? b.level : ''}</span></Tip>)}{!d.buildings.some((b: any) => b.level > 0) && <span class="muted">{t('none')}</span>}</div>
    </Section>}
    {own && <Workshops d={d} refresh={refresh} />}
    {own && <Recruit d={d} refresh={refresh} />}
    {own && <Agents d={d} refresh={refresh} />}
    {d.owner < 0 && pid >= 0 && <Section title={t('colonize')} id="loc-col">
      {d.colony ? <div>{t('colony_under_way')}: <NLink id={d.colony.nation} size={14} /> · {num(d.colony.settlers)} {t('settlers')}</div>
        : <div class="act-row"><span class="muted">{d.canColonize ? t('cannot_colonize') : t('colonize_hint')}</span><Btn disabled={d.canColonize} onClick={() => act({ t: 'colonize', loc: d.id }, 'build', t('colony_started')).then(refresh)}>{t('colonize')}</Btn></div>}
    </Section>}
    {d.armies.length > 0 && <Section title={t('armies_here')} id="loc-armies">
      {d.armies.map((a: any) => <div class="kv army-here"><span class="k"><NLink id={a.owner} size={14} name={false} /> {a.owner === pid ? <a class="lk" onClick={() => selectArmy(a.id)}>{L(a.name)}</a> : <span>{L(a.name)}</span>}{a.mercenary && <small class="muted"> ({t('mercenary')})</small>}</span><Tip content={<div><TipHead name={L(a.name)} value={`${num(a.men)} ${a.fleet ? t('ships') : t('men')}`} hint={a.fleet ? t('x_fleet_men_hint') : t('x_army_men_hint')} /></div>}><span class="v">{num(a.men)} {a.fleet ? t('ships') : t('men')}</span></Tip></div>)}
    </Section>}
  </Panel>;
}

function SeaPanel({ d, close }: { d: any; close: () => void }) {
  const pid = playerId.value;
  return <Panel cls="loc-pnl" onClose={close} title={d.name} sub={t('sea_zone')} coa={<div class="coa-sea">≈</div>}>
    <Section title={t('fleets')} id="sea-fleets">
      {d.fleets.length ? d.fleets.map((f: any) => <div class="kv army-here"><span class="k"><NLink id={f.owner} size={16} name={false} /> {f.owner === pid ? <a class="lk" onClick={() => selectArmy(f.id)}>{L(f.name)}</a> : <span>{L(f.name)}</span>}</span><span class="v">{num(f.ships)} {t('ships')}</span></div>) : <Empty>{t('no_fleets')}</Empty>}
    </Section>
  </Panel>;
}

function Landmark({ d, own, refresh }: { d: any; own: boolean; refresh: () => void }) {
  const m = d.landmark; const treasury = view.value?.player?.treasury ?? 0;
  const why = m.tier >= m.max ? 'fully built' : m.work ? 'already building' : d.ctrl !== d.owner ? 'occupied' : treasury < m.cost ? 'not enough gold' : null;
  return <Section title={t('landmark')} id="loc-landmark">
    <div class="landmark">
      <div class="lm-head"><b>{L(m.name)}</b><span class="pips">{Array.from({ length: m.max }, (_, i) => <i class={i < m.tier ? 'on' : i === m.tier && m.work ? 'q' : ''} />)}</span></div>
      <div class="muted small">{L(m.desc)}</div>
      <div class="grid2">
        <Row k={t('landmark_stage')} v={`${m.tier} / ${m.max}`} tip={<div><TipHead name={t('landmark_stage')} value={`${m.tier} / ${m.max}`} hint={t('x_landmark_stage_hint')} /></div>} />
        <Row k={t('prestige')} v={`+${num(m.prestige, 2)} / ${t('month')}`} tip={<div><TipHead name={t('prestige')} value={`+${num(m.prestige, 2)}`} hint={t('x_landmark_prestige_hint')} /></div>} />
      </div>
      <Tip tag="div" content={<div><TipHead name={t('landmark_holder_gets')} hint={t('x_landmark_fx_hint')} /></div>}><Effects fx={m.fx} title={t('landmark_holder_gets')} /></Tip>
      {m.work > 0 && <div class="muted small">{t('landmark_building')}: {daysText(m.work - (view.value?.day ?? 0))}</div>}
      {own && m.next && !m.work && <div class="act-row">
        <Tip content={<Effects fx={m.next} title={t('landmark_next')} />}><span class="muted small">{t('landmark_next')} · {m.months} {t('months')}</span></Tip>
        <span class="spacer" />
        <Btn disabled={why} onClick={() => act({ t: 'landmark', id: m.id }, 'build').then(refresh)}>{num(m.cost)} <i class="ic gold sm" /></Btn>
      </div>}
    </div>
  </Section>;
}

function Buildings({ d, refresh }: { d: any; refresh: () => void }) {
  const treasury = view.value?.player?.treasury ?? 0;
  const under = d.buildings.reduce((p: number, b: any) => p + b.queued.length, 0);
  return <Section title={t('buildings')} id="loc-bld" right={under ? <span class="muted">{under}/2 {t('under_way')}</span> : undefined}>
    <div class="blist">{d.buildings.filter((b: any) => b.allowed).map((b: any) => {
      const full = b.level + b.queued.length >= b.max;
      const why = full ? 'fully built' : under >= 2 ? 'two works already under way here' : treasury < b.cost ? 'not enough gold' : null;
      return <div class={`bitem ${b.level ? 'has' : ''}`}>
        <Tip content={() => <div><TipHead name={L(b.name)} value={`${b.level}/${b.max}`} hint={L(b.desc)} /><BuildCost b={b} /></div>}>
          <span class="bname">{L(b.name)}</span>
        </Tip>
        <span class="pips">{Array.from({ length: b.max }, (_, i) => <i class={i < b.level ? 'on' : i < b.level + b.queued.length ? 'q' : ''} />)}</span>
        {b.queued.length > 0 && <span class="muted small">{daysText(b.queued[0])}</span>}
        {!full && <Btn disabled={why} tip={() => <div><TipHead name={L(b.name)} value={`${t('level')} ${b.level + b.queued.length + 1}`} /><BuildCost b={b} /></div>} onClick={() => act({ t: 'build', loc: d.id, building: b.id }, 'build').then(refresh)}>{num(b.cost)}</Btn>}
      </div>;
    })}</div>
  </Section>;
}

function Workshops({ d, refresh }: { d: any; refresh: () => void }) {
  const era = view.value?.player?.era ?? 0;
  const lvl = d.buildings.find((b: any) => b.key === 'workshop')?.level ?? 0;
  const opts = RECIPES.map((r, k) => ({ k, r })).filter((x) => (x.r.minEra ?? 0) <= era);
  return <Section title={t('workshops')} id="loc-ws" open={false}
    right={d.methods?.length ? <a class="more" onClick={() => openPanel('works', { tab: 'methods' })}>{t('x_w_methods_all')}</a> : undefined}>
    <Methods d={d} refresh={refresh} />
    {[0, 1, 2].map((slot) => {
      const open = slot < 1 + lvl; const cur = d.workshops[slot];
      return <div class="act-row">
        <Tip content={<div><TipHead name={`${t('slot')} ${slot + 1}`} hint={t('x_workshop_slot_hint')} /></div>}><span class="k">{t('slot')} {slot + 1}</span></Tip>
        {open ? <select value={cur ? cur.recipe : -1} onChange={(e) => act({ t: 'workshop', loc: d.id, slot, recipe: Number((e.target as HTMLSelectElement).value) }).then(refresh)}>
          <option value={-1}>— {t('idle')} —</option>
          {opts.map((o) => <option value={o.k}>{L(o.r.name)}</option>)}
        </select> : <span class="muted">{t('needs_workshops')}</span>}
      </div>;
    })}
  </Section>;
}

function Recruit({ d, refresh }: { d: any; refresh: () => void }) {
  const p = view.value?.player;
  const [merc, setMerc] = useState(3000);
  const land = d.units.filter((u: any) => u.kind !== 'ship');
  const ships = d.units.filter((u: any) => u.kind === 'ship');
  const hasPort = (d.buildings.find((b: any) => b.key === 'port')?.level ?? 0) > 0;
  const occupied = d.ctrl !== d.owner;
  // price and breakdown come from the simulation (mercenaryCostParts)
  const mercs: any[] = d.mercenaries ?? [];
  const mc = mercs.find((x) => x.men === merc) ?? mercs[0];
  const mercCost = mc?.total ?? 0;
  return <Section title={t('recruit')} id="loc-rec">
    {occupied && <div class="neg small">{t('occupied')}</div>}
    <div class="ulist">{land.map((u: any) => {
      const why = occupied ? 'occupied' : (p?.treasury ?? 0) < u.cost1000 ? 'not enough gold' : (p?.manpower ?? 0) < 1000 ? 'not enough manpower' : null;
      const U = UNITS[u.id];
      return <div class="uitem">
        <Tip content={<div><b>{L(u.name)}</b><div class="muted">{t('shock')} {U.shock} · {t('fire')} {U.fire} · {t('defence')} {U.def} · {t('morale')} {U.morale}</div><div>{t('x_upkeep_per1000').replace('{v}', num(u.upkeep ?? 0, 1))}</div></div>}><span class="uname">{L(u.name)}</span></Tip>
        <Btn disabled={why} tip={<div>1000 {t('men')} · {num(u.cost1000)} <i class="ic gold sm" /></div>} onClick={() => act({ t: 'recruit', loc: d.id, unit: u.id, men: 1000 }, 'coins', t('recruiting')).then(refresh)}>+1000 · {num(u.cost1000)}</Btn>
      </div>;
    })}</div>
    {ships.length > 0 && <div class="ulist">{ships.map((u: any) => {
      const why = !hasPort ? 'needs a harbour' : occupied ? 'occupied' : (p?.treasury ?? 0) < u.cost1000 * 2 ? 'not enough gold' : (p?.sailors ?? 0) < 100 ? 'not enough sailors' : null;
      return <div class="uitem"><Tip content={<div><b>{L(u.name)}</b><div>{t('x_upkeep_per_ship').replace('{v}', num(u.upkeep ?? 0, 1))}</div></div>}><span class="uname">⚓ {L(u.name)}</span></Tip><Btn disabled={why} tip={<div>2 {t('ships')} · {num(u.cost1000 * 2)}</div>} onClick={() => act({ t: 'recruit', loc: d.id, unit: u.id, men: 2 }, 'coins', t('recruiting')).then(refresh)}>+2 · {num(u.cost1000 * 2)}</Btn></div>;
    })}</div>}
    <div class="act-row merc">
      <span class="k">{t('mercenaries')}</span>
      <select value={merc} onChange={(e) => setMerc(Number((e.target as HTMLSelectElement).value))}>{mercs.map((m) => <option value={m.men}>{num(m.men)} {t('men')} · {num(m.total)}</option>)}</select>
      <Btn disabled={!mc ? 'none' : (p?.treasury ?? 0) < mercCost ? 'not enough gold' : null} tip={() => <div>{t('merc_hint')}{mc && <MercBreakdown m={mc} />}</div>} onClick={() => act({ t: 'mercs', loc: d.id, company: mc?.men ?? merc }, 'coins', t('mercs_hired')).then(refresh)}>{num(mercCost)} <i class="ic gold sm" /></Btn>
    </div>
  </Section>;
}

/** Mercenary price: base × price level × (1 + modifiers), as in the simulation. */
function MercBreakdown({ m }: { m: any }) {
  return <div class="breakdown">
    <div class="bd-row"><span>{t('merc_base')}</span><span>{num(m.base, 1)}</span></div>
    <div class="bd-row"><span>{t('merc_price_level')}</span><span>× {num(m.priceLevel, 2)}</span></div>
    {Math.abs(m.modifier) > 1e-6 && <div class="bd-row"><span>{t('merc_modifiers')}</span><span class={m.modifier > 0 ? 'neg' : 'pos'}>× {num(1 + m.modifier, 2)} ({signed(m.modifier * 100, 0)} %)</span></div>}
    <div class="bd-row bd-total"><span>Σ</span><span>{num(m.total, 1)} <i class="ic gold sm" /></span></div>
  </div>;
}

function Agents({ d, refresh }: { d: any; refresh: () => void }) {
  const me = nations.value[playerId.value]; const r = realm.value;
  if (!me) return null;
  const busy = r ? r.agents.length >= r.agentSlots : false;
  const cost = 15 * (r?.priceLevel ?? 1) * (1 + d.dev / 20);
  const here = (k: string) => d.agents.find((a: any) => a.kind === k);
  const row = (kind: 'faith' | 'culture') => {
    const a = here(kind);
    return <div class="act-row">
      <span class="k">{kind === 'faith' ? t('convert') : t('assimilate')}</span>
      {a ? <><Bar value={a.progress} max={100} color="#3a5a80" /><span class="muted small">{num(a.progress)} %</span></>
        : <Btn disabled={busy ? 'no free preachers or officials' : null} tip={<div><TipHead name={kind === 'faith' ? t('convert') : t('assimilate')} value={num(cost)} hint={kind === 'faith' ? t('convert_hint') : t('assimilate_hint')} /><Parts rows={[['x_agent_base', 15], ['x_price_level', r?.priceLevel ?? 1], ['x_agent_dev', 1 + d.dev / 20]]} product base={(v) => num(v, 0)} total={cost} totalLabel={t('cost')} /></div>}
          onClick={() => act({ t: 'agent', loc: d.id, kind }, 'click', t('agent_sent')).then(refresh)}>{num(cost)}</Btn>}
    </div>;
  };
  return <Section title={t('agents')} id="loc-ag" open={false} right={r ? <Tip content={() => <AgentsTip />}><span class="muted has-tip">{r.agents.length}/{r.agentSlots}</span></Tip> : undefined}>
    {row('faith')}{row('culture')}
    <div class="muted small">{t('agents_hint')}</div>
  </Section>;
}
void signed; void sfx;

// ---------------------------------------------------------------- explained numbers of a location (data from view.ts locExplain)
function DevTip({ d }: { d: any }) {
  const w = d.why;
  return <div>
    <TipHead name={t('development')} value={num(d.dev, 1)} hint={t('dev_hint')} />
    <Parts title={t('x_target_from')} rows={w.devF} product base={(v) => num(v, 2)} total={w.devTarget} totalLabel={t('x_target')} />
    <Drift target={w.devTarget} monthly={(w.devTarget - d.dev) * 0.02} digits={2} />
    <div class="muted small">{t('x_dev_drift')}</div>
    {d.econ && <Parts title={t('x_output_now')} rows={[['grain', d.econ.grain], ['raw_output', d.econ.rgo], ['crafts', d.econ.craft]]} fmt={(v) => num(v, 1)} />}
  </div>;
}
function TaxTip({ d }: { d: any }) {
  const w = d.why;
  if (!w.taxes.length) return <div><TipHead name={t('tax_income')} value={num(d.tax, 2)} /></div>;
  const pops = d.pops as any[];
  return <div>
    <TipHead name={t('tax_income')} value={`${num(d.tax, 2)} / ${t('month')}`} hint={t('x_loc_tax_hint')} />
    <Parts title={t('x_rate')} rows={w.taxes.filter((x: any) => pops[x.cls]?.pop > 0.5).map((x: any) => [L(pops[x.cls].name), x.rate] as [string, number])} fmt={(v) => `${num(v * 100, 1)} %`} />
    <div class="breakdown">
      <div class="bd-row"><span>{t('x_control')}</span><span>× {num(d.control, 2)}</span></div>
      <div class="bd-row"><span>{t('x_crown_share')}</span><span>× {num(w.crownShare * 100, 0)} %</span></div>
      {d.econ && <div class="bd-row"><span>{t('local_income')}</span><span>{num(d.econ.income, 1)}</span></div>}
    </div>
    {w.occupied && <div class="neg small">{t('x_occupied_tax')}</div>}
  </div>;
}
function ControlTip({ d }: { d: any }) {
  const w = d.why;
  const reach = w.reach.reduce((p: number, r: any) => p + r[1], 0);
  return <div>
    <TipHead name={t('control')} value={pct(d.control, 1)} hint={t('control_hint')} />
    {w.reach.length > 0 && <Parts title={t('x_reach')} rows={w.reach} total={reach} totalLabel="km" fmt={(v) => `${v >= 0 ? '+' : ''}${num(v, 0)}`} />}
    <div class="muted small">{t('x_control_formula')}</div>
    {w.occupied && <div class="neg small">{t('x_occupied_control')}</div>}
  </div>;
}
function IntegTip({ d }: { d: any }) {
  const w = d.why;
  const m = w.integMonthly; const left = 1 - d.integ;
  return <div>
    <TipHead name={t('integration')} value={pct(d.integ, 1)} hint={t('integration_hint')} />
    {w.integ.length > 0 && d.integ < 1 && <><Parts title={t('x_gain_per_month')} rows={w.integ} product base={(v) => `${num(v, 2)} %`} total={m * 100} totalLabel="%" />
      {m > 0 && <div class="tip-drift"><span>{t('x_full_in')} <b>{Math.ceil(left / m)}</b> {t('months')}</span></div>}</>}
    {d.integ < 1 && w.integYield !== undefined && <div class="tip-drift"><span>{t('x_integ_yield')}</span><span class="neg">× {num(w.integYield, 2)}</span></div>}
  </div>;
}
function BuildCost({ b }: { b: any }) {
  const r = realm.value; const inf = view.value?.player?.inflation ?? 0;
  const base = (BUILDINGS[b.id]?.cost ?? 0) * 6;
  const rest = base * (1 + b.level * 0.5) * (r?.priceLevel ?? 1) * (1 + inf);
  return <div>
    <Parts rows={[['x_build_base', base], ['x_build_level', 1 + b.level * 0.5], ['x_price_level', r?.priceLevel ?? 1], ['inflation', 1 + inf], ['x_fort_law', rest > 0 ? b.cost / rest : 1]]} product base={(v) => num(v, 0)} total={b.cost} totalLabel={t('cost')} />
    <div class="muted small">{b.months} {t('months')} · {t('x_two_works')}</div>
    {b.mats && <MatsTip m={b.mats} />}
  </div>;
}

export function regionName(id: string): string { const v = t('reg_' + id); return v.startsWith('reg_') ? id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : v; }

/** Market access of a place (src/sim/systems/access.ts) and what it does. */
function AccessTip({ a, market }: { a: any; market?: string }) {
  return <div>
    <TipHead name={t('x_mkt_access')} value={pct(a.access, 0)} hint={t('x_access_hint').replace('{m}', market ? placeName(market) : '—').replace('{r}', num(a.range)).replace('{min}', pct(a.min, 0))} />
    <div class="breakdown">
      <div class="bd-row"><span>{t('x_access_way')}</span><span>{num(a.cost)} km</span></div>
      <div class="bd-row"><span>{t('x_access_sales')}</span><span>× {num(a.farmgate, 2)}</span></div>
      <div class="bd-row"><span>{t('x_access_reach')}</span><span>× {num(a.reaching, 2)}</span></div>
      <div class="bd-row"><span>{t('x_access_buy')}</span><span>× {num(a.markup, 2)}</span></div>
    </div>
    <div class="muted small">{t('x_access_roads').replace('{r}', pct(a.roadCut, 0)).replace('{c}', pct(a.canalCut, 0))}</div>
  </div>;
}

/** The grain stores of a place and its food security. */
function FoodTip({ f }: { f: any }) {
  return <div>
    <TipHead name={t('x_food')} value={`${num(f.store / f.need, 1)} / ${num(f.months, 1)} ${t('months')}`} hint={t('x_food_hint').replace('{p}', pct(f.put, 0)).replace('{s}', pct(f.spoil, 0))} />
    <div class="breakdown">
      <div class="bd-row"><span>{t('x_food_store')}</span><span>{num(f.store)}</span></div>
      <div class="bd-row"><span>{t('x_food_cap')}</span><span>{num(f.cap)}</span></div>
      <div class="bd-row"><span>{t('x_food_need')}</span><span>{num(f.need)}</span></div>
      {f.security !== null && <div class={`bd-row ${f.security < f.famine ? 'neg' : ''}`}><span>{t('x_food_security')}</span><span>{pct(f.security, 0)}</span></div>}
    </div>
    {f.security !== null && f.security < f.famine && <div class="neg small">{t('x_famine_now')}</div>}
    <div class="muted small">{t('x_food_cap_rule')}</div>
  </div>;
}
