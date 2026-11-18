// Builds a piece of the world from the map's data: what the worker does for a piece that is asked for
// (piece.worker.ts), and the tool that builds the tables of the coarse steps ahead (tools/worldprobe/build_tables.ts).
import gazetteer from '../../data/content/gazetteer.json';
import landmarks from '../../data/content/landmarks.json';
import { onGrid } from '../lookprobe/layout';
import { loadTownPeople } from '../figures';
import { loadArable } from './arable';
import { loadClimate } from './climate';
import { type Cover, loadPlan, usePlan } from './far';
import { loadForest } from './forest';
import { loadHamletLands } from './hamlets';
import { FINER_STEPS } from './land';
import { loadParcels } from './lots';
import { loadModels } from './models';
import { Water, loadWindow } from './region';
import { loadRural } from './rural';
import { loadInhabitants } from './towns';
import { type Piece, type WorldScene, buildWorld, windowOf } from './world';

/** What a piece is built from, beside its place: the region, where its data lie, and the world's start year. */
export interface From { region: string; base: string; bakedSky: boolean; /** the world's start year, whose towns are built, whose forest stands and whose people live on the land (default 1356) */ year?: number; /** side of the ground the piece is built on, where it is not the usual one (layout.ts: GRID); the piece's ox, oz and part are given on that ground */ grid?: number }

/**
 * Builds a piece of a step; null where it is open sea. `mean`: the cover of its ground from the finer step. The
 * ground has the side `grid` wherever its size counts, and only there: nothing waits while it holds, so a build
 * that is taken up meanwhile cannot change it.
 */
export async function buildPiece(from: From, step: number, piece: Piece, mean: Cover | null = null): Promise<WorldScene | null> {
  const { region: name, base, bakedSky, year } = from;
  // the step's blocks are cells of the data's step `data`, or drawn finer than its finest cells (land.ts)
  const data = Math.max(0, step - FINER_STEPS), w = onGrid(from.grid, () => windowOf(piece.ox, piece.oz));
  const region = await loadWindow(data ? `${name}/z${data}` : name, w.gx0, w.gy0, w.w, w.h, base, 2 ** Math.max(0, FINER_STEPS - step));
  if (region.water.every((k) => k === Water.Sea)) return null;
  // a far step lays out its places by the plan of the finest step, where there is one (far.ts)
  if (step > 0) usePlan(await loadPlan(base, year ?? 1356));
  if (step === 0) await loadTownPeople(undefined, year); // the persons of the 30 cities walk in their towns (src/figures/people.ts)
  const climate = await loadClimate(base, region.worldW ?? region.mapW, region.worldH ?? region.mapH), people = await loadInhabitants(base, year), models = await loadModels(base);
  const forest = await loadForest(base, year, region.worldW ?? region.mapW, region.worldH ?? region.mapH), rural = await loadRural(base, year, region.mapW, region.mapH), arable = await loadArable(base, year, region.mapW, region.mapH);
  const hamlets = await loadHamletLands(base, year ?? 1356), parcels = await loadParcels(base, year ?? 1356);
  return onGrid(from.grid, () => buildWorld(region, piece, gazetteer.places, landmarks.landmarks, bakedSky, step, climate, people, models, forest, rural, arable, hamlets, parcels, undefined, mean));
}
