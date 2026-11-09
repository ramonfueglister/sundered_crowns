// Simulation worker: owns the GameState, runs the clock, applies commands, answers queries.
/// <reference lib="webworker" />
import { World } from '../sim/world';
import { createGame } from '../sim/setup';
import { advanceDay, saveBinary, loadBinary } from '../sim/engine';
import { startRecorded, recordCommand } from '../sim/replay';
import type { GameState, Notice } from '../sim/types';
import type { ToWorker, FromWorker, TickView, MapMode } from './protocol';
import { nationLites, armyLites, playerView, warsView, pendingView, mapModeColors, answer, landmarksView, roadLevels } from './view';
import { dayToDate } from '../sim/calendar';

const post = (m: FromWorker, tr: Transferable[] = []) => (self as any).postMessage(m, tr);
let w: World, s: GameState;
let player: number | null = null;
let speed = 0;
let lastNotice = 0, lastChron = 0, lastOwnerChange = 0, lastMonth = -1;
let mapMode: MapMode = 'political', mapFocus = -1, mapDirty = true;
let msPerDay = 0;
const DAYS_PER_SEC = [0, 1, 3, 8, 20, 1000];

async function fetchJson(p: string) { const r = await fetch(p); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); }
let base: { geo: any; wj: any; hubs: any; setups: Record<number, any> } | null = null;
async function loadBase(year: number) {
  if (!base) {
    const [geo, wj, hubs] = await Promise.all([fetchJson('/data/geo.json'), fetchJson('/data/world.json'), fetchJson('/data/trade_hubs.json')]);
    base = { geo, wj, hubs: hubs.trade_hubs, setups: {} };
    w = new World(geo, wj);
  }
  if (!base.setups[year]) base.setups[year] = await fetchJson(`/data/setup_${year}.json`).catch(() => fetchJson('/data/setup_1356.json'));
  return base;
}

function sendTick(full = false) {
  if (!s) return;
  const d = dayToDate(s.day, s.startYear);
  const monthly = full || d.m !== lastMonth;
  lastMonth = d.m;
  const notices: Notice[] = s.notices.filter((n) => n.id > lastNotice && (player === null || n.nation === player || n.nation === -1));
  if (s.notices.length) lastNotice = s.notices[s.notices.length - 1].id;
  const chron = s.chronicle.slice(lastChron); lastChron = s.chronicle.length;
  const oc = ((s as any).ownerChanges || []) as { loc: number; order: number; day: number }[];
  let changes: { loc: number; order: number }[] | undefined;
  if (oc.length && (oc.length < lastOwnerChange || oc[oc.length - 1] !== (sendTick as any)._lastOc)) {
    const start = oc.length < lastOwnerChange ? 0 : lastOwnerChange;
    changes = oc.slice(start).map((c) => ({ loc: c.loc, order: c.order }));
    (sendTick as any)._lastOc = oc[oc.length - 1];
  }
  lastOwnerChange = oc.length;
  const lp = (s as any).lastPeace;
  const view: TickView = {
    day: s.day, startYear: s.startYear, speed, ended: s.ended, victory: s.victory,
    owner: new Int16Array(s.loc.owner), ctrl: new Int16Array(s.loc.ctrl),
    ownerChanges: changes && changes.length ? changes : undefined, changeOrigin: lp && lp.day === s.day ? lp.origin : undefined,
    nations: monthly ? nationLites(s, w) : undefined,
    armies: armyLites(s, w),
    player: player !== null && s.nations[player] ? playerView(s, s.nations[player]) : null,
    notices, pending: player !== null ? pendingView(s, w, player) : [],
    wars: warsView(s),
    sieges: s.sieges.map((x) => ({ loc: x.loc, nation: x.nation, progress: x.progress, garrison: x.garrison })),
    battles: s.battles.map((b) => ({ id: b.id, loc: b.loc, att: b.attNation, def: b.defNation, lossA: b.lossA, lossD: b.lossD, startA: b.startA, startD: b.startD, phase: b.phase })),
    chronicle: chron, snow: monthly ? new Float32Array(s.loc.snow) : undefined, roads: monthly ? roadLevels(s) : undefined, ranking: s.ranking, msPerDay,
    explored: monthly ? exploredView() : undefined,
    landmarks: monthly ? landmarksView(s, w) : undefined,
  };
  const tr: Transferable[] = [view.owner!.buffer, view.ctrl!.buffer]; if (view.snow) tr.push(view.snow.buffer); if (view.roads) tr.push(view.roads.buffer); if (view.explored) tr.push(view.explored.buffer);
  post({ type: 'tick', view }, tr);
  if (monthly && mapMode !== 'political' && mapMode !== 'terrain') mapDirty = true;
  if (mapDirty) sendColors();
}
/** The player's explored map (all known in observer mode or once everything is revealed). */
function exploredView(): Uint8Array {
  const out = new Uint8Array(w.N).fill(1);
  const n = player !== null ? s.nations[player] : null;
  const e = n && !s.flags.revealAll ? s.explored[n.knows] : null;
  if (e) for (let i = 0; i < w.N && i < e.length; i++) out[i] = e[i] ? 1 : 0;
  return out;
}
function sendColors() {
  mapDirty = false;
  const { rgba, legend } = mapModeColors(s, w, mapMode, mapFocus >= 0 ? mapFocus : player ?? -1);
  post({ type: 'colors', mode: mapMode, rgba, legend }, [rgba.buffer]);
}

