import type { Stored } from './api';
import { oneOf } from './normalize';

export const controls = {
  search: { label:'Search bar', always:'Always visible' },
  sort: { label:'Sort mode', always:'Switches' }
};
export type ToolbarControl = keyof typeof controls;
export const modes = ['native', 'always'] as const;
export type ToolbarMode = typeof modes[number];
const mode = oneOf(modes, 'native');
export type ToolbarSettings = Record<ToolbarControl, ToolbarMode>;

// Each control either keeps Unqork's own behavior or stays open.
export function settings(value?: Stored): ToolbarSettings {
  return Object.fromEntries(Object.keys(controls).map(id => [id, mode(value?.[id])])) as ToolbarSettings;
}
