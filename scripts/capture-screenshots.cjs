// Captures the popup pages from the built Chrome extension into docs/screenshots/SS, in the dark
// theme the store images use. Run npm run build first. Every value shown is example data: the
// active tab is a placeholder hostname and no real module or organization is opened.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const project = path.resolve(__dirname, '..');
const extension = path.join(project, 'dist/chrome');
const output = path.join(project, 'docs/screenshots/SS');
const page = 'https://example-staging.unqork.io/app/workspace#/display/dashboard';
const settings = {
  appearance:{ enabled:true, compact:true, containerHeaders:true, containerGuides:true },
  rowLayout:{ enabled:true, icon:'left', name:'left', type:'left', chip:'right', actions:'right' },
  canvasToolbar:{ search:'always', sort:'always' },
  builderPanels:{ agent:{ visibility:'start', sizing:'native', width:null }, explore:{ visibility:'always', sizing:'native', width:null }, properties:{ visibility:'native', sizing:'custom', width:320 }, tray:{ visibility:'native', sizing:'remember', width:null } },
  panelWidth_tray:264,
  floating:{ enabled:true, position:'bottom-left' },
  environment:{ badge:true, blockProduction:true, autoDiscover:true, groups:[{ id:'demo', name:'Demo Group', domains:[
    { hostname:'example-staging.unqork.io', environment:'staging' },
    { hostname:'example-qa.unqork.io', environment:'qa' },
    { hostname:'example-uat.unqork.io', environment:'uat' },
    { hostname:'example.com', environment:'production' }
  ] }] }
};
(async () => {
  if (!fs.existsSync(path.join(extension, 'manifest.json'))) throw new Error('Run npm run build first.');
  fs.mkdirSync(output, { recursive:true });
  const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'unqlock-screenshots-')), {
    ...(process.env.CHROME_PATH ? { executablePath:process.env.CHROME_PATH } : { channel:'chromium' }), headless:true,
    args:[`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport:{ width:354, height:600 }, colorScheme:'dark'
  });
  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    // The popup acts on the active tab; point it at the placeholder page.
    await context.addInitScript(url => {
      if (location.protocol === 'chrome-extension:') chrome.tabs.query = async () => [{ id:1, url }];
    }, page);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.evaluate(values => chrome.storage.local.clear().then(() => chrome.storage.local.set(values)), settings);
    const shot = async name => {
      await popup.mouse.move(0, 0);
      await popup.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
      await popup.waitForTimeout(300);
      await popup.screenshot({ path:path.join(output, name + '.png'), fullPage:true });
      console.log('Captured ' + name + '.png');
    };
    const open = async entry => {
      await popup.reload();
      await popup.locator('#style-status').filter({ hasText:'Ready' }).waitFor({ state:'attached' });
      if (entry) await popup.locator('#open-' + entry).click();
      await popup.waitForTimeout(400);
    };
    await open(); await shot('home-menu');
    await open('style'); await shot('component-style');
    await open('layout'); await shot('canvas-layout');
    await open('panels'); await shot('builder-panels');
    await open('environment'); await shot('environments');
    await open('launcher'); await shot('floating-launcher');
    await open('transfer'); await shot('import-export');
    await open('quick');
    await shot('debug-inspect');
    await popup.getByRole('tab', { name:'Data', exact:true }).click();
    await popup.getByLabel('Property name (exact key)').fill('premium');
    await popup.getByRole('radio', { name:'Number', exact:true }).check();
    await popup.getByLabel('Value', { exact:true }).fill('42');
    await shot('debug-data');
    await popup.getByRole('tab', { name:'Execute', exact:true }).click();
    await popup.getByLabel('Component key').fill('calculatePremium');
    await shot('debug-execute');
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
