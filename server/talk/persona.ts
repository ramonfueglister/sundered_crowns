// The persona of a person for a conversation through a language model (docs/TALK.md): what the world holds about the
// person, said as plain sentences, and the rules of the conversation. Built anew for every turn from the state of the
// day, so the person always knows the world as it is now.
//
// The shape follows the literature on characters played by language models: a description of the character in short
// statements of fact, its present situation and its relations (Park et al. 2023, "Generative Agents: Interactive
// Simulacra of Human Behavior", UIST, section 3.1: the seed memory of each agent), a profile plus the way it speaks
// (Wang et al. 2024, "RoleLLM", Findings of ACL, section 3: role profile and speaking style), and a horizon of
// knowledge: the character knows nothing of what lies beyond its time and life (Shao et al. 2023, "Character-LLM: A
// Trainable Agent for Role-Playing", EMNLP, section 3.3: protective experiences). Only what the world holds goes in.
import type { WorldState } from '../../src/sim/state';
import type { World } from '../../src/sim/world';
import { ALIVE, BORN_UNKNOWN } from '../../src/sim/state';
import { rowOf } from '../../src/sim/people/archive';
import { sickness, CHILDBED_DAYS } from '../../src/sim/people/absence';
import { personDetail, type PersonDetail } from '../../src/net/people';
import { economyRows, householdRows } from '../../src/people/economy_rows';
import { ALL_CULTURES, FAITHS, cultureLabel } from '../../src/sim/content/peoples';
import { dateToDay, dayToDate, MONTHS_DE } from '../../src/sim/calendar';
import { CALENDAR, DAY, calendarOf, jdnOfYear, weekday, yearKinds } from '../../src/sim/holy_days';

const WEEKDAYS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'] as const;
const BIG5_DE = ['Offenheit für Erfahrungen', 'Gewissenhaftigkeit', 'Extraversion', 'Verträglichkeit', 'Neurotizismus'];

/** A Big Five T-score in words: the bands of the profile sheet of the NEO PI-R (Costa & McCrae 1992, "Revised NEO
 *  Personality Inventory and NEO Five-Factor Inventory Professional Manual", PAR: very low ≤ 34, low 35–44, average
 *  45–55, high 56–65, very high ≥ 66). */
export function big5Band(t: number): string {
  return t <= 34 ? 'sehr niedrig' : t <= 44 ? 'niedrig' : t <= 55 ? 'durchschnittlich' : t <= 65 ? 'hoch' : 'sehr hoch';
}
/** An IQ in words: the descriptive classes of the Wechsler scales (Wechsler 2008, WAIS-IV Technical and
 *  Interpretive Manual, table 6.3: ≤ 69, 70–79, 80–89, 90–109, 110–119, 120–129, ≥ 130). */
export function iqBand(iq: number): string {
  return iq <= 69
    ? 'sehr niedrig'
    : iq <= 79
      ? 'grenzwertig'
      : iq <= 89
        ? 'unterdurchschnittlich'
        : iq <= 109
          ? 'durchschnittlich'
          : iq <= 119
            ? 'überdurchschnittlich'
            : iq <= 129
              ? 'hoch'
              : 'sehr hoch';
}

const years = (days: number) => Math.floor(days / 365.25);
const ageOf = (s: WorldState, row: number) => {
  const b = s.person.cols.born[row];
  return b === BORN_UNKNOWN ? null : years(s.day - b);
};

/** The facts the world holds about the living person `uid` on its day, one German sentence each, in the second
 *  person; null when the person is dead or not in the world. */
