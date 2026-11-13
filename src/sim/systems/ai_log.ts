// What the AI did: every command an AI realm gives goes through aiApply (the same applyCommand the player's commands
// go through). Notable decisions are kept per realm (the last 20, Nation.aiLog) and shown in the nation panel; every
// use of a system is counted for the observer report (tools/sim/observer.ts). The counts are diagnostics only: the
// simulation never reads them.
import type { GameState, Command, CmdResult, I18n, AiLogEntry } from '../types';
import type { World } from '../world';
import { applyCommand } from '../commands';
import { ESTATES, PRIVILEGES, OFFICES } from './politics';
import { LAWS, LAW_INDEX } from '../content/laws';
import { localName } from '../content/names';
import { DECISIONS } from '../content/decisions';

/** Uses of each system by AI realms since the last reset: kind → count, and kind → realms that used it. */
export const AI_USAGE: Record<string, number> = {};
export const AI_USAGE_REALMS: Record<string, Set<number>> = {};
/** Uses by kind and reason ("estate:grant|need_gold"), for tuning. */
export const AI_WHY: Record<string, number> = {};
export function resetAiUsage() { for (const o of [AI_USAGE, AI_USAGE_REALMS, AI_WHY]) for (const k in o) delete (o as any)[k]; }

/** The system a command uses, as counted ("spy:slander", "estate:grant", "coinage:debase", ...). */
export function aiKind(c: Command): string {
  switch (c.t) {
    case 'spy': return `spy:${c.action}`;
    case 'diplo': return `diplo:${c.action}`;
    case 'curia': return `curia:${c.action}`;
    case 'agent': return `agent:${c.kind}`;
    case 'estate': return `estate:${c.action}`;
    case 'budget': return c.key === 'coinage' ? (c.value > 0 ? 'coinage:debase' : 'coinage:restore') : `budget:${c.key}`;
    case 'general': return c.char === -1 ? 'general:recruit' : 'general';
    case 'loan': return c.take ? 'loan:take' : 'loan:repay';
    default: return c.t;
  }
}
const QUIET = new Set(['move', 'merge', 'split', 'recruit', 'build', 'method', 'tax', 'embark', 'cancel', 'batch', 'disband', 'workshop', 'general', 'merchant', 'tech', 'orders', 'dev', 'event', 'peace_answer', 'goal']);
/** Keep only what the panel needs to tell the decision (a war's target towns, a peace's ceded land are left out). */
function compact(c: Command): AiLogEntry['c'] {
  const o: any = { t: c.t };
  for (const k of ['action', 'target', 'estate', 'privilege', 'office', 'char', 'key', 'value', 'loc', 'kind', 'law', 'option', 'goal', 'to', 'amount', 'take', 'company', 'subject', 'id', 'concede']) if ((c as any)[k] !== undefined) o[k] = (c as any)[k];
  if (c.t === 'peace') o.terms = c.terms.length;
  return o;
}
/** Count a use and keep it in the realm's log (why: a key of WHY below). */
export function aiRecord(s: GameState, cmd: Command, why?: string) {
  const k = aiKind(cmd);
  AI_USAGE[k] = (AI_USAGE[k] ?? 0) + 1;
  (AI_USAGE_REALMS[k] ??= new Set()).add(cmd.n);
  if (why) AI_WHY[`${k}|${why}`] = (AI_WHY[`${k}|${why}`] ?? 0) + 1;
  if ((QUIET.has(cmd.t) && k !== 'general:recruit') || (cmd.t === 'budget' && cmd.key !== 'coinage')) return;
  const n = s.nations[cmd.n]; if (!n) return;
  const log = (n.aiLog ??= []);
  const c = compact(cmd);
  // the same step repeated within a year (another envoy with the same offer) is kept once
  const same = JSON.stringify(c);
  for (let k2 = log.length - 1; k2 >= 0 && s.day - log[k2].d < 365; k2--) if (JSON.stringify(log[k2].c) === same) return;
  log.push(why ? { d: s.day, c, y: why } : { d: s.day, c });
  if (log.length > 20) log.splice(0, log.length - 20);
}
/** An AI command: applied like a player's, then counted and logged when it went through. */
export function aiApply(s: GameState, w: World, cmd: Command, why?: string): CmdResult {
  const r = applyCommand(s, w, cmd);
  if (r.ok) aiRecord(s, cmd, why);
  return r;
}

