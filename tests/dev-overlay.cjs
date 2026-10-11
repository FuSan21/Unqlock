const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, firefox } = require('playwright');
// The Firefox branch injects the built content scripts into every fixture page, the popup included.
const source = name => fs.readFileSync(path.resolve(__dirname, '../dist/firefox/content-scripts', name), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'fixtures/dev-overlay.html'), 'utf8');
const origin = 'https://overlay-fixture.unqork.io';
const route = '/ide/builder/workspaces/test/modules/first';
async function run(firefoxMode) {
  let context;
  if (firefoxMode) {
    const browser = await firefox.launch({ headless:true });
    context = await browser.newContext();
    context.closeBrowser = () => browser.close();
    // The background registers both scripts while the option is on; here the MAIN-world guard runs
    // before the page's scripts, and the isolated script, with a storage double, once it is parsed.
    await context.addInitScript({ content:source('dev-overlay-guard.js') });
    await context.addInitScript(() => {
      const listeners = [];
      window.browser = { runtime:{ id:'fixture', onMessage:{ addListener() {} } }, storage:{ onChanged:{ addListener:fn => listeners.push(fn) } } };
      window.turnOff = () => listeners.forEach(fn => fn({ devOverlayDetach:{ oldValue:true, newValue:false } }, 'local'));
    });
    await context.addInitScript({ content:`document.addEventListener('DOMContentLoaded', () => window.injectOverlay())` });
    await context.addInitScript({ content:`window.injectOverlay = () => {
      if (document.querySelector('script[data-overlay-test]')) return;
      const style = document.createElement('style'); style.textContent = ${JSON.stringify(source('dev-overlay.css'))}; document.head.append(style);
      const script = document.createElement('script'); script.setAttribute('data-overlay-test', ''); script.textContent = ${JSON.stringify(source('dev-overlay.js'))}; document.head.append(script);
    };` });
  } else {
    // Turning the option on requests unqork.io access through a prompt automation cannot accept, so this
    // copy of the extension holds that access already and the request resolves without one.
    const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), 'unqlock-overlay-extension-'));
    fs.cpSync(path.resolve(__dirname, '../dist/chrome'), extensionPath, { recursive:true });
    const manifestPath = path.join(extensionPath, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify({ ...JSON.parse(fs.readFileSync(manifestPath, 'utf8')), host_permissions:['https://*.unqork.io/*'] }));
    context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'unqlock-overlay-')), {
      ...(process.env.CHROME_PATH ? { executablePath:process.env.CHROME_PATH } : { channel:'chromium' }), headless:true,
      args:['--disable-extensions-except=' + extensionPath, '--load-extension=' + extensionPath]
    });
  }
  try {
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    await context.route(origin + '/**', request => request.fulfill({ contentType:'text/html', body:html }));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    let extension;
    if (!firefoxMode) {
      extension = await context.newPage();
      await extension.goto('chrome://extensions');
      const extensionId = await extension.evaluate(() => new Promise(resolve => chrome.developerPrivate.getExtensionsInfo({}, list => resolve(list.find(e => e.name === 'Unqlock').id))));
      await extension.goto(`chrome-extension://${extensionId}/popup.html`);
      await extension.locator('[aria-controls="quick-page"]').click();
    }
    // The Debug tools switch, which saves only once site access is granted.
    const option = () => extension.getByLabel('Detach dev overlay', { exact:true });
    async function setOption(value) {
      // The switch changes once access is granted and the choice saved, not on the click itself.
      if (await option().isChecked() !== value) await option().click();
      await extension.waitForFunction(value => chrome.storage.local.get('devOverlayDetach').then(result => result.devOverlayDetach === value), value, { timeout:5000 });
      await extension.waitForFunction(value => document.querySelector('input[name="dev-overlay-detach"]').checked === value, value, { timeout:5000 });
    }
    await page.goto(origin + route);
    if (!firefoxMode) {
      // Off by default: nothing is injected into Unqork pages.
      await frames(); await frames();
      assert.equal(await option().isChecked(), false);
      assert.equal(await page.locator('[data-unqlock-detach]').count(), 0);
      assert(!await page.evaluate(() => document.documentElement.hasAttribute('data-unqlock-dev-overlay')));
      // Turning it on adds the button to the open tab, and registers the scripts for the next load.
      await setOption(true);
      await page.locator('[data-unqlock-detach]').waitFor({ timeout:5000 });
      await page.reload();
    }
    const stored = (target, key) => target.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), key);
    // Playwright runs a Firefox popup's init scripts in its first about:blank document, whose window the
    // page then takes over: the guard's patch carries over, but the isolated script is injected here.
    const opened = popup => firefoxMode && popup.evaluate(() => window.injectOverlay());
    const hidden = (target, value) => target.waitForFunction(value => document.querySelector('[data-testid="dev-overlay"]').getAttribute('aria-hidden') === value, value, { timeout:5000 });

    // Detach sits beside Minimize on the right of the header row, and returns after a re-render.
    const detach = page.locator('[data-unqlock-detach]');
    await detach.waitFor();
    assert.equal(await detach.evaluate(button => button.nextElementSibling?.getAttribute('aria-label')), 'Minimize dev overlay');
    assert(await detach.evaluate(button => button.getBoundingClientRect().left > innerWidth / 2), 'Detach is on the right');
    assert.equal(await detach.getAttribute('class'), 'minimize', 'Detach takes the classes of Minimize');
    await page.evaluate(() => window.rerenderHeader());
    await detach.waitFor();

    // Detaching opens the same module in a named popup and minimizes the drawer here.
    let [popup] = await Promise.all([context.waitForEvent('page'), detach.click()]);
    await popup.waitForLoadState('domcontentloaded');
    await opened(popup);
    assert.equal(new URL(popup.url()).pathname, route);
    assert.equal(await popup.evaluate(() => window.name), 'unqlock-dev-overlay');
    await hidden(page, 'true');
    assert.equal((await stored(page, 'ide-dev-overlay')).open, false);

    // The popup opens its minimized drawer and fills the window with it, with Reattach in place of
    // Minimize and none of the drawer's own controls.
    await popup.waitForFunction(() => document.documentElement.getAttribute('data-unqlock-dev-overlay') === 'detached', null, { timeout:5000 });
    await hidden(popup, 'false');
    const box = await popup.evaluate(() => {
      const rect = document.querySelector('[data-testid="dev-overlay"]').getBoundingClientRect();
      return [rect.top, Math.round(rect.bottom) === innerHeight];
    });
    assert.deepEqual(box, [0, true], 'The drawer fills the popup');
    for (const selector of ['[data-testid="dev-overlay-toolbar"]', '[data-testid="dev-overlay-drag-handle"]', 'button[aria-label="Minimize dev overlay"]']) {
      assert(await popup.locator(selector).isHidden(), selector + ' is hidden in the popup');
    }
    assert(await popup.locator('[data-unqlock-reattach]').isVisible());
    assert.equal(await popup.locator('[data-unqlock-detach]').count(), 0);
    await popup.waitForFunction(() => document.title.startsWith('Dev overlay · '), null, { timeout:5000 });
    if (!firefoxMode) {
      // The builder scripts stand down in the popup.
      assert(await page.evaluate(() => document.documentElement.hasAttribute('data-unqlock-navigation-tabs')));
      assert(!await popup.evaluate(() => document.documentElement.hasAttribute('data-unqlock-navigation-tabs')));
    }

    // The popup saves neither the drawer nor the workspace tabs, but other keys as usual, and a menu
    // portaled to <body> still opens and takes clicks above the drawer.
    assert.equal((await stored(popup, 'ide-dev-overlay')).open, false, 'The popup does not save its open drawer');
    await page.evaluate(() => window.saveTabs(['main']));
    await popup.evaluate(() => window.saveTabs(['stale']));
    assert.deepEqual((await stored(page, 'ide-workspace-store')).tabs, ['main']);
    await popup.locator('#run-as').click();
    await popup.getByRole('option', { name:'Viewer' }).click();
    assert.equal(await popup.locator('#run-as').textContent(), 'Viewer');
    assert.equal((await stored(page, 'ide-sse-debugger-identity')).state.designerAssumeRole, 'Viewer');

    // Reattach closes the popup, without saving its stale tabs, and the drawer returns here.
    await Promise.all([popup.waitForEvent('close'), popup.locator('[data-unqlock-reattach]').click()]);
    await hidden(page, 'false');
    assert.deepEqual((await stored(page, 'ide-workspace-store')).tabs, ['main']);

    // Closing the popup any other way reattaches too.
    [popup] = await Promise.all([context.waitForEvent('page'), detach.click()]);
    await popup.waitForLoadState('domcontentloaded');
    await opened(popup);
    await hidden(page, 'true');
    await popup.close();
    await hidden(page, 'false');

    // Turning the option off removes the button from open tabs, and reloaded pages no longer get it.
    if (firefoxMode) await page.evaluate(() => window.turnOff());
    else await setOption(false);
    await page.locator('[data-unqlock-detach]').waitFor({ state:'detached', timeout:5000 });
    if (!firefoxMode) {
      await page.reload();
      await frames(); await frames();
      assert.equal(await page.locator('[data-unqlock-detach]').count(), 0);
      await setOption(true);
      // The switch shows the saved state when Debug tools opens again.
      await extension.reload();
      await extension.locator('[aria-controls="quick-page"]').click();
      await extension.waitForFunction(() => document.querySelector('input[name="dev-overlay-detach"]')?.checked, null, { timeout:5000 });
    } else await page.reload();

    // Outside /ide/ nothing is added.
    await page.goto(origin + '/login');
    await frames();
    assert.equal(await page.locator('[data-unqlock-detach]').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: dev overlay option off by default, injection when turned on, removal when off, Detach and Reattach, the full-window popup, its storage guard, portaled menus and scope (' + (firefoxMode ? 'Firefox' : 'Chrome extension') + ').');
  } finally {
    if (context.closeBrowser) await context.closeBrowser();
    else await context.close();
  }
}
run(process.argv.includes('--firefox')).catch(error => { console.error(error); process.exitCode = 1; });
