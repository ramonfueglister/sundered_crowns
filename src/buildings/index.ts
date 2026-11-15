// The buildings of the world: houses, churches and mosques, fortifications, works, and the real monuments.
//
// core/        shapes every building is made of (walls and what is drawn on them, roofs, drums, domes, battlements)
// houses/      the house: its storey height, its style parameters, the block it is built from, whole houses
// traditions/  how each land builds (house styles, parish and great churches by region)
// sacred/      churches, the cathedral, the domed church, the mosque
// fortified/   town towers, the castle, the town wall
// works/       bridges, the lighthouse
// landmarks/   the real monuments of landmarks.json that have a model of their own
//
// Everything here runs in the world's web workers: no DOM, no renderer, and a model depends only on its arguments and
// its random source, so every piece of the world builds the same building.
export { FLOOR, type HouseStyle, METRES_PER_BLOCK, m, m2 } from './houses/style';
export { house, townHouse } from './houses/house';
export { NORTH, SOUTH, TERRACE, TIMBER } from './traditions/house-styles';
export { type Style, styleOf } from './traditions/regions';
export type { Model } from './model';
export { ROOFS, WALLS } from './palette';
export { church, spireChurch } from './sacred/church';
export { cathedral } from './sacred/cathedral';
export { domedChurch } from './sacred/domed-church';
export { mosque } from './sacred/mosque';
export { tower } from './fortified/tower';
export { castle } from './fortified/castle';
export { townWall } from './fortified/town-wall';
export { bridge } from './works/bridge';
export { lighthouse } from './works/lighthouse';
export { type FileModel, MONUMENTS, MONUMENT_FILES, type MonumentPart, isFile, modelOf } from './landmarks';
export { basilica, campanile, palace } from './landmarks/st-marks';
export { hagiaSophia } from './landmarks/hagia-sophia';
