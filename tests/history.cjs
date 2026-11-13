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

    // Environment writes the environments into the badge, each once, beside the rocket; the tooltip is unchanged.
    // The pill stays on the name line while the whole name, its badges and the pill fit, else it goes below.
    const envs = () => page.$$eval('#history li:not([hidden]) .flex-1', items => items.map(item => {
      const [name, author] = [...item.children].map(line => getComputedStyle(line, '::after').content);
      return author !== 'none' ? [2, author] : name !== 'none' ? [1, name] : null;
    }));
    const envsWhen = async expected => {
      const until = Date.now() + 5000;
      while (JSON.stringify(await envs()) !== JSON.stringify(expected) && Date.now() < until) await frames();
      assert.deepEqual(await envs(), expected);
    };
    await envsWhen([null, null, [1, '""'], [1, '""']]);
    await set({ historyPromotions:'env' });
    await page.evaluate(() => window.width(600));
    await envsWhen([null, null, [1, '"org-qa-qa"'], [1, '"org-qa-qa"']]);
    await page.evaluate(() => window.width(200));
    await envsWhen([null, null, [2, '"org-qa-qa"'], [2, '"org-qa-qa"']]);
    assert.deepEqual((await rows())[2], ['10/14/2026, 8:12 AM', false, promoted[2]]);
    await page.evaluate(() => window.width(280));
    await set({ historyPromotions:'icon' });
    await envsWhen([null, null, [1, '""'], [1, '""']]);

    // Outside /ide/ nothing runs.
    await load('/login');
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-unqlock-history-promotions')), false);
    assert.deepEqual((await rows()).map(row => row[1]), [false, false, false, false]);

    // Restored saves: a badge on each, On hover by default, naming its source; hovering it draws one guide from its
    // dot to its source's and rings the source; selecting a save that names its source corrects the guess.
    const badges = () => page.$$eval('[data-unqlock-restored-badge]', items => items.map(badge => {
      const style = getComputedStyle(badge);
      return [badge.getAttribute('data-unqlock-restored-badge'), style.width === '20px' && style.backgroundImage.includes('data:image/svg+xml') ? badge.getAttribute('title') : null];
    }));
    const badgesWhen = async expected => {
      const until = Date.now() + 5000;
      while (JSON.stringify(await badges()) !== JSON.stringify(expected) && Date.now() < until) await frames();
      assert.deepEqual(await badges(), expected);
    };
    // Each guide's top and bottom against the rows' dots, whether it is the hovered one, and the ringed source.
    const guides = () => page.evaluate(() => {
      const dot = id => [...document.querySelectorAll('#history button')].find(button => button.__reactFiber$fixture.return.return.memoizedProps.revision._id === id).nextElementSibling.firstElementChild.getBoundingClientRect();
      const lines = [...document.querySelectorAll('[data-unqlock-restore-guides] > div')].map(line => {
        const box = line.getBoundingClientRect();
        return { top:box.top, bottom:box.bottom, active:line.hasAttribute('data-active') };
      });
      const source = document.querySelector('[data-unqlock-restore-source] > button')?.getAttribute('aria-label') ?? null;
      return { lines, source, dot:{ restoredNamed:dot('restoredNamed'), named:dot('named') } };
    });
    const guidesWhen = async (count, check = () => true) => {
      const until = Date.now() + 5000;
      let found = await guides();
      while ((found.lines.length !== count || !check(found)) && Date.now() < until) { await frames(); found = await guides(); }
      assert.equal(found.lines.length, count);
      assert(check(found), JSON.stringify(found));
      return found;
    };
    const sprint = 'Restored from “Sprint build”, saved 11/12/2026, 9:31 PM';
    const marked = [
      ['renamed', 'Restored from an earlier save. Select this save to find which one'],
      ['restoredNamed', sprint],
      ['chain2', 'Restored from “(Restored) 11/12/2026, 7:29 PM”, saved 11/12/2026, 8:06 PM'],
      ['elsewhere', 'Probably restored from “11/12/2026, 7:29 PM”'],
      ['chain1', 'Restored from “11/12/2026, 7:29 PM”'],
      ['gone', 'Restored from “Deleted save”, which is not in the list']
    ];
    await load();
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-unqlock-history-restores')), 'hover');
    await page.evaluate(() => window.restores());
    await badgesWhen(marked);
    await guidesWhen(0);
    await page.hover('[data-unqlock-restored-badge="restoredNamed"]');
    const hovered = await guidesWhen(1, found => found.lines[0].active && found.source === 'Sprint build');
    const middle = box => box.top + box.height / 2;
    assert(Math.abs(hovered.lines[0].top - middle(hovered.dot.restoredNamed)) <= 2 && Math.abs(hovered.lines[0].bottom - middle(hovered.dot.named)) <= 2, JSON.stringify(hovered));
    await page.mouse.move(600, 5);
    await guidesWhen(0, found => found.source === null);
    // A detail that loads without changing a row is read when its badge is hovered.
    await page.evaluate(() => window.loadDetail('renamed', 'named'));
    await page.hover('[data-unqlock-restored-badge="renamed"]');
    await guidesWhen(1, found => found.lines[0].active && found.source === 'Sprint build');
    await badgesWhen([['renamed', sprint], ...marked.slice(1)]);
    await page.mouse.move(600, 5);
    await guidesWhen(0);
    // Always draws every guide whose two saves are listed, none of them hovered.
    await set({ historyRestores:'always' });
    await guidesWhen(5, found => found.lines.every(line => !line.active));
    await set({ historyRestores:'native' });
    await badgesWhen([]);
    await guidesWhen(0);
    await set({ historyRestores:'hover' });
    await badgesWhen([['renamed', sprint], ...marked.slice(1)]);

    if (popup) {
      await load();
      await popup.reload();
      await popup.locator('#open-panels').click();
      await popup.locator('#panels-fields:not([disabled])').waitFor();
      const promotionOption = value => popup.locator('input[name="history-promotions"][value="' + value + '"]');
      assert(await promotionOption('icon').isChecked());
      await promotionOption('native').check();
      await storedWhen(values => values.historyPromotions === 'native');
      await rowsWhen([plain('Release notes'), plain('10/14/2026, 8:12 AM'), plain('10/14/2026, 8:00 AM'), plain('7/1/2026, 7:20 PM')]);
      await popup.locator('#panels-reset').click();
      await storedWhen(values => values.historyPromotions === 'icon');
      await rowsWhen([plain('Release notes'), promoted, plain('10/14/2026, 8:00 AM'), twice]);
      await page.evaluate(() => window.restores());
      await badgesWhen(marked);
      await popup.locator('input[name="history-restores"][value="always"]').check();
      await storedWhen(values => values.historyRestores === 'always');
      await guidesWhen(4);
      await popup.locator('#panels-reset').click();
      await storedWhen(values => values.historyRestores === 'hover');
      await guidesWhen(0);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: History promotion badges and tooltips, environment names in the badge on the line they fit, rows reused by the filter, added rows, turning them off and on, scope, restored-save badges, sources by name, date and detail, a detail loaded without a row change, hover and Always guides, and popup settings (' + (firefoxMode ? 'Firefox' : 'Chrome extension') + ').');
  } finally { await close(context); }
}
run(process.argv.includes('--firefox')).catch(error => { console.error(error); process.exitCode = 1; });
