// The pieces of the world kept on disk, in the browser's own file system for the page (OPFS): a piece takes most of
// a second of a core to build and a few hundredths to read again. Each piece is a file of its packed lists
// (pack.ts), gzipped: 3 to 4 MB where its lists are 10 to 30 MB. Until there is time to zip it, a piece lies there
// unzipped, in a file of its name with `.raw` after it. The files of one build of the game lie in a folder of that
// build's name, since any build may shape the land differently; store.worker.ts writes them and clears out the
// folders of other builds.

/** the folder all kept pieces lie in, one folder to a build under it */
const STORE = 'pieces';

/** what follows a piece's name in the name of its unzipped file */
export const RAW = '.raw';

/** a build's name as the name of its folder */
export const nameOf = (build: string) => build.replace(/[^\w.-]/g, '_');

/** The folder of a build's pieces; null where the browser has no such file system (or does not let the page at it). */
export async function folderOf(
  build: string,
  others?: (all: FileSystemDirectoryHandle) => Promise<void>,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    const all = await (await navigator.storage.getDirectory()).getDirectoryHandle(STORE, { create: true });
    await others?.(all);
    return await all.getDirectoryHandle(nameOf(build), { create: true });
  } catch {
    return null;
  }
}

/** The bytes of a kept piece, unzipped; null where there is none, or it is being written, or it cannot be read. */
export async function kept(folder: FileSystemDirectoryHandle, name: string): Promise<ArrayBuffer | null> {
  try {
    const file = await (await folder.getFileHandle(name)).getFile();
    return await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  } catch {
    /* not zipped yet, or the zipped file is being written: its unzipped file is there until that is whole */
  }
  try {
    return await (await (await folder.getFileHandle(name + RAW)).getFile()).arrayBuffer();
  } catch {
    return null;
  }
}

export const zipped = (bytes: ArrayBuffer): Promise<ArrayBuffer> =>
  new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
