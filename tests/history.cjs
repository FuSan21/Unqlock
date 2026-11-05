const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { builtScript, close, extensionId: readExtensionId, frames: nextFrames, installStorageDouble, launchChrome, launchFirefox, storage } = require('./browser.cjs');
// The Firefox branch injects the built content scripts, the MAIN-world bridge included, into the fixture page.
const source = name => builtScript('firefox', name);
const html = fs.readFileSync(path.join(__dirname, 'fixtures/history.html'), 'utf8');
const origin = 'https://history-fixture.unqork.io';
async function run(firefoxMode) {
  const context = firefoxMode ? await launchFirefox({ timezoneId:'UTC', locale:'en-US' }) : await launchChrome('history', { timezoneId:'UTC', locale:'en-US' });
  try {
    const errors = [];
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await context.route(origin + '/**', route => route.fulfill({ contentType:'text/html', body:html }));
    let popup;
    if (!firefoxMode) {
      popup = await context.newPage();
      await popup.goto(`chrome-extension://${await readExtensionId(popup)}/popup.html`);
    } else {
      await installStorageDouble(page);
    }
    const { set, storedWhen } = storage(popup || page);
    const frames = () => nextFrames(page);
    async function load(route = '/ide/builder/workspaces/test/modules/first') {
      await page.goto(origin + route);
      if (firefoxMode) {
        await page.addStyleTag({ content:source('history.css') });
        await page.addScriptTag({ content:source('history-bridge.js') });
        await page.addScriptTag({ content:source('history.js') });
      }
      await frames(); await frames();
    }
    // Each visible row's name, with its tooltip and whether the rocket shows after its name line.
    const rows = () => page.$$eval('#history li:not([hidden])', items => items.map(item => {
      const after = getComputedStyle(item.querySelector('.flex-1 > :first-child'), '::after');
      const badge = after.content !== 'none' && after.backgroundImage.includes('data:image/svg+xml') && after.width === '20px';
      const button = item.querySelector('button');
      return [button.getAttribute('aria-label'), badge, button.getAttribute('title')];
    }));
    const rowsWhen = async expected => {
      const until = Date.now() + 5000;
      while (JSON.stringify(await rows()) !== JSON.stringify(expected) && Date.now() < until) await frames();
      assert.deepEqual(await rows(), expected);
    };
    const promoted = ['10/14/2026, 8:12 AM', true, 'Promoted to org-qa-qa by eric@example.com, 10/21/2026, 9:29 PM'];
    const twice = ['7/1/2026, 7:20 PM', true, 'Promoted to org-qa-qa by clara, 7/6/2026, 7:53 PM\nPromoted to org-uat by uq64ac12c6fad64a4df2557e6d, 7/8/2026, 10:00 AM'];
    const plain = name => [name, false, null];

    // On by default: promoted saves get the rocket and a tooltip, each promotion once; others are left alone.
    await load();
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-unqlock-history-promotions')), true);
    await rowsWhen([plain('Release notes'), promoted, plain('10/14/2026, 8:00 AM'), twice]);
    // A row the filter reuses for another save follows it, and a row added later is marked too.
    await page.evaluate(() => window.filter(['promoted', 'twice']));
    await rowsWhen([promoted, twice]);
    await page.evaluate(() => window.filter(['plain', 'current', 'promoted']));
    await rowsWhen([plain('10/14/2026, 8:00 AM'), plain('Release notes'), promoted]);
    await page.evaluate(() => window.more());
    await rowsWhen([plain('10/14/2026, 8:00 AM'), plain('Release notes'), promoted, ['5/13/2026, 3:29 AM', true, 'Promoted to org-qa-qa by clara, 5/13/2026, 7:58 PM']]);

    // Turning it off removes the marks and tooltips from the open page; turning it on brings them back.
    await set({ historyPromotions:false });
    await rowsWhen([plain('10/14/2026, 8:00 AM'), plain('Release notes'), plain('10/14/2026, 8:12 AM'), plain('5/13/2026, 3:29 AM')]);
    await set({ historyPromotions:true });
    await rowsWhen([plain('10/14/2026, 8:00 AM'), plain('Release notes'), promoted, ['5/13/2026, 3:29 AM', true, 'Promoted to org-qa-qa by clara, 5/13/2026, 7:58 PM']]);

    // Outside /ide/ nothing runs.
    await load('/login');
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-unqlock-history-promotions')), false);
    assert.deepEqual((await rows()).map(row => row[1]), [false, false, false, false]);

    if (popup) {
      await load();
      await popup.reload();
      await popup.locator('#open-panels').click();
      await popup.locator('#panels-fields:not([disabled])').waitFor();
      const badges = popup.getByLabel('Promotion badges', { exact:true });
      assert(await badges.isChecked());
      await badges.uncheck();
      await storedWhen(values => values.historyPromotions === false);
      await rowsWhen([plain('Release notes'), plain('10/14/2026, 8:12 AM'), plain('10/14/2026, 8:00 AM'), plain('7/1/2026, 7:20 PM')]);
      await popup.locator('#panels-reset').click();
      await storedWhen(values => values.historyPromotions === true);
      await rowsWhen([plain('Release notes'), promoted, plain('10/14/2026, 8:00 AM'), twice]);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: History promotion badges and tooltips, rows reused by the filter, added rows, turning them off and on, scope and popup settings (' + (firefoxMode ? 'Firefox' : 'Chrome extension') + ').');
  } finally { await close(context); }
}
run(process.argv.includes('--firefox')).catch(error => { console.error(error); process.exitCode = 1; });
