// Writes the pieces that are kept on disk (store.ts), off the page's thread and off the workers that build: zipping
// a piece takes a tenth of a second and more. It tells the page which pieces are kept, so that only those are
// looked for, and lets go of the ones unused the longest once they are more than the disk should hold.
import { folderOf, nameOf, zipped } from './store';

export type StoreAsk = { build: string; /** megabytes the kept pieces may take */ room: number } | { put: string; bytes: ArrayBuffer } | { used: string };
export interface StoreSays { /** the pieces kept when the store was opened */ have?: string[]; /** a piece that is now kept, or was not (`failed`) */ put?: string; failed?: boolean; /** pieces let go of to make room */ gone?: string[]; /** megabytes kept */ holds?: number }

/** every kept piece: its size, and when it was last written or read */
const files = new Map<string, { size: number; used: number }>();
let folder: FileSystemDirectoryHandle | null = null, room = 0, holds = 0;
const say = (m: StoreSays) => (self as unknown as Worker).postMessage({ ...m, holds: Math.round(holds / 1e6) } satisfies StoreSays);
type Listed = FileSystemDirectoryHandle & { entries(): AsyncIterable<[string, FileSystemHandle]> };

async function open(build: string) {
  folder = await folderOf(build, async (all) => {
    // (the pieces of other builds are of no use to this one)
    for await (const [name] of (all as Listed).entries()) if (name !== nameOf(build)) await all.removeEntry(name, { recursive: true });
  });
  if (folder) for await (const [name, handle] of (folder as Listed).entries()) {
    const file = await (handle as FileSystemFileHandle).getFile();
    files.set(name, { size: file.size, used: file.lastModified }); holds += file.size;
  }
  // (never more than half of what the browser still gives the page)
  const { quota = 0, usage = 0 } = await navigator.storage.estimate().catch(() => ({ quota: 0, usage: 0 }));
  if (quota) room = Math.min(room, (quota - usage + holds) / 2);
  say({ have: [...files.keys()] });
}

async function put(name: string, bytes: ArrayBuffer) {
  if (!folder) return say({ put: name, failed: true });
  try {
    const zip = await zipped(bytes), file = await (await folder.getFileHandle(name, { create: true })).createSyncAccessHandle();
    try { file.truncate(0); file.write(new Uint8Array(zip), { at: 0 }); file.flush(); } finally { file.close(); }
    holds += zip.byteLength - (files.get(name)?.size ?? 0);
    files.set(name, { size: zip.byteLength, used: Date.now() });
    // room is made by the pieces unused the longest
    const gone: string[] = [];
    if (holds > room) for (const [old, f] of [...files].sort((a, b) => a[1].used - b[1].used)) {
      if (holds <= room * 0.9) break;
      if (old === name) continue;
      await folder.removeEntry(old).catch(() => {});
      files.delete(old); holds -= f.size; gone.push(old);
    }
    say({ put: name, gone });
  } catch {
    // (the disk is full, or the file is held elsewhere: the piece is built again next time)
    await folder.removeEntry(name).catch(() => {});
    if (files.has(name)) { holds -= files.get(name)!.size; files.delete(name); }
    say({ put: name, failed: true, gone: [name] });
  }
}

// one after the other, in the order asked
let last: Promise<unknown> = Promise.resolve();
self.onmessage = (e: MessageEvent<StoreAsk>) => {
  const ask = e.data;
  last = last.then(() => {
    if ('build' in ask) { room = ask.room * 1e6; return open(ask.build); }
    if ('put' in ask) return put(ask.put, ask.bytes);
    const f = files.get(ask.used);
    if (f) f.used = Date.now();
  }).catch(() => {});
};
