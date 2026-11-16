// The landmark models that live in files (public/models/landmarks/, written by tools/blender): fetched once per worker
// and read into batches, so that world.ts can place them like the hand-built ones.
import type { Batch } from '../lookprobe/batch';
import { MONUMENT_FILES } from '../buildings';
import { glbToBatch } from '../buildings/landmarks/glb';

let loaded: Promise<Map<string, Batch>> | undefined;
/** The batches of every monument file, by file name. */
export function loadModels(base: string): Promise<Map<string, Batch>> {
  loaded ??= (async () => {
    const out = new Map<string, Batch>();
    await Promise.all(MONUMENT_FILES.map(async (file) => {
      const r = await fetch(`${base}models/landmarks/${file}`);
      if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
      out.set(file, glbToBatch(await r.arrayBuffer()));
    }));
    return out;
  })();
  return loaded;
}
