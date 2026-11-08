// Innovations appear historically in one place and spread over the location graph (literacy, trade, universities).
import type { I18n } from '../types';
export interface Innovation { id: string; name: I18n; desc: I18n; year: number; origin: string; lat: number; lon: number; branch: number; tech: number; spread: number; effects: Record<string, number>; faith?: number[] }
export const INNOVATIONS: Innovation[] = [
  { id: 'printing_press', name: { en: 'Movable-type printing', de: 'Buchdruck mit beweglichen Lettern' }, desc: { en: 'Books become cheap; literacy and new ideas spread.', de: 'Bücher werden billig; Bildung und neue Ideen verbreiten sich.' }, year: 1450, origin: 'Mainz', lat: 50.0, lon: 8.27, branch: 1, tech: 6, spread: 0.12, effects: { research: 0.1 } },
];
