// What each answer to an event does, from the simulation's own trial of the option (src/game/eventfx.ts): shown under
// every option of the event window, with a breakdown tooltip for each value.
import './direction.css';
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { sim } from '../../game/client';
import type { FxLine, OptionFx } from '../../game/eventfx';
import type { I18n } from '../../sim/types';
import { t, L, lang, num, signed, Tip, fxLabel, fxValue } from './common';
import { TipHead } from './explain';

/** Ask the simulation once per pending event (and again when the day moves on while the window is open). */
export function useOptionFx(pending: number | undefined, day: number | undefined): OptionFx[] | null {
  const [fx, setFx] = useState<{ id: number; day: number; data: OptionFx[] | null } | null>(null);
  useEffect(() => {
    if (pending === undefined) return;
    let alive = true;
    sim().query<OptionFx[] | null>({ q: 'eventFx', pending }).then((d) => { if (alive) setFx({ id: pending, day: day ?? 0, data: d }); }).catch(() => {});
    return () => { alive = false; };
  }, [pending, day]);
  return fx && fx.id === pending ? fx.data : null;
}

const fmtV = (v: number, unit: FxLine['unit']) => unit === 'pct' ? `${signed(v * 100, Math.abs(v) < 0.1 ? 1 : 0)} %` : unit === 'int' ? signed(Math.round(v), 0) : signed(v, Math.abs(v) < 10 && Math.round(v) !== v ? 1 : 0);
const plain = (v: number, unit: FxLine['unit']) => unit === 'pct' ? `${num(v * 100, 1)} %` : num(v, unit === 'int' ? 0 : 1);
/** The value of a line: one number, or a range when the trials differ. */
function valueText(l: FxLine): string {
  if (l.v === undefined) return '';
  if (l.lo !== undefined && l.hi !== undefined && Math.abs(l.hi - l.lo) > 1e-6) return `${fmtV(l.lo, l.unit)} ${t('x_fx_to')} ${fmtV(l.hi, l.unit)}`;
  return fmtV(l.v, l.unit);
}
/** A label with {v} and {t:key} filled in, in the current language. */
function lineText(l: FxLine): string {
  return L(l.label).replace('{v}', valueText(l)).replace(/\{t:([\w_]+)\}/g, (_m, k) => t(k)).replace(/\s+/g, ' ').trim();
}
function tone(l: FxLine): 'pos' | 'neg' | '' {
  if (!l.tone) return '';
  const v = l.v ?? 1; return (v > 0) === (l.tone > 0) ? 'pos' : 'neg';
}
const years = (y?: number) => (y === undefined ? '' : lang.value === 'de' ? ` für ${num(y, y < 3 && y !== Math.round(y) ? 1 : 0)} ${y === 1 ? 'Jahr' : 'Jahre'}` : ` for ${num(y, y < 3 && y !== Math.round(y) ? 1 : 0)} year${y === 1 ? '' : 's'}`);

function LineTip({ l }: { l: FxLine }) {
  return <div>
    <TipHead name={lineText(l)} hint={l.share < 1 ? t('x_fx_possible_hint') : t('x_fx_line_hint')} />
    <div class="breakdown">
      {l.from !== undefined && <div class="bd-row"><span>{t('x_fx_before')}</span><span>{plain(l.from, l.unit)}</span></div>}
      {l.v !== undefined && <div class="bd-row"><span>{t('x_fx_change')}</span><span class={tone(l)}>{valueText(l)}</span></div>}
      {l.to !== undefined && <div class="bd-row bd-total"><span>{t('x_fx_after')}</span><span>{plain(l.to, l.unit)}</span></div>}
      {l.vals && l.vals.length > 1 && l.vals.map((v, i) => <div class="bd-row muted"><span>{t('x_fx_trial')} {i + 1}</span><span>{fmtV(v, l.unit)}</span></div>)}
      {l.years !== undefined && <div class="bd-row"><span>{t('x_fx_lasts')}</span><span>{years(l.years).trim()}</span></div>}
      {l.effects && Object.entries(l.effects).map(([k, v]) => <div class="bd-row"><span>{fxLabel(k)}</span><span>{fxValue(k, v)}</span></div>)}
      {l.share < 1 && <div class="bd-row"><span>{t('x_fx_share')}</span><span>{num(l.share * 100, 0)} %</span></div>}
    </div>
  </div>;
}

/** The effects of one option as a short list. */
export function OptionEffects({ fx }: { fx: OptionFx | undefined | null }) {
  if (!fx) return <div class="ev-fx muted small">{t('x_fx_trying')}…</div>;
  if (!fx.lines.length) return <div class="ev-fx muted small">{t('x_fx_none')}</div>;
  const items: ComponentChildren[] = fx.lines.slice(0, 12).map((l) => {
    const eff = l.effects ? Object.entries(l.effects).filter(([, v]) => Math.abs(v) > 1e-9).map(([k, v]) => `${fxLabel(k)} ${fxValue(k, v)}`).join(', ') : '';
    return <li class={`${tone(l)} ${l.share < 1 ? 'maybe' : ''}`}><Tip tag="span" content={() => <LineTip l={l} />}>
      {lineText(l)}{years(l.years)}{eff && <span class="muted">: {eff}</span>}{l.share < 1 && <span class="muted"> ({t('x_fx_possible')})</span>}
    </Tip></li>;
  });
  return <div class="ev-fx">
    <ul>{items}</ul>
    {fx.lines.length > 12 && <div class="muted small">+{fx.lines.length - 12} {t('more')}</div>}
    {fx.random && <Tip tag="div" content={<div><TipHead name={t('x_fx_random')} hint={t('x_fx_random_hint')} /></div>}><div class="ev-fx-rnd small">⚄ {t('x_fx_random')}</div></Tip>}
  </div>;
}
/** Header over the options: where the lists come from. */
export function OptionEffectsHead() {
  return <Tip tag="div" content={<div><TipHead name={t('x_fx_head')} hint={t('x_fx_head_hint')} /></div>}><div class="ev-fx-head small muted">{t('x_fx_head')}</div></Tip>;
}
void ({} as I18n);
