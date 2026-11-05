import type { Stored } from './api';
import { oneOf } from './normalize';

// Each control either keeps Unqork's own behavior or adds to it, starting from its own default.
export const controls = {
  search: { label:'Search bar', always:'Always visible', fallback:'native' },
  sort: { label:'Sort mode', always:'Switches', fallback:'native' },
  // A list of the search's matches under the field, which goes to the one picked.
  results: { label:'Search results', always:'Dropdown', fallback:'always' }
} as const;
export type ToolbarControl = keyof typeof controls;
export const modes = ['native', 'always'] as const;
export type ToolbarMode = typeof modes[number];
export type ToolbarSettings = Record<ToolbarControl, ToolbarMode>;

export function settings(value?: Stored): ToolbarSettings {
  return Object.fromEntries(Object.entries(controls).map(([id, control]) => [id, oneOf(modes, control.fallback)(value?.[id])])) as ToolbarSettings;
}
