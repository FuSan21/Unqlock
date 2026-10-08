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
    // How many elements matching the selector are added or removed over ten frames after an unrelated change.
    const replaced = selector => page.evaluate(selector => new Promise(resolve => {
      let count = 0;
      const observer = new MutationObserver(list => {
        for (const record of list) for (const node of [...record.addedNodes, ...record.removedNodes]) if (node.nodeType === 1 && node.matches(selector)) count++;
      });
      observer.observe(document.body, { childList:true, subtree:true });
      // A change elsewhere on the page makes the script look again.
      document.getElementById('heading').append('');
      let frames = 10;
      const tick = () => --frames ? requestAnimationFrame(tick) : (observer.disconnect(), resolve(count));
      requestAnimationFrame(tick);
    }), selector);
    // Each tab's full name as Multi-line shows it, or null where Unqork's own label is showing.
    const fullNames = () => page.$$eval('nav[data-testid="navigation-tabs"] [data-sortable-tab] a', links => links.map(link => {
      const full = link.querySelector(':scope > [data-unqlock-tab-name]');
      const native = link.querySelector(':scope > [data-slot="tooltip-trigger"]');
      return full && getComputedStyle(native).display === 'none' && full.previousElementSibling === native ? full.textContent : null;
    }));
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
    assert.equal(await replaced('[data-unqlock-module-title]'), 0, 'The title is not replaced while nothing changed');    await page.evaluate(() => { const toolbar = document.getElementById('toolbar'); toolbar.innerHTML = toolbar.innerHTML.replace(/<div data-unqlock-module-title[\s\S]*?<\/div>/, ''); });
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

    // Multi-line keeps every tab, shows each full name in place of Unqork's shortened label, and
    // leaves the names alone while nothing changes.
    const long = 'a-module-name-long-enough-to-shorten';
    await set({ navigationTabs:'wrapped' });
    await page.evaluate(route => window.go(route), modulePath(long));
    await page.waitForFunction(() => document.querySelectorAll('[data-unqlock-tab-name]').length === 3, null, { timeout:5000 });
    assert.deepEqual(await fullNames(), ['sixth', 'seventh', long]);
    assert.equal(await page.locator(`[data-sortable-tab="${modulePath(long)}"] [data-slot="tooltip-trigger"]`).textContent(), 'a-module-…-shorten');
    assert(await nav.isVisible());
    assert.equal(await replaced('[data-unqlock-tab-name]'), 0, 'Full names are not replaced while nothing changed');
    assert.equal(await title(), null, 'Multi-line adds no toolbar title');
    // The active tab's fixed-height shape gives way to one drawn in CSS at any height.
    const shapeDisplay = () => page.locator('a[data-active] > svg:not(.lucide)').evaluate(svg => getComputedStyle(svg).display);
    assert.equal(await shapeDisplay(), 'none');
    assert.equal(await page.locator('a[data-active]').evaluate(link => getComputedStyle(link, '::before').borderTopLeftRadius), '12px');
    assert.deepEqual(await savedTabs(), [modulePath('sixth'), modulePath('seventh'), modulePath(long)]);
    await set({ navigationTabs:'native' });
    await page.waitForFunction(() => !document.querySelector('[data-unqlock-tab-name]'), null, { timeout:5000 });
    assert.deepEqual(await fullNames(), [null, null, null]);
    assert.notEqual(await shapeDisplay(), 'none');

    // Collapsed keeps every tab but puts the bar out of sight, as Hidden does with the toolbar title,
    // until the header is hovered; the bar then stays while the pointer is on it.
    const collapsedAttribute = () => page.evaluate(() => document.documentElement.hasAttribute('data-unqlock-navigation-tabs-collapsed'));
    await page.mouse.move(400, 600);
    await set({ navigationTabsCollapsed:true });
    await nav.waitFor({ state:'hidden' });
    await titleWhen('app / ' + long);
    assert.equal(await title(), 'app / <svg> ' + long, 'The title shows the full name');
    await page.hover('header');
    await nav.waitFor({ state:'visible' });
    await nav.hover();
    await page.waitForTimeout(600);
    assert(await nav.isVisible(), 'The bar stays open under the pointer');
    await page.mouse.move(400, 600);
    await nav.waitFor({ state:'hidden' });
    assert.deepEqual(await savedTabs(), [modulePath('sixth'), modulePath('seventh'), modulePath(long)]);

    // Multi-line shows its full names when the collapsed bar opens.
    await set({ navigationTabs:'wrapped' });
    await page.waitForFunction(() => document.querySelectorAll('[data-unqlock-tab-name]').length === 3, null, { timeout:5000 });
    assert(await collapsedAttribute());
    await page.hover('header');
    await nav.waitFor({ state:'visible' });
    assert.deepEqual(await fullNames(), ['sixth', 'seventh', long]);
    // Every pill and tab fills the bar's height, so shorter ones stay centered beside the wrapped name.
    const heights = await nav.evaluate(nav => [...nav.querySelectorAll('[data-tab-group]')].map(group => [group, ...group.querySelectorAll('[data-tab-group-pill], [data-sortable-tab] a')]
      .map(element => Math.round(element.getBoundingClientRect().height))));
    assert(heights.every(([group, ...inside]) => inside.every(height => height === group)), 'Pills and tabs fill the collapsed bar: ' + JSON.stringify(heights));
    await page.mouse.move(400, 600);
    await nav.waitFor({ state:'hidden' });

    // Hidden has no bar to collapse, and the preference returns with Default.
    await set({ navigationTabs:'hidden' });
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-unqlock-navigation-tabs-collapsed'), null, { timeout:5000 });
    await savedWhen([modulePath(long)]);
    await set({ navigationTabs:'native' });
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-unqlock-navigation-tabs-collapsed'), null, { timeout:5000 });
    await titleWhen('app / ' + long);
    await set({ navigationTabsCollapsed:false });
    await nav.waitFor({ state:'visible' });
    await titleWhen(null);
    assert(!await collapsedAttribute());
    await page.evaluate(route => window.go(route), modulePath('seventh'));    // Outside /ide/ nothing runs.
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
    console.log('PASS: navigation tab bar hiding, the toolbar title, Multi-line full names, collapsed until header hover, single-tab pruning through collapsed groups, reload, loop guard, Default, scope and popup settings (' + (firefoxMode ? 'Firefox' : 'Chrome extension') + ').');
  } finally {
    if (context.closeBrowser) await context.closeBrowser();
    else await context.close();
  }
}
run(process.argv.includes('--firefox')).catch(error => { console.error(error); process.exitCode = 1; });
