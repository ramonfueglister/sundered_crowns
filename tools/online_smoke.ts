// Smoke test against a running world server (DEV mode, fast clock):
//   SECONDS_PER_DAY=0.05 PORT=8787 npx tsx server/main.ts &
//   WORLD_URL=ws://localhost:8787 npx tsx tools/online_smoke.ts
// Client 1 is the real browser client (OnlineClient, using Node's built-in WebSocket); client 2 speaks the raw
// protocol through the `ws` package. They join, command, receive ticks, trade offers, disconnect and reconnect,
// and the script checks that standing orders ran the realm while client 2 was away.
import WebSocket from 'ws';
import { OnlineClient, freeNations, seat, offers, roster } from '../src/online/worldClient';
import { view } from '../src/game/client';
import { PROTOCOL_VERSION, decodeBinary, BIN_OWNERS, type ServerMsg, type ClientMsg } from '../src/online/protocol';

const URL = process.env.WORLD_URL || 'ws://localhost:8787';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(ok: boolean, what: string) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures++; }
async function until<T>(f: () => T | undefined | null | false, what: string, ms = 20_000): Promise<T> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = f(); if (v) return v as T; await sleep(25); }
  throw new Error(`timeout waiting for ${what}`);
}

class RawClient {
  ws!: WebSocket; msgs: ServerMsg[] = []; bins = 0; seq = 1; closed = false;
  async open(name: string) {
    this.msgs = []; this.closed = false;
    this.ws = new WebSocket(URL);
    this.ws.on('message', (d, bin) => { if (bin) { const { kind } = decodeBinary(new Uint8Array(d as Buffer)); if (kind === BIN_OWNERS) this.bins++; } else this.msgs.push(JSON.parse(d.toString())); });
    this.ws.on('close', () => { this.closed = true; });
    await new Promise<void>((res, rej) => { this.ws.once('open', () => res()); this.ws.once('error', rej); });
    this.send({ type: 'hello', v: PROTOCOL_VERSION, name });
    return until(() => this.last('welcome'), 'welcome');
  }
  send(m: ClientMsg) { this.ws.send(JSON.stringify(m)); }
  last<T extends ServerMsg['type']>(t: T): Extract<ServerMsg, { type: T }> | undefined { for (let i = this.msgs.length - 1; i >= 0; i--) if (this.msgs[i].type === t) return this.msgs[i] as any; return undefined; }
  ticks() { return this.msgs.filter((m) => m.type === 'tick') as Extract<ServerMsg, { type: 'tick' }>[]; }
  async cmd(cmd: any) { const id = this.seq++; this.send({ type: 'cmd', id, cmd }); const r = await until(() => this.msgs.find((m) => m.type === 'cmdResult' && m.id === id) as any, `result of ${cmd.t}`); return r.res; }
  close() { this.ws.close(1000, 'bye'); return until(() => this.closed, 'close'); }
}

