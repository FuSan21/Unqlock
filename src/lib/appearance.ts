import type { Stored } from './api';

export const appearanceDefaults = { enabled: true, tray: true, canvas: true, icons: true, tiles: true, trayLabels: false, accents: false, backgrounds: false, borders: false, labels: true, symbols: true, compact: false, containerSpacing: false, containerHeaders: false, containerGuides: false, containerDepth: false, containerSticky: false, containerEnd: false };
export type Appearance = typeof appearanceDefaults;
export type AppearanceKey = keyof Appearance;

// Each reset owns the keys shown on its page; the home switch is left alone.
export const layoutKeys = (Object.keys(appearanceDefaults) as AppearanceKey[]).filter(key => key === 'compact' || key.startsWith('container'));
export const styleKeys = (Object.keys(appearanceDefaults) as AppearanceKey[]).filter(key => key !== 'enabled' && !layoutKeys.includes(key));
export const containerKeys = layoutKeys.filter(key => key.startsWith('container'));

export function appearanceSettings(value?: Stored): Appearance {
  return Object.fromEntries((Object.entries(appearanceDefaults) as [AppearanceKey, boolean][]).map(([key, fallback]) => [key, typeof value?.[key] === 'boolean' ? value[key] : fallback])) as Appearance;
}
