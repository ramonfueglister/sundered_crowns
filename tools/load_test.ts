// Load test for the world server (point 118): 100 bot players over real WebSockets in one world.
//   MAX_CONN_PER_IP=300 SECONDS_PER_DAY=0.5 PORT=8790 MAX_PLAYERS=200 WORLD_DATA_DIR=/tmp/sc-load npx tsx server/main.ts &
//   WORLD_URL=ws://localhost:8790 BOTS=100 SECONDS=90 npx tsx tools/load_test.ts
// Each bot joins its own realm and plays (taxes, budget, research, standing orders); at the end one bot declares war on another.
// Reports join time, tick delivery, command acknowledgement (queued) and result times (applied at the next day boundary) and the server's day rate.
import WebSocket from 'ws';
import { PROTOCOL_VERSION, type ServerMsg, type ClientMsg } from '../src/online/protocol';

const URL = process.env.WORLD_URL || 'ws://localhost:8790';
const BOTS = +(process.env.BOTS ?? 100), SECONDS = +(process.env.SECONDS ?? 90);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(f: () => T | undefined | null | false, what: string, ms = 60_000): Promise<T> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = f(); if (v) return v as T; await sleep(20); }
  throw new Error(`timeout waiting for ${what}`);
}

class Bot {
  ws!: WebSocket; msgs: ServerMsg[] = []; seq = 1; nation = -1; ticks = 0; lastDay = 0; rtts: number[] = []; acks: number[] = []; sent = new Map<number, number>(); results = new Map<number, any>(); pending = new Map<number, number>(); errors = 0; bytes = 0;
  constructor(readonly name: string) {}
  async open() {
    this.ws = new WebSocket(URL);
    this.ws.on('message', (d, bin) => {
      if (bin) return;
      const txt = d.toString(); this.bytes += txt.length;
      // ticks are the bulk of the traffic: count them without parsing so the bot process measures the server, not itself
      if (txt.startsWith('{"type":"tick"')) { this.ticks++; const dm = /"day":(\d+)/.exec(txt); if (dm) this.lastDay = +dm[1]; return; }
      if (txt.startsWith('{"type":"world"')) return;
      const m = JSON.parse(txt) as ServerMsg;
      if (m.type === 'queued') { const t = this.sent.get(m.id); if (t) { this.acks.push(Date.now() - t); this.sent.delete(m.id); } return; }
      if (m.type === 'cmdResult') { const t = this.pending.get(m.id); if (t) { this.rtts.push(Date.now() - t); this.pending.delete(m.id); } this.results.set(m.id, (m as any).res); if (!(m as any).res?.ok) this.errors++; return; }
      this.msgs.push(m);
      if (this.msgs.length > 200) this.msgs.splice(0, 100);
    });
    await new Promise<void>((res, rej) => { this.ws.once('open', () => res()); this.ws.once('error', rej); });
    this.send({ type: 'hello', v: PROTOCOL_VERSION, name: this.name });
    return until(() => this.last('welcome'), 'welcome');
  }
  send(m: ClientMsg) { this.ws.send(JSON.stringify(m)); }
  last<T extends ServerMsg['type']>(t: T): Extract<ServerMsg, { type: T }> | undefined { for (let i = this.msgs.length - 1; i >= 0; i--) if (this.msgs[i].type === t) return this.msgs[i] as any; return undefined; }
  cmd(cmd: any) { const id = this.seq++; this.pending.set(id, Date.now()); this.sent.set(id, Date.now()); this.send({ type: 'cmd', id, cmd }); return id; }
  async result(id: number) { return until(() => !this.pending.has(id), `result ${id}`, 30_000); }
}

