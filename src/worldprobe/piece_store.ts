// The pieces kept on disk, for pieces.ts: the store of the game's build (store.ts, written by store.worker.ts), which
// pieces it keeps, the bytes of those on their way to it, and whether the workers are busy with what the picture is
// missing (the store zips what it has written once they are through).
import type { Stage } from '../lookprobe/stage';
import type { StoreAsk, StoreSays } from './store.worker';

/** megabytes of pieces kept on disk (3 to 4 MB each); beyond that the ones unused the longest are let go of */
const ROOM = 1000;
/** megabytes of pieces that may wait to be written to disk (10 to 30 MB each; they are written as they come and zipped later); one that comes on top is not kept */
const WAITING = 600;

export interface PieceStore {
  /** the name of the game's build: pieces of another build are not read */
  readonly build: string;
  /** whether the store has told which pieces it keeps */
  readonly listed: boolean;
  /** whether the piece of this file is kept */
  kept(name: string): boolean;
  /** whether the piece of this file is on its way to be kept */
  sending(name: string): boolean;
  /** the piece of this file was read: it is let go of last */
  used(name: string): void;
  /** the bytes of a piece, written unless too many wait to be written already */
  put(name: string, bytes: ArrayBuffer): void;
  /** whether the workers are busy with what the picture is missing */
  busy(pressed: boolean): void;
  dispose(): void;
}

/**
 * The store of the pieces of the build `build`, or null in a browser that does not run it (the pieces are built as
 * before). `changed` is called once the store has told which pieces it keeps; `lost`, once it has failed: from then
 * on nothing is kept.
 */
export function openStore(stage: Stage, build: string, changed: () => void, lost: () => void): PieceStore | null {
  if (typeof navigator === 'undefined' || !('storage' in navigator) || !('getDirectory' in navigator.storage))
    return null;
  /** the pieces kept on disk, by the names of their files, once the store has told them */
  const kept = new Set<string>();
  /** the bytes of the pieces sent to be written, until the store has answered */
  const sent = new Map<string, number>();
  let listed = false,
    waiting = 0,
    busy = false;
  const worker = new Worker(new URL('./store.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<StoreSays>) => {
    if (e.data.have) {
      for (const name of e.data.have) kept.add(name);
      listed = true;
      changed();
    }
    if (e.data.put) {
      waiting -= sent.get(e.data.put) ?? 0;
      sent.delete(e.data.put);
      if (!e.data.failed) kept.add(e.data.put);
    }
    for (const name of e.data.gone ?? []) kept.delete(name);
    if (e.data.holds !== undefined) stage.probe.counts['MB kept'] = e.data.holds;
  };
  // (a store that has failed is let go of, once)
  worker.onerror = () => {
    worker.onerror = null;
    worker.terminate();
    lost();
  };
  worker.postMessage({ build, room: ROOM } satisfies StoreAsk);
  return {
    build,
    get listed() {
      return listed;
    },
    kept: (name) => kept.has(name),
    sending: (name) => sent.has(name),
    used: (name) => worker.postMessage({ used: name } satisfies StoreAsk),
    put(name, bytes) {
      const size = bytes.byteLength;
      if (waiting + size < WAITING * 1e6 && !sent.has(name)) {
        waiting += size;
        sent.set(name, size);
        worker.postMessage({ put: name, bytes } satisfies StoreAsk, [bytes]);
      } else stage.probe.counts['pieces not kept'] = (stage.probe.counts['pieces not kept'] ?? 0) + 1;
    },
    busy(pressed) {
      if (pressed === busy) return;
      busy = pressed;
      worker.postMessage({ busy } satisfies StoreAsk);
    },
    dispose: () => worker.terminate(),
  };
}
