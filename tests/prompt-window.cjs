const assert = require('node:assert/strict');
const { extensionId: readExtensionId, extensionWith, launchChrome } = require('./browser.cjs');
// The prompt window against the real background, in the installed Chrome extension. The browser's own
// permission prompt cannot be accepted from automation, so this copy of the extension already holds
// unqork.io access and the request resolves without one.
(async () => {
  const extensionPath = extensionWith('prompt', ['https://*.unqork.io/*']);
  const context = await launchChrome('prompt', { extension:extensionPath });
  try {
    const errors = [];
    const extension = await context.newPage();
    const id = await readExtensionId(extension);
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
