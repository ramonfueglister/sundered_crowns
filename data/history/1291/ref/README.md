# Euratlas 1300 reference labels

Derived facts only. No Euratlas images or HTML are stored in this repository.

**Source:** Euratlas Periodis, Europe in 1300 (Christos Nüssli), as shown on euratlas.net: the four quarter maps
(`1300_Northwest/Northeast/Southwest/Southeast`), the 245 per-entity maps, and the regional maps
`apenninica_1300` and `aegean_1300`. Euratlas shows 1300, not 1291. Expect differences: Acre is already Mamluk,
Aleppo is under the Ilkhanate (Ghazan's 1299–1300 occupation), and Konya is in Karaman.

## Files

- `euratlas_1300_states.tsv` has one row per Euratlas entity, with these columns:
  - `index`: the number the JSON uses.
  - `name`: the short name.
  - `full_name`: the full name.
  - `status`: one of sovereign, dependent or people.
  - `overlord`: Euratlas's "Depends on".
  - `capital`: Euratlas states none on these pages, so this column is empty.
  - `quarter`: which quarter of the map holds the centre of the entity's highlighted area.
  - `page`: the entity page.
- `euratlas_1300_places.json` holds four arrays, each one entry per place `0..L-1` of `public/data/geo.json`:
  - `place`: the sovereign entity index.
  - `dependent`: the dependent entity index, which is also used for a sovereign that holds land under another (England in Gascony).
  - `confidence`: from 0 to 1.
  - `-1` means outside Euratlas coverage or unmapped (white desert).

## Method

1. **Entity masks.** Each entity page highlights one entity on the same full-Europe frame. A red outline marks land held in sovereignty. A green outline or green tint marks land held as a dependency. Diffing each page against the per-pixel median of all 245 pages gives the outline. The outline is filled to an area with a ray-parity inside test. Where that failed, a flat-colour fill is accepted only if it passes the same inside test.
2. **Geometry.** The quarter maps turned out to be exact 0.59× crops of the entity frame; the offsets were measured by colour matching. I measured 55 city dots by hand on the quarter maps: 13 on NW, 6 on NE, 20 on SW, 23 on SE. These fix the entity frame with a 3rd-order polynomial in lon/lat. The fit has 0.74 px rms and 0.97 px leave-one-out rms (about 2.7 km). An affine fit leaves 8 px, so the higher order is needed. The regional maps have their own projections and were fitted separately:
   - Apennine: 20 cities, 2nd-order polynomial, 1.5 px rms.
   - Aegean: 12 cities, affine, 1.8 px rms.

   The per-image residuals are in the JSON under `residuals_px`.
3. **Sampling.** Each place is labelled at its centre point:
   - in the entity frame, by a 3×3 majority vote;
   - on each quarter or regional map that covers it, by the flat-colour segment it lies in, labelled by the entity-mask majority within that segment.

   A weighted vote combines these; the regional maps get weight 0.6 because they chain two fits. The "Copyright Euratlas" box on the entity frame is treated as no data.

## Check

49 of 54 known cities match. The five misses:

- Konya → Karaman and Aleppo → Ilkhanate: this is what Euratlas shows.
- Venice → Padua: our Venice place centre lies 18 km inland.
- Milan → Lodi: the place centre falls on the border pixel.
- Bergen: just outside the map frame.
