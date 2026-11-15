// A pyramid of square tiles: a tile of one level covers four of the level below it (x, y → 2x … 2x + 1, 2y … 2y + 1).
// The world's pieces of blocks and the tiles of its painted map are both laid out this way, so that a coarser tile can
// stand in for finer ones that are not there yet, and the picture never shows a hole or changes all at once.

export const keyOf = (level: number, x: number, y: number) => `${level}:${x},${y}`;
const KIDS = [[0, 0], [1, 0], [0, 1], [1, 1]] as const;

/**
 * What to show of a pyramid so that the picture is covered once, as near to level `want` as what is held allows.
 * From the tiles `roots` of level `top` down, a tile gives way to the four under it once they cover their share of the
 * picture; otherwise it stands in for them itself. Where it is missing too, finer tiles left from before fill in, as
 * far as `deeper` levels below `want`.
 */
export function cover<T>(
  want: number, top: number, roots: Iterable<readonly [number, number]>,
  held: (level: number, x: number, y: number) => T | undefined,
  inView: (level: number, x: number, y: number) => boolean, deeper = 2,
): Set<T> {
  const shown = new Set<T>();
  /** whether the part of a tile that lies in the picture can be covered at level `want`, or by the tile itself */
  const covered = (l: number, x: number, y: number): boolean =>
    !inView(l, x, y) || held(l, x, y) !== undefined || (l > want && KIDS.every(([dx, dy]) => covered(l - 1, x * 2 + dx, y * 2 + dy)));
  const show = (l: number, x: number, y: number, left: number) => {
    if (!inView(l, x, y)) return;
    const own = held(l, x, y), kids = () => { if (l > 0) for (const [dx, dy] of KIDS) show(l - 1, x * 2 + dx, y * 2 + dy, l > want ? left : left - 1); };
    if (l > want && KIDS.every(([dx, dy]) => covered(l - 1, x * 2 + dx, y * 2 + dy))) kids();
    else if (own !== undefined) shown.add(own);
    // neither the tile nor all of what lies under it: what there is of the finer levels fills in
    else if (l > want || left > 0) kids();
  };
  for (const [x, y] of roots) show(top, x, y, deeper);
  return shown;
}
