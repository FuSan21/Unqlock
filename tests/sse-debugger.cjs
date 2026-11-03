const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extensionId: readExtensionId, extensionWith, launchChrome } = require('./browser.cjs');
// The Unqlock SSE debugger end to end in Chrome: the Debug tools switch, the button on the dev overlay
// fixture, the window it opens, and runs against a stand-in for Unqork's execute endpoint.
const html = fs.readFileSync(path.join(__dirname, 'fixtures/dev-overlay.html'), 'utf8');
const origin = 'https://overlay-fixture.unqork.io';
const moduleId = '646125c9ce236b1c9e80986d';
const route = '/ide/builder/workspaces/test/modules/' + moduleId;
// The shape of Unqork's verbose event log, with invented keys (tests/unit/sse-fixture.ts has the same run).
const at = ms => new Date(Date.UTC(2026, 10, 2, 1, 17, 48) + ms).toISOString();
const entry = (tick, eventType, causeKey, componentKey, componentType, ms, eventAttributes = {}) => ({ timestamp:at(ms), eventType, tick, causeKey, componentKey, componentType, eventAttributes });
const log = [
  entry(0, 'start', '__setup__', '__setup__', '__setup__', 0, { flavor:'new' }),
  entry(0, 'setData', '__setup__', 'init', 'initializer', 0, { value:'ready', update:true }),
  entry(0, 'addTrigger', '__setup__', 'init', 'initializer', 0),
  entry(0, 'setData', '__setup__', 'env', 'hidden', 1, { value:{ level:'staging' }, update:true }),
  entry(1, 'executeComponent', '__setup__', 'init', 'initializer', 2),
  entry(1, 'addTrigger', 'init', 'buildFlags', 'transformer', 3),
  entry(1, 'addTrigger', 'init', 'callService', 'integrator', 3),
  entry(2, 'executeComponent', 'init', 'buildFlags', 'transformer', 3),
  entry(2, 'setData', 'buildFlags', 'save', 'hidden', 7, { value:true, update:true }),
  entry(2, 'executeComponentAsyncStart', 'init', 'callService', 'integrator', 7),
  // A slow integrator.
  entry(2, 'executeComponentAsyncFinish', 'callService', 'callService', 'integrator', 3511)
];

