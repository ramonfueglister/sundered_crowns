// IQ and the Big Five shift the rates of the events of a person (people feature 5, docs/PEOPLE_DESIGN.md): death
// from 15 on, a far move, and who is taken at a wedding. Each rate is the rate of the rule times
//
//   exp(b₁·z₁ + b₂·z₂) / exp((b₁² + b₂²) / 2)
//
// with z a trait in standard deviations from the mean (IQ 100 and 15, a Big Five trait 50 and 10) and b the natural
// logarithm of the source's ratio per standard deviation: the form the studies themselves estimate (proportional
// hazards, logistic regression) and the microsimulation of demography computes with (Modgen, MicSim). The divisor is
// the mean of the factor over a people of independent standard traits, so the mean rate stays what it is.
//
// All studies are of the 20th and 21st century (USA, Britain, Germany, Australia); that the relations held in 1291 is
// not known. Traits without a row here, births within marriage, the remarriage of a widow and deaths under 15 are
// not touched: the sources find nothing there, or there is none.

/** A person's traits as the columns of the person table hold them. */
export interface TraitColumns { iq: Uint8Array; o: Uint8Array; c: Uint8Array; e: Uint8Array; a: Uint8Array; n: Uint8Array }
/** IQ in standard deviations from the mean. */
export const zIq = (P: TraitColumns, id: number): number => (P.iq[id] - 100) / 15;
/** A Big Five trait (a column of the person table) in standard deviations from the mean. */
export const zOf = (col: Uint8Array, id: number): number => (col[id] - 50) / 10;

/** Death from this age on (years); the studies are of adults, under it the life table holds as it is (no source). */
export const TRAITS_FROM_AGE = 15;
/** Ratio of the force of death per standard deviation.
 *  Conscientiousness: Jokela et al. 2013, American Journal of Epidemiology 178(5): hazard ratio 0.88 (95 % interval
 *  0.82 to 0.94), mutually adjusted for the other four traits, sex, age and ethnicity; 76,150 adults, 3,947 deaths; no
 *  difference by sex, age or education; the other four traits have no effect once all are in the model.
 *  IQ: Calvin et al. 2011, International Journal of Epidemiology 40(3) (abstract): a standard deviation more is a 24 %
 *  (23 to 25) lower risk of death, 16 studies, 1,107,022 persons; adjusting for education takes 54 % of it. The world
 *  has no school, so the rule keeps the rest, 1 − 0.24 · (1 − 0.54) = 0.89: own arithmetic, not a value of the paper. */
export const DEATH = { conscientiousness: 0.88, iq: 0.89 } as const;
/** Ratio of the rate of a far move per standard deviation: Jokela 2009, Journal of Research in Personality 43(1),
 *  table 2, migration between U.S. states, odds ratios with all covariates (openness 1.32 and agreeableness 0.86
 *  without); 3,760 persons of MIDUS over nine years, 359 moved to another state. The study has no distance: a move to
 *  another state stands for the far move (own reading), and the odds ratio for the ratio of the rates. */
export const MOVE = { openness: 1.29, agreeableness: 0.88 } as const;
/** Odds ratio of ever marrying per standard deviation, men and women: Jokela, Alvergne, Pollet & Lummaa 2011,
 *  European Journal of Personality 25(6), table 2; 15,729 persons of WLS and MIDUS aged 35 or more. The traits were
 *  measured after the weddings (the authors' main limit). The other traits are not significant. */
export const MARRIES = { men: { extraversion: 1.53, openness: 0.79 }, women: { extraversion: 1.22, openness: 0.76 } } as const;
/** The weight of a person in the draw among the unmarried is exp(WEIGHT · Σ b·z). A wedding needs a vacant household
 *  and a draw is among the few of a town who fit in age, so the odds of ever marrying follow the weight less than
 *  one to one; with these the odds ratios of the source come out in a world of 1291 over 100 years (men 1.55 and
 *  0.77, women 1.19 and 0.79; tools/sim/traits_check.ts). Calibrated, not from a source. */
export const WEIGHT = { men: 1.45, women: 1.05 } as const;
/** No factor of a far move is above this (a person some 3.7 standard deviations out in both traits): the top rate of
 *  the thinning must hold (src/sim/people/moving.ts). Own setting. */
export const MOVE_FACTOR_TOP = 4;

const ln = Math.log;
const B = {
  death: { c: ln(DEATH.conscientiousness), iq: ln(DEATH.iq) },
  move: { o: ln(MOVE.openness), a: ln(MOVE.agreeableness) },
  men: { e: ln(MARRIES.men.extraversion), o: ln(MARRIES.men.openness) },
  women: { e: ln(MARRIES.women.extraversion), o: ln(MARRIES.women.openness) },
};
const NORM = { death: (B.death.c ** 2 + B.death.iq ** 2) / 2, move: (B.move.o ** 2 + B.move.a ** 2) / 2 };

/** The factor on the force of death of a person from TRAITS_FROM_AGE on. */
export const deathFactor = (P: TraitColumns, id: number): number => Math.exp(B.death.c * zOf(P.c, id) + B.death.iq * zIq(P, id) - NORM.death);
/** The factor on the rate of a far move of a person. */
export const moveFactor = (P: TraitColumns, id: number): number => Math.min(MOVE_FACTOR_TOP, Math.exp(B.move.o * zOf(P.o, id) + B.move.a * zOf(P.a, id) - NORM.move));
/** The logarithm of the weight of a person in the draw among the unmarried who fit a wedding. */
export const weddingWeight = (P: TraitColumns, id: number, man: boolean): number => {
  const b = man ? B.men : B.women;
  return (man ? WEIGHT.men : WEIGHT.women) * (b.e * zOf(P.e, id) + b.o * zOf(P.o, id));
};
