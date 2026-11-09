# 3D models for the map (Blender)

The map's props (trees, houses, churches, castles, soldiers, ships) are modelled procedurally in Blender
(bmesh, no hand-made files) and exported to `public/models/models.json` + `public/models/models.bin`.
The game loads them with `loadModels()` from `src/render/models.ts` (or `loadModelSet()` in the renderer's
`props.ts`); every mesh found there replaces the renderer's built-in stand-in of the same name.

## Rebuild

    blender -b --python tools/models/build_models.py              # writes public/models/models.{json,bin}
    blender -b --python tools/models/render_sheet.py              # contact sheet (Cycles, CPU, 2 threads)
    npx vitest run tests/models.test.ts                           # format, budgets, normals, scales

Options: `build_models.py -- --only castle,tent --out /tmp/x` (the export then holds only those meshes),
`--blend /tmp/models.blend` (also saves every model as a Blender object for inspection);
`render_sheet.py -- --models /tmp/x --only castle --out /tmp/sheet.png --tiles-dir /tmp/tiles --samples 16 --threads 2`.
The build prints triangles, vertices, height and radius per mesh and fails if a mesh exceeds its budget.
Blender 4.0.2 was used; the build takes about 10 s, the full sheet about 2 minutes on 2 threads.

## Contract (the renderer depends on it)

- `models.bin`: all vertices of all meshes, float32 little-endian, interleaved
  `[px, py, pz, nx, ny, nz, r, g, b, tint]` (stride 40 bytes); then all indices as uint32, **local to their mesh**
  (0..vertexCount-1). Index data starts at byte `totalVertices * 40`. The file is exactly
  `totalVertices * 40 + totalIndices * 4` bytes.
- `models.json`: `{ "version": 1, "stride": 40, "totalVertices": n, "totalIndices": m, "meshes": { "<name>":
  { "vertexOffset", "vertexCount", "indexOffset", "indexCount", "height", "radius" } } }` (offsets in vertices /
  indices). `height` = max z, `radius` = max horizontal distance from the origin.
- Space: Z up, X east, Y north, right-handed. Origin at the ground centre of the model (z = 0 is the ground);
  ships float with the waterline at z = 0.
- Facing: **everything faces +Y**: ship bows, the cannon's muzzle, and all figures (soldiers, the horse and rider).
  With rotation 0 the game's camera (looking north) therefore sees soldiers from behind; turn land figures by
  about pi (or pi +- 0.5 for a three-quarter view) if they should face the viewer. The windmill's sails face -Y.
- Scale: a standing soldier is 1.0 tall (head and hat; spears and pikes stand above), houses 1.0-1.5 (ridge
  about 1.3, chimneys a little more), a church tower with spire 3.2, trees 1.7-2.1, the castle 3.95 wide, ship hulls
  2.4-2.7 long at the waterline (bowsprits and flags extend further).
- Flat shading: every triangle has its own vertices and normal (vertices are only shared inside one planar face).
- Colours: plain RGB 0..1 per vertex. They are authored as the values the props shader uses directly: it writes
  them to the (non-sRGB) canvas without any gamma step, so they behave as display values (the renderer's built-in
  stand-ins use the same kind of values). Should the renderer ever switch to an `-srgb` canvas or linear lighting,
  decode them with about `pow(c, 2.2)` at load time. `render_sheet.py` decodes them that way for Cycles.
- `tint` is exactly 0 or 1. 1 marks parts recoloured with the owner's colour (banners, tabards, coats, shields,
  sails, pennants, caparison, castle flag, tent stripes); their base colour is a neutral grey around 0.82 (0.56 on
  backs and edges, 0.94 on highlights), which the shader's `mix(nc, vcol * nc * 1.25, 0.35)` turns into the nation
  colour at 0.89-1.06 brightness.
- Broadleaf trees and the bush keep their leaves clearly green (g > 1.12 r and g > 1.2 b) because the shader
  recolours such vertices through the seasons; trunks do not pass that test.

## Meshes and budgets (triangles)

