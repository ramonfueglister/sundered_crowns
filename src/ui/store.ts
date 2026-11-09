// UI state shared by components.
import { signal, computed } from '@preact/signals';
import type { MapMode } from '../game/protocol';
import { view, nations } from '../game/client';
import { L } from './i18n';
import { refusal } from '../sim/refusals';

export type Screen = 'menu' | 'loading' | 'select' | 'game' | 'end';
export const screen = signal<Screen>('menu');
export const startYear = signal(1356);
export const selectedLoc = signal(-1);
export const selectedNation = signal(-1);
export const selectedArmies = signal<number[]>([]);
export type PanelId = 'none' | 'economy' | 'government' | 'diplomacy' | 'military' | 'knowledge' | 'society' | 'ledger' | 'chronicle' | 'decisions' | 'settings' | 'pause' | 'dev' | 'saves' | 'peace' | 'works'
  | 'battle' // war pass: a battle report (panelArg { id })
  | 'trade' | 'explore' // trade pass
  | 'empire' // realm pass
  | 'victory'; // polish pass
export const panel = signal<PanelId>('none');
export const panelArg = signal<any>(null);
/** The open dialog of the realm pass (panels/realmdialogs.tsx): the assembly's vote or a situation's window. */
export const realmDialog = signal<{ kind: 'assembly'; cmd: any } | { kind: 'situation'; id: string } | null>(null);
export const mapMode = signal<MapMode>('political');
export const hoverLoc = signal(-1);
export const uiHidden = signal(false);
export const toast = signal<{ text: string; kind?: 'ok' | 'err'; t: number } | null>(null);
export const tutorialStep = signal(-1);
export const lastSpeed = signal(2);

export interface Settings {
  quality: 'low' | 'medium' | 'high' | 'ultra'; music: number; sfx: number; autosaveMonths: number; edgePan: boolean; uiScale: number; pauseOnEvents: boolean;
  // ---- polish pass: colour-blind palette, high-contrast borders, resolution scale (0.5..1), browser notifications (opt-in)
  palette: 'normal' | 'cvd'; highContrast: boolean; resScale: number; notify: boolean;
}
const DEF: Settings = { quality: 'high', music: 0.5, sfx: 0.7, autosaveMonths: 6, edgePan: false, uiScale: 1, pauseOnEvents: true, palette: 'normal', highContrast: false, resScale: 1, notify: false };
function loadSettings(): Settings { try { return { ...DEF, ...JSON.parse(localStorage.getItem('sc.settings') || '{}') }; } catch { return DEF; } }
export const settings = signal<Settings>(loadSettings());
export function saveSettings(p: Partial<Settings>) { settings.value = { ...settings.value, ...p }; try { localStorage.setItem('sc.settings', JSON.stringify(settings.value)); } catch { /* ignore */ } }

export const playerId = computed(() => view.value?.player?.id ?? -1);
export const playerNation = computed(() => nations.value[playerId.value]);
/** A short message at the bottom; error texts that come straight from the simulation (English keys) are translated. */
export function showToast(text: string, kind: 'ok' | 'err' = 'ok') { if (kind === 'err') text = L(refusal(text)); toast.value = { text, kind, t: Date.now() }; setTimeout(() => { if (toast.value && Date.now() - toast.value.t > 2900) toast.value = null; }, 3000); }
export function openPanel(p: PanelId, arg: any = null) { panelArg.value = arg; panel.value = panel.value === p && arg === null ? 'none' : p; }
