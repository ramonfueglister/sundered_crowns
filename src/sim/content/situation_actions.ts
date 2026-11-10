// The situation windows (spec point 81): for each historical situation its sides, what drives its progress (with the
// numbers the simulation uses), what each stage brings, and the actions a realm can take in it. Actions are applied
// through the 'situation' command (systems/situations.ts situationAction) and taken by AI realms as well.
import type { GameState, Nation, Situation, I18n, War } from '../types';
import type { World } from '../world';
import { FAITH_INDEX, faithFamily } from './peoples';
import { atlanticRealms, confessionalSplit, monarchy, faithLocs, isReform, hordeRaw, hordeProgress, HORDE_CAP, kingsCodeRows, kingsCodeLevel, finishCode, CODE_PROCLAIM, CODE_CAP } from './situations';
import { nationDev, nationLocsRO } from '../systems/war';
import { clamp, addOpinion, hasTreaty, atWar, chronicle, opinion } from '../ctx';
import { dayToDate } from '../calendar';

type Row = [string | I18n, number];
const T = (en: string, de: string): I18n => ({ en, de });
const LATIN = FAITH_INDEX.latin;
const alive = (s: GameState, id: number | undefined) => (id !== undefined && id >= 0 && s.nations[id]?.alive ? s.nations[id] : undefined);
const goldOf = (n: Nation, months: number) => Math.round(Math.max(20, (n.income.tax || 10) * months));
function setMod(s: GameState, n: Nation, id: string, years: number, label: I18n, effects: Record<string, number>) {
  n.modifiers = n.modifiers.filter((x) => x.id !== id);
  n.modifiers.push({ id, until: s.day + Math.round(years * 365), label, effects });
}
const inWar = (war: War, id: number) => war.att.includes(id) || war.def.includes(id);

export interface SitSide { name: I18n; members: number[] }
export interface SitCost { gold?: number; authority?: number; prestige?: number }
export interface SitAction {
  id: string; name: I18n;
  /** What the action does; computed where its effect depends on the moment (the window shows the real number). */
  desc: I18n | ((s: GameState, w: World, n: Nation, sit: Situation) => I18n);
  cost: (s: GameState, n: Nation) => SitCost;
  cooldown: number; // days
  /** Who may take it now (null) or why not (a refusal). */
  check: (s: GameState, w: World, n: Nation, sit: Situation, target?: number) => string | null;
  /** The realms or sides the action can be aimed at (e.g. a side to join or subsidise). */
  targets?: (s: GameState, w: World, n: Nation, sit: Situation) => number[];
  apply: (s: GameState, w: World, n: Nation, sit: Situation, target?: number) => void;
  /** An AI realm's choice: the target to use (-1 without a target), or null to pass. */
  ai: (s: GameState, w: World, n: Nation, sit: Situation) => number | null;
}
export interface SitExtra {
  sides: (s: GameState, w: World, sit: Situation) => SitSide[];
  /** 'level': the rows add up to the progress; 'monthly': they add up to its change per month. */
  drivers: (s: GameState, w: World, sit: Situation, viewer: number) => { kind: 'level' | 'monthly'; rows: Row[]; note?: I18n };
  stageInfo: I18n[];
  actions: SitAction[];
}

// ---------------------------------------------------------------- shared actions
/** Send gold to the leader of a side (it gains the gold, we gain its favour). */
function subsidise(sidesOf: (s: GameState, w: World, sit: Situation) => SitSide[], months = 4): SitAction {
  return {
    id: 'subsidise', name: T('Send subsidies', 'Hilfsgelder senden'), cooldown: 365 * 2,
    desc: T(`Send ${months} months of our tax income to the leader of a side: it fights on with our gold and thinks better of us (+20).`, `Sendet ${months} Monatssteuern an den Anführer einer Seite: Er kämpft mit unserem Gold weiter und denkt besser von uns (+20).`),
    cost: (s, n) => ({ gold: goldOf(n, months) }),
    targets: (s, w, n, sit) => sidesOf(s, w, sit).map((x) => x.members[0]).filter((x) => x !== undefined && x !== n.id && !!alive(s, x)),
    check: (s, w, n, sit, t) => (t === undefined || !alive(s, t) || t === n.id || !sidesOf(s, w, sit).some((x) => x.members[0] === t) ? 'invalid target' : atWar(s, n.id, t) ? 'at war with them' : null),
    apply: (s, w, n, sit, t) => { const r = s.nations[t!]; r.treasury += goldOf(n, months); addOpinion(s, r.id, n.id, 'subsidies', 20, 365 * 5, true); },
    ai: (s, w, n, sit) => {
      if (n.treasury < goldOf(n, months) * 5) return null;
      for (const side of sidesOf(s, w, sit)) { const lead = side.members[0]; if (lead === undefined || lead === n.id || side.members.includes(n.id)) continue; if (hasTreaty(s, n.id, lead, 'alliance') || opinion(s, n.id, lead) > 40) return lead; }
      return null;
    },
  };
}
/** Join the war of a side (the situation's war: one between the sides' leaders). */
function joinSide(sidesOf: (s: GameState, w: World, sit: Situation) => SitSide[], warOf: (s: GameState, sit: Situation) => War | undefined, aiWants: (s: GameState, n: Nation, side: SitSide, sit: Situation) => boolean): SitAction {
  return {
    id: 'join_war', name: T('Join the war', 'In den Krieg eintreten'), cooldown: 365,
    desc: T('Enter the war on the side of its leader. Our allies are not called.', 'Tretet auf der Seite ihres Anführers in den Krieg ein. Unsere Verbündeten werden nicht gerufen.'),
    cost: () => ({}),
    targets: (s, w, n, sit) => { const war = warOf(s, sit); if (!war) return []; return [war.attLead, war.defLead].filter((x) => x !== n.id); },
    check: (s, w, n, sit, t) => {
      const war = warOf(s, sit); if (!war) return 'no such war';
      if (inWar(war, n.id)) return 'already in this war';
      if (t !== war.attLead && t !== war.defLead) return 'invalid target';
      if (n.overlord >= 0) return 'subjects cannot do this';
      const foes = t === war.attLead ? war.def : war.att;
      if (foes.some((f) => hasTreaty(s, n.id, f, 'alliance') || hasTreaty(s, n.id, f, 'truce'))) return 'we have a treaty with their enemies';
      return null;
    },
    apply: (s, w, n, sit, t) => {
      const war = warOf(s, sit)!; (t === war.attLead ? war.att : war.def).push(n.id);
      for (const f of t === war.attLead ? war.def : war.att) addOpinion(s, f, n.id, 'war_declared', -40, 365 * 10);
      chronicle(s, n.id, 'war', T(`${n.short.en} entered the ${war.name.en}.`, `${n.short.de} trat in den Krieg ein: ${war.name.de}.`));
    },
    ai: (s, w, n, sit) => {
      const war = warOf(s, sit); if (!war || inWar(war, n.id) || n.warExhaustion > 30 || n.overlord >= 0 || s.wars.some((x) => inWar(x, n.id))) return null;
      const sides = sidesOf(s, w, sit);
      for (const lead of [war.attLead, war.defLead]) {
        const side = sides.find((x) => x.members.includes(lead)); if (!side) continue;
        const foes = lead === war.attLead ? war.def : war.att;
        if (foes.some((f) => hasTreaty(s, n.id, f, 'alliance') || hasTreaty(s, n.id, f, 'truce'))) continue;
        if (aiWants(s, n, side, sit)) return lead;
      }
      return null;
    },
  };
}
/** A modifier bought with gold or Authority. */
function boon(id: string, name: I18n, desc: I18n, years: number, effects: Record<string, number>, cost: (s: GameState, n: Nation) => SitCost, who: (s: GameState, w: World, n: Nation, sit: Situation) => string | null, ai: (s: GameState, w: World, n: Nation, sit: Situation) => boolean, extra?: (s: GameState, w: World, n: Nation, sit: Situation) => void): SitAction {
  return {
    id, name, desc, cost, cooldown: Math.round(years * 365),
    check: (s, w, n, sit) => who(s, w, n, sit),
    apply: (s, w, n, sit) => { setMod(s, n, `sit_${id}`, years, name, effects); extra?.(s, w, n, sit); },
    ai: (s, w, n, sit) => (ai(s, w, n, sit) ? -1 : null),
  };
}
const latinOnly = (s: GameState, w: World, n: Nation) => (n.faith === LATIN ? null : 'only realms of the Latin Church can do this');
const christian = (n: Nation) => faithFamily(n.faith) === 'christian';
const rich = (n: Nation, months: number) => n.treasury > goldOf(n, months) * 4;
/** Whether the plague is in our land or within 800 km of our capital now (a quarantine or a procession does
 *  nothing while it is far away). */
