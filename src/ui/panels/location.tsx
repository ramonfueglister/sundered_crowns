// Location panel: everything about one land location or sea zone, with building, recruiting and agents.
import { useState } from 'preact/hooks';
import { nations, view } from '../../game/client';
import { selectedLoc, playerId } from '../store';
import { RECIPES, UNITS } from '../../sim/defs';
import { Panel, Section, Row, Bar, NLink, Btn, Empty, Reasons, useQuery, act, t, L, lang, num, pct, signed, Tip, Coa, daysText, realm, selectArmy } from './common';
import { sfx } from '../audio';

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
  if (d.sea) return <SeaPanel d={d} close={close} />;
  const pid = playerId.value;
  const own = d.owner === pid && pid >= 0;
  const owner = nations.value[d.owner];
  const ctrlN = d.ctrl >= 0 && d.ctrl !== d.owner ? nations.value[d.ctrl] : null;
  const pop = d.pops.reduce((p: number, x: any) => p + x.pop, 0);
  const unrestTotal = d.unrestWhy.reduce((p: number, x: [string, number]) => p + x[1], 0);
  return <Panel cls="loc-pnl" onClose={close}
    coa={owner ? <Coa coa={owner.coa} color={owner.color} size={44} /> : <div class="coa-empty" />}
    title={<>{d.name}{d.alt && d.alt !== d.name && <small class="alt"> ({d.alt})</small>}</>}
    sub={[d.province, d.area, d.region && regionName(d.region)].filter(Boolean).join(' · ')}>
    <div class="loc-owner">
      {owner ? <NLink id={d.owner} size={20} full /> : <span class="muted">{t('unclaimed')}</span>}
      {d.ctrl === -2 && <span class="tag neg">{t('rebels_hold')}</span>}
      {ctrlN && <span class="tag neg">{t('occupied_by')} <NLink id={d.ctrl} size={14} /></span>}
      {d.core >= 0 && d.core !== d.owner && <span class="tag">{t('core_of')} <NLink id={d.core} size={14} /></span>}
    </div>
    <div class="grid2">
      <Row k={t('terrain')} v={<>{terrainName(d.terrain)}{d.coastal && <span class="muted"> · {t('coastal')}</span>}</>} tip={<div>{t('elevation')}: {num(d.elev)} m · {num(d.lat, 1)}° {num(d.lon, 1)}°</div>} />
      <Row k={t('development')} v={num(d.dev, 1)} tip={d.econ ? <div class="breakdown"><div class="bd-title">{t('development')}</div><div class="bd-row"><span>{t('grain')}</span><span>{num(d.econ.grain, 1)}</span></div><div class="bd-row"><span>{t('raw_output')}</span><span>{num(d.econ.rgo, 1)}</span></div><div class="bd-row"><span>{t('crafts')}</span><span>{num(d.econ.craft, 1)}</span></div><div class="muted">{t('dev_hint')}</div></div> : t('dev_hint')} />
      <Row k={t('culture')} v={L(d.culture)} tip={<div>{t('culture_group')}: {d.cultureGroup ?? '—'}</div>} />
      <Row k={t('faith')} v={L(d.faith)} />
      {d.minority && <Row k={t('minority')} v={<>{L(d.minority.culture)} / {L(d.minority.faith)}</>} tip={<div>{pct(d.minority.share)} {t('of_population')}</div>} cls="span2" />}
      <Row k={t('population')} v={num(pop)} tip={<div class="breakdown">{d.pops.map((p: any) => <div class="bd-row"><span>{L(p.name)}</span><span>{num(p.pop)}</span></div>)}</div>} />
      <Row k={t('tax')} v={<>{num(d.tax, 1)} <i class="ic gold sm" /></>} tip={d.econ ? <div><b>{t('tax_income')}</b><div>{num(d.tax, 2)} / {t('month')}</div><div class="muted">{t('local_income')}: {num(d.econ.income, 1)}</div></div> : t('tax_income')} />
      <Row k={t('control')} v={pct(d.control)} tip={<div><b>{t('control')}</b><div class="muted">{t('control_hint')}</div></div>} />
      <Row k={t('integration')} v={pct(d.integ)} tip={<div><b>{t('integration')}</b><div class="muted">{t('integration_hint')}</div></div>} />
      <Row k={t('unrest')} v={<span class={d.unrest > 10 ? 'neg' : d.unrest > 4 ? 'warn' : ''}>{num(d.unrest, 1)}</span>} tip={() => <><Reasons title={t('unrest')} rows={d.unrestWhy} total={unrestTotal} /><div class="muted">{t('unrest_hint')}</div></>} />
      <Row k={t('literacy')} v={pct(d.literacy)} />
      <Row k={t('harvest')} v={<span class={d.harvest < 0.8 ? 'neg' : d.harvest > 1.1 ? 'pos' : ''}>{pct(d.harvest)}</span>} tip={t('harvest_hint')} />
      <Row k={t('garrison')} v={num(d.garrison)} />
      {d.plague > 0.01 && <Row k={t('plague')} v={<span class="neg">{pct(d.plague)}</span>} tip={t('plague_hint')} />}
      {d.snow > 0.05 && <Row k={t('snow')} v={pct(d.snow)} tip={t('snow_hint')} />}
      {d.devast > 0.01 && <Row k={t('devastation')} v={<span class="neg">{pct(d.devast)}</span>} />}
      <Row k={t('resource')} v={L(d.resource)} tip={d.market ? <div>{t('market')}: {d.market.name}<br />{t('price')}: {num(d.market.price, 2)}</div> : undefined} />
    </div>
    {d.siege && <div class="siege-box"><b>{t('siege')}</b> · <NLink id={d.siege.nation} size={14} /> · {num(d.siege.progress)} % <Bar value={d.siege.progress} max={100} color="#9b2a20" /></div>}

    <Section title={t('population')} id="loc-pop">
      <table class="tbl pops">
        <thead><tr><th>{t('class')}</th><th class="r">{t('people')}</th><th>{t('standard_of_living')}</th><th class="r">{t('wealth')}</th></tr></thead>
        <tbody>{d.pops.filter((p: any) => p.pop > 0.5).map((p: any) => <tr>
          <td>{L(p.name)}</td><td class="r">{num(p.pop)}</td>
          <td><Bar value={p.sol} color={solColor(p.sol)} tip={<div><b>{t('standard_of_living')}</b> {pct(p.sol)}<div class="muted">{t('sol_hint')}</div></div>} /></td>
          <td class="r"><Tip content={<div>{t('wealth_hint')}<br />{num(p.wealth, 2)} × {num(p.pop)} = {num(p.wealth * p.pop)}</div>}>{num(p.wealth, 1)}</Tip></td>
        </tr>)}</tbody>
      </table>
    </Section>

    {own && <Buildings d={d} refresh={refresh} />}
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
      {d.armies.map((a: any) => <div class="kv"><span class="k"><NLink id={a.owner} size={14} /></span><span class="v">{a.owner === pid ? <a class="lk" onClick={() => selectArmy(a.id)}>{num(a.men)} {a.fleet ? t('ships') : t('men')}</a> : <>{num(a.men)} {a.fleet ? t('ships') : t('men')}</>}</span></div>)}
    </Section>}
  </Panel>;
}

