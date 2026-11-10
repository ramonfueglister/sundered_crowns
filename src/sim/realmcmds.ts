// Commands of the realm pass: the Empire and the league, the great powers, the assembly, the choice of the head of
// the realm and the demands of the Powers, and the actions open in each situation.
import type { GameState, Command, Nation, I18n } from './types';
import type { World } from './world';
import { castVote, campaign, answerCall, orderPeace, answerOrder, summonDiet, dietVote, joinLeague, leaveLeague, answerLeagueCall, askHelp } from './systems/empire';
import { holdAssembly, taxAsk, needsTaxVote, backCandidate, answerDemand } from './systems/government';
import { powersCommand } from './systems/powers';
import { situationAction } from './systems/situations';

type RealmCmd = Extract<Command, { t: 'empire' | 'league' | 'powers' | 'assembly' | 'govern' | 'situation' }>;
/** out.msg carries what a command that succeeded has to tell (the emperor's answer to a plea for help). */
export function realmCommand(s: GameState, w: World, n: Nation, cmd: RealmCmd, out?: { msg?: I18n }): string | I18n | null {
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
        case 'order_peace': return orderPeace(s, w, n, cmd.war ?? -1, out);
        case 'comply': {
          const o = (E.orders ?? []).find((x) => x.war === cmd.war && x.to === n.id && x.answer === 0);
          if (!o) return 'no order is pending';
          answerOrder(s, w, o, !!cmd.yes); return null;
        }
        case 'summon_diet': return summonDiet(s, n);
        case 'diet_vote': return dietVote(s, n, !!cmd.yes);
        case 'ask_help': return askHelp(s, w, n, cmd.war ?? -1, out);
      }
      return 'unknown action';
    }
    case 'league': return cmd.action === 'join' ? joinLeague(s, w, n) : cmd.action === 'answer_call' ? answerLeagueCall(s, w, n, cmd.war ?? -1, !!cmd.yes) : leaveLeague(s, n);
    case 'powers': return powersCommand(s, w, n, cmd.action, cmd.target, cmd.war);
    case 'assembly': {
      if (cmd.kind === 'tax') {
        // a class rate (cls, rate), every class at once (cls -1: rate is the whole level asked) or a duty (duty, value)
        const ask = taxAsk(s, n, cmd.cls, cmd.rate, cmd.duty, cmd.value); if (typeof ask === 'string') return ask;
        // within the granted level (or lower than now) no vote is needed: the rates apply at once
        if (ask.level > ask.now + 1e-9 && needsTaxVote(n, ask.level, ask.now)) { const e = holdAssembly(s, n, { kind: 'tax', level: ask.level, rates: ask.rates, duties: ask.duties }, cmd.bribe ?? [], cmd.concede, ask.cs); if (e) return e; }
        n.taxRate = ask.rates;
        if (n.duties || cmd.duty) n.duties = { ...ask.duties };
        return null;
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
