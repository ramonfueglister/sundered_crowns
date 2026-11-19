// Look probe: one fixed scene, rendered with the camera of Ramon's reference image, to be judged side by side with it.
// The address options are those of the stage (see stage/index.ts).
import { glbToBatch } from '../buildings/landmarks/glb';
import { buildScene } from './scene';
import { showError, stage } from './stage';

/** ?campanile=glb shows the campanile exported by tools/blender in place of the hand-built one, for comparison. */
async function swaps() {
  if (new URLSearchParams(location.search).get('campanile') !== 'glb') return {};
  return { campanile: glbToBatch(await (await fetch('/models/landmarks/campanile_san_marco_1356.glb')).arrayBuffer()) };
}

swaps().then((s) => stage((bakedSky) => buildScene(bakedSky, s))).catch(showError);
