// World server transport: HTTP (health/status) + WebSocket API around one WorldCore.
//   npm run world                      → SECONDS_PER_DAY=36, port 8787, DEV login when Supabase is not configured
//   SECONDS_PER_DAY=0.05 npm run world → fast mode for testing
import { createServer, type IncomingMessage } from 'node:http';
import { existsSync } from 'node:fs';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import { WorldCore, configFromEnv, type Session } from './world';
import { NullStore, SupabaseStore } from './store';
import { authConfigFromEnv, authenticate } from './auth';
import { PROTOCOL_VERSION, type ClientMsg, type ServerMsg } from '../src/online/protocol';

// local development: read ./.env if present (production hosts set real environment variables)
if (existsSync('.env') && typeof (process as any).loadEnvFile === 'function') (process as any).loadEnvFile('.env');
const env = process.env;
const PORT = Number(env.PORT || env.WORLD_PORT || 8787);
const ORIGINS = (env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean);
const MAX_PER_USER = Number(env.MAX_CONN_PER_USER || 3), MAX_PER_IP = Number(env.MAX_CONN_PER_IP || 12); // raised only for local load tests
const ADMIN_TOKEN = env.ADMIN_TOKEN || ''; // enables the /admin/* endpoints (reports, bans)

const cfg = configFromEnv(env);
const store = SupabaseStore.fromEnv(env) ?? new NullStore();
const auth = authConfigFromEnv(env);
if (auth.devMode) console.warn('[world] DEV mode: no Supabase configured, players log in with a display name only. Do not expose this publicly.');
const core = new WorldCore(cfg, store).init();
core.start();
console.log(`[world] ${cfg.id} season ${core.meta.season} day ${core.s.day}, ${cfg.secondsPerDay}s per day, store ${store.enabled ? 'supabase' : 'local only'}`);

const cors = (req: IncomingMessage) => {
  const o = req.headers.origin; const ok = !o || !ORIGINS.length || ORIGINS.includes(o);
  return ok && o ? { 'access-control-allow-origin': o, vary: 'Origin' } : {};
};
const http = createServer((req, res) => {
  const h = { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors(req) };
  if (req.url === '/health' || req.url === '/') { res.writeHead(200, h); res.end(JSON.stringify({ ok: true, world: core.worldInfo().id, day: core.s.day, players: core.seats().length, stepMs: core.stepMs })); return; }
  if (req.url === '/world') { res.writeHead(200, h); res.end(JSON.stringify(core.worldInfo())); return; }
  if (req.url === '/leaderboard') { res.writeHead(200, h); res.end(JSON.stringify({ season: core.meta.season, rows: core.leaderRows(50) })); return; }
  // moderation for operators (ADMIN_TOKEN): reports, bans (the same as the admin tab in the game)
  if (req.url?.startsWith('/admin/') && ADMIN_TOKEN) {
    const auth = String(req.headers.authorization || '');
    if (auth !== `Bearer ${ADMIN_TOKEN}`) { res.writeHead(401, h); res.end('{"error":"unauthorized"}'); return; }
    const u = new URL(req.url, 'http://x'); const q = (k: string) => u.searchParams.get(k) ?? '';
    if (u.pathname === '/admin/reports' && req.method === 'GET') { res.writeHead(200, h); res.end(JSON.stringify({ reports: core.reports(q('all') === '1'), bans: core.bans(), filter: core.filter.size })); return; }
    if (u.pathname === '/admin/ban' && req.method === 'POST' && q('uid')) { core.ban(q('uid'), 'http', q('reason'), Number(q('hours')) || 0, q('release') === '1'); res.writeHead(200, h); res.end('{"ok":true}'); return; }
    if (u.pathname === '/admin/unban' && req.method === 'POST' && q('uid')) { core.unban(q('uid')); res.writeHead(200, h); res.end('{"ok":true}'); return; }
  }
  res.writeHead(404, h); res.end('{"error":"not found"}');
});

const wss = new WebSocketServer({ server: http, maxPayload: 64 * 1024, perMessageDeflate: { threshold: 2048 } });
const perIp = new Map<string, number>(); const perUser = new Map<string, number>();
const alive = new WeakMap<WebSocket, boolean>();

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin;
  if (ORIGINS.length && origin && !ORIGINS.includes(origin)) { ws.close(4001, 'origin not allowed'); return; }
  const ip = (String(req.headers['fly-client-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')).split(',')[0].trim();
  if ((perIp.get(ip) ?? 0) >= MAX_PER_IP) { ws.close(4029, 'too many connections'); return; }
  perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
  alive.set(ws, true); ws.on('pong', () => alive.set(ws, true));
  let session: Session | null = null; let authing = false; let uid = '';
  const send = (m: ServerMsg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };
  const helloTimer = setTimeout(() => { if (!session) ws.close(4000, 'hello expected'); }, 15_000);

  ws.on('message', async (data: RawData, isBinary: boolean) => {
    if (isBinary) return;
    let m: ClientMsg; try { m = JSON.parse(data.toString()); } catch { send({ type: 'error', code: 'bad_json', message: 'Malformed message.' }); return; }
    if (session) { session.handle(m); return; }
    if (m?.type !== 'hello' || authing) return;
    if (m.v !== PROTOCOL_VERSION) { send({ type: 'error', code: 'version', message: 'Please reload the game: the client is out of date.' }); ws.close(4002, 'version'); return; }
    authing = true;
    const user = await authenticate(m, auth, store);
    authing = false;
    if ('error' in user) { send({ type: 'error', code: 'auth', message: user.error }); ws.close(4001, 'auth'); return; }
    if ((perUser.get(user.uid) ?? 0) >= MAX_PER_USER) { send({ type: 'error', code: 'sessions', message: 'Too many open sessions for this account.' }); ws.close(4029, 'sessions'); return; }
    if (ws.readyState !== ws.OPEN) return;
    clearTimeout(helloTimer);
    uid = user.uid; perUser.set(uid, (perUser.get(uid) ?? 0) + 1);
    session = core.attach({ send, sendRaw: (j) => { if (ws.readyState === ws.OPEN) ws.send(j); }, sendBin: (b) => { if (ws.readyState === ws.OPEN) ws.send(b, { binary: true }); }, close: (c, r) => ws.close(c, r) }, user);
  });
  ws.on('close', () => {
    clearTimeout(helloTimer);
    perIp.set(ip, Math.max(0, (perIp.get(ip) ?? 1) - 1));
    if (uid) perUser.set(uid, Math.max(0, (perUser.get(uid) ?? 1) - 1));
    session?.disconnect(); session = null;
  });
  ws.on('error', () => { /* close follows */ });
});

const beat = setInterval(() => {
  for (const ws of wss.clients) { if (!alive.get(ws)) { ws.terminate(); continue; } alive.set(ws, false); try { ws.ping(); } catch { /* ignore */ } }
}, 30_000);

http.listen(PORT, () => console.log(`[world] listening on :${PORT} (ws + /health, /world, /leaderboard)`));

let stopping = false;
function stop(sig: string) {
  if (stopping) return; stopping = true;
  console.log(`[world] ${sig}: saving snapshot and shutting down`);
  clearInterval(beat);
  try { core.shutdown(); } catch (e) { console.error(e); }
  wss.close(); http.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
