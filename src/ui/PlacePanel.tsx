// The panel of the selected place: owner, people, land, harvest, the city's economy and its realm.
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { askPlace, claim, me, placeInfo, world } from '../net/client';
import type { CityEconomyDetail, Me, PlaceDetail, RealmInfo } from '../net/protocol';
import { fmtDate } from '../sim/calendar';
import { heads, index, kcalText, L, lang, num, pct, pounds, resourceName, t, type TextKey, terrainName } from './i18n';
import { IconClose } from './icons';
import { selectedPlace } from './mapstate';
import { realmById } from './realms';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** A share in percent: one decimal below 1 %, else whole. */
const share = (n: number, of: number) => {
  const p = (100 * n) / Math.max(1, of);
  return (p < 1 ? p.toFixed(1) : Math.round(p).toString()).replace('.', lang.value === 'de' ? ',' : '.');
};

/** the rows of a city's economy: the text of their label and how their value is written */
const ECONOMY_ROWS: [TextKey, (e: CityEconomyDetail) => string][] = [
  ['economy_gdp', (e) => pounds(e.realGdp)],
  ['economy_level', (e) => index(e.realGdpIndex)],
  ['economy_prices_today', (e) => index(e.priceToday)],
  ['economy_consumption', (e) => pounds(e.consumption)],
  ['economy_crown', (e) => pounds(e.crown)],
  ['economy_investment', (e) => pounds(e.investment)],
  ['economy_exports', (e) => pounds(e.exports)],
  ['economy_imports', (e) => pounds(e.imports)],
  ['economy_employed', (e) => num(e.employed)],
  ['economy_unemployed', (e) => num(e.unemployed)],
  ['economy_coin_households', (e) => pounds(e.coinHouseholds)],
  ['economy_coin_firms', (e) => pounds(e.coinFirms)],
];

export function PlacePanel() {
  const p = selectedPlace.value;
  useEffect(() => {
    placeInfo.value = null;
    askPlace(p);
  }, [p]);
  const d = placeInfo.value?.id === p ? placeInfo.value : null;
  const wi = world.value,
    day = wi?.day;
  // the economy of a city computes every day: an open panel that shows it asks again on each new day
  useEffect(() => {
    if (placeInfo.value?.id === p && placeInfo.value.cityEconomy) askPlace(p);
  }, [day]);
  const r = d && d.owner >= 0 ? realmById.value.get(d.owner) : undefined;
  return (
    <aside class="side pnl">
      <div class="side-head">
        <b>{d ? (lang.value === 'de' ? d.nameDe : d.name) : '…'}</b>
        <button
          type="button"
          class="close"
          title={t('close')}
          aria-label={t('close')}
          onClick={() => {
            selectedPlace.value = -1;
          }}
        >
          <IconClose />
        </button>
      </div>
      {d && <Facts d={d} r={r} />}
      {d?.harvest && <Harvest h={d.harvest} />}
      {d?.cityEconomy && wi && <CityEconomy e={d.cityEconomy} startYear={wi.startYear} />}
      {r && <Realm r={r} m={me.value} />}
    </aside>
  );
}

/** A row of a table of facts. */
function Row({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <tr>
      <th>{label}</th>
      <td>{children}</td>
    </tr>
  );
}

/** Owner, people, terrain and resource of the place. */
function Facts({ d, r }: { d: PlaceDetail; r: RealmInfo | undefined }) {
  return (
    <table class="facts">
      <tbody>
        <Row label={t('owner')}>
          {r ? (
            <>
              <i class="swatch" style={{ background: hex(r.color) }} />
              {L(r.name)}
            </>
          ) : (
            t('nobody')
          )}
        </Row>
        <Row label={t('population')}>{heads(d.pop)}</Row>
        {d.peoples && d.peoples.length > 1 ? (
          <Row label={t('culture')}>
            {d.peoples.map((x) => `${L(x.culture)}, ${L(x.faith)} ${share(x.persons, d.pop)} %`).join(' · ')}
          </Row>
        ) : (
          <>
            <Row label={t('culture')}>{L(d.culture)}</Row>
            <Row label={t('faith')}>{L(d.faith)}</Row>
          </>
        )}
        <Row label={t('terrain')}>{terrainName(d.terrain)}</Row>
        <Row label={t('resource')}>{resourceName(d.resource)}</Row>
      </tbody>
    </table>
  );
}

/** The place's harvest, and its cultivated land where the land register knows it. */
function Harvest({ h }: { h: NonNullable<PlaceDetail['harvest']> }) {
  const arable = h.arable;
  return (
    <div class="section">
      <h3>{t('harvest')}</h3>
      <table class="facts">
        <tbody>
          <Row label={t('harvest_year')}>{kcalText(h.kcal)}</Row>
          <Row label={t('harvest_head')}>{num(h.perHeadDay)} kcal</Row>
          <Row label={t('harvest_land')}>{num(h.hectares)} ha</Row>
          {arable ? (
            <>
              <Row label={t('arable')}>
                {num(arable.hectares)} ha ({pct(arable.share)})
              </Row>
              <Row label={t('arable_state')}>
                {t(arable.hectares <= 0 ? 'arable_none' : arable.atLimit ? 'arable_limit' : 'arable_free')}
              </Row>
              <Row label={t('arable_yield')}>{arable.landYield === null ? '–' : num(arable.landYield)}</Row>
            </>
          ) : (
            <Row label={t('harvest_yield')}>{h.landYield === null ? t('no_data') : num(h.landYield)}</Row>
          )}
          <Row label={t('harvest_farmers')}>{heads(h.farmers)}</Row>
        </tbody>
      </table>
    </div>
  );
}

/** The city as an economy of its own, over the last year up to the day it was reckoned. */
function CityEconomy({ e, startYear }: { e: CityEconomyDetail; startYear: number }) {
  return (
    <div class="section">
      <h3>{t('economy_city')}</h3>
      <p class="muted">{t('economy_note_city', { date: fmtDate(e.day, startYear, lang.value) })}</p>
      {e.halted && <p class="muted">{t('economy_halted', { why: e.halted })}</p>}
      <table class="facts">
        <tbody>
          {ECONOMY_ROWS.map(([label, value]) => (
            <Row key={label} label={t(label)}>
              {value(e)}
            </Row>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The realm that holds the place, and the button to take up its crown where nobody plays it. */
function Realm({ r, m }: { r: RealmInfo; m: Me | null }) {
  return (
    <div class="section">
      <h3>{L(r.name)}</h3>
      <p>
        {t('places')}: {num(r.places)}
      </p>
      <p>
        {t('ruled_by')}: {r.ruler ?? <span class="muted">{t('no_player')}</span>}
      </p>
      {!r.ruler && m && m.realm < 0 && !m.observer && (
        <button type="button" class="btn big gold" onClick={() => claim(r.id)}>
          {t('claim')}
        </button>
      )}
    </div>
  );
}
