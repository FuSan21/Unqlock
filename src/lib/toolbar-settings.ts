import type { Stored } from './api';

export const controls = {
  search: { label:'Search bar', always:'Always visible' },
  sort: { label:'Sort mode', always:'Switches' }
};
export type ToolbarControl = keyof typeof controls;
export type ToolbarMode = 'native' | 'always';
export type ToolbarSettings = Record<ToolbarControl, ToolbarMode>;

// Each control either keeps Unqork's own behavior or stays open.
export function settings(value?: Stored): ToolbarSettings {
  return Object.fromEntries(Object.keys(controls).map(id => [id, value?.[id] === 'always' ? 'always' : 'native'])) as ToolbarSettings;
}
