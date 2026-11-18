// Writes the pieces that are kept on disk (store.ts), off the page's thread and off the workers that build: zipping
// a piece takes a tenth of a second and more of a core. So it waits with that while the workers build what the
// picture is missing, as long as the pieces that wait are not too many to hold (measured: with the zipping at once,
// each piece of a leap of the zoom took a tenth of a second longer to build). It tells the page which pieces are
// kept, so that only those are looked for, and lets go of the ones unused the longest once they are more than the
// disk should hold.
import { folderOf, nameOf, zipped } from './store';

export type StoreAsk = { build: string; /** megabytes the kept pieces may take */ room: number } | { put: string; bytes: ArrayBuffer } | { used: string } | { /** the workers are building what the picture is missing */ busy: boolean };
export interface StoreSays { /** the pieces kept when the store was opened */ have?: string[]; /** a piece that is now kept, or was not (`failed`) */ put?: string; failed?: boolean; /** pieces let go of to make room */ gone?: string[]; /** megabytes kept */ holds?: number }

/** megabytes of pieces that may wait to be zipped while the workers are busy; what comes on top is zipped at once */
const HELD = 300;
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
  const handles: [string, FileSystemHandle][] = [];
  if (folder) for await (const entry of (folder as Listed).entries()) handles.push(entry);
  // the page is told at once what there is: it is waiting to ask for its first pieces
  say({ have: handles.map(([name]) => name) });
  for (const [name, handle] of handles) {
    const file = await (handle as FileSystemFileHandle).getFile().catch(() => null);
    if (file) { files.set(name, { size: file.size, used: file.lastModified }); holds += file.size; }
  }
  // (never more than half of what the browser still gives the page)
  const { quota = 0, usage = 0 } = await navigator.storage.estimate().catch(() => ({ quota: 0, usage: 0 }));
  if (quota) room = Math.min(room, (quota - usage + holds) / 2);
  say({});
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

/** the pieces that wait to be zipped and written, and their bytes in all */
const waiting: { name: string; bytes: ArrayBuffer }[] = [];
let weight = 0, busy = false, writing = false, opened: Promise<void> = Promise.resolve();
/** Writes what waits, one piece after the other, while the workers are not busy or too much waits. */
async function write() {
  if (writing) return;
  writing = true;
  await opened.catch(() => {});
  while (waiting.length && (!busy || weight > HELD * 1e6)) {
    const next = waiting.shift()!;
    weight -= next.bytes.byteLength;
    await put(next.name, next.bytes);
  }
  writing = false;
}

self.onmessage = (e: MessageEvent<StoreAsk>) => {
  const ask = e.data;
  if ('build' in ask) { room = ask.room * 1e6; opened = open(ask.build); }
  else if ('put' in ask) { waiting.push({ name: ask.put, bytes: ask.bytes }); weight += ask.bytes.byteLength; void write(); }
  else if ('busy' in ask) { busy = ask.busy; void write(); }
  else { const f = files.get(ask.used); if (f) f.used = Date.now(); }
};
