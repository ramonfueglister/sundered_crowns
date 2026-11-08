// Decisions a realm can take when conditions are met (forming realms, moving capitals, reforms of faith, ...).
import type { DecisionDef } from '../systems/events';
import { H } from '../systems/events';
export const DECISIONS: DecisionDef[] = [
  {
    id: 'royal_progress', name: { en: 'Royal Progress', de: 'Königlicher Umritt' },
    desc: { en: 'The ruler travels the realm to show the crown. Costs gold, raises Concord and Mandate.', de: 'Der Herrscher bereist das Reich. Kostet Gold, stärkt Eintracht und Mandat.' },
    visible: () => true,
    can: (e) => (e.n.flags.progress_until || 0) > e.s.day ? 'too soon' : e.n.treasury < (e.n.income.tax || 10) * 2 ? 'not enough gold' : H.atWar(e.s, e.n.id) ? 'not while at war' : null,
    effect: (e) => { e.fx.gold(-2); e.fx.concord(10); e.fx.mandate(5); e.n.flags.progress_until = e.s.day + 365 * 5; },
    ai: (e) => e.n.concord < 0,
  },
];
