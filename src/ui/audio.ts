// Audio deferred by Ramon: no music and no sound effects for now. Every function is a silent no-op
// that keeps the API used by the UI. Music will come later as Suno AI tracks, which can be loaded
// from public/audio/music/ through setMood.
export type Sfx = 'click' | 'open' | 'close' | 'march' | 'battle' | 'victory' | 'defeat' | 'coins' | 'build' | 'bell' | 'event' | 'war' | 'peace' | 'error' | 'page';
export type Mood = 'peace' | 'war' | 'crisis' | 'menu';
export function initAudio(): void {}
export function sfx(_n: Sfx): void {}
export function setMood(_m: Mood, _era: number): void {}
export function setVolumes(_music: number, _sfx: number): void {}