// ---------------- the log in words ----------------
const T = (en: string, de: string): I18n => ({ en, de });
/** The logged commands without a text of their own (the log showed the raw word, e.g. 'assault'). */
const CMD_TEXT: Record<string, I18n> = {
  assault: T('Stormed the walls of a besieged town', 'Sturmangriff auf eine belagerte Stadt'), assembly: T('Called the assembly', 'Die Versammlung einberufen'),
  doctrine: T('Adopted a doctrine of the faith', 'Eine Glaubenslehre angenommen'), empire: T('Acted in the affairs of the Empire', 'In Reichsangelegenheiten gehandelt'),
  govern: T('Changed how the realm is governed', 'Die Regierungsweise geändert'), league: T('Acted in the affairs of the league', 'In Bundesangelegenheiten gehandelt'),
  powers: T('Dealt with the great powers', 'Mit den Großmächten verhandelt'), scorch: T('Burned the land before the enemy', 'Verbrannte Erde vor dem Feind'),
  situation: T('Acted in a situation of the realm', 'In einer Lage des Reiches gehandelt'),
};
/** Why the AI did it. */
export const WHY: Record<string, I18n> = {
  'cu:conclave': T('to win the conclave', 'um das Konklave zu gewinnen'), 'cu:hat': T('for our share of the College', 'für unseren Anteil am Kollegium'),
  'cu:gold': T('for an empty chest', 'für eine leere Kasse'), 'gov:succession': T('to secure the succession', 'um die Nachfolge zu sichern'), 'cu:crusade': T('for the faith', 'für den Glauben'),
  need_authority: T('to gain Authority', 'um Autorität zu gewinnen'),
  for_reform: T('to pay for a reform', 'um eine Reform zu bezahlen'),
  poor_general: T('our largest host lacked an able commander', 'unserem größten Heer fehlte ein fähiger Befehlshaber'),
  need_gold: T('to fill the treasury', 'um die Kasse zu füllen'),
  need_concord: T('to restore Concord', 'um die Eintracht wiederherzustellen'),
  need_mandate: T('to strengthen the Mandate', 'um das Mandat zu stärken'),
  estate_restless: T('the estate was growing restless', 'der Stand wurde unruhig'),
  estate_overmighty: T('the estate had grown too strong', 'der Stand war zu mächtig geworden'),
  debt: T('to meet the debts', 'um die Schulden zu bedienen'),
  war_chest: T('to pay for the war', 'um den Krieg zu bezahlen'),
  restore_coin: T('the treasury has recovered', 'die Kasse hat sich erholt'),
  inflation: T('prices were rising too fast', 'die Preise stiegen zu schnell'),
  unrest: T('to calm the unrest', 'um die Unruhe zu dämpfen'),
  zeal: T('out of zeal for the faith', 'aus Glaubenseifer'),
  unity: T('for the unity of the realm', 'für die Einheit des Reiches'),
  ablest: T('the ablest candidate at court', 'die fähigste Person bei Hofe'),
  vacant: T('the office was vacant', 'das Amt war unbesetzt'),
  behind: T('they are ahead of us in learning', 'sie sind uns an Wissen voraus'),
  rival: T('against a rival', 'gegen einen Rivalen'),
  enemy: T('against an enemy at war with us', 'gegen einen Kriegsgegner'),
  before_war: T('preparing a war', 'zur Vorbereitung eines Krieges'),
  'rf:tax': T('for more taxes', 'für höhere Steuern'), 'rf:trade': T('for trade', 'für den Handel'), 'rf:hold': T('for a firmer hold on the land', 'für festere Herrschaft im Land'),
  'rf:army': T('for a stronger army', 'für ein stärkeres Heer'), 'rf:order': T('for less unrest', 'für weniger Unruhe'), 'rf:faiths': T('for peace among the faiths', 'für Frieden zwischen den Glauben'),
  'rf:faith': T('for the true faith', 'für den wahren Glauben'), 'rf:learning': T('for learning', 'für die Gelehrsamkeit'), 'rf:prosperity': T('for prosperity', 'für Wohlstand'),
  'rf:honest': T('for honest officials', 'für ehrliche Beamte'), 'rf:credit': T('for cheaper credit', 'für billigeren Kredit'), 'rf:crown': T('for the standing of the crown', 'für das Ansehen der Krone'),
  'rf:fleet': T('for the fleet', 'für die Flotte'), 'rf:realm': T('for the good of the realm', 'für das Wohl des Reiches'),
};
const ESTATE_DAT: Record<string, string> = { magnates: 'Magnaten', prelates: 'Prälaten', burghers: 'Bürgern', commons: 'Gemeinen' };
const ACT: Record<string, I18n> = {
  alliance: T('Proposed an alliance to {T}', 'Bündnis angeboten: {T}'), marriage: T('Proposed a royal marriage to {T}', 'Königliche Heirat angeboten: {T}'),
  access: T('Asked {T} for military access', '{T} um Durchmarschrecht gebeten'), trade: T('Proposed a trade agreement to {T}', 'Handelsabkommen angeboten: {T}'),
  guarantee: T('Guaranteed the independence of {T}', 'Unabhängigkeit garantiert: {T}'), vassalize: T('Asked {T} to submit as a vassal', '{T} zur Unterwerfung als Vasall aufgefordert'),
  demand: T('Demanded tribute from {T}', 'Tribut von {T} gefordert'), improve: T('Sent an envoy to improve relations with {T}', 'Gesandten zur Verbesserung der Beziehungen nach {T} geschickt'),
  gift: T('Sent a gift to {T}', 'Geschenk an {T} gesandt'), insult: T('Insulted {T}', '{T} beleidigt'), break_alliance: T('Broke the alliance with {T}', 'Bündnis mit {T} gelöst'),
  rival: T('Declared {T} a rival', '{T} zum Rivalen erklärt'), unrival: T('Ended the rivalry with {T}', 'Rivalität mit {T} beendet'), cancel_access: T('Cancelled the military access of {T}', 'Durchmarschrecht von {T} gekündigt'),
  fabricate: T('Clerks are fabricating a claim on {T}', 'Schreiber fabrizieren einen Anspruch auf {T}'), excommunicate: T('Asked the Curia to excommunicate {T}', 'Bei der Kurie den Bann über {T} erwirkt'),
};
const SPY: Record<string, I18n> = {
  slander: T('Agents spread slander about {T}', 'Agenten verbreiten Verleumdungen über {T}'), support_rebels: T('Agents stir up rebels in {T}', 'Agenten wiegeln in {T} Rebellen auf'),
  steal_tech: T('Agents steal knowledge from {T}', 'Agenten stehlen Wissen aus {T}'), fabricate: T('Agents forge a claim on {T}', 'Agenten fälschen einen Anspruch auf {T}'),
};

