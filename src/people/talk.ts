// The conversation with a person, beside the person panel (src/people/panel.ts): the player writes a line, the person
// answers through a language model on the world server (server/talk, docs/TALK.md), word by word as the answer comes.
// The conversation lives here only: closing the box or opening another person ends it.
import type { TalkLine } from '../net/protocol';
import { talk } from '../net/client';
import './talk.css';

export interface TalkBox {
  /** opens the conversation with the person `uid`, titled `name`; a conversation with another person ends */
  open(uid: number, name: string): void;
  close(): void;
}

export function createTalkBox(host: HTMLElement): TalkBox {
  const box = el('aside', 'person-talk');
  box.hidden = true;
  host.append(box);
  let person = -1,
    lines: TalkLine[] = [],
    waiting = false,
    session = 0;
  const title = el('b'),
    log = el('div', 'log'),
    form = el('form', 'say'),
    input = el('input'),
    send = el('button', 'btn', 'Sagen');
  const close = el('button', 'close', '×');
  close.type = 'button';
  close.title = 'Schliessen';
  close.setAttribute('aria-label', 'Schliessen');
  close.onclick = () => talkBox.close();
  input.type = 'text';
  input.maxLength = 600;
  input.placeholder = 'Was willst du sagen?';
  input.setAttribute('aria-label', 'Was willst du sagen?');
  send.type = 'submit';
  form.append(input, send);
  const head = el('div', 'head');
  head.append(title, close);
  box.append(head, log, form);

  const line = (who: TalkLine['who'] | 'note', text: string) => {
    const p = el('p', who, text);
    log.append(p);
    log.scrollTop = log.scrollHeight;
    return p;
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || waiting) return;
    input.value = '';
    lines.push({ who: 'player', text });
    line('player', text);
    const answer = line('person', '…'),
      me = session;
    let said = '';
    waiting = true;
    send.disabled = true;
    talk(person, lines, (t) => {
      if (me !== session) return;
      said += t;
      answer.textContent = said;
      log.scrollTop = log.scrollHeight;
    })
      .then(() => {
        if (me === session && said) lines.push({ who: 'person', text: said });
      })
      .catch((err: Error) => {
        if (me !== session) return;
        answer.remove();
        lines.pop(); // the player's line had no answer: it is not part of the conversation
        line('note', err.message);
      })
      .finally(() => {
        if (me === session) {
          waiting = false;
          send.disabled = false;
          input.focus();
        }
      });
  };

  const talkBox: TalkBox = {
    open(uid, name) {
      if (uid !== person || box.hidden) {
        session++;
        lines = [];
        log.replaceChildren();
        waiting = false;
        send.disabled = false;
      }
      person = uid;
      title.textContent = `Gespräch mit ${name}`;
      box.hidden = false;
      input.focus();
    },
    close() {
      session++;
      person = -1;
      box.hidden = true;
    },
  };
  return talkBox;
}

/** An element with a class and a text. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
