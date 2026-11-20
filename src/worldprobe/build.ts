// Builds a piece of the world from the map's data: what the worker does for a piece that is asked for
// (piece.worker.ts), and the tool that builds the tables of the coarse steps ahead (tools/worldprobe/build_tables.ts).
import gazetteer from '../../data/content/gazetteer.json';
import landmarks from '../../data/content/landmarks.json';
import { GRID, onGrid } from '../lookprobe/layout';
import { loadTownPeople } from '../figures';
import { loadArable } from './arable';
import { loadClimate } from './climate';
import { type Cover, loadPlan, usePlan } from './far';
import { loadForest } from './forest';
import { loadHamletLands } from './hamlets';
import { FINER_STEPS } from './land';
import { loadParcels } from './lots';
import { loadRoads } from './roads';
import { loadModels } from './models';
import { type Index, type Region, Water, indexOf, loadWindow } from './region';
import { loadRural } from './rural';
import { loadInhabitants } from './towns';
import { type Piece, type WorldScene, buildWorld, windowOf } from './world';

/** What a piece is built from, beside its place: the region, where its data lie, and the world's start year. */
export interface From {
  region: string;
  base: string;
  bakedSky: boolean;
  /** the world's start year, whose towns are built, whose forest stands and whose people live on the land (default 1356) */
  year?: number;
  /** side of the ground the piece is built on, where it is not the usual one (layout.ts: GRID); the piece's ox, oz and part are given on that ground */
  grid?: number;
}

/**
 * Builds a piece of a step; null where it is open sea. `mean`: the cover of its ground from the finer step. The
 * ground has the side `grid` wherever its size counts, and only there: nothing waits while it holds, so a build
 * that is taken up meanwhile cannot change it.
 */
export async function buildPiece(
  from: From,
  step: number,
  piece: Piece,
  mean: Cover | null = null,
): Promise<WorldScene | null> {
  const { region: name, base, bakedSky, year } = from;
  // the step's blocks are cells of the data's step `data`, or drawn finer than its finest cells (land.ts)
  // (a river's level is settled for the whole river in the data, so a ground narrower than the usual one needs no
  // more of the map than it covers: world.ts)
  const data = Math.max(0, step - FINER_STEPS),
    w = onGrid(from.grid, () => windowOf(piece.ox, piece.oz)),
    own = w;
  const region = await loadWindow(
    data ? `${name}/z${data}` : name,
    w.gx0,
    w.gy0,
    w.w,
    w.h,
    base,
    2 ** Math.max(0, FINER_STEPS - step),
  );
  // open sea is a piece whose own ground holds nothing else, whatever lies beyond it
  let land = false;
  for (let y = own.gy0 - w.gy0; y < own.gy0 - w.gy0 + own.h && !land; y++)
    for (let x = own.gx0 - w.gx0; x < own.gx0 - w.gx0 + own.w; x++)
      if (region.water[y * region.w + x] !== Water.Sea) {
        land = true;
        break;
      }
  if (!land) return null;
  // a far step lays out its places by the plan of the finest step, where there is one (far.ts)
  if (step > 0) usePlan(await loadPlan(base, year ?? 1356));
  const { climate, people, models, forest, rural, arable, hamlets, parcels, roads } = await mapData(
    base,
    year,
    region,
    step === 0,
  );
  return onGrid(from.grid, () =>
    buildWorld(
      region,
      piece,
      gazetteer.places,
      landmarks.landmarks,
      bakedSky,
      step,
      climate,
      people,
      models,
      forest,
      rural,
      arable,
      hamlets,
      parcels,
      undefined,
      mean,
      undefined,
      roads,
    ),
  );
}

/**
 * The map's data a piece is built from, beside its window of the region: each part is fetched and unpacked once by
 * a worker and kept (every loader keeps what it loaded), and all parts are asked for at once, not one after the other.
 * `people`: with the persons of the towns, who walk in the pieces of the finest step (src/figures/people.ts).
 */
async function mapData(
  base: string,
  year: number | undefined,
  map: Pick<Region | Index, 'mapW' | 'mapH' | 'worldW' | 'worldH'>,
  people: boolean,
) {
  const w = map.worldW ?? map.mapW,
    h = map.worldH ?? map.mapH;
  const [climate, inhabitants, models, forest, rural, arable, hamlets, parcels, roads] = await Promise.all([
    loadClimate(base, w, h),
    loadInhabitants(base, year),
    loadModels(base),
    loadForest(base, year, w, h),
    loadRural(base, year, map.mapW, map.mapH),
    loadArable(base, year, map.mapW, map.mapH),
    loadHamletLands(base, year ?? 1356),
    loadParcels(base, year ?? 1356),
    loadRoads(base, year ?? 1356),
    people ? loadTownPeople(undefined, year) : undefined,
  ]);
  return { climate, people: inhabitants, models, forest, rural, arable, hamlets, parcels, roads };
}

/**
 * Loads what the pieces of the finest step are built from, before the first of them is asked for: the region's
 * index and the map's data (some 4 MB to fetch, and unpacked in every worker). Its first piece then takes a worker
 * as long as every other, not half a second more. The tiles of the region come with the pieces that lie on them.
 */
export async function warmPieces(from: Pick<From, 'region' | 'base' | 'year'>): Promise<void> {
  const index = await indexOf(from.region, from.base);
  await mapData(from.base, from.year, index, true);
}
