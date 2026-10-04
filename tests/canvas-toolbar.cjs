const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, firefox } = require('playwright');
const { buildSync } = require('esbuild');
// The Firefox branch injects the built content scripts into the fixture page.
const source = name => fs.readFileSync(path.resolve(__dirname, '../dist/firefox/content-scripts', name), 'utf8');
const bundle = buildSync({ entryPoints:[path.join(__dirname, 'fixtures/canvas-toolbar.jsx')], bundle:true, write:false, format:'iife', define:{ 'process.env.NODE_ENV':'"production"' } }).outputFiles[0].text;
const html = '<!doctype html><div id="root"></div><script>' + bundle.replace(/<\/script/gi, '<\\/script') + '</script>';
const fixtureUrl = 'https://toolbar-fixture.unqork.io/ide/builder/workspaces/test/modules/first';
async function run(firefoxMode) {
  let context;
  if (firefoxMode) {
    const browser = await firefox.launch({ headless:true });
    context = await browser.newContext();
    context.closeBrowser = () => browser.close();
  } else {
    context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'unqlock-toolbar-')), {
      ...(process.env.CHROME_PATH ? { executablePath:process.env.CHROME_PATH } : { channel:'chromium' }), headless:true,
      args:['--disable-extensions-except=' + path.resolve(__dirname, '../dist/chrome'), '--load-extension=' + path.resolve(__dirname, '../dist/chrome')]
    });
  }
  try {
    const errors = [];
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await context.route('https://toolbar-fixture.unqork.io/**', route => route.fulfill({ contentType:'text/html', body:html }));
    let popup;
    if (!firefoxMode) {
      popup = await context.newPage();
      await popup.goto('chrome://extensions');
      const extensionId = await popup.evaluate(() => new Promise(resolve => chrome.developerPrivate.getExtensionsInfo({}, list => resolve(list.find(e => e.name === 'Unqlock').id))));
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    } else {
      await page.addInitScript(() => {
        const callbacks = [];
        window.browser = { runtime:{ id:'fixture', onMessage:{ addListener() {} } }, storage:{
          local:{ get:async () => JSON.parse(localStorage.getItem('fixture') || '{}'), set:async updates => {
            const data = JSON.parse(localStorage.getItem('fixture') || '{}'); const changes = {};
            for (const [key, value] of Object.entries(updates)) { changes[key] = { oldValue:data[key], newValue:value }; data[key] = value; }
            localStorage.setItem('fixture', JSON.stringify(data)); callbacks.forEach(fn => fn(changes, 'local'));
          } }, onChanged:{ addListener:fn => callbacks.push(fn) }
        } };
      });
    }
    const set = values => (popup || page).evaluate(values => (window.chrome?.storage || window.browser.storage).local.set(values), values);
    const get = () => (popup || page).evaluate(() => (window.chrome?.storage || window.browser.storage).local.get(null));
    async function storedWhen(predicate) {
      const until = Date.now() + 7000;
      while (Date.now() < until) {
        const values = await get();
        if (predicate(values)) return values;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('Storage did not reach the expected state: ' + JSON.stringify(await get()));
    }
    const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    async function load(url = fixtureUrl) {
      await page.goto(url);
      await page.getByRole('button', { name:'Undo', exact:true }).waitFor();
      if (firefoxMode) {
        await page.addScriptTag({ content:source('canvas-toolbar-bridge.js') });
        await page.addStyleTag({ content:source('content.css') });
        await page.addScriptTag({ content:source('canvas-toolbar.js') });
      }
      await frames();
    }
    const searchButton = page.locator('button[aria-label="Search configuration"]');
    const searchInput = page.locator('input[aria-label="Search configuration"]');
    const trigger = page.locator('button[aria-label="Sort components"]');
    const switches = page.getByRole('radiogroup', { name:'Sort components' });
    const radio = name => switches.getByRole('radio', { name, exact:true });
    const focused = () => page.evaluate(() => document.activeElement?.id || document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName);
    const heading = () => page.locator('#heading').textContent();
    const checked = () => switches.locator('[aria-checked="true"]').textContent();

    // Unqork's default leaves both controls alone.
    await load();
    await frames();
    assert(await searchButton.isVisible());
    assert(await trigger.isVisible());
    assert.equal(await switches.count(), 0);

    // Search: opens without taking focus, and Escape or Close search only clear it.
    await page.locator('#editor').fill('abc');
    await set({ canvasToolbar:{ search:'always', sort:'native' } });
    await searchInput.waitFor();
    await frames();
    assert.equal(await focused(), 'editor', 'Opening the search must not take focus');
    assert.equal(await page.locator('#editor').inputValue(), 'abc');
    // The field stays mounted: Escape and Close search clear it instead of closing it.
    await page.evaluate(() => { window.searchField = document.querySelector('input[aria-label="Search configuration"]'); });
    const sameField = () => page.evaluate(() => window.searchField === document.querySelector('input[aria-label="Search configuration"]'));
    await searchInput.fill('pan');
    await searchInput.press('Escape');
    await page.waitForFunction(() => document.querySelector('input[aria-label="Search configuration"]')?.value === '');
    await frames();
    assert(await sameField(), 'Escape clears without closing');
    assert.equal(await focused(), 'Search configuration', 'Escape keeps the caret in the field');
    await searchInput.press('Escape');
    await frames();
    assert(await sameField());
    assert.notEqual(await focused(), 'Search configuration', 'Escape on an empty field leaves it');
    await searchInput.fill('field');
    await page.getByRole('button', { name:'Close search', exact:true }).click();
    await page.waitForFunction(() => document.querySelector('input[aria-label="Search configuration"]')?.value === '');
    await frames();
    assert(await sameField(), 'Close search clears without closing');
    assert.equal(await focused(), 'Search configuration');
    // Unqork's own state is cleared, not just the visible text.
    assert.equal(await page.locator('[data-slot="input-group"]').getAttribute('data-query'), '');
    assert.equal(await searchButton.count(), 0);
    await page.locator('#editor').click();
    await frames();
    assert.equal(await focused(), 'editor');
    assert(await searchInput.isVisible());

    // Sort: switches replace the dropdown and follow Unqork's value through the memoized trigger.
    await set({ canvasToolbar:{ search:'always', sort:'always' } });
    await switches.waitFor();
    assert(await trigger.isHidden(), 'The native dropdown is hidden while switches show');
    assert.deepEqual(await switches.getByRole('radio').allTextContents(), ['Default', 'By Type', 'Alphabetical']);
    assert.equal(await checked(), 'Default');
    for (const [name, title] of [['By Type', 'Grouped by Type'], ['Alphabetical', 'All Components'], ['Default', 'Default'], ['Alphabetical', 'All Components']]) {
      await radio(name).click();
      await page.waitForFunction(title => document.getElementById('heading').textContent === title, title);
      await page.waitForFunction(name => document.querySelector('[data-unqlock-sort] [aria-checked="true"]')?.textContent === name, name);
    }
    assert.deepEqual(await switches.getByRole('radio').evaluateAll(buttons => buttons.map(button => button.tabIndex)), [-1, -1, 0]);
    await radio('Alphabetical').focus();
    for (const [key, name] of [['ArrowRight', 'Default'], ['ArrowRight', 'By Type'], ['ArrowLeft', 'Default'], ['End', 'Alphabetical'], ['Home', 'Default']]) {
      await page.keyboard.press(key);
      await page.waitForFunction(name => document.querySelector('[data-unqlock-sort] [aria-checked="true"]')?.textContent === name, name);
      assert.equal(await focused(), 'BUTTON');
      assert.equal(await page.evaluate(() => document.activeElement.textContent), name);
    }
    assert.equal(await heading(), 'Default');

    // A remounted toolbar gets both behaviors back, without moving focus.
    await page.locator('#remount').click();
    await switches.waitFor();
    await searchInput.waitFor();
    await frames();
    assert.equal(await focused(), 'remount');
    assert(await trigger.isHidden());

    // An unrecognized sort control keeps Unqork's dropdown.
    await page.locator('#unrecognized').click();
    await frames(); await frames();
    assert.equal(await switches.count(), 0);
    assert(await trigger.isVisible());
    await page.locator('#unrecognized').click();
    await switches.waitFor();
    assert(await trigger.isHidden());

    // Back to Unqork's default: the dropdown returns and the search closes normally.
    await set({ canvasToolbar:{ search:'native', sort:'native' } });
    await trigger.waitFor();
    await frames();
    assert.equal(await switches.count(), 0);
    await page.getByRole('button', { name:'Close search', exact:true }).click();
    await searchButton.waitFor();
    await page.waitForTimeout(200);
    assert.equal(await searchInput.count(), 0);

    // Outside the builder nothing changes.
    await set({ canvasToolbar:{ search:'always', sort:'always' } });
    await load('https://toolbar-fixture.unqork.io/ide/settings');
    await frames(); await frames();
    assert(await searchButton.isVisible());
    assert(await trigger.isVisible());
    assert.equal(await switches.count(), 0);

    if (popup) {
      await set({ canvasToolbar:{ search:'native', sort:'native' } });
      await popup.reload();
      await popup.locator('#open-layout').click();
      await popup.locator('#layout-fields:not([disabled])').waitFor();
      await popup.getByLabel('Search bar: Always visible', { exact:true }).check();
      await storedWhen(values => values.canvasToolbar?.search === 'always' && values.canvasToolbar?.sort === 'native');
      await popup.getByLabel('Sort mode: Switches', { exact:true }).check();
      await storedWhen(values => values.canvasToolbar?.search === 'always' && values.canvasToolbar?.sort === 'always');
      await popup.reload();
      await popup.locator('#open-layout').click();
      await popup.locator('#layout-fields:not([disabled])').waitFor();
      assert(await popup.getByLabel('Sort mode: Switches', { exact:true }).isChecked());
      // Toolbar options do not depend on Component styling.
      await set({ appearance:{ enabled:false } });
      await popup.reload();
      await popup.locator('#open-layout').click();
      await popup.locator('#layout-fields:not([disabled])').waitFor();
      assert(await popup.locator('#row-preset').isDisabled(), 'Row layout needs Component styling');
      assert(await popup.getByLabel('Search bar: Always visible', { exact:true }).isEnabled());
      await popup.getByRole('button', { name:'Reset layout', exact:true }).click();
      await storedWhen(values => values.canvasToolbar?.search === 'native' && values.canvasToolbar?.sort === 'native');
      await popup.waitForFunction(() => document.querySelector('input[data-toolbar="search"][value="native"]').checked);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: canvas toolbar search focus, Escape and close, sort switches through a memoized trigger, keyboard, remount, unrecognized fallback, scope and popup settings (' + (firefoxMode ? 'Firefox' : 'Chrome extension') + ').');
  } finally {
    if (context.closeBrowser) await context.closeBrowser();
    else await context.close();
  }
}
run(process.argv.includes('--firefox')).catch(error => { console.error(error); process.exitCode = 1; });
