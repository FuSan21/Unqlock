const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
const scripts = ['environment.js', 'panel-settings.js', 'row-layout.js', 'toolbar-settings.js', 'component-colors.js', 'disabled-controls.js', 'quick-actions.js', 'popup.js', 'quick-popup.js', 'environment-popup.js', 'launcher-popup.js', 'panels-popup.js', 'settings-transfer.js', 'transfer-popup.js'];
(async () => {
  for (const apiName of ['chrome', 'browser']) {
    const popup = new JSDOM(source('popup.html'), { url:'https://extension.test/popup.html', runScripts:'outside-only' });
    const page = popup.window;
    const document = page.document;
    const original = {
      appearance:{ enabled:true, compact:true, icons:false, containerGuides:true },
      rowLayout:{ enabled:true, icon:'left', name:'left', type:'middle', chip:'right', actions:'right' },
      canvasToolbar:{ search:'always' },
      componentColors:{ grids:{ light:{ ink:'#0EA5E9' }, dark:{ tint:'#0c4a6e', ink:7 } }, inputs:{ light:{ ink:'not a color' } } },
      builderPanels:{ agent:{ visibility:'always', sizing:'custom', width:420 } },
      panelWidth_explore:333,
      floating:{ enabled:true, position:'top-right' },
      environment:{ badge:true, blockProduction:true, autoDiscover:false, groups:[{ id:'org', name:'Org', domains:[{ hostname:'org-prod.unqork.io', environment:'production' }] }] }
    };
    let store = structuredClone(original);
    let messages = [];
    let clipboard;
    let clipboardBlocked = false;
    let downloaded;
    let created;
    let pickerOpened = false;
    let closed = false;
    page.matchMedia = () => ({ matches:false, addEventListener:() => {} });
    const closeWindow = page.close.bind(page);
    page.close = () => { closed = true; };
    Object.defineProperty(page.navigator, 'clipboard', { value:{ writeText:async text => { if (clipboardBlocked) throw new Error('Blocked'); clipboard = text; } } });
    page.HTMLAnchorElement.prototype.click = function () { downloaded = { href:this.href, name:this.download }; };
    page[apiName] = {
      storage:{
        local:{
          get:async keys => structuredClone(Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in store).map(key => [key, store[key]]))),
          set:async value => { Object.assign(store, structuredClone(value)); }
        },
        onChanged:{ addListener:() => {} }
      },
      tabs:{
        query:async () => [{ id:7, url:'https://org-prod.unqork.io/app' }],
        sendMessage:async () => ({}),
        create:async options => { created = options; }
      },
      runtime:{
        ...(apiName === 'browser' ? { getBrowserInfo:async () => ({ name:'Firefox' }) } : {}),
        getManifest:() => ({ version:'9.9.9' }),
        getURL:file => 'https://extension.test/' + file,
        sendMessage:async message => {
          messages.push(message);
          let config = page.UnqlockEnvironment.settings(store.environment);
          if (message.type === 'environment.save' && message.replace) { config = page.UnqlockEnvironment.settings(message.replace); store.environment = structuredClone(config); }
          return { ok:true, config, missingOrigins:page.UnqlockEnvironment.customOrigins(config) };
        }
      },
      permissions:{ request:async () => false },
      scripting:{ executeScript:async () => [{ result:{ ok:true } }] }
    };
    page.eval(scripts.map(source).join('\n'));
    try {
      await settle();
      const byId = id => document.getElementById(id);
      const click = id => byId(id).click();
      const importStatus = () => byId('import-status').textContent;
      click('open-transfer'); await settle();
      assert.equal(byId('transfer-page').hidden, false);
      assert.equal(document.activeElement, byId('transfer-title'));

      // Copy and download export the same normalized settings.
      click('export-copy'); await settle();
      assert.match(byId('export-status').textContent, /copied/);
      assert.equal(byId('export-output').hidden, true);
      const exported = JSON.parse(clipboard);
      assert.equal(exported.unqlock, 1);
      assert.equal(exported.extensionVersion, '9.9.9');
      assert.equal(exported.settings.appearance.compact, true);
      assert.equal(exported.settings.appearance.tray, true, 'Unset appearance keys export their defaults');
      assert.equal(exported.settings.rowLayout.type, 'middle');
      assert.deepEqual(exported.settings.canvasToolbar, { search:'always', sort:'native' });
      assert.deepEqual(exported.settings.componentColors, { grids:{ light:{ ink:'#0EA5E9' }, dark:{ tint:'#0C4A6E' } } }, 'Only valid picked colors export');
      assert.equal(exported.settings.builderPanels.agent.visibility, 'always');
      assert.equal(exported.settings.builderPanels.tray.visibility, 'native');
      assert.deepEqual(exported.settings.panelWidths, { agent:null, explore:333, properties:null, tray:null });
      assert.deepEqual(exported.settings.floating, { enabled:true, position:'top-right' });
      assert.deepEqual(exported.settings.environment, original.environment);
      click('export-download'); await settle();
      assert.match(downloaded.name, /^unqlock-settings-\d{4}-\d{2}-\d{2}\.json$/);
      assert.match(downloaded.href, /^data:application\/json;charset=utf-8,/);
      assert.deepEqual(JSON.parse(decodeURIComponent(downloaded.href.split(',')[1])).settings, exported.settings);
      assert.match(byId('export-status').textContent, /Download started/);
      clipboardBlocked = true;
      click('export-copy'); await settle();
      assert.equal(byId('export-output').hidden, false, 'Blocked clipboard shows the JSON to copy by hand');
      assert.deepEqual(JSON.parse(byId('export-output').value).settings, exported.settings);
      assert.equal(byId('export-status').dataset.state, 'error');

      // Invalid input is rejected before anything is written.
      const paste = text => { byId('import-text').value = text; click('import-review'); };
      for (const [text, message] of [['', /Paste exported settings/], ['{', /not valid JSON/], ['{"a":1}', /not an Unqlock settings export/], ['{"unqlock":2,"settings":{}}', /newer version/], ['{"unqlock":1,"settings":{}}', /no settings/], ['{"unqlock":1,"settings":{"floating":[]}}', /floating value must be an object/]]) {
        paste(text);
        assert.match(importStatus(), message, text);
        assert.equal(byId('import-preview').hidden, true);
      }
      const duplicate = structuredClone(exported);
      duplicate.settings.environment.groups.push({ id:'copy', name:'Copy', domains:[{ hostname:'org-prod.unqork.io', environment:'qa' }] });
      paste(JSON.stringify(duplicate));
      assert.match(importStatus(), /^Not imported\. Environments: Each hostname/);
      assert.deepEqual(store, original);

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
      assert.equal(byId('import-preview').hidden, false);
      assert.match(byId('import-summary').textContent, /^Unqlock 9\.9\.9 · exported .+\. Choose the settings to replace:$/);
      const boxes = [...document.querySelectorAll('#import-sections input')];
      assert.deepEqual(boxes.map(box => box.name), ['style', 'layout', 'panels', 'environments', 'launcher']);
      assert(boxes.every(box => box.checked));
      assert.equal(document.activeElement, boxes[0]);
      // Escape dismisses the review first and keeps the page open.
      document.dispatchEvent(new page.KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
      assert.equal(byId('import-preview').hidden, true);
      assert.equal(byId('transfer-page').hidden, false);
      assert.match(importStatus(), /canceled/);
      assert.deepEqual(store, original);
      click('import-review');
      for (const box of document.querySelectorAll('#import-sections input')) box.checked = false;
      click('import-apply');
      assert.match(importStatus(), /at least one/);
      for (const box of document.querySelectorAll('#import-sections input')) box.checked = !['layout', 'panels'].includes(box.name);
      click('import-apply'); await settle();
      assert.match(importStatus(), /^Imported Component style, Environments, Floating launcher\. Open Environments to enable automatic badges on custom domains\.$/);
      assert.equal(byId('import-preview').hidden, true);
      assert.equal(store.appearance.icons, true, 'Style keys are imported');
      assert.equal(store.appearance.compact, true, 'Layout keys are kept');
      assert.equal(store.appearance.containerGuides, true);
      assert.equal(store.rowLayout.enabled, true);
      assert.deepEqual(store.canvasToolbar, original.canvasToolbar);
      assert.deepEqual(store.componentColors, { logic:{ dark:{ ink:'#7C3AED' } } }, 'A style import replaces the picked colors');
      assert.equal(document.querySelector('[data-color="logic-dark-ink"]').value, '#7c3aed', 'Open color pickers show imported values');
      assert.deepEqual(store.builderPanels, original.builderPanels);
      assert.equal(store.panelWidth_explore, 333);
      assert.deepEqual(store.floating, { enabled:true, position:'bottom-right' });
      assert.deepEqual(store.environment, incoming.settings.environment);
      assert.equal(messages.filter(message => message.replace).length, 1, 'Environments are replaced through the background');
      assert.equal(document.querySelector('#layout-page [data-appearance="compact"]').checked, true);
      assert.equal(document.querySelector('[data-appearance="icons"]').checked, true, 'Open controls show imported values');

      // The rest, from a file.
      const fileInput = byId('import-file');
      fileInput.click = () => { pickerOpened = true; };
      click('import-file-button'); await settle();
      if (apiName === 'browser') {
        assert.equal(created.url, 'https://extension.test/popup.html?page=transfer-page', 'Firefox picks files in a tab');
        assert.equal(closed, true);
        assert.equal(pickerOpened, false);
      } else assert.equal(pickerOpened, true);
      Object.defineProperty(fileInput, 'files', { configurable:true, value:[{ name:'team.json', size:2048, text:async () => JSON.stringify(incoming) }] });
      fileInput.dispatchEvent(new page.Event('change'));
      await settle();
      assert.match(byId('import-summary').textContent, /· team\.json\. Choose/);
      for (const box of document.querySelectorAll('#import-sections input')) box.checked = ['layout', 'panels'].includes(box.name);
      click('import-apply'); await settle();
      assert.match(importStatus(), /^Imported Canvas layout, Builder panels\.$/);
      assert.equal(store.appearance.compact, false);
      assert.equal(store.appearance.containerGuides, false);
      assert.equal(store.appearance.icons, true);
      assert.equal(store.rowLayout.enabled, false);
      assert.deepEqual(store.canvasToolbar, { search:'native', sort:'always' });
      assert.deepEqual(store.componentColors, { logic:{ dark:{ ink:'#7C3AED' } } }, 'A layout import leaves colors alone');
      assert.equal(document.querySelector('select[data-toolbar="sort"]').value, 'always', 'Open toolbar controls show imported values');
      assert.equal(store.builderPanels.agent.visibility, 'start');
      assert.equal(store.panelWidth_explore, 333);
      assert.equal(messages.filter(message => message.replace).length, 1);
      Object.defineProperty(fileInput, 'files', { configurable:true, value:[{ name:'huge.json', size:2 * 1024 * 1024, text:async () => '' }] });
      fileInput.dispatchEvent(new page.Event('change'));
      await settle();
      assert.match(importStatus(), /larger than 1 MB/);

      // A partial file only offers the sections it contains.
      paste('{"unqlock":1,"settings":{"environment":{"badge":true}}}');
      assert.deepEqual([...document.querySelectorAll('#import-sections input')].map(box => box.name), ['launcher']);
      click('import-apply'); await settle();
      assert.equal(store.environment.badge, true);
      assert.deepEqual(store.environment.groups, incoming.settings.environment.groups, 'The label alone keeps the groups');
      assert.deepEqual(store.floating, { enabled:true, position:'bottom-right' });
    } finally { closeWindow(); }
  }
  console.log('PASS: settings export by copy and download, clipboard fallback, import by paste and file with per-section review, validation, Escape and Firefox file picking in both API branches.');
})().catch(error => { console.error(error); process.exitCode = 1; });