let timer: any = null, lastSend = 0, acc = 0, lastT = 0;
function loop() {
  timer = null;
  if (!s || speed === 0 || s.ended) return;
  const now = performance.now();
  const dt = Math.min(250, now - lastT); lastT = now;
  acc += dt / 1000 * DAYS_PER_SEC[speed];
  let n = 0; const t0 = performance.now();
  while (acc >= 1 && performance.now() - t0 < 45) {
    acc -= 1; n++;
    const a = performance.now(); advanceDay(s, w); msPerDay = msPerDay * 0.9 + (performance.now() - a) * 0.1;
    // pause on important events for the player
    if (player !== null && s.pending.some((p) => p.nation === player && p.day === s.day)) { acc = 0; break; }
    if (s.ended) break;
  }
  if (acc > 3) acc = 3; // never fall far behind
  if (n && (now - lastSend > 90 || speed <= 2)) { lastSend = now; sendTick(); }
  timer = setTimeout(loop, speed === 5 ? 0 : 16);
}
function setSpeed(v: number) {
  speed = Math.max(0, Math.min(5, v | 0));
  if (speed && !timer) { lastT = performance.now(); acc = Math.max(acc, 1); timer = setTimeout(loop, 0); }
  sendTick();
}

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  try {
    switch (m.type) {
      case 'init': {
        const b = await loadBase(m.year);
        if (m.save) s = loadBinary(m.save);
        else s = startRecorded(w, b.setups[m.year], b.hubs, { seed: m.seed, year: m.year, player: m.player, difficulty: m.difficulty, devtools: !!m.devtools });
        player = m.save ? (s.playerNations[0] ?? null) : m.player;
        if (m.save && m.devtools) s.flags.devtools = 1;
        if (m.save && m.difficulty !== undefined) s.difficulty = m.difficulty;
        lastNotice = s.notices.length ? s.notices[s.notices.length - 1].id : 0; lastChron = s.chronicle.length; lastOwnerChange = ((s as any).ownerChanges || []).length;
        speed = 0; mapDirty = true;
        post({ type: 'ready', L: w.L, S: w.S, nations: nationLites(s, w) });
        sendTick(true);
        break;
      }
      case 'player': player = m.player; recordCommand(s, w, { t: '__player', player: m.player }); sendTick(true); break;
      case 'speed': setSpeed(m.speed); break;
      case 'cmd': {
        const res = recordCommand(s, w, m.cmd);
        post({ type: 'cmdResult', id: m.id, res });
        sendTick();
        break;
      }
      case 'query': post({ type: 'reply', id: m.id, data: answer(s, w, player ?? -1, m.q) }); break;
      case 'save': { const data = saveBinary(s); post({ type: 'saved', id: m.id, data }, [data.buffer]); break; }
      case 'mapmode': mapMode = m.mode; mapFocus = m.focus; sendColors(); break;
    }
  } catch (e: any) {
    post({ type: 'error', message: String(e?.stack || e) });
  }
};
