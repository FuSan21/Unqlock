const assert = require('node:assert/strict');
const path = require('node:path');
const { builtScript, close, extensionId: readExtensionId, frames: nextFrames, installStorageDouble, launchChrome, launchFirefox, storage } = require('./browser.cjs');
const { buildSync } = require('esbuild');
// The Firefox branch injects the built content scripts, the MAIN-world bridge included, into the fixture page.
const source = name => builtScript('firefox', name);
const bundle = buildSync({ entryPoints:[path.join(__dirname, 'fixtures/canvas-search.jsx')], bundle:true, write:false, format:'iife', define:{ 'process.env.NODE_ENV':'"production"' } }).outputFiles[0].text;
const html = '<!doctype html><div id="root"></div><script>' + bundle.replace(/<\/script/gi, '<\\/script') + '</script>';
const fixtureUrl = 'https://search-fixture.unqork.io/ide/builder/workspaces/test/modules/first';
async function run(firefoxMode) {
  const context = firefoxMode ? await launchFirefox() : await launchChrome('search');
  try {
    const errors = [];
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await context.route('https://search-fixture.unqork.io/**', route => route.fulfill({ contentType:'text/html', body:html }));
    let popup;
    if (!firefoxMode) {
      popup = await context.newPage();
      await popup.goto(`chrome-extension://${await readExtensionId(popup)}/popup.html`);
    } else {
      await installStorageDouble(page);
    }
    const { set, storedWhen } = storage(popup || page);
    const frames = () => nextFrames(page);
    async function load(url = fixtureUrl) {
      await page.goto(url);
      await page.locator('#canvas [data-component-key]').first().waitFor();
      if (firefoxMode) {
        await page.addScriptTag({ content:source('canvas-search-bridge.js') });
        await page.addStyleTag({ content:source('canvas-toolbar.css') });
        await page.addScriptTag({ content:source('canvas-toolbar.js') });
      }
      await frames();
    }
    const input = page.locator('input[aria-label="Search configuration"]');
    const list = page.locator('[data-unqlock-search-list]');
    const selected = () => page.locator('#selected').textContent();
    const rendered = key => page.locator(`[data-component-key="${key}"]`).count();
    // Each option as its parts, joined, with whether it is the active one.
    const options = () => list.locator('[role="option"]').evaluateAll(items => items.map(item => [...item.children].map(part => part.textContent).join(' | ') + (item.getAttribute('aria-selected') === 'true' ? ' *' : '')));
    const listWhen = async expected => {
      const until = Date.now() + 5000;
      while (Date.now() < until) {
        if (JSON.stringify(await list.count() ? await options() : null) === JSON.stringify(expected)) return;
        await frames();
      }
      assert.deepEqual(await list.count() ? await options() : null, expected);
    };
    const owner = active => [
      'ownerName | Owner name | Text Field',
      'fgOwners | Owners group | in panelRequest | Field Group',
      'ownerAddress | Mailing address | in panelRequest | Hidden',
      'ownerPhone | Phone | in panelRequest | Phone Number',
      'calcOwner | Calculator'
    ].map((option, index) => index === active ? option + ' *' : option);

    // On by default: Unqork's matches in canvas order, those inside collapsed containers included, with the
    // container that hides them, Unqork's tray names for types, and Columns' and field groups' children.
    await load();
    await input.fill('owner');
    await listWhen(owner(-1));
    assert.equal(await list.locator('[data-part="heading"]').textContent(), '5 matches');
    assert.equal(await list.locator('[data-current]').getAttribute('data-key'), 'ownerName', "Unqork's current match is marked");
    assert.equal(await input.getAttribute('aria-controls'), 'unqlock-search-results');
    // The list sits under the field.
    const [field, box] = await Promise.all([page.locator('[data-slot="input-group"]').boundingBox(), list.boundingBox()]);
    assert(box.y >= field.y + field.height && Math.abs(box.x + box.width - (field.x + field.width)) <= 8, "The list is right-aligned under the field, kept 8 px inside the window");

    // The arrows choose a match; Enter opens both collapsed containers above it, scrolls to it and selects it.
    await input.press('ArrowDown');
    await input.press('ArrowDown');
    await input.press('ArrowDown');
    await listWhen(owner(2));
    assert.equal(await input.getAttribute('aria-activedescendant'), 'unqlock-search-results-2');
    assert.equal(await rendered('ownerAddress'), 0);
    await input.press('Enter');
    await page.waitForFunction(() => document.getElementById('selected').textContent === 'ownerAddress');
    assert.equal(await page.locator('[data-component-key="panelRequest"]').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('[data-component-key="fgOwners"]').getAttribute('aria-expanded'), 'true');
    assert(await page.locator('[data-component-key="ownerAddress"]').isVisible(), 'The match is scrolled into view');
    assert.equal(await list.count(), 0, 'Picking a match closes the list');
    assert.equal(await page.evaluate(() => window.unqorkEnters || 0), 0, 'Enter on a chosen match does not reach Unqork');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Search configuration');

    // ArrowDown brings the list back, now without the containers it opened, and a click picks a match.
    await input.press('ArrowDown');
    await listWhen(owner(-1).map(option => option.replace(' | in panelRequest', '')));
    await list.locator('[role="option"][data-key="calcOwner"]').click();
    await page.waitForFunction(() => document.getElementById('selected').textContent === 'calcOwner');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Search configuration', 'Clicking keeps focus in the field');

    // Enter without a chosen match stays Unqork's.
    await input.fill('notes');
    await listWhen(['notes | Notes | Text Area']);
    await input.press('Enter');
    assert.equal(await page.evaluate(() => window.unqorkEnters), 1);
    assert.equal(await selected(), 'calcOwner');

    // Escape closes the list first, keeping the text; the next Escape is Unqork's, which closes its search.
    await input.press('Escape');
    await listWhen(null);
    assert.equal(await input.inputValue(), 'notes');
    await input.press('Escape');
    await page.locator('button[aria-label="Search configuration"]').waitFor();

    // No match says so; an empty field or one without focus shows nothing.
    await page.locator('button[aria-label="Search configuration"]').click();
    await input.fill('zzz');
    await listWhen([]);
    assert.equal(await list.locator('[data-part="heading"]').textContent(), 'No components match');
    await input.fill('');
    await listWhen(null);
    await input.fill('owner');
    await listWhen(owner(-1).map(option => option.replace(' | in panelRequest', '')));
    await page.locator('#selected').click();
    await page.evaluate(() => document.activeElement.blur());
    await listWhen(null);

    // Turned off, the field is Unqork's alone.
    await set({ canvasToolbar:{ search:'native', sort:'native', results:'native' } });
    await input.focus();
    await input.fill('owners');
    for (let i = 0; i < 5; i++) await frames();
    assert.equal(await list.count(), 0);
    await input.press('ArrowDown');
    await frames();
    assert.equal(await list.count(), 0);

    // Outside the builder nothing runs.
    await set({ canvasToolbar:{ search:'native', sort:'native', results:'always' } });
    await load('https://search-fixture.unqork.io/ide/settings');
    await input.fill('owner');
    for (let i = 0; i < 5; i++) await frames();
    assert.equal(await list.count(), 0);

    if (popup) {
      await set({ canvasToolbar:{ search:'native', sort:'native' } });
      await load();
      await popup.reload();
      await popup.locator('#open-layout').click();
      await popup.locator('#layout-fields:not([disabled])').waitFor();
      assert(await popup.getByLabel('Search results: Dropdown', { exact:true }).isChecked(), 'On by default');
      await popup.getByLabel('Search results: Default', { exact:true }).check();
      await storedWhen(values => values.canvasToolbar?.results === 'native');
      await input.fill('owner');
      for (let i = 0; i < 5; i++) await frames();
      assert.equal(await list.count(), 0);
      await popup.getByRole('button', { name:'Reset layout', exact:true }).click();
      await storedWhen(values => values.canvasToolbar?.results === 'always');
      await input.fill('owne');
      await listWhen(owner(-1));
    }
    assert.deepEqual(errors, []);
    console.log('PASS: canvas search results in canvas order with collapsed matches, keyboard and click navigation through collapsed containers, Escape, Enter left to Unqork, no matches, off, scope and popup settings (' + (firefoxMode ? 'Firefox' : 'Chrome extension') + ').');
  } finally { await close(context); }
}
run(process.argv.includes('--firefox')).catch(error => { console.error(error); process.exitCode = 1; });
