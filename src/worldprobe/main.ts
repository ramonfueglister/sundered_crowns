// World probe: a piece of the real world in the look of the look probe, on the same stage.
// Address options, besides those of the stage (see ../lookprobe/stage.ts): ?lon=12.1&lat=45.85 (the place at the middle),
// ?km=0.54 (side of one block in kilometres), ?wide=190 (blocks across the picture), ?elev=18.7 (how far the camera
// looks down, in degrees; 60 gives a map-like view), ?shape=0 (the measured heights, without river erosion).
import { showError, stage } from '../lookprobe/stage';
import { loadRegion } from './region';
import { buildWorld } from './world';

const q = new URLSearchParams(location.search), num = (k: string, fallback: number) => Number(q.get(k)) || fallback;

// the default view: the Dolomites at the top left, the Po plain, the lagoon of Venice and the Adriatic at the right
stage(async (bakedSky) => {
  const region = await loadRegion('alps', import.meta.env.BASE_URL);
  return buildWorld(region, { lon: num('lon', 12.1), lat: num('lat', 45.85), km: num('km', region.kmPerCell), shaped: q.get('shape') !== '0' }, bakedSky);
}, { wholeGrid: true, frameW: num('wide', 0) || undefined, elevation: num('elev', 0) || undefined }).catch(showError);
