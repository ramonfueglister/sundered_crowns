// What the plans of the day (src/sim/people/day_plan.ts) need of the places of the map on the main thread, as the
// world server has it (src/sim/world.ts, tools/sim/load.ts): the latitude of each place and its farming year, from
// data/geo.json and data/place_climate.json. The game's figures (src/people/day_figures.ts) and the world probe's
// (src/worldprobe/main.ts) follow the plans with it.
import { type PlaceClimateJson, compilePlaceClimate } from '../sim/content/place_climate';
import { farmYears } from '../sim/people/farm_year';

/** What the plans of the day need of the places of the map, as the world server has it (src/sim/world.ts): the
 *  latitude of each place (data/geo.json `loc.lat`) and its farming year (FARM_YEAR, src/sim/people/farm_year.ts). */
export interface PlanPlaces {
  lat: ArrayLike<number>;
  farm: ArrayLike<number>;
}

/** The map as data/geo.json has it, as far as the plans need it: the places' latitudes, and the provinces with their
 *  places (counted from 1) and region. */
interface GeoPlaces {
  loc: { lat: number[] };
  provinces: { locs: number[]; region: string }[];
}

/** What the plans need of the places of `geo`, with their climate from the game's data at `base`; without the climate
 *  (it could not be fetched) every place follows the north's farming year. */
export async function planPlaces(base: string, geo: Promise<GeoPlaces>): Promise<PlanPlaces> {
  const [g, climate] = await Promise.all([
    geo,
    fetch(`${base}data/place_climate.json`)
      // (as the file is written by tools/worldprobe/build_place_climate.ts)
      .then((r) => (r.ok ? (r.json() as Promise<PlaceClimateJson>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(compilePlaceClimate)
      .catch((e: unknown) => {
        console.error('place_climate.json:', e);
        return new Uint8Array(0);
      }),
  ]);
  const provinces = g.provinces.map((p) => ({ locs: p.locs.map((l) => l - 1), region: p.region }));
  return { lat: g.loc.lat, farm: farmYears(provinces, climate) };
}
