// World probe: a piece of the real world in the look of the look probe, on the same stage.
// Address options, besides those of the stage (see ../lookprobe/stage.ts): ?lon=12.1&lat=45.85 (the place at the middle),
// ?km=0.54 (side of one block in kilometres), ?wide=190 (blocks across the picture), ?elev=18.7 (how far the camera
// looks down, in degrees; 60 gives a map-like view), ?region=europe (the cut of the world to show).
import { N } from '../lookprobe/layout';
import { showError, stage } from '../lookprobe/stage';
import { loadRegion } from './region';
import { buildWorld } from './world';

const q = new URLSearchParams(location.search), num = (k: string, fallback: number) => Number(q.get(k)) || fallback;
/** side of one block in kilometres: the scale of the diorama */
const BLOCK_KM = 0.54;

// the default view: the Dolomites at the top left, the Po plain, the lagoon of Venice and the Adriatic at the right
stage(async (bakedSky) => {
  const lon = num('lon', 12.1), lat = num('lat', 45.85), km = num('km', BLOCK_KM);
  // the ground is turned against the map, so the window reaches as far as the ground's corners
  const { region, kmPerCell } = await loadRegion(q.get('region') ?? 'alps', lon, lat, (N / Math.SQRT2 + 4) * km, import.meta.env.BASE_URL);
  return buildWorld(region, { lon, lat, perCell: kmPerCell / km }, bakedSky);
}, { wholeGrid: true, frameW: num('wide', 0) || undefined, elevation: num('elev', 0) || undefined }).catch(showError);
