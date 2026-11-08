import { lang } from './i18n';
export function num(v: number, d = 0): string {
  if (!isFinite(v)) return '—';
  const a = Math.abs(v);
  const loc = lang.value === 'de' ? 'de-DE' : 'en-GB';
  if (a >= 1e6) return (v / 1e6).toLocaleString(loc, { maximumFractionDigits: 1 }) + (lang.value === 'de' ? ' Mio.' : 'M');
  if (a >= 1e4) return (v / 1e3).toLocaleString(loc, { maximumFractionDigits: 1 }) + 'k';
  // values that round to zero (and -0, e.g. a defender's war score of 0) are shown as 0, not "-0"
  return v.toLocaleString(loc, { maximumFractionDigits: d, minimumFractionDigits: 0 }).replace(/^-(0(?:[.,]0+)?)$/, '$1');
}
export const signed = (v: number, d = 0) => (v > 0 ? '+' : '') + num(v, d);
export const pct = (v: number, d = 0) => num(v * 100, d) + ' %';
export const rgb = (c: [number, number, number] | number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;
