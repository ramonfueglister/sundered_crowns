// The frame of the world (data/content/world_extent.json): the part of the earth the game shows and plays on. The
// data of the land go round the globe; the view is held inside the frame, so that nothing outside it is shown.
import extent from '../../data/content/world_extent.json';
import type { Projection } from './region';

/** The frame in cells of a projection: its columns from west to east and its rows from north to south. */
export interface Extent {
  west: number;
  east: number;
  north: number;
  south: number;
}

/** The world's frame in the cells of a projection, no taller than the region itself. */
export function extentOf(p: Pick<Projection, 'cellOf' | 'rows'>): Extent {
  const [west, north] = p.cellOf(extent.west, extent.north),
    [east, south] = p.cellOf(extent.east, extent.south);
  return { west, east, north: Math.max(0, north), south: Math.min(p.rows, south) };
}

/**
 * The middle nearest (u, v) at which a picture `wide` by `tall` cells lies inside the frame. A picture larger than
 * the frame is held at the frame's middle.
 */
export function heldIn(e: Extent, u: number, v: number, wide: number, tall: number): [number, number] {
  const right = Math.min(e.east - e.west, wide) / 2,
    down = Math.min(e.south - e.north, tall) / 2;
  return [Math.min(e.east - right, Math.max(e.west + right, u)), Math.min(e.south - down, Math.max(e.north + down, v))];
}
