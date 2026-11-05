import type { Stored } from './api';
import { flag, oneOf } from './normalize';

export const panels = {
  agent: { label:'Build Agent', close:'Collapse left', open:'Expand left', side:'left' },
  explore: { label:'Explore', close:'Collapse right', open:'Expand right', side:'right' },
  properties: { label:'Properties', close:'Collapse properties panel', open:'Expand properties panel', side:'right' },
  tray: { label:'Component tray', close:'Close component tray', open:'Expand component tray panel', side:'left' }
};
export type PanelId = keyof typeof panels;
export const visibilities = ['native', 'start', 'always'] as const;
export type Visibility = typeof visibilities[number];
export const sizings = ['native', 'custom', 'remember'] as const;
export type Sizing = typeof sizings[number];
const visibility = oneOf(visibilities, 'native');
const sizing = oneOf(sizings, 'native');
export interface PanelPreference { visibility: Visibility; sizing: Sizing; width: number | null }
export type PanelSettings = Record<PanelId, PanelPreference>;
export const panelIds = Object.keys(panels) as PanelId[];

export const width = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 120 && value <= 1600 ? Math.round(value) : null;

export function settings(value?: Stored): PanelSettings {
  return Object.fromEntries(panelIds.map(id => {
    const raw = value?.[id];
    return [id, {
      visibility:visibility(raw?.visibility),
      sizing:sizing(raw?.sizing),
      width:width(raw?.width)
    }];
  })) as PanelSettings;
}

export const rememberedKey = (id: string) => 'panelWidth_' + id;

// Unqork's navigation tab bar: Default keeps it, Multi-line keeps it and wraps full tab names,
// Hidden removes it and keeps only the current tab.
export const tabsModes = ['native', 'wrapped', 'hidden'] as const;
export type TabsMode = typeof tabsModes[number];
export const tabsKey = 'navigationTabs';
export const tabsMode = oneOf(tabsModes, 'native');
// Default and Multi-line can keep the bar collapsed until the builder header is hovered. Hidden has no
// bar to show, so it ignores this.
export const tabsCollapsedKey = 'navigationTabsCollapsed';
export const tabsCollapsed = flag;
// A badge on each save in the builder's History that was promoted to another environment. On unless turned off.
export const promotionsKey = 'historyPromotions';
export const promotions = (value: unknown) => value !== false;
