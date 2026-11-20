// The panel of the selected place: owner, people, land, harvest, the city's economy and its realm.
import { useEffect } from 'preact/hooks';
import { askPlace, claim, me, placeInfo, world } from '../net/client';
import { fmtDate } from '../sim/calendar';
import { heads, index, kcalText, L, lang, num, pct, pounds, resourceName, t, terrainName } from './i18n';
import { IconClose } from './icons';
import { selectedPlace } from './mapstate';
import { realmById } from './realms';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** A share in percent: one decimal below 1 %, else whole. */
const share = (n: number, of: number) => {
  const p = (100 * n) / Math.max(1, of);
  return (p < 1 ? p.toFixed(1) : Math.round(p).toString()).replace('.', lang.value === 'de' ? ',' : '.');
};

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
  const m = me.value;
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
      {d && (
        <table class="facts">
          <tbody>
            <tr>
              <th>{t('owner')}</th>
              <td>
                {r ? (
                  <>
                    <i class="swatch" style={{ background: hex(r.color) }} />
                    {L(r.name)}
                  </>
                ) : (
                  t('nobody')
                )}
              </td>
            </tr>
            <tr>
              <th>{t('population')}</th>
              <td>{heads(d.pop)}</td>
            </tr>
            {d.peoples && d.peoples.length > 1 ? (
              <tr>
                <th>{t('culture')}</th>
                <td>
                  {d.peoples.map((x) => `${L(x.culture)}, ${L(x.faith)} ${share(x.persons, d.pop)} %`).join(' · ')}
                </td>
              </tr>
            ) : (
              <>
                <tr>
                  <th>{t('culture')}</th>
                  <td>{L(d.culture)}</td>
                </tr>
                <tr>
                  <th>{t('faith')}</th>
                  <td>{L(d.faith)}</td>
                </tr>
              </>
            )}
            <tr>
              <th>{t('terrain')}</th>
              <td>{terrainName(d.terrain)}</td>
            </tr>
            <tr>
              <th>{t('resource')}</th>
              <td>{resourceName(d.resource)}</td>
            </tr>
          </tbody>
        </table>
      )}
      {d?.harvest && (
        <div class="section">
          <h3>{t('harvest')}</h3>
          <table class="facts">
            <tbody>
              <tr>
                <th>{t('harvest_year')}</th>
                <td>{kcalText(d.harvest.kcal)}</td>
              </tr>
              <tr>
                <th>{t('harvest_head')}</th>
                <td>{num(d.harvest.perHeadDay)} kcal</td>
              </tr>
              <tr>
                <th>{t('harvest_land')}</th>
                <td>{num(d.harvest.hectares)} ha</td>
              </tr>
              {d.harvest.arable ? (
                <>
                  <tr>
                    <th>{t('arable')}</th>
                    <td>
                      {num(d.harvest.arable.hectares)} ha ({pct(d.harvest.arable.share)})
                    </td>
                  </tr>
                  <tr>
                    <th>{t('arable_state')}</th>
                    <td>
                      {t(
                        d.harvest.arable.hectares <= 0
                          ? 'arable_none'
                          : d.harvest.arable.atLimit
                            ? 'arable_limit'
                            : 'arable_free',
                      )}
                    </td>
                  </tr>
                  <tr>
                    <th>{t('arable_yield')}</th>
                    <td>{d.harvest.arable.landYield === null ? '–' : num(d.harvest.arable.landYield)}</td>
                  </tr>
                </>
              ) : (
                <tr>
                  <th>{t('harvest_yield')}</th>
                  <td>{d.harvest.landYield === null ? t('no_data') : num(d.harvest.landYield)}</td>
                </tr>
              )}
              <tr>
                <th>{t('harvest_farmers')}</th>
                <td>{heads(d.harvest.farmers)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {d?.cityEconomy && wi && (
        <div class="section">
          <h3>{t('economy_city')}</h3>
          <p class="muted">{t('economy_note_city', { date: fmtDate(d.cityEconomy.day, wi.startYear, lang.value) })}</p>
          {d.cityEconomy.halted && <p class="muted">{t('economy_halted', { why: d.cityEconomy.halted })}</p>}
          <table class="facts">
            <tbody>
              <tr>
                <th>{t('economy_gdp')}</th>
                <td>{pounds(d.cityEconomy.realGdp)}</td>
              </tr>
              <tr>
                <th>{t('economy_level')}</th>
                <td>{index(d.cityEconomy.realGdpIndex)}</td>
              </tr>
              <tr>
                <th>{t('economy_prices_today')}</th>
                <td>{index(d.cityEconomy.priceToday)}</td>
              </tr>
              <tr>
                <th>{t('economy_consumption')}</th>
                <td>{pounds(d.cityEconomy.consumption)}</td>
              </tr>
              <tr>
                <th>{t('economy_crown')}</th>
                <td>{pounds(d.cityEconomy.crown)}</td>
              </tr>
              <tr>
                <th>{t('economy_investment')}</th>
                <td>{pounds(d.cityEconomy.investment)}</td>
              </tr>
              <tr>
                <th>{t('economy_exports')}</th>
                <td>{pounds(d.cityEconomy.exports)}</td>
              </tr>
              <tr>
                <th>{t('economy_imports')}</th>
                <td>{pounds(d.cityEconomy.imports)}</td>
              </tr>
              <tr>
                <th>{t('economy_employed')}</th>
                <td>{num(d.cityEconomy.employed)}</td>
              </tr>
              <tr>
                <th>{t('economy_unemployed')}</th>
                <td>{num(d.cityEconomy.unemployed)}</td>
              </tr>
              <tr>
                <th>{t('economy_coin_households')}</th>
                <td>{pounds(d.cityEconomy.coinHouseholds)}</td>
              </tr>
              <tr>
                <th>{t('economy_coin_firms')}</th>
                <td>{pounds(d.cityEconomy.coinFirms)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {r && (
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
      )}
    </aside>
  );
}