| mesh | tris | budget | notes |
|---|---|---|---|
| tree_conifer_a | 90 | 160 | spruce, four drooping star-shaped tiers |
| tree_conifer_b | 90 | 160 | slender silver fir, five tiers, bluer |
| tree_broadleaf_a | 100 | 160 | oak: stout trunk, two limbs, broad lumpy crown |
| tree_broadleaf_b | 90 | 160 | lime/beech: grey trunk, tall light-green crown |
| tree_palm | 109 | 160 | date palm: curved ringed trunk, seven fronds, fruit |
| bush | 60 | 160 | three lobes |
| house_timber | 198 | 300 | jettied half-timbered house, steep red tile roof, chimney |
| house_stone | 265 | 300 | stone house with stepped gables, slate roof, quoins |
| house_mediterranean | 171 | 300 | whitewashed, low hipped terracotta roof, shutters, annex, steps |
| house_steppe_yurt | 186 | 300 | felt yurt, ornament band, painted door facing south |
| farm_barn | 226 | 1500 | plank barn, hipped thatch roof, haystack, fence |
| windmill | 325 | 1500 | whitewashed tower mill, thatched cap, four lattice sails |
| church_gothic | 682 | 1500 | buttressed nave, apse, west tower with pinnacles and spire, porch |
| mosque | 1027 | 1500 | prayer hall, drum and lead dome, corner turrets, domed portico, pencil minaret |
| castle | 1305 | 1500 | curtain walls with merlons, four round towers, gatehouse, keep with turrets, hall, flag |
| town_wall_tower | 227 | 1500 | square tower with tiled pyramid roof and wall stubs |
| tent | 114 | 200 | round pavilion, striped roof (tinted stripes), pole and pennant |
| soldier_infantry | 454 | 700 | kettle hat, gambeson, tinted tabard, spear, tinted heater shield |
| soldier_pikeman | 462 | 700 | crested morion, breastplate, tinted doublet, parti-coloured hose, 2.15 pike |
| soldier_archer | 475 | 700 | hood, tinted livery coat, longbow, quiver |
| soldier_musketeer | 624 | 700 | broad hat with tinted plume, long tinted coat, bandolier, matchlock, rest |
| soldier_cavalry | 1022 | 1400 | bay horse in a tinted trapper, knight with great helm, lance and pennon, shield |
| cannon | 578 | 600 | bronze barrel on a split-trail carriage, spoked wheels, muzzle +Y |
| banner_standard | 246 | 700 | pole, crossbar, large tinted swallow-tailed banner with gilt fringe |
| ship_cog | 800 | 1600 | clinker hull, crenellated aftcastle and forecastle, one square tinted sail |
| ship_galley | 664 | 1600 | long low hull, spur, 18 oars, pavises, striped awning, lateen sail |
| ship_carrack | 860 | 1600 | high castles, three masts, courses, topsail, lateen mizzen, spritsail |
| ship_ship_of_the_line | 1356 | 1600 | two-decker, black and ochre with gun ports, copper bottom, 7 square sails, jibs, spanker, ensign |

## Files

- `build_models.py`: the modelling toolkit (boxes, lathes, lofts, tubes, plates with thickness, roofs, crenellations,
  wall decals) and one function per mesh, then triangulation and export.
- `render_sheet.py`: renders each mesh from the exported binary (stored normals as custom normals, tint shown in a
  sample red) twice per tile, as placed and turned by 180 degrees, plus a line-up at true relative scale; the
  labelled montage goes to `/mnt/project-files/sundered-crowns/screens/models/contact_sheet.png`.
- `tests/models.test.ts`: format, mesh list, local indices, budgets, tint 0/1, unit and flat normals that agree
  with the winding, height/radius, ground at z = 0, the scales above, ships' bows and the cannon's muzzle at +Y,
  and the loader (`parseModels` / `loadModels`).

## Status (for whoever continues)

Done: all 28 meshes (the 27 of the task plus `tent`), within budget; exporter, loader, test and contact sheet.
The church, mosque and houses are narrowed (horizontal `footprint` factor) so that they fit the renderer's town
spiral (neighbouring houses about 1.2 house units apart, the church scaled 0.75 in the centre).

Known weaknesses: figures are stylised and blocky up close (no hands or faces to speak of); the lateen and fore-and-aft
sails are still thin when seen exactly from bow or stern; the castle's diagonal radius (2.67) is larger than the old
stand-in's, so at capitals it may touch the outermost houses; farm_barn, windmill and town_wall_tower are not placed
by the renderer yet; galley and ship of the line are not used by the renderer yet (it picks cog and carrack).
