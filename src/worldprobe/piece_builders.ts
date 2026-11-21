// The workers that build the pieces (piece.worker.ts), for pieces.ts: how many there are, each job to the worker that
// holds the fewest, and the jobs taken back that the view no longer needs first.
import type { CancelJob, PersonsNews, PieceDone, PieceJob, WarmJob } from './piece.worker';
import { RANK_KIND, type Spot, type Wanted } from './piece_sight';

/**
 * the jobs a worker holds at once: the one it builds and the next, whose tables it fetches meanwhile (piece.worker.ts).
 * One at a time, a worker stood still while the tables of its next piece came over the network, about as long as it
 * takes to draw them. A job that waits its turn is taken back when the view no longer asks for it, or when a piece the
 * view asks for more urgently has no worker; it is then given out again as the view asks.
 */
const DEPTH = 2;

/** a piece given to a worker to build; `taken`: asked back */
export interface Job extends Spot {
  worker: Worker;
  taken?: boolean;
}
/** a piece waiting for a worker, with its rank where the view asks for it (piece_sight.ts RANK) */
export type Queued = Spot & { rank?: number };

interface Builders {
  /** the jobs given out and not yet answered, by their numbers */
  readonly jobs: ReadonlyMap<number, Job>;
  /** Tells every worker, once, to load the map's data of the finest step. */
  warm(job: WarmJob): void;
  /** Hands every worker newer lists of persons. */
  tell(news: PersonsNews): void;
  /**
   * Gives out the pieces from the end of `queue`, each to the worker that holds the fewest jobs, while one holds
   * fewer than DEPTH. `began` is called for each before its job (`jobOf`) is sent.
   */
  give(queue: Queued[], began: (spot: Spot) => void, jobOf: (spot: Spot, id: number) => PieceJob): void;
  /** Asks back the jobs the view no longer needs first (see DEPTH): it asks for `wanted`, `queue` has no worker yet. */
  takeBack(wanted: readonly Wanted[], queue: readonly Queued[]): void;
  dispose(): void;
}

/**
 * `count` workers (default: as many as leave four of the machine's cores to the page, the graphics and the store, up
 * to six; on a small machine as before, up to four and one core left: each worker holds some 200 MB of the map's
 * data). `done` is called with every job a worker answers, `failed` with the message of a worker's error.
 */
export function createBuilders(
  count: number | undefined,
  done: (job: Job, answer: PieceDone) => void,
  failed: (message: string) => void,
): Builders {
  const workers: Worker[] = [],
    jobs = new Map<number, Job>();
  let nextId = 1,
    warmed = false;
  const cores = navigator.hardwareConcurrency || 2;
  for (let k = Math.max(1, count ?? Math.max(Math.min(4, cores - 1), Math.min(6, cores - 4))); k > 0; k--) {
    const worker = new Worker(new URL('./piece.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<PieceDone>) => {
      const job = jobs.get(e.data.id)!;
      jobs.delete(e.data.id);
      done(job, e.data);
    };
    worker.onerror = (e) => failed(e.message);
    workers.push(worker);
  }
  const loadOf = (w: Worker) => {
    let n = 0;
    for (const j of jobs.values()) if (j.worker === w) n++;
    return n;
  };
  const freest = () => {
    let best: Worker | undefined,
      least = DEPTH;
    for (const w of workers) {
      const n = loadOf(w);
      if (n < least) {
        least = n;
        best = w;
      }
    }
    return best;
  };
  return {
    jobs,
    warm(job) {
      if (warmed) return;
      warmed = true;
      for (const w of workers) w.postMessage(job);
    },
    tell(news) {
      for (const w of workers) w.postMessage(news);
    },
    give(queue, began, jobOf) {
      for (let worker = freest(); worker && queue.length; worker = freest()) {
        const next = queue.pop()!,
          id = nextId++;
        jobs.set(id, { ...next, worker });
        began(next);
        worker.postMessage(jobOf(next, id));
      }
    },
    takeBack(wanted, queue) {
      // a job that waits its turn behind another (the later of a worker's two) is taken back where the view no longer
      // asks for it, or where a piece of a more urgent kind found no worker (the kinds are those of the ranks: the
      // picture the view comes to rest at, its own step in the picture, the coarser step, around the picture …, and
      // not the distance within a kind, which changes with every move of the view); and any job the view no longer
      // asks for, in case the worker has not begun it
      const kind = (rank: number) => Math.floor(rank / RANK_KIND),
        rankOf = new Map<string, number>(),
        urgent = kind(queue[queue.length - 1]?.rank ?? Infinity);
      for (const w of wanted) {
        const had = rankOf.get(w.key);
        if (had === undefined || !(had <= w.rank)) rankOf.set(w.key, w.rank);
      }
      const later = new Set<number>();
      for (const w of workers) {
        let first = Infinity,
          last = -1;
        for (const [id, j] of jobs)
          if (j.worker === w) {
            first = Math.min(first, id);
            last = Math.max(last, id);
          }
        if (last > first) later.add(last);
      }
      for (const [id, j] of jobs) {
        if (j.taken) continue;
        const stale = !j.spare && !rankOf.has(j.key),
          behind = later.has(id) && kind(rankOf.get(j.key) ?? Infinity) > urgent;
        if (stale || behind) {
          j.taken = true;
          j.worker.postMessage({ cancel: id } satisfies CancelJob);
        }
      }
    },
    dispose: () => {
      for (const w of workers) w.terminate();
    },
  };
}
