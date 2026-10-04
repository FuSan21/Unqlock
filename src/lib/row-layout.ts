import type { Stored } from './api';

export const sections = {
  icon: 'Icon',
  name: 'Property ID',
  type: 'Type badge',
  chip: 'Dependencies',
  actions: 'Actions menu'
};
export type Section = keyof typeof sections;
export const slots = ['left', 'middle', 'right'] as const;
export type Slot = typeof slots[number];
export type RowLayout = { enabled: boolean } & Record<Section, Slot>;
export const presets: Record<string, { label: string; positions: Record<Section, Slot> }> = {
  right: { label:'Details right', positions:{ icon:'left', name:'left', type:'right', chip:'right', actions:'right' } },
  left: { label:'All left', positions:{ icon:'left', name:'left', type:'left', chip:'left', actions:'left' } },
  middle: { label:'Details in middle', positions:{ icon:'left', name:'left', type:'middle', chip:'middle', actions:'right' } }
};
// The type badge starts beside the property ID, matching Unqork's native row.
const defaults: Record<Section, Slot> = { icon:'left', name:'left', type:'left', chip:'right', actions:'right' };

// Native keeps Unqork's own row untouched; positions are kept for the next custom layout.
export function settings(value?: Stored): RowLayout {
  return {
    enabled: value?.enabled === true,
    ...Object.fromEntries((Object.keys(sections) as Section[]).map(id => [id, slots.includes(value?.[id]) ? value[id] : defaults[id]]))
  } as RowLayout;
}

export function preset(value: RowLayout): string {
  if (!value.enabled) return 'native';
  return Object.keys(presets).find(id => (Object.keys(sections) as Section[]).every(section => presets[id].positions[section] === value[section])) || 'custom';
}
