// A streamed answer of a language model through OpenRouter (openrouter.ai): one HTTP request in the shape of the chat
// completions of OpenAI, answered as server-sent events. The key stays on the world server (OPENROUTER_API_KEY, a Fly
// secret, docs/DEPLOY.md); no browser ever sees it.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
interface ChatRequest {
  key: string;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  signal?: AbortSignal;
  /** called with each piece of the answer as it comes */
  onText: (text: string) => void;
  /** the endpoint (default OPENROUTER_URL; any service with the same shape, a local model server too) */
  url?: string;
  /** for tests */
  fetchImpl?: typeof fetch;
}

/** The pieces of answer text in a block of server-sent events, and what is left of an unfinished last line.
 *  OpenRouter sends `data: {json}` lines, comment lines starting with `:` while it waits for the model, and
 *  `data: [DONE]` at the end; a chunk with `error` ends the answer with that error. */
export function parseEvents(buffer: string): { texts: string[]; rest: string; done: boolean; error?: string } {
  const lines = buffer.split('\n'),
    rest = lines.pop() ?? '',
    texts: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') return { texts, rest: '', done: true };
    let chunk: { error?: { message?: string }; choices?: { delta?: { content?: string | null } }[] };
    try {
      chunk = JSON.parse(data);
    } catch {
      continue;
    }
    if (chunk.error) return { texts, rest: '', done: true, error: chunk.error.message ?? 'error' };
    const t = chunk.choices?.[0]?.delta?.content;
    if (t) texts.push(t);
  }
  return { texts, rest, done: false };
}

/** Asks the model and hands each piece of its answer to `onText`; resolves with the whole answer. Rejects with the
 *  provider's message when the request fails. */
export async function streamChat(r: ChatRequest): Promise<string> {
  const res = await (r.fetchImpl ?? fetch)(r.url ?? OPENROUTER_URL, {
    method: 'POST',
    signal: r.signal,
    headers: { authorization: `Bearer ${r.key}`, 'content-type': 'application/json', 'x-title': 'Sundered Crowns' },
    body: JSON.stringify({
      model: r.model,
      messages: r.messages,
      max_tokens: r.maxTokens,
      stream: true,
      // a conversation needs no thinking before the first word, which only makes the player wait (docs/TALK.md)
      reasoning: { enabled: false },
      // only providers that do not keep the conversations to train on them
      provider: { data_collection: 'deny' },
    }),
  });
  if (!res.ok || !res.body)
    throw new Error(`OpenRouter ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const reader = res.body.getReader(),
    dec = new TextDecoder();
  let buffer = '',
    all = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const e = parseEvents(buffer);
    buffer = e.rest;
    for (const t of e.texts) {
      all += t;
      r.onText(t);
    }
    if (e.error) throw new Error(e.error);
    if (e.done) break;
  }
  return all;
}
