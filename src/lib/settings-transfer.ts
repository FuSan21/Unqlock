// Settings export and import. Pure functions over stored values; the popup does the reading and writing.
import type { Stored } from './api';
import { appearanceSettings, layoutKeys, type AppearanceKey } from './appearance';
import * as Colors from './component-colors';
import * as Environment from './environment';
import * as Panels from './panel-settings';
import * as RowLayout from './row-layout';
import * as Toolbar from './toolbar-settings';

export const format = 1;
const maxLength = 1024 * 1024;
// Sections follow the popup pages, so an import can replace one page's settings and keep the rest.
export const sections = {
  style: 'Component style',
  layout: 'Canvas layout',
  panels: 'Builder panels',
  environments: 'Environments',
  launcher: 'Floating launcher'
};
export type SectionId = keyof typeof sections;
export interface Parsed { sections: SectionId[]; extensionVersion: string; exportedAt: Date | null; settings: Stored }

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const pick = <T extends object>(source: T, keys: string[]) => Object.fromEntries(keys.filter(key => Object.hasOwn(source, key)).map(key => [key, source[key as keyof T]]));

function panelWidths(stored: Stored) {
  return Object.fromEntries(Panels.panelIds.map(id => [id, Panels.width(stored[Panels.rememberedKey(id)])]));
}

export function create(stored: Stored, { version, now = new Date() }: { version: string; now?: Date }) {
  return {
    unqlock: format,
    extensionVersion: version,
    exportedAt: now.toISOString(),
    settings: {
      appearance: appearanceSettings(stored.appearance),
      rowLayout: RowLayout.settings(stored.rowLayout),
      canvasToolbar: Toolbar.settings(stored.canvasToolbar),
      componentColors: Colors.settings(stored.componentColors),
      builderPanels: Panels.settings(stored.builderPanels),
      panelWidths: panelWidths(stored),
      environment: Environment.settings(stored.environment),
      floating: Environment.floatingSettings(stored.floating)
    }
  };
}

export function stringify(stored: Stored, options: { version: string; now?: Date }) {
  return JSON.stringify(create(stored, options), null, 2) + '\n';
}

// Returns the sections present in a file. Invalid values are rejected here, before anything is written.
export function parse(text: unknown): Parsed {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Paste exported settings or choose a JSON file.');
  if (text.length > maxLength) throw new Error('This file is larger than 1 MB and is not an Unqlock export.');
  let file: Stored;
  try { file = JSON.parse(text); } catch { throw new Error('This is not valid JSON. Copy the whole export and try again.'); }
  if (!isObject(file) || !Number.isInteger(file.unqlock) || !isObject(file.settings)) throw new Error('This JSON is not an Unqlock settings export.');
  if ((file.unqlock as number) > format) throw new Error('These settings come from a newer version of Unqlock. Update Unqlock and try again.');
  const settings = file.settings;
  for (const key of ['appearance', 'rowLayout', 'canvasToolbar', 'componentColors', 'builderPanels', 'panelWidths', 'environment', 'floating']) {
    if (Object.hasOwn(settings, key) && !isObject(settings[key])) throw new Error('The ' + key + ' value must be an object.');
  }
  const appearance = settings.appearance || {};
  const isLayoutKey = (key: string) => (layoutKeys as string[]).includes(key);
  const present: Record<SectionId, boolean> = {
    style: Object.keys(appearance).some(key => !isLayoutKey(key)) || Boolean(settings.componentColors),
    layout: Object.keys(appearance).some(isLayoutKey) || Boolean(settings.rowLayout || settings.canvasToolbar),
    panels: Boolean(settings.builderPanels || settings.panelWidths),
    environments: Boolean(settings.environment) && ['groups', 'blockProduction', 'autoDiscover'].some(key => Object.hasOwn(settings.environment as object, key)),
    launcher: Boolean(settings.floating) || Object.hasOwn(settings.environment || {}, 'badge')
  };
  if (present.environments) {
    try { Environment.settings(settings.environment); } catch (error) { throw new Error('Environments: ' + (error as Error).message); }
  }
  const found = (Object.keys(sections) as SectionId[]).filter(id => present[id]);
  if (!found.length) throw new Error('This export contains no settings to import.');
  return {
    sections: found,
    extensionVersion: typeof file.extensionVersion === 'string' ? file.extensionVersion.slice(0, 20) : '',
    exportedAt: typeof file.exportedAt === 'string' && !Number.isNaN(Date.parse(file.exportedAt)) ? new Date(file.exportedAt) : null,
    settings
  };
}

// Builds the storage update for the chosen sections. Keys a section owns are replaced; everything else is kept.
// The environment is returned separately because the background saves it and registers custom-domain badges.
export function apply(parsed: Parsed, chosen: SectionId[], stored: Stored) {
  const settings = parsed.settings;
  const selected = (id: SectionId) => chosen.includes(id) && parsed.sections.includes(id);
  const update: Record<string, unknown> = {};
  const current = appearanceSettings(stored.appearance);
  const incoming = appearanceSettings(settings.appearance);
  const styleKeys = (Object.keys(current) as AppearanceKey[]).filter(key => !layoutKeys.includes(key));
  if (selected('style') || selected('layout')) {
    update.appearance = {
      ...current,
      ...(selected('style') ? pick(incoming, styleKeys) : {}),
      ...(selected('layout') ? pick(incoming, layoutKeys) : {})
    };
  }
  // A style import replaces the colors too; a file without them restores the defaults.
  if (selected('style')) update.componentColors = Colors.settings(settings.componentColors);
  if (selected('layout')) {
    update.rowLayout = RowLayout.settings(settings.rowLayout);
    update.canvasToolbar = Toolbar.settings(settings.canvasToolbar);
  }
  if (selected('panels')) {
    update.builderPanels = Panels.settings(settings.builderPanels);
    for (const id of Panels.panelIds) update[Panels.rememberedKey(id)] = Panels.width(settings.panelWidths?.[id]);
  }
  if (selected('launcher') && settings.floating) update.floating = Environment.floatingSettings(settings.floating);
  let environment: Environment.EnvironmentSettings | null = null;
  if (selected('environments') || (selected('launcher') && Object.hasOwn(settings.environment || {}, 'badge'))) {
    environment = Environment.settings(stored.environment);
    if (selected('environments')) {
      const imported = Environment.settings(settings.environment);
      environment = { ...environment, blockProduction:imported.blockProduction, autoDiscover:imported.autoDiscover, groups:imported.groups };
    }
    if (selected('launcher') && Object.hasOwn(settings.environment || {}, 'badge')) environment.badge = settings.environment.badge === true;
    environment = Environment.settings(environment);
  }
  return { update, environment };
}

export function fileName(now = new Date()) {
  return 'unqlock-settings-' + now.toISOString().slice(0, 10) + '.json';
}
