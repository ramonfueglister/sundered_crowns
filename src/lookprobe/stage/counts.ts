// What the stage counts for the tools that take pictures of it (Stage.probe.counts): the shaders the renderer builds,
// what a picture sends to the graphics card, the time a picture takes the page and the graphics card, and the
// pictures a second (`fps`).
import type * as THREE from 'three/webgpu';
import type { Stage } from './api';

type Probe = Stage['probe'];

/** Counts the shaders the renderer builds (`shaders built`) and the time they take the page's thread (`ms shaders`). */
export function countShaders(renderer: THREE.WebGPURenderer, probe: Probe) {
  renderer.debug.onNodeBuilderCreated = (builder: unknown) => {
    // (three hands over its NodeBuilder untyped here; its `build` is what makes the shader)
    const made = builder as { build(): unknown },
      build = made.build.bind(made);
    made.build = () => {
      const began = performance.now(),
        c = probe.counts;
      try {
        return build();
      } finally {
        c['shaders built'] = (c['shaders built'] ?? 0) + 1;
        c['ms shaders'] = Math.round(((c['ms shaders'] ?? 0) + performance.now() - began) * 10) / 10;
      }
    };
  };
}

/**
 * Counts each picture: what it sent to the graphics card in lists (`MB sent`; a tool sets `MB sent most` to 0 and
 * reads the most a picture has sent since), and with `timed` (?gpu=1) what it took (see `clock`).
 */
export function countPictures(renderer: THREE.WebGPURenderer, probe: Probe, timed: boolean) {
  let drawn = 0,
    since = performance.now(),
    began = 0,
    had = 0;
  /**
   * What a picture took, for the tools: the page's own time to hand it over (`draw ms`), and the graphics card's time
   * for it, in all (`gpu ms`) and pass by pass in the order they are drawn (`gpu pass 0` …); each also summed over
   * the pictures (`… sum`, with `gpu pictures` and `draw pictures`), so that a tool can take means between two reads.
   */
  const clock = (draw: number) => {
    const c = probe.counts,
      add = (name: string, v: number) => {
        c[name] = v;
        c[`${name} sum`] = (c[`${name} sum`] ?? 0) + v;
      };
    add('draw ms', draw);
    c['draw pictures'] = (c['draw pictures'] ?? 0) + 1;
    void renderer.resolveTimestampsAsync('render').then((all) => {
      // (three's backends keep their timestamp pools to themselves; this is the shape of WebGPUBackend's)
      const pool = (
        renderer.backend as unknown as {
          timestampQueryPool?: { render?: { timestamps: Map<string, number>; frames: number[] } };
        }
      ).timestampQueryPool?.render;
      if (all === undefined || !pool) return;
      add('gpu ms', all);
      c['gpu pictures'] = (c['gpu pictures'] ?? 0) + 1;
      // the passes of the last picture that was measured, as they followed each other
      const last = `:f${pool.frames[pool.frames.length - 1]}`;
      let k = 0;
      for (const [uid, ms] of pool.timestamps) if (uid.endsWith(last)) add(`gpu pass ${k++}`, ms);
      c['gpu passes'] = k;
    });
  };
  /** just before a picture is drawn */
  const before = () => {
    began = timed ? performance.now() : 0;
    had = renderer.info.memory.attributesSize;
  };
  /** just after the `pictures`-th picture is drawn */
  const after = (pictures: number) => {
    drawn++;
    const c = probe.counts,
      sent = (renderer.info.memory.attributesSize - had) / 1e6;
    c.pictures = pictures;
    c['MB sent'] = sent;
    c['MB sent sum'] = (c['MB sent sum'] ?? 0) + sent;
    c['MB sent most'] = Math.max(c['MB sent most'] ?? 0, sent);
    if (sent > 0) c['pictures sending'] = (c['pictures sending'] ?? 0) + 1;
    if (timed) clock(performance.now() - began);
    if (performance.now() - since >= 1000) {
      probe.fps = Math.round((drawn * 1000) / (performance.now() - since));
      drawn = 0;
      since = performance.now();
    }
  };
  return { before, after };
}
