// The view of the Curia (systems/curia.ts): the pope and his country, our favour and where it comes from, the College
// of Cardinals with each bloc's leaning in a conclave, and what we can ask of Rome. Every number comes with the rows
// the simulation itself sums (breakdown tooltips).
import type { GameState, I18n } from '../sim/types';
import type { World } from '../sim/world';
import {
  COLLEGE, HAT_MAX, CONCLAVE_ROUNDS, CONCLAVE_MAJORITY, RED_HAT_FAVOUR, RED_HAT_YEARS, SIMONY_STEP, SIMONY_MAX, INDULGENCE_FAVOUR, INDULGENCE_YEARS,
  INDULGENCE_CORRUPTION, INDULGENCE_REFORM, CRUSADE_YEARS, CRUSADE_GAP, CRUSADE_MORALE, PATRON_EFFECTS, hats, collegeSize, favourOf, hatClaim,
  conclaveCandidates, cardinalScore, cardinalChoice, conclaveTally, isLatin, isHuman, redHatGold, simonyCost, indulgenceGold, crusadeFavour,
  redHatRefusal, simonyRefusal, indulgenceRefusal, crusadeRefusal, crusadeTargets, fairShare,
} from '../sim/systems/curia';
import { lawEffect } from '../sim/systems/politics';

type Row = [string | I18n, number];
const T = (en: string, de: string): I18n => ({ en, de });

/** The yearly gain of favour as realm.ts curiaGain sums it. */
function favourGain(n: GameState['nations'][number]): Row[] {
  const pre = n.estates.find((e) => e.id === 'prelates')?.contentment ?? 50;
  const rows: Row[] = [[T('Every year', 'Jedes Jahr'), 1], [T('Content prelates', 'Zufriedene Prälaten'), +(pre / 50).toFixed(2)]];
  const fx = lawEffect(n, 'curia'); if (fx) rows.push([T('Laws, privileges and modifiers', 'Gesetze, Vorrechte und Modifikatoren'), +fx.toFixed(2)]);
  return rows;
}

export function curiaView(s: GameState, w: World, me: number) {
  const P = s.papacy; const n = s.nations[me];
  const latin = isLatin(n);
  const cv = P.conclave ?? null;
  const cands = cv ? cv.candidates : conclaveCandidates(s);
  const tally = conclaveTally(s, w);
  const College = P.cardinals ?? {};
  const blocs = Object.keys(College).map(Number).sort((a, b) => College[b] - College[a] || a - b).map((id) => {
    const choice = cardinalChoice(s, w, id);
    return {
      id, hats: College[id], human: isHuman(s, id), choice, rows: choice >= 0 && !isHuman(s, id) ? cardinalScore(s, w, id, choice) : [],
      forMe: latin && id !== me && choice !== me && cands.includes(me) ? cardinalScore(s, w, id, me) : null,
      gifts: P.simony?.[`${me}>${id}`] ?? 0, giftRefusal: latin ? simonyRefusal(s, n, id) : 'not of the Latin church',
    };
  });
  const targets = latin ? crusadeTargets(s, w) : [];
  return {
    latin, excommunicated: !!n?.excommunicated,
    holder: P.holder, seat: P.seat, seatName: P.seat >= 0 ? { en: w.names[P.seat], de: w.namesDe[P.seat] ?? w.names[P.seat] } : null,
    patron: P.patron ?? -1, curial: (P.patron ?? -1) === P.holder, patronEffects: PATRON_EFFECTS,
    corruption: P.corruption, reformPressure: P.reformPressure, schism: P.schism, lastConclave: P.lastConclave ?? 0,
    favour: latin ? favourOf(s, me) : 0, gain: latin ? favourGain(n) : [],
    college: { seats: COLLEGE, max: HAT_MAX, size: collegeSize(s), mine: hats(s, me), share: latin ? fairShare(s, n) : 0, claim: latin ? hatClaim(s, w, n) : [] },
    blocs,
    conclave: cv ? { closes: cv.closes, round: cv.round, rounds: CONCLAVE_ROUNDS, myVote: cv.votes[me] ?? -1 } : null,
    candidates: cands.map((c) => ({ id: c, votes: tally.votes[c] ?? 0 })), cast: tally.cast, need: Math.ceil(tally.cast * CONCLAVE_MAJORITY),
    simony: { cost: n ? simonyCost(n) : 0, step: SIMONY_STEP, max: SIMONY_MAX, candidate: cands.includes(me) },
    redHat: { refusal: n ? redHatRefusal(s, n) : 'invalid', favour: RED_HAT_FAVOUR, gold: n ? redHatGold(n) : 0, years: RED_HAT_YEARS, again: (n?.flags.red_hat ?? -1e9) + RED_HAT_YEARS * 365 },
    indulgence: { refusal: n ? indulgenceRefusal(s, n) : 'invalid', favour: INDULGENCE_FAVOUR, gold: n ? indulgenceGold(n) : 0, years: INDULGENCE_YEARS, corruption: INDULGENCE_CORRUPTION, reform: INDULGENCE_REFORM, again: (n?.flags.indulgence ?? -1e9) + INDULGENCE_YEARS * 365 },
    crusade: {
      active: P.crusade && s.day < P.crusade.until ? { ...P.crusade } : null, refusal: n ? crusadeRefusal(s, w, n) : 'invalid', favour: n ? crusadeFavour(s, n) : 0,
      years: CRUSADE_YEARS, gap: CRUSADE_GAP, morale: CRUSADE_MORALE, last: P.lastCrusade ?? null,
      targets: targets.map((id) => ({ id, refusal: crusadeRefusal(s, w, n, id) })),
    },
  };
}
