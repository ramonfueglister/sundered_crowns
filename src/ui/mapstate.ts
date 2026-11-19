// What the world view and the HUD share about the map: the place under the pointer, the place clicked, an error to
// show over the map, and the camera actions of the map tools.
import { signal } from '@preact/signals';

/** The place under the pointer and the one clicked (−1: none). */
export const hoverPlace = signal(-1);
export const selectedPlace = signal(-1);
export const mapError = signal<string | null>(null);
/** Camera actions for the map tools (no-ops until the world view is up). */
export const mapCtl = { home(_loc: number) {} };
if (import.meta.env.DEV) (window as unknown as { __ui: unknown }).__ui = { selectedPlace }; // for browser tests
