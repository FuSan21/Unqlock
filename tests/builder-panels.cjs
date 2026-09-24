const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, firefox } = require('playwright');
const { buildSync } = require('esbuild');
const source = name => fs.readFileSync(path.resolve(__dirname, '../src', name), 'utf8');
const bundle = buildSync({ entryPoints:[path.join(__dirname, 'fixtures/builder-panels.jsx')], bundle:true, write:false, format:'iife' }).outputFiles[0].text;
const html = '<!doctype html><style>body{margin:0}button{height:30px} [data-panel]{background:#fafafa;border:1px solid #ddd!important;box-sizing:border-box}</style><div id="root"></div><script>' + bundle.replace(/<\/script/gi, '<\\/script') + '</script>';
const fixtureUrl = 'https://panels-fixture.unqork.io/ide/builder/workspaces/test/modules/first';
const names = {
  agent:['Collapse left','Expand left'], explore:['Collapse right','Expand right'],
  tray:['Close component tray','Expand component tray panel'], properties:['Collapse properties panel','Expand properties panel']
};
async function run(firefoxMode) {
  let context;
  if (firefoxMode) {
    const browser = await firefox.launch({headless:true});
    context = await browser.newContext({viewport:{width:2560,height:800}});
    context.closeBrowser = () => browser.close();
  } else {
    context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'unqlock-panels-')), {
      ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chromium'}), headless:true,
      args:['--disable-extensions-except=' + path.resolve(__dirname,'../dist/chrome'), '--load-extension=' + path.resolve(__dirname,'../dist/chrome')],
      viewport:{width:2560,height:800}
    });
  }
  try {
    const errors = [];
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await context.route('https://panels-fixture.unqork.io/**', route => route.fulfill({contentType:'text/html',body:html}));
    let popup;
    let extensionId;
    if (!firefoxMode) {
      popup = await context.newPage();
      await popup.goto('chrome://extensions');
      extensionId = await popup.evaluate(() => new Promise(resolve => chrome.developerPrivate.getExtensionsInfo({}, list => resolve(list.find(e => e.name === 'Unqlock').id))));
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    } else {
      await page.addInitScript(() => {
        const callbacks = [];
        window.browser = { runtime:{id:'fixture',onMessage:{addListener() {}}}, storage:{
          local:{get:async () => JSON.parse(localStorage.getItem('fixture') || '{}'), set:async updates => {
            const data = JSON.parse(localStorage.getItem('fixture') || '{}'); const changes = {};
            for (const [key,value] of Object.entries(updates)) { changes[key] = {oldValue:data[key],newValue:value}; data[key] = value; }
            localStorage.setItem('fixture',JSON.stringify(data)); callbacks.forEach(fn => fn(changes,'local'));
          }}, onChanged:{addListener:fn => callbacks.push(fn)}
        }};
      });
    }
    async function set(values) { await (popup || page).evaluate(values => (window.chrome?.storage || window.browser.storage).local.set(values), values); }
    async function get() { return (popup || page).evaluate(() => (window.chrome?.storage || window.browser.storage).local.get(null)); }
    async function storedWhen(predicate) {
      const until = Date.now() + 7000;
      while (Date.now() < until) {
        const values = await get();
        if (predicate(values)) return values;
        await new Promise(resolve => setTimeout(resolve,50));
      }
      throw new Error('Storage did not reach the expected state: ' + JSON.stringify(await get()));
    }
    async function load(url = fixtureUrl) {
      await page.goto(url);
      await page.getByRole('button',{name:'Collapse left',exact:true}).waitFor();
      if (firefoxMode) {
        await page.addScriptTag({content:source('panel-resize-bridge.js')});
        await page.addStyleTag({content:source('builder-panels.css')});
        await page.addScriptTag({content:source('panel-settings.js')});
        await page.addScriptTag({content:source('builder-panels.js')});
      }
    }
    const width = id => page.locator('#' + id).evaluate(e => Math.round(e.getBoundingClientRect().width));
    const waitWidth = async (id, value) => {
      try { await page.waitForFunction(({id,value}) => Math.abs(document.getElementById(id).getBoundingClientRect().width - value) < 4, {id,value}, {timeout:7000}); }
      catch (error) { console.error({id,value,actual:await width(id),errors}); throw error; }
    };
    await load();
    await set({builderPanels:{agent:{visibility:'start'},properties:{visibility:'always'}}});
    await page.getByRole('button',{name:'Expand properties panel',exact:true}).waitFor();
    assert(await page.getByRole('button',{name:'Collapse left',exact:true}).isVisible(), 'Start collapsed does not interrupt current visit');
    await page.getByRole('button',{name:'Expand properties panel',exact:true}).click({force:true});
    assert(await page.getByRole('button',{name:'Expand properties panel',exact:true}).isVisible());
    await page.locator('#properties[data-unqlock-native-locked="true"]').waitFor({state:'attached'});
    const collapsedWidth = await width('properties');
    await page.evaluate(() => {
      window.reopenFrames = [];
      window.closeClicks = 0;
      document.addEventListener('click', event => {
        if (event.target.closest('[aria-label="Collapse properties panel"]')) window.closeClicks++;
      }, true);
      document.getElementById('auto-properties').addEventListener('click', () => {
        window.reopenFrames = [];
        const sample = () => {
          window.reopenFrames.push(document.getElementById('properties').getBoundingClientRect().width);
          if (window.reopenFrames.length < 4) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
    });
    await page.getByRole('button',{name:'Rerender',exact:true}).click();
    await page.getByRole('button',{name:'Select component',exact:true}).click();
    await page.waitForFunction(() => window.reopenFrames.length === 4);
    assert((await page.evaluate(() => window.reopenFrames)).every(value => Math.abs(value - collapsedWidth) < 1), 'Properties never opens at frame boundaries');
    assert.equal(await page.evaluate(() => window.closeClicks),0,'Automatic reopen does not trigger a close button action');
    await page.getByRole('button',{name:'Expand properties panel',exact:true}).waitFor();
    await page.locator('#handle-properties').press('ArrowLeft');
    assert(await page.getByRole('button',{name:'Expand properties panel',exact:true}).isVisible());
    await page.getByRole('button',{name:'Expand properties panel',exact:true}).focus();
    await page.locator('#unqlock-panel-tooltip').waitFor();
    assert.match(await page.locator('#unqlock-panel-tooltip').innerText(), /Properties is always collapsed/);
    const lockedProperties = page.getByRole('button',{name:'Expand properties panel',exact:true});
    assert.equal(await lockedProperties.getAttribute('title'),null,'Only the custom tooltip is shown');
    const descriptionId = await lockedProperties.getAttribute('aria-describedby');
    assert.match(await page.locator('#' + descriptionId).textContent(),/Properties is always collapsed/);
    await page.getByRole('button',{name:'Another module'}).click();
    await page.getByRole('button',{name:'Expand left',exact:true}).waitFor();
    await page.getByRole('button',{name:'Expand left',exact:true}).click();
    await page.getByRole('button',{name:'Rerender',exact:true}).click();
    assert(await page.getByRole('button',{name:'Collapse left',exact:true}).isVisible(), 'Manual expansion survives rerender');
    const all = Object.fromEntries(Object.keys(names).map(id => [id,{visibility:'native',sizing:'custom',width:300}]));
    await set({builderPanels:all});
    await page.getByRole('button',{name:'Expand properties panel',exact:true}).waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-unqlock-panel-locked]'));
    await page.getByRole('button',{name:'Expand properties panel',exact:true}).click();
    for (const id of Object.keys(names)) await waitWidth(id,300);
    // Resizing must update the native layout, not a CSS-only overlay.
    await page.locator('#handle-agent').press('ArrowRight');
    assert(await width('agent') > 350);
    all.agent = {visibility:'native',sizing:'remember'};
    await set({builderPanels:all});
    const handle = await page.locator('#handle-agent').boundingBox();
    await page.mouse.move(handle.x - 3,handle.y + 50); await page.mouse.down();
    await page.mouse.move(handle.x + 75,handle.y + 50,{steps:5}); await page.mouse.up();
    const draggedWidth = await width('agent');
    assert(Number.isFinite(draggedWidth));
    assert(draggedWidth > handle.x + 30, 'A drag beginning beside the separator resizes the panel');
    const remembered = (await storedWhen(values => values.panelWidth_agent === draggedWidth)).panelWidth_agent;
    await page.getByRole('button',{name:'Collapse left',exact:true}).click();
    assert.equal((await get()).panelWidth_agent,remembered,'Collapse does not save zero');
    await load();
    await waitWidth('agent',remembered);
    await page.setViewportSize({width:1200,height:800});
    assert.equal((await get()).panelWidth_agent,remembered,'Viewport adjustment does not overwrite preference');
    await page.setViewportSize({width:2560,height:800});
    all.agent = {visibility:'native',sizing:'custom',width:300};
    await set({builderPanels:all});
    await waitWidth('agent',300);
    const customHandle = await page.locator('#handle-agent').boundingBox();
    await page.mouse.move(customHandle.x - 3,customHandle.y + 50); await page.mouse.down();
    await page.mouse.move(customHandle.x + 75,customHandle.y + 50,{steps:5}); await page.mouse.up();
    const manualWidth = await width('agent');
    assert(manualWidth > 330);
    await page.getByRole('button',{name:'Collapse left',exact:true}).click();
    await page.getByRole('button',{name:'Expand left',exact:true}).click();
    await waitWidth('agent',manualWidth);
    for (const id of Object.keys(names)) {
      all[id] = {visibility:'always',sizing:'custom',width:300};
      await set({builderPanels:all});
      await page.getByRole('button',{name:names[id][1],exact:true}).waitFor();
      await page.getByRole('button',{name:names[id][1],exact:true}).press('Enter');
      assert(await page.getByRole('button',{name:names[id][1],exact:true}).isVisible());
    }
    const collapsedWidths = Object.fromEntries(await Promise.all(Object.keys(names).map(async id => [id,await width(id)])));
    await page.getByRole('button',{name:'Rerender',exact:true}).click();
    await page.getByRole('button',{name:'Open all panels',exact:true}).click();
    for (const id of Object.keys(names)) assert.equal(await width(id),collapsedWidths[id],id + ' stays collapsed after a native expansion request');
    const lockedHandle = await page.locator('#handle-agent').boundingBox();
    await page.mouse.move(lockedHandle.x - 3,lockedHandle.y + 50); await page.mouse.down();
    await page.mouse.move(lockedHandle.x + 80,lockedHandle.y + 50,{steps:5}); await page.mouse.up();
    assert.equal(await width('agent'),collapsedWidths.agent,'The native hit area beside a locked separator cannot reopen the panel');
    await page.getByRole('button',{name:'Leave builder'}).click();
    await page.waitForFunction(() => !document.querySelector('[data-unqlock-panel-locked]'));
    await page.waitForFunction(() => !document.querySelector('[data-unqlock-native-locked]'));
    await page.getByRole('button',{name:'Expand left',exact:true}).click();
    await page.getByRole('button',{name:'Collapse left',exact:true}).waitFor();
    await set({builderPanels:{properties:{visibility:'start'}}});
    await load(fixtureUrl + '?late-properties');
    // Let initial module discovery settle before the user mounts Properties.
    await page.getByRole('button',{name:'Close component tray',exact:true}).waitFor();
    await page.waitForTimeout(100);
    await page.getByRole('button',{name:'Mount properties',exact:true}).click();
    await page.getByRole('button',{name:'Collapse properties panel',exact:true}).waitFor();
    await page.waitForTimeout(100);
    assert(await page.getByRole('button',{name:'Collapse properties panel',exact:true}).isVisible(), 'Late Properties is not treated as module entry');
    await set({builderPanels:all});
    await page.getByRole('button',{name:'Leave builder'}).click();
    if (popup) {
      await popup.getByRole('button',{name:'General settings'}).click();
      await popup.locator('#panels-fields').waitFor({state:'visible'});
      await popup.locator('summary').filter({hasText:'Build Agent'}).click();
      assert(await popup.getByLabel('Build Agent size behavior',{exact:true}).isDisabled());
      await popup.getByLabel('Build Agent visibility',{exact:true}).selectOption('native');
      await popup.getByLabel('Build Agent size behavior',{exact:true}).selectOption('custom');
      await popup.getByLabel('Build Agent default width (px)',{exact:true}).fill('420');
      await popup.getByLabel('Build Agent default width (px)',{exact:true}).press('Tab');
      await storedWhen(r=>r.builderPanels.agent.width === 420);
      await popup.getByLabel('Build Agent default width (px)',{exact:true}).fill('20');
      await popup.getByLabel('Build Agent default width (px)',{exact:true}).press('Tab');
      assert.equal((await get()).builderPanels.agent.width,420);
      await popup.getByLabel('Build Agent default width (px)',{exact:true}).fill('420');
      await popup.getByLabel('Build Agent default width (px)',{exact:true}).press('Tab');
      await popup.setViewportSize({width:420,height:850});
      const explanation = popup.getByLabel('Why Use current Build Agent width is unavailable',{exact:true});
      await explanation.focus();
      await popup.waitForFunction(() => {
        const hint = document.querySelector('.disabled-explanation:focus .disabled-hint');
        const rect = hint?.getBoundingClientRect();
        return rect && rect.width > 0 && rect.left >= 0 && rect.right <= document.body.clientWidth;
      });
      await popup.screenshot({path:path.resolve(__dirname,'../artifacts/builder-panel-settings.png'),fullPage:true});
      await popup.getByRole('button',{name:'Reset all builder panels',exact:true}).click();
      await storedWhen(r=>Object.values(r.builderPanels).every(p=>p.visibility === 'native' && p.sizing === 'native'));
      assert.equal((await get()).panelWidth_agent,null);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: native nested panel sizing, collapse policy, drag persistence, navigation and settings (' + (firefoxMode ? 'Firefox' : 'Chrome extension') + ').');
  } finally {
    if (context.closeBrowser) await context.closeBrowser();
    else await context.close();
  }
}
run(process.argv.includes('--firefox')).catch(error => {console.error(error);process.exitCode=1;});