export function personaFacts(s: WorldState, w: World, uid: number): string[] | null {
  const d = personDetail(s, uid, (i) => ALL_CULTURES[i] ?? 'unknown');
  if (!d?.alive) return null;
  const id = rowOf(s, uid),
    P = s.person.cols,
    out: string[] = [];
  const { y, m, d: dd } = dayToDate(s.day, s.startYear),
    doy = s.day - dateToDay(y, 0, 1, s.startYear);
  out.push(`Heute ist ${WEEKDAYS_DE[weekday(jdnOfYear(y) + doy)]}, der ${dd}. ${MONTHS_DE[m]} ${y}.`);
  const h = d.history;
  out.push(
    h
      ? `Du bist ${h.name}${h.house ? ` aus dem Haus ${h.house}` : ''}.`
      : `Du bist ${d.female ? 'eine Frau' : 'ein Mann'}. Die Welt kennt deinen Namen nicht.`,
  );
  if (h?.crowns.length) out.push(`Du trägst die Krone von ${h.crowns.map((c) => c.name).join(', ')}.`);
  out.push(
    d.age === null
      ? 'Dein Geburtstag ist nicht überliefert; du bist erwachsen.'
      : `Du bist ${Math.floor(d.age)} Jahre alt.`,
  );
  out.push(
    `Deine Kultur ist ${cultureLabel(d.culture).de}, dein Glaube ${FAITHS[P.faith[id]]?.name.de ?? 'unbekannt'}.`,
  );
  out.push(...homeFacts(s, w, d, id));
  out.push(...todayFacts(s, d, id, y, doy));
  out.push(...familyFacts(s, d, id));
  // a person of history has no part in the economy and a family of their own (src/sim/systems/rulers.ts, line 9):
  // the zeros of that purse say nothing about the person
  if (!h) out.push(...economyFacts(d));
  out.push(`Deine Begabung ist ${iqBand(d.iq)} (IQ ${d.iq}).`);
  out.push(`Deine Persönlichkeit (Big Five): ${d.big5.map((t, k) => `${BIG5_DE[k]} ${big5Band(t)}`).join(', ')}.`);
  return out;
}

/** Where the person lives, who rules the place, and where the person comes from. */
function homeFacts(s: WorldState, w: World, d: PersonDetail, id: number): string[] {
  const out: string[] = [],
    at = w.namesDe[d.place] || w.names[d.place];
  if (d.dwelling === 'farmstead' && d.town)
    out.push(`Du lebst auf einem Hof in einem Weiler vor den Mauern von ${d.town}.`);
  else if (d.dwelling === 'parcel' && d.town) out.push(`Du lebst in der Stadt ${d.town}, im Haus deiner Familie.`);
  else out.push(`Du lebst in ${d.town ?? at}.`);
  const r = s.place.owner[d.place];
  if (r >= 0) {
    const realm = s.realmText[r].name.de ?? s.realmText[r].name.en,
      holder = s.realm.cols.holder[r];
    const lord = holder >= 0 ? (s.named ?? []).find((n) => n.person === holder) : undefined;
    out.push(`Der Ort gehört zu ${realm}${lord && holder !== id ? `; es herrscht ${lord.name}` : ''}.`);
  }
  const home = s.person.cols.home[id];
  if (home >= 0 && home !== d.place) out.push(`Du stammst aus ${w.namesDe[home] || w.names[home]}.`);
  return out;
}

/** What the day is for the person: a day of rest of the person's faith (src/sim/holy_days.ts), sickness or childbed
 *  (src/sim/people/absence.ts). */
function todayFacts(s: WorldState, d: PersonDetail, id: number, y: number, doy: number): string[] {
  const out: string[] = [],
    cal = calendarOf(s.person.cols.faith[id]);
  if (cal !== CALENDAR.none) {
    const kind = yearKinds(cal, y)[doy];
    if (kind === DAY.rest) out.push('Heute ist nach deinem Glauben ein Ruhetag.');
    else if (kind === DAY.half) out.push('Heute wird nach deinem Glauben nur bis Mittag gearbeitet.');
  }
  // the sickness of a person is drawn by age (Riley & Alter 1996): none is known for one whose birthday is not
  const ill = d.born === BORN_UNKNOWN ? [] : sickness(s.seed >>> 0, d.id, d.born, s.day + 1);
  for (let k = 0; k < ill.length; k += 2)
    if (ill[k] <= s.day && s.day <= ill[k + 1]) out.push('Du bist zurzeit krank.');
  const P = s.person.cols;
  if (
    d.female &&
    d.children.some((c) => {
      const r = rowOf(s, c);
      return r >= 0 && s.day - P.born[r] < CHILDBED_DAYS && s.day >= P.born[r];
    })
  )
    out.push('Du liegst im Wochenbett: du hast vor wenigen Tagen ein Kind geboren.');
  return out;
}

