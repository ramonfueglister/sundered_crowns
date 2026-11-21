// The texts of the interface in English and German (src/ui/i18n.ts): which language a visit starts in, every text in
// both languages with the same blanks, the blanks filled, the names of terrains and resources, and the numbers as each
// language writes them. The storage and the browser's language are fakes; the module is loaded afresh where the
// language a visit starts in is checked.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let stored = new Map<string, string>();
/** the storage of the page: `broken` throws as in private mode */
function storage(broken = false) {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => {
      if (broken) throw new Error('private mode');
      return stored.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (broken) throw new Error('private mode');
      stored.set(k, v);
    },
  });
}
beforeEach(() => {
  vi.resetModules();
  stored = new Map();
  storage();
  vi.stubGlobal('navigator', { language: 'en-GB' });
});
afterEach(() => {
  vi.unstubAllGlobals();
});
const load = () => import('../src/ui/i18n');

describe('the language of a visit', () => {
  it('is the one chosen last, else the browser’s where it is German, else English', async () => {
    const cases: [string | undefined, string, string][] = [
      ['de', 'en-GB', 'de'],
      ['en', 'de-CH', 'en'],
      [undefined, 'de-CH', 'de'],
      [undefined, 'fr-FR', 'en'],
      ['fr', 'de', 'de'], // a broken choice is left aside
      [undefined, '', 'en'],
    ];
    for (const [chosen, browser, starts] of cases) {
      vi.resetModules();
      stored = new Map(chosen ? [['sc.lang', chosen]] : []);
      vi.stubGlobal('navigator', { language: browser });
      expect((await load()).lang.value).toBe(starts);
    }
  });

  it('is kept when chosen, and still changes where the storage fails', async () => {
    let i18n = await load();
    i18n.setLang('de');
    expect(i18n.lang.value).toBe('de');
    expect(stored.get('sc.lang')).toBe('de');
    vi.resetModules();
    storage(true);
    vi.stubGlobal('navigator', { language: 'de-AT' });
    i18n = await load();
    expect(i18n.lang.value).toBe('de');
    i18n.setLang('en');
    expect(i18n.lang.value).toBe('en');
  });
});

describe('the texts', () => {
  it('give the text of a bilingual value in the language of the visit, and nothing for none', async () => {
    const { L, setLang } = await load();
    const name = { en: 'Bavaria', de: 'Bayern' };
    expect(L(name)).toBe('Bavaria');
    setLang('de');
    expect(L(name)).toBe('Bayern');
    expect(L('Venezia')).toBe('Venezia');
    for (const none of [null, undefined, '']) expect(L(none)).toBe('');
  });

  it('are all written in both languages, with the same blanks', async () => {
    const { t, setLang } = await load();
    const source = readFileSync('src/ui/i18n.ts', 'utf8'),
      table = source.slice(source.indexOf('const S = {'), source.indexOf('} as const satisfies'));
    // (the keys are read from the table's own source, so they are its keys)
    const keys = [...table.matchAll(/^ {2}(\w+): \[/gm)].map((m) => m[1] as Parameters<typeof t>[0]);
    expect(keys.length).toBeGreaterThan(50);
    const blanks = (s: string) => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();
    for (const k of keys) {
      setLang('en');
      const en = t(k);
      setLang('de');
      const de = t(k);
      expect(en, k).not.toBe('');
      expect(de, k).not.toBe('');
      expect(blanks(de), k).toEqual(blanks(en));
    }
  });

  it('fill the blanks they are given, and leave a blank without a value', async () => {
    const { t, setLang } = await load();
    expect(t('time_speed', { n: 3 })).toBe('Speed 3');
    setLang('de');
    expect(t('time_speed_own', { s: '2 s' })).toBe('eigenes Tempo der Welt, ein Tag in 2 s');
    expect(t('time_speed')).toBe('Geschwindigkeit {n}');
  });

  it('name terrains and resources: in German from the list, in English from their ids', async () => {
    const { terrainName, resourceName, setLang } = await load();
    expect(terrainName('mountains')).toBe('Mountains');
    expect(resourceName('iron_ore')).toBe('Iron Ore');
    expect(resourceName('none')).toBe('–');
    setLang('de');
    expect(terrainName('mountains')).toBe('Gebirge');
    expect(resourceName('iron_ore')).toBe('Eisenerz');
    expect(resourceName('none')).toBe('–');
    // an id the list does not know stays as it is
    expect(terrainName('glacier')).toBe('glacier');
    expect(resourceName('ivory')).toBe('ivory');
  });
});

describe('the numbers', () => {
  it('are written as each language writes them', async () => {
    const { num, heads, pct, pounds, index, setLang } = await load();
    expect(num(1234.6)).toBe('1,235');
    expect(heads(12.34)).toBe('12.3');
    expect(heads(-12.34)).toBe('-12.3');
    expect(heads(1234.5)).toBe('1,235'); // from 100 on, whole people
    expect(heads(-1234.5)).toBe('-1,235');
    expect(heads(100.4)).toBe('100');
    expect(pct(0.1234)).toBe('12.3 %');
    expect(pounds(1234.6)).toBe('£ 1,235');
    expect(index(100)).toBe('100.0');
    setLang('de');
    expect(num(1234.6)).toBe('1.235');
    expect(heads(12.34)).toBe('12,3');
    expect(pct(0.1234)).toBe('12,3 %');
    expect(pounds(1234.6)).toBe('£ 1.235');
    expect(index(99.94)).toBe('99,9');
  });

  it('give kilocalories in thousands, millions and billions', async () => {
    const { kcalText, setLang } = await load();
    expect(kcalText(999_999)).toBe('999,999 kcal');
    expect(kcalText(1_000_000)).toBe('1 m kcal');
    expect(kcalText(3_456_789)).toBe('3.46 m kcal');
    expect(kcalText(1_000_000_000)).toBe('1 bn kcal');
    expect(kcalText(2_500_000_000)).toBe('2.5 bn kcal');
    setLang('de');
    expect(kcalText(3_456_789)).toBe('3,46 Mio. kcal');
    expect(kcalText(2_500_000_000)).toBe('2,5 Mrd. kcal');
  });
});