function SeaPanel({ d, close }: { d: any; close: () => void }) {
  const pid = playerId.value;
  return <Panel cls="loc-pnl" onClose={close} title={d.name} sub={t('sea_zone')} coa={<div class="coa-sea">≈</div>}>
    <Section title={t('fleets')} id="sea-fleets">
      {d.fleets.length ? d.fleets.map((f: any) => <div class="kv"><span class="k"><NLink id={f.owner} size={16} /></span><span class="v">{f.owner === pid ? <a class="lk" onClick={() => selectArmy(f.id)}>{num(f.ships)} {t('ships')}</a> : <>{num(f.ships)} {t('ships')}</>}</span></div>) : <Empty>{t('no_fleets')}</Empty>}
    </Section>
  </Panel>;
}

function Buildings({ d, refresh }: { d: any; refresh: () => void }) {
  const treasury = view.value?.player?.treasury ?? 0;
  const under = d.buildings.reduce((p: number, b: any) => p + b.queued.length, 0);
  return <Section title={t('buildings')} id="loc-bld" right={under ? <span class="muted">{under}/2 {t('under_way')}</span> : undefined}>
    <div class="blist">{d.buildings.filter((b: any) => b.allowed).map((b: any) => {
      const full = b.level + b.queued.length >= b.max;
      const why = full ? 'fully built' : under >= 2 ? 'two works already under way here' : treasury < b.cost ? 'not enough gold' : null;
      return <div class={`bitem ${b.level ? 'has' : ''}`}>
        <Tip content={<div><b>{L(b.name)}</b><div>{L(b.desc)}</div><div class="muted">{t('level')} {b.level}/{b.max} · {t('cost')} {num(b.cost)} · {b.months} {t('months')}</div></div>}>
          <span class="bname">{L(b.name)}</span>
        </Tip>
        <span class="pips">{Array.from({ length: b.max }, (_, i) => <i class={i < b.level ? 'on' : i < b.level + b.queued.length ? 'q' : ''} />)}</span>
        {b.queued.length > 0 && <span class="muted small">{daysText(b.queued[0])}</span>}
        {!full && <Btn disabled={why} tip={<div>{t('cost')}: {num(b.cost)} · {b.months} {t('months')}</div>} onClick={() => act({ t: 'build', loc: d.id, building: b.id }, 'build').then(refresh)}>{num(b.cost)}</Btn>}
      </div>;
    })}</div>
  </Section>;
}