async function main() {
  console.log(`world server ${URL}, ${BOTS} bots, ${SECONDS} s`);
  const t0 = Date.now();
  const bots = Array.from({ length: BOTS }, (_, k) => new Bot(`Bot ${String(k + 1).padStart(3, '0')}`));
  await Promise.all(bots.map((b) => b.open()));
  // free realms, one each
  bots[0].send({ type: 'free' });
  const free = (await until(() => bots[0].last('free'), 'free list')).nations as { id: number; key: string; neighbours?: number[] }[];
  if (free.length < BOTS) throw new Error(`only ${free.length} free realms`);
  const order = [...free].sort((a, b) => a.id - b.id);
  // everyone asks for a different realm at once (joins take effect at the next day boundary), then retries the rest
  const tryJoin = async (b: Bot, id: number) => {
    b.msgs = []; b.send({ type: 'join', nation: id });
    const r = await until(() => b.last('seat') || b.last('error'), 'join answer');
    if ((r as any).type === 'seat' && (r as any).seat?.nation === id) b.nation = id;
  };
  await Promise.all(bots.map((b, k) => tryJoin(b, order[k].id)));
  for (const b of bots) for (let j = BOTS; b.nation < 0 && j < order.length; j++) if (!bots.some((x) => x.nation === order[j].id)) await tryJoin(b, order[j].id);
  const seated = bots.filter((b) => b.nation >= 0);
  console.log(`seated ${seated.length}/${BOTS} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  // play
  const startDay = Math.max(...bots.map((b) => b.lastDay));
  const tStart = Date.now();
  let round = 0;
  while (Date.now() - tStart < SECONDS * 1000) {
    for (const b of seated) {
      const r = (round + b.nation) % 4;
      if (r === 0) b.cmd({ t: 'tax', n: b.nation, cls: 0, rate: 0.06 + ((round % 5) * 0.01) });
      else if (r === 1) b.cmd({ t: 'budget', n: b.nation, key: 'army', value: 0.75 + (round % 2) * 0.25 });
      else if (r === 2) b.cmd({ t: 'tech', n: b.nation, branch: round % 3 });
      else b.cmd({ t: 'orders', n: b.nation, orders: { defendOnly: false, balanceBudget: true, acceptPeaceBelow: 25, autoBuild: true, autoRecruit: true } });
    }
    round++;
    await sleep(2000);
  }
  // a war between two bots and a peace offer (dev auth worlds allow declaring without justification)
  const [A, B] = seated;
  const decl = A.cmd({ t: 'declare', n: A.nation, target: B.nation, goal: 'conquest' }); await A.result(decl);
  const declOk = !!A.results.get(decl)?.ok;
  await sleep(3000);
  await Promise.all(seated.map((b) => until(() => b.pending.size === 0, 'all results', 30_000).catch(() => null)));
  const endDay = Math.max(...bots.map((b) => b.lastDay));
  const rtts = seated.flatMap((b) => b.rtts).sort((a, b) => a - b);
  const acks = seated.flatMap((b) => b.acks).sort((a, b) => a - b);
  const q = (p: number, a = rtts) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  const minTicks = Math.min(...seated.map((b) => b.ticks));
  const health = await fetch(URL.replace(/^ws/, 'http') + '/health').then((r) => r.json()).catch(() => null);
  console.log(JSON.stringify({
    bots: BOTS, seated: seated.length, seconds: SECONDS, daysAdvanced: endDay - startDay, commands: rtts.length,
    ackMs: { p50: q(0.5, acks), p95: q(0.95, acks), max: acks[acks.length - 1] }, resultMs: { p50: q(0.5), p95: q(0.95), max: rtts[rtts.length - 1] }, minTicksPerBot: minTicks, kbPerBotPerDay: Math.round(seated.reduce((p, b) => p + b.bytes, 0) / seated.length / Math.max(1, endDay - startDay) / 1024 * 10) / 10, rejected: seated.reduce((p, b) => p + b.errors, 0),
    warDeclared: declOk, declareResult: A.results.get(decl), serverStepMs: health?.stepMs,
  }, null, 1));
  for (const b of bots) b.ws.close(1000, 'bye');
  process.exit(seated.length === BOTS && minTicks > 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
