// The climate of every land place of the map (public/data/place_climate.json, written by
// tools/worldprobe/build_place_climate.ts from the climate layer of the world graphic, whose kinds of land come from
// the Köppen-Geiger zones: tools/worldprobe/build_climate.py). Static data, like the map: the farming year of a place
// goes by it (src/sim/people/farm_year.ts).

/** The climates of a place as the farming year tells them apart. */
export const CLIMATE = {
  /** any other: temperate, boreal, the tropics, the cold */
  other: 0,
  /** the Mediterranean kind of land (Köppen-Geiger Cs: dry summers, rain in the winter) */
  mediterranean: 1,
  /** steppe or desert (Köppen-Geiger B) */
  dry: 2,
} as const;

/** The letter of each climate (CLIMATE) in the file, one per land place. */
export const CLIMATE_LETTERS = '-md';

export interface PlaceClimateJson {
  about: string;
  /** one letter per land place of the map, in its order (CLIMATE_LETTERS) */
  places: string;
}

/** The climate of each land place (CLIMATE). */
export function compilePlaceClimate(j: PlaceClimateJson): Uint8Array {
  const out = new Uint8Array(j.places.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, CLIMATE_LETTERS.indexOf(j.places[i]));
  return out;
}