/** Secret work that other realms do not see in the log: agents abroad (spy actions) and claims forged by clerks
 *  (diplomacy fabricate). Such work comes to light only when it is discovered (diplomacy.ts spiesDay). */
export const aiLogSecret = (e: AiLogEntry) => e.c.t === 'spy' || (e.c.t === 'diplo' && (e.c as any).action === 'fabricate');
/** One entry of the log in both languages. */
export function aiLogText(s: GameState, w: World, e: AiLogEntry): I18n {
  const c: any = e.c;
  const nat = (id: number | undefined, l: 'en' | 'de') => (id !== undefined && s.nations[id] ? s.nations[id].short[l] : '?');
  const place = (l: number | undefined, lang: 'en' | 'de') => (l !== undefined && l >= 0 ? (lang === 'de' ? w.namesDe : w.names)[l] ?? '?' : '?');
  const fill = (t: I18n, extra: Record<string, I18n> = {}): I18n => {
    const f = (str: string, l: 'en' | 'de') => str.replace(/\{T\}/g, nat(c.target ?? c.to ?? c.subject, l)).replace(/\{L\}/g, place(c.loc, l)).replace(/\{(\w+)\}/g, (m, k) => (extra[k] ? extra[k][l] : m));
    return { en: f(t.en, 'en'), de: f(t.de, 'de') };
  };
  let out: I18n;
  switch (c.t) {
    case 'diplo': out = fill(ACT[c.action] ?? T(`${c.action}: {T}`, `${c.action}: {T}`)); break;
    case 'spy': out = fill(SPY[c.action] ?? T(`Agents at work in {T}`, `Agenten in {T} am Werk`)); break;
    case 'agent': out = fill(c.kind === 'faith' ? T('Sent preachers to {L}', 'Prediger nach {L} entsandt') : T('Sent officials to {L} to spread our tongue and customs', 'Beamte nach {L} entsandt, um Sprache und Sitten zu verbreiten')); break;
    case 'estate': {
      const est = ESTATES.find((x) => x.id === c.estate)?.name ?? T(c.estate, c.estate);
      const pv = PRIVILEGES.find((x) => x.id === c.privilege)?.name ?? T(c.privilege ?? '', c.privilege ?? '');
      const dat = T(est.en, ESTATE_DAT[c.estate] ?? est.de);
      out = c.action === 'grant' ? fill(T('Granted the {E} a privilege: {P}', 'Den {D} ein Vorrecht gewährt: {P}'), { E: est, D: dat, P: pv })
        : c.action === 'revoke' ? fill(T('Revoked a privilege of the {E}: {P}', 'Den {D} ein Vorrecht entzogen: {P}'), { E: est, D: dat, P: pv })
        : c.action === 'appease' ? fill(T('Gifts and favours for the {E}', 'Geschenke und Gunst für die {E}'), { E: est })
        : fill(T('Summoned the assembly of the estates, the {E} first', 'Ständeversammlung einberufen, die {E} voran'), { E: est });
      break;
    }
    case 'office': {
      const off = OFFICES.find((o) => o.id === c.office)?.name ?? T(c.office, c.office);
      const p = s.chars[c.char];
      const house = p && p.dynasty && !/,| of /.test(p.name) && !p.name.includes(p.dynasty.slice(0, 5)) ? ` ${p.dynasty}` : '';
      const who = T(p ? p.name + house : '?', p ? localName(p.name, 'de', p.female) + house : '?');
      out = fill(T('Appointed {C} as {O}', 'Ernennung: {C} als {O}'), { C: who, O: off });
      break;
    }
    case 'budget': {
      const pct = T(String(Math.round((c.value ?? 0) * 100)), String(Math.round((c.value ?? 0) * 100)));
      out = c.value > 0 ? fill(T('Debased the coin ({V} % less silver)', 'Münze verschlechtert ({V} % weniger Silber)'), { V: pct }) : T('Restored the full weight of the coin', 'Vollwertige Münze wiederhergestellt');
      break;
    }
    case 'law': {
      const L = LAWS[LAW_INDEX[c.law]]; const o = L?.options[c.option];
      out = L && o ? fill(T('Began a reform: {W}: {O}', 'Reform begonnen: {W}: {O}'), { W: L.name, O: o.name }) : T('Began a reform', 'Reform begonnen');
      break;
    }
    case 'declare': out = fill(T('Declared war on {T}', '{T} den Krieg erklärt')); break;
    case 'peace': out = fill(c.concede ? T('Made peace with {T} and yielded terms', 'Frieden mit {T} unter Zugeständnissen geschlossen') : c.terms ? T('Made peace with {T} on our terms', 'Frieden mit {T} zu unseren Bedingungen geschlossen') : T('Made a white peace with {T}', 'Weißen Frieden mit {T} geschlossen')); break;
    case 'integrate': out = fill(T('Began to integrate {T}', 'Eingliederung von {T} begonnen')); break;
    case 'mercs': out = fill(T('Hired a company of {M} mercenaries', 'Söldnerkompanie mit {M} Mann angeworben'), { M: T(String(c.company), String(c.company)) }); break;
    case 'loan': out = c.take ? fill(T('Took a loan of {A}', 'Kredit über {A} aufgenommen'), { A: T(String(Math.round(c.amount)), String(Math.round(c.amount))) }) : T('Repaid a loan', 'Einen Kredit getilgt'); break;
    case 'landmark': out = T('Began work on a great building', 'Arbeit an einem großen Bauwerk begonnen'); break;
    case 'general': out = T('Hired a seasoned general for gold', 'Erfahrenen Feldherrn gegen Gold angeworben'); break;
    case 'colonize': out = fill(T('Sent settlers to {L}', 'Siedler nach {L} entsandt')); break;
    case 'charter': out = T('Chartered a trading company', 'Eine Handelskompanie gegründet'); break;
    case 'explore': out = T('Sent out an expedition', 'Eine Expedition ausgesandt'); break;
    case 'curia': out = fill(c.action === 'red_hat' ? T('Bought a red hat for a churchman of our realm', 'Einen Kardinalshut für einen Kirchenmann unseres Reiches erworben')
      : c.action === 'simony' ? T('Sent gifts to the cardinals of {T}', 'Den Kardinälen von {T} Geschenke gesandt')
      : c.action === 'indulgence' ? T('Sold indulgences', 'Ablässe verkauft')
      : c.action === 'crusade' ? T('Had the pope proclaim a crusade against {T}', 'Den Papst zum Kreuzzug gegen {T} aufrufen lassen')
      : T('Cast our cardinals\' votes for {T}', 'Die Stimmen unserer Kardinäle für {T} abgegeben')); break;
    case 'govern': out = c.action === 'designate' ? T('Had the Powers elect a successor in the ruler\'s lifetime', 'Die Mächte zu Lebzeiten des Herrschers einen Nachfolger wählen lassen') : CMD_TEXT.govern; break;
    case 'decision': out = fill(T('Took the decision: {I}', 'Entscheidung getroffen: {I}'), { I: (DECISIONS.find((d) => d.id === c.id)?.name ?? T(c.id, c.id)) }); break;
    default: out = CMD_TEXT[c.t] ?? T(c.t, c.t);
  }
  const y = e.y ? WHY[e.y] : undefined;
  return y ? { en: `${out.en} (${y.en})`, de: `${out.de} (${y.de})` } : out;
}

