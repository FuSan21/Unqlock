const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, firefox } = require('playwright');
// The Firefox branch injects the built content script into the fixture page.
const source = name => fs.readFileSync(path.resolve(__dirname, '../dist/firefox/content-scripts', name), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'fixtures/navigation-tabs.html'), 'utf8');
const origin = 'https://tabs-fixture.unqork.io';
const modulePath = name => '/builder/workspaces/test/modules/' + name;
async function run(firefoxMode) {
  let context;
  if (firefoxMode) {
    const browser = await firefox.launch({ headless:true });
    context = await browser.newContext();
    context.closeBrowser = () => browser.close();
  } else {
    context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'unqlock-tabs-')), {
      ...(process.env.CHROME_PATH ? { executablePath:process.env.CHROME_PATH } : { channel:'chromium' }), headless:true,
      args:['--disable-extensions-except=' + path.resolve(__dirname, '../dist/chrome'), '--load-extension=' + path.resolve(__dirname, '../dist/chrome')]
    });
  }
  try {
    const errors = [];
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await context.route(origin + '/**', route => route.fulfill({ contentType:'text/html', body:html }));
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
    async function load(route = modulePath('first')) {
      await page.goto(origin + '/ide' + route);
      await page.locator('nav[data-testid="navigation-tabs"] [data-sortable-tab]').first().waitFor({ state:'attached' });
      if (firefoxMode) {
        await page.addStyleTag({ content:source('navigation-tabs.css') });
        await page.addScriptTag({ content:source('navigation-tabs.js') });
      }
      await frames();
    }
    // Unqork's saved workspace tabs, as the fixture persists them.
    const savedTabs = () => page.evaluate(() => JSON.parse(localStorage.getItem('ide-workspace-store') || '{"tabs":[]}').tabs.map(tab => tab.route));
    const savedWhen = async expected => {
      await page.waitForFunction(expected => JSON.stringify(JSON.parse(localStorage.getItem('ide-workspace-store') || '{"tabs":[]}').tabs.map(tab => tab.route)) === JSON.stringify(expected), expected, { timeout:5000 })
        .catch(async () => assert.deepEqual(await savedTabs(), expected));
    };
    const nav = page.locator('nav[data-testid="navigation-tabs"]');
    const clicks = () => page.evaluate(() => window.closeClicks);
    // The title in the toolbar row, part by part with the icon as <svg>, or null when it is absent or misplaced.
    const title = () => page.evaluate(() => {
      const element = document.querySelector('[data-unqlock-module-title]');
      if (!element) return null;
      if (!element.previousElementSibling?.matches('.flex-1') || !element.nextElementSibling?.matches('.flex-1')) return 'misplaced';
      return [...element.children].map(part => part.textContent || '<' + part.localName + '>').join(' ');
    });
    const titleWhen = expected => page.waitForFunction(expected => {
      const element = document.querySelector('[data-unqlock-module-title]');
      return expected === null ? !element : element?.previousElementSibling?.matches('.flex-1') && element.title === expected;
    }, expected, { timeout:5000 }).catch(async () => assert.equal(await title(), expected));

    // Default leaves the bar and every tab alone.
    await load();
    await page.evaluate(() => localStorage.removeItem('ide-workspace-store'));
    await load();
    await frames(); await frames();
    assert(await nav.isVisible());
    assert.deepEqual(await savedTabs(), [modulePath('first'), modulePath('second'), modulePath('third')]);
    assert.equal(await clicks(), 0);
    assert.equal(await title(), null, 'Default adds no title');

    // Hidden removes the bar and closes every other tab, opening a collapsed group to reach its tabs.
    await set({ navigationTabs:'hidden' });
    await nav.waitFor({ state:'hidden' });
    await savedWhen([modulePath('first')]);
    assert.equal(await clicks(), 2);
    assert.equal(await page.locator('#heading').textContent(), modulePath('first'), 'The current page stays open');

    // The toolbar row names the application and module between its spacers, and returns after a remount.
    await titleWhen('app / First');
    assert.equal(await title(), 'app / <svg> First');
    // Once shown, the title stays put rather than being replaced on every pass.
    const replaced = await page.evaluate(() => new Promise(resolve => {
      let count = 0;
      const observer = new MutationObserver(list => {
        for (const record of list) for (const node of [...record.addedNodes, ...record.removedNodes]) if (node.nodeType === 1 && node.matches('[data-unqlock-module-title]')) count++;
      });
      observer.observe(document.body, { childList:true, subtree:true });
      // A change elsewhere on the page makes the script look again.
      document.getElementById('heading').append('');
      let frames = 10;
      const tick = () => --frames ? requestAnimationFrame(tick) : (observer.disconnect(), resolve(count));
      requestAnimationFrame(tick);
    }));
    assert.equal(replaced, 0, 'The title is not replaced while nothing changed');
    await page.evaluate(() => { const toolbar = document.getElementById('toolbar'); toolbar.innerHTML = toolbar.innerHTML.replace(/<div data-unqlock-module-title[\s\S]*?<\/div>/, ''); });
    await titleWhen('app / First');

    // Opening another module keeps only its tab.
    await page.evaluate(route => window.go(route), modulePath('fourth'));
    await savedWhen([modulePath('fourth')]);
    await titleWhen('app / fourth');

    // Tabs Unqork restores on reload are closed on the first pass.
    await page.evaluate(() => localStorage.setItem('ide-workspace-store', JSON.stringify({ tabs:[
      { route:'/builder/workspaces/test/modules/first', label:'First', group:'app' },
      { route:'/builder/workspaces/test/modules/fourth', label:'Fourth', group:'other' }
    ], collapsed:['other'] })));
    await load(modulePath('first'));
    assert(await nav.isHidden());
    await savedWhen([modulePath('first')]);

    // A close button that does nothing is tried a few times, then left alone until the next route.
    await page.evaluate(() => { window.brokenClose = true; window.closeClicks = 0; });
    await page.evaluate(route => window.go(route), modulePath('fifth'));
    for (let i = 0; i < 10; i++) await frames();
    assert.equal(await clicks(), 3, 'Stops after three tries');
    assert.deepEqual(await savedTabs(), [modulePath('first'), modulePath('fifth')]);
    await page.evaluate(() => { window.brokenClose = false; });
    await page.evaluate(route => window.go(route), modulePath('sixth'));
    await savedWhen([modulePath('sixth')]);

    // Default shows the bar again and stops closing tabs.
    await set({ navigationTabs:'native' });
    await nav.waitFor({ state:'visible' });
    await titleWhen(null);
    await page.evaluate(route => window.go(route), modulePath('seventh'));
    for (let i = 0; i < 5; i++) await frames();
    assert.deepEqual(await savedTabs(), [modulePath('sixth'), modulePath('seventh')]);

    // Outside /ide/ nothing runs.
    await set({ navigationTabs:'hidden' });
    await page.goto(origin + '/login');
    await frames(); await frames();
    assert(await nav.isVisible());
    assert.equal(await title(), null);

    if (popup) {
      await set({ navigationTabs:'native' });
      await load(modulePath('seventh'));
      await popup.reload();
      await popup.locator('#open-panels').click();
      await popup.locator('#panels-fields:not([disabled])').waitFor();
      assert(await popup.getByLabel('Navigation tabs: Default', { exact:true }).isChecked());
      await popup.getByLabel('Navigation tabs: Hidden', { exact:true }).check();
      await storedWhen(values => values.navigationTabs === 'hidden');
      await nav.waitFor({ state:'hidden' });
      await savedWhen([modulePath('seventh')]);
      await popup.reload();
      await popup.locator('#open-panels').click();
      await popup.locator('#panels-fields:not([disabled])').waitFor();
      assert(await popup.getByLabel('Navigation tabs: Hidden', { exact:true }).isChecked());
      await popup.locator('#panels-reset').click();
      await storedWhen(values => values.navigationTabs === 'native');
      await nav.waitFor({ state:'visible' });
    }
    assert.deepEqual(errors, []);
    console.log('PASS: navigation tab bar hiding, the toolbar title, single-tab pruning through collapsed groups, reload, loop guard, Default, scope and popup settings (' + (firefoxMode ? 'Firefox' : 'Chrome extension') + ').');
  } finally {
    if (context.closeBrowser) await context.closeBrowser();
    else await context.close();
  }
}
run(process.argv.includes('--firefox')).catch(error => { console.error(error); process.exitCode = 1; });