async function main() {
  console.log(`world server: ${URL}`);
  // ---------------- client 1: the real OnlineClient
  const c1 = new OnlineClient(URL);
  await c1.connect({ name: 'Smoke Alice' });
  if (seat.value) { c1.leave(); await until(() => !seat.value, 'abdication of an old seat'); } // re-runs against the same world
  c1.requestFree();
  const free = await until(() => freeNations.value.length > 0 && freeNations.value, 'free nations');
  check(free.length > 50, `free realms listed (${free.length})`);
  const pick = (keys: string[]) => keys.map((k) => free.find((n) => n.key === k)).find(Boolean) ?? free[0];
  const A = pick(['portugal', 'navarre', 'venice']);
  c1.join(A.id);
  await until(() => seat.value?.nation === A.id, 'seat for client 1');
  await c1.init();
  check(view.value?.player?.id === A.id, `client 1 rules ${A.key} and receives its PlayerView`);
  check(view.value?.owner?.length === c1.L + c1.S, 'client 1 has the owner map (binary frame)');

  // ---------------- client 2: raw protocol
  const c2 = new RawClient();
  const w1 = await c2.open('Smoke Bertram');
  if (w1.seat) { c2.send({ type: 'leave' }); await until(() => c2.last('seat') && !c2.last('seat')!.seat, 'abdication 2'); }
  c2.msgs = []; c2.send({ type: 'free' });
  const free2 = (await until(() => c2.last('free'), 'free list 2')).nations;
  const B = ['scotland', 'denmark', 'hungary'].map((k) => free2.find((n) => n.key === k)).find(Boolean) ?? free2.find((n) => n.id !== A.id)!;
  c2.send({ type: 'join', nation: A.id });
  check((await until(() => c2.last('error'), 'taken error')).code === 'taken', 'a taken realm cannot be joined twice');
  c2.send({ type: 'join', nation: B.id });
  await until(() => c2.last('seat')?.seat?.nation === B.id, 'seat for client 2');
  check(true, `client 2 rules ${B.key}`);

  // ---------------- commands (applied at the start of the next day)
  const day0 = view.value!.day;
  const r1 = await c1.cmd({ t: 'tax', n: A.id, cls: 0, rate: 0.11 });
  check(r1.ok, `client 1 tax command applied (${JSON.stringify(r1)})`);
  const orders = { defendOnly: true, balanceBudget: true, acceptPeaceBelow: 30, autoBuild: true, autoRecruit: true };
  check((await c2.cmd({ t: 'orders', n: B.id, orders })).ok, 'client 2 standing orders saved');
  check((await c2.cmd({ t: 'budget', n: B.id, key: 'army', value: 0.75 })).ok, 'client 2 army maintenance set to 75 %');
  const foreign = await c2.cmd({ t: 'tax', n: A.id, cls: 0, rate: 0.5 });
  check(!foreign.ok && foreign.err === 'not your realm', 'commands for another realm are rejected');
  const dev = await c2.cmd({ t: 'dev', n: B.id, action: 'gold', payload: { amount: 1e6 } });
  check(!dev.ok, 'developer commands are rejected for non-admins');
  const realm = await c1.query({ q: 'realm' });
  check(Array.isArray(realm?.laws) && realm.laws.length > 0, 'queries are answered (realm panel data)');

  // ---------------- ticks
  await until(() => (view.value?.day ?? 0) >= day0 + 5, 'five days');
  const t2 = c2.ticks();
  check(t2.length >= 5 && t2[t2.length - 1].view.player?.id === B.id, `client 2 receives per-player ticks (${t2.length})`);
  check(t2.every((t) => !('owner' in (t.view as any))), 'ticks carry owner changes as deltas, not full arrays');

  // ---------------- player diplomacy: async offer → treaty
  const before = await c1.query({ q: 'nation', nation: B.id });
  const action = (['alliance', 'trade', 'access', 'marriage'] as const).find((a) => !before?.rel?.treaties?.includes(a)) ?? 'guarantee';
  c1.offer(B.id, action, 'Friends across the sea?');
  const of = await until(() => (c2.last('offers')?.offers ?? []).find((o) => o.from === A.id && o.to === B.id), 'offer at client 2');
  c2.send({ type: 'offer_answer', offer: of.id, accept: true });
  await until(() => offers.value.length === 0, 'offer closed at client 1');
  const nd = await c1.query({ q: 'nation', nation: B.id });
  check(nd?.rel?.treaties?.includes(action), `accepted player offer (${action}) became a simulation treaty`);
  c1.say('Hail from the smoke test');
  check(!!(await until(() => c2.msgs.some((m) => m.type === 'chat' && m.msgs.some((x) => x.text === 'Hail from the smoke test')), 'chat', 5000).catch(() => false)), 'world chat delivered');

  // ---------------- disconnect: standing orders take over
  await c2.close();
  await until(() => roster.value.find((r) => r.nation === B.id && !r.online), 'client 2 shown offline');
  check(true, 'client 2 disconnected; roster shows the realm offline');
  const dOff = view.value!.day;
  await until(() => (view.value?.day ?? 0) >= dOff + 32, '32 days offline', 60_000);
  const w2 = await c2.open('Smoke Bertram');
  check(w2.seat?.nation === B.id, 'client 2 reconnects to the same seat');
  const tick = await until(() => c2.ticks().find((t) => t.view.player), 'tick after reconnect');
  const maint = tick.view.player!.armyMaint;
  check(Math.abs(maint - 0.75) > 1e-9, `standing orders ran the budget while offline (army maintenance 0.75 → ${maint.toFixed(2)})`);
  check(c2.bins > 0, 'reconnect received the full owner map');

  await c2.close(); c1.disconnect();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall smoke checks passed');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error('FAIL ', e?.message ?? e); process.exit(1); });
