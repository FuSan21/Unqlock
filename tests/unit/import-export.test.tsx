import { fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import * as Environment from '@/lib/environment';
import { apiNames, byId, click, press, query, renderPopup, settle, type } from './harness';

type Store = Record<string, unknown> & { environment: Environment.EnvironmentSettings };

test.each(apiNames)('export by copy and download, review and import by paste and file (%s)', async apiName => {
  const original: Store = {
    appearance:{ enabled:true, compact:true, icons:false, containerGuides:true },
    rowLayout:{ enabled:true, icon:'left', name:'left', type:'middle', chip:'right', actions:'right' },
    canvasToolbar:{ search:'always' },
    componentColors:{ grids:{ light:{ ink:'#0EA5E9' }, dark:{ tint:'#0c4a6e', ink:7 } }, inputs:{ light:{ ink:'not a color' } } },
    builderPanels:{ agent:{ visibility:'always', sizing:'custom', width:420 } },
    panelWidth_explore:333,
    floating:{ enabled:true, position:'top-right' },
    environment:{ badge:true, blockProduction:true, autoDiscover:false, groups:[{ id:'org', name:'Org', domains:[{ hostname:'org-prod.unqork.io', environment:'production' }] }] }
  };
  let store: Store = structuredClone(original);
  const messages: { replace?: unknown }[] = [];
  let clipboard = '';
  let clipboardBlocked = false;
  let downloaded: { href: string; name: string } | undefined;
  let created: { url: string } | undefined;
  let pickerOpened = false;
  const close = vi.spyOn(window, 'close').mockImplementation(() => {});
  Object.defineProperty(navigator, 'clipboard', { configurable:true, value:{ writeText:async (text: string) => { if (clipboardBlocked) throw new Error('Blocked'); clipboard = text; } } });
  document.execCommand = () => false;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloaded = { href:this.href, name:this.download }; });
  await renderPopup(apiName, {
    storage:{
      local:{
        get:async (keys: string | string[]) => structuredClone(Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in store).map(key => [key, store[key]]))),
        set:async (value: object) => { Object.assign(store, structuredClone(value)); }
      },
      onChanged:{ addListener:() => {}, removeListener:() => {} }
    },
    tabs:{
      query:async () => [{ id:7, url:'https://org-prod.unqork.io/app' }],
      sendMessage:async () => ({}),
      create:async (options: { url: string }) => { created = options; }
    },
    runtime:{
      ...(apiName === 'browser' ? { getBrowserInfo:async () => ({ name:'Firefox' }) } : {}),
      getManifest:() => ({ version:'9.9.9' }),
      getURL:(file: string) => 'https://extension.test/' + file.replace(/^\//, ''),
      sendMessage:async (message: { type: string; replace?: unknown }) => {
        messages.push(message);
        let config = Environment.settings(store.environment);
        if (message.type === 'environment.save' && message.replace) { config = Environment.settings(message.replace); store.environment = structuredClone(config); }
        return { ok:true, config, missingOrigins:Environment.customOrigins(config) };
      }
    },
    permissions:{ request:async () => false },
    scripting:{ executeScript:async () => [{ result:{ ok:true } }] }
  });
  const importStatus = () => byId('import-status').textContent;
  const boxes = () => [...document.querySelectorAll<HTMLInputElement>('#import-sections input')];
  const choose = (names: string[]) => { for (const box of boxes()) if (box.checked !== names.includes(box.name)) click(box); };
  click('open-transfer'); await settle();
  expect(byId('transfer-page').hidden).toBe(false);
  expect(document.activeElement).toBe(byId('transfer-title'));

  // Copy and download export the same normalized settings.
  click('export-copy'); await settle();
  expect(byId('export-status').textContent).toMatch(/copied/);
  expect(byId('export-output').hidden).toBe(true);
  const exported = JSON.parse(clipboard);
  expect(exported.unqlock).toBe(1);
  expect(exported.extensionVersion).toBe('9.9.9');
  expect(exported.settings.appearance.compact).toBe(true);
  expect(exported.settings.appearance.tray).toBe(true);
  expect(exported.settings.rowLayout.type).toBe('middle');
  expect(exported.settings.canvasToolbar).toEqual({ search:'always', sort:'native' });
  expect(exported.settings.componentColors).toEqual({ grids:{ light:{ ink:'#0EA5E9' }, dark:{ tint:'#0C4A6E' } } });
  expect(exported.settings.builderPanels.agent.visibility).toBe('always');
  expect(exported.settings.builderPanels.tray.visibility).toBe('native');
  expect(exported.settings.panelWidths).toEqual({ agent:null, explore:333, properties:null, tray:null });
  expect(exported.settings.floating).toEqual({ enabled:true, position:'top-right' });
  expect(exported.settings.environment).toEqual(original.environment);
  click('export-download'); await settle();
  expect(downloaded!.name).toMatch(/^unqlock-settings-\d{4}-\d{2}-\d{2}\.json$/);
  expect(downloaded!.href).toMatch(/^data:application\/json;charset=utf-8,/);
  expect(JSON.parse(decodeURIComponent(downloaded!.href.split(',')[1])).settings).toEqual(exported.settings);
  expect(byId('export-status').textContent).toMatch(/Download started/);
  clipboardBlocked = true;
  click('export-copy'); await settle();
  expect(byId('export-output').hidden).toBe(false);
  expect(JSON.parse(byId<HTMLTextAreaElement>('export-output').value).settings).toEqual(exported.settings);
  expect(byId('export-status').dataset.state).toBe('error');

  // Invalid input is rejected before anything is written.
  const paste = (text: string) => { type('import-text', text); click('import-review'); };
  for (const [text, message] of [['', /Paste exported settings/], ['{', /not valid JSON/], ['{"a":1}', /not an Unqlock settings export/], ['{"unqlock":2,"settings":{}}', /newer version/], ['{"unqlock":1,"settings":{}}', /no settings/], ['{"unqlock":1,"settings":{"floating":[]}}', /floating value must be an object/]] as const) {
    paste(text);
    expect(importStatus()).toMatch(message);
    expect(byId('import-preview').hidden).toBe(true);
  }
  const duplicate = structuredClone(exported);
  duplicate.settings.environment.groups.push({ id:'copy', name:'Copy', domains:[{ hostname:'org-prod.unqork.io', environment:'qa' }] });
  paste(JSON.stringify(duplicate));
  expect(importStatus()).toMatch(/^Not imported\. Environments: Each hostname/);
  expect(store).toEqual(original);

  // Review lists every section; only the chosen ones are replaced.
  const incoming = structuredClone(exported);
  Object.assign(incoming.settings.appearance, { compact:false, icons:true, containerGuides:false });
  incoming.settings.rowLayout.enabled = false;
  incoming.settings.canvasToolbar = { search:'native', sort:'always' };
  incoming.settings.componentColors = { logic:{ dark:{ ink:'#7c3aed' } } };
  incoming.settings.builderPanels.agent = { visibility:'start', sizing:'native', width:null };
  incoming.settings.floating.position = 'bottom-right';
  incoming.settings.environment = { badge:false, blockProduction:false, autoDiscover:true, groups:[{ id:'team', name:'Team', domains:[{ hostname:'team.example.test', environment:'qa' }] }] };
  paste(JSON.stringify(incoming));
  expect(byId('import-preview').hidden).toBe(false);
  expect(byId('import-summary').textContent).toMatch(/^Unqlock 9\.9\.9 · exported .+\. Choose the settings to replace:$/);
  expect(boxes().map(box => box.name)).toEqual(['style', 'layout', 'panels', 'environments', 'launcher']);
  expect(boxes().every(box => box.checked)).toBe(true);
  expect(document.activeElement).toBe(boxes()[0]);
  // Escape dismisses the review first and keeps the page open.
  press('Escape');
  expect(byId('import-preview').hidden).toBe(true);
  expect(byId('transfer-page').hidden).toBe(false);
  expect(importStatus()).toMatch(/canceled/);
  expect(document.activeElement?.id).toBe('import-review');
  expect(store).toEqual(original);
  click('import-review');
  choose([]);
  click('import-apply');
  expect(importStatus()).toMatch(/at least one/);
  choose(['style', 'environments', 'launcher']);
  click('import-apply'); await settle();
  expect(importStatus()).toBe('Imported Component style, Environments, Floating launcher. Open Environments to enable automatic badges on custom domains.');
  expect(byId('import-preview').hidden).toBe(true);
  expect(document.activeElement?.id).toBe('import-review');
  const appearance = store.appearance as Record<string, boolean>;
  expect(appearance.icons).toBe(true);
  expect(appearance.compact).toBe(true);
  expect(appearance.containerGuides).toBe(true);
  expect((store.rowLayout as { enabled: boolean }).enabled).toBe(true);
  expect(store.canvasToolbar).toEqual(original.canvasToolbar);
  expect(store.componentColors).toEqual({ logic:{ dark:{ ink:'#7C3AED' } } });
  expect(query<HTMLInputElement>('[data-color="logic-dark-ink"]').value).toBe('#7c3aed');
  expect(store.builderPanels).toEqual(original.builderPanels);
  expect(store.panelWidth_explore).toBe(333);
  expect(store.floating).toEqual({ enabled:true, position:'bottom-right' });
  expect(store.environment).toEqual(incoming.settings.environment);
  expect(messages.filter(message => message.replace)).toHaveLength(1);
  expect(query<HTMLInputElement>('#layout-page [data-appearance="compact"]').checked).toBe(true);
  expect(query<HTMLInputElement>('[data-appearance="icons"]').checked).toBe(true);
  // The home strip follows the imported groups.
  expect(byId('environment-summary').textContent).toMatch(/PRODUCTION · org-prod\.unqork\.io/);

  // The rest, from a file. Firefox's toolbar popup picks files in a tab instead.
  const fileInput = byId<HTMLInputElement>('import-file');
  fileInput.click = () => { pickerOpened = true; };
  click('import-file-button'); await settle();
  if (apiName === 'browser') {
    expect(created!.url).toBe('https://extension.test/popup.html?page=transfer-page');
    expect(close).toHaveBeenCalled();
    expect(pickerOpened).toBe(false);
  } else expect(pickerOpened).toBe(true);
  const pick = (file: { name: string; size: number; text: () => Promise<string> }) => fireEvent.change(fileInput, { target:{ files:[file] } });
  pick({ name:'team.json', size:2048, text:async () => JSON.stringify(incoming) }); await settle();
  expect(byId('import-summary').textContent).toMatch(/· team\.json\. Choose/);
  choose(['layout', 'panels']);
  click('import-apply'); await settle();
  expect(importStatus()).toBe('Imported Canvas layout, Builder panels.');
  expect((store.appearance as Record<string, boolean>).compact).toBe(false);
  expect((store.appearance as Record<string, boolean>).containerGuides).toBe(false);
  expect((store.appearance as Record<string, boolean>).icons).toBe(true);
  expect((store.rowLayout as { enabled: boolean }).enabled).toBe(false);
  expect(store.canvasToolbar).toEqual({ search:'native', sort:'always' });
  expect(store.componentColors).toEqual({ logic:{ dark:{ ink:'#7C3AED' } } });
  expect(query<HTMLInputElement>('input[data-toolbar="sort"]:checked').value).toBe('always');
  expect((store.builderPanels as { agent: { visibility: string } }).agent.visibility).toBe('start');
  expect(store.panelWidth_explore).toBe(333);
  expect(messages.filter(message => message.replace)).toHaveLength(1);
  pick({ name:'huge.json', size:2 * 1024 * 1024, text:async () => '' }); await settle();
  expect(importStatus()).toMatch(/larger than 1 MB/);

  // A partial file only offers the sections it contains.
  paste('{"unqlock":1,"settings":{"environment":{"badge":true}}}');
  expect(boxes().map(box => box.name)).toEqual(['launcher']);
  click('import-apply'); await settle();
  expect(store.environment.badge).toBe(true);
  expect(store.environment.groups).toEqual(incoming.settings.environment.groups);
  expect(store.floating).toEqual({ enabled:true, position:'bottom-right' });
});
