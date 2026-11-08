// Historical situations (world-level). Each has start conditions, monthly logic, stages and outcomes.
import type { SituationDef } from '../systems/situations';
import { endSituation } from '../systems/situations';
import { seedPlague } from '../systems/society';
import { nearestLoc } from '../setup';

export const SITUATIONS: SituationDef[] = [
  {
    id: 'great_pestilence', name: { en: 'The Returning Pestilence', de: 'Die wiederkehrende Pestilenz' },
    desc: { en: 'The great mortality of 1347–51 returns in waves. Dense towns and ports suffer most; labour grows scarce and wages rise.', de: 'Das große Sterben von 1347–51 kehrt in Wellen zurück. Dichte Städte und Häfen leiden am meisten; Arbeitskraft wird knapp, Löhne steigen.' },
    stages: [{ en: 'Lull', de: 'Atempause' }, { en: 'Outbreak', de: 'Ausbruch' }],
    canStart: (s, w, y) => y >= 1356 && y < 1700,
    start: (s, w, sit) => { sit.data.next = 1361; },
    monthly: (s, w, sit, y, m) => {
      // historical waves: 1361 (pestis secunda), 1369, 1374, 1390, 1400, then roughly every 10–15 years
      if (y >= sit.data.next && m === 3) {
        const origins: [number, number][] = [[2.35, 48.85], [12.33, 45.44], [28.97, 41.01], [-0.12, 51.5], [14.25, 40.85], [4.35, 50.85]];
        const o = origins[(y * 7) % origins.length];
        seedPlague(s, w, nearestLoc(w, o[0], o[1]), 0.9);
        sit.stage = 1; sit.progress = 100; sit.data.last = y;
        const gaps = [8, 5, 16, 10, 12, 14, 11, 13];
        sit.data.next = y + gaps[Math.floor(y / 3) % gaps.length];
      } else if (sit.progress > 0) { sit.progress = Math.max(0, sit.progress - 5); if (!sit.progress) sit.stage = 0; }
      if (y >= 1700) endSituation(s, sit, 'receded');
    },
  },
];
