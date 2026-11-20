# Conversations with the persons

A click on a living person opens the person panel (`src/people/panel.ts`); its button **Sprechen** opens a
conversation beside it (`src/people/talk.ts`). The player writes, the person answers through a language model, word
by word as the answer comes.

## How it runs

1. The browser sends the conversation so far over its WebSocket: `{ type: 'talk', id, person, lines }`
   (`src/net/protocol.ts`). Only a signed-in player may talk; an observer may not.
2. The world server (`server/talk/index.ts`) checks the bounds (the last 24 lines, 600 characters each, the
   player's line last) and the limits per hour (`TALK_PER_USER_HOUR`, `TALK_PER_HOUR`), one answer at a time per
   player.
3. It builds the person's persona from the state of the day (`server/talk/persona.ts`) and asks the model through
   OpenRouter (`server/talk/openrouter.ts`), streamed, without thinking (`reasoning: { enabled: false }`), only from
   providers that do not keep the data for training (`provider: { data_collection: 'deny' }`).
4. Each piece of the answer goes back as `{ type: 'talk', id, text }`, then `{ type: 'talk', id, done: true }`, or
   `{ type: 'talk', id, err }` with a German reason.

The key (`OPENROUTER_API_KEY`) stays on the world server, a Fly secret (docs/DEPLOY.md). The model is a setting
(`TALK_MODEL`, default `deepseek/deepseek-v4.1-flash`, Ramon's choice on 20 November 2026 after the comparison of
models and prices in the project thread); `TALK_URL` points at another endpoint of the same shape, a local model
server too. The conversation is kept in the browser only: the server keeps nothing of it.

## The persona

Built anew for every turn, so the person knows the world as it is that day. It holds only what the world holds:

- the date of the world, the weekday, and whether it is a day of rest or a half day of the person's faith
  (`src/sim/holy_days.ts`); whether the person is sick or in childbed today (`src/sim/people/absence.ts`);
- who the person is: a person of history by name, house and crowns; anyone else as a woman or a man whose name the
  world does not know; the age, culture and faith;
- where the person lives (a parcel in the town or a farmstead in a hamlet outside its walls), the realm the place
  belongs to and its ruler, the place the person comes from;
- the parents, the spouse and the living children, with their ages;
- the person's part in the economy of the city and the purse of the family, in the words and pence of the panel
  (`src/people/economy_rows.ts`); not for a person of history, who has no part in the economy;
- the IQ in the descriptive classes of the Wechsler scales (Wechsler 2008, WAIS-IV Technical and Interpretive
  Manual, table 6.3) and the Big Five in the bands of the NEO PI-R profile sheet (Costa & McCrae 1992).

The shape follows the literature on characters played by language models: a description in short statements of fact,
the present situation and the relations (Park et al. 2023, "Generative Agents", UIST, section 3.1), a profile and the
way the character speaks (Wang et al. 2024, "RoleLLM", Findings of ACL, section 3), and a horizon of knowledge: the
character knows nothing beyond its time and life (Shao et al. 2023, "Character-LLM", EMNLP, section 3.3). The model
is told never to contradict the facts and to add none.

Own rules (marked `OWN RULE` in the code): a person whose name the world does not know gives none; answers are one to
four sentences; the bounds of a request above.

## Costs

DeepSeek V4.1 Flash on OpenRouter costs about US$0.14 per million tokens in and US$0.42 out (November 2026). A
conversation of eight turns with a persona of about 1,000 tokens comes to about US$0.001. Set a credit limit for the
key on openrouter.ai.
