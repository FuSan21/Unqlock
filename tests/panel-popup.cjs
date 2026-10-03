const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium,firefox} = require('playwright');
const source = file => fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
(async () => {
  for (const engine of [chromium,firefox]) {
    const browser = await engine.launch({headless:true});
    try {
      const page = await browser.newPage();
      await page.setContent('<button id="open-panels">Builder panels</button><form id="panels-form"><fieldset id="panels-fields" disabled></fieldset><button type="button" id="panels-reset">Reset all</button></form><p id="panels-status"></p>');
      await page.addStyleTag({content:source('popup.css')});
      await page.evaluate(() => {
        window.saved = {};
        window.panelWidths = {};
        window.extensionAPI = {storage:{local:{get:async () => structuredClone(window.saved),set:async patch => {
          await new Promise(resolve => setTimeout(resolve,150));
          Object.assign(window.saved,structuredClone(patch));
        }}},tabs:{sendMessage:async () => ({widths:window.panelWidths})}};
        // Stands in for the popup router: the entry button opens the page.
        window.UnqlockPages = {onOpen:(id,hook) => document.getElementById('open-panels').addEventListener('click',hook)};
        window.getTargetTab = async () => ({id:1,url:'https://fixture.unqork.io/ide/builder/workspaces/test/modules/first'});
      });
      for (const file of ['panel-settings.js','disabled-controls.js','panels-popup.js']) await page.addScriptTag({content:source(file)});
      await page.locator('#open-panels').click();
      const visibility = page.getByLabel('Build Agent visibility: Start collapsed',{exact:true});
      await visibility.focus();
      await visibility.check();
      assert(await visibility.evaluate(e => document.activeElement === e),'Save preserves focus');
      assert.equal(await visibility.evaluate(e => getComputedStyle(e).cursor),'wait');
      await page.keyboard.press('ArrowRight');
      assert(await page.getByLabel('Build Agent visibility: Always collapsed',{exact:true}).isChecked(),'Arrow keys move between switches');
      await page.waitForFunction(() => window.saved.builderPanels?.agent.visibility === 'always');
      assert(await page.getByLabel('Build Agent width: Custom',{exact:true}).isDisabled(),'Always collapsed locks the width switches');
      await page.locator('#panels-reset').click();
      await page.waitForFunction(() => document.querySelector('#panels-form').getAttribute('aria-busy') === 'false');
      assert.equal(await page.evaluate(() => saved.builderPanels.agent.visibility),'native','Reset queues behind pending saves');
      assert(await page.getByLabel('Use current Build Agent width',{exact:true}).isDisabled());
      await page.evaluate(() => { window.panelWidths.agent = 420; });
      await page.waitForFunction(() => !document.querySelector('[aria-label="Use current Build Agent width"]').disabled);
      await page.getByLabel('Use current Build Agent width',{exact:true}).click();
      await page.waitForFunction(() => saved.builderPanels.agent.width === 420);
      assert.equal(await page.evaluate(() => saved.builderPanels.agent.sizing),'custom');
      console.log('PASS: queued saves/reset, retained focus, saving cursor and refreshed widths (' + engine.name() + ').');
    } finally {await browser.close();}
  }
})().catch(error => {console.error(error);process.exitCode=1;});
