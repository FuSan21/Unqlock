const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
// The prompt window against the real background, in the installed Chrome extension. The browser's own
// permission prompt cannot be accepted from automation, so this copy of the extension already holds
// unqork.io access and the request resolves without one.
(async () => {
  const extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), 'unqlock-prompt-extension-'));
  fs.cpSync(path.resolve(__dirname, '../dist/chrome'), extensionPath, { recursive:true });
  const manifestPath = path.join(extensionPath, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ ...JSON.parse(fs.readFileSync(manifestPath, 'utf8')), host_permissions:['https://*.unqork.io/*'] }));
  const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'unqlock-prompt-')), {
    ...(process.env.CHROME_PATH ? { executablePath:process.env.CHROME_PATH } : { channel:'chromium' }), headless:true,
    args:['--disable-extensions-except=' + extensionPath, '--load-extension=' + extensionPath]
  });
  try {
    const errors = [];
    const extension = await context.newPage();
    await extension.goto('chrome://extensions');
    const id = await extension.evaluate(() => new Promise(resolve => chrome.developerPrivate.getExtensionsInfo({}, list => resolve(list.find(e => e.name === 'Unqlock').id))));
    await extension.goto(`chrome-extension://${id}/popup.html`);
    const stored = key => extension.evaluate(key => chrome.storage.local.get(key).then(result => result[key]), key);
    const open = async query => {
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`chrome-extension://${id}/prompt.html?${query}`);
      return page;
    };

    // Detach dev overlay: the background describes the request, and finishes it by turning the option on.
    let page = await open('kind=devOverlay');
    await page.locator('#prompt-allow').waitFor();
    assert.equal(await page.locator('#prompt-title').textContent(), 'Allow Detach dev overlay on Unqork?');
    assert.equal(await page.locator('.prompt-sites').textContent(), '*.unqork.io');
    assert.equal(await stored('devOverlayDetach'), undefined);
    await page.locator('#prompt-allow').click();
    await page.locator('#prompt-close').waitFor();
    assert.equal(await page.locator('#prompt-title').textContent(), 'Access allowed');
    await extension.waitForFunction(() => chrome.storage.local.get('devOverlayDetach').then(result => result.devOverlayDetach === true), null, { timeout:5000 });
    await extension.waitForFunction(() => chrome.scripting.getRegisteredContentScripts().then(scripts => scripts.some(script => script.id === 'unqlock-dev-overlay')), null, { timeout:5000 });
    // Done closes the window.
    await Promise.all([page.waitForEvent('close'), page.locator('#prompt-close').click()]);

    // A request for a page Debug tools cannot use explains itself instead of asking.
    page = await open('kind=debug&tab=999999');
    await page.locator('#prompt-close').waitFor();
    assert.equal(await page.locator('#prompt-title').textContent(), 'Access was not changed');
    await page.close();

    // Import: choose a file, review its sections and import the chosen ones.
    await extension.evaluate(() => chrome.storage.local.set({ floating:{ enabled:false, mode:'fixed', corner:'bottom-left' }, appearance:{ icons:false } }));
    page = await open('kind=import');
    await page.locator('#prompt-choose').waitFor();
    const exported = { unqlock:1, extensionVersion:'1.6.0', settings:{ appearance:{ icons:true }, floating:{ enabled:true, mode:'draggable', corner:'top-right' } } };
    await page.setInputFiles('#prompt-file', { name:'team.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(exported)) });
    await page.locator('#prompt-sections').waitFor();
    assert.equal(await page.locator('#prompt-file-name').textContent(), 'team.json');
    await page.locator('#prompt-sections input[name="style"]').uncheck();
    await page.locator('#prompt-import').click();
    await page.locator('#prompt-import-done').waitFor();
    assert.equal(await page.locator('#prompt-import-done').textContent(), 'Imported Floating launcher.');
    assert.deepEqual(await stored('floating'), { enabled:true, mode:'draggable', corner:'top-right' });
    assert.equal((await stored('appearance')).icons, false, 'Sections left out stay as they were');
    // Escape closes the window like a dialog.
    // The window can close before the key press call returns.
    await Promise.all([page.waitForEvent('close'), page.keyboard.press('Escape').catch(() => {})]);

    assert.deepEqual(errors, []);
    console.log('PASS: prompt window site access for Detach dev overlay, an unusable Debug tools request, and file import with section choice, against the installed Chrome extension.');
  } finally {
    await context.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
