// Writes the pieces that are kept on disk (store.ts), off the page's thread and off the workers that build. A piece
// is written as it comes, unzipped: that takes a few hundredths of a second and none of a core, so a page that is
// closed or loaded again right after its picture is whole has its pieces all the same. Zipping a piece takes a tenth
// of a second and more of a core, so that waits while the workers build what the picture is missing (measured: with
// the zipping at once, each piece of a leap of the zoom took a tenth of a second longer to build); then the unzipped
// files are zipped one after the other, and each zipped file takes the place of its unzipped one. The worker tells
// the page which pieces are kept, so that only those are looked for, and lets go of the ones unused the longest once
// they are more than the disk should hold.
import { RAW, folderOf, nameOf, zipped } from './store';

export type StoreAsk = { build: string; /** megabytes the kept pieces may take */ room: number } | { put: string; bytes: ArrayBuffer } | { used: string } | { /** the workers are building what the picture is missing */ busy: boolean };
export interface StoreSays { /** the pieces kept when the store was opened */ have?: string[]; /** a piece that is now kept, or was not (`failed`) */ put?: string; failed?: boolean; /** pieces let go of to make room */ gone?: string[]; /** megabytes kept */ holds?: number }

/** megabytes of unzipped pieces that may lie on disk (10 to 30 MB each, zipped 3 to 4); what comes on top is zipped at once */
const UNZIPPED = 300;
/** every kept piece: the size of its file, whether that is still unzipped, and when it was last written or read */
const files = new Map<string, { size: number; raw: boolean; used: number }>();
/** what the kept pieces take, an unzipped one counted as the quarter it will be zipped (so that it does not push older pieces out for the moment it lies there); and the bytes of the unzipped ones as they are */
let folder: FileSystemDirectoryHandle | null = null, room = 0, holds = 0, unzipped = 0;
const booked = (f: { size: number; raw: boolean }) => (f.raw ? f.size / 4 : f.size);
const say = (m: StoreSays) => (self as unknown as Worker).postMessage({ ...m, holds: Math.round(holds / 1e6) } satisfies StoreSays);
type Listed = FileSystemDirectoryHandle & { entries(): AsyncIterable<[string, FileSystemHandle]> };
const fileOf = (name: string, raw: boolean) => (raw ? name + RAW : name);

/** Takes a piece's file out of the books (and off the disk, unless another has just taken its place there). */
async function drop(name: string, off = true) {
  const f = files.get(name);
  if (!f) return;
  files.delete(name); holds -= booked(f); if (f.raw) unzipped -= f.size;
  if (off) await folder!.removeEntry(fileOf(name, f.raw)).catch(() => {});
}
/** Takes a piece off the disk whose file may be broken, zipped or not. */
async function wipe(name: string) {
  await drop(name);
  for (const raw of [false, true]) await folder!.removeEntry(fileOf(name, raw)).catch(() => {});
}

async function open(build: string) {
  folder = await folderOf(build, async (all) => {
    // (the pieces of other builds are of no use to this one)
    for await (const [name] of (all as Listed).entries()) if (name !== nameOf(build)) await all.removeEntry(name, { recursive: true });
  });
  const handles: [string, FileSystemHandle][] = [];
  if (folder) for await (const entry of (folder as Listed).entries()) handles.push(entry);
  const piece = (file: string) => (file.endsWith(RAW) ? file.slice(0, -RAW.length) : file);
  // the page is told at once what there is: it is waiting to ask for its first pieces
  say({ have: [...new Set(handles.map(([file]) => piece(file)))] });
  for (const [name, handle] of handles) {
    const file = await (handle as FileSystemFileHandle).getFile().catch(() => null);
    if (!file) continue;
    // (a piece that was being zipped when the page closed has both files: the unzipped one is whole)
    const raw = name.endsWith(RAW), had = files.get(piece(name));
    if (had && !raw) { await folder!.removeEntry(name).catch(() => {}); continue; }
    if (had) await drop(piece(name));
    const f = { size: file.size, raw, used: file.lastModified };
    files.set(piece(name), f); holds += booked(f); if (raw) unzipped += file.size;
  }
  // (never more than half of what the browser still gives the page)
  const { quota = 0, usage = 0 } = await navigator.storage.estimate().catch(() => ({ quota: 0, usage: 0 }));
  if (quota) room = Math.min(room, (quota - usage + holds) / 2);
  say({});
}

/** Writes a piece's file, zipped or as it is, in place of the one it had; room is made by the pieces unused the longest. */
async function write(name: string, bytes: ArrayBuffer, raw: boolean, used = Date.now()) {
  const file = await (await folder!.getFileHandle(fileOf(name, raw), { create: true })).createSyncAccessHandle();
  try { file.truncate(0); file.write(new Uint8Array(bytes), { at: 0 }); file.flush(); } finally { file.close(); }
  const had = files.get(name);
  await drop(name, !!had && had.raw !== raw);
  const f = { size: bytes.byteLength, raw, used };
  files.set(name, f); holds += booked(f); if (raw) unzipped += bytes.byteLength;
  const gone: string[] = [];
  if (holds > room) for (const [old] of [...files].sort((a, b) => a[1].used - b[1].used)) {
    if (holds <= room * 0.9) break;
    if (old === name) continue;
    await drop(old); gone.push(old);
  }
  return gone;
}

async function put(name: string, bytes: ArrayBuffer) {
  if (!folder) return say({ put: name, failed: true });
  try {
    const raw = unzipped + bytes.byteLength <= UNZIPPED * 1e6;
    say({ put: name, gone: await write(name, raw ? bytes : await zipped(bytes), raw) });
  } catch {
    // (the disk is full, or the file is held elsewhere: the piece is built again next time)
    await wipe(name);
    say({ put: name, failed: true, gone: [name] });
  }
}

/** Zips a piece that lies there unzipped. */
async function zip(name: string) {
  const f = files.get(name);
  if (!f?.raw) return;
  try {
    const bytes = await (await (await folder!.getFileHandle(fileOf(name, true))).getFile()).arrayBuffer();
    say({ gone: await write(name, await zipped(bytes), false, f.used) });
  } catch {
    await wipe(name);
    say({ gone: [name] });
  }
}

/** the pieces that wait to be written, in the order they came */
const waiting: { name: string; bytes: ArrayBuffer }[] = [];
let busy = false, working = false, opened: Promise<void> = Promise.resolve();
/** Writes what waits, one piece after the other, and zips what lies there unzipped while the workers are not busy. */
async function work() {
  if (working) return;
  working = true;
  await opened.catch(() => {});
  for (;;) {
    const next = waiting.shift();
    if (next) { await put(next.name, next.bytes); continue; }
    const raw = busy || !folder ? undefined : [...files].find(([, f]) => f.raw)?.[0];
    if (raw === undefined) break;
    await zip(raw);
  }
  working = false;
}

self.onmessage = (e: MessageEvent<StoreAsk>) => {
  const ask = e.data;
  if ('build' in ask) { room = ask.room * 1e6; opened = open(ask.build); void work(); }
  else if ('put' in ask) { waiting.push({ name: ask.put, bytes: ask.bytes }); void work(); }
  else if ('busy' in ask) { busy = ask.busy; void work(); }
  else { const f = files.get(ask.used); if (f) f.used = Date.now(); }
};
