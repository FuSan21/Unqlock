import type { Stored } from './api';

export const panels = {
  agent: { label:'Build Agent', close:'Collapse left', open:'Expand left', side:'left' },
  explore: { label:'Explore', close:'Collapse right', open:'Expand right', side:'right' },
  properties: { label:'Properties', close:'Collapse properties panel', open:'Expand properties panel', side:'right' },
  tray: { label:'Component tray', close:'Close component tray', open:'Expand component tray panel', side:'left' }
};
export type PanelId = keyof typeof panels;
export type Visibility = 'native' | 'start' | 'always';
export type Sizing = 'native' | 'custom' | 'remember';
export interface PanelPreference { visibility: Visibility; sizing: Sizing; width: number | null }
export type PanelSettings = Record<PanelId, PanelPreference>;
export const panelIds = Object.keys(panels) as PanelId[];

export const width = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 120 && value <= 1600 ? Math.round(value) : null;

export function settings(value?: Stored): PanelSettings {
  return Object.fromEntries(panelIds.map(id => {
    const raw = value?.[id];
    return [id, {
      visibility:['native', 'start', 'always'].includes(raw?.visibility) ? raw.visibility : 'native',
      sizing:['native', 'custom', 'remember'].includes(raw?.sizing) ? raw.sizing : 'native',
      width:width(raw?.width)
    }];
  })) as PanelSettings;
}

export const rememberedKey = (id: string) => 'panelWidth_' + id;