function Workshops({ d, refresh }: { d: any; refresh: () => void }) {
  const era = view.value?.player?.era ?? 0;
  const lvl = d.buildings.find((b: any) => b.key === 'workshop')?.level ?? 0;
  const opts = RECIPES.map((r, k) => ({ k, r })).filter((x) => (x.r.minEra ?? 0) <= era);
  return <Section title={t('workshops')} id="loc-ws" open={false}>
    {[0, 1, 2].map((slot) => {
      const open = slot < 1 + lvl; const cur = d.workshops[slot];
      return <div class="act-row">
        <span class="k">{t('slot')} {slot + 1}</span>
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
  // mercenary price estimated from the price of regular infantry (same formula as the simulation)
  const ref = land.find((u: any) => u.kind === 'inf');
  const mercCost = ref ? (merc / 1000) * 18 * 3 * (ref.cost1000 / Math.max(1, UNITS[ref.id].cost)) : 0;
  return <Section title={t('recruit')} id="loc-rec">
    {occupied && <div class="neg small">{t('occupied')}</div>}
    <div class="ulist">{land.map((u: any) => {
      const why = occupied ? 'occupied' : (p?.treasury ?? 0) < u.cost1000 ? 'not enough gold' : (p?.manpower ?? 0) < 1000 ? 'not enough manpower' : null;
      const U = UNITS[u.id];
      return <div class="uitem">
        <Tip content={<div><b>{L(u.name)}</b><div class="muted">{t('shock')} {U.shock} · {t('fire')} {U.fire} · {t('defence')} {U.def} · {t('morale')} {U.morale}</div><div>{t('upkeep')}: {num(U.upkeep, 2)} / 1000 / {t('month')}</div></div>}><span class="uname">{L(u.name)}</span></Tip>
        <Btn disabled={why} tip={<div>1000 {t('men')} · {num(u.cost1000)} <i class="ic gold sm" /></div>} onClick={() => act({ t: 'recruit', loc: d.id, unit: u.id, men: 1000 }, 'coins', t('recruiting')).then(refresh)}>+1000 · {num(u.cost1000)}</Btn>
      </div>;
    })}</div>
    {ships.length > 0 && <div class="ulist">{ships.map((u: any) => {
      const why = !hasPort ? 'needs a harbour' : occupied ? 'occupied' : (p?.treasury ?? 0) < u.cost1000 * 2 ? 'not enough gold' : (p?.sailors ?? 0) < 100 ? 'not enough sailors' : null;
      return <div class="uitem"><span class="uname">⚓ {L(u.name)}</span><Btn disabled={why} tip={<div>2 {t('ships')} · {num(u.cost1000 * 2)}</div>} onClick={() => act({ t: 'recruit', loc: d.id, unit: u.id, men: 2 }, 'coins', t('recruiting')).then(refresh)}>+2 · {num(u.cost1000 * 2)}</Btn></div>;
    })}</div>}
    <div class="act-row merc">
      <span class="k">{t('mercenaries')}</span>
      <select value={merc} onChange={(e) => setMerc(Number((e.target as HTMLSelectElement).value))}>{[1000, 2000, 3000, 5000, 8000].map((m) => <option value={m}>{num(m)} {t('men')}</option>)}</select>
      <Btn disabled={(p?.treasury ?? 0) < mercCost ? 'not enough gold' : null} tip={<div>{t('merc_hint')}<br />≈ {num(mercCost)} <i class="ic gold sm" /></div>} onClick={() => act({ t: 'mercs', loc: d.id, company: merc }, 'coins', t('mercs_hired')).then(refresh)}>≈ {num(mercCost)}</Btn>
    </div>
  </Section>;
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
        : <Btn disabled={busy ? 'no free preachers or officials' : null} tip={<div>{kind === 'faith' ? t('convert_hint') : t('assimilate_hint')}<br />{t('cost')}: {num(cost)}</div>}
          onClick={() => act({ t: 'agent', loc: d.id, kind }, 'click', t('agent_sent')).then(refresh)}>{num(cost)}</Btn>}
    </div>;
  };
  return <Section title={t('agents')} id="loc-ag" open={false} right={r ? <span class="muted">{r.agents.length}/{r.agentSlots}</span> : undefined}>
    {row('faith')}{row('culture')}
    <div class="muted small">{t('agents_hint')}</div>
  </Section>;
}
void signed; void sfx;

export function regionName(id: string): string { const v = t('reg_' + id); return v.startsWith('reg_') ? id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : v; }