function plagueNear(s: GameState, w: World, n: Nation): boolean {
  const P = s.loc.plague, cap = n.capital;
  for (let l = 0; l < w.L; l++) if (P[l] > 0.02 && (s.loc.owner[l] === n.id || (cap >= 0 && w.distKm(cap, l) < 800))) return true;
  return false;
}
const plagueRefusal = (s: GameState, w: World, n: Nation, sit: Situation) => (sit.stage !== 1 ? 'no wave of plague is under way' : !plagueNear(s, w, n) ? 'the plague is far from our realm' : null);
// ---- the Horde: its bar follows content/situations.ts hordeProgress, which the actions read as well
const hordeYear = (s: GameState) => dayToDate(s.day, s.startYear).y;
const hordeHuman = (s: GameState, sit: Situation) => { const h = s.nations[sit.data.h]; return !!h && (s.playerNations.includes(h.id) || !!h.playerId); };
/** How far an action adding unity or strife would move the Horde's bar now (0 while the bar is held at its bounds). */
function hordeDelta(s: GameState, sit: Situation, dUnity: number, dStrife: number): number {
  if (sit.stage !== 0) return 0;
  const y = hordeYear(s), u = sit.data.unity || 0, st = sit.data.strife || 0;
  return hordeProgress(y, Math.min(HORDE_CAP, u + dUnity), Math.min(HORDE_CAP, st + dStrife)) - hordeProgress(y, u, st);
}
/** Redraw the bar with the same formula the monthly update uses. */
const hordeRedraw = (s: GameState, sit: Situation) => { sit.progress = hordeProgress(hordeYear(s), sit.data.unity || 0, sit.data.strife || 0); };
const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);
/** Convert up to k of our places of the given faiths back to ours (with unrest). */
function reclaim(s: GameState, n: Nation, faiths: number[], k: number) {
  let done = 0;
  for (const l of nationLocsRO(s, n.id)) {
    if (done >= k) break;
    if (!faiths.includes(s.loc.faith[l])) continue;
    s.loc.faith[l] = n.faith; s.loc.unrest[l] = clamp(s.loc.unrest[l] + 10, 0, 100); done++;
  }
  return done;
}
const ownsFaith = (s: GameState, n: Nation, faiths: number[]) => nationLocsRO(s, n.id).some((l) => faiths.includes(s.loc.faith[l]));

// ---------------------------------------------------------------- the situations
const franceSides = (s: GameState, w: World, sit: Situation): SitSide[] => {
  const en = sit.data.en, fr = sit.data.fr;
  const side = (lead: number, other: number) => [lead, ...s.nations.filter((x) => x.alive && (x.overlord === lead || (hasTreaty(s, x.id, lead, 'alliance') && !hasTreaty(s, x.id, other, 'alliance')))).map((x) => x.id)];
  return [{ name: T('The English claim', 'Der englische Anspruch'), members: alive(s, en) ? side(en, fr) : [] }, { name: T('The French crown', 'Die französische Krone'), members: alive(s, fr) ? side(fr, en) : [] }];
};
const franceWar = (s: GameState, sit: Situation) => s.wars.find((x) => (x.att.includes(sit.data.en) && x.def.includes(sit.data.fr)) || (x.att.includes(sit.data.fr) && x.def.includes(sit.data.en)));
const schismSides = (s: GameState): SitSide[] => {
  const latin = s.nations.filter((n) => n.alive && n.faith === LATIN).sort((a, b) => nationDev(s, b.id) - nationDev(s, a.id));
  const rome = latin.filter((n) => n.flags.obedience !== 1).map((n) => n.id), avi = latin.filter((n) => n.flags.obedience === 1).map((n) => n.id);
  const lead = (ids: number[], k: number) => (ids.includes(k) ? [k, ...ids.filter((x) => x !== k)] : ids);
  return [{ name: T('Roman obedience', 'Römische Obödienz'), members: lead(rome, s.papacy.holder) }, { name: T('Avignon obedience', 'Avignonesische Obödienz'), members: lead(avi, s.papacy.antipope ?? -1) }];
};
const hussites = (s: GameState) => s.nations.filter((n) => n.alive && n.faith === FAITH_INDEX.hussite).map((n) => n.id);
const crusadeWar = (s: GameState) => s.wars.find((x) => x.goal.type === 'faith' && hussites(s).includes(x.defLead));
const REFORMED = [FAITH_INDEX.evangelical, FAITH_INDEX.reformed];
const ottWarOf = (s: GameState, sit: Situation) => s.wars.find((x) => x.attLead === sit.data.ott);
const granadaWar = (s: GameState, sit: Situation) => s.wars.find((x) => x.def.includes(sit.data.g) && x.goal.type === 'faith');
const confWar = (s: GameState, sit: Situation) => s.wars.find((x) => x.id === sit.data.war);
const revWar = (s: GameState, sit: Situation) => s.wars.find((x) => x.goal.type === 'coalition' && (sit.data.revs ?? []).includes(x.goal.target));

