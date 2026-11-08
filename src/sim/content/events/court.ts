import type { EventDef } from '../../systems/events';
import { H } from '../../systems/events';
export const COURT_EVENTS: EventDef[] = [
  {
    id: 'court_feast', title: { en: 'A Great Feast', de: 'Ein großes Fest' },
    text: { en: 'The nobles of {nation} expect {ruler} to hold a feast worthy of the crown.', de: 'Die Adligen von {nation} erwarten von {ruler} ein Fest, das der Krone würdig ist.' },
    mtth: 60, cooldown: 8,
    trigger: (e) => e.n.treasury > (e.n.income.tax || 10) * 3,
    options: [
      { label: { en: 'Spare no expense', de: 'Keine Kosten scheuen' }, effect: (e) => { e.fx.gold(-2); e.fx.estate('magnates', 10); e.fx.prestige(3); }, ai: 0.8 },
      { label: { en: 'A modest table will do', de: 'Eine bescheidene Tafel genügt' }, effect: (e) => { e.fx.estate('magnates', -5); }, ai: 0.5 },
    ],
  },
  {
    id: 'peasant_grievances', title: { en: 'Peasant Grievances', de: 'Klagen der Bauern' },
    text: { en: 'Peasants around {loc} complain of heavy dues and threaten to stop work.', de: 'Bauern um {loc} klagen über schwere Abgaben und drohen, die Arbeit niederzulegen.' },
    mtth: 48, cooldown: 5,
    trigger: (e) => H.avgUnrest(e) > 12,
    setup: (e) => { e.ctx.loc = H.randomLoc(e, (l) => e.s.loc.unrest[l] > 10); return e.ctx.loc >= 0; },
    options: [
      { label: { en: 'Lower their dues', de: 'Abgaben senken' }, effect: (e) => { e.fx.unrest(e.ctx.loc, -15); e.fx.estate('commons', 8); e.fx.estate('magnates', -5); e.fx.gold(-0.5); } },
      { label: { en: 'Send the bailiffs', de: 'Die Vögte schicken' }, effect: (e) => { e.fx.unrest(e.ctx.loc, 10); e.fx.estate('magnates', 4); e.fx.authority(5); }, ai: 0.6 },
    ],
  },
];
