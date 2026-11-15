// The houses of Venice in 1356, read from measures/venedig_1356.json: Dorigo's storey heights in piedi, Squassina's
// walls and bricks, Calabi's shops under jettied upper storeys, Lupo's chimneys. What the measure file marks as an
// assumption is one here too. The fine-block measures of openings and axes come from the reference class file.
import { type RGB, rgb } from '../../lookprobe/batch';
import { m, vox } from '../houses/style';
import ref from './measures/referenzklasse_nahsicht.json';
import v from './measures/venedig_1356.json';
import type { Tradition } from './tradition';

const hex = (s: string) => rgb(parseInt(s.slice(1), 16));
const pair = (a: readonly number[]): readonly [number, number] => [a[0], a[1]];
const W = v.wand.farben_hex;

export const VENICE: Tradition = {
  // ground floor 8 or 9 piedi, upper storeys 7 or 8 (Dorigo): 3.0 m and the middle of 2.43 to 2.78 m, in fine blocks
  ground: vox(3.0), upper: vox((v.geschoss.obergeschoss_m[0] + v.geschoss.obergeschoss_m[1]) / 2), noble: vox(v.geschoss.piano_nobile_m[0]),
  storeys: pair(v.geschosse.klein), greatStoreys: pair(v.geschosse.kaufmannshaus),
  // bare ochre brick most often, pale plaster often, red plaster and red brick now and then (shares from the measure file)
  walls: Object.entries(v.wand.anteile).flatMap(([name, n]) => Array<RGB>(n).fill(hex(W[name as keyof typeof W]))),
  stone: hex(W.istrischer_stein), roof: hex(v.dach.farbe_hex), wood: hex(v.barbacani.holz_hex), chimneyC: hex(v.kamin.farbe_hex),
  window: pair(ref.fenster_feinbloecke), door: pair(ref.tuer_feinbloecke), sill: ref.fenster_sohlbank_feinblock, bay: ref.achsabstand_feinbloecke,
  arched: v.oeffnungen.bogenanteil,
  jetty: { out: vox(v.barbacani.vorsprung_m), from: v.barbacani.ab_geschoss, share: v.barbacani.anteil },
  pitch: pair(v.dach.neigung), altana: v.dach.altana_anteil,
  chimney: { height: [vox(v.kamin.hoehe_m[0]), vox(v.kamin.hoehe_m[1])], perHouse: v.kamin.anteil_je_haus },
  plot: { width: [m(v.parzelle.breite_m[0]), m(v.parzelle.breite_m[1])], depth: [m(v.parzelle.tiefe_m[0]), m(v.parzelle.tiefe_m[1])], greatWidth: [m(v.parzelle.kaufmannshaus_breite_m[0]), m(v.parzelle.kaufmannshaus_breite_m[1])] },
};
