// Commands of the realm pass: the Empire and the league, the great powers, the assembly, the choice of the head of
// the realm and the demands of the Powers, and the actions open in each situation.
import type { GameState, Command, Nation, I18n } from './types';
import type { World } from './world';
import { castVote, campaign, answerCall, orderPeace, answerOrder, summonDiet, dietVote, joinLeague, leaveLeague } from './systems/empire';
import { holdAssembly, taxLevel, askRates, needsTaxVote, backCandidate, answerDemand } from './systems/government';
import { powersCommand } from './systems/powers';
import { situationAction } from './systems/situations';

type RealmCmd = Extract<Command, { t: 'empire' | 'league' | 'powers' | 'assembly' | 'govern' | 'situation' }>;
export function realmCommand(s: GameState, w: World, n: Nation, cmd: RealmCmd): string | I18n | null {
  switch (cmd.t) {
    case 'empire': {
      const E = s.empire;
      switch (cmd.action) {
        case 'vote': return castVote(s, n, cmd.target ?? -1);
        case 'campaign': return campaign(s, n, cmd.target ?? -1);
        case 'defend': case 'refuse': {
          const c = (E.calls ?? []).find((x) => x.war === cmd.war && x.answer === 0);
          if (!c || E.emperor !== n.id) return 'no call is pending';
          answerCall(s, w, c, cmd.action === 'defend'); return null;
        }
        case 'order_peace': return orderPeace(s, w, n, cmd.war ?? -1);
        case 'comply': {
          const o = (E.orders ?? []).find((x) => x.war === cmd.war && x.to === n.id && x.answer === 0);
          if (!o) return 'no order is pending';
          answerOrder(s, w, o, !!cmd.yes); return null;
        }
        case 'summon_diet': return summonDiet(s, n);
        case 'diet_vote': return dietVote(s, n, !!cmd.yes);
      }
      return 'unknown action';
    }
    case 'league': return cmd.action === 'join' ? joinLeague(s, w, n) : leaveLeague(s, n);
    case 'powers': return powersCommand(s, w, n, cmd.action, cmd.target, cmd.war);
    case 'assembly': {
      if (cmd.kind === 'tax') {
        const cls = cmd.cls ?? -1; if (cls < -1 || cls >= n.taxRate.length) return 'bad class';
        const rates = askRates(n.taxRate, cls, cmd.rate ?? 0);
        // within the granted level no vote is needed: the rates apply at once
        if (!needsTaxVote(n, taxLevel(rates))) { n.taxRate = rates; return null; }
        const e = holdAssembly(s, n, { kind: 'tax', level: taxLevel(rates), rates }, cmd.bribe ?? [], cmd.concede);
        if (!e) n.taxRate = rates;
        return e;
      }
      const t = s.nations[cmd.target ?? -1]; if (!t?.alive || t.id === n.id) return 'invalid target';
      return holdAssembly(s, n, { kind: 'war', target: t.id, goal: cmd.goal ?? 'conquest' }, cmd.bribe ?? [], cmd.concede);
    }
    case 'govern': {
      if (cmd.action === 'back') return backCandidate(s, w, n, cmd.char ?? -1);
      return answerDemand(s, n, cmd.action === 'grant_demand');
    }
    case 'situation': return situationAction(s, w, n, cmd.id, cmd.action, cmd.target);
  }
  return 'unknown action';
}