export const SIT_EXTRA: Record<string, SitExtra> = {
  great_pestilence: {
    sides: (s, w) => {
      const hit = new Map<number, number>();
      for (let l = 0; l < w.L; l++) if (s.loc.plague[l] > 0.02) { const o = s.loc.owner[l]; if (o >= 0) hit.set(o, (hit.get(o) ?? 0) + 1); }
      return [{ name: T('Realms struck by the plague now', 'Jetzt von der Pest befallene Reiche'), members: [...hit.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]) }];
    },
    drivers: (s, w, sit) => ({ kind: 'monthly', rows: sit.progress > 0 ? [['x_sit_wave_fades', -5]] : [], note: T(`Strength of the last wave: ${sit.progress}. The next great wave is expected in ${sit.data.next}.`, `Stärke der letzten Welle: ${sit.progress}. Die nächste große Welle wird ${sit.data.next} erwartet.`) }),
    stageInfo: [T('Between waves the land recovers; struck places are spared for some years.', 'Zwischen den Wellen erholt sich das Land; befallene Orte bleiben einige Jahre verschont.'), T('A wave spreads from a great port along roads and sea lanes; towns lose a large share of their people.', 'Eine Welle breitet sich von einem großen Hafen über Straßen und Seewege aus; Städte verlieren einen großen Teil ihrer Bewohner.')],
    actions: [
      boon('quarantine', T('Close the ports and gates', 'Häfen und Tore schließen'), T('For two years half of all infections in our realm are stopped, but trade suffers (-5 %).', 'Zwei Jahre lang wird die Hälfte aller Ansteckungen in unserem Reich verhindert, doch der Handel leidet (-5 %).'), 2, { plague_guard: 0.5, trade: -0.05 },
        (s, n) => ({ gold: goldOf(n, 2) }), plagueRefusal, (s, w, n, sit) => sit.stage === 1 && rich(n, 2) && plagueNear(s, w, n)),
      boon('pest_houses', T('Build pest houses', 'Pesthäuser bauen'), T('For fifteen years a fifth of all infections in our realm are stopped.', 'Fünfzehn Jahre lang wird ein Fünftel aller Ansteckungen in unserem Reich verhindert.'), 15, { plague_guard: 0.2 },
        (s, n) => ({ gold: goldOf(n, 6), authority: 20 }), (s, w, n) => (n.era < 1 ? 'not yet possible in this era' : null), (s, w, n) => rich(n, 6) && n.authority > 60),
      boon('processions', T('Hold penitential processions', 'Bußprozessionen abhalten'), T('The faithful are comforted (+5 Mandate for a year), but crowds spread the plague (10 % more infections).', 'Die Gläubigen werden getröstet (+5 Mandat für ein Jahr), doch Menschenmengen verbreiten die Pest (10 % mehr Ansteckungen).'), 1, { mandate: 5, plague_guard: -0.1 },
        () => ({ authority: 10 }), plagueRefusal, (s, w, n, sit) => sit.stage === 1 && n.mandate < 35 && plagueNear(s, w, n)),
    ],
  },
  kings_code: {
    sides: (s, w, sit) => [{ name: T('The crown and its code', 'Die Krone und ihr Gesetzbuch'), members: alive(s, sit.data.b) ? [sit.data.b] : [] },
      { name: T('Foreign backers of the lords', 'Fremde Förderer der Herren'), members: (sit.data.backers ?? []).filter((x: number) => !!alive(s, x)) }],
    drivers: (s, w, sit) => ({ kind: 'level', rows: kingsCodeRows(s, sit), note: T(`From ${CODE_PROCLAIM} the crown can proclaim its code; below -40 the lords band together, and after two years there the code must be withdrawn. The royal judges and the lords' foreign gold count up to ${CODE_CAP} each and fade by half a point a month.`, `Ab ${CODE_PROCLAIM} kann die Krone ihr Gesetzbuch verkünden; unter -40 schließen sich die Herren zusammen, und nach zwei Jahren dort muss das Gesetzbuch zurückgezogen werden. Die königlichen Richter und das fremde Gold der Herren zählen je bis ${CODE_CAP} und schwinden um einen halben Punkt im Monat.`) }),
    stageInfo: [T('The crown works for its code; the lords watch.', 'Die Krone wirbt für ihr Gesetzbuch; die Herren warten ab.'), T('Below -40 the lords band together: two years of it and the king must withdraw the code.', 'Unter -40 verbünden sich die Herren: Nach zwei Jahren muss der König das Gesetzbuch zurückziehen.'), T(`From ${CODE_PROCLAIM} the crown can proclaim the code (50 Authority): +10 % Authority gain and +5 % control for good, the magnates lose 15 contentment.`, `Ab ${CODE_PROCLAIM} kann die Krone das Gesetzbuch verkünden (50 Autorität): dauerhaft +10 % Autoritätsgewinn und +5 % Kontrolle, die Magnaten verlieren 15 Zufriedenheit.`)],
    actions: [
      {
        id: 'royal_judges', name: T('Send royal judges into the land', 'Königliche Richter ins Land senden'), cooldown: 365,
        desc: T(`Royal judges ride the circuits and hear the lords' cases: the code gains 20 (at most ${CODE_CAP}, fading by half a point a month); the magnates resent it (-5 contentment).`, `Königliche Richter reisen über Land und hören die Fälle der Herren: Das Gesetzbuch gewinnt 20 (höchstens ${CODE_CAP}, schwindet um einen halben Punkt im Monat); die Magnaten verübeln es (-5 Zufriedenheit).`),
        cost: (s, n) => ({ gold: goldOf(n, 3) }),
        check: (s, w, n, sit) => (n.id !== sit.data.b ? 'only the crown of Bohemia can do this' : (sit.data.judges || 0) >= CODE_CAP - 1 ? 'the royal judges are everywhere already' : null),
        apply: (s, w, n, sit) => { sit.data.judges = Math.min(CODE_CAP, (sit.data.judges || 0) + 20); const m = n.estates.find((e) => e.id === 'magnates'); if (m) m.contentment = clamp(m.contentment - 5, 0, 100); sit.progress = kingsCodeLevel(s, sit); },
        // (the crown keeps its judges riding while it can spare six months of taxes)
        ai: (s, w, n, sit) => (sit.progress < CODE_PROCLAIM && n.treasury > goldOf(n, 3) * 2 ? -1 : null),
      },
      {
        id: 'win_lords', name: T('Win the lords with fiefs and offices', 'Die Herren mit Lehen und Ämtern gewinnen'), cooldown: 365 * 2,
        desc: T('Fiefs, offices and pledges redeemed for the great lords: the magnates are pleased (+10 contentment), which counts half in the code.', 'Lehen, Ämter und ausgelöste Pfänder für die großen Herren: Die Magnaten sind erfreut (+10 Zufriedenheit), was zur Hälfte für das Gesetzbuch zählt.'),
        cost: (s, n) => ({ gold: goldOf(n, 5) }),
        check: (s, w, n, sit) => { if (n.id !== sit.data.b) return 'only the crown of Bohemia can do this'; const m = n.estates.find((e) => e.id === 'magnates'); return !m ? 'invalid target' : m.contentment >= 90 ? 'the magnates are content already' : null; },
        apply: (s, w, n, sit) => { const m = n.estates.find((e) => e.id === 'magnates'); if (m) m.contentment = clamp(m.contentment + 10, 0, 100); sit.progress = kingsCodeLevel(s, sit); },
        ai: (s, w, n, sit) => { const m = n.estates.find((e) => e.id === 'magnates'); return m && m.contentment < 40 && n.treasury > goldOf(n, 5) * 2 ? -1 : null; },
      },
      {
        id: 'proclaim', name: T('Proclaim the code', 'Das Gesetzbuch verkünden'), cooldown: 0,
        desc: T(`From a standing of ${CODE_PROCLAIM}: the code becomes the law of the land. For good: +10 % Authority gain, +5 % control, +10 prestige; the magnates lose 15 contentment.`, `Ab einem Stand von ${CODE_PROCLAIM}: Das Gesetzbuch wird Landrecht. Dauerhaft: +10 % Autoritätsgewinn, +5 % Kontrolle, +10 Ansehen; die Magnaten verlieren 15 Zufriedenheit.`),
        cost: () => ({ authority: 50 }),
        check: (s, w, n, sit) => (n.id !== sit.data.b ? 'only the crown of Bohemia can do this' : sit.progress < CODE_PROCLAIM ? 'the code is not yet strong enough to proclaim' : null),
        apply: (s, w, n, sit) => { finishCode(s, sit, 'proclaimed'); },
        ai: (s, w, n, sit) => (sit.progress >= CODE_PROCLAIM ? -1 : null),
      },
      {
        id: 'withdraw', name: T('Withdraw the code', 'Das Gesetzbuch zurückziehen'), cooldown: 0,
        desc: T('Give up the code: the magnates are relieved (+15 contentment), the crown loses face (-5 prestige) and for thirty years gains Authority more slowly (-10 %).', 'Das Gesetzbuch aufgeben: Die Magnaten sind erleichtert (+15 Zufriedenheit), die Krone verliert das Gesicht (-5 Ansehen) und gewinnt dreißig Jahre lang langsamer Autorität (-10 %).'),
        cost: () => ({}),
        check: (s, w, n, sit) => (n.id !== sit.data.b ? 'only the crown of Bohemia can do this' : null),
        apply: (s, w, n, sit) => { finishCode(s, sit, 'withdrawn'); },
        ai: (s, w, n, sit) => (sit.stage === 1 && (sit.data.low || 0) >= 18 ? -1 : null),
      },
      {
        id: 'back_lords', name: T('Back the Bohemian lords', 'Die böhmischen Herren unterstützen'), cooldown: 365 * 2,
        desc: T(`Gold for the lords' league: the code loses 20 (at most ${CODE_CAP}, fading by half a point a month); the Bohemian crown thinks far worse of us (-25).`, `Gold für den Herrenbund: Das Gesetzbuch verliert 20 (höchstens ${CODE_CAP}, schwindet um einen halben Punkt im Monat); die böhmische Krone denkt viel schlechter von uns (-25).`),
        cost: (s, n) => ({ gold: goldOf(n, 4) }),
        check: (s, w, n, sit) => (n.id === sit.data.b ? 'we cannot back the lords against ourselves' : !alive(s, sit.data.b) ? 'invalid target' : (sit.data.league || 0) >= CODE_CAP - 1 ? 'the lords have gold enough already' : null),
        apply: (s, w, n, sit) => { sit.data.league = Math.min(CODE_CAP, (sit.data.league || 0) + 20); if (!(sit.data.backers ?? []).includes(n.id)) (sit.data.backers ??= []).push(n.id); addOpinion(s, sit.data.b, n.id, 'backed_the_lords', -25, 365 * 5); sit.progress = kingsCodeLevel(s, sit); },
        ai: (s, w, n, sit) => (n.rivals.includes(sit.data.b) && rich(n, 4) && sit.progress > 0 ? -1 : null),
      },
    ],
  },
  crown_of_france: {
    sides: franceSides,
    drivers: (s, w, sit) => {
      const land = (sit.data.land as number[] | undefined)?.length ?? 0; const share = land ? (sit.data.held ?? 0) / land : 0;
      return { kind: 'level', rows: [[T(`French land held by the English side: ${Math.round(share * 100)} %`, `Französisches Land in Hand der englischen Seite: ${Math.round(share * 100)} %`), Math.round(share * 250)], ['x_sit_fr_base', -38]],
        note: T(`The next bout of the war can begin in ${sit.data.nextWar}. Above 55 % for three years England wins the crown.`, `Der nächste Waffengang kann ${sit.data.nextWar} beginnen. Über 55 % für drei Jahre gewinnt England die Krone.`) };
    },
    stageInfo: [T('England presses its claim; the war is fought in bouts with truces between them.', 'England macht seinen Anspruch geltend; der Krieg wird in Waffengängen mit Waffenstillständen dazwischen geführt.'), T('Truces and reconquest: whoever has the upper hand renews the war when the truce ends.', 'Waffenstillstände und Rückeroberung: Wer im Vorteil ist, erneuert den Krieg nach dem Waffenstillstand.'), T('England holds more than 30 %: from 1429 France rallies (morale and manpower +10 %).', 'England hält mehr als 30 %: Ab 1429 erhebt sich Frankreich (Moral und Wehrkraft +10 %).'), T('France recovers its land; the contest ends with a French victory or a partition.', 'Frankreich gewinnt sein Land zurück; der Streit endet mit einem französischen Sieg oder einer Teilung.')],
    actions: [
      subsidise(franceSides),
      joinSide(franceSides, franceWar, (s, n, side) => side.members.includes(n.id)),
      boon('rally', T('Rally the realm', 'Das Reich aufbieten'), T('For five years France fights with 10 % more morale and manpower.', 'Fünf Jahre lang kämpft Frankreich mit 10 % mehr Moral und Wehrkraft.'), 5, { morale: 0.1, manpower: 0.1 },
        () => ({ authority: 50 }), (s, w, n, sit) => (n.id === sit.data.fr ? null : 'only the French crown can do this'), (s, w, n, sit) => sit.progress > 20 && n.authority > 80),
      {
        id: 'seek_truce', name: T('Seek a long truce', 'Einen langen Waffenstillstand suchen'), cooldown: 365 * 10,
        desc: T('Envoys delay the next bout of the war by five years (costs 10 prestige).', 'Gesandte verschieben den nächsten Waffengang um fünf Jahre (kostet 10 Ansehen).'),
        cost: () => ({ prestige: 10 }),
        check: (s, w, n, sit) => (n.id !== sit.data.en && n.id !== sit.data.fr ? 'only the two crowns can do this' : atWar(s, sit.data.en, sit.data.fr) ? 'not while the war is fought' : null),
        apply: (s, w, n, sit) => { sit.data.nextWar = Math.max(sit.data.nextWar ?? 0, Math.floor(s.startYear + s.day / 365.25)) + 5; },
        ai: (s, w, n, sit) => ((n.id === sit.data.en ? sit.progress < -20 : sit.progress > 30) && n.warExhaustion > 15 ? -1 : null),
      },
    ],
  },
  western_schism: {
    sides: (s) => schismSides(s),
    drivers: (s, w, sit) => {
      const sides = schismSides(s); const d = (ids: number[]) => ids.reduce((p, id) => p + Math.max(1, nationDev(s, id)), 0);
      const r = d(sides[0].members), a = d(sides[1].members); const bal = r + a > 0 ? Math.min(r, a) / (r + a) * 2 : 0;
      return { kind: 'monthly', rows: [['x_sit_schism_scandal', 0.06], [T(`Balance of the obediences (${Math.round(r / Math.max(1, r + a) * 100)} % Roman)`, `Gleichgewicht der Obödienzen (${Math.round(r / Math.max(1, r + a) * 100)} % römisch)`), +(0.12 * bal).toFixed(3)]],
        note: T(`Reform pressure now: ${Math.round(s.papacy.reformPressure)}. At 35 rival councils meet; at 55 (from 1409) a council of union may end the schism.`, `Reformdruck jetzt: ${Math.round(s.papacy.reformPressure)}. Ab 35 tagen rivalisierende Konzile; ab 55 (ab 1409) kann ein Unionskonzil die Spaltung beenden.`) };
    },
    stageInfo: [T('Every Latin realm chooses an obedience; realms of different obedience distrust each other (-15).', 'Jedes lateinische Reich wählt eine Obödienz; Reiche verschiedener Obödienz misstrauen einander (-15).'), T('Rival councils: the call for reform grows; every Latin realm loses some Mandate.', 'Rivalisierende Konzile: Der Ruf nach Reform wächst; jedes lateinische Reich verliert etwas Mandat.'), T('The council of union: each June it may depose the rival popes and end the schism.', 'Das Unionskonzil: Jeden Juni kann es die rivalisierenden Päpste absetzen und die Spaltung beenden.')],
    actions: [
      {
        id: 'switch_obedience', name: T('Change obedience', 'Obödienz wechseln'), cooldown: 365 * 10,
        desc: T('Go over to the other pope: the realms of his obedience think better of us, the others worse.', 'Wechselt zum anderen Papst: Die Reiche seiner Obödienz denken besser von uns, die anderen schlechter.'),
        cost: () => ({ authority: 30 }), check: (s, w, n) => latinOnly(s, w, n),
        apply: (s, w, n) => {
          n.flags.obedience = n.flags.obedience === 1 ? 0 : 1;
          for (const o of s.nations) if (o.alive && o.faith === LATIN && o.id !== n.id) addOpinion(s, o.id, n.id, 'changed_obedience', o.flags.obedience === n.flags.obedience ? 15 : -15, 365 * 5);
        },
        ai: (s, w, n) => {
          const side = schismSides(s)[n.flags.obedience === 1 ? 0 : 1]; const lead = side.members[0];
          return lead !== undefined && opinion(s, n.id, lead) > 60 && n.authority > 80 ? -1 : null;
        },
      },
      {
        id: 'call_council', name: T('Call for a general council', 'Ein allgemeines Konzil fordern'), cooldown: 365 * 5,
        desc: T('Our envoys press for a council of the whole Church: reform pressure +6.', 'Unsere Gesandten drängen auf ein Konzil der ganzen Kirche: Reformdruck +6.'),
        cost: () => ({ authority: 40, prestige: 10 }),
        check: (s, w, n) => latinOnly(s, w, n) ?? (n.rank === 'kingdom' || n.rank === 'empire' || s.empire.emperor === n.id ? null : 'only kings and the emperor can do this'),
        apply: (s, w, n, sit) => { s.papacy.reformPressure = clamp(s.papacy.reformPressure + 6, 0, 100); sit.data.convener = n.id; },
        ai: (s, w, n) => (s.papacy.reformPressure >= 30 && (s.empire.emperor === n.id || n.rank === 'empire') && n.authority > 70 ? -1 : null),
      },
      {
        id: 'back_your_pope', name: T('Back our pope with gold', 'Unseren Papst mit Gold stützen'), cooldown: 365 * 3,
        desc: T('Gold for the curia of our obedience: reform pressure -3, the curia favours us (+10).', 'Gold für die Kurie unserer Obödienz: Reformdruck -3, die Kurie begünstigt uns (+10).'),
        cost: (s, n) => ({ gold: goldOf(n, 3) }), check: (s, w, n) => latinOnly(s, w, n),
        apply: (s, w, n) => { s.papacy.reformPressure = clamp(s.papacy.reformPressure - 3, 0, 100); s.papacy.curiaFavour[n.id] = (s.papacy.curiaFavour[n.id] ?? 0) + 10; },
        ai: (s, w, n, sit) => ((n.id === sit.data.rome || n.id === sit.data.avignon) && s.papacy.reformPressure > 45 && rich(n, 3) ? -1 : null),
      },
    ],
  },
  hussite_movement: {
    sides: (s) => [{ name: T('Realms of the chalice', 'Reiche des Kelches'), members: hussites(s) }, { name: T('Crusaders', 'Kreuzfahrer'), members: crusadeWar(s)?.att ?? [] }],
    drivers: (s, w) => ({ kind: 'level', rows: [[T('Places that took the chalice', 'Orte, die den Kelch nahmen'), Math.min(100, faithLocs(s, w, FAITH_INDEX.hussite))]], note: T('The chalice spreads every second month from town to town, far more readily among Czech speakers.', 'Der Kelch breitet sich jeden zweiten Monat von Stadt zu Stadt aus, weit eher bei Tschechischsprachigen.') }),
    stageInfo: [T('Preachers spread the chalice; where most of a land takes it, its crown may follow.', 'Prediger verbreiten den Kelch; wo der größte Teil eines Landes ihn annimmt, kann die Krone folgen.'), T('A crown of the chalice is attacked by crusades (every four years, at most four).', 'Eine Krone des Kelches wird von Kreuzzügen angegriffen (alle vier Jahre, höchstens vier).'), T('Twelve years without a crusade: the Church makes its peace with the chalice.', 'Zwölf Jahre ohne Kreuzzug: Die Kirche schließt Frieden mit dem Kelch.')],
    actions: [
      {
        id: 'suppress', name: T('Suppress the preachers', 'Die Prediger unterdrücken'), cooldown: 365 * 2,
        desc: T('Up to three of our places of the chalice return to the Latin Church (with unrest).', 'Bis zu drei unserer Orte des Kelches kehren zur lateinischen Kirche zurück (mit Unruhe).'),
        cost: () => ({ authority: 30 }),
        check: (s, w, n) => latinOnly(s, w, n) ?? (ownsFaith(s, n, [FAITH_INDEX.hussite]) ? null : 'none of our places hold this faith'),
        apply: (s, w, n) => { reclaim(s, n, [FAITH_INDEX.hussite], 3); },
        ai: (s, w, n) => (n.authority > 60 && ownsFaith(s, n, [FAITH_INDEX.hussite]) ? -1 : null),
      },
      boon('tolerate', T('Tolerate the chalice', 'Den Kelch dulden'), T('Ten years of toleration: more tolerance (+20 %), less unrest (-2).', 'Zehn Jahre Duldung: mehr Toleranz (+20 %), weniger Unruhe (-2).'), 10, { tolerance: 0.2, unrest: -2 },
        () => ({ authority: 20 }), (s, w, n) => (ownsFaith(s, n, [FAITH_INDEX.hussite]) ? null : 'none of our places hold this faith'), (s, w, n) => n.faith !== LATIN && ownsFaith(s, n, [FAITH_INDEX.hussite])),
      joinSide((s) => [{ name: T('Crusaders', 'Kreuzfahrer'), members: crusadeWar(s) ? [crusadeWar(s)!.attLead] : [] }, { name: T('Chalice', 'Kelch'), members: crusadeWar(s) ? [crusadeWar(s)!.defLead] : [] }], (s) => crusadeWar(s),
        (s, n, side) => n.faith === LATIN ? side.name.en === 'Crusaders' : n.faith === FAITH_INDEX.hussite && side.name.en === 'Chalice'),
      subsidise((s) => [{ name: T('Chalice', 'Kelch'), members: hussites(s).slice(0, 1) }]),
    ],
  },
  reformation: {
    sides: (s) => [{ name: T('Realms of the reformed churches', 'Reiche der reformierten Kirchen'), members: s.nations.filter((n) => n.alive && isReform(n.faith)).sort((a, b) => nationDev(s, b.id) - nationDev(s, a.id)).map((n) => n.id) }, { name: T('Realms of the old Church', 'Reiche der alten Kirche'), members: s.nations.filter((n) => n.alive && n.faith === LATIN).sort((a, b) => nationDev(s, b.id) - nationDev(s, a.id)).slice(0, 12).map((n) => n.id) }],
    drivers: (s, w) => {
      const e = faithLocs(s, w, FAITH_INDEX.evangelical), r = faithLocs(s, w, FAITH_INDEX.reformed);
      return { kind: 'level', rows: [[T(`Evangelical places (${e}) / 15`, `Evangelische Orte (${e}) / 15`), +(e / 15).toFixed(1)], [T(`Reformed places (${r}) / 15`, `Reformierte Orte (${r}) / 15`), +(r / 15).toFixed(1)]],
        note: T(`The teaching spreads faster the more corrupt the Curia is (corruption ${Math.round(s.papacy.corruption)}); a realm's reform pressure speeds or slows it in its own land.`, `Die Lehre breitet sich umso schneller aus, je verderbter die Kurie ist (Verderbnis ${Math.round(s.papacy.corruption)}); der Reformdruck eines Reiches beschleunigt oder bremst sie im eigenen Land.`) };
    },
    stageInfo: [T('Theses and pamphlets: the new teaching spreads from its first town.', 'Thesen und Flugschriften: Die neue Lehre breitet sich von ihrer ersten Stadt aus.'), T('From the third year princes adopt it and seize church lands (+3 % tax).', 'Ab dem dritten Jahr nehmen Fürsten sie an und ziehen Kirchengut ein (+3 % Steuern).'), T('After twelve years a stricter reformed church rises in a free city of the south-west.', 'Nach zwölf Jahren entsteht in einer freien Stadt im Südwesten eine strengere reformierte Kirche.'), T('Catholic renewal: the Curia cleans its house and Latin rulers win back towns.', 'Katholische Erneuerung: Die Kurie räumt auf, lateinische Herrscher gewinnen Städte zurück.')],
    actions: [
      boon('enforce', T('Enforce the old faith', 'Den alten Glauben durchsetzen'), T('For ten years the new teaching spreads far less in our land (reform pressure -40 %), with more unrest (+2); up to three of our reformed places return at once.', 'Zehn Jahre lang breitet sich die neue Lehre in unserem Land viel weniger aus (Reformdruck -40 %), bei mehr Unruhe (+2); bis zu drei unserer reformierten Orte kehren sofort zurück.'), 10, { reform_pressure: -0.4, unrest: 2 },
        () => ({ authority: 40 }), (s, w, n) => latinOnly(s, w, n), (s, w, n) => n.authority > 70 && ownsFaith(s, n, REFORMED), (s, w, n) => { reclaim(s, n, REFORMED, 3); }),
      boon('protect_preachers', T('Protect the preachers', 'Die Prediger schützen'), T('For ten years the new teaching spreads faster in our land (reform pressure +50 %).', 'Zehn Jahre lang breitet sich die neue Lehre in unserem Land schneller aus (Reformdruck +50 %).'), 10, { reform_pressure: 0.5 },
        () => ({ authority: 20 }), (s, w, n) => (ownsFaith(s, n, [LATIN]) ? null : 'none of our places hold the old faith'), (s, w, n) => n.faith === LATIN && n.isHRE && s.empire.emperor !== n.id && n.rivals.includes(s.empire.emperor) && n.authority > 50),
      {
        id: 'fund_renewal', name: T('Fund the renewal of the Church', 'Die Erneuerung der Kirche finanzieren'), cooldown: 365 * 5,
        desc: T('Gold for reforming orders and seminaries: the corruption of the Curia falls by 3, which slows the spread; the curia favours us (+10).', 'Gold für Reformorden und Seminare: Die Verderbnis der Kurie sinkt um 3, was die Ausbreitung bremst; die Kurie begünstigt uns (+10).'),
        cost: (s, n) => ({ gold: goldOf(n, 6) }), check: (s, w, n) => latinOnly(s, w, n),
        apply: (s, w, n) => { s.papacy.corruption = clamp(s.papacy.corruption - 3, 0, 100); s.papacy.curiaFavour[n.id] = (s.papacy.curiaFavour[n.id] ?? 0) + 10; },
        ai: (s, w, n) => (n.faith === LATIN && (s.papacy.holder === n.id || n.rank === 'empire') && rich(n, 6) ? -1 : null),
      },
    ],
  },
  ottoman_rise: {
    sides: (s, w, sit) => [{ name: T('The House of Osman', 'Das Haus Osman'), members: alive(s, sit.data.ott) ? [sit.data.ott, ...s.nations.filter((x) => x.alive && x.overlord === sit.data.ott).map((x) => x.id)] : [] },
      { name: T('The City and its defenders', 'Die Stadt und ihre Verteidiger'), members: [...new Set([s.loc.owner[sit.data.city], ...(ottWarOf(s, sit)?.def ?? [])].filter((x) => x >= 0 && x !== sit.data.ott))] }],
    drivers: (s, w, sit) => {
      let europe = 0; for (const l of nationLocsRO(s, sit.data.ott)) if (w.lat[l] >= 40.3 && w.lon[l] <= 29.0 && w.lon[l] > 19) europe++;
      return { kind: 'level', rows: [[T(`Places held in Europe (${europe}) x 2.5`, `Orte in Europa (${europe}) x 2,5`), europe * 2.5], ['x_sit_ott_city', sit.stage === 2 ? 40 : 0]], note: T('Every quarter the sultan picks a war he can win; the Balkans first, the City itself from 1400.', 'Jedes Vierteljahr wählt der Sultan einen Krieg, den er gewinnen kann; zuerst den Balkan, die Stadt selbst ab 1400.') };
    },
    stageInfo: [T('A beylik on the straits gathers warriors of the frontier (morale, manpower, cheap armies).', 'Ein Fürstentum an den Meerengen sammelt Krieger der Grenze (Moral, Wehrkraft, billige Heere).'), T('Conquest of the Balkans: divided Christian crowns fall one by one.', 'Eroberung des Balkans: Geteilte christliche Kronen fallen eine nach der anderen.'), T('The siege of the City: the land walls hold only until the sultan casts great guns.', 'Die Belagerung der Stadt: Die Landmauern halten nur, bis der Sultan große Geschütze gießt.')],
    actions: [
      {
        id: 'aid_city', name: T('Aid the City', 'Der Stadt helfen'), cooldown: 365 * 5,
        desc: T('Gold and engineers for the walls: its holder gains our gold and 10 % fort strength for five years.', 'Gold und Baumeister für die Mauern: Ihr Herr erhält unser Gold und fünf Jahre lang 10 % Festungsstärke.'),
        cost: (s, n) => ({ gold: goldOf(n, 4) }),
        check: (s, w, n, sit) => { const h = alive(s, s.loc.owner[sit.data.city]); return !h || h.id === sit.data.ott ? 'no such target' : !christian(n) ? 'only Christian realms can do this' : null; },
        apply: (s, w, n, sit) => { const h = s.nations[s.loc.owner[sit.data.city]]; h.treasury += goldOf(n, 4); setMod(s, h, 'aid_for_the_walls', 5, T('Aid for the walls', 'Hilfe für die Mauern'), { fort_strength: 0.1 }); addOpinion(s, h.id, n.id, 'subsidies', 25, 365 * 5, true); },
        ai: (s, w, n, sit) => (sit.stage === 2 && christian(n) && rich(n, 4) && n.capital >= 0 && w.distKm(n.capital, sit.data.city) < 1800 && n.id !== s.loc.owner[sit.data.city] ? -1 : null),
      },
      {
        id: 'pay_tribute', name: T('Pay tribute to the sultan', 'Dem Sultan Tribut zahlen'), cooldown: 365 * 5,
        desc: T('Six months of our tax income buy five years in which the sultan picks other targets.', 'Sechs Monatssteuern kaufen fünf Jahre, in denen der Sultan andere Ziele wählt.'),
        cost: (s, n) => ({ gold: goldOf(n, 6), prestige: 5 }),
        check: (s, w, n, sit) => (!alive(s, sit.data.ott) || n.id === sit.data.ott ? 'invalid target' : atWar(s, n.id, sit.data.ott) ? 'at war with them' : null),
        apply: (s, w, n, sit) => { s.nations[sit.data.ott].treasury += goldOf(n, 6); n.flags.tribute_osman = s.day + 365 * 5; },
        ai: (s, w, n, sit) => { const o = alive(s, sit.data.ott); return o && n.capital >= 0 && o.capital >= 0 && w.distKm(n.capital, o.capital) < 900 && nationDev(s, n.id) < nationDev(s, o.id) * 0.4 && n.treasury > goldOf(n, 6) * 2 && !atWar(s, n.id, o.id) ? -1 : null; },
      },
      joinSide((s, w, sit) => { const war = ottWarOf(s, sit); return war ? [{ name: T('Defenders', 'Verteidiger'), members: [war.defLead] }] : []; }, ottWarOf,
        (s, n) => christian(n) && n.capital >= 0 && nationDev(s, n.id) > 150),
      boon('frontier_lords', T('Raise frontier lords', 'Grenzherren einsetzen'), T('For ten years our home defence is stronger (+15 %) and our forts hold better (+10 %).', 'Zehn Jahre lang ist unsere Heimatverteidigung stärker (+15 %) und unsere Festungen halten besser (+10 %).'), 10, { home_defence: 0.15, fort_strength: 0.1 },
        () => ({ authority: 40 }), (s, w, n, sit) => { const o = alive(s, sit.data.ott); return o && n.capital >= 0 && o.capital >= 0 && w.distKm(n.capital, o.capital) < 1500 && n.id !== o.id ? null : 'too far from the frontier'; },
        (s, w, n, sit) => christian(n) && n.authority > 70 && s.wars.some((x) => x.attLead === sit.data.ott && x.def.includes(n.id))),
    ],
  },
  horde_breaking: {
    sides: (s, w, sit) => [{ name: T('The Horde', 'Die Horde'), members: alive(s, sit.data.h) ? [sit.data.h] : [] }, { name: T('Tributaries of the Horde', 'Tributpflichtige der Horde'), members: s.nations.filter((x) => x.alive && x.overlord === sit.data.h).map((x) => x.id) }, { name: T('Rival khanates', 'Rivalisierende Khanate'), members: s.nations.filter((x) => x.alive && x.flags.horde_successor).map((x) => x.id) }],
    drivers: (s, w, sit) => {
      if (sit.stage > 0) return { kind: 'level', rows: [[T('The Horde has broken apart', 'Die Horde ist zerbrochen'), sit.progress]] };
      // the same formula as the situation (content/situations.ts hordeProgress), so that the rows add up to the bar
      const y = hordeYear(s), unity = sit.data.unity || 0, strife = sit.data.strife || 0;
      const rows: Row[] = [[T('Years of troubles since 1359 x 8', 'Jahre der Wirren seit 1359 x 8'), (y - 1359) * 8]];
      if (unity) rows.push(['x_sit_horde_unity', -unity]);
      if (strife) rows.push(['x_sit_horde_strife', strife]);
      const raw = hordeRaw(y, unity, strife), bar = hordeProgress(y, unity, strife);
      if (bar !== raw) rows.push([T('The bar runs from 0 to 100', 'Der Balken reicht von 0 bis 100'), bar - raw]);
      return { kind: 'level', rows, note: hordeHuman(s, sit)
        ? T('A Horde held by a player does not break apart: its khan holds it together by his own wars. The troubles weigh on it until 1430.', 'Eine Horde in der Hand eines Spielers zerbricht nicht: Ihr Khan hält sie durch seine eigenen Kriege zusammen. Die Wirren lasten bis 1430 auf ihr.')
        : T(`Each June after 1361, in peace, the emirs may break away; the higher the progress, the likelier. Purges, tribute and backed rivals each count up to ${HORDE_CAP} and fade by 3 a year.`, `Jeden Juni nach 1361 können sich die Emire im Frieden lösen; je höher der Fortschritt, desto wahrscheinlicher. Säuberungen, Tribut und unterstützte Rivalen zählen jeweils bis ${HORDE_CAP} und schwinden um 3 im Jahr.`) };
    },
    stageInfo: [T('Khans of a season: unrest +2, tax -10 %, morale -5 % for the Horde.', 'Khane einer Saison: Unruhe +2, Steuern -10 %, Moral -5 % für die Horde.'), T('A divided steppe: rival khanates rule the west, the Volga and the lands beyond the Yaik.', 'Eine geteilte Steppe: Rivalisierende Khanate herrschen im Westen, an der Wolga und jenseits des Jaik.')],
    actions: [
      {
        id: 'purge_emirs', name: T('Purge the emirs', 'Die Emire säubern'), cooldown: 365 * 3,
        desc: (s, w, n, sit) => { const d = hordeDelta(s, sit, 15, 0); return T(`The khan strikes at the overmighty emirs: unity +15 (at most ${HORDE_CAP}, fades by 3 a year). Progress now: ${signed(d)}.`, `Der Khan schlägt gegen die übermächtigen Emire zu: Einheit +15 (höchstens ${HORDE_CAP}, schwindet um 3 im Jahr). Fortschritt jetzt: ${signed(d)}.`); },
        cost: () => ({ authority: 50 }),
        check: (s, w, n, sit) => (n.id !== sit.data.h ? 'only the Horde can do this' : sit.stage !== 0 ? 'not possible at this stage' : hordeHuman(s, sit) ? 'a Horde held by a player does not break apart' : hordeDelta(s, sit, 15, 0) === 0 ? 'no effect now' : null),
        apply: (s, w, n, sit) => { sit.data.unity = Math.min(HORDE_CAP, (sit.data.unity || 0) + 15); hordeRedraw(s, sit); },
        ai: (s, w, n, sit) => (sit.progress > 30 && n.authority > 80 ? -1 : null),
      },
      {
        id: 'back_rival_khan', name: T('Back a rival khan', 'Einen rivalisierenden Khan unterstützen'), cooldown: 365 * 3,
        desc: (s, w, n, sit) => { const d = hordeDelta(s, sit, 0, 10); return T(`Gold for a pretender of the steppe: strife +10 (at most ${HORDE_CAP}, fades by 3 a year), the Horde resents us (-30). Progress now: ${signed(d)}.`, `Gold für einen Thronanwärter der Steppe: Zwietracht +10 (höchstens ${HORDE_CAP}, schwindet um 3 im Jahr), die Horde grollt uns (-30). Fortschritt jetzt: ${signed(d)}.`); },
        cost: (s, n) => ({ gold: goldOf(n, 4) }),
        check: (s, w, n, sit) => (n.id === sit.data.h || !alive(s, sit.data.h) ? 'invalid target' : sit.stage !== 0 ? 'not possible at this stage' : hordeHuman(s, sit) ? 'a Horde held by a player does not break apart' : hordeDelta(s, sit, 0, 10) === 0 ? 'no effect now' : null),
        apply: (s, w, n, sit) => { sit.data.strife = Math.min(HORDE_CAP, (sit.data.strife || 0) + 10); hordeRedraw(s, sit); addOpinion(s, sit.data.h, n.id, 'backed_pretender', -30, 365 * 10); },
        ai: (s, w, n, sit) => ((n.overlord === sit.data.h && n.libertyDesire > 40) || n.rivals.includes(sit.data.h) ? (rich(n, 4) ? -1 : null) : null),
      },
      {
        // (the gold and the khan's favour are real whatever the bar does; the window says what it does to the bar now)
        id: 'pay_tribute', name: T('Send rich tribute to Sarai', 'Reichen Tribut nach Sarai senden'), cooldown: 365 * 3,
        desc: (s, w, n, sit) => { const d = hordeDelta(s, sit, 5, 0); return T(`Gold for the khan: the Horde thinks better of us (+20) and its unity grows (+5, at most ${HORDE_CAP}). Progress now: ${signed(d)}.`, `Gold für den Khan: Die Horde denkt besser von uns (+20) und ihre Einheit wächst (+5, höchstens ${HORDE_CAP}). Fortschritt jetzt: ${signed(d)}.`); },
        cost: (s, n) => ({ gold: goldOf(n, 3) }), check: (s, w, n, sit) => (n.id === sit.data.h || !alive(s, sit.data.h) ? 'invalid target' : null),
        apply: (s, w, n, sit) => { s.nations[sit.data.h].treasury += goldOf(n, 3); if (sit.stage === 0) { sit.data.unity = Math.min(HORDE_CAP, (sit.data.unity || 0) + 5); hordeRedraw(s, sit); } addOpinion(s, sit.data.h, n.id, 'tribute', 20, 365 * 5, true); },
        ai: (s, w, n, sit) => (n.overlord === sit.data.h && n.libertyDesire < 20 && rich(n, 3) ? -1 : null),
      },
    ],
  },
  reconquista: {
    sides: (s, w, sit) => [{ name: T('The emirate', 'Das Emirat'), members: alive(s, sit.data.g) ? [sit.data.g, ...(granadaWar(s, sit)?.def.filter((x) => x !== sit.data.g) ?? [])] : [] }, { name: T('The Christian crowns', 'Die christlichen Kronen'), members: [...new Set([sit.data.champion, ...(granadaWar(s, sit)?.att ?? [])].filter((x) => x !== undefined && x >= 0))] }],
    drivers: (s, w, sit) => ({ kind: 'level', rows: [[T(`Iberian lands the emirate has lost (of ${sit.data.locs0})`, `Iberische Länder, die das Emirat verlor (von ${sit.data.locs0})`), sit.progress]], note: T('The war begins once the champion is six times as strong as the emirate (four times while a crusade is preached) or from 1440, unless parias are being paid.', 'Der Krieg beginnt, sobald der Vorkämpfer sechsmal so stark ist wie das Emirat (viermal, solange ein Kreuzzug gepredigt wird) oder ab 1440, außer es werden Parias gezahlt.') }),
    stageInfo: [T('The frontier: the emirate pays tribute; raids and truces.', 'Die Grenze: Das Emirat zahlt Tribut; Überfälle und Waffenstillstände.'), T('The war for Granada: the champion besieges the fortress towns, the city first.', 'Der Krieg um Granada: Der Vorkämpfer belagert die Festungsstädte, die Stadt zuerst.')],
    actions: [
      {
        id: 'preach_crusade', name: T('Preach a crusade', 'Einen Kreuzzug predigen'), cooldown: 365 * 10,
        desc: T('For five years the champion begins the war at four times the emirate\'s strength instead of six.', 'Fünf Jahre lang beginnt der Vorkämpfer den Krieg schon bei vierfacher statt sechsfacher Stärke des Emirats.'),
        cost: () => ({ authority: 30, prestige: 10 }), check: (s, w, n, sit) => (!christian(n) ? 'only Christian realms can do this' : sit.stage !== 0 ? 'not possible at this stage' : null),
        apply: (s, w, n, sit) => { sit.data.crusade_until = s.day + 365 * 5; },
        ai: (s, w, n, sit) => (n.id === sit.data.champion && n.authority > 70 && !((sit.data.crusade_until ?? 0) > s.day) ? -1 : null),
      },
      joinSide((s, w, sit) => { const war = granadaWar(s, sit); return war ? [{ name: T('Crusaders', 'Kreuzfahrer'), members: [war.attLead] }] : []; }, granadaWar, (s, n) => christian(n) && n.capital >= 0 && nationDev(s, n.id) > 80),
      {
        id: 'pay_parias', name: T('Pay parias', 'Parias zahlen'), cooldown: 365 * 5,
        desc: T('Gold for the champion keeps the frontier quiet for five years: no war for Granada begins.', 'Gold für den Vorkämpfer hält die Grenze fünf Jahre ruhig: Kein Krieg um Granada beginnt.'),
        cost: (s, n) => ({ gold: goldOf(n, 6) }), check: (s, w, n, sit) => (n.id !== sit.data.g ? 'only the emirate can do this' : sit.stage !== 0 ? 'not possible at this stage' : null),
        apply: (s, w, n, sit) => { const c = alive(s, sit.data.champion); if (c) c.treasury += goldOf(n, 6); sit.data.parias_until = s.day + 365 * 5; },
        ai: (s, w, n, sit) => (n.treasury > goldOf(n, 6) * 1.5 ? -1 : null),
      },
    ],
  },
  age_of_discovery: {
    sides: (s, w) => [{ name: T('Atlantic realms', 'Atlantische Reiche'), members: atlanticRealms(s, w).map((n) => n.id) }],
    drivers: (s, w, sit) => ({ kind: 'level', rows: [[T('Share of the Ocean Sea charted', 'Kartierter Anteil des Ozeanmeers'), sit.progress]], note: T('Each June the best-equipped Atlantic realm sails the year\'s great voyage: navigation, seafaring doctrines and funding decide.', 'Jeden Juni unternimmt das am besten gerüstete atlantische Reich die große Fahrt des Jahres: Navigation, Seefahrtslehren und Finanzierung entscheiden.') }),
    stageInfo: [T('The Atlantic islands are found and settled.', 'Die atlantischen Inseln werden entdeckt und besiedelt.'), T('Round the southern cape: the sea road to the Indies opens.', 'Um das Südkap: Der Seeweg nach Indien öffnet sich.'), T('Lands beyond the Ocean are reached.', 'Länder jenseits des Ozeans werden erreicht.'), T('The scramble for the seas: realms with ten places overseas compete for the rest.', 'Der Wettlauf um die Meere: Reiche mit zehn Orten in Übersee wetteifern um den Rest.')],
    actions: [
      {
        id: 'fund_voyage', name: T('Fund a great voyage', 'Eine große Fahrt finanzieren'), cooldown: 365,
        desc: T('Ships and stores for the next great voyage: our realm counts 3 more when the year\'s voyage is chosen.', 'Schiffe und Vorräte für die nächste große Fahrt: Unser Reich zählt 3 mehr, wenn die Fahrt des Jahres vergeben wird.'),
        cost: (s, n) => ({ gold: goldOf(n, 4) }), check: (s, w, n) => (atlanticRealms(s, w).some((x) => x.id === n.id) ? null : 'only Atlantic realms can do this'),
        apply: (s, w, n, sit) => { (sit.data.fund ??= {})[n.id] = 3; },
        ai: (s, w, n) => (rich(n, 4) && n.tech[1] >= 4 ? -1 : null),
      },
      boon('hire_pilots', T('Hire foreign pilots', 'Fremde Lotsen anwerben'), T('For ten years our colonists reach further (+10 %) and our ships are cheaper to keep (-5 %).', 'Zehn Jahre lang reichen unsere Siedler weiter (+10 %) und unsere Schiffe sind billiger im Unterhalt (-5 %).'), 10, { colonial_range: 0.1, naval_cost: -0.05 },
        (s, n) => ({ gold: goldOf(n, 3) }), (s, w, n) => (atlanticRealms(s, w).some((x) => x.id === n.id) ? null : 'only Atlantic realms can do this'), (s, w, n) => rich(n, 3)),
    ],
  },
  confessional_war: {
    sides: (s) => { const sp = confessionalSplit(s); return sp ? [{ name: T('Camp of the old faith', 'Lager des alten Glaubens'), members: [sp.cath, ...sp.cathMembers.filter((x) => x !== sp.cath)] }, { name: T('Camp of the new faith', 'Lager des neuen Glaubens'), members: [sp.prot, ...sp.protMembers.filter((x) => x !== sp.prot)] }] : []; },
    drivers: (s, w, sit) => ({ kind: 'level', rows: sit.data.warStart ? [[T(`Years since the war began (${Math.max(0, Math.floor((s.day - sit.data.warStart) / 365))}) of 30`, `Jahre seit Kriegsbeginn (${Math.max(0, Math.floor((s.day - sit.data.warStart) / 365))}) von 30`), sit.progress]] : [], note: T('After four years foreign crowns join; after 25 years, or when the leader of the old faith is exhausted, a peace congress meets.', 'Nach vier Jahren treten fremde Kronen bei; nach 25 Jahren, oder wenn der Anführer des alten Glaubens erschöpft ist, tagt ein Friedenskongress.') }),
    stageInfo: [T('Armed camps: princes of both confessions arm.', 'Bewaffnete Lager: Fürsten beider Konfessionen rüsten.'), T('The imperial war: the camps fight; armies devastate the Empire.', 'Der Reichskrieg: Die Lager kämpfen; Heere verwüsten das Reich.'), T('Foreign intervention: crowns of the new faith and rivals of the emperor join.', 'Ausländische Einmischung: Kronen des neuen Glaubens und Rivalen des Kaisers treten bei.'), T('The peace congress settles the order of the Empire.', 'Der Friedenskongress ordnet das Reich neu.')],
    actions: [
      joinSide((s) => SIT_EXTRA.confessional_war.sides(s, null as unknown as World, s.situations.find((x) => x.id === 'confessional_war')!), confWar, (s, n, side) => side.members.includes(n.id)),
      subsidise((s) => SIT_EXTRA.confessional_war.sides(s, null as unknown as World, s.situations.find((x) => x.id === 'confessional_war')!)),
      {
        id: 'peace_congress', name: T('Press for a peace congress', 'Auf einen Friedenskongress drängen'), cooldown: 365 * 5,
        desc: T('Our envoys bring the camps to the table sooner: the war counts three years longer (progress +10), so the congress comes earlier.', 'Unsere Gesandten bringen die Lager früher an den Tisch: Der Krieg zählt drei Jahre länger (Fortschritt +10), der Kongress kommt früher.'),
        cost: () => ({ authority: 40, prestige: 10 }), check: (s, w, n, sit) => (sit.stage < 1 || !sit.data.warStart ? 'not possible at this stage' : null),
        apply: (s, w, n, sit) => { sit.data.warStart -= 365 * 3; sit.progress = Math.round(clamp((s.day - sit.data.warStart) / 365 / 30 * 100, 0, 100)); },
        ai: (s, w, n, sit) => (sit.stage >= 2 && s.ranking.slice(0, 8).includes(n.id) && !s.wars.some((x) => x.id === sit.data.war && inWar(x, n.id)) && n.authority > 80 ? -1 : null),
      },
    ],
  },
  age_of_revolution: {
    sides: (s, w, sit) => [{ name: T('Revolutionary realms', 'Revolutionäre Reiche'), members: (sit.data.revs ?? []).filter((x: number) => alive(s, x)) }, { name: T('The crowned heads', 'Die gekrönten Häupter'), members: revWar(s, sit)?.att ?? [] }],
    drivers: (s, w, sit, viewer) => {
      const P: Record<string, number> = sit.data.p ?? {}; const revs: number[] = sit.data.revs ?? [];
      const maxP = Math.max(0, ...Object.values(P));
      const rows: Row[] = revs.length ? [['x_sit_rev_base', 50], [T(`Revolutions (${revs.length}) x 15`, `Revolutionen (${revs.length}) x 15`), revs.length * 15]] : [[T('Greatest strain in any realm x 10', 'Größte Spannung in einem Reich x 10'), Math.round(maxP * 10)]];
      return { kind: 'level', rows, note: T(`Strain in our realm: ${(P[viewer] ?? 0).toFixed(1)} (unrest, debts, absolutism, bondage and literacy raise it; Concord and a parliament lower it; above 8 a revolution may break out).`, `Spannung in unserem Reich: ${(P[viewer] ?? 0).toFixed(1)} (Unruhe, Schulden, Absolutismus, Leibeigenschaft und Lesefähigkeit erhöhen sie; Eintracht und ein Parlament senken sie; über 8 kann eine Revolution ausbrechen).`) };
    },
    stageInfo: [T('The Enlightenment: strain builds in restless, indebted monarchies.', 'Die Aufklärung: Spannung wächst in unruhigen, verschuldeten Monarchien.'), T('Revolution: a crown is overthrown and a republic proclaimed.', 'Revolution: Eine Krone wird gestürzt und eine Republik ausgerufen.'), T('Wars of the coalitions: the monarchies march on the new republics.', 'Koalitionskriege: Die Monarchien marschieren gegen die neuen Republiken.')],
    actions: [
      {
        id: 'reform_from_above', name: T('Reform from above', 'Reform von oben'), cooldown: 365 * 5,
        desc: T('The crown grants reforms before they are taken: our strain is halved and Concord rises (+10 for five years).', 'Die Krone gewährt Reformen, bevor man sie ihr abringt: Unsere Spannung halbiert sich und die Eintracht steigt (+10 für fünf Jahre).'),
        cost: () => ({ authority: 60 }), check: (s, w, n) => (monarchy(n) ? null : 'only monarchies can do this'),
        apply: (s, w, n, sit) => { const P = (sit.data.p ??= {}); P[n.id] = (P[n.id] ?? 0) * 0.5; setMod(s, n, 'sit_reform_from_above', 5, T('Reform from above', 'Reform von oben'), { concord: 10 }); },
        ai: (s, w, n, sit) => ((sit.data.p?.[n.id] ?? 0) > 5 && n.authority > 90 ? -1 : null),
      },
      {
        id: 'censor_press', name: T('Censor the press', 'Die Presse zensieren'), cooldown: 365 * 3,
        desc: T('Strain -2, but learning suffers (research -10 % for five years).', 'Spannung -2, doch die Gelehrsamkeit leidet (Forschung -10 % für fünf Jahre).'),
        cost: () => ({ authority: 20 }), check: (s, w, n) => (monarchy(n) ? null : 'only monarchies can do this'),
        apply: (s, w, n, sit) => { const P = (sit.data.p ??= {}); P[n.id] = Math.max(0, (P[n.id] ?? 0) - 2); setMod(s, n, 'sit_censor_press', 5, T('Censorship', 'Zensur'), { research: -0.1 }); },
        ai: (s, w, n, sit) => ((sit.data.p?.[n.id] ?? 0) > 4 && n.authority > 50 ? -1 : null),
      },
      {
        id: 'summon_estates', name: T('Summon the estates general', 'Die Generalstände einberufen'), cooldown: 365 * 10,
        desc: T('The crown hears its subjects: strain -5, Concord +15 and the Burghers grow more content (+15).', 'Die Krone hört ihre Untertanen: Spannung -5, Eintracht +15 und die Bürger werden zufriedener (+15).'),
        cost: () => ({ authority: 30 }), check: (s, w, n) => (monarchy(n) ? null : 'only monarchies can do this'),
        apply: (s, w, n, sit) => { const P = (sit.data.p ??= {}); P[n.id] = Math.max(0, (P[n.id] ?? 0) - 5); n.concord = clamp(n.concord + 15, -100, 100); const b = n.estates.find((e) => e.id === 'burghers'); if (b) b.contentment = clamp(b.contentment + 15, 0, 100); },
        ai: (s, w, n, sit) => ((sit.data.p?.[n.id] ?? 0) > 6 ? -1 : null),
      },
      joinSide((s, w, sit) => { const war = revWar(s, sit); return war ? [{ name: T('Coalition', 'Koalition'), members: [war.attLead] }] : []; }, revWar, (s, n) => monarchy(n) && nationDev(s, n.id) > 120),
    ],
  },
};
export function sitExtra(id: string): SitExtra | undefined { return SIT_EXTRA[id]; }