/** The parents, the spouse and the children, as far as the table of the persons holds them. */
function familyFacts(s: WorldState, d: PersonDetail, id: number): string[] {
  const out: string[] = [],
    P = s.person.cols;
  const living = (uid: number) => {
    const r = rowOf(s, uid);
    return r >= 0 && P.died[r] === ALIVE ? r : -1;
  };
  for (const [uid, who] of [
    [d.mother, 'Mutter'],
    [d.father, 'Vater'],
  ] as const) {
    if (uid < 0) continue;
    const r = living(uid);
    const my = who === 'Mutter' ? 'Deine' : 'Dein',
      age = r >= 0 ? ageOf(s, r) : null;
    out.push(r >= 0 ? `${my} ${who} lebt${age === null ? '' : ` und ist ${age} Jahre alt`}.` : `${my} ${who} ist tot.`);
  }
  const sp = d.spouse >= 0 ? living(d.spouse) : -1;
  if (sp >= 0)
    out.push(`Du bist verheiratet; ${d.female ? 'dein Mann' : 'deine Frau'} ist ${ageOf(s, sp) ?? '?'} Jahre alt.`);
  else if (d.age !== null && d.age >= 15 && P.family[id] >= 0) out.push('Du lebst ohne Ehepartner.');
  const kids = d.children
    .map(living)
    .filter((r) => r >= 0)
    .sort((a, b) => P.born[a] - P.born[b]);
  if (kids.length)
    out.push(
      `Du hast ${kids.length} lebende${kids.length === 1 ? 's' : ''} Kind${kids.length === 1 ? '' : 'er'}: ${kids.map((r) => `${P.sex[r] === 0 ? 'eine Tochter' : 'einen Sohn'} (${ageOf(s, r) ?? '?'})`).join(', ')}.`,
    );
  return out;
}

/** The person's part in the economy of the city and the purse of the family, in the words and pence of the panel
 *  (src/people/economy_rows.ts). */
function economyFacts(d: PersonDetail): string[] {
  const out: string[] = [],
    e = economyRows(d),
    hh = householdRows(d);
  const said = (rows: [string, string][]) => rows.map(([k, v]) => `${k}: ${v}`).join('; ');
  if (e.length) out.push(`Dein Erwerb: ${e[0][1]}${e.length > 1 ? `; ${said(e.slice(1))}` : ''}.`);
  if (hh.length) out.push(`Haushalt deiner Familie: ${said(hh)}.`);
  return out;
}

/** The rules of the conversation, then the facts. The rules of knowledge and of the facts are those of the papers
 *  above; OWN RULE: no name where the world holds none (a name would be a fact the world does not have), and answers
 *  of one to four sentences (a conversation, not a tale, and it bounds the cost of a turn). */
export function personaPrompt(facts: readonly string[]): string {
  return [
    'Du spielst eine Person in einer Welt des Mittelalters. Ein Besucher spricht dich an. Antworte als diese Person, in',
    'der ersten Person, auf Deutsch, in einfacher, verständlicher Sprache, wie sie diese Person in ihrer Zeit und ihrem',
    'Stand spräche.',
    '',
    'Regeln:',
    '- Du weisst nur, was eine Person deiner Zeit, deines Ortes, deines Standes und deiner Bildung wissen kann, und',
    '  nichts, was nach dem heutigen Tag geschieht. Moderne Dinge und Begriffe kennst du nicht.',
    '- Die Fakten unten sind wahr. Widersprich ihnen nie und füge keine neuen Fakten über dich, deine Familie oder',
    '  deinen Ort hinzu (keine Namen, Zahlen oder Ereignisse, die unten nicht stehen). Fragt man danach, sag, dass du es',
    '  nicht weisst oder nicht sagen willst, wie es zu deiner Persönlichkeit passt.',
    '- Wenn die Welt deinen Namen nicht kennt, nennst du keinen und weichst der Frage aus.',
    '- Deine Persönlichkeit und Begabung zeigen sich in deinem Ton, nicht indem du sie aufzählst.',
    '- Antworte kurz: ein bis vier Sätze.',
    '',
    'Fakten:',
    ...facts.map((f) => `- ${f}`),
  ].join('\n');
}