(async () => {
  // Turning the option on requests unqork.io access through a prompt automation cannot accept, so this copy
  // of the extension holds that access already and the request resolves without one.
  const extensionPath = extensionWith('sse', ['https://*.unqork.io/*']);
  const context = await launchChrome('sse', { extension:extensionPath, viewport:{ width:1280, height:800 } });
  try {
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    // Routes run newest first: the execute endpoint, then every other page as the builder fixture.
    const executed = [];
    let hold = false;
    await context.route(origin + '/**', request => request.fulfill({ contentType:'text/html', body:html }));
    // The environment's roles, as Unqork's /fbu/uapi/roles lists them (more fields in reality).
    await context.route(origin + '/fbu/uapi/roles', request => request.fulfill({ contentType:'application/json',
      body:JSON.stringify([{ name:'Viewer', parent:null }, { name:'Administrator', parent:null }, { name:'Underwriter', parent:'Administrator' }]) }));
    await context.route(origin + '/fbu/uapi/modules/*/execute', async request => {
      const call = { method:request.request().method(), headers:request.request().headers(), body:JSON.parse(request.request().postData() || '{}') };
      executed.push(call);
      // A held run never answers, so Stop has a request in flight to end.
      if (hold) return;
      if (executed.length === 2) return request.fulfill({ status:412, contentType:'application/json', headers:{ 'x-assume-role':'Viewer' },
        body:JSON.stringify({ executionError:{ component:'callService', message:'Request failed with status code 500', code:500 }, eventLog:log.slice(0, -1) }) });
      return request.fulfill({ status:200, contentType:'application/json', headers:{ 'x-assume-role':'Viewer', 'x-service-log-id':'6ae7e4bcf8cab860cdbcca9a' },
        body:JSON.stringify({ data:{ resolved:{ status:'done', input:call.body.data } }, metadata:{}, validationErrors:[], invalidNavigationPanels:[], eventLog:log }) });
    });

    const extension = await context.newPage();
    const extensionId = await readExtensionId(extension);
    await extension.goto(`chrome-extension://${extensionId}/popup.html`);
    await extension.locator('[aria-controls="quick-page"]').click();
    const option = extension.getByLabel('Unqlock SSE debugger', { exact:true });
    assert.equal(await option.isChecked(), false, 'Off by default');
    await option.click();
    await extension.waitForFunction(() => chrome.storage.local.get('sseDebugger').then(result => result.sseDebugger === true), null, { timeout:5000 });

    // The builder gets Open in Unqlock debugger beside Minimize, and no Detach, which is still off.
    const page = await context.newPage();
    await page.goto(origin + route);
    const button = page.locator('[data-unqlock-debugger]');
    await button.waitFor({ timeout:5000 });
    assert.equal(await page.locator('[data-unqlock-detach]').count(), 0);
    assert.equal(await button.evaluate(element => element.nextElementSibling?.getAttribute('aria-label')), 'Minimize dev overlay');

    const [debuggerWindow] = await Promise.all([context.waitForEvent('page'), button.click()]);
    await debuggerWindow.waitForLoadState('domcontentloaded');
    assert.match(debuggerWindow.url(), new RegExp(`^chrome-extension://${extensionId}/sse\\.html\\?tab=\\d+$`));
    await debuggerWindow.locator('h1', { hasText:'Dev overlay fixture' }).waitFor({ timeout:5000 });
    // Run as offers the environment's roles, sorted, read from the builder tab.
    const roles = debuggerWindow.locator('select[aria-label="Role"]');
    assert.deepEqual(await roles.locator('option').allTextContents(), ['Administrator', 'Underwriter', 'Viewer']);
    await roles.selectOption('Underwriter');
    const role = await roles.inputValue();

    // A run sends what Unqork's debugger sends, from the builder page with its cookies.
    await debuggerWindow.locator('#sse-input').fill('{"applicationId":"APP-1"}');
    await debuggerWindow.locator('#run-module').click();
    await debuggerWindow.locator('.outcome .status', { hasText:'200' }).waitFor({ timeout:10000 });
    assert.equal(executed.length, 1);
    assert.equal(executed[0].method, 'PUT');
    assert.equal(executed[0].headers['x-xsrf'], '', 'The CSRF header is present and empty');
    assert.equal(executed[0].headers['x-assume-role'], role);
    assert.equal(executed[0].headers['x-quill-preview'], 'true');
    assert.deepEqual(executed[0].body, { moduleId, data:{ applicationId:'APP-1' }, verbose:true });
    assert.match(await debuggerWindow.locator('.outcome').textContent(), /^200Ran as Viewer · \d+ ms · 3 steps · 3 values set · 1 slow$/);
    assert.equal(await debuggerWindow.locator('.lane').count(), 5);
    assert.equal(await debuggerWindow.locator('.lane[data-key="callService"] .slow').textContent(), 'Slow');
    await debuggerWindow.locator('.lane[data-key="save"] [data-kind="set"]').click();
    assert.equal(await debuggerWindow.locator('.inspector h2').textContent(), 'save');
    assert.equal(await debuggerWindow.locator('.threads path').count(), 4, 'A thread for each link in the chain');
    // The component column stays put while lanes scroll, and the selection is visible.
    assert(await debuggerWindow.locator('.lane[data-key="save"] [data-kind="set"]').isVisible());
    if (process.env.SSE_SCREENSHOTS) await debuggerWindow.screenshot({ path:path.join(process.env.SSE_SCREENSHOTS, 'chrome-run.png') });

    // A failed run names the component and selects its failure.
    await debuggerWindow.locator('#run-module').click();
    await debuggerWindow.locator('.outcome .status', { hasText:'412' }).waitFor({ timeout:10000 });
    assert.match(await debuggerWindow.locator('.callout').textContent(), /^callService stopped the run in step 3\./);
    assert.equal(await debuggerWindow.locator('.inspector h2').textContent(), 'callService');
    assert.equal(await debuggerWindow.locator('.runs li').count(), 2);
    if (process.env.SSE_SCREENSHOTS) await debuggerWindow.screenshot({ path:path.join(process.env.SSE_SCREENSHOTS, 'chrome-failure.png') });

    // Rerun sends the first run's input again; In values finds a component by its value; env only received a
    // setup value, so it can be hidden.
    await debuggerWindow.locator('#sse-input').fill('{}');
    await debuggerWindow.locator('.runs li').nth(1).hover();
    await debuggerWindow.locator('.runs li').nth(1).getByRole('button', { name:/^Run again/ }).click();
    await debuggerWindow.locator('.outcome .status', { hasText:'200' }).waitFor({ timeout:10000 });
    assert.equal(executed.length, 3);
    assert.deepEqual(executed[2].body.data, { applicationId:'APP-1' });
    await debuggerWindow.getByRole('button', { name:'In values' }).click();
    await debuggerWindow.locator('input[type="search"]').fill('staging');
    assert.deepEqual(await debuggerWindow.locator('.lane').evaluateAll(lanes => lanes.map(lane => lane.dataset.key)), ['env']);
    await debuggerWindow.locator('input[type="search"]').fill('');
    await debuggerWindow.getByRole('button', { name:/^Hide setup values/ }).click();
    assert.equal(await debuggerWindow.locator('.lane[data-key="env"]').count(), 0);
    if (process.env.SSE_SCREENSHOTS) await debuggerWindow.screenshot({ path:path.join(process.env.SSE_SCREENSHOTS, 'chrome-rerun.png') });

    // Stop ends the wait for a run the server has not answered, through the page's real fetch abort.
    hold = true;
    await debuggerWindow.locator('#run-module').click();
    await debuggerWindow.locator('#stop-run').click();
    await debuggerWindow.locator('.callout', { hasText:'You stopped waiting for this run. Unqork may still finish it on the server.' }).waitFor({ timeout:5000 });
    assert.equal(await debuggerWindow.locator('.outcome .status').textContent(), 'No response');
    assert.equal(await debuggerWindow.locator('#run-module').isEnabled(), true);
    assert.equal(executed.length, 4);
    hold = false;

    // Clicking the button again focuses the same window rather than opening another.
    const pages = context.pages().length;
    await button.click();
    await page.waitForTimeout(500);
    assert.equal(context.pages().length, pages);

    // Use instead of Unqork's debugger, shown under the option while it is on: the dev overlay is hidden, and
    // Server-Side Execute opens Unqlock's window instead of Unqork's drawer.
    const replace = extension.getByLabel('Use instead of Unqork’s debugger', { exact:true });
    await replace.click();
    await extension.waitForFunction(() => chrome.storage.local.get('sseDebuggerReplace').then(result => result.sseDebuggerReplace === true), null, { timeout:5000 });
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-unqlock-sse-replace'), null, { timeout:5000 });
    assert(await page.locator('[data-testid="dev-overlay"]').isHidden());
    assert(await page.locator('[data-testid="dev-overlay-toolbar"]').isHidden());
    await debuggerWindow.close();
    const [replaced] = await Promise.all([context.waitForEvent('page'), page.locator('#server-side-execute').click()]);
    await replaced.waitForLoadState('domcontentloaded');
    assert.match(replaced.url(), /\/sse\.html\?tab=\d+$/);
    assert.equal(await page.evaluate(() => window.nativeExecutes), 0, 'Unqork’s own handler did not run');
    // Off again: the overlay returns and Server-Side Execute is Unqork's.
    await replace.click();
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-unqlock-sse-replace'), null, { timeout:5000 });
    assert(await page.locator('[data-testid="dev-overlay-toolbar"]').isVisible());
    await page.locator('#server-side-execute').click();
    assert.equal(await page.evaluate(() => window.nativeExecutes), 1);
    await replaced.close();

    // Turning the option off removes the button from the open builder tab.
    await option.click();
    await extension.waitForFunction(() => chrome.storage.local.get('sseDebugger').then(result => result.sseDebugger === false), null, { timeout:5000 });
    await button.waitFor({ state:'detached', timeout:5000 });
    assert.deepEqual(errors, []);
    console.log('PASS: Unqlock SSE debugger switch, its button on the dev overlay, one window per tab, runs with Unqork’s headers and body, steps and inspector, Slow, a failed run, Rerun, In values, Hide setup values, Stop, Use instead of Unqork’s debugger, and removal (Chrome extension).');
  } finally {
    await context.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
