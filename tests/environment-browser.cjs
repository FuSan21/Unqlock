const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
(async () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'unqlock-environment-'));
  const extension = path.join(fixture, 'extension');
  fs.cpSync(path.resolve(__dirname, '../dist/chrome'), extension, { recursive:true });
  const manifestPath = path.join(extension, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  // Fixture supplies the grant; the real browser permission prompt is user-controlled.
  manifest.host_permissions = ['*://badge-fixture.test/*'];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const options = {
    ...(process.env.CHROME_PATH ? { executablePath:process.env.CHROME_PATH } : { channel:'chromium' }),
    headless:true, args:[`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  };
  let context;
  let extensionId;
  async function launch() {
    context = await chromium.launchPersistentContext(path.join(fixture, 'profile'), options);
    await context.route('https://badge-fixture.test/**', route => route.fulfill({ contentType:'text/html', body:'<h1>Custom domain fixture</h1>' }));
    await context.route('https://observed-*.unqork.io/**', route => route.fulfill({ contentType:'text/html', body:'<h1>Observed domain fixture</h1>' }));
    const management = await context.newPage();
    await management.goto('chrome://extensions');
    const extensions = await management.evaluate(() => new Promise(resolve => chrome.developerPrivate.getExtensionsInfo({}, resolve)));
    extensionId = extensions.find(item => item.name === 'Unqlock').id;
    await management.close();
  }
  try {
    await launch();
    let popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const response = await popup.evaluate(() => chrome.runtime.sendMessage({ type:'environment.save', preferences:{badge:true}, group:{ id:'custom', name:'Custom fixture', domains:[{ hostname:'badge-fixture.test', environment:'production' }] } }));
    assert.equal(response.ok, true);
    assert.equal(response.missingOrigins.length, 0);
    let custom = await context.newPage();
    await custom.goto('https://badge-fixture.test/app?x=1#/dashboard');
    await custom.waitForSelector('#unqlock-environment');
    assert.equal(await custom.locator('#unqlock-environment span').innerText(), '● PRODUCTION');
    await custom.reload();
    await custom.waitForSelector('#unqlock-environment');
    await popup.getByRole('button', { name:'General settings' }).click();
    for (const position of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
      await popup.getByLabel('Position', {exact:true}).selectOption(position);
      await custom.waitForFunction(position => document.querySelector('#unqlock-environment').dataset.position === position, position);
      const box = await custom.locator('#unqlock-environment').boundingBox();
      const viewport = custom.viewportSize();
      assert.equal(Math.round(position.endsWith('left') ? box.x : viewport.width - box.x - box.width), 16);
      assert.equal(Math.round(position.startsWith('top') ? box.y : viewport.height - box.y - box.height), 16);
    }
    await popup.getByLabel('Show Floating window', {exact:true}).uncheck();
    await custom.waitForFunction(() => !document.querySelector('#unqlock-environment'));
    await popup.getByLabel('Show Floating window', {exact:true}).check();
    await custom.waitForSelector('#unqlock-environment');
    // The menu stays in the original page, including after SPA navigation.
    await custom.evaluate(() => history.pushState({}, '', '/app?changed=1#/another'));
    await custom.bringToFront();
    const pageCount = context.pages().length;
    await custom.getByRole('button', {name:'Open Unqlock menu'}).click();
    const frameElement = await custom.locator('#unqlock-environment iframe').elementHandle();
    let menu = await frameElement.contentFrame();
    await menu.waitForSelector('body.ready');
    assert.equal(await menu.evaluate(() => document.activeElement.tagName), 'MAIN', 'Mouse opening focuses the container');
    assert.equal(await menu.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'none');
    await custom.keyboard.press('Tab');
    assert.equal(await menu.evaluate(() => document.activeElement.id), 'open-appearance');
    assert.equal(await menu.locator('#open-appearance').evaluate(element => element.matches(':focus-visible')), true);
    await custom.keyboard.press('Escape');
    await custom.waitForFunction(() => !document.querySelector('#unqlock-environment').shadowRoot.querySelector('iframe'));
    await custom.keyboard.press('Enter');
    const keyboardFrame = await custom.locator('#unqlock-environment iframe').elementHandle();
    menu = await keyboardFrame.contentFrame();
    await menu.waitForSelector('body.ready');
    assert.equal(await menu.evaluate(() => document.activeElement.id), 'open-appearance', 'Keyboard opening focuses the first item');
    assert.equal(await menu.locator('#open-appearance').evaluate(element => element.matches(':focus-visible')), true);
    assert.equal(context.pages().length, pageCount, 'No new tab or window');
    const badgeBox = await custom.locator('#unqlock-environment').boundingBox();
    const menuBox = await custom.locator('#unqlock-environment iframe').boundingBox();
    assert(menuBox.y + menuBox.height <= badgeBox.y, 'Bottom badge opens above');
    await menu.getByRole('button', {name:'Environment', exact:false}).click();
    await menu.waitForFunction(() => document.getElementById('environment-current').textContent.includes('badge-fixture.test'));
    await custom.screenshot({ path:path.resolve(__dirname, '../artifacts/floating-menu.png') });
    await custom.screenshot({ path:path.resolve(__dirname, '../artifacts/floating-launcher.png') });
    await custom.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<div class="unqorkio-form"></div>');
      window.fixtureSubmission = { data:{} };
      window.angular = { element:() => ({ scope:() => ({ submission:window.fixtureSubmission }) }) };
    });
    await menu.getByRole('button', {name:'All features'}).click();
    await menu.getByRole('button', {name:'Debug tools'}).click();
    await menu.waitForFunction(() => !document.getElementById('quick-controls').disabled);
    assert.equal(await menu.locator('#quick-access').isHidden(), true, 'Granted site needs no request');
    await menu.getByRole('tab', {name:'Data',exact:true}).click();
    await menu.getByLabel('Property name (exact key)').fill('fixture');
    await menu.getByLabel('Value', {exact:true}).fill('original page');
    await menu.getByRole('button', {name:'Update property',exact:true}).click();
    await menu.getByRole('button', {name:'Change anyway',exact:true}).click();
    await custom.waitForFunction(() => window.fixtureSubmission.data.fixture === 'original page');
    await menu.getByRole('button', {name:'Close Unqlock menu'}).click();
    await custom.waitForFunction(() => !document.querySelector('#unqlock-environment').shadowRoot.querySelector('iframe'));
    await popup.getByLabel('Position', {exact:true}).selectOption('top-right');
    await custom.waitForFunction(() => document.querySelector('#unqlock-environment').dataset.position === 'top-right');
    await custom.getByRole('button', {name:'Open Unqlock menu'}).click();
    const topBadge = await custom.locator('#unqlock-environment').boundingBox();
    const topMenu = await custom.locator('#unqlock-environment iframe').boundingBox();
    assert(topMenu.y >= topBadge.y + topBadge.height, 'Top badge opens below');
    await custom.locator('h1').click();
    await custom.waitForFunction(() => !document.querySelector('#unqlock-environment').shadowRoot.querySelector('iframe'));
    await custom.getByRole('button', {name:'Open Unqlock menu'}).click();
    const reopened = await (await custom.locator('#unqlock-environment iframe').elementHandle()).contentFrame();
    await reopened.waitForSelector('body.ready');
    // Escape detaches the frame, so the press must not wait for it afterwards.
    await reopened.getByRole('button', {name:'Component appearance'}).press('Escape', { noWaitAfter:true });
    await custom.waitForFunction(() => !document.querySelector('#unqlock-environment').shadowRoot.querySelector('iframe'));
    await popup.getByLabel('Position', {exact:true}).selectOption('bottom-right');

    const observed = await context.newPage();
    await observed.goto('https://observed-stagingx.unqork.io/app');
    await observed.waitForSelector('#unqlock-environment');
    await observed.goto('https://observed-uatx.unqork.io/app');
    await observed.waitForSelector('#unqlock-environment');
    await popup.waitForFunction(async () => {
      const { environment } = await chrome.storage.local.get('environment');
      return environment.groups.some(group => group.autoKey === 'observed:express' && group.domains.length === 2);
    });
    // Statically matched unqork.io pages hold no host permission, so tab URLs stay unreadable.
    await observed.bringToFront();
    await observed.getByRole('button', {name:'Open Unqlock menu'}).click();
    const observedMenu = await (await observed.locator('#unqlock-environment iframe').elementHandle()).contentFrame();
    await observedMenu.waitForSelector('body.ready');
    await observedMenu.getByRole('button', {name:'Environment', exact:false}).click();
    await observedMenu.waitForFunction(() => document.getElementById('environment-current').textContent.includes('observed-uatx.unqork.io'));
    await observedMenu.getByRole('button', {name:'All features'}).click();
    await observedMenu.getByRole('button', {name:'Debug tools'}).click();
    await observedMenu.waitForFunction(() => !document.getElementById('quick-access').hidden);
    assert.equal(await observedMenu.locator('#quick-access').getAttribute('title'), 'https://observed-uatx.unqork.io/*');
    assert.equal(await observedMenu.evaluate(() => document.getElementById('quick-controls').disabled), true);
    assert.match(await observedMenu.locator('#quick-status').innerText(), /one-time access/);
    await context.close();
    await launch();
    custom = await context.newPage();
    await custom.goto('https://badge-fixture.test/app');
    await custom.waitForSelector('#unqlock-environment');
    assert.equal(await custom.locator('#unqlock-environment span').innerText(), '● PRODUCTION');
    assert.equal(await custom.locator('#unqlock-environment').getAttribute('data-position'), 'bottom-right');
    popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.evaluate(() => chrome.runtime.sendMessage({ type:'environment.save', deleteId:'custom' }));
    await custom.waitForFunction(() => !document.querySelector('#unqlock-environment'));
    const scripts = await popup.evaluate(() => chrome.scripting.getRegisteredContentScripts());
    assert.equal(scripts.length, 0);
    await custom.reload();
    assert.equal(await custom.locator('#unqlock-environment').count(), 0);
    console.log('PASS: actual custom-domain badge injection, reload and browser-restart persistence with fixture-granted site access, automatic grouping and unregister-on-delete.');
  } finally { await context?.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
