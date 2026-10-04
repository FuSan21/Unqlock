"use strict";
// Settings export and import. Pure functions over stored values; the popup does the reading and writing.
globalThis.UnqlockTransfer = (() => {
  const format = 1;
  const maxLength = 1024 * 1024;
  // Sections follow the popup pages, so an import can replace one page's settings and keep the rest.
  const sections = {
    style: 'Component style',
    layout: 'Canvas layout',
    panels: 'Builder panels',
    environments: 'Environments',
    launcher: 'Floating launcher'
  };
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const pick = (source, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(source, key)).map(key => [key, source[key]]));
  function panelWidths(stored) {
    return Object.fromEntries(Object.keys(UnqlockPanels.panels).map(id => [id, UnqlockPanels.width(stored[UnqlockPanels.rememberedKey(id)])]));
  }
  // `appearance` normalizes the appearance object with the popup's defaults.
  function create(stored, { version, appearance, now = new Date() }) {
    return {
      unqlock: format,
      extensionVersion: version,
      exportedAt: now.toISOString(),
      settings: {
        appearance: appearance(stored.appearance),
        rowLayout: UnqlockRowLayout.settings(stored.rowLayout),
        canvasToolbar: UnqlockToolbar.settings(stored.canvasToolbar),
        componentColors: UnqlockColors.settings(stored.componentColors),
        builderPanels: UnqlockPanels.settings(stored.builderPanels),
        panelWidths: panelWidths(stored),
        environment: UnqlockEnvironment.settings(stored.environment),
        floating: UnqlockEnvironment.floatingSettings(stored.floating)
      }
    };
  }
  function stringify(stored, options) {
    return JSON.stringify(create(stored, options), null, 2) + '\n';
  }
  // Returns the sections present in a file. Invalid values are rejected here, before anything is written.
  function parse(text, { layoutKeys }) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('Paste exported settings or choose a JSON file.');
    if (text.length > maxLength) throw new Error('This file is larger than 1 MB and is not an Unqlock export.');
    let file;
    try { file = JSON.parse(text); } catch { throw new Error('This is not valid JSON. Copy the whole export and try again.'); }
    if (!isObject(file) || !Number.isInteger(file.unqlock) || !isObject(file.settings)) throw new Error('This JSON is not an Unqlock settings export.');
    if (file.unqlock > format) throw new Error('These settings come from a newer version of Unqlock. Update Unqlock and try again.');
    const settings = file.settings;
    for (const key of ['appearance', 'rowLayout', 'canvasToolbar', 'componentColors', 'builderPanels', 'panelWidths', 'environment', 'floating']) {
      if (Object.hasOwn(settings, key) && !isObject(settings[key])) throw new Error('The ' + key + ' value must be an object.');
    }
    const appearance = settings.appearance || {};
    const present = {
      style: Object.keys(appearance).some(key => !layoutKeys.includes(key)) || Boolean(settings.componentColors),
      layout: Object.keys(appearance).some(key => layoutKeys.includes(key)) || Boolean(settings.rowLayout || settings.canvasToolbar),
      panels: Boolean(settings.builderPanels || settings.panelWidths),
      environments: Boolean(settings.environment) && ['groups', 'blockProduction', 'autoDiscover'].some(key => Object.hasOwn(settings.environment, key)),
      launcher: Boolean(settings.floating) || Object.hasOwn(settings.environment || {}, 'badge')
    };
    if (present.environments) {
      try { UnqlockEnvironment.settings(settings.environment); } catch (error) { throw new Error('Environments: ' + error.message); }
    }
    const found = Object.keys(sections).filter(id => present[id]);
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
  function apply(parsed, chosen, stored, { appearance, layoutKeys }) {
    const settings = parsed.settings;
    const selected = id => chosen.includes(id) && parsed.sections.includes(id);
    const update = {};
    const current = appearance(stored.appearance);
    const incoming = appearance(settings.appearance);
    const styleKeys = Object.keys(current).filter(key => !layoutKeys.includes(key));
    if (selected('style') || selected('layout')) {
      update.appearance = {
        ...current,
        ...(selected('style') ? pick(incoming, styleKeys) : {}),
        ...(selected('layout') ? pick(incoming, layoutKeys) : {})
      };
    }
    // A style import replaces the colors too; a file without them restores the defaults.
    if (selected('style')) update.componentColors = UnqlockColors.settings(settings.componentColors);
    if (selected('layout')) {
      update.rowLayout = UnqlockRowLayout.settings(settings.rowLayout);
      update.canvasToolbar = UnqlockToolbar.settings(settings.canvasToolbar);
    }
    if (selected('panels')) {
      update.builderPanels = UnqlockPanels.settings(settings.builderPanels);
      for (const id of Object.keys(UnqlockPanels.panels)) update[UnqlockPanels.rememberedKey(id)] = UnqlockPanels.width(settings.panelWidths?.[id]);
    }
    if (selected('launcher') && settings.floating) update.floating = UnqlockEnvironment.floatingSettings(settings.floating);
    let environment = null;
    if (selected('environments') || (selected('launcher') && Object.hasOwn(settings.environment || {}, 'badge'))) {
      environment = UnqlockEnvironment.settings(stored.environment);
      if (selected('environments')) {
        const imported = UnqlockEnvironment.settings(settings.environment);
        environment = { ...environment, blockProduction:imported.blockProduction, autoDiscover:imported.autoDiscover, groups:imported.groups };
      }
      if (selected('launcher') && Object.hasOwn(settings.environment || {}, 'badge')) environment.badge = settings.environment.badge === true;
      environment = UnqlockEnvironment.settings(environment);
    }
    return { update, environment };
  }
  function fileName(now = new Date()) {
    return 'unqlock-settings-' + now.toISOString().slice(0, 10) + '.json';
  }
  return { format, sections, create, stringify, parse, apply, fileName };
})();
