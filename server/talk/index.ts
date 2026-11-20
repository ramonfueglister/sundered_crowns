// Conversations with the persons of the world through a language model (docs/TALK.md). A player who is signed in
// sends what was said so far; the world server builds the person's persona from the state of the day
// (server/talk/persona.ts), asks the model through OpenRouter (server/talk/openrouter.ts) and sends the answer back in
// pieces over the player's WebSocket. The key and the limits stay on the server.
import type { ClientMsg, ServerMsg, TalkLine } from '../../src/net/protocol';
import type { WorldState } from '../../src/sim/state';
import type { World } from '../../src/sim/world';
import type { UserAuth } from '../session';
import { personaFacts, personaPrompt } from './persona';
import { type ChatMessage, streamChat } from './openrouter';

export interface TalkConfig {
  /** the OpenRouter key; without one nobody can talk */
  key: string;
  /** the model on OpenRouter (Ramon's choice on 20 November 2026: DeepSeek V4.1 Flash) */
  model: string;
  /** turns one player may start in an hour, and all players together */
  perUserHour: number;
  perAllHour: number;
  /** the longest answer, in tokens */
  maxTokens: number;
  /** another endpoint of the same shape as OpenRouter's (TALK_URL), e.g. a local model server; undefined: OpenRouter */
  url?: string;
}
export function talkConfigFromEnv(env: Record<string, string | undefined> = process.env): TalkConfig {
  const num = (k: string, d: number) => (env[k] && Number.isFinite(Number(env[k])) ? Number(env[k]) : d);
  return {
    key: env.OPENROUTER_API_KEY ?? '',
    model: env.TALK_MODEL || 'deepseek/deepseek-v4.1-flash',
    perUserHour: num('TALK_PER_USER_HOUR', 60),
    perAllHour: num('TALK_PER_HOUR', 1000),
    maxTokens: num('TALK_MAX_TOKENS', 300),
    url: env.TALK_URL || undefined,
  };
}

/** OWN RULE: the bounds of what a browser may send, so that one request cannot cost much: the last 24 lines of the
 *  conversation, each at most 600 characters. */
export const MAX_LINES = 24;
export const MAX_CHARS = 600;
const HOUR = 3600_000;

/** The messages for the model: the persona, then the conversation (the player as user, the person as assistant);
 *  null when the lines are not a conversation the player may send. */
export function chatMessages(persona: string, lines: unknown): ChatMessage[] | null {
  if (!Array.isArray(lines) || !lines.length) return null;
  const kept = (lines as TalkLine[]).slice(-MAX_LINES);
  const ok = kept.every(
    (l) =>
      l &&
      (l.who === 'player' || l.who === 'person') &&
      typeof l.text === 'string' &&
      l.text.trim() &&
      l.text.length <= MAX_CHARS,
  );
  if (!ok || kept[kept.length - 1].who !== 'player') return null;
  return [
    { role: 'system', content: persona },
    ...kept.map((l): ChatMessage => ({ role: l.who === 'player' ? 'user' : 'assistant', content: l.text.trim() })),
  ];
}

/** Turns started in the last hour, per player and for all: a sliding window. */
export class TalkLimits {
  private per = new Map<string, number[]>();
  private all: number[] = [];
  constructor(private cfg: Pick<TalkConfig, 'perUserHour' | 'perAllHour'>) {}
  /** Counts a turn of `uid` at `now` and says whether it may be; a turn that may not be is not counted. */
  take(uid: string, now = Date.now()): boolean {
    const mine = (this.per.get(uid) ?? []).filter((t) => t > now - HOUR);
    this.all = this.all.filter((t) => t > now - HOUR);
    if (mine.length >= this.cfg.perUserHour || this.all.length >= this.cfg.perAllHour) {
      this.per.set(uid, mine);
      return false;
    }
    mine.push(now);
    this.all.push(now);
    this.per.set(uid, mine);
    return true;
  }
}

type TalkMsg = Extract<ClientMsg, { type: 'talk' }>;
export interface TalkSession {
  user: UserAuth;
  closed: boolean;
  send(m: ServerMsg): void;
}

/** The conversations of a world server. */
export class Talk {
  private limits: TalkLimits;
  private busy = new Set<string>();
  constructor(
    private cfg: TalkConfig,
    private state: () => { s: WorldState; w: World },
    private chat: typeof streamChat = streamChat,
  ) {
    this.limits = new TalkLimits(cfg);
  }

  async handle(ss: TalkSession, m: TalkMsg): Promise<void> {
    const id = Number(m.id) || 0,
      uid = ss.user.uid;
    const fail = (err: string) => ss.send({ type: 'talk', id, err });
    if (!this.cfg.key) return fail('Gespräche sind auf diesem Server nicht eingerichtet.');
    if (ss.user.observer) return fail('Melde dich an, um mit Personen zu sprechen.');
    if (this.busy.has(uid)) return fail('Warte, bis die Person ausgeredet hat.');
    const { s, w } = this.state(),
      facts = personaFacts(s, w, Number(m.person));
    if (!facts) return fail('Diese Person lebt nicht mehr.');
    const messages = chatMessages(personaPrompt(facts), m.lines);
    if (!messages) return fail('Das Gespräch ist zu lang oder leer.');
    if (!this.limits.take(uid)) return fail('Genug geredet für diese Stunde. Versuch es später wieder.');
    this.busy.add(uid);
    const stop = new AbortController();
    try {
      await this.chat({
        key: this.cfg.key,
        url: this.cfg.url,
        model: this.cfg.model,
        messages,
        maxTokens: this.cfg.maxTokens,
        signal: stop.signal,
        onText: (text) => {
          if (ss.closed) stop.abort();
          else ss.send({ type: 'talk', id, text });
        },
      });
      ss.send({ type: 'talk', id, done: true });
    } catch (e) {
      if (!ss.closed) {
        console.warn('[talk]', (e as Error).message);
        fail('Die Person schweigt (der Dienst antwortet nicht).');
      }
    } finally {
      this.busy.delete(uid);
    }
  }
}
